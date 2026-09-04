import type {
  AudioClock,
  AudioNoteEvent,
  AudioProviderState,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../contracts";

export interface ISpessaSynth {
  readonly isReady?: Promise<unknown>;
  readonly soundBankManager?: {
    addSoundBank(soundBankBuffer: ArrayBuffer, id: string): Promise<void>;
  };
  noteOn(channel: number, midiNote: number, velocity: number): void;
  noteOff(channel: number, midiNote: number): void;
  stopAll(force?: boolean): void;
  destroy?(): void;
  connect?(node: AudioNode): AudioNode;
}

export interface SpessaSoundFontProviderOptions {
  readonly id?: string | undefined;
  readonly soundFontUrl?: string | undefined;
  readonly soundFontBuffer?: ArrayBuffer | undefined;
  readonly audioContext?: BaseAudioContext | undefined;
  readonly destination?: AudioNode | undefined;
  readonly synthFactory?:
    ((ctx: BaseAudioContext) => Promise<ISpessaSynth> | ISpessaSynth) | undefined;
  readonly fetchFn?: typeof fetch | undefined;
}

interface ScheduledNoteTimer {
  readonly onTimerId: ReturnType<typeof setTimeout>;
  readonly offTimerId: ReturnType<typeof setTimeout>;
}

export class SpessaSoundFontProvider implements InstrumentAudioProvider {
  readonly id: string;
  private providerState: AudioProviderState = "idle";
  private synth: ISpessaSynth | null = null;
  private audioContext: BaseAudioContext | null = null;
  private readonly soundFontUrl?: string | undefined;
  private readonly soundFontBuffer?: ArrayBuffer | undefined;
  private readonly destinationNode?: AudioNode | undefined;
  private readonly synthFactory?:
    ((ctx: BaseAudioContext) => Promise<ISpessaSynth> | ISpessaSynth) | undefined;
  private readonly fetchImpl: typeof fetch;

  private activeTimers: ScheduledNoteTimer[] = [];
  private playbackCount = 0;

  constructor(options: SpessaSoundFontProviderOptions = {}) {
    this.id = options.id ?? "soundfont-piano";
    this.soundFontUrl = options.soundFontUrl;
    this.soundFontBuffer = options.soundFontBuffer;
    this.audioContext = options.audioContext ?? null;
    this.destinationNode = options.destination;
    this.synthFactory = options.synthFactory;
    this.fetchImpl =
      options.fetchFn ??
      (typeof fetch !== "undefined"
        ? fetch.bind(globalThis)
        : (undefined as unknown as typeof fetch));
  }

  get state(): AudioProviderState {
    return this.providerState;
  }

  get underlyingSynth(): ISpessaSynth | null {
    return this.synth;
  }

  async prepare(): Promise<void> {
    this.providerState = "loading";
    // Yield to allow observation of loading state
    await Promise.resolve();

    try {
      if (!this.audioContext && typeof AudioContext !== "undefined") {
        this.audioContext = new AudioContext();
      }

      if (this.synthFactory) {
        if (!this.audioContext) {
          throw new Error("AudioContext is required to initialize synthesizer");
        }
        this.synth = await this.synthFactory(this.audioContext);
      } else {
        // Dynamic import from spessasynth_lib to keep worklet/browser initialization isolated
        const { WorkletSynthesizer } = await import("spessasynth_lib");
        if (!this.audioContext) {
          throw new Error("AudioContext is required to initialize WorkletSynthesizer");
        }
        this.synth = new WorkletSynthesizer(this.audioContext);
      }

      if (this.destinationNode && this.synth && typeof this.synth.connect === "function") {
        this.synth.connect(this.destinationNode);
      }

      // Load soundbank buffer if provided or url specified
      let buffer = this.soundFontBuffer;
      if (!buffer && this.soundFontUrl) {
        if (!this.fetchImpl) {
          throw new Error("Fetch is required to load soundfont URL");
        }
        const res = await this.fetchImpl(this.soundFontUrl);
        if (!res.ok) {
          throw new Error(`Failed to load SoundFont from ${this.soundFontUrl}: HTTP ${res.status}`);
        }
        buffer = await res.arrayBuffer();
      }

      if (buffer && this.synth.soundBankManager) {
        await this.synth.soundBankManager.addSoundBank(buffer, "default-soundfont");
      }

      if (this.synth.isReady) {
        await this.synth.isReady;
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

    if (!this.synth) {
      throw new Error("Synthesizer not initialized");
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

    this.playbackCount++;
    const playbackId = `sf-playback-${this.playbackCount}`;
    const batchTimers: ScheduledNoteTimer[] = [];
    let isCancelled = false;

    const _baseClockTime = clock.now();
    const synthRef = this.synth;

    for (const evt of events) {
      const channel = evt.channelRole === "bass" ? 1 : 0;
      const onDelayMs = Math.max(0, evt.startSeconds * 1000);
      const offDelayMs = Math.max(0, (evt.startSeconds + evt.durationSeconds) * 1000);

      const onTimerId = setTimeout(() => {
        if (!isCancelled && synthRef) {
          synthRef.noteOn(channel, evt.pitch, evt.velocity);
        }
      }, onDelayMs);

      const offTimerId = setTimeout(() => {
        if (!isCancelled && synthRef) {
          synthRef.noteOff(channel, evt.pitch);
        }
      }, offDelayMs);

      const timerEntry: ScheduledNoteTimer = { onTimerId, offTimerId };
      batchTimers.push(timerEntry);
      this.activeTimers.push(timerEntry);
    }

    return {
      id: playbackId,
      cancel: () => {
        isCancelled = true;
        for (const t of batchTimers) {
          clearTimeout(t.onTimerId);
          clearTimeout(t.offTimerId);
          const idx = this.activeTimers.indexOf(t);
          if (idx !== -1) {
            this.activeTimers.splice(idx, 1);
          }
        }
        synthRef?.stopAll(true);
      },
    };
  }

  stop(_scope?: PlaybackScope): void {
    for (const t of this.activeTimers) {
      clearTimeout(t.onTimerId);
      clearTimeout(t.offTimerId);
    }
    this.activeTimers = [];

    if (this.synth) {
      this.synth.stopAll(true);
    }
  }

  async dispose(): Promise<void> {
    this.stop();
    if (this.synth) {
      if (typeof this.synth.destroy === "function") {
        this.synth.destroy();
      }
      this.synth = null;
    }
    this.providerState = "idle";
  }
}
