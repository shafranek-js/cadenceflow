import { resolveChordTones } from "../../../src/instruments/piano/voicing";
import { describe, expect, it } from "vitest";
import {
  EMPTY_HARMONIC_VARIANT,
  formatChordSymbol,
  type BaseChordQuality,
  type ChordDefinition,
  type HarmonicVariant,
} from "../../../src/domain/harmony/chord";
import { realizeChord } from "../../../src/domain/harmony/realization";
import { DARK_HARMONY_CORE_FUNCTIONS } from "../../../src/domain/harmony/modules/darkHarmony";
import {
  PROGRESSIONS_FUNCTIONS,
  realizeProgressionsChord,
} from "../../../src/domain/harmony/modules/progressions";

/**
 * The chord symbol must describe the chord that actually sounds.
 *
 * Regression context: `formatChordSymbol` inspected only `baseQuality`, with one special case for
 * `diminished7`. Every other variant was ignored, so the label contradicted the pitches:
 *
 *   Cmaj7 -> "C"    Cm7 -> "Cm"    Cm(maj7) -> "Cm"    Cm7b5 -> "C°"
 *   C9 -> "C7"      C7b9 -> "C7"   Csus4 -> "C"        Cadd9 -> "C"
 *
 * `modes.ts` builds its own symbols for the preview cards (`computeModalChords`), so the preview
 * could read "Cmaj7" while the progression card for the same chord read "C". These tests derive
 * the expectation from the chord definition rather than from a hand-written list, so a new
 * variant cannot silently lose its notation again.
 */

const C_ROOT = { step: "C", alter: 0 } as const;

function chordWith(baseQuality: BaseChordQuality, variant: HarmonicVariant): ChordDefinition {
  return {
    harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
    rootPitchClass: 0,
    baseQuality,
    variant,
    spelling: { root: { ...C_ROOT }, symbol: "unused" },
  };
}

const variant = (partial: Partial<HarmonicVariant>): HarmonicVariant => ({
  extensions: [],
  suspensions: [],
  alterations: [],
  ...partial,
});

/** Exact notation, so a change to the formatter has to be deliberate. */
const EXPECTED: ReadonlyArray<readonly [string, BaseChordQuality, HarmonicVariant, string]> = [
  ["major triad", "major", variant({}), "C"],
  ["minor triad", "minor", variant({}), "Cm"],
  ["augmented triad", "augmented", variant({}), "C+"],
  ["diminished triad", "diminished", variant({}), "C°"],
  ["dominant 7th", "dominant", variant({ seventh: "minor7" }), "C7"],
  ["major 7th", "major", variant({ seventh: "major7" }), "Cmaj7"],
  ["minor 7th", "minor", variant({ seventh: "minor7" }), "Cm7"],
  ["minor-major 7th", "minor", variant({ seventh: "major7" }), "Cm(maj7)"],
  ["half-diminished 7th", "diminished", variant({ seventh: "half-diminished7" }), "Cm7b5"],
  ["diminished 7th", "diminished", variant({ seventh: "diminished7" }), "C°7"],
  ["sus4", "major", variant({ suspensions: ["sus4"] }), "Csus4"],
  ["add9", "major", variant({ add9: true }), "Cadd9"],
  ["dominant 9th", "dominant", variant({ seventh: "minor7", extensions: [9] }), "C9"],
  // Several extensions are grouped. Running the digits together produced "C911", which reads as
  // nine-eleven rather than ninth-and-eleventh.
  [
    "dominant 9th and 11th",
    "dominant",
    variant({ seventh: "minor7", extensions: [9, 11] }),
    "C7(9,11)",
  ],
  [
    "dominant 9th, 11th and 13th",
    "dominant",
    variant({ seventh: "minor7", extensions: [9, 11, 13] }),
    "C7(9,11,13)",
  ],
  [
    "dominant 7 flat 9",
    "dominant",
    variant({ seventh: "minor7", alterations: [{ degree: 9, semitones: -1 }] }),
    "C7b9",
  ],
];

describe("formatChordSymbol reports the sounding chord", () => {
  it.each(EXPECTED)("%s", (_label, baseQuality, harmonicVariant, expected) => {
    expect(formatChordSymbol(chordWith(baseQuality, harmonicVariant))).toBe(expected);
  });

  it("keeps the traditional bare 7 for a dominant seventh", () => {
    // `dominant` already means "major triad plus minor seventh", so "C7" is correct and must not
    // become "Cdom7" or "C7m7".
    expect(formatChordSymbol(chordWith("dominant", variant({ seventh: "minor7" })))).toBe("C7");
  });

  it("writes a slash bass after the quality", () => {
    const chord: ChordDefinition = {
      ...chordWith("dominant", variant({ seventh: "minor7" })),
      bassPitchClass: 4,
      bassSpelling: { step: "E", alter: 0 },
    };
    expect(formatChordSymbol(chord)).toBe("C7/E");
  });

  it("includes a seventh marker for every chord that has a seventh", () => {
    // The property that would have caught the original defect: a chord whose variant carries a
    // seventh must not render as a bare triad.
    //
    // A *single* extension is the one legitimate exception: an extended chord contains its seventh
    // by definition, so "C9" is complete and correct without a literal "7". Several extensions are
    // grouped as "C7(9,11)", which does carry the marker.
    for (const [label, baseQuality, harmonicVariant] of EXPECTED) {
      if (harmonicVariant.seventh === undefined) continue;
      const symbol = formatChordSymbol(chordWith(baseQuality, harmonicVariant));
      const loneExtension = harmonicVariant.extensions.length === 1;
      if (loneExtension) {
        expect(symbol, `${label} -> "${symbol}" must name its extension`).toMatch(/9|11|13/);
        continue;
      }
      expect(/7/.test(symbol), `${label} -> "${symbol}" must indicate its seventh`).toBe(true);
    }
  });

  it("describes every chord in the progressions catalogue without collapsing variants", () => {
    for (const spec of PROGRESSIONS_FUNCTIONS) {
      // Realization can reject a spec that is not reachable from a plain tonic; skip those.
      let chord: ChordDefinition;
      try {
        chord = realizeProgressionsChord(spec.id, 0);
      } catch {
        continue;
      }
      const symbol = formatChordSymbol(chord);

      // The root must always be present, and the symbol must be non-empty.
      expect(symbol.length, `${spec.id} produced an empty symbol`).toBeGreaterThan(0);

      // A diminished seventh must not be reported as a plain diminished triad.
      if (chord.variant.seventh === "diminished7") {
        expect(symbol, `${spec.id}`).toContain("°7");
      }
    }
  });

  it("describes every dark-harmony function with a non-empty symbol", () => {
    for (const spec of DARK_HARMONY_CORE_FUNCTIONS) {
      let chord: ChordDefinition;
      try {
        chord = realizeChord(
          { moduleId: "dark-harmony", functionId: spec.id, category: "core" },
          0,
        );
      } catch {
        continue;
      }
      expect(formatChordSymbol(chord).length, `${spec.id}`).toBeGreaterThan(0);
      expect(chord.variant).toBeDefined();
    }
  });

  it("does not change a plain triad's symbol when only the root spelling differs", () => {
    const natural = chordWith("major", EMPTY_HARMONIC_VARIANT);
    const flatRoot: ChordDefinition = {
      ...natural,
      spelling: { root: { step: "C", alter: -1 }, symbol: "unused" },
    };
    expect(formatChordSymbol(natural)).toBe("C");
    expect(formatChordSymbol(flatRoot)).toBe("Cb");
  });
});

describe("triad quality is preserved with every explicit seventh", () => {
  const qualities = ["major", "minor", "augmented", "diminished", "dominant"] as const;
  const seventhKinds = ["minor7", "major7", "half-diminished7", "diminished7"] as const;
  const expectedSymbols = {
    major: ["C7", "Cmaj7", "C7", "C(bb7)"],
    minor: ["Cm7", "Cm(maj7)", "Cm7", "Cm(bb7)"],
    augmented: ["C+7", "C+maj7", "C+7", "C+(bb7)"],
    diminished: ["Cm7b5", "C\u00b0(maj7)", "Cm7b5", "C\u00b07"],
    dominant: ["C7", "Cmaj7", "C7", "C(bb7)"],
  };
  for (const quality of qualities)
    for (const [index, seventh] of seventhKinds.entries()) {
      it(`${quality} with ${seventh} matches realized thirds, fifths and sevenths`, () => {
        const chord = chordWith(quality, variant({ seventh }));
        expect(formatChordSymbol(chord)).toBe(expectedSymbols[quality][index]);
        const third = quality === "minor" || quality === "diminished" ? 3 : 4;
        const fifth = quality === "augmented" ? 8 : quality === "diminished" ? 6 : 7;
        const seventhPitch = seventh === "major7" ? 11 : seventh === "diminished7" ? 9 : 10;
        expect(resolveChordTones(chord).map((tone) => tone.pitchClass)).toEqual([
          0,
          third,
          fifth,
          seventhPitch,
        ]);
      });
    }
  it.each([
    ["augmented", "major7", "C+maj7(9,11)#11"],
    ["diminished", "minor7", "Cm7b5(9,11)#11"],
    ["diminished", "major7", "C\u00b0(maj7)(9,11)#11"],
  ] as const)("keeps %s/%s with an extension and alteration", (quality, seventh, expected) => {
    const chord = chordWith(
      quality,
      variant({ seventh, extensions: [9, 11], alterations: [{ degree: 11, semitones: 1 }] }),
    );
    expect(formatChordSymbol(chord)).toBe(expected);
    expect(resolveChordTones(chord).map((tone) => tone.pitchClass)).toContain(2);
    expect(resolveChordTones(chord).map((tone) => tone.pitchClass)).toContain(6);
  });
});
