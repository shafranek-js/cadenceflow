export type TransportStatus = "stopped" | "playing" | "paused";
export type TransportPlayMode = "from-start" | "from-here";

export interface TransportState {
  readonly status: TransportStatus;
  readonly sessionId: string | null;
  readonly startingStepIndex: number;
  readonly currentStepIndex: number | null;
  readonly pausedPositionSeconds: number | null;
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
  #state: TransportState;
  #listeners = new Set<() => void>();

  constructor(initialState?: Partial<TransportState>) {
    this.#state = Object.freeze({
      status: "stopped",
      sessionId: null,
      startingStepIndex: 0,
      currentStepIndex: null,
      pausedPositionSeconds: null,
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
      pausedPositionSeconds: null,
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
      pausedPositionSeconds: null,
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
  pause(pausedPositionSeconds?: number): void {
    if (this.#state.status !== "playing") {
      return;
    }

    this.#state = Object.freeze({
      ...this.#state,
      status: "paused",
      pausedPositionSeconds:
        pausedPositionSeconds !== undefined
          ? pausedPositionSeconds
          : this.#state.pausedPositionSeconds,
    });
    this.emit();
  }

  /**
   * Resumes playback from paused position without resetting to start.
   */
  resume(): boolean {
    if (this.#state.status !== "paused") {
      return false;
    }

    this.#state = Object.freeze({
      ...this.#state,
      status: "playing",
      error: null,
    });
    this.emit();
    return true;
  }

  /**
   * Stops playback, clears active playing step, and resets play position.
   * Repeated stop is idempotent.
   */
  stop(): void {
    if (this.#state.status === "stopped" && this.#state.currentStepIndex === null) {
      return;
    }

    this.#state = Object.freeze({
      status: "stopped",
      sessionId: null,
      startingStepIndex: this.#state.loopAwareResetTarget,
      currentStepIndex: null,
      pausedPositionSeconds: null,
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
  setCurrentStepIndex(index: number | null, sessionId?: string): void {
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

  setLoopAwareResetTarget(target: number): void {
    this.#state = Object.freeze({
      ...this.#state,
      loopAwareResetTarget: target,
      startingStepIndex:
        this.#state.status === "stopped" ? target : this.#state.startingStepIndex,
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
      pausedPositionSeconds: null,
      loopAwareResetTarget: this.#state.loopAwareResetTarget,
      playMode: "from-start",
      error: null,
    });
    this.emit();
  }
}
