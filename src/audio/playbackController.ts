import type { AudioClock, AudioNoteEvent, InstrumentAudioProvider } from "./contracts";
import { LookAheadScheduler } from "./scheduler";
import { realizeProgressionAudioEvents } from "./eventRealizer";
import { generateCountInEvents, generateMetronomeBarEvents } from "./metronome";
import { projectSwingTiming, type TimedEvent } from "../domain/timing/swing";
import { createProgressionTimeline, type ProgressionTimeline } from "../domain/timing/timeline";
import type { Meter } from "../domain/timing/meter";
import type { GrooveSettings } from "../domain/timing/swing";
import type { PitchClassIdentity } from "../domain/harmony/pitch";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { ProgressionStep } from "../domain/progression/step";
import type { TransportStore } from "../ui/transport/transportStore";
import type { LoopState } from "../ui/transport/loopState";
import { resolveLoopRegion } from "../ui/transport/loopState";

export interface PlaybackControllerOptions {
  readonly clock: AudioClock;
  readonly pianoProvider: InstrumentAudioProvider;
  readonly metronomeProvider?: InstrumentAudioProvider | undefined;
  readonly transportStore: TransportStore;
  readonly lookAheadHorizonSeconds?: number | undefined;
  readonly tickIntervalMs?: number | undefined;
}

export interface PlaybackSessionParams {
  readonly steps: readonly ProgressionStep[];
  readonly meter: Meter;
  readonly tempoBpm: number;
  readonly groove: GrooveSettings;
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly loopState?: LoopState | undefined;
  readonly metronomeEnabled?: boolean | undefined;
  readonly countInEnabled?: boolean | undefined;
  readonly startingStepIndex?: number | undefined;
}

interface StepTimeBoundary {
  readonly stepIndex: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export class PlaybackController {
  private readonly clock: AudioClock;
  private readonly pianoProvider: InstrumentAudioProvider;
  private readonly metronomeProvider?: InstrumentAudioProvider | undefined;
  private readonly transportStore: TransportStore;

  private scheduler: LookAheadScheduler | null = null;
  private activeSessionId: string | null = null;
  private currentParams: PlaybackSessionParams | null = null;
  private stepBoundaries: readonly StepTimeBoundary[] = [];
  private stepTrackingTimer: ReturnType<typeof setInterval> | null = null;

  private loopIteration = 0;
  private loopBaseAudioTime = 0;
  private loopDurationSeconds = 0;
  private loopDurationBeatsNumerator = 0;
  private loopDurationBeatsDenominator = 1;

  private readonly lookAheadHorizonSeconds?: number | undefined;
  private readonly tickIntervalMs?: number | undefined;

  constructor(options: PlaybackControllerOptions) {
    this.clock = options.clock;
    this.pianoProvider = options.pianoProvider;
    this.metronomeProvider = options.metronomeProvider;
    this.transportStore = options.transportStore;
    this.lookAheadHorizonSeconds = options.lookAheadHorizonSeconds;
    this.tickIntervalMs = options.tickIntervalMs;
  }

  get currentSessionId(): string | null {
    return this.activeSessionId;
  }

  get isPlaying(): boolean {
    return this.transportStore.getState().status === "playing";
  }

  get isPaused(): boolean {
    return this.transportStore.getState().status === "paused";
  }

  /**
   * Starts playback of the given progression from beginning or loop start.
   */
  start(params: PlaybackSessionParams): boolean {
    if (params.steps.length === 0) {
      this.transportStore.play({ stepCount: 0 });
      return false;
    }

    this.stopCurrentSession();

    let startingStepIndex = 0;
    const resolvedLoop = params.loopState ? resolveLoopRegion(params.loopState, params.steps) : null;
    if (resolvedLoop) {
      startingStepIndex = resolvedLoop.startStepIndex;
    }

    const started = this.transportStore.play({
      stepCount: params.steps.length,
      loopStartStepIndex: startingStepIndex,
    });
    if (!started) return false;

    this.activeSessionId = this.transportStore.getState().sessionId;
    this.currentParams = params;
    this.loopIteration = 0;

    return this.launchSessionPlayback(startingStepIndex, false);
  }

  /**
   * Starts playback from an exact step boundary.
   */
  playFromHere(stepTarget: string | number, params: PlaybackSessionParams): boolean {
    if (params.steps.length === 0) {
      this.transportStore.playFromHere({ stepTarget, stepCount: 0 });
      return false;
    }

    this.stopCurrentSession();

    const started = this.transportStore.playFromHere({
      stepTarget,
      stepCount: params.steps.length,
      stepIds: params.steps.map((s) => s.id),
    });
    if (!started) return false;

    this.activeSessionId = this.transportStore.getState().sessionId;
    this.currentParams = params;
    this.loopIteration = 0;

    const startingStepIndex = this.transportStore.getState().startingStepIndex;
    return this.launchSessionPlayback(startingStepIndex, false);
  }

  /**
   * Pauses playback, stops active sounding notes, and stores paused musical position.
   */
  pause(): void {
    if (!this.scheduler || this.transportStore.getState().status !== "playing") {
      return;
    }

    const pausedSeconds = this.scheduler.pause();
    this.transportStore.pause(pausedSeconds);
    this.clearStepTracking();
  }

  /**
   * Resumes playback from paused position without resetting to start.
   */
  resume(): boolean {
    if (!this.scheduler || this.transportStore.getState().status !== "paused") {
      return false;
    }

    this.transportStore.resume();
    this.scheduler.resume();
    this.startStepTracking();
    return true;
  }

  /**
   * Stops playback immediately, resets play position, and clears active step.
   * Idempotent.
   */
  stop(): void {
    this.stopCurrentSession();
    this.transportStore.stop();
  }

  private stopCurrentSession(): void {
    this.clearStepTracking();
    if (this.scheduler) {
      this.scheduler.stop();
      this.scheduler.dispose();
      this.scheduler = null;
    }
    this.activeSessionId = null;
    this.currentParams = null;
  }

  private launchSessionPlayback(startingStepIndex: number, isLoopIteration: boolean): boolean {
    const params = this.currentParams;
    const sessionId = this.activeSessionId;
    if (!params || !sessionId) return false;

    const { steps, meter, tempoBpm, groove, tonic, context, loopState, metronomeEnabled, countInEnabled } = params;

    const resolvedLoop = loopState ? resolveLoopRegion(loopState, steps) : null;

    // Determine range of steps to play
    let sliceStart = startingStepIndex;
    let sliceEnd = steps.length;

    if (resolvedLoop) {
      sliceStart = resolvedLoop.startStepIndex;
      sliceEnd = resolvedLoop.endStepIndex + 1;
      this.loopDurationBeatsNumerator = resolvedLoop.durationBeats.numerator;
      this.loopDurationBeatsDenominator = resolvedLoop.durationBeats.denominator;
      this.loopDurationSeconds = (this.loopDurationBeatsNumerator / this.loopDurationBeatsDenominator) * (60 / tempoBpm);
    }

    const activeSteps = steps.slice(sliceStart, sliceEnd);
    if (activeSteps.length === 0) {
      this.transportStore.onSessionEnded(sessionId);
      return false;
    }

    const secondsPerBeat = 60 / tempoBpm;

    // 1. Calculate Count-in (only for session start, never for resume or loop repetitions)
    const isFirstRun = !isLoopIteration && this.loopIteration === 0;
    const applyCountIn = isFirstRun && Boolean(countInEnabled);
    let countInDurationSeconds = 0;
    const countInEvents: AudioNoteEvent[] = [];

    if (applyCountIn) {
      const countIn = generateCountInEvents(meter, tempoBpm, 0);
      countInDurationSeconds = countIn.durationSeconds;
      countInEvents.push(...countIn.events);
    }

    // 2. Realize progression steps into events and step boundaries
    const audioEvents: AudioNoteEvent[] = [];
    const boundaries: StepTimeBoundary[] = [];

    let currentBeatsAccumulator = 0;
    let currentSecondsAccumulator = countInDurationSeconds;

    for (let i = 0; i < activeSteps.length; i++) {
      const step = activeSteps[i]!;
      const actualStepIndex = sliceStart + i;
      const stepDurationBeatsNum = step.duration.beats.numerator;
      const stepDurationBeatsDen = step.duration.beats.denominator;
      const stepDurationSeconds = (stepDurationBeatsNum / stepDurationBeatsDen) * secondsPerBeat;

      const stepStartSeconds = currentSecondsAccumulator;
      const stepEndSeconds = stepStartSeconds + stepDurationSeconds;

      boundaries.push({
        stepIndex: actualStepIndex,
        startSeconds: stepStartSeconds,
        endSeconds: stepEndSeconds,
      });

      if (step.kind === "chord") {
        // Realize chord performance audio events
        const realized = realizeProgressionAudioEvents({
          steps: [step],
          tonic,
          context,
          tempoBpm,
          initialStartSeconds: stepStartSeconds,
        });

        // If groove is swing, apply swing projection on 8th-note subdivisions
        if (groove.feel === "swing" && groove.swingAmount > 0) {
          // Convert events to timed beat events for swing projection
          const timedEvents: Array<AudioNoteEvent & TimedEvent> = realized.map((evt) => {
            const relSeconds = evt.startSeconds - countInDurationSeconds;
            const relBeats = relSeconds / secondsPerBeat;
            const durBeats = evt.durationSeconds / secondsPerBeat;
            return {
              ...evt,
              startBeats: { numerator: Math.round(relBeats * 1000), denominator: 1000 },
              durationBeats: { numerator: Math.round(durBeats * 1000), denominator: 1000 },
            };
          });

          const swung = projectSwingTiming(timedEvents, groove);
          for (const s of swung) {
            const swungStartSec = countInDurationSeconds + (s.startBeats.numerator / s.startBeats.denominator) * secondsPerBeat;
            const swungDurSec = (s.durationBeats.numerator / s.durationBeats.denominator) * secondsPerBeat;
            audioEvents.push({
              pitch: s.pitch,
              startSeconds: swungStartSec,
              durationSeconds: swungDurSec,
              velocity: s.velocity,
              channelRole: s.channelRole,
            });
          }
        } else {
          audioEvents.push(...realized);
        }
      }
      // If step.kind === "rest", silence is emitted (no pitched events added)

      currentBeatsAccumulator += stepDurationBeatsNum / stepDurationBeatsDen;
      currentSecondsAccumulator = stepEndSeconds;
    }

    // 3. Add metronome clicks during playback if enabled
    if (metronomeEnabled) {
      const totalPlaybackSeconds = currentSecondsAccumulator - countInDurationSeconds;
      const barDurationSec = (meter.numerator * 4 / meter.denominator) * secondsPerBeat;
      const totalBars = Math.ceil(totalPlaybackSeconds / barDurationSec);

      for (let b = 0; b < totalBars; b++) {
        const barStartSec = countInDurationSeconds + b * barDurationSec;
        const barEvents = generateMetronomeBarEvents(meter, tempoBpm, barStartSec);
        audioEvents.push(...barEvents);
      }
    }

    // Combine count-in and progression events
    const allSessionEvents = [...countInEvents, ...audioEvents].sort(
      (a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch,
    );

    this.stepBoundaries = boundaries;

    // Create composite provider if metronome clicks should route to metronomeProvider
    const activeProvider = this.createCompositeProvider();

    // Create and start scheduler
    try {
      this.scheduler = new LookAheadScheduler({
        clock: this.clock,
        provider: activeProvider,
        lookAheadHorizonSeconds: this.lookAheadHorizonSeconds,
        tickIntervalMs: this.tickIntervalMs,
        onPlaybackEnded: () => {
          if (this.activeSessionId !== sessionId) return;

          if (resolvedLoop && this.isPlaying) {
            // Loop: seamlessly advance to next iteration without cumulative drift
            this.loopIteration += 1;
            this.launchSessionPlayback(resolvedLoop.startStepIndex, true);
          } else {
            this.clearStepTracking();
            this.transportStore.onSessionEnded(sessionId);
          }
        },
        onError: (err) => {
          if (this.activeSessionId !== sessionId) return;
          this.clearStepTracking();
          this.transportStore.setError(String(err));
          this.transportStore.stop();
        },
      });

      this.scheduler.start(allSessionEvents);
      this.startStepTracking();
      return true;
    } catch (err) {
      this.transportStore.setError(String(err));
      this.transportStore.stop();
      return false;
    }
  }

  private createCompositeProvider(): InstrumentAudioProvider {
    const piano = this.pianoProvider;
    const metronome = this.metronomeProvider;

    if (!metronome) {
      return piano;
    }

    return {
      id: "composite-playback-provider",
      state: piano.state,
      prepare: async () => {
        await Promise.all([piano.prepare?.(), metronome.prepare?.()]);
      },
      schedule: (events, clock) => {
        const pianoEvents = events.filter((e) => e.channelRole !== "metronome");
        const metronomeEvents = events.filter((e) => e.channelRole === "metronome");

        const handles: Array<{ cancel: () => void }> = [];
        if (pianoEvents.length > 0) {
          handles.push(piano.schedule(pianoEvents, clock));
        }
        if (metronomeEvents.length > 0) {
          handles.push(metronome.schedule(metronomeEvents, clock));
        }

        return {
          id: `composite-batch-${Date.now()}`,
          cancel: () => {
            for (const h of handles) h.cancel();
          },
        };
      },
      stop: (scope) => {
        piano.stop(scope);
        metronome.stop(scope);
      },
      dispose: async () => {
        await Promise.all([piano.dispose?.(), metronome.dispose?.()]);
      },
    };
  }

  private startStepTracking(): void {
    this.clearStepTracking();
    const sessionId = this.activeSessionId;

    this.stepTrackingTimer = setInterval(() => {
      if (!this.scheduler || !sessionId || this.activeSessionId !== sessionId || !this.isPlaying) {
        return;
      }

      // Check current elapsed musical seconds using non-invasive getter
      const currentMusicalSeconds = this.scheduler.getElapsedSeconds();

      let matchingStepIndex: number | null = null;
      for (const boundary of this.stepBoundaries) {
        if (
          currentMusicalSeconds >= boundary.startSeconds &&
          currentMusicalSeconds < boundary.endSeconds
        ) {
          matchingStepIndex = boundary.stepIndex;
          break;
        }
      }

      if (matchingStepIndex !== null) {
        this.transportStore.setCurrentStepIndex(matchingStepIndex, sessionId);
      }
    }, 30);
  }

  private clearStepTracking(): void {
    if (this.stepTrackingTimer !== null) {
      clearInterval(this.stepTrackingTimer);
      this.stepTrackingTimer = null;
    }
  }
}
