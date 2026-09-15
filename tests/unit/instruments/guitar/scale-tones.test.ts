import { describe, expect, it } from "vitest";
import { resolveGuitarChordVoicing } from "../../../../src/domain/instruments/guitar/voicings";
import { getInPositionScaleTones } from "../../../../src/domain/instruments/guitar/scaleTones";

describe("In-position scale tones overlay", () => {
  it("calculates scale tones within open C major fret window (C Major scale: C D E F G A B)", () => {
    const cVoicing = resolveGuitarChordVoicing({
      rootPitchClass: 0,
      baseQuality: "major",
      spelling: { symbol: "C", root: { step: "C", alter: 0 } },
    });

    // C Major scale pitch classes: [0, 2, 4, 5, 7, 9, 11]
    const cMajorScale = [0, 2, 4, 5, 7, 9, 11];
    const scaleTones = getInPositionScaleTones(cVoicing, cMajorScale);

    expect(scaleTones.length).toBeGreaterThan(0);

    // All scale tone items must have role "scale-tone"
    for (const item of scaleTones) {
      expect(item.role).toBe("scale-tone");
      expect(cMajorScale).toContain(item.pitchClass);
      // Must be within fret span
      expect(item.fret).toBeGreaterThanOrEqual(cVoicing.baseFret);
      expect(item.fret).toBeLessThanOrEqual(cVoicing.baseFret + cVoicing.fretSpan - 1);
      // Must not match chord's active fret on the same string
      expect(item.fret).not.toBe(cVoicing.frets[item.stringIndex]);
    }

    // High E string (index 5) has open E (0) in C chord.
    // In fret 1..4, fret 1 is F (pc 5) and fret 3 is G (pc 7), both in C Major scale.
    const highEScaleTones = scaleTones.filter((it) => it.stringIndex === 5);
    const highEFrets = highEScaleTones.map((it) => it.fret);
    expect(highEFrets).toContain(1); // F
    expect(highEFrets).toContain(3); // G
  });
});
