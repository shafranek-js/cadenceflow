import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "./contracts";

export interface LookAheadSchedulerOptions {
  readonly clock: AudioClock;
  readonly provider: InstrumentAudioProvider;
  readonly lookAheadHorizonSeconds?: number;
  readonly tickIntervalMs?: number;
  readonly onEventScheduled?: (event: AudioNoteEvent, targetAudioTime: number) => void;
  readonly onPlaybackEnded?: () => void;
  readonly onError?: (error: unknown) => void;
}

export type SchedulerState = "idle" | "running" | "paused" | "disposed";

interface ScheduledEventEntry {
  readonly event: AudioNoteEvent;
  readonly targetAudioTime: number;
}

export class LookAheadScheduler {
  private readonly clock: AudioClock;
  private readonly provider: InstrumentAudioProvider;
  private readonly lookAheadHorizon: number;
  private readonly tickIntervalMs: number;
  private readonly onEventScheduled?: (event: AudioNoteEvent, targetAudioTime: number) => void;
  private readonly onPlaybackEnded?: () => void;
  private readonly onError?: (error: unknown) => void;

  private state: SchedulerState = "idle";
  private timerId: ReturnType<typeof setInterval> | null = null;

  private eventsQueue: readonly AudioNoteEvent[] = [];
  private scheduledIndices = new Set<number>();
  private startAudioTime = 0;
  private pausedPositionSeconds = 0;
  private maxDurationSeconds = 0;

  private activePlaybacks: ScheduledPlayback[] = [];
  private scheduledEntries: ScheduledEventEntry[] = [];

  constructor(options: LookAheadSchedulerOptions) {
    this.clock = options.clock;
    this.provider = options.provider;
    this.lookAheadHorizon = options.lookAheadHorizonSeconds ?? 0.1;
    this.tickIntervalMs = options.tickIntervalMs ?? 25;
    this.onEventScheduled = options.onEventScheduled;
    this.onPlaybackEnded = options.onPlaybackEnded;
    this.onError = options.onError;
  }

  get currentState(): SchedulerState {
    return this.state;
  }

  get isRunning(): boolean {
    return this.state === "running";
  }

  get scheduledCount(): number {
    return this.scheduledEntries.length;
  }

  /**
   * Start scheduling the given canonical AudioNoteEvents from the beginning.
   *
   * @param events Canonical events to schedule.
   * @param startAudioTime The audio clock time corresponding to t=0. Defaults to clock.now().
   * @param startOffsetSeconds Starting musical time offset.
   */
  start(events: readonly AudioNoteEvent[], startAudioTime?: number, startOffsetSeconds = 0): void {
    if (this.state === "disposed") {
      throw new Error("Cannot start a disposed LookAheadScheduler");
    }

    if (this.state === "running") {
      this.stop();
    } else {
      this.clearTickTimer();
      this.cancelActivePlaybacks();
      this.eventsQueue = [];
      this.scheduledIndices.clear();
      this.pausedPositionSeconds = 0;
      this.scheduledEntries = [];
    }

    // Sort events by startSeconds deterministically
    this.eventsQueue = [...events].sort((a, b) => a.startSeconds - b.startSeconds);
    this.maxDurationSeconds = this.eventsQueue.reduce((max, evt) => {
      const end = evt.startSeconds + evt.durationSeconds;
      return end > max ? end : max;
    }, 0);

    const now = this.clock.now();
    this.startAudioTime = startAudioTime !== undefined ? startAudioTime : now - startOffsetSeconds;
    this.pausedPositionSeconds = startOffsetSeconds;

    // Mark any events that ended before startOffsetSeconds as already handled
    for (let i = 0; i < this.eventsQueue.length; i++) {
      const evt = this.eventsQueue[i]!;
      if (evt.startSeconds + evt.durationSeconds <= startOffsetSeconds) {
        this.scheduledIndices.add(i);
      }
    }

    this.state = "running";

    // Immediate tick for events in the first window
    this.tick();

    // Set up recurring interval tick
    if (this.state === "running") {
      this.timerId = setInterval(() => {
        this.tick();
      }, this.tickIntervalMs);
    }
  }

  /**
   * Pause scheduling and return the current musical elapsed position in seconds.
   */
  pause(): number {
    if (this.state !== "running") {
      return this.pausedPositionSeconds;
    }

    this.clearTickTimer();
    const now = this.clock.now();
    this.pausedPositionSeconds = Math.max(0, now - this.startAudioTime);
    this.state = "paused";

    // Stop active audio for immediate pause responsiveness
    this.provider.stop();
    this.cancelActivePlaybacks();

    return this.pausedPositionSeconds;
  }

  /**
   * Resume scheduling from paused or specified musical position.
   */
  resume(fromSeconds?: number): void {
    if (this.state === "disposed") {
      throw new Error("Cannot resume a disposed LookAheadScheduler");
    }
    const offset = fromSeconds !== undefined ? fromSeconds : this.pausedPositionSeconds;
    const now = this.clock.now();
    this.startAudioTime = now - offset;
    this.pausedPositionSeconds = offset;
    this.state = "running";

    this.tick();

    if (this.state === "running") {
      this.timerId = setInterval(() => {
        this.tick();
      }, this.tickIntervalMs);
    }
  }

  /**
   * Stop scheduling immediately and cancel any pending playback. Safe to call repeatedly.
   */
  stop(scope?: PlaybackScope): void {
    this.clearTickTimer();
    this.cancelActivePlaybacks();
    this.provider.stop(scope);

    this.eventsQueue = [];
    this.scheduledIndices.clear();
    this.pausedPositionSeconds = 0;
    this.scheduledEntries = [];

    if (this.state !== "disposed") {
      this.state = "idle";
    }
  }

  /**
   * Dispose the scheduler completely. Safe to call repeatedly.
   */
  dispose(): void {
    this.stop();
    this.state = "disposed";
  }

  /**
   * Perform a single look-ahead scheduling tick.
   * Can also be called directly in deterministic mock tests.
   */
  tick(): void {
    if (this.state !== "running") {
      return;
    }

    const currentAudioTime = this.clock.now();
    const horizon = currentAudioTime + this.lookAheadHorizon;

    const chunkToSchedule: AudioNoteEvent[] = [];

    for (let i = 0; i < this.eventsQueue.length; i++) {
      if (this.scheduledIndices.has(i)) {
        continue;
      }

      const event = this.eventsQueue[i]!;
      const targetAudioTime = this.startAudioTime + event.startSeconds;

      if (targetAudioTime <= horizon) {
        // Event is within the look-ahead window
        const relativeStart = Math.max(0, targetAudioTime - currentAudioTime);
        const scheduledEvent: AudioNoteEvent = {
          pitch: event.pitch,
          startSeconds: relativeStart,
          durationSeconds: event.durationSeconds,
          velocity: event.velocity,
          channelRole: event.channelRole,
        };

        chunkToSchedule.push(scheduledEvent);
        const entry: ScheduledEventEntry = {
          event,
          targetAudioTime,
        };
        this.scheduledEntries.push(entry);
        this.scheduledIndices.add(i);
        this.onEventScheduled?.(event, targetAudioTime);
      } else {
        // Since eventsQueue is sorted by startSeconds, subsequent events will also be past horizon
        break;
      }
    }

    if (chunkToSchedule.length > 0) {
      try {
        const chunkClock: AudioClock = {
          now: () => currentAudioTime,
        };
        const playback = this.provider.schedule(chunkToSchedule, chunkClock);
        this.activePlaybacks.push(playback);
      } catch (err) {
        this.clearTickTimer();
        this.state = "idle";
        this.onError?.(err);
        return;
      }
    }

    // Check if all events have been scheduled and elapsed past their duration
    if (this.scheduledIndices.size >= this.eventsQueue.length) {
      const totalAudioEndTime = this.startAudioTime + this.maxDurationSeconds;
      if (currentAudioTime >= totalAudioEndTime) {
        this.clearTickTimer();
        this.state = "idle";
        this.onPlaybackEnded?.();
      }
    }
  }

  private clearTickTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private cancelActivePlaybacks(): void {
    for (const playback of this.activePlaybacks) {
      try {
        playback.cancel();
      } catch {
        // Safe cancellation
      }
    }
    this.activePlaybacks = [];
  }
}
