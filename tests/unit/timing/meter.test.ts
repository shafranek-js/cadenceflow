import { describe, expect, it } from "vitest";
import {
  applyMeterChange,
  computeMeterAccents,
  globalTiming,
  meter,
  pulseToBeats,
} from "../../../src/domain/timing/meter";
import { musicalDuration } from "../../../src/domain/timing/duration";
import {
  addRational,
  equalRational,
  rational,
} from "../../../src/domain/timing/rational";
import type { ChordStep, RestStep, StepPerformance } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";

const DEFAULT_TEST_PERFORMANCE: StepPerformance = Object.freeze({
  articulation: "block",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({
    choice: "auto",
    octaveOffset: "auto",
  }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

function createCanonicalChordStep(
  id: string,
  beatsNumerator: number,
  beatsDenominator = 1,
  functionId = "I",
): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId,
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(beatsNumerator, beatsDenominator)),
    cardView: "harmonic",
    performance: DEFAULT_TEST_PERFORMANCE,
  });
}

function createCanonicalRestStep(
  id: string,
  beatsNumerator: number,
  beatsDenominator = 1,
): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(rational(beatsNumerator, beatsDenominator)),
  });
}

describe("T098 — Meter Validation and Beat Projection Contract", () => {
  describe("1. Meter Validation", () => {
    it("accepts valid numerator and denominator combinations", () => {
      const m44 = meter(4, 4);
      expect(m44.numerator).toBe(4);
      expect(m44.denominator).toBe(4);
      expect(m44.grouping).toEqual([4]);

      const m34 = meter(3, 4);
      expect(m34.numerator).toBe(3);
      expect(m34.denominator).toBe(4);
      expect(m34.grouping).toEqual([3]);

      const m68 = meter(6, 8, [3, 3]);
      expect(m68.numerator).toBe(6);
      expect(m68.denominator).toBe(8);
      expect(m68.grouping).toEqual([3, 3]);
    });

    it("requires numerator to be a positive integer", () => {
      expect(() => meter(0, 4)).toThrow(RangeError);
      expect(() => meter(-3, 4)).toThrow(RangeError);
      expect(() => meter(3.5, 4)).toThrow(RangeError);
    });

    it("rejects unsupported denominators outside {1, 2, 4, 8, 16, 32}", () => {
      type Denominator = Parameters<typeof meter>[1];
      expect(() => meter(4, 0 as unknown as Denominator)).toThrow(RangeError);
      expect(() => meter(4, -4 as unknown as Denominator)).toThrow(RangeError);
      expect(() => meter(4, 3 as unknown as Denominator)).toThrow(RangeError);
      expect(() => meter(4, 5 as unknown as Denominator)).toThrow(RangeError);
      expect(() => meter(4, 7 as unknown as Denominator)).toThrow(RangeError);
      expect(() => meter(4, 64 as unknown as Denominator)).toThrow(RangeError);
    });

    it("requires grouping values to be positive integers summing exactly to numerator", () => {
      expect(() => meter(7, 8, [2, 2, 3])).not.toThrow();
      expect(() => meter(7, 8, [3, 2, 2])).not.toThrow();

      // Does not sum to numerator
      expect(() => meter(7, 8, [2, 2, 2])).toThrow(RangeError);
      expect(() => meter(7, 8, [2, 2, 4])).toThrow(RangeError);

      // Non-positive or non-integer values
      expect(() => meter(7, 8, [0, 4, 3])).toThrow(RangeError);
      expect(() => meter(7, 8, [-2, 5, 4])).toThrow(RangeError);
      expect(() => meter(7, 8, [2.5, 2.5, 2])).toThrow(RangeError);
    });

    it("rejects empty grouping arrays", () => {
      expect(() => meter(4, 4, [])).toThrow(RangeError);
      expect(() => meter(7, 8, [])).toThrow(RangeError);
    });

    it("validates global timing configuration", () => {
      const m44 = meter(4, 4);
      const gt = globalTiming(120, m44);
      expect(gt.tempoBpm).toBe(120);
      expect(gt.meter).toBe(m44);

      expect(() => globalTiming(0, m44)).toThrow(RangeError);
      expect(() => globalTiming(-10, m44)).toThrow(RangeError);
      expect(() => globalTiming(Number.NaN, m44)).toThrow(RangeError);
    });
  });

  describe("2. Core Meter Fixtures and Pulses vs Canonical Beats", () => {
    it("defines 7/8 with 2+2+3 asymmetric grouping in eighth-note pulses", () => {
      const m78_223 = meter(7, 8, [2, 2, 3]);
      expect(m78_223.numerator).toBe(7);
      expect(m78_223.denominator).toBe(8);
      expect(m78_223.grouping).toEqual([2, 2, 3]);
      expect(Object.isFrozen(m78_223.grouping)).toBe(true);
    });

    it("defines 7/8 with 3+2+2 asymmetric grouping", () => {
      const m78_322 = meter(7, 8, [3, 2, 2]);
      expect(m78_322.numerator).toBe(7);
      expect(m78_322.denominator).toBe(8);
      expect(m78_322.grouping).toEqual([3, 2, 2]);
    });

    it("defines 4/4 simple quadruple meter", () => {
      const m44 = meter(4, 4, [2, 2]);
      expect(m44.numerator).toBe(4);
      expect(m44.denominator).toBe(4);
      expect(m44.grouping).toEqual([2, 2]);
    });

    it("defines 6/8 compound duple meter", () => {
      const m68 = meter(6, 8, [3, 3]);
      expect(m68.numerator).toBe(6);
      expect(m68.denominator).toBe(8);
      expect(m68.grouping).toEqual([3, 3]);
    });

    it("separates meter pulses (denominator units) from canonical quarter-note beats", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      // 7/8 has 7 eighth-note pulses, but its bar length in canonical beats is 7/2 quarter notes
      // Pulse 0 -> 0 quarter beats
      expect(equalRational(pulseToBeats(0, m78), rational(0, 1))).toBe(true);
      // Pulse 2 (start of group 2) -> 2 * (4/8) = 1 quarter beat
      expect(equalRational(pulseToBeats(2, m78), rational(1, 1))).toBe(true);
      // Pulse 4 (start of group 3) -> 4 * (4/8) = 2 quarter beats
      expect(equalRational(pulseToBeats(4, m78), rational(2, 1))).toBe(true);
      // Pulse 7 (bar end) -> 7 * (4/8) = 7/2 quarter beats
      expect(equalRational(pulseToBeats(7, m78), rational(7, 2))).toBe(true);
    });

    it("rejects invalid pulse indices (negative, beyond numerator, non-integer)", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      expect(() => pulseToBeats(-1, m78)).toThrow(RangeError);
      expect(() => pulseToBeats(8, m78)).toThrow(RangeError);
      expect(() => pulseToBeats(2.5, m78)).toThrow(RangeError);
      expect(() => pulseToBeats(Number.NaN, m78)).toThrow(RangeError);
    });
  });

  describe("3. Beat Accent Projection Contract", () => {
    it("projects accents for 7/8 (2+2+3) with primary at pulse 0 and secondary at pulses 2 and 4", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      const accents = computeMeterAccents(m78);

      expect(accents).toHaveLength(7);
      // Group beginnings in pulse indices: 0 (primary downbeat), 0+2=2 (secondary), 2+2=4 (secondary)
      expect(accents[0].pulseIndex).toBe(0);
      expect(accents[0].accent).toBe("primary");

      expect(accents[1].pulseIndex).toBe(1);
      expect(accents[1].accent).toBe("subdivision");

      expect(accents[2].pulseIndex).toBe(2);
      expect(accents[2].accent).toBe("secondary");

      expect(accents[3].pulseIndex).toBe(3);
      expect(accents[3].accent).toBe("subdivision");

      expect(accents[4].pulseIndex).toBe(4);
      expect(accents[4].accent).toBe("secondary");

      expect(accents[5].pulseIndex).toBe(5);
      expect(accents[5].accent).toBe("subdivision");

      expect(accents[6].pulseIndex).toBe(6);
      expect(accents[6].accent).toBe("subdivision");

      // Verify hierarchical weight ordering without locking arbitrary float constants
      if (accents[0].weight !== undefined) {
        expect(accents[0].weight).toBeGreaterThan(accents[2].weight!);
        expect(accents[2].weight!).toBeGreaterThan(accents[1].weight!);
      }
    });

    it("projects accents for 7/8 (3+2+2) with primary at pulse 0 and secondary at pulses 3 and 5", () => {
      const m78 = meter(7, 8, [3, 2, 2]);
      const accents = computeMeterAccents(m78);

      expect(accents).toHaveLength(7);
      expect(accents[0].pulseIndex).toBe(0);
      expect(accents[0].accent).toBe("primary");

      expect(accents[1].accent).toBe("subdivision");
      expect(accents[2].accent).toBe("subdivision");

      expect(accents[3].pulseIndex).toBe(3);
      expect(accents[3].accent).toBe("secondary");

      expect(accents[4].accent).toBe("subdivision");

      expect(accents[5].pulseIndex).toBe(5);
      expect(accents[5].accent).toBe("secondary");

      expect(accents[6].accent).toBe("subdivision");
    });

    it("projects accents for 4/4 with primary at pulse 0 and secondary at pulse 2", () => {
      const m44 = meter(4, 4, [2, 2]);
      const accents = computeMeterAccents(m44);

      expect(accents).toHaveLength(4);
      expect(accents[0].pulseIndex).toBe(0);
      expect(accents[0].accent).toBe("primary");

      expect(accents[1].pulseIndex).toBe(1);
      expect(accents[1].accent).toBe("subdivision");

      expect(accents[2].pulseIndex).toBe(2);
      expect(accents[2].accent).toBe("secondary");

      expect(accents[3].pulseIndex).toBe(3);
      expect(accents[3].accent).toBe("subdivision");
    });

    it("projects accents for 6/8 compound feel with primary at pulse 0 and secondary at pulse 3", () => {
      const m68 = meter(6, 8, [3, 3]);
      const accents = computeMeterAccents(m68);

      expect(accents).toHaveLength(6);
      expect(accents[0].pulseIndex).toBe(0);
      expect(accents[0].accent).toBe("primary");

      expect(accents[1].accent).toBe("subdivision");
      expect(accents[2].accent).toBe("subdivision");

      expect(accents[3].pulseIndex).toBe(3);
      expect(accents[3].accent).toBe("secondary");

      expect(accents[4].accent).toBe("subdivision");
      expect(accents[5].accent).toBe("subdivision");
    });

    it("produces deterministic output without random variation", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      const first = computeMeterAccents(m78);
      const second = computeMeterAccents(m78);
      expect(first).toEqual(second);
    });
  });

  describe("4. Meter Change Policy: Reflow vs Preserve Beat Lengths", () => {
    const oldMeter44 = meter(4, 4); // 1 bar = 4 canonical beats
    const newMeter34 = meter(3, 4); // 1 bar = 3 canonical beats

    // Multi-step fixture crossing bar boundary in 4/4:
    // Step 1 (s1, chord 'I'): 4 beats (occupies bar 1: [0, 4])
    // Step 2 (s2, rest): 2 beats (occupies first half of bar 2: [4, 6])
    // Step 3 (s3, chord 'IV'): 2 beats (occupies second half of bar 2: [6, 8])
    // Total duration = 8 beats = 2 bars in 4/4.
    function createMultiStepBarFixture() {
      return [
        createCanonicalChordStep("s1", 4, 1, "I"),
        createCanonicalRestStep("s2", 2, 1),
        createCanonicalChordStep("s3", 2, 1, "IV"),
      ];
    }

    it("policy 'reflow': re-expresses step durations so bar boundaries align to new bar length", () => {
      const steps = createMultiStepBarFixture();
      const reflowed = applyMeterChange(steps, oldMeter44, newMeter34, "reflow");

      expect(reflowed).toHaveLength(3);

      // In 3/4 (3 beats/bar):
      // Step 1 (was 1 bar = 4 beats) reflows to 1 bar = 3 beats
      expect(reflowed[0].duration.beats).toEqual(rational(3, 1));
      // Step 2 (was 1/2 bar = 2 beats) reflows to 1/2 bar = 3/2 beats
      expect(reflowed[1].duration.beats).toEqual(rational(3, 2));
      // Step 3 (was 1/2 bar = 2 beats) reflows to 1/2 bar = 3/2 beats
      expect(reflowed[2].duration.beats).toEqual(rational(3, 2));

      // Total duration in 3/4 is 6 beats = exactly 2 bars (bar boundaries align with steps)
      const totalBeats = reflowed.reduce(
        (sum, s) => addRational(sum, s.duration.beats),
        rational(0, 1),
      );
      expect(equalRational(totalBeats, rational(6, 1))).toBe(true);

      // Crucially preserves step identity, order, kind, and non-timing data
      expect(reflowed[0].id).toBe("s1");
      expect(reflowed[0].kind).toBe("chord");
      expect((reflowed[0] as ChordStep).harmonicFunction.functionId).toBe("I");
      expect((reflowed[0] as ChordStep).harmonicVariant).toEqual(EMPTY_HARMONIC_VARIANT);
      expect((reflowed[0] as ChordStep).performance.masterVelocity).toBe(80);

      expect(reflowed[1].id).toBe("s2");
      expect(reflowed[1].kind).toBe("rest");

      expect(reflowed[2].id).toBe("s3");
      expect(reflowed[2].kind).toBe("chord");
      expect((reflowed[2] as ChordStep).harmonicFunction.functionId).toBe("IV");
    });

    it("never mutates input steps array or step objects during meter change", () => {
      const steps = createMultiStepBarFixture();
      const origStep0Duration = steps[0].duration.beats;
      applyMeterChange(steps, oldMeter44, newMeter34, "reflow");
      expect(steps[0].duration.beats).toBe(origStep0Duration);
    });

    it("policy 'preserve-beat-lengths': preserves exact beat count and shifts bar boundaries relative to steps", () => {
      const steps = createMultiStepBarFixture();
      const preserved = applyMeterChange(steps, oldMeter44, newMeter34, "preserve-beat-lengths");

      expect(preserved).toHaveLength(3);

      // Durations remain bit-for-bit identical: 4, 2, 2 beats
      expect(preserved[0].duration.beats).toEqual(rational(4, 1));
      expect(preserved[1].duration.beats).toEqual(rational(2, 1));
      expect(preserved[2].duration.beats).toEqual(rational(2, 1));

      // Total beats remain 8 beats.
      // Under 3/4 (3 beats/bar), 8 beats spans 2 bars and 2/3 of bar 3:
      // Bar 1 boundary is at beat 3 (falling inside Step 1, which ends at beat 4).
      // Bar 2 boundary is at beat 6 (falling at the boundary between Step 2 and Step 3).
      // Thus bar boundaries have shifted relative to the preserved steps!

      // Preserves step identity, order, kind, and harmonic data without mutation
      expect(preserved[0].id).toBe("s1");
      expect(preserved[0].kind).toBe("chord");
      expect((preserved[0] as ChordStep).harmonicFunction.functionId).toBe("I");
      expect((preserved[0] as ChordStep).harmonicVariant).toEqual(EMPTY_HARMONIC_VARIANT);

      expect(preserved[1].id).toBe("s2");
      expect(preserved[1].kind).toBe("rest");

      expect(preserved[2].id).toBe("s3");
      expect(preserved[2].kind).toBe("chord");
      expect((preserved[2] as ChordStep).harmonicFunction.functionId).toBe("IV");
    });
  });
});
