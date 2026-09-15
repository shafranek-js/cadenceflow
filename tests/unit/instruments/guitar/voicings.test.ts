import { describe, expect, it } from "vitest";
import { resolveGuitarChordVoicing } from "../../../../src/domain/instruments/guitar/voicings";

describe("Guitar voicings catalog and resolver", () => {
  it("resolves canonical open C major voicing with base fret 1 and root on A string", () => {
    const voicing = resolveGuitarChordVoicing({
      rootPitchClass: 0,
      baseQuality: "major",
      spelling: { symbol: "C", root: { step: "C", alter: 0 } },
    });

    expect(voicing.chordSymbol).toBe("C");
    expect(voicing.rootPitchClass).toBe(0);
    expect(voicing.baseFret).toBe(1);
    expect(voicing.frets).toEqual([-1, 3, 2, 0, 1, 0]);
    expect(voicing.voicingStyle).toBe("open");

    // Check item roles
    const aStringItem = voicing.items.find((it) => it.stringIndex === 1);
    expect(aStringItem?.fret).toBe(3);
    expect(aStringItem?.role).toBe("root");

    const highEItem = voicing.items.find((it) => it.stringIndex === 5);
    expect(highEItem?.fret).toBe(0);
    expect(highEItem?.role).toBe("chord-tone");
  });

  it("resolves canonical open G major and E minor chords", () => {
    const gMajor = resolveGuitarChordVoicing({
      rootPitchClass: 7,
      baseQuality: "major",
      spelling: { symbol: "G", root: { step: "G", alter: 0 } },
    });
    expect(gMajor.frets).toEqual([3, 2, 0, 0, 0, 3]);

    const eMinor = resolveGuitarChordVoicing({
      rootPitchClass: 4,
      baseQuality: "minor",
      spelling: { symbol: "Em", root: { step: "E", alter: 0 } },
    });
    expect(eMinor.frets).toEqual([0, 2, 2, 0, 0, 0]);
  });

  it("resolves F major barre chord with barre on fret 1", () => {
    const fMajor = resolveGuitarChordVoicing({
      rootPitchClass: 5,
      baseQuality: "major",
      spelling: { symbol: "F", root: { step: "F", alter: 0 } },
    });

    expect(fMajor.frets).toEqual([1, 3, 3, 2, 1, 1]);
    expect(fMajor.barres).toHaveLength(1);
    expect(fMajor.barres[0]?.fret).toBe(1);
    expect(fMajor.barres[0]?.fromStringIndex).toBe(0);
    expect(fMajor.barres[0]?.toStringIndex).toBe(5);
  });

  it("resolves movable barre for chords not in open table (e.g. Ab major, F# minor)", () => {
    // Ab is root pc 8. E-shape at fret 4: [4, 6, 6, 5, 4, 4]
    const abMajor = resolveGuitarChordVoicing({
      rootPitchClass: 8,
      baseQuality: "major",
      spelling: { symbol: "Ab", root: { step: "A", alter: -1 } },
    });

    expect(abMajor.rootPitchClass).toBe(8);
    expect(abMajor.baseFret).toBe(4);
    expect(abMajor.frets).toEqual([4, 6, 6, 5, 4, 4]);
    expect(abMajor.barres).toHaveLength(1);
    expect(abMajor.barres[0]?.fret).toBe(4);

    // F# minor is root pc 6. E-shape minor at fret 2: [2, 4, 4, 2, 2, 2]
    const fsMinor = resolveGuitarChordVoicing({
      rootPitchClass: 6,
      baseQuality: "minor",
      spelling: { symbol: "F#m", root: { step: "F", alter: 1 } },
    });
    expect(fsMinor.baseFret).toBe(2);
    expect(fsMinor.frets).toEqual([2, 4, 4, 2, 2, 2]);
  });

  it("resolves slash chords with appropriate bass string voicing", () => {
    const cOverE = resolveGuitarChordVoicing({
      rootPitchClass: 0,
      baseQuality: "major",
      bassPitchClass: 4, // E
      spelling: { symbol: "C/E", root: { step: "C", alter: 0 } },
    });
    expect(cOverE.bassPitchClass).toBe(4);
    expect(cOverE.frets[0]).toBe(0); // Open Low E
    expect(cOverE.voicingStyle).toBe("slash");

    const gOverB = resolveGuitarChordVoicing({
      rootPitchClass: 7,
      baseQuality: "major",
      bassPitchClass: 11, // B
      spelling: { symbol: "G/B", root: { step: "G", alter: 0 } },
    });
    expect(gOverB.bassPitchClass).toBe(11);
    expect(gOverB.frets[1]).toBe(2); // Fret 2 on A string = B
    expect(gOverB.voicingStyle).toBe("slash");
  });
});
