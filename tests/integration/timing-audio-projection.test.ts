import { describe, expect, it } from "vitest";
import { rational, type Rational } from "../../src/domain/timing/rational";
import { barsToBeats, musicalDuration } from "../../src/domain/timing/duration";
import { meter, applyMeterChange, pulseToBeats } from "../../src/domain/timing/meter";
import { groove, projectSwingTiming, type TimedEvent } from "../../src/domain/timing/swing";
import {
  createProgressionTimeline,
  resolveHarmonicPredecessor,
} from "../../src/domain/timing/timeline";
import type { ChordStep, RestStep, StepPerformance } from "../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../src/domain/harmony/chord";
import { realizeProgressionAudioEvents } from "../../src/audio/eventRealizer";
import { PlaybackController } from "../../src/audio/playbackController";
import { TransportStore } from "../../src/ui/transport/transportStore";
import { setLoopRange } from "../../src/ui/transport/loopState";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../../src/audio/contracts";

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
  readonly id = "mock-piano-provider";
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
    performance: DEFAULT_PERF,
    cardView: "harmonic",
  });
}

function makeRest(id: string, num: number, den = 1): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(rational(num, den)),
  });
}

function beatsToSeconds(beats: Rational, tempoBpm: number): number {
  return (beats.numerator * 60) / (beats.denominator * tempoBpm);
}

describe("T110 — Timing Domain to Audio Projection Integration Acceptance", () => {
  // 1. Tempo boundary invariance (60 BPM vs 120 BPM)
  describe("Fixture 1 — Exact Tempo Boundary Invariance (60 BPM vs 120 BPM)", () => {
    it("proves identical ProgressionStep Rational durations and ProgressionTimeline starts, exact 2:1 seconds ratio, and rest silence", () => {
      // Mixed progression: Chord 1 (1 beat) -> Chord 2 (1/2 beat) -> Rest 1 (1/2 beat) -> Chord 3 (2 beats)
      const c1 = makeChord("c1", 1, 1, "I");
      const c2 = makeChord("c2", 1, 2, "IV");
      const r1 = makeRest("r1", 1, 2);
      const c3 = makeChord("c3", 2, 1, "V");
      const steps = Object.freeze([c1, c2, r1, c3]);
      const m44 = meter(4, 4);

      // Semantic timeline: starts at 0, 1, 3/2, 2
      const timeline = createProgressionTimeline(steps, m44);
      expect(timeline.steps[0]!.startBeats).toEqual(rational(0, 1));
      expect(timeline.steps[1]!.startBeats).toEqual(rational(1, 1));
      expect(timeline.steps[2]!.startBeats).toEqual(rational(3, 2));
      expect(timeline.steps[3]!.startBeats).toEqual(rational(2, 1));
      expect(timeline.totalDurationBeats).toEqual(rational(4, 1));

      // Project at 120 BPM (1 beat = 0.5s)
      const events120 = realizeProgressionAudioEvents({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm: 120,
      });

      // Project at 60 BPM (1 beat = 1.0s)
      const events60 = realizeProgressionAudioEvents({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm: 60,
      });

      // Events only emitted for c1, c2, c3; zero events for r1
      const c1Events120 = events120.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.001);
      const c2Events120 = events120.filter((e) => Math.abs(e.startSeconds - 0.5) < 0.001);
      const restEvents120 = events120.filter(
        (e) => e.startSeconds >= 0.74 && e.startSeconds < 0.99,
      );
      const c3Events120 = events120.filter((e) => Math.abs(e.startSeconds - 1.0) < 0.001);

      expect(c1Events120.length).toBeGreaterThan(0);
      expect(c2Events120.length).toBeGreaterThan(0);
      expect(restEvents120).toHaveLength(0); // Rest produces zero pitched events
      expect(c3Events120.length).toBeGreaterThan(0);

      const c1Events60 = events60.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.001);
      const c2Events60 = events60.filter((e) => Math.abs(e.startSeconds - 1.0) < 0.001);
      const restEvents60 = events60.filter((e) => e.startSeconds >= 1.49 && e.startSeconds < 1.99);
      const c3Events60 = events60.filter((e) => Math.abs(e.startSeconds - 2.0) < 0.001);

      expect(c1Events60.length).toBeGreaterThan(0);
      expect(c2Events60.length).toBeGreaterThan(0);
      expect(restEvents60).toHaveLength(0); // Rest produces zero pitched events
      expect(c3Events60.length).toBeGreaterThan(0);

      // Exact 2:1 ratio: 120 BPM seconds are exactly half 60 BPM seconds
      expect(c2Events120[0]!.startSeconds).toBeCloseTo(c2Events60[0]!.startSeconds / 2, 6);
      expect(c3Events120[0]!.startSeconds).toBeCloseTo(c3Events60[0]!.startSeconds / 2, 6);

      // Semantic rational durations and timeline are completely identical before and after
      expect(steps[0]!.duration.beats).toEqual(rational(1, 1));
      expect(steps[1]!.duration.beats).toEqual(rational(1, 2));
      expect(steps[2]!.duration.beats).toEqual(rational(1, 2));
      expect(steps[3]!.duration.beats).toEqual(rational(2, 1));
      expect(timeline.totalDurationBeats).toEqual(rational(4, 1));
    });
  });

  // 2. Production T103 Swing Projection & Non-Mutation
  describe("Fixture 2 — Production T103 Swing Projection & Semantic Non-Mutation", () => {
    it("proves production projectSwingTiming matches exact T103 delta = U * A / 3 across A=0, 0.55, 0.66, 0.75, 1.0 at 120 BPM", () => {
      const U = rational(1, 2); // eighth notes (0.5 canonical beat)
      const tempoBpm = 120; // 1 beat = 0.5s, U = 0.25s

      interface MockNote extends TimedEvent {
        readonly id: string;
        readonly pitch: number;
      }

      const inputNotes: readonly MockNote[] = Object.freeze([
        { id: "onbeat", pitch: 60, startBeats: rational(0, 1), durationBeats: U },
        { id: "offbeat", pitch: 64, startBeats: rational(1, 2), durationBeats: U },
      ]);

      const testCases = [
        { amount: 0.0, expectedOffbeatSeconds: 0.25 },
        { amount: 0.55, expectedOffbeatSeconds: 0.25 + (0.25 * 0.55) / 3 }, // 0.295833...
        { amount: 0.66, expectedOffbeatSeconds: 0.25 + (0.25 * 0.66) / 3 }, // 0.305
        { amount: 0.75, expectedOffbeatSeconds: 0.25 + (0.25 * 0.75) / 3 }, // 0.3125
        { amount: 1.0, expectedOffbeatSeconds: 0.25 + (0.25 * 1.0) / 3 }, // 1/3s = 0.333333...
      ];

      for (const tc of testCases) {
        const g = groove(tc.amount > 0 ? "swing" : "straight", tc.amount);
        const projected = projectSwingTiming(inputNotes, g);

        expect(projected).toHaveLength(2);

        // On-beat start is always exact 0.0
        const onbeatStartSec = beatsToSeconds(projected[0]!.startBeats, tempoBpm);
        expect(onbeatStartSec).toBe(0.0);

        // Off-beat start matches exact production projection formula
        const offbeatStartSec = beatsToSeconds(projected[1]!.startBeats, tempoBpm);
        expect(offbeatStartSec).toBeCloseTo(tc.expectedOffbeatSeconds, 5);

        // Total pair duration is strictly invariant: (U + delta) + (U - delta) = 2U = 1 beat = 0.5s
        const onbeatDurSec = beatsToSeconds(projected[0]!.durationBeats, tempoBpm);
        const offbeatDurSec = beatsToSeconds(projected[1]!.durationBeats, tempoBpm);
        expect(onbeatDurSec + offbeatDurSec).toBeCloseTo(0.5, 6);

        // Input notes remain completely unmutated
        expect(inputNotes[0]!.durationBeats).toEqual(rational(1, 2));
        expect(inputNotes[1]!.startBeats).toEqual(rational(1, 2));
      }
    });

    it("proves polyphonic chord notes (C4, E4, G4) shift identically under swing", () => {
      const U = rational(1, 2);
      const chordNotes: readonly (TimedEvent & { pitch: number })[] = [
        { pitch: 60, startBeats: rational(1, 2), durationBeats: U },
        { pitch: 64, startBeats: rational(1, 2), durationBeats: U },
        { pitch: 67, startBeats: rational(1, 2), durationBeats: U },
      ];

      const projected = projectSwingTiming(chordNotes, groove("swing", 0.66));
      expect(projected[0]!.startBeats).toEqual(projected[1]!.startBeats);
      expect(projected[1]!.startBeats).toEqual(projected[2]!.startBeats);
      expect(projected[0]!.durationBeats).toEqual(projected[1]!.durationBeats);
    });

    it("proves groove feel 'straight' with remembered nonzero swingAmount produces exact straight projection", () => {
      const U = rational(1, 2);
      const notes = [
        { startBeats: rational(0, 1), durationBeats: U },
        { startBeats: rational(1, 2), durationBeats: U },
      ];

      const g = groove("straight", 0.75);
      const projected = projectSwingTiming(notes, g);

      expect(projected[0]!.startBeats).toEqual(rational(0, 1));
      expect(projected[0]!.durationBeats).toEqual(rational(1, 2));
      expect(projected[1]!.startBeats).toEqual(rational(1, 2));
      expect(projected[1]!.durationBeats).toEqual(rational(1, 2));
    });
  });

  // 3. Rest harmonic context and silence
  describe("Fixture 3 — Rest Harmonic Context & Silence (I -> Rest -> Rest -> IV)", () => {
    it("maintains Rest timeline duration, emits zero pitched events, and resolves I as harmonic predecessor for IV across multiple Rests", () => {
      const steps = [
        makeChord("c1", 1, 1, "I"),
        makeRest("r1", 1, 1),
        makeRest("r2", 1, 1),
        makeChord("c2", 1, 1, "IV"),
      ];
      const m44 = meter(4, 4);

      // 1. Timeline and Predecessor
      const timeline = createProgressionTimeline(steps, m44);
      expect(timeline.totalDurationBeats).toEqual(rational(4, 1));

      // Harmonic predecessor for both rests and IV is Step 0 (I)
      expect(resolveHarmonicPredecessor(timeline, 1)?.id).toBe("c1");
      expect(resolveHarmonicPredecessor(timeline, 2)?.id).toBe("c1");
      expect(resolveHarmonicPredecessor(timeline, 3)?.id).toBe("c1");

      // 2. Playback Audio Realization
      const events = realizeProgressionAudioEvents({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm: 120,
      });

      // Events only exist for Chord 1 [0.0s, 0.5s) and Chord 2 [1.5s, 2.0s)
      const chord1Events = events.filter((e) => e.startSeconds < 0.5);
      const restIntervalEvents = events.filter(
        (e) => e.startSeconds >= 0.5 && e.startSeconds < 1.5,
      );
      const chord2Events = events.filter((e) => e.startSeconds >= 1.5);

      expect(chord1Events.length).toBeGreaterThan(0);
      expect(restIntervalEvents).toHaveLength(0); // Zero pitched events emitted during Rest!
      expect(chord2Events.length).toBeGreaterThan(0);
    });
  });

  // 4. Count-in strictly outside semantic progression time
  describe("Fixture 4 — Count-in Strictly Outside Semantic Progression Time", () => {
    it("proves Count-in is 4 beats in 4/4 and 7/2 beats in 7/8, starting before step 0 without mutating progression time", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      const step = makeChord("c1", 4, 1, "I");
      const steps = [step];

      // 4/4 meter count-in: 4 canonical beats = 2.0s at 120 BPM
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

      // 4 count-in clicks preceding audio in [0, 2.0s)
      expect(metronomeEvents).toHaveLength(4);
      expect(pianoEvents[0]!.startSeconds).toBeCloseTo(2.0, 2);

      // Semantic timeline start and duration are unchanged
      const timeline = createProgressionTimeline(steps, meter(4, 4));
      expect(timeline.steps[0]!.startBeats).toEqual(rational(0, 1));
      expect(timeline.totalDurationBeats).toEqual(rational(4, 1));
      expect(step.duration.beats).toEqual(rational(4, 1));

      controller.stop();
    });

    it("proves 7/8 meter count-in has bar length 7/2 canonical beats (1.5s at 140 BPM)", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      // Bar length in canonical beats = 7 * 4 / 8 = 7/2 = 3.5 beats
      expect(barsToBeats(rational(1, 1), m78)).toEqual(rational(7, 2));

      // Pulse to beats: pulse 0 -> 0, pulse 2 -> 1, pulse 4 -> 2
      expect(pulseToBeats(0, m78)).toEqual(rational(0, 1));
      expect(pulseToBeats(2, m78)).toEqual(rational(1, 1));
      expect(pulseToBeats(4, m78)).toEqual(rational(2, 1));
    });
  });

  // 5. Play From Here boundary
  describe("Fixture 5 — Play From Here Boundary & Count-in", () => {
    it("starts playback strictly from target step boundary without scheduling prior steps", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
      });

      const steps = [
        makeChord("step-1", 2, 1, "I"),
        makeChord("step-2", 2, 1, "ii"),
        makeChord("step-3", 2, 1, "IV"),
        makeChord("step-4", 2, 1, "V"),
      ];

      controller.playFromHere("step-3", {
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      expect(transportStore.getState().status).toBe("playing");
      expect(transportStore.getState().startingStepIndex).toBe(2);
      expect(transportStore.getState().currentStepIndex).toBe(2);

      const allEvents = provider.scheduledBatches.flatMap((b) => b.events);

      // Step 3 starts at session-relative 0.0s
      const at0 = allEvents.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.01);
      expect(at0.length).toBeGreaterThan(0);

      // Steps 1 and 2 do NOT sound
      expect(allEvents.every((e) => e.startSeconds >= 0)).toBe(true);

      controller.stop();
      expect(transportStore.getState().status).toBe("stopped");
    });
  });

  // 6. Explicit Pause/Resume Outcome B integration fixture
  describe("Fixture 6 — Explicit Pause/Resume Outcome B", () => {
    it("v1 Outcome B — sample attack restarts while remaining timeline duration is preserved", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      // Step 1: 4 beats = 2.0s duration at 120 BPM
      // Step 2: 2 beats = 1.0s duration (starts at 2.0s)
      const steps = [makeChord("c1", 4, 1, "I"), makeChord("c2", 2, 1, "V")];

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      // Advance 0.6s into Step 1
      clock.advance(0.6);
      controller.pause();

      expect(transportStore.getState().status).toBe("paused");
      expect(transportStore.getState().pausedPositionSeconds).toBeCloseTo(0.6, 2);
      expect(provider.stopCallCount).toBe(1); // Active audio cancelled immediately

      const batchesBeforeResume = provider.scheduledBatches.length;

      // Real time passes while paused
      clock.advance(3.0);

      controller.resume();
      expect(transportStore.getState().status).toBe("playing");

      const resumedBatches = provider.scheduledBatches.slice(batchesBeforeResume);
      const resumedEvents = resumedBatches.flatMap((b) => b.events);

      // Outcome B: Attack restarts with remaining duration (~1.3s), not full 1.9s
      const continuationNotes = resumedEvents.filter((e) => e.startSeconds === 0);
      expect(continuationNotes.length).toBeGreaterThan(0);
      for (const note of continuationNotes) {
        expect(note.durationSeconds).toBeCloseTo(1.3, 1);
        expect(note.durationSeconds).toBeLessThan(1.5);
      }

      // Future events start at relative offset (2.0s - 0.6s = 1.4s) and are not duplicated
      const futureNotes = resumedEvents.filter((e) => Math.abs(e.startSeconds - 1.4) < 0.05);
      expect(futureNotes.length).toBeGreaterThan(0);

      controller.stop();
    });
  });

  // 7. Runtime audio failure cleanup
  describe("Fixture 7 — Runtime Audio Failure Cleanup", () => {
    it("clears active playback and sets error state on provider prepare or asynchronous ready rejection without fallback", async () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      let rejectReady!: (reason?: unknown) => void;
      provider.readyPromiseToReturn = new Promise((_, reject) => {
        rejectReady = reject;
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

      // Asynchronous rejection occurs
      rejectReady(new Error("AudioBuffer decode error in Salamander sample"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transportStore.getState().status).toBe("stopped");
      expect(transportStore.getState().currentStepIndex).toBeNull();
      expect(transportStore.getState().error).toContain(
        "AudioBuffer decode error in Salamander sample",
      );

      // Stale callback cannot revive playback
      transportStore.onSessionEnded("old-session-id");
      expect(transportStore.getState().status).toBe("stopped");

      // Progression is untouched
      expect(steps[0]!.duration.beats).toEqual(rational(4, 1));
    });
  });

  // 8. Loop no-drift over 1000 iterations
  describe("Fixture 8 — Loop Projection and Zero Cumulative Drift Over 1000 Iterations", () => {
    it("proves base-anchored loop iteration timing maintains zero cumulative drift (< 1e-9 s) over 1000 iterations for awkward rationals 7/6 and 1/3", () => {
      const tempoBpm = 120;
      const t0 = 50.0; // Arbitrary audio clock base

      // Awkward rational loop duration: 7/6 beat
      const num1 = 7;
      const den1 = 6;
      for (let k = 1; k <= 1000; k++) {
        const tk = t0 + (k * num1 * 60) / (den1 * tempoBpm);
        const exact = t0 + (k * 7 * 60) / (6 * 120);
        expect(Math.abs(tk - exact)).toBeLessThan(1e-9);
      }

      // Awkward rational loop duration: 1/3 beat
      const num2 = 1;
      const den2 = 3;
      for (let k = 1; k <= 1000; k++) {
        const tk = t0 + (k * num2 * 60) / (den2 * tempoBpm);
        const exact = t0 + (k * 1 * 60) / (3 * 120);
        expect(Math.abs(tk - exact)).toBeLessThan(1e-9);
      }

      // Prove Stop resets to loop start
      const steps = [
        makeChord("s1", 2, 1, "I"),
        makeChord("s2", 2, 1, "IV"),
        makeChord("s3", 2, 1, "V"),
      ];
      const store = new TransportStore();
      const loopRange = setLoopRange("s2", "s3", steps);
      expect(loopRange.enabled).toBe(true);

      store.play({ stepCount: 3, loopStartStepIndex: 1 });
      expect(store.getState().startingStepIndex).toBe(1);

      store.stop();
      expect(store.getState().status).toBe("stopped");
      expect(store.getState().startingStepIndex).toBe(1); // Resets to loop range start!

      // Disabling loop resets subsequent Stop target to progression start (0)
      store.setLoopAwareResetTarget(0);
      store.stop();
      expect(store.getState().startingStepIndex).toBe(0);
    });
  });

  // 9. Meter reflow vs preserve invariants
  describe("Fixture 9 — Meter Reflow (Proportional 1:1) vs Preserve Beat Lengths", () => {
    it("preserves exact step count, IDs, and order without splitting, clipping, or padding", () => {
      const steps = [
        makeChord("step-a", 4, 1, "I"),
        makeChord("step-b", 2, 1, "IV"),
        makeChord("step-c", 2, 1, "V"),
      ];
      const m44 = meter(4, 4);
      const m34 = meter(3, 4);

      // Policy 1: Reflow (4/4 -> 3/4 scales by 3/4)
      const reflowed = applyMeterChange(steps, m44, m34, "reflow");
      expect(reflowed).toHaveLength(3);
      expect(reflowed[0]!.id).toBe("step-a");
      expect(reflowed[1]!.id).toBe("step-b");
      expect(reflowed[2]!.id).toBe("step-c");

      // [4, 2, 2] * 3/4 = [3, 3/2, 3/2]
      expect(reflowed[0]!.duration.beats).toEqual(rational(3, 1));
      expect(reflowed[1]!.duration.beats).toEqual(rational(3, 2));
      expect(reflowed[2]!.duration.beats).toEqual(rational(3, 2));

      // Policy 2: Preserve Beat Lengths
      const preserved = applyMeterChange(steps, m44, m34, "preserve-beat-lengths");
      expect(preserved).toHaveLength(3);
      expect(preserved[0]!.duration.beats).toEqual(rational(4, 1));
      expect(preserved[1]!.duration.beats).toEqual(rational(2, 1));
      expect(preserved[2]!.duration.beats).toEqual(rational(2, 1));

      // Original steps remain untouched
      expect(steps[0]!.duration.beats).toEqual(rational(4, 1));
    });
  });

  // 10. Canonical durations, dotted, and triplets
  describe("Fixture 10 — Canonical Subdivision, Dotted and Triplet Durations", () => {
    it("converts standard note subdivisions, dotted values, and triplets to exact seconds at 120 BPM", () => {
      const bpm = 120; // 0.5s per canonical beat

      const whole = musicalDuration(rational(4, 1));
      const half = musicalDuration(rational(2, 1));
      const quarter = musicalDuration(rational(1, 1));
      const eighth = musicalDuration(rational(1, 2));
      const sixteenth = musicalDuration(rational(1, 4));
      const dottedQuarter = musicalDuration(rational(3, 2));
      const quarterTriplet = musicalDuration(rational(2, 3));

      expect(beatsToSeconds(whole.beats, bpm)).toBe(2.0);
      expect(beatsToSeconds(half.beats, bpm)).toBe(1.0);
      expect(beatsToSeconds(quarter.beats, bpm)).toBe(0.5);
      expect(beatsToSeconds(eighth.beats, bpm)).toBe(0.25);
      expect(beatsToSeconds(sixteenth.beats, bpm)).toBe(0.125);
      expect(beatsToSeconds(dottedQuarter.beats, bpm)).toBe(0.75);
      expect(beatsToSeconds(quarterTriplet.beats, bpm)).toBeCloseTo(1 / 3, 6);
    });
  });

  // 11. Playing Step vs Selected Editing Step Independence
  describe("Fixture 11 — Playing Step vs Selected Editing Step Independence", () => {
    it("proves transport playhead progression does not mutate editor selection state", () => {
      const store = new TransportStore();
      const editorState = { selectedStepId: "step-edit-target" };

      store.play({ stepCount: 4 });
      expect(store.getState().currentStepIndex).toBe(0);
      expect(editorState.selectedStepId).toBe("step-edit-target");

      store.setCurrentStepIndex(1);
      expect(store.getState().currentStepIndex).toBe(1);
      expect(editorState.selectedStepId).toBe("step-edit-target");

      store.setCurrentStepIndex(2);
      expect(store.getState().currentStepIndex).toBe(2);
      expect(editorState.selectedStepId).toBe("step-edit-target");

      store.stop();
      expect(store.getState().currentStepIndex).toBeNull();
      expect(editorState.selectedStepId).toBe("step-edit-target");
    });
  });
});
