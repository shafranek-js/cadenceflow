import { describe, expect, it, vi } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../../../src/audio/contracts";
import { realizeProgressionMelodyPerformance } from "../../../src/audio/melodyPerformance";
import { PlaybackController } from "../../../src/audio/playbackController";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { groove } from "../../../src/domain/timing/swing";
import { rational } from "../../../src/domain/timing/rational";
import { meter } from "../../../src/domain/timing/meter";
import type { ChordStep, StepPerformance } from "../../../src/domain/progression/step";
import { TransportStore } from "../../../src/ui/transport/transportStore";

class FakeClock implements AudioClock {
  constructor(public currentTime = 0) {}
  now(): number {
    return this.currentTime;
  }
}

class RecordingProvider implements InstrumentAudioProvider {
  readonly id: string;
  readonly state = "ready" as const;
  readonly batches: AudioNoteEvent[][] = [];

  constructor(id: string) {
    this.id = id;
  }

  async prepare(): Promise<void> {}

  schedule(events: readonly AudioNoteEvent[], _clock: AudioClock): ScheduledPlayback {
    const batch = [...events];
    this.batches.push(batch);
    return { id: `${this.id}-${this.batches.length}`, cancel: () => undefined };
  }

  stop(_scope?: PlaybackScope): void {}
  async dispose(): Promise<void> {}
}

class ThrowingProvider extends RecordingProvider {
  override schedule(_events: readonly AudioNoteEvent[], _clock: AudioClock): ScheduledPlayback {
    throw new Error("Melody samples unavailable");
  }
}

const PERFORMANCE: StepPerformance = Object.freeze({
  articulation: "block",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

function chord(id: string, functionId: string): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(1)),
    cardView: "harmonic",
    performance: PERFORMANCE,
    melody: Object.freeze({ pattern: "up", grid: "eighth", octaveOffset: 0 }),
  });
}

describe("T173 — Melody playback routing and active event state", () => {
  it("routes Harmony Track Mute/Solo state alongside Melody playback", () => {
    const steps = [chord("only-step", "I")];
    const clock = new FakeClock();
    const piano = new RecordingProvider("piano");
    const melody = new RecordingProvider("melody");
    const transport = new TransportStore();
    const controller = new PlaybackController({
      clock,
      pianoProvider: piano,
      melodyProvider: melody,
      transportStore: transport,
      lookAheadHorizonSeconds: 10,
      tickIntervalMs: 10,
    });

    expect(
      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        harmonyTrack: Object.freeze({
          instrument: "piano",
          muted: true,
          solo: false,
          volume: 100,
        }),
        melodyTrack: Object.freeze({
          instrument: "flute",
          muted: false,
          solo: false,
          volume: 100,
        }),
      }),
    ).toBe(true);

    expect(piano.batches.flat().filter((event) => event.channelRole === "upper")).toHaveLength(0);
    expect(melody.batches.flat().length).toBeGreaterThan(0);
    controller.stop();
  });

  it("realizes full context before Play From Here and tracks half-open active melody keys", () => {
    vi.useFakeTimers();
    try {
      const steps = [chord("first", "I"), chord("second", "IV")];
      const clock = new FakeClock();
      const piano = new RecordingProvider("piano");
      const melody = new RecordingProvider("melody");
      const transport = new TransportStore();
      const controller = new PlaybackController({
        clock,
        pianoProvider: piano,
        melodyProvider: melody,
        transportStore: transport,
        lookAheadHorizonSeconds: 10,
        tickIntervalMs: 10,
      });

      expect(
        controller.playFromHere("second", {
          steps,
          meter: meter(4, 4),
          tempoBpm: 120,
          groove: groove("straight"),
          tonic: 0,
          context: "major",
          melodyTrack: Object.freeze({
            instrument: "flute",
            muted: false,
            solo: false,
            volume: 100,
          }),
        }),
      ).toBe(true);

      const expectedFull = realizeProgressionMelodyPerformance({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm: 120,
        groove: groove("straight"),
        melodyTrack: Object.freeze({
          instrument: "flute",
          muted: false,
          solo: false,
          volume: 100,
        }),
      });
      const melodyEvents = melody.batches.flat();
      expect(melodyEvents.length).toBeGreaterThan(0);
      expect(melodyEvents.every((event) => event.stepIndex === 1)).toBe(true);
      expect(melodyEvents[0]!.eventKey).toBe("second:0");
      expect(melodyEvents[0]!.pitch).toBe(
        expectedFull.events.find((event) => event.stepIndex === 1)!.pitch,
      );

      clock.currentTime = 0.1;
      vi.advanceTimersByTime(40);
      expect(transport.getState().activeMelodyEventKey).toBe("second:0");

      controller.pause();
      expect(transport.getState().activeMelodyEventKey).toBeNull();
      controller.resume();
      vi.advanceTimersByTime(40);
      expect(transport.getState().activeMelodyEventKey).toBe("second:0");

      controller.stop();
      expect(transport.getState().activeMelodyEventKey).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates Melody scheduling failures from Piano and metronome transport", () => {
    const steps = [chord("only-step", "I")];
    const clock = new FakeClock();
    const piano = new RecordingProvider("piano");
    const melody = new ThrowingProvider("melody");
    const metronome = new RecordingProvider("metronome");
    const onMelodyError = vi.fn();
    const transport = new TransportStore();
    const controller = new PlaybackController({
      clock,
      pianoProvider: piano,
      melodyProvider: melody,
      metronomeProvider: metronome,
      onMelodyError,
      transportStore: transport,
      lookAheadHorizonSeconds: 10,
      tickIntervalMs: 10,
    });

    expect(
      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        metronomeEnabled: true,
        melodyTrack: Object.freeze({
          instrument: "flute",
          muted: false,
          solo: false,
          volume: 100,
        }),
      }),
    ).toBe(true);

    expect(piano.batches.flat().some((event) => event.channelRole === "upper")).toBe(true);
    expect(metronome.batches.flat().some((event) => event.channelRole === "metronome")).toBe(true);
    expect(onMelodyError).toHaveBeenCalledWith(expect.any(Error));
    expect(transport.getState().status).toBe("playing");

    controller.stop();
    expect(transport.getState().activeMelodyEventKey).toBeNull();
  });
});
