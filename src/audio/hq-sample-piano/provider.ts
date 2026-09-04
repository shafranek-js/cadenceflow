import type {
  AudioClock,
  AudioNoteEvent,
  AudioProviderState,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../contracts";
import { type HqPianoManifest, resolveSampleRegion, validatePianoManifest } from "./manifest";
import { SampleCache } from "./sampleCache";

export interface HqSamplePianoProviderOptions {
  readonly id?: string | undefined;
  readonly manifestUrl?: string | undefined;
  readonly manifestData?: HqPianoManifest | undefined;
  readonly audioContext?: AudioContext | undefined;
  readonly sampleCache?: SampleCache | undefined;
  readonly fetchFn?: typeof fetch | undefined;
  readonly destination?: AudioNode | undefined;
}

interface ActiveNodeEntry {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly stopTime: number;
}

interface ActivePlaybackRecord {
  readonly id: string;
  readonly nodes: ActiveNodeEntry[];
  readonly events: readonly AudioNoteEvent[];
  cancelled: boolean;
}

export class HqSamplePianoProvider implements InstrumentAudioProvider {
  readonly id: string;
  private providerState: AudioProviderState = "idle";
  private manifest: HqPianoManifest | null = null;
  private readonly manifestUrl: string;
  private readonly initialManifestData?: HqPianoManifest | undefined;
  private audioContext: AudioContext | null = null;
  private readonly destinationNode?: AudioNode | undefined;
  private readonly fetchImpl: typeof fetch;

  private sampleCache: SampleCache | null = null;
  private activePlaybacks: ActivePlaybackRecord[] = [];
  private playbackCounter = 0;

  constructor(options: HqSamplePianoProviderOptions = {}) {
    this.id = options.id ?? "hq-sample-piano";
    this.manifestUrl = options.manifestUrl ?? "/audio/piano-hq/manifest.json";
    this.initialManifestData = options.manifestData;
    this.audioContext = options.audioContext ?? null;
    this.destinationNode = options.destination;
    this.fetchImpl =
      options.fetchFn ??
      (typeof fetch !== "undefined"
        ? fetch.bind(globalThis)
        : (undefined as unknown as typeof fetch));

    if (options.sampleCache) {
      this.sampleCache = options.sampleCache;
    }
  }

  get state(): AudioProviderState {
    return this.providerState;
  }

  get loadedManifest(): HqPianoManifest | null {
    return this.manifest;
  }

  get cache(): SampleCache | null {
    return this.sampleCache;
  }

  async prepare(): Promise<void> {
    this.providerState = "loading";
    // Yield to allow callers to observe loading state
    await Promise.resolve();

    try {
      // 1. Resolve manifest
      if (this.initialManifestData) {
        this.manifest = validatePianoManifest(this.initialManifestData);
      } else {
        if (!this.fetchImpl) {
          throw new Error("No fetch implementation available to load piano manifest");
        }
        const response = await this.fetchImpl(this.manifestUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to load piano manifest from ${this.manifestUrl}: HTTP ${response.status} ${response.statusText}`,
          );
        }
        const data = await response.json();
        this.manifest = validatePianoManifest(data);
      }

      // 2. Initialize AudioContext if not already injected
      if (!this.audioContext && typeof AudioContext !== "undefined") {
        this.audioContext = new AudioContext();
      }

      // 3. Initialize SampleCache if not injected
      if (!this.sampleCache) {
        const baseUrl = this.manifestUrl.substring(0, this.manifestUrl.lastIndexOf("/") + 1);
        this.sampleCache = new SampleCache({
          maxEntries: 64,
          fetchAudioBuffer: async (assetPath: string) => {
            const url =
              assetPath.startsWith("http://") ||
              assetPath.startsWith("https://") ||
              assetPath.startsWith("/")
                ? assetPath
                : `${baseUrl}${assetPath}`;

            const res = await this.fetchImpl(url);
            if (!res.ok) {
              throw new Error(`Failed to load audio sample from ${url}: HTTP ${res.status}`);
            }
            const arrayBuffer = await res.arrayBuffer();

            if (!this.audioContext) {
              throw new Error("AudioContext is required to decode audio data");
            }
            return await this.audioContext.decodeAudioData(arrayBuffer);
          },
        });
      }

      this.providerState = "ready";
    } catch (err) {
      this.providerState = "error";
      throw err;
    }
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    if (this.providerState !== "ready" && this.providerState !== "fallback") {
      throw new Error(`Cannot schedule audio while provider is in state '${this.providerState}'`);
    }

    if (!this.manifest) {
      throw new Error("Cannot schedule audio: manifest is not loaded");
    }

    // Validate canonical events
    for (const evt of events) {
      if (typeof evt.pitch !== "number" || evt.pitch < 0 || evt.pitch > 127) {
        throw new TypeError("AudioNoteEvent must contain a valid MIDI pitch in 0..127");
      }
      if (typeof evt.startSeconds !== "number" || evt.startSeconds < 0) {
        throw new TypeError("AudioNoteEvent must contain non-negative startSeconds");
      }
      if (typeof evt.durationSeconds !== "number" || evt.durationSeconds <= 0) {
        throw new TypeError("AudioNoteEvent must contain positive durationSeconds");
      }
      if (typeof evt.velocity !== "number" || evt.velocity < 1 || evt.velocity > 127) {
        throw new TypeError("AudioNoteEvent must contain numeric velocity in 1..127");
      }
      if (!["upper", "bass", "metronome"].includes(evt.channelRole)) {
        throw new TypeError("AudioNoteEvent channelRole must be upper, bass, or metronome");
      }
    }

    this.playbackCounter++;
    const playbackId = `hq-playback-${this.playbackCounter}`;
    const activeRecord: ActivePlaybackRecord = {
      id: playbackId,
      nodes: [],
      events,
      cancelled: false,
    };
    this.activePlaybacks.push(activeRecord);

    const baseClockTime = clock.now();
    const notePromises: Promise<void>[] = [];

    // Schedule each note event asynchronously with buffer resolution
    for (const evt of events) {
      notePromises.push(this.scheduleSingleNote(evt, baseClockTime, activeRecord));
    }

    const readyPromise = Promise.all(notePromises).then(() => undefined);

    return {
      id: playbackId,
      cancel: () => {
        activeRecord.cancelled = true;
        this.stopRecordNodes(activeRecord);
      },
      ready: readyPromise,
    };
  }

  stop(_scope?: PlaybackScope): void {
    for (const record of this.activePlaybacks) {
      record.cancelled = true;
      this.stopRecordNodes(record);
    }
    this.activePlaybacks = [];
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.sampleCache) {
      this.sampleCache.dispose();
      this.sampleCache = null;
    }
    if (this.audioContext && typeof this.audioContext.close === "function") {
      try {
        await this.audioContext.close();
      } catch {
        // Ignore close errors
      }
    }
    this.audioContext = null;
    this.manifest = null;
    this.providerState = "idle";
  }

  /**
   * Diagnostic inspection helper for review and logging:
   * Maps pitch and velocity to selected region details without triggering audio.
   */
  inspectEventMapping(
    pitch: number,
    velocity: number,
  ): {
    readonly midiPitch: number;
    readonly velocity: number;
    readonly sampleRoot: number;
    readonly velocityLayer: number;
    readonly assetPath: string;
    readonly playbackRate: number;
  } {
    if (!this.manifest) {
      throw new Error("Manifest not loaded");
    }
    const resolved = resolveSampleRegion(this.manifest, pitch, velocity);
    return {
      midiPitch: pitch,
      velocity,
      sampleRoot: resolved.region.rootPitch,
      velocityLayer: resolved.region.velocityLayer,
      assetPath: resolved.region.assetPath,
      playbackRate: resolved.playbackRate,
    };
  }

  private async scheduleSingleNote(
    evt: AudioNoteEvent,
    baseClockTime: number,
    record: ActivePlaybackRecord,
  ): Promise<void> {
    if (record.cancelled || !this.manifest || !this.sampleCache || !this.audioContext) {
      return;
    }

    try {
      const resolved = resolveSampleRegion(this.manifest, evt.pitch, evt.velocity);
      const buffer = await this.sampleCache.get(resolved.region.assetPath);

      if (record.cancelled) {
        return;
      }

      const audioCtx = this.audioContext;
      const startTime = baseClockTime + evt.startSeconds;
      const stopTime = startTime + evt.durationSeconds;

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = resolved.playbackRate;

      const gain = audioCtx.createGain();
      // Musical velocity scaling: fine-gain refinement inside the discrete layer
      const normalizedVel = evt.velocity / 127;
      const gainValue = Math.pow(normalizedVel, 1.2);

      gain.gain.setValueAtTime(gainValue, Math.max(0, startTime));
      // Smooth release decay ramp at note off
      const releaseDuration = 0.05; // 50ms
      gain.gain.setValueAtTime(gainValue, Math.max(0, stopTime));
      gain.gain.linearRampToValueAtTime(0.0001, stopTime + releaseDuration);

      source.connect(gain);
      const targetDestination = this.destinationNode ?? audioCtx.destination;
      gain.connect(targetDestination);

      source.start(Math.max(0, startTime));
      source.stop(stopTime + releaseDuration);

      const nodeEntry: ActiveNodeEntry = {
        source,
        gain,
        stopTime: stopTime + releaseDuration,
      };
      record.nodes.push(nodeEntry);

      // Clean up node when finished
      source.onended = () => {
        const idx = record.nodes.indexOf(nodeEntry);
        if (idx !== -1) {
          record.nodes.splice(idx, 1);
        }
      };
    } catch {
      // Missing or unmappable note
      // Expose fallback state if assets cannot be loaded
      this.providerState = "fallback";
    }
  }

  private stopRecordNodes(record: ActivePlaybackRecord): void {
    for (const node of record.nodes) {
      try {
        node.source.stop();
        node.source.disconnect();
        node.gain.disconnect();
      } catch {
        // Ignore nodes already ended
      }
    }
    record.nodes.length = 0;
  }
}
