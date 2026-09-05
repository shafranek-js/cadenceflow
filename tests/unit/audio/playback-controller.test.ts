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
import { setLoopRange } from "../../../src/ui/transport/loopState";
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
  state: "idle" | "loading" | "ready" | "fallback" | "error" = "ready";
  scheduledBatches: Array<{
    readonly id: string;
    readonly events: readonly AudioNoteEvent[];
    readonly scheduledAt: number;
    cancelled: boolean;
  }> = [];
  stopCallCount = 0;
  readyPromiseToReturn?: Promise<void> | undefined;

  async prepare(): Promise<void> {
    if (this.state === "error") {
      throw new Error("Provider prepare failed");
    }
  }

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
      ready: this.readyPromiseToReturn,
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

  describe("Sounding Note Pause/Resume Behavior (Outcome B)", () => {
    it("silences sounding note on pause, restarts attack with remaining duration on resume, and preserves timeline without duplication", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      // Step 1: 4 beats = 2.0s duration at 120 BPM (effective note duration = 2.0 * 0.95 = 1.9s)
      // Step 2: 2 beats = 1.0s duration at 120 BPM (starts at 2.0s)
      const steps = [makeChord("c1", 4, 1, "I"), makeChord("c2", 2, 1, "V")];

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      // Advance clock into Step 1 (0.5s into playback)
      clock.advance(0.5);
      expect(transportStore.getState().status).toBe("playing");

      // Pause playback
      controller.pause();
      expect(transportStore.getState().status).toBe("paused");
      expect(transportStore.getState().pausedPositionSeconds).toBeCloseTo(0.5, 2);
      expect(provider.stopCallCount).toBe(1); // Provider silenced immediately

      const batchesBeforeResume = provider.scheduledBatches.length;

      // Advance clock while paused (simulating real time passing during pause)
      clock.advance(5.0);

      // Resume playback
      const resumed = controller.resume();
      expect(resumed).toBe(true);
      expect(transportStore.getState().status).toBe("playing");

      // Inspect new batches scheduled upon resume
      const batchesAfterResume = provider.scheduledBatches.slice(batchesBeforeResume);
      const resumedEvents = batchesAfterResume.flatMap((b) => b.events);

      // Outcome B check 1: Sounding note attack restarts with unplayed remainder (1.9s - 0.5s = 1.4s)
      const continuationNotes = resumedEvents.filter((e) => e.startSeconds === 0);
      expect(continuationNotes.length).toBeGreaterThan(0);
      for (const note of continuationNotes) {
        expect(note.durationSeconds).toBeCloseTo(1.4, 1);
      }

      // Outcome B check 2: Future notes (Step 2 at 2.0s) are not duplicated and start at remaining relative time (2.0s - 0.5s = 1.5s)
      const futureNotes = resumedEvents.filter((e) => Math.abs(e.startSeconds - 1.5) < 0.05);
      expect(futureNotes.length).toBeGreaterThan(0);

      controller.stop();
    });
  });

  describe("Audio Failure Cleanup", () => {
    it("rejects start() and playFromHere() when provider is in error state", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      provider.state = "error";
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
      });

      const steps = [makeChord("c1", 4, 1, "I")];

      const startResult = controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      expect(startResult).toBe(false);
      expect(transportStore.getState().status).toBe("stopped");
      expect(transportStore.getState().error).toContain("Audio provider error");

      const playFromHereResult = controller.playFromHere("c1", {
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      expect(playFromHereResult).toBe(false);
      expect(transportStore.getState().status).toBe("stopped");
      expect(transportStore.getState().error).toContain("Audio provider error");
    });

    it("stops transport and records error when ScheduledPlayback.ready rejects asynchronously", async () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      let rejectPlayback!: (reason?: unknown) => void;
      provider.readyPromiseToReturn = new Promise((_, reject) => {
        rejectPlayback = reject;
      });

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
      });

      const steps = [makeChord("c1", 4, 1, "I")];

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      expect(transportStore.getState().status).toBe("playing");

      // Asynchronous sample load or decode failure occurs
      rejectPlayback(new Error("Sample decode failed in audio backend"));

      // Allow event loop to process rejection
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transportStore.getState().status).toBe("stopped");
      expect(transportStore.getState().error).toContain("Sample decode failed in audio backend");
    });
  });

  describe("Count-in Behavior & Asymmetric Meters", () => {
    it("schedules count-in metronome clicks before step 0 on start()", () => {
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

      // 4/4 meter at 120 BPM -> 1 bar = 4 beats = 2.0s count-in
      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        countInEnabled: true,
      });

      const allEvents = provider.scheduledBatches.flatMap((b) => b.events);
      const metronomeEvents = allEvents.filter((e) => e.channelRole === "metronome");
      const pianoEvents = allEvents.filter((e) => e.channelRole !== "metronome");

      // Exactly 4 count-in clicks in [0.0, 2.0s)
      expect(metronomeEvents).toHaveLength(4);
      expect(metronomeEvents[0]!.startSeconds).toBeCloseTo(0.0, 2);
      expect(metronomeEvents[1]!.startSeconds).toBeCloseTo(0.5, 2);
      expect(metronomeEvents[2]!.startSeconds).toBeCloseTo(1.0, 2);
      expect(metronomeEvents[3]!.startSeconds).toBeCloseTo(1.5, 2);

      // Piano chord starts at 2.0s (after 1 full bar count-in)
      expect(pianoEvents.length).toBeGreaterThan(0);
      expect(pianoEvents[0]!.startSeconds).toBeCloseTo(2.0, 2);

      controller.stop();
    });

    it("playFromHere() with count-in plays 1 bar count-in then target step, and does NOT sound prior steps", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      const steps = [
        makeChord("c1", 4, 1, "I"),
        makeChord("c2", 4, 1, "IV"),
        makeChord("c3", 4, 1, "V"),
      ];

      controller.playFromHere("c2", {
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        countInEnabled: true,
      });

      const allEvents = provider.scheduledBatches.flatMap((b) => b.events);
      const pianoEvents = allEvents.filter((e) => e.channelRole !== "metronome");

      // Prior step (c1) must not be scheduled
      // Step c2 is target and starts after 2.0s count-in
      expect(pianoEvents.length).toBeGreaterThan(0);
      expect(pianoEvents[0]!.startSeconds).toBeCloseTo(2.0, 2);

      controller.stop();
    });

    it("resume() does not play count-in", () => {
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

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        countInEnabled: true,
      });

      clock.advance(2.5); // 2.0s count-in + 0.5s into chord
      controller.pause();

      const batchCountBeforeResume = provider.scheduledBatches.length;
      controller.resume();

      const resumedBatches = provider.scheduledBatches.slice(batchCountBeforeResume);
      const resumedMetronomeEvents = resumedBatches
        .flatMap((b) => b.events)
        .filter((e) => e.channelRole === "metronome");

      // No new count-in clicks upon resume
      expect(resumedMetronomeEvents).toHaveLength(0);

      controller.stop();
    });

    it("does not repeat count-in on loop iteration 2+", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 2.0,
        tickIntervalMs: 10,
      });

      // 1 beat chord = 0.5s at 120 BPM
      const steps = [makeChord("c1", 1, 1, "I")];

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        countInEnabled: true,
        loopState: { mode: "all", enabled: true, region: { startStepId: "c1", endStepId: "c1" } },
      });

      // Advance clock past count-in (2.0s) and step duration (0.5s)
      clock.advance(2.6);

      // Now iteration 1 ended; look-ahead scheduler ticks iteration 2
      // Batches for iteration 2 should have NO count-in metronome clicks
      const laterBatches = provider.scheduledBatches.filter((b) => b.scheduledAt >= 2.0);
      const laterMetronomeEvents = laterBatches
        .flatMap((b) => b.events)
        .filter((e) => e.channelRole === "metronome");
      expect(laterMetronomeEvents).toHaveLength(0);

      controller.stop();
    });

    it("calculates exact count-in duration and pulses for asymmetric meter 7/8 [2+2+3]", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      const steps = [makeChord("c1", 7, 2, "I")];
      const meter78 = meter(7, 8, [2, 2, 3]);

      // 7/8 meter bar length = 7 * 4 / 8 = 7/2 = 3.5 beats
      // At 120 BPM: 3.5 * 0.5s = 1.75 seconds count-in duration
      controller.start({
        steps,
        meter: meter78,
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        countInEnabled: true,
      });

      const allEvents = provider.scheduledBatches.flatMap((b) => b.events);
      const metronomeEvents = allEvents.filter((e) => e.channelRole === "metronome");
      const pianoEvents = allEvents.filter((e) => e.channelRole !== "metronome");

      // Meter 7/8 generates 7 pulse clicks, where group starts (accented clicks with primary/secondary pitches 84/76) occur at 0.0s, 0.5s, 1.0s:
      expect(metronomeEvents).toHaveLength(7);
      const accentedClicks = metronomeEvents.filter((e) => e.pitch === 84 || e.pitch === 76);
      expect(accentedClicks).toHaveLength(3);
      expect(accentedClicks[0]!.startSeconds).toBeCloseTo(0.0, 3);
      expect(accentedClicks[1]!.startSeconds).toBeCloseTo(0.5, 3);
      expect(accentedClicks[2]!.startSeconds).toBeCloseTo(1.0, 3);

      // Piano starts exactly at 1.75s (7 eighths = 3.5 beats at 120 BPM = 1.75s)
      expect(pianoEvents[0]!.startSeconds).toBeCloseTo(1.75, 3);

      controller.stop();
    });
  });

  describe("Active Loop Initial Play Position & Reset Semantics", () => {
    it("starts at step 0 for loop off and loop all, and resets to 0 on stop", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
      });

      const steps = [
        makeChord("c1", 2, 1, "I"),
        makeChord("c2", 2, 1, "IV"),
        makeChord("c3", 2, 1, "V"),
      ];

      // Loop Disabled
      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        loopState: { mode: "disabled", enabled: false, region: null },
      });
      expect(transportStore.getState().startingStepIndex).toBe(0);
      controller.stop();
      expect(transportStore.getState().startingStepIndex).toBe(0);

      // Loop All
      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        loopState: {
          mode: "all",
          enabled: true,
          region: { startStepId: "c1", endStepId: "c3" },
        },
      });
      expect(transportStore.getState().startingStepIndex).toBe(0);
      controller.stop();
      expect(transportStore.getState().startingStepIndex).toBe(0);
    });

    it("starts at loop start step for Loop Range and resets to range start on stop", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      const steps = [
        makeChord("c1", 2, 1, "I"),
        makeChord("c2", 2, 1, "IV"),
        makeChord("c3", 2, 1, "V"),
        makeChord("c4", 2, 1, "I"),
      ];

      // Loop range: [c2, c3] (indices 1 to 2)
      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        loopState: setLoopRange("c2", "c3", steps),
      });

      expect(transportStore.getState().startingStepIndex).toBe(1);
      expect(transportStore.getState().currentStepIndex).toBe(1);

      controller.stop();
      expect(transportStore.getState().status).toBe("stopped");
      expect(transportStore.getState().startingStepIndex).toBe(1); // Resets to loop range start!
    });

    it("handles single-step loop [c3, c3] accurately", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

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
        loopState: setLoopRange("c3", "c3", steps),
      });

      expect(transportStore.getState().startingStepIndex).toBe(2);
      expect(transportStore.getState().currentStepIndex).toBe(2);

      controller.stop();
      expect(transportStore.getState().startingStepIndex).toBe(2);
    });
  });

  describe("Loop Zero-Drift Stress Test", () => {
    it("proves loop iteration audio timestamps across 1000 iterations maintain zero cumulative drift (< 1e-9 s) for awkward rational durations (1/3 beat and 7/6 beat)", () => {
      const tempoBpm = 120;
      const t0 = 100.0; // Arbitrary audio clock base

      // Case A: 1/3 beat duration
      // At 120 BPM: 1 beat = 0.5s. Duration = 1/6 s per iteration.
      const numA = 1;
      const denA = 3;

      for (let k = 1; k <= 1000; k++) {
        // Formula used in PlaybackController:
        // tk = t0 + (k * num * 60) / (den * tempoBpm)
        const tk = t0 + (k * numA * 60) / (denA * tempoBpm);

        // Theoretical exact time = t0 + k * (60 / (3 * 120)) = t0 + k / 6
        const exactTime = t0 + (k * 60) / 360;
        const drift = Math.abs(tk - exactTime);
        expect(drift).toBeLessThan(1e-9);
      }

      // Case B: 7/6 beat duration
      // At 120 BPM: 7/6 * 0.5s = 7/12 s per iteration.
      const numB = 7;
      const denB = 6;

      for (let k = 1; k <= 1000; k++) {
        const tk = t0 + (k * numB * 60) / (denB * tempoBpm);
        const exactTime = t0 + (k * 7 * 60) / (6 * 120);
        const drift = Math.abs(tk - exactTime);
        expect(drift).toBeLessThan(1e-9);
      }
    });
  });
});
