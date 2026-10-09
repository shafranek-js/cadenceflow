import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIANO_ROLL_PREFERENCES,
  PIANO_ROLL_ZOOM_MAX,
  PIANO_ROLL_ZOOM_MIN,
  PIANO_ROLL_ZOOM_STEP,
  validatePianoRollPreferences,
} from "../../../src/ui/melody/pianoRollPreferences";
import { PIANO_ROLL_SNAPS } from "../../../src/ui/melody/pianoRollProjection";

describe("Piano Roll preferences", () => {
  it("keeps every zoom the slider offers and falls back beyond it", () => {
    // The bounds are shared with the slider, so widening one widens the other. Written out twice, a
    // zoom above the old ceiling silently reverted to the default on reload.
    expect(PIANO_ROLL_ZOOM_MIN).toBeLessThan(DEFAULT_PIANO_ROLL_PREFERENCES.zoom);
    expect(PIANO_ROLL_ZOOM_MAX).toBeGreaterThan(DEFAULT_PIANO_ROLL_PREFERENCES.zoom);
    for (const zoom of [PIANO_ROLL_ZOOM_MIN, 100, 250, PIANO_ROLL_ZOOM_MAX]) {
      expect(
        validatePianoRollPreferences({ ...DEFAULT_PIANO_ROLL_PREFERENCES, zoom }).zoom,
        String(zoom),
      ).toBe(zoom);
    }
    for (const zoom of [
      PIANO_ROLL_ZOOM_MAX + PIANO_ROLL_ZOOM_STEP,
      PIANO_ROLL_ZOOM_MIN - PIANO_ROLL_ZOOM_STEP,
      PIANO_ROLL_ZOOM_MIN + 5,
      Number.NaN,
    ]) {
      expect(
        validatePianoRollPreferences({ ...DEFAULT_PIANO_ROLL_PREFERENCES, zoom }).zoom,
        String(zoom),
      ).toBe(DEFAULT_PIANO_ROLL_PREFERENCES.zoom);
    }
  });

  it("accepts every Snap the control offers", () => {
    // The control, the model and this validation used to hold three separate lists of Snap values, so
    // a value could exist in the model while the control never offered it and this validation would
    // have replaced it with the default — the value was unreachable. One shared list prevents that,
    // and this test fails if a copy is ever reintroduced.
    expect(PIANO_ROLL_SNAPS.length).toBeGreaterThan(0);
    for (const snap of PIANO_ROLL_SNAPS) {
      expect(
        validatePianoRollPreferences({ ...DEFAULT_PIANO_ROLL_PREFERENCES, snap }).snap,
        snap,
      ).toBe(snap);
    }
    expect(new Set(PIANO_ROLL_SNAPS).size).toBe(PIANO_ROLL_SNAPS.length);
  });

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
