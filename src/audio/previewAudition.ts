import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  ScheduledPlayback,
} from "./contracts";

export interface PreviewAuditionControllerOptions {
  readonly provider: InstrumentAudioProvider;
  readonly clock?: AudioClock;
}

/**
 * Controller managing transient chord-preview audition playback scope.
 *
 * Invariants & Behavior:
 * - Operates an explicit preview playback scope independent of progression transport.
 * - Calling audition on chord B immediately cancels/stops any sounding or scheduled prior preview (chord A).
 * - Calling audition on the same chord repeatedly cancels the prior playback and replays from its attack.
 * - Provider errors or unprepared state fail gracefully without mutating or corrupting application state.
 * - Does not pause, stop, or mutate progression transport or undo history.
 */
export class PreviewAuditionController {
  private readonly provider: InstrumentAudioProvider;
  private readonly clock: AudioClock;
  private activePlayback: ScheduledPlayback | null = null;

  constructor(options: PreviewAuditionControllerOptions) {
    this.provider = options.provider;
    this.clock = options.clock ?? {
      now: () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0),
    };
  }

  get currentPlayback(): ScheduledPlayback | null {
    return this.activePlayback;
  }

  audition(events: readonly AudioNoteEvent[]): ScheduledPlayback | null {
    // 1. Cancel / stop prior Matrix preview playback scope immediately
    if (this.activePlayback) {
      try {
        this.activePlayback.cancel();
      } catch {
        // Ignore cancellation errors
      }
      this.activePlayback = null;
    }

    if (!events || events.length === 0) {
      return null;
    }

    // 2. Check provider state: if provider is not in playable state, do not schedule
    if (this.provider.state !== "ready" && this.provider.state !== "fallback") {
      return null;
    }

    // 3. Resume AudioContext if suspended (browser autoplay policy on user gesture)
    const providerWithCtx = this.provider as unknown as { audioCtx?: AudioContext | null };
    if (providerWithCtx.audioCtx && providerWithCtx.audioCtx.state === "suspended") {
      providerWithCtx.audioCtx.resume().catch(() => {});
    }

    try {
      this.activePlayback = this.provider.schedule(events, this.clock);
      return this.activePlayback;
    } catch {
      // Audio scheduling failure must not corrupt application state
      this.activePlayback = null;
      return null;
    }
  }

  stop(): void {
    if (this.activePlayback) {
      try {
        this.activePlayback.cancel();
      } catch {
        // Ignore cancellation errors
      }
      this.activePlayback = null;
    }
  }

  dispose(): void {
    this.stop();
  }
}
