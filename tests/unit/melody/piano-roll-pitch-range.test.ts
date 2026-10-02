import { describe, expect, it } from "vitest";
import {
  derivePianoRollPitchBounds,
  requiredPianoRollPitchExpansion,
} from "../../../src/ui/melody/pianoRollPitchRange";

describe("Piano Roll automatic pitch range", () => {
  it("keeps empty and single-pitch melodies compact around tonic or their note", () => {
    expect(derivePianoRollPitchBounds([], 0)).toEqual({ min: 59, max: 61 });
    expect(derivePianoRollPitchBounds([64], 0)).toEqual({ min: 63, max: 65 });
    expect(derivePianoRollPitchBounds([60, 64, 67], 0)).toEqual({ min: 59, max: 68 });
  });

  it("extends for edge drags, honors manual range, and clamps at MIDI limits", () => {
    const base = derivePianoRollPitchBounds([60, 64], 0);
    expect(requiredPianoRollPitchExpansion(80, base, 0)).toBe(2);
    expect(derivePianoRollPitchBounds([60, 64], 0, 0, 2)).toEqual({ min: 35, max: 89 });
    expect(derivePianoRollPitchBounds([0, 127], 0, 2, 0)).toEqual({ min: 0, max: 127 });
  });
});
