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

  describe("4. Shared Duration Architecture & Canonical Preset Source", () => {
    it("proves single shared preset source contains all 10 presets with matching exact rational beats", async () => {
      const { DURATION_PRESETS, QUICK_DURATION_BUTTON_PRESETS } =
        await import("../../../src/ui/timing/stepDuration");

      expect(DURATION_PRESETS).toHaveLength(10);
      expect(QUICK_DURATION_BUTTON_PRESETS).toHaveLength(5);

      const whole = DURATION_PRESETS.find((p) => p.id === "4/1")!;
      expect(whole.label).toBe("Whole — 4 beats");
      expect(whole.shortLabel).toBe("Whole");
      expect(whole.beats).toEqual(rational(4, 1));
      expect(whole.isQuickButton).toBe(true);

      const half = DURATION_PRESETS.find((p) => p.id === "2/1")!;
      expect(half.label).toBe("Half — 2 beats");
      expect(half.shortLabel).toBe("Half");
      expect(half.beats).toEqual(rational(2, 1));
      expect(half.isQuickButton).toBe(true);

      const quarter = DURATION_PRESETS.find((p) => p.id === "1/1")!;
      expect(quarter.label).toBe("Quarter — 1 beat");
      expect(quarter.beats).toEqual(rational(1, 1));

      const eighth = DURATION_PRESETS.find((p) => p.id === "1/2")!;
      expect(eighth.label).toBe("Eighth — 1/2 beat");
      expect(eighth.beats).toEqual(rational(1, 2));

      const sixteenth = DURATION_PRESETS.find((p) => p.id === "1/4")!;
      expect(sixteenth.label).toBe("Sixteenth — 1/4 beat");
      expect(sixteenth.beats).toEqual(rational(1, 4));

      const quarterTrip = DURATION_PRESETS.find((p) => p.id === "2/3")!;
      expect(quarterTrip.label).toBe("Quarter Triplet — 2/3 beat");
      expect(quarterTrip.beats).toEqual(rational(2, 3));

      const eighthTrip = DURATION_PRESETS.find((p) => p.id === "1/3")!;
      expect(eighthTrip.label).toBe("Eighth Triplet — 1/3 beat");
      expect(eighthTrip.beats).toEqual(rational(1, 3));
    });

    it("formats user-facing labels consistently across all standard values and custom fractions", async () => {
      const { formatDurationDisplayName, formatDurationBeats } =
        await import("../../../src/ui/timing/stepDuration");

      expect(formatDurationDisplayName(musicalDuration(rational(4, 1)))).toBe("Whole — 4 beats");
      expect(formatDurationDisplayName(musicalDuration(rational(2, 1)))).toBe("Half — 2 beats");
      expect(formatDurationDisplayName(musicalDuration(rational(1, 1)))).toBe("Quarter — 1 beat");
      expect(formatDurationDisplayName(musicalDuration(rational(1, 2)))).toBe("Eighth — 1/2 beat");
      expect(formatDurationDisplayName(musicalDuration(rational(2, 3)))).toBe(
        "Quarter Triplet — 2/3 beat",
      );
      expect(formatDurationDisplayName(musicalDuration(rational(1, 3)))).toBe(
        "Eighth Triplet — 1/3 beat",
      );

      // Custom fraction falls back to beats representation
      expect(formatDurationDisplayName(musicalDuration(rational(5, 4)))).toBe("5/4 beats");
      expect(formatDurationBeats(musicalDuration(rational(1, 1)))).toBe("1 beat");
      expect(formatDurationBeats(musicalDuration(rational(2, 1)))).toBe("2 beats");
      expect(formatDurationBeats(musicalDuration(rational(3, 4)))).toBe("3/4 beats");
    });

    it("normalizes custom exact durations 5/4, 2/3, 1/3 and unreduced fractions identically", async () => {
      const { parseCustomDuration } = await import("../../../src/ui/timing/stepDuration");

      const r54 = parseCustomDuration("5/4");
      expect(r54.error).toBeUndefined();
      expect(r54.duration?.beats).toEqual(rational(5, 4));

      const r23 = parseCustomDuration("2/3");
      expect(r23.error).toBeUndefined();
      expect(r23.duration?.beats).toEqual(rational(2, 3));

      const r13 = parseCustomDuration("1/3");
      expect(r13.error).toBeUndefined();
      expect(r13.duration?.beats).toEqual(rational(1, 3));

      // Unreduced fraction normalizes to reduced canonical rational
      const r64 = parseCustomDuration("6/4");
      expect(r64.error).toBeUndefined();
      expect(r64.duration?.beats).toEqual(rational(3, 2));

      const r26 = parseCustomDuration("2/6");
      expect(r26.error).toBeUndefined();
      expect(r26.duration?.beats).toEqual(rational(1, 3));
    });

    it("rejects invalid inputs identically with consistent error strings", async () => {
      const { parseCustomDuration } = await import("../../../src/ui/timing/stepDuration");

      expect(parseCustomDuration("")).toEqual({ error: "Duration cannot be empty" });
      expect(parseCustomDuration("   ")).toEqual({ error: "Duration cannot be empty" });
      expect(parseCustomDuration("1/0")).toEqual({ error: "Invalid format (e.g. 1, 1/2, 3/4)" });
      expect(parseCustomDuration("-1/2")).toEqual({ error: "Invalid format (e.g. 1, 1/2, 3/4)" });
      expect(parseCustomDuration("0")).toEqual({ error: "Invalid format (e.g. 1, 1/2, 3/4)" });
      expect(parseCustomDuration("malformed")).toEqual({
        error: "Invalid format (e.g. 1, 1/2, 3/4)",
      });
      expect(parseCustomDuration("3/4/5")).toEqual({ error: "Invalid format (e.g. 1, 1/2, 3/4)" });
    });
  });
});
