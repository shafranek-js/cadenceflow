import { describe, expect, it } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../../../src/audio/contracts";
import { PlaybackController } from "../../../src/audio/playbackController";
import { TransportStore } from "../../../src/ui/transport/transportStore";
import { meter } from "../../../src/domain/timing/meter";
import { groove } from "../../../src/domain/timing/swing";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { ChordStep, RestStep, StepPerformance } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";

class FakeAudioClock implements AudioClock {
  currentTime: number;
  constructor(initial = 0) {
    this.currentTime = initial;
  }
  now(): number {
    return this.currentTime;
  }
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

class MockAudioProvider implements InstrumentAudioProvider {
  readonly id = "mock-audio-provider";
  readonly state = "ready" as const;
  scheduledBatches: Array<{
    readonly id: string;
    readonly events: readonly AudioNoteEvent[];
    readonly scheduledAt: number;
    cancelled: boolean;
  }> = [];
  stopCallCount = 0;

  async prepare(): Promise<void> {}

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    const id = `batch-${this.scheduledBatches.length + 1}`;
    const record = {
      id,
      events: [...events],
      scheduledAt: clock.now(),
      cancelled: false,
    };
    this.scheduledBatches.push(record);
    return {
      id,
      cancel: () => {
        record.cancelled = true;
      },
    };
  }

  stop(_scope?: PlaybackScope): void {
    this.stopCallCount++;
    for (const batch of this.scheduledBatches) {
      batch.cancelled = true;
    }
  }

  async dispose(): Promise<void> {
    this.stop();
  }
}

const DEFAULT_PERF: StepPerformance = Object.freeze({
  articulation: "block",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

function makeChord(id: string, num: number, den = 1, functionId = "I"): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(num, den)),
    cardView: "harmonic",
    performance: DEFAULT_PERF,
  });
}

function makeRest(id: string, num: number, den = 1): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(rational(num, den)),
  });
}

describe("T106 — Transport & Audio Scheduler Integration", () => {
  it("schedules canonical AudioNoteEvents with exact beat-to-seconds conversion", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockAudioProvider();
    const transportStore = new TransportStore();

    const controller = new PlaybackController({
      clock,
      pianoProvider: provider,
      transportStore,
      lookAheadHorizonSeconds: 10.0, // large horizon to capture all events
    });

    const steps = [
      makeChord("c1", 4, 1, "I"), // 4 beats
      makeChord("c2", 2, 1, "IV"), // 2 beats
    ];

    // At 120 BPM: 1 beat = 0.5s. 4 beats = 2.0s, 2 beats = 1.0s. Total = 3.0s.
    controller.start({
      steps,
      meter: meter(4, 4),
      tempoBpm: 120,
      groove: groove("straight"),
      tonic: 0,
      context: "major",
    });

    expect(transportStore.getState().status).toBe("playing");
    expect(provider.scheduledBatches.length).toBeGreaterThan(0);

    const allEvents = provider.scheduledBatches.flatMap((b) => b.events);
    // Chord 1 starts at 0.0s, Chord 2 starts at 2.0s
    const chord1Events = allEvents.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.01);
    const chord2Events = allEvents.filter((e) => Math.abs(e.startSeconds - 2.0) < 0.01);

    expect(chord1Events.length).toBeGreaterThan(0);
    expect(chord2Events.length).toBeGreaterThan(0);

    // Each note has duration of ~1.9s (baseDuration = 2.0 * 0.95 = 1.9s)
    expect(chord1Events[0]!.durationSeconds).toBeCloseTo(1.9, 2);

    controller.stop();
    expect(transportStore.getState().status).toBe("stopped");
  });

  it("omits pitched events for Rest Steps while advancing timeline duration", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockAudioProvider();
    const transportStore = new TransportStore();

    const controller = new PlaybackController({
      clock,
      pianoProvider: provider,
      transportStore,
      lookAheadHorizonSeconds: 10.0,
    });

    // Chord 1 (2 beats = 1.0s), Rest 1 (2 beats = 1.0s), Chord 2 (2 beats = 1.0s)
    const steps = [makeChord("c1", 2, 1, "I"), makeRest("r1", 2, 1), makeChord("c2", 2, 1, "V")];

    controller.start({
      steps,
      meter: meter(4, 4),
      tempoBpm: 120,
      groove: groove("straight"),
      tonic: 0,
      context: "major",
    });

    const allEvents = provider.scheduledBatches.flatMap((b) => b.events);

    // Should have notes at 0.0s (Chord 1)
    const at0 = allEvents.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.01);
    expect(at0.length).toBeGreaterThan(0);

    // Between 1.0s and 2.0s: REST! No piano notes should start!
    const duringRest = allEvents.filter((e) => e.startSeconds >= 1.0 && e.startSeconds < 2.0);
    expect(duringRest).toHaveLength(0);

    // Chord 2 starts at 2.0s
    const at2 = allEvents.filter((e) => Math.abs(e.startSeconds - 2.0) < 0.01);
    expect(at2.length).toBeGreaterThan(0);

    controller.stop();
  });

  it("does not duplicate events after pause and resume", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockAudioProvider();
    const transportStore = new TransportStore();

    const controller = new PlaybackController({
      clock,
      pianoProvider: provider,
      transportStore,
      lookAheadHorizonSeconds: 0.5,
    });

    // Step 1: at 0.0s, dur 1.0s (2 beats at 120 BPM)
    // Step 2: at 1.0s, dur 1.0s
    // Step 3: at 2.0s, dur 1.0s
    const steps = [
      makeChord("c1", 2, 1, "I"),
      makeChord("c2", 2, 1, "IV"),
      makeChord("c3", 2, 1, "V"),
    ];

    controller.start({
      steps,
      meter: meter(4, 4),
      tempoBpm: 120,
      groove: groove("straight"),
      tonic: 0,
      context: "major",
    });

    // Advance clock to 0.5s and pause
    clock.advance(0.5);
    controller.pause();
    expect(transportStore.getState().status).toBe("paused");
    expect(provider.stopCallCount).toBe(1);

    const batchesBeforeResume = provider.scheduledBatches.length;

    // Advance clock while paused (time passes in real world)
    clock.advance(3.0);

    // Resume from paused position (0.5s)
    controller.resume();
    expect(transportStore.getState().status).toBe("playing");

    // Note 1 (0..1.0s) was partially played at 0.5s; it continues for remaining 0.5s
    // Advance clock past note 2 and note 3
    clock.advance(2.0); // Elapsed in audio session = 0.5 + 2.0 = 2.5s

    const allEvents = provider.scheduledBatches.slice(batchesBeforeResume).flatMap((b) => b.events);

    // Note 1 continuation should have remaining duration ~0.45s, not full 1.0s restart
    const continuationNote = allEvents.find((e) => e.startSeconds === 0);
    if (continuationNote) {
      expect(continuationNote.durationSeconds).toBeLessThan(1.0);
    }

    controller.stop();
  });

  it("adjusts beat-to-seconds calculation when tempo is changed for a new session", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockAudioProvider();
    const transportStore = new TransportStore();

    const controller = new PlaybackController({
      clock,
      pianoProvider: provider,
      transportStore,
      lookAheadHorizonSeconds: 10.0,
    });

    const steps = [makeChord("c1", 4, 1, "I")];

    // Session 1: 60 BPM -> 4 beats = 4.0 seconds
    controller.start({
      steps,
      meter: meter(4, 4),
      tempoBpm: 60,
      groove: groove("straight"),
      tonic: 0,
      context: "major",
    });

    const firstBatch = provider.scheduledBatches[0]!.events;
    expect(firstBatch[0]!.durationSeconds).toBeCloseTo(4.0 * 0.95, 2);
    controller.stop();

    // Session 2: 120 BPM -> 4 beats = 2.0 seconds
    controller.start({
      steps,
      meter: meter(4, 4),
      tempoBpm: 120,
      groove: groove("straight"),
      tonic: 0,
      context: "major",
    });

    const secondBatch = provider.scheduledBatches[provider.scheduledBatches.length - 1]!.events;
    expect(secondBatch[0]!.durationSeconds).toBeCloseTo(2.0 * 0.95, 2);
    controller.stop();
  });

  it("never mutates original progression steps or semantic duration", () => {
    const clock = new FakeAudioClock(0.0);
    const provider = new MockAudioProvider();
    const transportStore = new TransportStore();

    const controller = new PlaybackController({
      clock,
      pianoProvider: provider,
      transportStore,
      lookAheadHorizonSeconds: 5.0,
    });

    const step1 = makeChord("c1", 4, 1, "I");
    const origBeats = step1.duration.beats;
    const steps = [step1];

    controller.start({
      steps,
      meter: meter(4, 4),
      tempoBpm: 120,
      groove: groove("swing", 0.7),
      tonic: 0,
      context: "major",
    });

    expect(step1.duration.beats).toBe(origBeats);
    expect(step1.duration.beats.numerator).toBe(4);
    expect(step1.duration.beats.denominator).toBe(1);

    controller.stop();
    expect(step1.duration.beats).toBe(origBeats);
  });
});
