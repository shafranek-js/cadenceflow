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
import {
  getMelodyInstrument,
  FLUID_R3_NAMES,
  FLUID_R3_CDN_BASE,
  type MelodyInstrumentId,
} from "../../domain/melody/instrumentCatalog";

export const MELODY_SAMPLE_FILES: Readonly<Partial<Record<MelodyInstrument, string>>> =
  Object.freeze({
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

export interface MelodyPreparationResult {
  readonly ready: readonly MelodyInstrumentId[];
  readonly unavailable: readonly MelodyInstrumentId[];
  readonly failed: readonly MelodyInstrumentId[];
}

/**
 * Stable user-facing summary for instruments which failed to load in the
 * realtime provider. Used so other Melody lanes can continue while the
 * failed lane is identified.
 */
export function formatMelodyPreparationNotice(
  result: Pick<MelodyPreparationResult, "unavailable" | "failed">,
): string | null {
  const failed = new Set(result.failed);
  const instruments = [...new Set([...result.unavailable, ...result.failed])].sort(
    (a, b) => getMelodyInstrument(a).program - getMelodyInstrument(b).program || a.localeCompare(b),
  );
  if (instruments.length === 0) return null;
  return instruments
    .map((instrument) => {
      const entry = getMelodyInstrument(instrument);
      const prefix = `GM ${String(entry.program).padStart(3, "0")} · ${entry.label} ·`;
      if (failed.has(instrument)) return `${prefix} Realtime sample failed to load`;
      return `${prefix} Realtime sample unavailable`;
    })
    .join("; ");
}

export interface MelodySoundFontProviderOptions {
  readonly audioContext?: AudioContext | undefined;
  readonly destination?: AudioNode | undefined;
  readonly instrument?: MelodyInstrument | undefined;
  readonly volume?: number | undefined;
  readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
  readonly loadInstrument?: InstrumentLoader | undefined;
  readonly assetBaseUrl?: string | undefined;
  readonly guitarAssetBaseUrl?: string | undefined;
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
  private readonly guitarAssetBaseUrl: string;
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
  private unavailableInstruments: readonly MelodyInstrumentId[] = Object.freeze([]);
  private failedInstruments: readonly MelodyInstrumentId[] = Object.freeze([]);

  constructor(options: MelodySoundFontProviderOptions = {}) {
    this.audioContext = options.audioContext ?? null;
    this.destinationNode = options.destination;
    this.onStateChange = options.onStateChange;
    this.loadInstrument = options.loadInstrument ?? defaultInstrumentLoader;
    const baseUrl =
      typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
        ? import.meta.env.BASE_URL
        : "/";
    this.assetBaseUrl =
      options.assetBaseUrl ?? `${baseUrl.replace(/\/$/, "")}/audio/melody/FluidR3_GM/`;
    this.guitarAssetBaseUrl =
      options.guitarAssetBaseUrl ?? `${baseUrl.replace(/\/$/, "")}/audio/guitar/`;
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

  get unavailable(): readonly MelodyInstrumentId[] {
    return this.unavailableInstruments;
  }

  async prepare(): Promise<void> {
    const result = await this.prepareForInstruments([this.liveInstrument]);
    if (result.unavailable.length > 0 || result.failed.length > 0) {
      throw this.preparationError ?? new Error(this.unavailableMessage(result.unavailable));
    }
  }

  async preparePreview(instrument: MelodyInstrument, volume: number): Promise<void> {
    this.setPreviewSettings(instrument, volume);
    const result = await this.prepareForInstruments([instrument]);
    if (result.unavailable.length > 0 || result.failed.length > 0) {
      throw this.preparationError ?? new Error(this.unavailableMessage(result.unavailable));
    }
  }

  async prepareForInstruments(
    instruments: readonly MelodyInstrument[],
  ): Promise<MelodyPreparationResult> {
    const requested = [...new Set(instruments)] as MelodyInstrumentId[];
    const ready: MelodyInstrumentId[] = [];
    const unavailable: MelodyInstrumentId[] = [];
    const failed: MelodyInstrumentId[] = [];
    this.setProviderState("loading");
    this.preparationError = null;

    await Promise.all(
      requested.map(async (instrument) => {
        try {
          await this.loadPlayer(instrument);
          ready.push(instrument);
        } catch (error) {
          failed.push(instrument);
          this.preparationError ??= error instanceof Error ? error : new Error(String(error));
        }
      }),
    );
    ready.sort();
    unavailable.sort();
    failed.sort();
    this.unavailableInstruments = Object.freeze(unavailable);
    this.failedInstruments = Object.freeze(failed);
    if (ready.length === 0 && (failed.length > 0 || unavailable.length > 0)) {
      this.preparationError ??= new Error(this.unavailableMessage(unavailable));
      this.setProviderState("error");
    } else if (ready.length > 0) {
      this.setProviderState("ready");
    } else {
      this.setProviderState("idle");
    }
    return Object.freeze({
      ready: Object.freeze(ready),
      unavailable: Object.freeze(unavailable),
      failed: Object.freeze(failed),
    });
  }

  setTrackSettings(settings: MelodyTrackSettings): void {
    const instrumentChanged = settings.instrument !== this.liveInstrument;
    if (instrumentChanged) this.cancelPlaybacks(this.livePlaybacks);
    this.liveInstrument = settings.instrument;
    this.liveVolume = clampMidi(settings.volume);
    if (!this.players.has(this.liveInstrument)) {
      this.preparationError = null;
      this.setProviderState("idle");
    }
  }

  setVolume(volume: number): void {
    const nextVolume = clampMidi(volume);
    this.liveVolume = nextVolume;
    this.previewVolume = nextVolume;
  }

  setPreviewSettings(instrument: MelodyInstrument, volume: number): void {
    if (instrument !== this.previewInstrument) this.cancelPlaybacks(this.previewPlaybacks);
    this.previewInstrument = instrument;
    this.previewVolume = clampMidi(volume);
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.scheduleWithPlayer(events, clock, this.liveVolume, this.livePlaybacks, "live");
  }

  schedulePreview(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.scheduleWithPlayer(
      events,
      clock,
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
    this.audioContext = null;
    this.preparationError = null;
    this.unavailableInstruments = Object.freeze([]);
    this.failedInstruments = Object.freeze([]);
    this.setProviderState("idle");
  }

  private async loadPlayer(instrument: MelodyInstrument): Promise<MelodySamplePlayer> {
    const loaded = this.players.get(instrument);
    if (loaded) return loaded;

    const pending = this.loads.get(instrument);
    if (pending) return pending;

    const context = this.ensureAudioContext();
    const destination = this.destinationNode ?? context.destination;
    const entry = getMelodyInstrument(instrument);

    // Locally bundled instruments (the original 6) use the local asset bundle.
    // In addition, GM 24 (Acoustic Guitar Nylon) and GM 25 (Acoustic Guitar Steel)
    // are bundled locally under /audio/guitar/ for offline capability and fast load.
    // All other GM programs are loaded on-demand from the FluidR3_GM CDN.
    let url: string;
    if (entry.sampleAsset) {
      url = `${this.assetBaseUrl}${entry.sampleAsset}`;
    } else if (entry.program === 24) {
      url = `${this.guitarAssetBaseUrl}acoustic_guitar_nylon-mp3.js`;
    } else if (entry.program === 25) {
      url = `${this.guitarAssetBaseUrl}acoustic_guitar_steel-mp3.js`;
    } else {
      const fluidName = FLUID_R3_NAMES[entry.program];
      if (!fluidName) {
        throw new Error(`No FluidR3 name mapping for GM program ${entry.program}`);
      }
      url = `${FLUID_R3_CDN_BASE}${fluidName}-mp3.js`;
    }

    const loading = this.loadInstrument(context, instrument, url, destination)
      .then((player) => {
        this.players.set(instrument, player);
        return player;
      })
      .finally(() => this.loads.delete(instrument));
    this.loads.set(instrument, loading);
    return loading;
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
    volume: number,
    collection: Set<ActivePlayback>,
    scope: "live" | "preview",
  ): ScheduledPlayback {
    assertMelodyEvents(events);
    const context = this.ensureAudioContext();

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
        const instrument =
          (event.instrument as MelodyInstrument | undefined) ??
          (scope === "preview" ? this.previewInstrument : this.liveInstrument);
        const player = this.players.get(instrument);
        // Silently skip notes for instruments that failed to load so the rest
        // of a mixed Melody can still play. The UI reports the failed state.
        if (!player && this.failedInstruments.includes(instrument)) continue;
        if (!player) throw new Error(`${instrument} samples are not ready`);
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

  private unavailableMessage(instruments: readonly MelodyInstrumentId[]): string {
    return (
      formatMelodyPreparationNotice({ unavailable: instruments, failed: [] }) ??
      "No realtime Melody sample is available"
    );
  }
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function assertMelodyEvents(events: readonly AudioNoteEvent[]): void {
  if (
    events.some(
      (event) =>
        !["melody", "upper", "bass"].includes(event.channelRole ?? "") ||
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
