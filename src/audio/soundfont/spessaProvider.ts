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
  controllerChange?(channel: number, controller: number, value: number): void;
  programChange?(channel: number, programNumber: number): void;
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
  readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
}

interface ScheduledNoteTimer {
  readonly onTimerId: ReturnType<typeof setTimeout>;
  readonly offTimerId: ReturnType<typeof setTimeout>;
  readonly channel: number;
  readonly pitch: number;
  started: boolean;
}

export const SPESSA_CHANNELS = Object.freeze({
  upper: 0,
  bass: 1,
  melody: 2,
  preview: 3,
  metronome: 9,
} as const);

function midiChannelForRole(role: AudioNoteEvent["channelRole"]): number {
  return SPESSA_CHANNELS[role];
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
  private readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;

  private activeTimers: ScheduledNoteTimer[] = [];
  private playbackCount = 0;
  private preparationPromise: Promise<void> | null = null;
  private preparationError: Error | null = null;

  constructor(options: SpessaSoundFontProviderOptions = {}) {
    this.id = options.id ?? "soundfont-piano";
    this.soundFontUrl = options.soundFontUrl;
    this.soundFontBuffer = options.soundFontBuffer;
    this.audioContext = options.audioContext ?? null;
    this.destinationNode = options.destination;
    this.synthFactory = options.synthFactory;
    this.onStateChange = options.onStateChange;
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

  get audioCtx(): BaseAudioContext | null {
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

  private setProviderState(nextState: AudioProviderState): void {
    if (this.providerState !== nextState) {
      this.providerState = nextState;
      this.onStateChange?.(nextState);
    }
  }

  async prepare(): Promise<void> {
    if (this.providerState === "ready" && this.synth) return;
    if (this.preparationPromise) return this.preparationPromise;

    this.preparationPromise = this.prepareInternal();
    try {
      await this.preparationPromise;
    } finally {
      this.preparationPromise = null;
    }
  }

  private async prepareInternal(): Promise<void> {
    this.setProviderState("loading");
    this.preparationError = null;
    await Promise.resolve();

    try {
      if (!this.audioContext && typeof AudioContext !== "undefined") {
        this.audioContext = new AudioContext();
      }
      if (!this.audioContext) {
        throw new Error("AudioContext is required to initialize synthesizer");
      }

      if (this.synthFactory) {
        this.synth = await this.synthFactory(this.audioContext);
      } else {
        throw new Error("SpessaSynth backend requires an explicit synthesizer factory");
      }

      if (this.destinationNode && this.synth && typeof this.synth.connect === "function") {
        this.synth.connect(this.destinationNode);
      }

      let buffer = this.soundFontBuffer;
      if (!buffer && this.soundFontUrl) {
        if (!this.fetchImpl) throw new Error("Fetch is required to load SoundFont URL");
        const response = await this.fetchImpl(this.soundFontUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to load SoundFont from ${this.soundFontUrl}: HTTP ${response.status}`,
          );
        }
        buffer = await response.arrayBuffer();
      }
      if (buffer) {
        if (!this.synth?.soundBankManager) {
          throw new Error("SpessaSynth sound bank manager is unavailable");
        }
        await this.synth.soundBankManager.addSoundBank(buffer, "default-soundfont");
      }
      if (this.synth.isReady) await this.synth.isReady;
      this.setProviderState("ready");
    } catch (error) {
      this.synth?.stopAll(true);
      this.synth?.destroy?.();
      this.synth = null;
      this.preparationError = error instanceof Error ? error : new Error(String(error));
      this.setProviderState("error");
      throw error;
    }
  }

  configureChannel(channel: number, programNumber?: number, volume = 127): void {
    if (!this.synth) return;
    if (programNumber !== undefined) this.synth.programChange?.(channel, programNumber);
    this.synth.controllerChange?.(channel, 7, Math.max(0, Math.min(127, Math.round(volume))));
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.scheduleOnChannel(events, clock);
  }

  scheduleOnChannel(
    events: readonly AudioNoteEvent[],
    clock: AudioClock,
    channelOverride?: number,
  ): ScheduledPlayback {
    if (this.providerState !== "ready" && this.providerState !== "fallback") {
      throw new Error(`Cannot schedule audio while provider is in state '${this.providerState}'`);
    }
    if (!this.synth) throw new Error("Synthesizer not initialized");

    for (const event of events) {
      if (
        !Number.isInteger(event.pitch) ||
        event.pitch < 0 ||
        event.pitch > 127 ||
        !Number.isFinite(event.startSeconds) ||
        event.startSeconds < 0 ||
        !Number.isFinite(event.durationSeconds) ||
        event.durationSeconds <= 0 ||
        !Number.isFinite(event.velocity) ||
        event.velocity < 1 ||
        event.velocity > 127
      ) {
        throw new TypeError("AudioNoteEvent contains invalid pitch, timing, or velocity");
      }
    }

    this.playbackCount += 1;
    const playbackId = `sf-playback-${this.playbackCount}`;
    const batchTimers: ScheduledNoteTimer[] = [];
    let isCancelled = false;
    const synthRef = this.synth;
    void clock.now();

    for (const event of events) {
      const channel = channelOverride ?? midiChannelForRole(event.channelRole);
      const timer: ScheduledNoteTimer = {
        onTimerId: setTimeout(
          () => {
            if (!isCancelled) {
              timer.started = true;
              synthRef.noteOn(channel, event.pitch, event.velocity);
            }
          },
          Math.max(0, event.startSeconds * 1000),
        ),
        offTimerId: setTimeout(
          () => {
            if (!isCancelled && timer.started) synthRef.noteOff(channel, event.pitch);
            this.removeTimer(timer);
          },
          Math.max(0, (event.startSeconds + event.durationSeconds) * 1000),
        ),
        channel,
        pitch: event.pitch,
        started: false,
      };
      batchTimers.push(timer);
      this.activeTimers.push(timer);
    }

    return {
      id: playbackId,
      cancel: () => {
        if (isCancelled) return;
        isCancelled = true;
        for (const timer of batchTimers) {
          clearTimeout(timer.onTimerId);
          clearTimeout(timer.offTimerId);
          if (timer.started) synthRef.noteOff(timer.channel, timer.pitch);
          this.removeTimer(timer);
        }
      },
    };
  }

  stopChannel(channel: number): void {
    for (const timer of [...this.activeTimers]) {
      if (timer.channel !== channel) continue;
      clearTimeout(timer.onTimerId);
      clearTimeout(timer.offTimerId);
      if (timer.started) this.synth?.noteOff(timer.channel, timer.pitch);
      this.removeTimer(timer);
    }
  }

  stop(_scope?: PlaybackScope): void {
    for (const timer of this.activeTimers) {
      clearTimeout(timer.onTimerId);
      clearTimeout(timer.offTimerId);
      if (timer.started) this.synth?.noteOff(timer.channel, timer.pitch);
    }
    this.activeTimers = [];
    this.synth?.stopAll(true);
  }

  async dispose(): Promise<void> {
    this.stop();
    this.synth?.destroy?.();
    this.synth = null;
    this.preparationError = null;
    this.setProviderState("idle");
  }

  private removeTimer(timer: ScheduledNoteTimer): void {
    const index = this.activeTimers.indexOf(timer);
    if (index >= 0) this.activeTimers.splice(index, 1);
  }
}
