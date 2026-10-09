import type { Rational } from "../../domain/timing/rational";
import type { AudioClock, AudioNoteEvent } from "../../audio/contracts";

export interface KeyboardScheduledNote {
  readonly pitch: number;
  readonly part: AudioNoteEvent["channelRole"];
  readonly start: number;
  readonly end: number;
  readonly voiceId?: string;
}

export type TransportStatus = "stopped" | "playing" | "paused";
export type TransportPlayMode = "from-start" | "from-here";

export interface PlaybackClockSnapshot {
  readonly sessionId: string;
  readonly state: "playing" | "paused";
  readonly audioClockAnchorSeconds: number;
  readonly performanceClockAnchorMs: number;
  readonly musicalPositionAnchorBeats: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly tempoBpm: number;
  readonly schedulerStartOffsetSeconds: number;
  readonly loopStartBeats?: Rational;
  readonly loopEndBeats?: Rational;
}

export interface TransportState {
  readonly status: TransportStatus;
  readonly sessionId: string | null;
  readonly startingStepIndex: number;
  readonly currentStepIndex: number | null;
  readonly activeMelodyEventKey: string | null;
  readonly activeEventStartedAt: number | null;
  readonly currentStepStartedAt: number | null;
  readonly pausedPositionSeconds: number | null;
  readonly playbackClockSnapshot: PlaybackClockSnapshot | null;
  readonly loopAwareResetTarget: number;
  readonly playMode: TransportPlayMode;
  readonly error: string | null;
}

export interface PlayOptions {
  readonly stepCount: number;
  readonly loopStartStepIndex?: number;
}

export interface PlayFromHereOptions {
  readonly stepTarget: string | number;
  readonly stepCount: number;
  readonly stepIds?: readonly string[];
}

let sessionCounter = 0;
export function generateTransportSessionId(): string {
  sessionCounter += 1;
  return `transport-session-${sessionCounter}`;
}

export class TransportStore {
  private keyboardNotes: KeyboardScheduledNote[] = [];
  private keyboardClock: AudioClock | null = null;
  private keyboardSession: string | null = null;

  recordKeyboardNote(
    sessionId: string,
    event: AudioNoteEvent,
    start: number,
    clock: AudioClock,
  ): void {
    if (this.#state.sessionId !== sessionId || event.channelRole === "metronome") return;
    if (this.keyboardSession !== sessionId) this.keyboardNotes = [];
    this.keyboardSession = sessionId;
    this.keyboardClock = clock;
    this.keyboardNotes = this.keyboardNotes.filter((note) => note.end > clock.now());
    this.keyboardNotes.push({
      pitch: event.pitch,
      part: event.channelRole,
      start,
      end: start + event.durationSeconds,
      voiceId: `${sessionId}:${start}:${event.eventKey ?? event.eventIndex ?? event.pitch}`,
    });
  }

  getKeyboardNotes(): readonly KeyboardScheduledNote[] {
    return this.#state.status === "playing" && this.keyboardSession === this.#state.sessionId
      ? this.keyboardNotes
      : [];
  }

  getKeyboardAudioTime(): number {
    return this.keyboardClock?.now() ?? 0;
  }
  #state: TransportState;
  #listeners = new Set<() => void>();

  constructor(initialState?: Partial<TransportState>) {
    this.#state = Object.freeze({
      status: "stopped",
      sessionId: null,
      startingStepIndex: 0,
      currentStepIndex: null,
      activeMelodyEventKey: null,
      activeEventStartedAt: null,
      currentStepStartedAt: null,
      pausedPositionSeconds: null,
      playbackClockSnapshot: null,
      loopAwareResetTarget: 0,
      playMode: "from-start",
      error: null,
      ...initialState,
    });
  }

  getState(): TransportState {
    return this.#state;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /**
   * Starts normal playback from beginning or active loop start.
   * Rejects empty progression with observable error condition and never starts empty session.
   */
  play(options: PlayOptions): boolean {
    if (options.stepCount <= 0) {
      this.#state = Object.freeze({
        ...this.#state,
        error: "Cannot play empty progression",
      });
      this.emit();
      return false;
    }

    const startingIndex = options.loopStartStepIndex ?? 0;
    const sessionId = generateTransportSessionId();

    this.#state = Object.freeze({
      status: "playing",
      sessionId,
      startingStepIndex: startingIndex,
      currentStepIndex: startingIndex,
      activeMelodyEventKey: null,
      activeEventStartedAt: performance.now(),
      currentStepStartedAt: performance.now(),
      pausedPositionSeconds: null,
      playbackClockSnapshot: null,
      loopAwareResetTarget: startingIndex,
      playMode: "from-start",
      error: null,
    });
    this.emit();
    return true;
  }

  /**
   * Starts playback from an exact step boundary.
   * Rejects nonexistent step targets.
   */
  playFromHere(options: PlayFromHereOptions): boolean {
    const { stepTarget, stepCount, stepIds } = options;

    if (stepCount <= 0) {
      this.#state = Object.freeze({
        ...this.#state,
        error: "Cannot play empty progression",
      });
      this.emit();
      return false;
    }

    let targetIndex = -1;
    if (typeof stepTarget === "number") {
      if (Number.isInteger(stepTarget) && stepTarget >= 0 && stepTarget < stepCount) {
        targetIndex = stepTarget;
      }
    } else if (stepIds) {
      targetIndex = stepIds.indexOf(stepTarget);
    }

    if (targetIndex === -1) {
      this.#state = Object.freeze({
        ...this.#state,
        error: `Invalid step target: ${String(stepTarget)}`,
      });
      this.emit();
      return false;
    }

    const sessionId = generateTransportSessionId();

    this.#state = Object.freeze({
      status: "playing",
      sessionId,
      startingStepIndex: targetIndex,
      currentStepIndex: targetIndex,
      activeMelodyEventKey: null,
      activeEventStartedAt: performance.now(),
      currentStepStartedAt: performance.now(),
      pausedPositionSeconds: null,
      playbackClockSnapshot: null,
      loopAwareResetTarget: targetIndex,
      playMode: "from-here",
      error: null,
    });
    this.emit();
    return true;
  }

  /**
   * Transitions to paused state, retaining session information and paused position.
   */
  pause(
    pausedPositionSeconds?: number,
    playbackClockSnapshot?: PlaybackClockSnapshot | null,
  ): void {
    if (this.#state.status !== "playing") {
      return;
    }

    this.keyboardNotes = [];

    this.#state = Object.freeze({
      ...this.#state,
      status: "paused",
      activeMelodyEventKey: null,
      activeEventStartedAt: null,
      currentStepStartedAt: null,
      pausedPositionSeconds:
        pausedPositionSeconds !== undefined
          ? pausedPositionSeconds
          : this.#state.pausedPositionSeconds,
      ...(playbackClockSnapshot !== undefined ? { playbackClockSnapshot } : {}),
    });
    this.emit();
  }

  /**
   * Resumes playback from paused position without resetting to start.
   */
  resume(playbackClockSnapshot?: PlaybackClockSnapshot | null): boolean {
    if (this.#state.status !== "paused") {
      return false;
    }

    this.#state = Object.freeze({
      ...this.#state,
      status: "playing",
      activeMelodyEventKey: null,
      activeEventStartedAt: performance.now(),
      currentStepStartedAt: performance.now(),
      error: null,
      ...(playbackClockSnapshot !== undefined ? { playbackClockSnapshot } : {}),
    });
    this.emit();
    return true;
  }

  /**
   * Stops playback, clears active playing step, and resets play position.
   * Repeated stop is idempotent.
   */
  stop(): void {
    if (
      this.#state.status === "stopped" &&
      this.#state.currentStepIndex === null &&
      this.#state.activeMelodyEventKey === null
    ) {
      return;
    }

    this.#state = Object.freeze({
      status: "stopped",
      sessionId: null,
      startingStepIndex: this.#state.loopAwareResetTarget,
      currentStepIndex: null,
      activeMelodyEventKey: null,
      activeEventStartedAt: null,
      currentStepStartedAt: null,
      pausedPositionSeconds: null,
      playbackClockSnapshot: null,
      loopAwareResetTarget: this.#state.loopAwareResetTarget,
      playMode: "from-start",
      error: this.#state.error,
    });
    this.emit();
  }

  /**
   * Updates the visually active playing step during playback.
   * Stale session callbacks are ignored.
   */
  setCurrentStepIndex(index: number | null, sessionId?: string, startedAt?: number | null): void {
    if (sessionId && sessionId !== this.#state.sessionId) {
      return;
    }
    if (this.#state.status === "stopped") {
      return;
    }
    if (this.#state.currentStepIndex === index) {
      return;
    }

    this.#state = Object.freeze({
      ...this.#state,
      currentStepIndex: index,
      activeEventStartedAt: index !== null ? (startedAt ?? performance.now()) : null,
      currentStepStartedAt: index !== null ? (startedAt ?? performance.now()) : null,
    });
    this.emit();
  }

  setPausedPosition(seconds: number | null): void {
    this.#state = Object.freeze({
      ...this.#state,
      pausedPositionSeconds: seconds,
    });
    this.emit();
  }

  setPlaybackClockSnapshot(snapshot: PlaybackClockSnapshot | null): void {
    if (snapshot && snapshot.sessionId !== this.#state.sessionId) return;
    this.#state = Object.freeze({ ...this.#state, playbackClockSnapshot: snapshot });
    this.emit();
  }

  setActiveMelodyEventKey(key: string | null, sessionId?: string, startedAt?: number | null): void {
    if (sessionId && sessionId !== this.#state.sessionId) return;
    if (this.#state.status !== "playing" && key !== null) return;
    if (this.#state.activeMelodyEventKey === key) return;
    this.#state = Object.freeze({
      ...this.#state,
      activeMelodyEventKey: key,
      ...(key !== null ? { activeEventStartedAt: startedAt ?? performance.now() } : {}),
    });
    this.emit();
  }

  setLoopAwareResetTarget(target: number): void {
    this.#state = Object.freeze({
      ...this.#state,
      loopAwareResetTarget: target,
      startingStepIndex: this.#state.status === "stopped" ? target : this.#state.startingStepIndex,
    });
    this.emit();
  }

  setError(error: string | null): void {
    this.#state = Object.freeze({
      ...this.#state,
      error,
    });
    this.emit();
  }

  /**
   * Called when playback finishes naturally.
   * Stale session callbacks from cancelled/replaced sessions are ignored.
   */
  onSessionEnded(sessionId: string): void {
    if (sessionId !== this.#state.sessionId) {
      return;
    }

    this.#state = Object.freeze({
      status: "stopped",
      sessionId: null,
      startingStepIndex: this.#state.loopAwareResetTarget,
      currentStepIndex: null,
      activeMelodyEventKey: null,
      activeEventStartedAt: null,
      currentStepStartedAt: null,
      pausedPositionSeconds: null,
      playbackClockSnapshot: null,
      loopAwareResetTarget: this.#state.loopAwareResetTarget,
      playMode: "from-start",
      error: null,
    });
    this.emit();
  }
}
