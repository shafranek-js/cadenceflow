import { describe, expect, it } from "vitest";
import {
  createProgressionTimeline,
  lookupStepBoundary,
  resolveHarmonicPredecessor,
  validateLoopRegion,
} from "../../../src/domain/timing/timeline";
import { meter } from "../../../src/domain/timing/meter";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { equalRational, rational } from "../../../src/domain/timing/rational";
import type {
  ChordStep,
  ProgressionStep,
  RestStep,
  StepPerformance,
} from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";

const DEFAULT_TEST_PERFORMANCE: StepPerformance = Object.freeze({
  articulation: "block",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

function makeCanonicalChordStep(id: string, num: number, den = 1, functionId = "I"): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(num, den)),
    cardView: "harmonic",
    performance: DEFAULT_TEST_PERFORMANCE,
  });
}

function makeCanonicalRestStep(id: string, num: number, den = 1): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(rational(num, den)),
  });
}

describe("T100 — Progression Timeline and Boundary Contract", () => {
  const m44 = meter(4, 4);

  describe("1. Rational Time Accumulation", () => {
    it("accumulates step start and end times without floating-point drift", () => {
      const steps: ProgressionStep[] = [
        makeCanonicalChordStep("c1", 4, 1, "I"),
        makeCanonicalChordStep("c2", 2, 1, "IV"),
        makeCanonicalChordStep("c3", 2, 1, "V"),
        makeCanonicalChordStep("c4", 4, 1, "I"),
      ];

      const timeline = createProgressionTimeline(steps, m44);

      expect(timeline.steps).toHaveLength(4);

      // Step 0: [0, 4]
      expect(timeline.steps[0].startBeats).toEqual(rational(0, 1));
      expect(timeline.steps[0].endBeats).toEqual(rational(4, 1));
      expect(timeline.steps[0].durationBeats).toEqual(rational(4, 1));
      expect(timeline.steps[0].stepIndex).toBe(0);

      // Step 1: [4, 6]
      expect(timeline.steps[1].startBeats).toEqual(rational(4, 1));
      expect(timeline.steps[1].endBeats).toEqual(rational(6, 1));
      expect(timeline.steps[1].durationBeats).toEqual(rational(2, 1));
      expect(timeline.steps[1].stepIndex).toBe(1);

      // Step 2: [6, 8]
      expect(timeline.steps[2].startBeats).toEqual(rational(6, 1));
      expect(timeline.steps[2].endBeats).toEqual(rational(8, 1));

      // Step 3: [8, 12]
      expect(timeline.steps[3].startBeats).toEqual(rational(8, 1));
      expect(timeline.steps[3].endBeats).toEqual(rational(12, 1));

      // Total beats and bars (12 beats in 4/4 = 3 bars)
      expect(timeline.totalDurationBeats).toEqual(rational(12, 1));
      expect(timeline.totalBars).toEqual(rational(3, 1));
      expect(timeline.meter).toBe(m44);
    });

    it("handles complex fractional beat durations exactly", () => {
      const steps: ProgressionStep[] = [
        makeCanonicalChordStep("s1", 3, 2), // 1.5 beats
        makeCanonicalChordStep("s2", 5, 4), // 1.25 beats
        makeCanonicalChordStep("s3", 1, 4), // 0.25 beats
      ];

      const timeline = createProgressionTimeline(steps, m44);

      // 0 -> 3/2
      expect(timeline.steps[0].startBeats).toEqual(rational(0, 1));
      expect(timeline.steps[0].endBeats).toEqual(rational(3, 2));

      // 3/2 -> 3/2 + 5/4 = 11/4
      expect(timeline.steps[1].startBeats).toEqual(rational(3, 2));
      expect(timeline.steps[1].endBeats).toEqual(rational(11, 4));

      // 11/4 -> 11/4 + 1/4 = 12/4 = 3/1
      expect(timeline.steps[2].startBeats).toEqual(rational(11, 4));
      expect(timeline.steps[2].endBeats).toEqual(rational(3, 1));

      expect(timeline.totalDurationBeats).toEqual(rational(3, 1));
    });

    it("handles an empty progression by returning a zero-duration empty timeline", () => {
      const timeline = createProgressionTimeline([], m44);
      expect(timeline.steps).toHaveLength(0);
      expect(timeline.totalDurationBeats).toEqual(rational(0, 1));
      expect(timeline.totalBars).toEqual(rational(0, 1));
      expect(timeline.meter).toBe(m44);
    });
  });

  describe("2. Rest Step Semantics and Harmonic Predecessor Resolution", () => {
    it("allocates duration to rest steps without generating notes", () => {
      const steps: ProgressionStep[] = [
        makeCanonicalChordStep("c1", 4, 1, "I"),
        makeCanonicalRestStep("r1", 2, 1),
        makeCanonicalChordStep("c2", 2, 1, "V"),
      ];

      const timeline = createProgressionTimeline(steps, m44);

      expect(timeline.steps).toHaveLength(3);

      // Rest step occupies beats 4 to 6
      expect(timeline.steps[1].step.kind).toBe("rest");
      expect(timeline.steps[1].startBeats).toEqual(rational(4, 1));
      expect(timeline.steps[1].endBeats).toEqual(rational(6, 1));

      // Next chord starts exactly at beat 6
      expect(timeline.steps[2].step.kind).toBe("chord");
      expect(timeline.steps[2].startBeats).toEqual(rational(6, 1));
      expect(timeline.steps[2].endBeats).toEqual(rational(8, 1));
    });

    it("resolves harmonic predecessor across single or multiple rest steps to the prior sounding chord", () => {
      // Sequence: c1 ('I') -> rest1 -> rest2 -> c2 ('IV')
      const c1 = makeCanonicalChordStep("c1", 4, 1, "I");
      const r1 = makeCanonicalRestStep("r1", 2, 1);
      const r2 = makeCanonicalRestStep("r2", 2, 1);
      const c2 = makeCanonicalChordStep("c2", 4, 1, "IV");
      const steps: ProgressionStep[] = [c1, r1, r2, c2];

      const timeline = createProgressionTimeline(steps, m44);

      // Step 0 (c1): nothing precedes it
      expect(resolveHarmonicPredecessor(timeline, 0)).toBeUndefined();

      // Step 1 (r1): preceded by c1
      const predForR1 = resolveHarmonicPredecessor(timeline, 1);
      expect(predForR1?.id).toBe("c1");
      expect(predForR1?.harmonicFunction.functionId).toBe("I");

      // Step 2 (r2): still preceded by sounding chord c1 (not r1)
      const predForR2 = resolveHarmonicPredecessor(timeline, 2);
      expect(predForR2?.id).toBe("c1");
      expect(predForR2?.harmonicFunction.functionId).toBe("I");

      // Step 3 (c2): chord after rests resolves predecessor to sounding chord c1 (not r2, not undefined)
      const predForC2 = resolveHarmonicPredecessor(timeline, 3);
      expect(predForC2).toBeDefined();
      expect(predForC2?.id).toBe("c1");
      expect(predForC2?.kind).toBe("chord");
      expect(predForC2?.harmonicFunction.functionId).toBe("I");

      // Rest steps never carry harmonic identity
      expect("harmonicFunction" in r1).toBe(false);
      expect("harmonicFunction" in r2).toBe(false);
    });
  });

  describe("3. Step Boundaries", () => {
    it("returns boundary 0 for index 0 and total duration for index N", () => {
      const steps: ProgressionStep[] = [
        makeCanonicalChordStep("c1", 3, 1),
        makeCanonicalChordStep("c2", 5, 1),
      ];

      const timeline = createProgressionTimeline(steps, m44);

      // Boundary 0 = 0
      expect(lookupStepBoundary(timeline, 0)).toEqual(rational(0, 1));
      // Boundary 1 = 3
      expect(lookupStepBoundary(timeline, 1)).toEqual(rational(3, 1));
      // Boundary 2 (N) = 8 (total)
      expect(lookupStepBoundary(timeline, 2)).toEqual(rational(8, 1));
    });

    it("shares exact boundary between adjacent steps k and k+1", () => {
      const steps: ProgressionStep[] = [
        makeCanonicalChordStep("c1", 2, 3),
        makeCanonicalChordStep("c2", 4, 3),
      ];

      const timeline = createProgressionTimeline(steps, m44);
      const sharedBoundary = lookupStepBoundary(timeline, 1);

      expect(equalRational(sharedBoundary, timeline.steps[0].endBeats)).toBe(true);
      expect(equalRational(sharedBoundary, timeline.steps[1].startBeats)).toBe(true);
    });

    it("throws RangeError for out-of-range or non-integer boundary indices", () => {
      const steps: ProgressionStep[] = [makeCanonicalChordStep("c1", 4, 1)];
      const timeline = createProgressionTimeline(steps, m44);

      expect(() => lookupStepBoundary(timeline, -1)).toThrow(RangeError);
      expect(() => lookupStepBoundary(timeline, 2)).toThrow(RangeError);
      expect(() => lookupStepBoundary(timeline, 0.5)).toThrow(RangeError);
      expect(() => lookupStepBoundary(timeline, Number.NaN)).toThrow(RangeError);
    });
  });

  describe("4. Loop Region Contract (Contiguous Span by Construction)", () => {
    const steps: ProgressionStep[] = [
      makeCanonicalChordStep("s1", 4, 1),
      makeCanonicalChordStep("s2", 4, 1),
      makeCanonicalChordStep("s3", 4, 1),
      makeCanonicalChordStep("s4", 4, 1),
      makeCanonicalChordStep("s5", 4, 1),
    ];

    it("validates full-progression loop region and resolves contiguous range", () => {
      const region = { startStepId: "s1", endStepId: "s5" };
      const resolved = validateLoopRegion(region, steps);

      expect(resolved.startStepIndex).toBe(0);
      expect(resolved.endStepIndex).toBe(4);
      expect(resolved.startBeats).toEqual(rational(0, 1));
      expect(resolved.endBeats).toEqual(rational(20, 1));
      expect(resolved.durationBeats).toEqual(rational(20, 1));
    });

    it("validates single-step loop region", () => {
      const region = { startStepId: "s2", endStepId: "s2" };
      const resolved = validateLoopRegion(region, steps);

      expect(resolved.startStepIndex).toBe(1);
      expect(resolved.endStepIndex).toBe(1);
      expect(resolved.startBeats).toEqual(rational(4, 1));
      expect(resolved.endBeats).toEqual(rational(8, 1));
      expect(resolved.durationBeats).toEqual(rational(4, 1));
    });

    it("includes every intervening step in sequential array order (contiguity invariant)", () => {
      // Range from s2 to s4 includes s2, s3, s4
      const region = { startStepId: "s2", endStepId: "s4" };
      const resolved = validateLoopRegion(region, steps);

      expect(resolved.startStepIndex).toBe(1);
      expect(resolved.endStepIndex).toBe(3);

      const interveningSteps = steps.slice(resolved.startStepIndex, resolved.endStepIndex + 1);
      expect(interveningSteps.map((s) => s.id)).toEqual(["s2", "s3", "s4"]);

      expect(resolved.startBeats).toEqual(rational(4, 1));
      expect(resolved.endBeats).toEqual(rational(16, 1));
      expect(resolved.durationBeats).toEqual(rational(12, 1));
    });

    it("rejects reversed loop region where startStepId appears after endStepId", () => {
      const reversed = { startStepId: "s4", endStepId: "s2" };
      expect(() => validateLoopRegion(reversed, steps)).toThrow();
    });

    it("rejects non-existent step IDs", () => {
      expect(() =>
        validateLoopRegion({ startStepId: "nonexistent", endStepId: "s2" }, steps),
      ).toThrow();
      expect(() =>
        validateLoopRegion({ startStepId: "s1", endStepId: "nonexistent" }, steps),
      ).toThrow();
    });

    it("rejects loop validation on an empty progression", () => {
      expect(() =>
        validateLoopRegion({ startStepId: "s1", endStepId: "s1" }, []),
      ).toThrow();
    });
  });

  describe("5. No-Drift Test (1000 Repeated 1/3-Beat Steps)", () => {
    it("accumulates 1000 steps of 1/3 beat to exact rational 1000/3 without precision drift", () => {
      const count = 1000;
      const steps: ProgressionStep[] = [];
      for (let i = 0; i < count; i++) {
        steps.push(makeCanonicalChordStep(`step-${i}`, 1, 3));
      }

      const timeline = createProgressionTimeline(steps, m44);

      // Total beats must equal exact rational 1000/3 (not 333.3333333333333)
      expect(timeline.totalDurationBeats.numerator).toBe(1000);
      expect(timeline.totalDurationBeats.denominator).toBe(3);
      expect(equalRational(timeline.totalDurationBeats, rational(1000, 3))).toBe(true);

      // Each step i must start at exactly rational(i, 3) and end at rational(i + 1, 3)
      for (let i = 0; i < 10; i++) {
        expect(timeline.steps[i].startBeats).toEqual(rational(i, 3));
        expect(timeline.steps[i].endBeats).toEqual(rational(i + 1, 3));
      }

      const last = timeline.steps[count - 1];
      expect(last.startBeats).toEqual(rational(count - 1, 3));
      expect(last.endBeats).toEqual(rational(count, 3));
    });
  });
});
