import { describe, expect, it } from "vitest";
import { exactPitch, midiToOctave, normalizePitchClass } from "../../../src/domain/harmony/pitch";

describe("Pitch", () => {
  it("normalizes pitch classes", () => expect(normalizePitchClass(-1)).toBe(11));
  it("uses scientific pitch notation octave numbering", () => expect(midiToOctave(60)).toBe(4));
  it("keeps sounding identity separate from spelling", () => {
    const sharp = exactPitch(66, { step: "F", alter: 1 });
    const flat = exactPitch(66, { step: "G", alter: -1 });
    expect(sharp.pitchClassIdentity).toBe(flat.pitchClassIdentity);
    expect(sharp.spelling).not.toEqual(flat.spelling);
  });
});
