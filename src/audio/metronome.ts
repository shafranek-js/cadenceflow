import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "./contracts";
import { computeMeterAccents, pulseToBeats, type Meter } from "../domain/timing/meter";
import { rational, type Rational } from "../domain/timing/rational";

export interface MetronomeClickPitches {
  readonly primary: number;
  readonly secondary: number;
  readonly subdivision: number;
}

export const DEFAULT_METRONOME_PITCHES: MetronomeClickPitches = Object.freeze({
  primary: 84, // C6 - high woodblock / accent
  secondary: 76, // E5 - mid accent
  subdivision: 72, // C5 - low tick
});

export const DEFAULT_METRONOME_VELOCITIES = Object.freeze({
  primary: 100,
  secondary: 80,
  subdivision: 60,
});

/**
 * Calculates one bar length in canonical quarter-note beats for the given meter.
 */
export function getBarLengthBeats(meter: Meter): Rational {
  return rational(meter.numerator * 4, meter.denominator);
}

/**
 * Calculates bar duration in seconds for the given meter and tempo.
 */
export function getBarDurationSeconds(meter: Meter, tempoBpm: number): number {
  if (tempoBpm <= 0) throw new RangeError("tempoBpm must be positive");
  const barBeats = getBarLengthBeats(meter);
  return (barBeats.numerator / barBeats.denominator) * (60 / tempoBpm);
}

/**
 * Generates canonical AudioNoteEvents for a single bar of metronome clicks.
 * Derives accents strictly from computeMeterAccents(meter).
 */
export function generateMetronomeBarEvents(
  meter: Meter,
  tempoBpm: number,
  startSeconds = 0,
  pitches: MetronomeClickPitches = DEFAULT_METRONOME_PITCHES,
): readonly AudioNoteEvent[] {
  if (tempoBpm <= 0) throw new RangeError("tempoBpm must be positive");

  const accents = computeMeterAccents(meter);
  const events: AudioNoteEvent[] = [];
  const secondsPerBeat = 60 / tempoBpm;

  for (const item of accents) {
    const pulseBeats = pulseToBeats(item.pulseIndex, meter);
    const pulseSeconds =
      startSeconds + (pulseBeats.numerator / pulseBeats.denominator) * secondsPerBeat;

    let pitch: number;
    let velocity: number;
    let clickDuration: number;

    if (item.accent === "primary") {
      pitch = pitches.primary;
      velocity = DEFAULT_METRONOME_VELOCITIES.primary;
      clickDuration = 0.04;
    } else if (item.accent === "secondary") {
      pitch = pitches.secondary;
      velocity = DEFAULT_METRONOME_VELOCITIES.secondary;
      clickDuration = 0.035;
    } else {
      pitch = pitches.subdivision;
      velocity = DEFAULT_METRONOME_VELOCITIES.subdivision;
      clickDuration = 0.025;
    }

    events.push({
      pitch,
      startSeconds: pulseSeconds,
      durationSeconds: clickDuration,
      velocity,
      channelRole: "metronome",
    });
  }

  return Object.freeze(events);
}

/**
 * Generates exactly one bar of Count-in metronome clicks preceding playback.
 * Does not mutate progression semantic time.
 */
export function generateCountInEvents(
  meter: Meter,
  tempoBpm: number,
  startSeconds = 0,
): {
  readonly events: readonly AudioNoteEvent[];
  readonly durationSeconds: number;
  readonly durationBeats: Rational;
} {
  const durationSeconds = getBarDurationSeconds(meter, tempoBpm);
  const durationBeats = getBarLengthBeats(meter);
  const events = generateMetronomeBarEvents(meter, tempoBpm, startSeconds);

  return Object.freeze({
    events,
    durationSeconds,
    durationBeats,
  });
}

/**
 * Synthesizes percussive metronome clicks using WebAudio oscillators with rapid exponential decay.
 * Serves as an independent, lightweight click provider for metronome channels.
 */
export class MetronomeClickProvider implements InstrumentAudioProvider {
  readonly id = "metronome-clicks";
  readonly state = "ready" as const;

  private audioContext: AudioContext | null = null;
  private activeNodes: Array<{ stop: () => void }> = [];
  private batchCounter = 0;

  constructor(audioContext?: AudioContext | null) {
    this.audioContext = audioContext ?? null;
  }

  async prepare(): Promise<void> {
    // Synchronous click generator is immediately ready
  }

  schedule(events: readonly AudioNoteEvent[], _clock: AudioClock): ScheduledPlayback {
    const batchId = `metronome-batch-${++this.batchCounter}`;
    const cancellationHandles: Array<() => void> = [];

    if (this.audioContext && this.audioContext.state !== "closed") {
      const currentAudioTime = this.audioContext.currentTime;

      for (const event of events) {
        if (event.channelRole !== "metronome") continue;

        try {
          const osc = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();

          // Frequency mapping for clicks
          const freq = 440 * Math.pow(2, (event.pitch - 69) / 12);
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, currentAudioTime);

          const startTime = currentAudioTime + Math.max(0, event.startSeconds);
          const stopTime = startTime + Math.max(0.01, event.durationSeconds);
          const gainLevel = Math.max(0.01, (event.velocity / 127) * 0.4);

          gain.gain.setValueAtTime(0.0001, startTime);
          gain.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

          osc.connect(gain);
          gain.connect(this.audioContext.destination);

          osc.start(startTime);
          osc.stop(stopTime + 0.01);

          let stopped = false;
          const handle = () => {
            if (!stopped) {
              stopped = true;
              try {
                osc.stop();
                osc.disconnect();
                gain.disconnect();
              } catch {
                // Ignore already stopped
              }
            }
          };

          cancellationHandles.push(handle);
          this.activeNodes.push({ stop: handle });
        } catch {
          // Audio context might be suspended or closed in test
        }
      }
    }

    return {
      id: batchId,
      cancel: () => {
        for (const handle of cancellationHandles) {
          handle();
        }
      },
    };
  }

  stop(_scope?: PlaybackScope): void {
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {
        // Safe stop
      }
    }
    this.activeNodes = [];
  }

  async dispose(): Promise<void> {
    this.stop();
    this.audioContext = null;
  }
}
