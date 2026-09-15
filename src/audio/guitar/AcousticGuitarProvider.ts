import type {
  AudioClock,
  AudioNoteEvent,
  AudioProviderState,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../contracts";

export interface AcousticGuitarProviderOptions {
  readonly audioContext?: BaseAudioContext | undefined;
  readonly destination?: AudioNode | undefined;
  readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
  /** Strum delay in seconds between adjacent strings when plucking a chord (default: 0.018s = 18ms) */
  readonly strumDelaySeconds?: number | undefined;
}

interface ScheduledGuitarNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
  stopTime: number;
}

interface ActiveGuitarPlayback {
  readonly id: string;
  readonly nodes: ScheduledGuitarNode[];
  cancelled: boolean;
}

/**
 * Generates a physical modeling Karplus-Strong acoustic guitar string buffer.
 * Produces authentic metallic pluck attack and warm wood decay.
 */
export function generateKarplusStrongBuffer(
  sampleRate: number,
  frequency: number,
  durationSeconds: number,
  velocity: number,
): Float32Array {
  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const buffer = new Float32Array(totalSamples);
  const period = Math.max(2, Math.round(sampleRate / frequency));

  const velocityGain = Math.min(1.0, Math.max(0.1, (velocity / 127) * 0.85));

  // String excitation noise burst
  const ringBuffer = new Float32Array(period);
  for (let i = 0; i < period; i++) {
    const whiteNoise = Math.random() * 2 - 1;
    const pickAttack = i < Math.min(12, period) ? Math.sin((i / 12) * Math.PI) * 0.6 : 0;
    ringBuffer[i] = (whiteNoise * 0.65 + pickAttack) * velocityGain;
  }

  // Damping: lower strings (e.g. E2 = 82Hz) ring longer than high strings (E4 = 330Hz)
  const freqNorm = Math.min(1, Math.max(0, (frequency - 80) / 900));
  const decay = 0.996 - freqNorm * 0.012;

  let readIndex = 0;

  for (let n = 0; n < totalSamples; n++) {
    if (n < period) {
      buffer[n] = ringBuffer[n] ?? 0;
    } else {
      const current = ringBuffer[readIndex]!;
      const nextIndex = (readIndex + 1) % period;
      const next = ringBuffer[nextIndex]!;
      // Karplus-Strong lowpass filter in feedback loop
      const filtered = 0.5 * (current + next) * decay;

      ringBuffer[readIndex] = filtered;
      buffer[n] = filtered;
      readIndex = nextIndex;
    }
  }

  return buffer;
}

export class AcousticGuitarProvider implements InstrumentAudioProvider {
  readonly id: string = "acoustic-guitar";
  private providerState: AudioProviderState = "idle";
  private audioContext: BaseAudioContext | null = null;
  private destinationNode?: AudioNode | undefined;
  private readonly onStateChange?: ((state: AudioProviderState) => void) | undefined;
  private readonly strumDelaySeconds: number;

  private bufferCache = new Map<number, AudioBuffer>();
  private playbackCounter = 0;
  private activePlaybacks: ActiveGuitarPlayback[] = [];

  constructor(options: AcousticGuitarProviderOptions = {}) {
    this.audioContext =
      options.audioContext ??
      (typeof AudioContext !== "undefined"
        ? new AudioContext()
        : null);
    this.destinationNode = options.destination;
    this.onStateChange = options.onStateChange;
    this.strumDelaySeconds = options.strumDelaySeconds ?? 0.018;
  }

  get state(): AudioProviderState {
    return this.providerState;
  }

  get audioCtx(): BaseAudioContext | null {
    return this.audioContext;
  }

  get clock(): AudioClock {
    return {
      now: () => {
        if (this.audioContext && typeof this.audioContext.currentTime === "number") {
          return this.audioContext.currentTime;
        }
        return typeof performance !== "undefined" ? performance.now() / 1000 : 0;
      },
    };
  }

  private setProviderState(nextState: AudioProviderState): void {
    if (this.providerState === nextState) return;
    this.providerState = nextState;
    this.onStateChange?.(nextState);
  }

  async prepare(): Promise<void> {
    this.setProviderState("ready");
  }

  private getOrCreateBuffer(pitch: number, velocity: number): AudioBuffer | null {
    if (!this.audioContext) return null;

    const cacheKey = pitch;
    const existing = this.bufferCache.get(cacheKey);
    if (existing) return existing;

    const sampleRate = this.audioContext.sampleRate || 44100;
    const frequency = 440 * Math.pow(2, (pitch - 69) / 12);
    const duration = 2.5;

    const floatData = generateKarplusStrongBuffer(sampleRate, frequency, duration, velocity);

    try {
      const audioBuf = this.audioContext.createBuffer(1, floatData.length, sampleRate);
      audioBuf.getChannelData(0).set(floatData);
      this.bufferCache.set(cacheKey, audioBuf);
      return audioBuf;
    } catch {
      return null;
    }
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    if (this.providerState !== "ready" && this.providerState !== "fallback") {
      throw new Error(`Cannot schedule audio while provider is in state '${this.providerState}'`);
    }

    this.playbackCounter++;
    const playbackId = `guitar-playback-${this.playbackCounter}`;
    const activeRecord: ActiveGuitarPlayback = {
      id: playbackId,
      nodes: [],
      cancelled: false,
    };
    this.activePlaybacks.push(activeRecord);

    if (!this.audioContext || events.length === 0) {
      return {
        id: playbackId,
        cancel: () => {
          activeRecord.cancelled = true;
        },
      };
    }

    const baseTime = clock.now();
    const destination = this.destinationNode ?? this.audioContext.destination;

    // Detect simultaneous chords for authentic guitar strumming displacement
    const sorted = [...events].sort((a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch);

    // Group into clusters of simultaneous notes (chords)
    const clusters: AudioNoteEvent[][] = [];
    let currentCluster: AudioNoteEvent[] = [];
    let clusterStartTime = -1;

    for (const ev of sorted) {
      if (currentCluster.length === 0) {
        currentCluster.push(ev);
        clusterStartTime = ev.startSeconds;
      } else if (Math.abs(ev.startSeconds - clusterStartTime) < 0.04) {
        currentCluster.push(ev);
      } else {
        clusters.push(currentCluster);
        currentCluster = [ev];
        clusterStartTime = ev.startSeconds;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Schedule each cluster
    for (const cluster of clusters) {
      // Sort notes in chord by pitch ascending for downstrum (bass to treble)
      const chordNotes = [...cluster].sort((a, b) => a.pitch - b.pitch);

      chordNotes.forEach((ev, stringIndex) => {
        if (activeRecord.cancelled) return;

        const buffer = this.getOrCreateBuffer(ev.pitch, ev.velocity);
        if (!buffer) return;

        // Apply acoustic strum offset if more than 1 note in chord
        const strumOffset = chordNotes.length > 1 ? stringIndex * this.strumDelaySeconds : 0;
        const noteStartTime = Math.max(0, baseTime + ev.startSeconds + strumOffset);
        const noteDuration = Math.min(ev.durationSeconds, 2.5);

        try {
          const source = this.audioContext!.createBufferSource();
          source.buffer = buffer;

          const gain = this.audioContext!.createGain();
          const noteVelocity = Math.min(1.0, (ev.velocity / 127) * 0.9);
          gain.gain.setValueAtTime(noteVelocity, noteStartTime);
          // Natural string decay envelope
          gain.gain.setValueAtTime(noteVelocity, noteStartTime + noteDuration * 0.7);
          gain.gain.linearRampToValueAtTime(0.001, noteStartTime + noteDuration);

          source.connect(gain);
          gain.connect(destination);

          source.start(noteStartTime);
          source.stop(noteStartTime + noteDuration);

          const nodeRecord: ScheduledGuitarNode = {
            source,
            gain,
            stopTime: noteStartTime + noteDuration,
          };
          activeRecord.nodes.push(nodeRecord);

          source.onended = () => {
            try {
              source.disconnect();
              gain.disconnect();
            } catch {
              // Ignore
            }
          };
        } catch {
          // Ignore scheduling errors on inactive contexts
        }
      });
    }

    return {
      id: playbackId,
      cancel: () => {
        activeRecord.cancelled = true;
        for (const node of activeRecord.nodes) {
          try {
            node.source.stop();
            node.source.disconnect();
            node.gain.disconnect();
          } catch {
            // Ignore
          }
        }
        activeRecord.nodes.length = 0;
      },
    };
  }

  schedulePreview(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    return this.schedule(events, clock);
  }

  stop(_scope?: PlaybackScope): void {
    for (const record of this.activePlaybacks) {
      record.cancelled = true;
      for (const node of record.nodes) {
        try {
          node.source.stop();
          node.source.disconnect();
          node.gain.disconnect();
        } catch {
          // Ignore
        }
      }
      record.nodes.length = 0;
    }
    this.activePlaybacks.length = 0;
  }

  async dispose(): Promise<void> {
    this.stop();
    this.bufferCache.clear();
    this.setProviderState("idle");
  }
}
