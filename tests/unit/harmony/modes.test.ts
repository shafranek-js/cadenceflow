import { describe, expect, it } from "vitest";
import {
  computeModalChords,
  computeScalePitches,
  getScaleDefinition,
  SCALE_DEFINITIONS,
  CANONICAL_MODAL_FORMULAS,
  getModalParentKeyAndFunction,
} from "../../../src/domain/harmony/modes";

describe("Modes Domain Modeling", () => {
  it("defines all 7 church modes and extended scales", () => {
    expect(SCALE_DEFINITIONS.length).toBeGreaterThanOrEqual(12);
    const dorian = getScaleDefinition("dorian");
    expect(dorian.name).toBe("Dorian");
    expect(dorian.characteristicDegree).toBe(6);
    expect(dorian.characteristicInterval).toBe("♮6");
    expect(dorian.family).toBe("diatonic");

    const lydian = getScaleDefinition("lydian");
    expect(lydian.name).toBe("Lydian");
    expect(lydian.characteristicDegree).toBe(4);
    expect(lydian.characteristicInterval).toBe("♯4");

    const phrygian = getScaleDefinition("phrygian");
    expect(phrygian.name).toBe("Phrygian");
    expect(phrygian.characteristicDegree).toBe(2);
    expect(phrygian.characteristicInterval).toBe("♭2");

    const mixolydian = getScaleDefinition("mixolydian");
    expect(mixolydian.name).toBe("Mixolydian");
    expect(mixolydian.characteristicDegree).toBe(7);
    expect(mixolydian.characteristicInterval).toBe("♭7");
  });

  it("computes D Dorian scale pitches with natural 6th (B)", () => {
    // D is pitch class 2
    const pitches = computeScalePitches(2, "dorian");
    expect(pitches).toHaveLength(7);
    expect(pitches[0]?.spelling).toEqual({ step: "D", alter: 0 }); // 1 = D
    expect(pitches[1]?.spelling).toEqual({ step: "E", alter: 0 }); // 2 = E
    expect(pitches[2]?.spelling).toEqual({ step: "F", alter: 0 }); // 3 = F
    expect(pitches[3]?.spelling).toEqual({ step: "G", alter: 0 }); // 4 = G
    expect(pitches[4]?.spelling).toEqual({ step: "A", alter: 0 }); // 5 = A
    expect(pitches[5]?.spelling).toEqual({ step: "B", alter: 0 }); // 6 = B (characteristic)
    expect(pitches[5]?.isCharacteristic).toBe(true);
    expect(pitches[6]?.spelling).toEqual({ step: "C", alter: 0 }); // 7 = C
  });

  it("computes F Lydian scale pitches with sharp 4th (B)", () => {
    // F is pitch class 5
    const pitches = computeScalePitches(5, "lydian");
    expect(pitches).toHaveLength(7);
    expect(pitches[0]?.spelling).toEqual({ step: "F", alter: 0 });
    expect(pitches[1]?.spelling).toEqual({ step: "G", alter: 0 });
    expect(pitches[2]?.spelling).toEqual({ step: "A", alter: 0 });
    expect(pitches[3]?.spelling).toEqual({ step: "B", alter: 0 }); // Sharp 4 (B natural instead of Bb)
    expect(pitches[3]?.isCharacteristic).toBe(true);
    expect(pitches[4]?.spelling).toEqual({ step: "C", alter: 0 });
  });

  it("derives accurate modal triads and 7th chords for D Dorian", () => {
    const chords = computeModalChords(2, "dorian");
    expect(chords).toHaveLength(7);

    // Degree 1: i7 (Dm7)
    expect(chords[0]?.degree).toBe(1);
    expect(chords[0]?.romanNumeral).toBe("i⁷");
    expect(chords[0]?.chordSymbol).toBe("Dm7");
    expect(chords[0]?.chord.baseQuality).toBe("minor");

    // Degree 2: ii7 (Em7)
    expect(chords[1]?.degree).toBe(2);
    expect(chords[1]?.romanNumeral).toBe("ii⁷");
    expect(chords[1]?.chordSymbol).toBe("Em7");
    // Em contains B (degree 6) -> characteristic!
    expect(chords[1]?.isCharacteristicChord).toBe(true);

    // Degree 4: IV7 (G7) - THE signature major subdominant of Dorian!
    expect(chords[3]?.degree).toBe(4);
    expect(chords[3]?.romanNumeral).toBe("IV⁷");
    expect(chords[3]?.chordSymbol).toBe("G7");
    expect(chords[3]?.chord.baseQuality).toBe("dominant");
    expect(chords[3]?.isCharacteristicChord).toBe(true);

    // Degree 7: ♭VIImaj7 (Cmaj7)
    expect(chords[6]?.degree).toBe(7);
    expect(chords[6]?.romanNumeral).toBe("♭VIImaj⁷");
    expect(chords[6]?.chordSymbol).toBe("Cmaj7");
    expect(chords[6]?.chord.baseQuality).toBe("major");
  });

  it("derives accurate modal chords for E Phrygian", () => {
    // E is pitch class 4
    const chords = computeModalChords(4, "phrygian");
    expect(chords).toHaveLength(7);

    // Degree 1: i (Em)
    expect(chords[0]?.chordSymbol).toBe("Em7");
    expect(chords[0]?.chord.baseQuality).toBe("minor");

    // Degree 2: ♭II (F) - Neapolitan characteristic!
    expect(chords[1]?.romanNumeral).toBe("♭IImaj⁷");
    expect(chords[1]?.chordSymbol).toBe("Fmaj7");
    expect(chords[1]?.chord.baseQuality).toBe("major");
    expect(chords[1]?.isCharacteristicChord).toBe(true);
  });

  it("provides canonical modal cadence formulas", () => {
    expect(CANONICAL_MODAL_FORMULAS.length).toBeGreaterThanOrEqual(10);
    const dorianVamp = CANONICAL_MODAL_FORMULAS.find((f) => f.id === "dorian-funk-vamp");
    expect(dorianVamp).toBeDefined();
    expect(dorianVamp?.steps).toHaveLength(3);
    expect(dorianVamp?.steps[0]?.degree).toBe(1);
    expect(dorianVamp?.steps[1]?.degree).toBe(4);

    const mixoAnthem = CANONICAL_MODAL_FORMULAS.find((f) => f.id === "mixolydian-rock-anthem");
    expect(mixoAnthem).toBeDefined();
    expect(mixoAnthem?.romanProgression).toContain("♭VII");
  });

  it("maps D Dorian modal degrees to parent C Major canonical functions", () => {
    // D is pc 2. In Dorian, parent is C Major (pc 0)
    const deg1 = getModalParentKeyAndFunction(2, "dorian", 1);
    expect(deg1.parentTonic).toBe(0); // C Major
    expect(deg1.functionId).toBe("ii"); // Dm is ii in C

    const deg4 = getModalParentKeyAndFunction(2, "dorian", 4);
    expect(deg4.parentTonic).toBe(0);
    expect(deg4.functionId).toBe("V"); // G is V in C

    const deg7 = getModalParentKeyAndFunction(2, "dorian", 7);
    expect(deg7.parentTonic).toBe(0);
    expect(deg7.functionId).toBe("I"); // C is I in C
  });

  it("derives accurate chords for F Blues scale including blue note passing diminished chord", () => {
    // F is pitch class 5
    const chords = computeModalChords(5, "blues");
    expect(chords).toHaveLength(6);

    // Degree 1: I7 (F7)
    expect(chords[0]?.degree).toBe(1);
    expect(chords[0]?.romanNumeral).toBe("I⁷");
    expect(chords[0]?.chordSymbol).toBe("F7");
    expect(chords[0]?.chord.baseQuality).toBe("dominant");

    // Degree 3: IV7 (Bb7)
    expect(chords[2]?.degree).toBe(3);
    expect(chords[2]?.romanNumeral).toBe("IV⁷");
    expect(chords[2]?.chordSymbol).toBe("Bb7");
    expect(chords[2]?.chord.baseQuality).toBe("dominant");

    // Degree 4: ♭v°7 (B°7) - Blue note passing diminished!
    expect(chords[3]?.degree).toBe(4);
    expect(chords[3]?.romanNumeral).toBe("♭v°⁷");
    expect(chords[3]?.chordSymbol).toBe("B°7");
    expect(chords[3]?.chord.baseQuality).toBe("diminished");
    expect(chords[3]?.isCharacteristicChord).toBe(true);

    // Degree 5: V7 (C7)
    expect(chords[4]?.degree).toBe(5);
    expect(chords[4]?.romanNumeral).toBe("V⁷");
    expect(chords[4]?.chordSymbol).toBe("C7");
    expect(chords[4]?.chord.baseQuality).toBe("dominant");
  });

  it("derives accurate chords for C Major Pentatonic", () => {
    // C is pitch class 0
    const chords = computeModalChords(0, "major-pentatonic");
    expect(chords).toHaveLength(5);
    expect(chords[0]?.chordSymbol).toBe("Cmaj7");
    expect(chords[1]?.chordSymbol).toBe("Dm7");
    expect(chords[2]?.chordSymbol).toBe("Em7");
    expect(chords[3]?.chordSymbol).toBe("G7");
    expect(chords[4]?.chordSymbol).toBe("Am7");
  });
});

