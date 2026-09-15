import { describe, expect, it } from "vitest";
import {
  GUITAR_STANDARD_TUNING,
  getGuitarPitch,
  getFretPitchClass,
  formatGuitarStringLabel,
} from "../../../../src/domain/instruments/guitar/tuning";

describe("Guitar standard tuning", () => {
  it("defines 6 strings with correct open pitch MIDI numbers and notes", () => {
    expect(GUITAR_STANDARD_TUNING).toHaveLength(6);

    const [lowE, a, d, g, b, highE] = GUITAR_STANDARD_TUNING;
    expect(lowE?.openMidi).toBe(40); // E2
    expect(lowE?.openPitch.spelling).toEqual({ step: "E", alter: 0 });

    expect(a?.openMidi).toBe(45); // A2
    expect(a?.openPitch.spelling).toEqual({ step: "A", alter: 0 });

    expect(d?.openMidi).toBe(50); // D3
    expect(d?.openPitch.spelling).toEqual({ step: "D", alter: 0 });

    expect(g?.openMidi).toBe(55); // G3
    expect(g?.openPitch.spelling).toEqual({ step: "G", alter: 0 });

    expect(b?.openMidi).toBe(59); // B3
    expect(b?.openPitch.spelling).toEqual({ step: "B", alter: 0 });

    expect(highE?.openMidi).toBe(64); // E4
    expect(highE?.openPitch.spelling).toEqual({ step: "E", alter: 0 });
  });

  it("calculates exact pitches and pitch classes on frets correctly", () => {
    // 5th fret of Low E (index 0) is A2 (MIDI 45, PC 9)
    const pitch5thLowE = getGuitarPitch(0, 5);
    expect(pitch5thLowE.midiNumber).toBe(45);
    expect(pitch5thLowE.pitchClassIdentity).toBe(9);
    expect(getFretPitchClass(0, 5)).toBe(9);

    // 12th fret of Low E is E3 (MIDI 52)
    const pitch12thLowE = getGuitarPitch(0, 12);
    expect(pitch12thLowE.midiNumber).toBe(52);
    expect(pitch12thLowE.octave).toBe(3);

    // 1st fret of B string (index 4) is C4 (MIDI 60)
    const pitch1stB = getGuitarPitch(4, 1);
    expect(pitch1stB.midiNumber).toBe(60);
    expect(pitch1stB.pitchClassIdentity).toBe(0);
  });

  it("formats string labels with string number and note name", () => {
    expect(formatGuitarStringLabel(GUITAR_STANDARD_TUNING[0]!)).toBe("6 (E)");
    expect(formatGuitarStringLabel(GUITAR_STANDARD_TUNING[5]!)).toBe("1 (E)");
  });

  it("rejects out-of-range string indices and frets", () => {
    expect(() => getGuitarPitch(-1, 0)).toThrow(RangeError);
    expect(() => getGuitarPitch(6, 0)).toThrow(RangeError);
    expect(() => getGuitarPitch(0, -1)).toThrow(RangeError);
    expect(() => getGuitarPitch(0, 25)).toThrow(RangeError);
  });
});
