import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIANO_ROLL_PREFERENCES,
  validatePianoRollPreferences,
} from "../../../src/ui/melody/pianoRollPreferences";

describe("Piano Roll preferences", () => {
  it("uses compact first-use defaults and validates stale or malformed values", () => {
    expect(DEFAULT_PIANO_ROLL_PREFERENCES).toMatchObject({
      guidesEnabled: false,
      gridMode: "degrees",
      snap: "1/8",
      zoom: 100,
      pitchRange: 0,
    });
    expect(
      validatePianoRollPreferences({
        guidesEnabled: "yes",
        gridMode: "invalid",
        snap: "1/3",
        zoom: 999,
        pitchRange: -10,
        colorMode: "invalid",
      }),
    ).toEqual(DEFAULT_PIANO_ROLL_PREFERENCES);
    expect(validatePianoRollPreferences({ pitchRange: 3 })).toEqual(DEFAULT_PIANO_ROLL_PREFERENCES);
    expect(validatePianoRollPreferences(null)).toEqual(DEFAULT_PIANO_ROLL_PREFERENCES);
  });

  it("keeps each valid display choice", () => {
    expect(
      validatePianoRollPreferences({
        gridMode: "chromatic",
        paletteMode: "chromatic",
        prospectiveDuration: "1/4",
        prospectiveTriplet: true,
        colorMode: "harmonic-role",
        guidesEnabled: true,
        zoom: 160,
        snap: "1/16 triplet",
        pitchRange: 2,
      }),
    ).toEqual({
      gridMode: "chromatic",
      paletteMode: "chromatic",
      prospectiveDuration: "1/4",
      prospectiveTriplet: true,
      colorMode: "harmonic-role",
      guidesEnabled: true,
      zoom: 160,
      snap: "1/16 triplet",
      pitchRange: 2,
    });
  });
});
