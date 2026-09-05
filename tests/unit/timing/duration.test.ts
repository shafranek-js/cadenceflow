import { describe, expect, it } from "vitest";
import { addRational, equalRational, rational } from "../../../src/domain/timing/rational";
import {
  barsToBeats,
  beatsToBars,
  durationBars,
  durationDotted,
  durationTriplet,
  formatMusicalDuration,
  musicalDuration,
  parseMusicalDuration,
} from "../../../src/domain/timing/duration";
import { meter } from "../../../src/domain/timing/meter";

describe("T097 — Exact Musical Duration Contract", () => {
  describe("1. Canonical Note Values (1 Beat = One Quarter Note)", () => {
    it("represents standard note values in canonical quarter-note beats", () => {
      // 1 MusicalDuration beat = one quarter-note beat
      const wholeNote = musicalDuration(rational(4, 1));
      const halfNote = musicalDuration(rational(2, 1));
      const quarterNote = musicalDuration(rational(1, 1));
      const eighthNote = musicalDuration(rational(1, 2));
      const sixteenthNote = musicalDuration(rational(1, 4));

      expect(wholeNote.beats).toEqual(rational(4, 1));
      expect(halfNote.beats).toEqual(rational(2, 1));
      expect(quarterNote.beats).toEqual(rational(1, 1));
      expect(eighthNote.beats).toEqual(rational(1, 2));
      expect(sixteenthNote.beats).toEqual(rational(1, 4));

      // Exact mathematical relationships: two eighth notes equal one quarter note
      expect(
        equalRational(addRational(eighthNote.beats, eighthNote.beats), quarterNote.beats),
      ).toBe(true);
      // Two quarter notes equal one half note
      expect(equalRational(addRational(quarterNote.beats, quarterNote.beats), halfNote.beats)).toBe(
        true,
      );
      // Two half notes equal one whole note
      expect(equalRational(addRational(halfNote.beats, halfNote.beats), wholeNote.beats)).toBe(
        true,
      );
    });
  });

  describe("2. Dotted Values (Mathematically Exact: 3/2 * Base)", () => {
    it("transforms a quarter note (1 beat) into exact 3/2 beats (dotted quarter)", () => {
      const quarterNote = musicalDuration(rational(1, 1));
      const dottedQuarter = durationDotted(quarterNote);

      expect(dottedQuarter.beats).toEqual(rational(3, 2));
      expect(equalRational(dottedQuarter.beats, rational(3, 2))).toBe(true);
    });

    it("transforms an eighth note (1/2 beat) into exact 3/4 beat (dotted eighth)", () => {
      const eighthNote = musicalDuration(rational(1, 2));
      const dottedEighth = durationDotted(eighthNote);

      expect(dottedEighth.beats).toEqual(rational(3, 4));
      expect(equalRational(dottedEighth.beats, rational(3, 4))).toBe(true);
    });

    it("transforms a sixteenth note (1/4 beat) into exact 3/8 beat (dotted sixteenth)", () => {
      const sixteenthNote = musicalDuration(rational(1, 4));
      const dottedSixteenth = durationDotted(sixteenthNote);

      expect(dottedSixteenth.beats).toEqual(rational(3, 8));
      expect(equalRational(dottedSixteenth.beats, rational(3, 8))).toBe(true);
    });

    it("transforms a half note (2 beats) into exact 3 beats (dotted half)", () => {
      const halfNote = musicalDuration(rational(2, 1));
      const dottedHalf = durationDotted(halfNote);

      expect(dottedHalf.beats).toEqual(rational(3, 1));
      expect(equalRational(dottedHalf.beats, rational(3, 1))).toBe(true);
    });

    it("preserves exact rational result without decimal precision truncation", () => {
      const base = musicalDuration(rational(1, 3));
      const dotted = durationDotted(base);

      // (1/3) * (3/2) = 1/2
      expect(dotted.beats).toEqual(rational(1, 2));
    });
  });

  describe("3. Tuplets and Triplets (Mathematically Exact: 2/3 * Base)", () => {
    it("computes quarter-note triplet as exact 2/3 beat", () => {
      const quarterNote = musicalDuration(rational(1, 1));
      const triplet = durationTriplet(quarterNote);

      expect(triplet.beats).toEqual(rational(2, 3));

      // Three quarter-note triplets sum to exactly 2 beats (duration of a half note)
      const sum = addRational(triplet.beats, addRational(triplet.beats, triplet.beats));
      expect(sum).toEqual(rational(2, 1));
    });

    it("computes eighth-note triplet as exact 1/3 beat", () => {
      const eighthNote = musicalDuration(rational(1, 2));
      const triplet = durationTriplet(eighthNote);

      expect(triplet.beats).toEqual(rational(1, 3));

      // Three eighth-note triplets sum to exactly 1 beat (duration of a quarter note)
      const sum = addRational(triplet.beats, addRational(triplet.beats, triplet.beats));
      expect(sum).toEqual(rational(1, 1));
      expect(sum.numerator).toBe(1);
      expect(sum.denominator).toBe(1);
    });

    it("never returns floating-point approximations like 0.333333", () => {
      const eighthNote = musicalDuration(rational(1, 2));
      const triplet = durationTriplet(eighthNote);

      expect(typeof triplet.beats.numerator).toBe("number");
      expect(typeof triplet.beats.denominator).toBe("number");
      expect(Number.isInteger(triplet.beats.numerator)).toBe(true);
      expect(Number.isInteger(triplet.beats.denominator)).toBe(true);
      expect(triplet.beats.numerator).toBe(1);
      expect(triplet.beats.denominator).toBe(3);
    });
  });

  describe("4. Bars ↔ Canonical Beats Conversion Across Meters", () => {
    // Formula: barLengthInBeats = numerator * 4 / denominator
    it("converts bars to beats under 4/4 meter (1 bar = 4 * 4 / 4 = 4 beats)", () => {
      const m44 = meter(4, 4);
      expect(barsToBeats(rational(1, 1), m44)).toEqual(rational(4, 1));
      expect(barsToBeats(rational(2, 1), m44)).toEqual(rational(8, 1));
      expect(barsToBeats(rational(1, 2), m44)).toEqual(rational(2, 1));

      expect(beatsToBars(rational(4, 1), m44)).toEqual(rational(1, 1));
      expect(beatsToBars(rational(2, 1), m44)).toEqual(rational(1, 2));
      expect(beatsToBars(rational(3, 1), m44)).toEqual(rational(3, 4));
    });

    it("converts bars to beats under 3/4 meter (1 bar = 3 * 4 / 4 = 3 beats)", () => {
      const m34 = meter(3, 4);
      expect(barsToBeats(rational(1, 1), m34)).toEqual(rational(3, 1));
      expect(barsToBeats(rational(1, 3), m34)).toEqual(rational(1, 1));
      expect(barsToBeats(rational(2, 1), m34)).toEqual(rational(6, 1));

      expect(beatsToBars(rational(3, 1), m34)).toEqual(rational(1, 1));
      expect(beatsToBars(rational(1, 1), m34)).toEqual(rational(1, 3));
      expect(beatsToBars(rational(6, 1), m34)).toEqual(rational(2, 1));
    });

    it("converts bars to beats under compound 6/8 meter (1 bar = 6 * 4 / 8 = 3 beats)", () => {
      const m68 = meter(6, 8, [3, 3]);
      // 1 bar of 6/8 = 6 eighth-notes = 3 quarter-note beats
      expect(barsToBeats(rational(1, 1), m68)).toEqual(rational(3, 1));
      expect(barsToBeats(rational(2, 1), m68)).toEqual(rational(6, 1));
      expect(barsToBeats(rational(1, 2), m68)).toEqual(rational(3, 2));

      expect(beatsToBars(rational(3, 1), m68)).toEqual(rational(1, 1));
      expect(beatsToBars(rational(6, 1), m68)).toEqual(rational(2, 1));
      expect(beatsToBars(rational(3, 2), m68)).toEqual(rational(1, 2));
    });

    it("converts bars to beats under asymmetric 7/8 meter (1 bar = 7 * 4 / 8 = 7/2 beats)", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      // 1 bar of 7/8 = 7 eighth-notes = 7/2 quarter-note beats
      expect(barsToBeats(rational(1, 1), m78)).toEqual(rational(7, 2));
      expect(barsToBeats(rational(2, 1), m78)).toEqual(rational(7, 1));

      expect(beatsToBars(rational(7, 2), m78)).toEqual(rational(1, 1));
      expect(beatsToBars(rational(7, 1), m78)).toEqual(rational(2, 1));
      expect(beatsToBars(rational(1, 1), m78)).toEqual(rational(2, 7));
      expect(beatsToBars(rational(2, 1), m78)).toEqual(rational(4, 7));
    });

    it("creates MusicalDuration from bars and meter with exact rational beats", () => {
      const m44 = meter(4, 4);
      const oneBar44 = durationBars(1, m44);
      expect(oneBar44.beats).toEqual(rational(4, 1));

      const halfBar44 = durationBars(rational(1, 2), m44);
      expect(halfBar44.beats).toEqual(rational(2, 1));

      const m78 = meter(7, 8, [2, 2, 3]);
      const oneBar78 = durationBars(1, m78);
      expect(oneBar78.beats).toEqual(rational(7, 2));
    });
  });

  describe("5. Formatting and Parsing Round-Trip", () => {
    it("round-trips standard note durations", () => {
      for (const frac of [
        rational(4, 1), // whole note
        rational(2, 1), // half note
        rational(1, 1), // quarter note
        rational(1, 2), // eighth note
        rational(1, 4), // sixteenth note
      ]) {
        const input = musicalDuration(frac);
        const formatted = formatMusicalDuration(input);
        const parsed = parseMusicalDuration(formatted);
        expect(equalRational(parsed.beats, frac)).toBe(true);
      }
    });

    it("round-trips dotted and fractional durations", () => {
      for (const frac of [
        rational(3, 2), // dotted quarter
        rational(3, 4), // dotted eighth
        rational(3, 8), // dotted sixteenth
      ]) {
        const input = musicalDuration(frac);
        const formatted = formatMusicalDuration(input);
        const parsed = parseMusicalDuration(formatted);
        expect(equalRational(parsed.beats, frac)).toBe(true);
      }
    });

    it("round-trips triplet durations preserving exact rational value", () => {
      const eighthTriplet = durationTriplet(musicalDuration(rational(1, 2)));
      const formatted = formatMusicalDuration(eighthTriplet);
      const parsed = parseMusicalDuration(formatted);
      expect(equalRational(parsed.beats, rational(1, 3))).toBe(true);
    });
  });

  describe("6. Validation and Error Handling", () => {
    it("rejects non-positive and zero duration", () => {
      expect(() => musicalDuration(rational(0, 1))).toThrow(RangeError);
      expect(() => musicalDuration(rational(-1, 4))).toThrow(RangeError);
    });

    it("rejects negative, zero, fractional, or non-finite numbers in durationBars", () => {
      const m44 = meter(4, 4);
      expect(() => durationBars(-1, m44)).toThrow(RangeError);
      expect(() => durationBars(0, m44)).toThrow(RangeError);
      expect(() => durationBars(0.5, m44)).toThrow(RangeError);
      expect(() => durationBars(1.5, m44)).toThrow(RangeError);
      expect(() => durationBars(Number.NaN, m44)).toThrow(RangeError);
      expect(() => durationBars(Number.POSITIVE_INFINITY, m44)).toThrow(RangeError);
      expect(() => durationBars(rational(-1, 2), m44)).toThrow(RangeError);
    });

    it("rejects malformed string inputs in parseMusicalDuration", () => {
      expect(() => parseMusicalDuration("")).toThrow();
      expect(() => parseMusicalDuration("abc")).toThrow();
      expect(() => parseMusicalDuration("1/0")).toThrow();
      expect(() => parseMusicalDuration("-2/4")).toThrow();
    });

    it("does not silently normalize invalid input into another duration", () => {
      expect(() => parseMusicalDuration("0")).toThrow();
      expect(() => parseMusicalDuration("0/4")).toThrow();
    });
  });
});
