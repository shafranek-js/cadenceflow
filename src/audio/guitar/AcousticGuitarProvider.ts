import SoundfontPlayer from "soundfont-player";

import type {
  AudioClock,
  AudioNoteEvent,
  AudioProviderState,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../contracts";

export interface GuitarSampleNode {
  stop(when?: number): void;
}

export interface GuitarSamplePlayer {
  play(
    midiNote: number,
    when?: number,
    options?: { readonly duration?: number; readonly gain?: number },
  ): GuitarSampleNode | undefined;
  stop(when?: number): unknown;
}

export type GuitarInstrumentLoader = (
  context: AudioContext,
  instrument: string,
  url: string,
  destination: AudioNode,
) => Promise<GuitarSamplePlayer>;

export interface AcousticGuitarProviderOptions {
  readonly audioContext?: AudioContext | undefined;
  readonly destination?: AudioNode | undefined;
  readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
  readonly assetUrl?: string | undefined;
  readonly loadInstrument?: GuitarInstrumentLoader | undefined;
  /** Strum delay in seconds between adjacent strings in a chord (default: 0.016s = 16ms) */
  readonly strumDelaySeconds?: number | undefined;
  readonly volume?: number | undefined;
}

interface ActiveGuitarPlayback {
  readonly id: string;
  readonly nodes: GuitarSampleNode[];
  cancelled: boolean;
}

const defaultGuitarLoader: GuitarInstrumentLoader = async (context, instrument, url, destination) =>
  SoundfontPlayer.instrument(context, instrument as any, {
    format: "mp3",
    destination,
    nameToUrl: () => url,
  });

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

export class AcousticGuitarProvider implements InstrumentAudioProvider {
  readonly id: string = "acoustic-guitar";
  private providerState: AudioProviderState = "idle";
  private audioContext: AudioContext | null = null;
  private readonly destinationNode?: AudioNode | undefined;
  private readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
  private readonly assetUrl: string;
  private readonly loadInstrument: GuitarInstrumentLoader;
  private readonly strumDelaySeconds: number;
  private volume: number;

  private player: GuitarSamplePlayer | null = null;
  private loadPromise: Promise<GuitarSamplePlayer> | null = null;
  private activePlaybacks = new Set<ActiveGuitarPlayback>();
  private playbackCounter = 0;

  constructor(options: AcousticGuitarProviderOptions = {}) {
    this.audioContext = options.audioContext ?? null;
    this.destinationNode = options.destination;
    this.onStateChange = options.onStateChange;
    this.loadInstrument = options.loadInstrument ?? defaultGuitarLoader;
    this.strumDelaySeconds = Math.max(0, options.strumDelaySeconds ?? 0.016);
    this.volume = clampMidi(options.volume ?? 100);

    const baseUrl =
      typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
        ? import.meta.env.BASE_URL
        : "/";
    this.assetUrl =
      options.assetUrl ?? `${baseUrl.replace(/\/$/, "")}/audio/guitar/acoustic_guitar_steel-mp3.js`;
  }

  get state(): AudioProviderState {
    return this.providerState;
  }

  setVolume(volume: number): void {
    this.volume = clampMidi(volume);
  }

  get clock(): AudioClock {
    return this.getClock();
  }

  getClock(): AudioClock {
    const context = this.ensureAudioContext();
    return {
      now: () => context.currentTime,
    };
  }

  async prepare(): Promise<void> {
    if (this.providerState === "ready" && this.player) return;
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }

    this.setProviderState("loading");
    let context: AudioContext;
    try {
      context = this.ensureAudioContext();
    } catch (err) {
      this.setProviderState("error");
      throw err;
    }

    const destination = this.destinationNode ?? context.destination;

    this.loadPromise = this.loadInstrument(
      context,
      "acoustic_guitar_steel",
      this.assetUrl,
      destination,
    )
      .then((player) => {
        this.player = player;
        this.setProviderState("ready");
        return player;
      })
      .catch((error) => {
        this.setProviderState("error");
        throw error;
      })
      .finally(() => {
        this.loadPromise = null;
      });

    await this.loadPromise;
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.scheduleWithPlayer(events, clock, "live");
  }

  schedulePreview(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.scheduleWithPlayer(events, clock, "preview");
  }

  stop(_scope?: PlaybackScope): void {
    for (const playback of [...this.activePlaybacks]) {
      this.cancelPlayback(playback);
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.player) {
      try {
        this.player.stop();
      } catch {
        // Ignored
      }
      this.player = null;
    }
    this.audioContext = null;
    this.activePlaybacks.clear();
    this.setProviderState("idle");
  }

  private scheduleWithPlayer(
    events: readonly AudioNoteEvent[],
    clock: AudioClock,
    scope: "live" | "preview",
  ): ScheduledPlayback {
    const player = this.player;
    if (!player) {
      if (this.providerState === "error") {
        throw new Error("Acoustic guitar samples failed to load");
      }
      // Still loading — kick off preparation if not already in progress and return a
      // silent no-op so that the scheduler / transport are not disrupted.
      if (this.providerState !== "loading" && !this.loadPromise) {
        void this.prepare();
      }
      return {
        id: `guitar-${scope}-noop-${++this.playbackCounter}`,
        cancel: () => {},
      };
    }

    const context = this.ensureAudioContext();
    const baseTime = Math.max(context.currentTime, clock.now());
    const trackGain = this.volume / 127;

    const playback: ActiveGuitarPlayback = {
      id: `guitar-${scope}-${++this.playbackCounter}`,
      nodes: [],
      cancelled: false,
    };
    this.activePlaybacks.add(playback);

    // Group events by approximate start time to detect chord strumming
    const timeGroups = new Map<number, AudioNoteEvent[]>();
    for (const ev of events) {
      const timeKey = Math.round(ev.startSeconds * 100);
      const existing = timeGroups.get(timeKey);
      if (existing) {
        existing.push(ev);
      } else {
        timeGroups.set(timeKey, [ev]);
      }
    }

    for (const group of timeGroups.values()) {
      // Sort pitches ascending for authentic downstrum (lowest string to highest string)
      const sorted = [...group].sort((a, b) => a.pitch - b.pitch);
      const isChord = sorted.length > 1;

      for (let i = 0; i < sorted.length; i++) {
        const ev = sorted[i]!;
        const strumOffset = isChord ? i * this.strumDelaySeconds : 0;
        const when = baseTime + ev.startSeconds + strumOffset;
        const gain = (clampMidi(ev.velocity) / 127) * trackGain;

        try {
          const node = player.play(ev.pitch, when, {
            duration: ev.durationSeconds,
            gain,
          });
          if (node) {
            playback.nodes.push(node);
          }
        } catch (err) {
          console.warn("Failed to play guitar sample for pitch", ev.pitch, err);
        }
      }
    }

    return {
      id: playback.id,
      cancel: () => this.cancelPlayback(playback),
    };
  }

  private cancelPlayback(playback: ActiveGuitarPlayback): void {
    if (playback.cancelled) return;
    playback.cancelled = true;
    const when = this.audioContext?.currentTime;
    for (const node of playback.nodes) {
      try {
        node.stop(when);
      } catch {
        // Node may have already ended
      }
    }
    playback.nodes.length = 0;
    this.activePlaybacks.delete(playback);
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      if (typeof AudioContext === "undefined") {
        throw new Error("Web Audio API is unavailable in this environment");
      }
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private setProviderState(nextState: AudioProviderState): void {
    if (this.providerState === nextState) return;
    this.providerState = nextState;
    this.onStateChange?.(nextState);
  }
}
