import { describe, expect, it } from "vitest";
import {
  pitchToGuitarTabPosition,
  resolveGuitarTabEntry,
} from "../../../../src/domain/instruments/guitar/tablature";
import type { ChordDefinition } from "../../../../src/domain/harmony/chord";

const cMajorChord: ChordDefinition = {
  rootPitchClass: 0,
  baseQuality: "major",
  variant: {
    extensions: [],
    suspensions: [],
    alterations: [],
  },
  spelling: {
    symbol: "C",
    root: { step: "C", alter: 0 },
  },
  harmonicFunction: {
    functionId: "I",
    moduleId: "progressions",
    category: "core",
  },
};

const g7Chord: ChordDefinition = {
  rootPitchClass: 7,
  baseQuality: "dominant",
  variant: {
    seventh: "minor7",
    extensions: [],
    suspensions: [],
    alterations: [],
  },
  spelling: {
    symbol: "G7",
    root: { step: "G", alter: 0 },
  },
  harmonicFunction: {
    functionId: "V7",
    moduleId: "progressions",
    category: "core",
  },
};

describe("resolveGuitarTabEntry", () => {
  it("retains an explicit unsupported fingering result for an overfull extension chord", () => {
    const tab = resolveGuitarTabEntry({
      ...cMajorChord,
      variant: {
        seventh: "minor7",
        extensions: [9, 11, 13],
        suspensions: [],
        alterations: [],
      },
    });

    expect(tab.voicing.unsupportedReason).toMatch(/six strings/i);
    expect(tab.voicing.pitches).toEqual([]);
    expect(tab.fretSummary).toBe("x x x x x x");
  });

  it("resolves C major chord into 6 strings tablature with proper frets and mute states", () => {
    const tab = resolveGuitarTabEntry(cMajorChord);

    expect(tab.chordSymbol).toBe("C");
    expect(tab.strings).toHaveLength(6);

    // Strings are ordered 1 (high e) to 6 (low E)
    expect(tab.strings[0]!.stringNumber).toBe(1);
    expect(tab.strings[0]!.stringName).toBe("e");
    expect(tab.strings[0]!.fret).toBe(0); // open high e
    expect(tab.strings[0]!.isOpen).toBe(true);

    expect(tab.strings[1]!.stringNumber).toBe(2);
    expect(tab.strings[1]!.stringName).toBe("B");
    expect(tab.strings[1]!.fret).toBe(1); // 1st fret on B

    expect(tab.strings[2]!.stringNumber).toBe(3);
    expect(tab.strings[2]!.stringName).toBe("G");
    expect(tab.strings[2]!.fret).toBe(0); // open G

    expect(tab.strings[3]!.stringNumber).toBe(4);
    expect(tab.strings[3]!.stringName).toBe("D");
    expect(tab.strings[3]!.fret).toBe(2); // 2nd fret on D

    expect(tab.strings[4]!.stringNumber).toBe(5);
    expect(tab.strings[4]!.stringName).toBe("A");
    expect(tab.strings[4]!.fret).toBe(3); // 3rd fret on A

    expect(tab.strings[5]!.stringNumber).toBe(6);
    expect(tab.strings[5]!.stringName).toBe("E");
    expect(tab.strings[5]!.fret).toBe(-1); // muted low E
    expect(tab.strings[5]!.isMuted).toBe(true);
    expect(tab.strings[5]!.fretLabel).toBe("x");
  });

  it("resolves dominant 7th chord correctly", () => {
    const tab = resolveGuitarTabEntry(g7Chord);
    expect(tab.chordSymbol).toBe("G7");
    expect(tab.strings[0]!.fret).toBe(1); // 1st fret on high e
    expect(tab.strings[5]!.fret).toBe(3); // 3rd fret on low E
  });

  it("supports custom chord label override", () => {
    const tab = resolveGuitarTabEntry(cMajorChord, "C maj");
    expect(tab.chordSymbol).toBe("C maj");
  });

  it("resolves slash chords with explicit bass pitch class", () => {
    // C/E (root C = 0, bass E = 4) -> low E open (fret 0 on string 6)
    const cOverE = resolveGuitarTabEntry(cMajorChord, "C/E", 4);
    expect(cOverE.strings[5]!.fret).toBe(0); // 6th string low E open
    expect(cOverE.strings[4]!.fret).toBe(3); // 5th string C
    expect(cOverE.strings[3]!.fret).toBe(2); // 4th string E
    expect(cOverE.strings[2]!.fret).toBe(0); // 3rd string G
    expect(cOverE.strings[1]!.fret).toBe(1); // 2nd string C
    expect(cOverE.strings[0]!.fret).toBe(0); // 1st string E

    // G/B (root G = 7, bass B = 11) -> 5th string fret 2
    const gOverB = resolveGuitarTabEntry(g7Chord, "G/B", 11);
    expect(gOverB.strings[4]!.fret).toBe(2); // 5th string B
    expect(gOverB.strings[5]!.isMuted).toBe(true); // 6th string muted
  });
});

describe("pitchToGuitarTabPosition", () => {
  it("maps melody pitches to upper strings and comfortable frets", () => {
    // E4 (MIDI 64) -> high e string 1 fret 0 (open string: finger 0)
    const e4 = pitchToGuitarTabPosition(64, "melody");
    expect(e4).toMatchObject({ str: 1, fret: 0, finger: 0 });

    // G4 (MIDI 67) -> high e string 1 fret 3 (finger 3)
    const g4 = pitchToGuitarTabPosition(67, "melody");
    expect(g4).toMatchObject({ str: 1, fret: 3, finger: 3 });

    // C5 (MIDI 72) -> high e string 1 fret 8
    const c5 = pitchToGuitarTabPosition(72, "melody");
    expect(c5).toMatchObject({ str: 1, fret: 8, finger: 4 });

    // C4 (MIDI 60) -> B string 2 fret 1 (finger 1)
    const c4 = pitchToGuitarTabPosition(60, "melody");
    expect(c4).toMatchObject({ str: 2, fret: 1, finger: 1 });

    // D4 (MIDI 62) -> B string 2 fret 3 (finger 3)
    const d4 = pitchToGuitarTabPosition(62, "melody");
    expect(d4).toMatchObject({ str: 2, fret: 3, finger: 3 });

    // G3 (MIDI 55) -> G string 3 fret 0 (open string: finger 0)
    const g3 = pitchToGuitarTabPosition(55, "melody");
    expect(g3).toMatchObject({ str: 3, fret: 0, finger: 0 });

    // A3 (MIDI 57) -> G string 3 fret 2 (finger 2)
    const a3 = pitchToGuitarTabPosition(57, "melody");
    expect(a3).toMatchObject({ str: 3, fret: 2, finger: 2 });
  });

  it("maps bass pitches to lower strings", () => {
    // E2 (MIDI 40) -> string 6 fret 0 (open string: finger 0)
    const e2 = pitchToGuitarTabPosition(40, "bass");
    expect(e2).toMatchObject({ str: 6, fret: 0, finger: 0 });

    // G2 (MIDI 43) -> string 6 fret 3
    const g2 = pitchToGuitarTabPosition(43, "bass");
    expect(g2).toMatchObject({ str: 6, fret: 3, finger: 3 });

    // A2 (MIDI 45) -> string 5 fret 0 (open string: finger 0)
    const a2 = pitchToGuitarTabPosition(45, "bass");
    expect(a2).toMatchObject({ str: 5, fret: 0, finger: 0 });

    // C3 (MIDI 48) -> string 5 fret 3
    const c3 = pitchToGuitarTabPosition(48, "bass");
    expect(c3).toMatchObject({ str: 5, fret: 3, finger: 3 });

    // D3 (MIDI 50) -> string 4 fret 0 (open string: finger 0)
    const d3 = pitchToGuitarTabPosition(50, "bass");
    expect(d3).toMatchObject({ str: 4, fret: 0, finger: 0 });
  });

  it("handles out of range pitches gracefully by octave wrapping", () => {
    // Very low MIDI note (e.g. 28 -> E1) should wrap into guitar range (MIDI 40 -> string 6 fret 0)
    const low = pitchToGuitarTabPosition(28, "bass");
    expect(low).toMatchObject({ str: 6, fret: 0, finger: 0 });

    // High note MIDI 76 (E5)
    const e5 = pitchToGuitarTabPosition(76, "melody");
    expect(e5).toMatchObject({ str: 1, fret: 12, finger: 4 });
  });
});
