import { describe, expect, it } from "vitest";
import {
  durationDotted,
  durationTriplet,
  formatMusicalDuration,
  musicalDuration,
  parseMusicalDuration,
} from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

describe("T109 — Step Duration UI Semantics & Preset Mappings", () => {
  describe("1. Quick Presets Musical Note-Value to Canonical Beat Mappings", () => {
    // CadenceFlow Canonical Invariant: 1 MusicalDuration beat = 1 quarter-note beat

    it("maps Whole note preset to exactly 4 canonical quarter-note beats (4/1)", () => {
      const whole = musicalDuration(rational(4, 1));
      expect(whole.beats.numerator).toBe(4);
      expect(whole.beats.denominator).toBe(1);
      expect(formatMusicalDuration(whole)).toBe("4");
    });

    it("maps Half note preset to exactly 2 canonical quarter-note beats (2/1)", () => {
      const half = musicalDuration(rational(2, 1));
      expect(half.beats.numerator).toBe(2);
      expect(half.beats.denominator).toBe(1);
      expect(formatMusicalDuration(half)).toBe("2");
    });

    it("maps Quarter note preset to exactly 1 canonical quarter-note beat (1/1)", () => {
      const quarter = musicalDuration(rational(1, 1));
      expect(quarter.beats.numerator).toBe(1);
      expect(quarter.beats.denominator).toBe(1);
      expect(formatMusicalDuration(quarter)).toBe("1");
    });

    it("maps Eighth note preset to exactly 1/2 canonical quarter-note beat (1/2)", () => {
      const eighth = musicalDuration(rational(1, 2));
      expect(eighth.beats.numerator).toBe(1);
      expect(eighth.beats.denominator).toBe(2);
      expect(formatMusicalDuration(eighth)).toBe("1/2");
    });

    it("maps Sixteenth note preset to exactly 1/4 canonical quarter-note beat (1/4)", () => {
      const sixteenth = musicalDuration(rational(1, 4));
      expect(sixteenth.beats.numerator).toBe(1);
      expect(sixteenth.beats.denominator).toBe(4);
      expect(formatMusicalDuration(sixteenth)).toBe("1/4");
    });
  });

  describe("2. Dotted and Triplet Preset Modifiers", () => {
    it("multiplies base duration by 3/2 for dotted preset", () => {
      // Dotted quarter = 1 * 3/2 = 3/2 beats
      const quarter = musicalDuration(rational(1, 1));
      const dottedQuarter = durationDotted(quarter);
      expect(dottedQuarter.beats.numerator).toBe(3);
      expect(dottedQuarter.beats.denominator).toBe(2);
      expect(formatMusicalDuration(dottedQuarter)).toBe("3/2");

      // Dotted half = 2 * 3/2 = 3 beats
      const half = musicalDuration(rational(2, 1));
      const dottedHalf = durationDotted(half);
      expect(dottedHalf.beats.numerator).toBe(3);
      expect(dottedHalf.beats.denominator).toBe(1);
      expect(formatMusicalDuration(dottedHalf)).toBe("3");
    });

    it("multiplies base duration by 2/3 for triplet preset", () => {
      // Triplet on quarter = 1 * 2/3 = 2/3 beats
      const quarter = musicalDuration(rational(1, 1));
      const tripletQuarter = durationTriplet(quarter);
      expect(tripletQuarter.beats.numerator).toBe(2);
      expect(tripletQuarter.beats.denominator).toBe(3);
      expect(formatMusicalDuration(tripletQuarter)).toBe("2/3");

      // Triplet on half = 2 * 2/3 = 4/3 beats
      const half = musicalDuration(rational(2, 1));
      const tripletHalf = durationTriplet(half);
      expect(tripletHalf.beats.numerator).toBe(4);
      expect(tripletHalf.beats.denominator).toBe(3);
      expect(formatMusicalDuration(tripletHalf)).toBe("4/3");
    });
  });

  describe("3. Custom Duration in Canonical Beats", () => {
    it("parses fraction text explicitly in canonical quarter-note beats", () => {
      const d1 = parseMusicalDuration("3/4");
      expect(d1.beats.numerator).toBe(3);
      expect(d1.beats.denominator).toBe(4);

      const d2 = parseMusicalDuration("7/2");
      expect(d2.beats.numerator).toBe(7);
      expect(d2.beats.denominator).toBe(2);

      const d3 = parseMusicalDuration("5");
      expect(d3.beats.numerator).toBe(5);
      expect(d3.beats.denominator).toBe(1);
    });

    it("rejects invalid, zero, or negative duration inputs", () => {
      expect(() => parseMusicalDuration("")).toThrow(RangeError);
      expect(() => parseMusicalDuration("0")).toThrow(RangeError);
      expect(() => parseMusicalDuration("-1/2")).toThrow(RangeError);
      expect(() => parseMusicalDuration("1/0")).toThrow(RangeError);
      expect(() => parseMusicalDuration("3/4/5")).toThrow(RangeError);
      expect(() => parseMusicalDuration("invalid")).toThrow(RangeError);
    });
  });
});
