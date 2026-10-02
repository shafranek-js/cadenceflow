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
export type PreviewAuditionScheduledCallback = (
  playback: ScheduledPlayback,
  clock: AudioClock,
) => void;

interface PreviewCapableProvider extends InstrumentAudioProvider {
  schedulePreview?(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback;
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
  private pendingAudition: {
    readonly events: readonly AudioNoteEvent[];
    readonly token: number;
    readonly requestedAt: number;
    readonly onScheduled?: PreviewAuditionScheduledCallback;
  } | null = null;
  private pendingToken = 0;

  constructor(options: PreviewAuditionControllerOptions) {
    this.provider = options.provider;
    this.clock = options.clock ?? {
      now: () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0),
    };
  }

  getProvider(): InstrumentAudioProvider {
    return this.provider;
  }

  get currentPlayback(): ScheduledPlayback | null {
    return this.activePlayback;
  }

  audition(
    events: readonly AudioNoteEvent[],
    onScheduled?: PreviewAuditionScheduledCallback,
  ): ScheduledPlayback | null {
    // 1. Cancel / stop prior Matrix preview playback scope immediately
    this.stop();

    if (!events || events.length === 0) {
      return null;
    }

    // 2. Check provider state: if provider is not yet ready, prepare and queue audition
    if (this.provider.state !== "ready" && this.provider.state !== "fallback") {
      if (this.provider.state === "idle" || this.provider.state === "loading") {
        const token = ++this.pendingToken;
        const requestedAt = Date.now();
        this.pendingAudition = {
          events,
          token,
          requestedAt,
          ...(onScheduled ? { onScheduled } : {}),
        };

        void this.provider
          .prepare()
          .then(() => {
            if (
              this.pendingAudition &&
              this.pendingAudition.token === token &&
              Date.now() - requestedAt < 3000
            ) {
              const pendingEvents = this.pendingAudition.events;
              const pendingCallback = this.pendingAudition.onScheduled;
              this.pendingAudition = null;
              this.playEvents(pendingEvents, pendingCallback);
            }
          })
          .catch(() => {
            if (this.pendingAudition?.token === token) {
              this.pendingAudition = null;
            }
          });
      }
      return null;
    }

    return this.playEvents(events, onScheduled);
  }

  private playEvents(
    events: readonly AudioNoteEvent[],
    onScheduled?: PreviewAuditionScheduledCallback,
  ): ScheduledPlayback | null {
    // Resume AudioContext if suspended (browser autoplay policy on user gesture)
    const providerWithCtx = this.provider as unknown as { audioCtx?: AudioContext | null };
    if (providerWithCtx.audioCtx && providerWithCtx.audioCtx.state === "suspended") {
      providerWithCtx.audioCtx.resume().catch(() => {});
    }

    try {
      const previewProvider = this.provider as PreviewCapableProvider;
      this.activePlayback = previewProvider.schedulePreview
        ? previewProvider.schedulePreview(events, this.clock)
        : this.provider.schedule(events, this.clock);
      const scheduled = this.activePlayback;
      if (onScheduled) {
        const notify = () => {
          if (this.activePlayback === scheduled) onScheduled(scheduled, this.clock);
        };
        if (scheduled.ready) {
          void scheduled.ready.then(notify).catch(() => {
            if (this.activePlayback === scheduled) this.activePlayback = null;
            scheduled.cancel();
          });
        } else {
          notify();
        }
      }
      return this.activePlayback;
    } catch {
      // Audio scheduling failure must not corrupt application state
      this.activePlayback = null;
      return null;
    }
  }

  stop(): void {
    this.pendingAudition = null;
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
