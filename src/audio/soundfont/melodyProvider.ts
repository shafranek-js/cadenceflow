import SoundfontPlayer from "soundfont-player";

import type {
  AudioClock,
  AudioNoteEvent,
  AudioProviderState,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../contracts";
import type { MelodyInstrument, MelodyTrackSettings } from "../../domain/melody/types";

export const MELODY_SAMPLE_FILES: Readonly<Record<MelodyInstrument, string>> = Object.freeze({
  violin: "violin-mp3.js",
  cello: "cello-mp3.js",
  oboe: "oboe-mp3.js",
  clarinet: "clarinet-mp3.js",
  flute: "flute-mp3.js",
  "synth-lead": "lead_1_square-mp3.js",
});

interface SampleNode {
  stop(when?: number): void;
}

export interface MelodySamplePlayer {
  play(
    midiNote: number,
    when?: number,
    options?: { readonly duration?: number; readonly gain?: number },
  ): SampleNode | undefined;
  stop(when?: number): unknown;
}

type InstrumentLoader = (
  context: AudioContext,
  instrument: MelodyInstrument,
  url: string,
  destination: AudioNode,
) => Promise<MelodySamplePlayer>;

const defaultInstrumentLoader: InstrumentLoader = async (context, instrument, url, destination) =>
  SoundfontPlayer.instrument(context, instrument, {
    format: "mp3",
    destination,
    nameToUrl: () => url,
  });

interface ActivePlayback {
  readonly id: string;
  readonly nodes: SampleNode[];
  cancelled: boolean;
}

export interface MelodySoundFontProviderOptions {
  readonly audioContext?: AudioContext | undefined;
  readonly destination?: AudioNode | undefined;
  readonly instrument?: MelodyInstrument | undefined;
  readonly volume?: number | undefined;
  readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
  readonly loadInstrument?: InstrumentLoader | undefined;
  readonly assetBaseUrl?: string | undefined;
}

/**
 * Sample-backed Melody provider using locally vendored FluidR3_GM instruments.
 * No network URL, oscillator substitute, WASM decoder, or SoundFont parser is used at runtime.
 */
export class MelodySoundFontProvider implements InstrumentAudioProvider {
  readonly id = "fluidr3-gm-melody-samples";
  private providerState: AudioProviderState = "idle";
  private audioContext: AudioContext | null;
  private readonly destinationNode?: AudioNode | undefined;
  private readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
  private readonly loadInstrument: InstrumentLoader;
  private readonly assetBaseUrl: string;
  private readonly players = new Map<MelodyInstrument, MelodySamplePlayer>();
  private readonly loads = new Map<MelodyInstrument, Promise<MelodySamplePlayer>>();
  private readonly livePlaybacks = new Set<ActivePlayback>();
  private readonly previewPlaybacks = new Set<ActivePlayback>();
  private liveInstrument: MelodyInstrument;
  private liveVolume: number;
  private previewInstrument: MelodyInstrument;
  private previewVolume: number;
  private playbackCounter = 0;
  private preparationError: Error | null = null;
  private preparationPromise: Promise<void> | null = null;
  private preparationInstrument: MelodyInstrument | null = null;

  constructor(options: MelodySoundFontProviderOptions = {}) {
    this.audioContext = options.audioContext ?? null;
    this.destinationNode = options.destination;
    this.onStateChange = options.onStateChange;
    this.loadInstrument = options.loadInstrument ?? defaultInstrumentLoader;
    this.assetBaseUrl =
      options.assetBaseUrl ?? `${import.meta.env.BASE_URL}audio/melody/FluidR3_GM/`;
    this.liveInstrument = options.instrument ?? "flute";
    this.liveVolume = clampMidi(options.volume ?? 100);
    this.previewInstrument = this.liveInstrument;
    this.previewVolume = this.liveVolume;
  }

  get state(): AudioProviderState {
    return this.providerState;
  }

  get audioCtx(): AudioContext | null {
    return this.audioContext;
  }

  get clock(): AudioClock {
    return {
      now: () =>
        this.audioContext?.currentTime ??
        (typeof performance !== "undefined" ? performance.now() / 1000 : 0),
    };
  }

  get lastError(): Error | null {
    return this.preparationError;
  }

  async prepare(): Promise<void> {
    const instrument = this.liveInstrument;
    if (this.players.has(instrument)) {
      this.setProviderState("ready");
      return;
    }

    if (this.preparationPromise && this.preparationInstrument === instrument) {
      return this.preparationPromise;
    }

    this.preparationInstrument = instrument;
    const preparation = this.prepareInstrument(instrument);
    this.preparationPromise = preparation;
    return preparation;
  }

  async preparePreview(instrument: MelodyInstrument, volume: number): Promise<void> {
    this.setPreviewSettings(instrument, volume);
    const hasPlayableLiveInstrument = this.players.has(this.liveInstrument);
    if (!this.players.has(instrument) && !hasPlayableLiveInstrument) {
      this.setProviderState("loading");
      this.preparationError = null;
    }
    try {
      await this.loadPlayer(instrument);
      if (!hasPlayableLiveInstrument) this.setProviderState("ready");
    } catch (error) {
      this.preparationError = error instanceof Error ? error : new Error(String(error));
      if (!hasPlayableLiveInstrument) this.setProviderState("error");
      throw error;
    }
  }

  setTrackSettings(settings: MelodyTrackSettings): void {
    const instrumentChanged = settings.instrument !== this.liveInstrument;
    if (instrumentChanged) this.cancelPlaybacks(this.livePlaybacks);
    this.liveInstrument = settings.instrument;
    this.liveVolume = clampMidi(settings.volume);
    if (!this.players.has(this.liveInstrument)) this.setProviderState("idle");
  }

  setPreviewSettings(instrument: MelodyInstrument, volume: number): void {
    if (instrument !== this.previewInstrument) this.cancelPlaybacks(this.previewPlaybacks);
    this.previewInstrument = instrument;
    this.previewVolume = clampMidi(volume);
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.scheduleWithPlayer(
      events,
      clock,
      this.liveInstrument,
      this.liveVolume,
      this.livePlaybacks,
      "live",
    );
  }

  schedulePreview(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.scheduleWithPlayer(
      events,
      clock,
      this.previewInstrument,
      this.previewVolume,
      this.previewPlaybacks,
      "preview",
    );
  }

  stop(_scope?: PlaybackScope): void {
    // The scheduler owns the live transport scope. PreviewAuditionController
    // owns preview handles and cancels them explicitly, so stopping or
    // pausing the progression must never cut an editor audition short.
    this.cancelPlaybacks(this.livePlaybacks);
  }

  async dispose(): Promise<void> {
    this.stop();
    for (const player of this.players.values()) player.stop();
    this.players.clear();
    this.loads.clear();
    this.preparationPromise = null;
    this.preparationInstrument = null;
    this.audioContext = null;
    this.preparationError = null;
    this.setProviderState("idle");
  }

  private async loadPlayer(instrument: MelodyInstrument): Promise<MelodySamplePlayer> {
    const loaded = this.players.get(instrument);
    if (loaded) return loaded;

    const pending = this.loads.get(instrument);
    if (pending) return pending;

    const context = this.ensureAudioContext();
    const destination = this.destinationNode ?? context.destination;
    const fileName = MELODY_SAMPLE_FILES[instrument];
    const url = `${this.assetBaseUrl}${fileName}`;
    const loading = this.loadInstrument(context, instrument, url, destination)
      .then((player) => {
        this.players.set(instrument, player);
        return player;
      })
      .finally(() => this.loads.delete(instrument));
    this.loads.set(instrument, loading);
    return loading;
  }

  private async prepareInstrument(instrument: MelodyInstrument): Promise<void> {
    this.setProviderState("loading");
    this.preparationError = null;
    try {
      await this.loadPlayer(instrument);
      if (this.liveInstrument === instrument) this.setProviderState("ready");
    } catch (error) {
      if (this.liveInstrument === instrument) {
        this.preparationError = error instanceof Error ? error : new Error(String(error));
        this.setProviderState("error");
      }
      throw error;
    } finally {
      if (this.preparationInstrument === instrument) {
        this.preparationPromise = null;
        this.preparationInstrument = null;
      }
    }
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      if (typeof AudioContext === "undefined") {
        throw new Error("Web Audio API is unavailable in this browser");
      }
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  private scheduleWithPlayer(
    events: readonly AudioNoteEvent[],
    clock: AudioClock,
    instrument: MelodyInstrument,
    volume: number,
    collection: Set<ActivePlayback>,
    scope: "live" | "preview",
  ): ScheduledPlayback {
    assertMelodyEvents(events);
    const context = this.ensureAudioContext();
    const player = this.players.get(instrument);
    if (!player) throw new Error(`${instrument} samples are not ready`);

    const playback: ActivePlayback = {
      id: `melody-${scope}-${++this.playbackCounter}`,
      nodes: [],
      cancelled: false,
    };
    collection.add(playback);
    const baseTime = Math.max(context.currentTime, clock.now());
    const trackGain = volume / 127;

    try {
      for (const event of events) {
        const node = player.play(event.pitch, baseTime + event.startSeconds, {
          duration: event.durationSeconds,
          gain: (event.velocity / 127) * trackGain,
        });
        if (!node) throw new Error(`${instrument} has no sample for MIDI note ${event.pitch}`);
        playback.nodes.push(node);
      }
    } catch (error) {
      this.cancelPlayback(playback, collection);
      throw error;
    }

    return {
      id: playback.id,
      cancel: () => this.cancelPlayback(playback, collection),
    };
  }

  private cancelPlaybacks(collection: Set<ActivePlayback>): void {
    for (const playback of [...collection]) this.cancelPlayback(playback, collection);
  }

  private cancelPlayback(playback: ActivePlayback, collection: Set<ActivePlayback>): void {
    if (playback.cancelled) return;
    playback.cancelled = true;
    const when = this.audioContext?.currentTime;
    for (const node of playback.nodes) {
      try {
        node.stop(when);
      } catch {
        // A decoded sample may already have ended.
      }
    }
    playback.nodes.length = 0;
    collection.delete(playback);
  }

  private setProviderState(nextState: AudioProviderState): void {
    if (this.providerState === nextState) return;
    this.providerState = nextState;
    this.onStateChange?.(nextState);
  }
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function assertMelodyEvents(events: readonly AudioNoteEvent[]): void {
  if (
    events.some(
      (event) =>
        event.channelRole !== "melody" ||
        !Number.isInteger(event.pitch) ||
        event.pitch < 0 ||
        event.pitch > 127 ||
        !Number.isFinite(event.startSeconds) ||
        event.startSeconds < 0 ||
        !Number.isFinite(event.durationSeconds) ||
        event.durationSeconds <= 0 ||
        !Number.isFinite(event.velocity) ||
        event.velocity < 1 ||
        event.velocity > 127,
    )
  ) {
    throw new TypeError("Melody sample events require valid MIDI pitch, timing, and velocity");
  }
}
