import { describe, expect, it } from "vitest";
import {
  classifyHarmonicNoteRole,
  getScalePitchClasses,
} from "../../../src/domain/harmony/noteRoles";

describe("derived harmonic note roles", () => {
  const context = {
    rootPitchClass: 0,
    chordPitchClasses: [0, 4, 7],
    scalePitchClasses: [0, 2, 4, 5, 7, 9, 11],
    nextChordPitchClasses: [2, 5, 9],
  };

  it("classifies root, chord, scale, and altered tones in precedence order", () => {
    expect(classifyHarmonicNoteRole(0, context)).toEqual({
      primary: "root",
      targetNext: false,
    });
    expect(classifyHarmonicNoteRole(4, context)).toEqual({
      primary: "chord-tone",
      targetNext: false,
    });
    expect(classifyHarmonicNoteRole(2, context)).toEqual({
      primary: "scale-tone",
      targetNext: true,
    });
    expect(classifyHarmonicNoteRole(1, context)).toEqual({
      primary: "altered",
      targetNext: false,
    });
  });

  it("keeps target-next independent of primary role and supports the active key mode", () => {
    expect(classifyHarmonicNoteRole(7, context)).toEqual({
      primary: "chord-tone",
      targetNext: false,
    });
    expect(getScalePitchClasses(9, "major")).toEqual([9, 11, 1, 2, 4, 6, 8]);
    expect(getScalePitchClasses(9, "tonal-minor")).toEqual([9, 11, 0, 2, 4, 5, 7, 8]);
  });
});
