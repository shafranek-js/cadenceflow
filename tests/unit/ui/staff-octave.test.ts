import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import type { StepPerformance } from "../../../src/domain/progression/step";
import {
  canShiftPerformanceOctave,
  nextRegisterOffset,
  shiftPitchesByOctave,
} from "../../../src/ui/staff/staffOctave";

describe("Staff octave controls", () => {
  it("moves automatic register offsets within the supported range", () => {
    expect(nextRegisterOffset("auto", 1)).toBe(1);
    expect(nextRegisterOffset("auto", -1)).toBe(-1);
    expect(nextRegisterOffset(1, 1)).toBe(2);
    expect(nextRegisterOffset(2, 1)).toBeNull();
    expect(nextRegisterOffset(-2, -1)).toBeNull();
  });

  it("transposes manual chord pitches by exactly one octave and preserves spelling", () => {
    const pitches = [
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ];
    const shifted = shiftPitchesByOctave(pitches, 1);

    expect(shifted?.map((pitch) => pitch.midiNumber)).toEqual([72, 76, 79]);
    expect(shifted?.map((pitch) => pitch.spelling)).toEqual(pitches.map((pitch) => pitch.spelling));
    expect(pitches.map((pitch) => pitch.midiNumber)).toEqual([60, 64, 67]);
  });

  it("uses MIDI bounds for manual voicing control availability", () => {
    const performance = {
      voicingMode: "manual",
      manualVoicing: [exactPitch(120, { step: "C", alter: 0 })],
    } as StepPerformance;

    expect(canShiftPerformanceOctave(performance, 1)).toBe(false);
    expect(canShiftPerformanceOctave(performance, -1)).toBe(true);
  });
});
