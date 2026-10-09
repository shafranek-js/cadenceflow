import { describe, expect, it } from "vitest";
import { resolveGuitarChordVoicing } from "../../../../src/domain/instruments/guitar/voicings";
import type {
  BaseChordQuality,
  HarmonicVariant,
  SeventhKind,
} from "../../../../src/domain/harmony/chord";
import { realizeChord } from "../../../../src/domain/harmony/realization";

/**
 * Harmonic-content regression tests for guitar voicing resolution.
 *
 * Regression context: `resolveGuitarChordVoicing` used to derive its template from
 * `if (isMajor7) "major7" else if (isSeventh || quality === "dominant") "dominant"`,
 * where every caller computed `isSeventh` as
 * `baseQuality === "dominant" || variant.seventh !== undefined`. That made `isSeventh`
 * true for *every* seventh chord, so the base quality was overwritten and the dominant
 * shape was used. Measured before the fix: Cm7 and C7 both produced `midi=[48,52,58,60,64]`,
 * i.e. Cm7 sounded as C7 with a major third. Am7 -> A7 and Dm7 -> D7 were affected the same way.
 *
 * These tests assert *pitch content*, never shape names, so a template swap cannot silently
 * reintroduce a wrong third, a dropped seventh or a foreign tone.
 */

const PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

interface Case {
  readonly label: string;
  readonly baseQuality: BaseChordQuality;
  readonly seventh?: SeventhKind;
  /** Intervals above the root that the voicing must be able to express. */
  readonly allowed: readonly number[];
  /** Intervals that must always be present (root, third, and any seventh). */
  readonly essential: readonly number[];
}

const CASES: readonly Case[] = [
  { label: "major triad", baseQuality: "major", allowed: [0, 4, 7], essential: [0, 4] },
  { label: "minor triad", baseQuality: "minor", allowed: [0, 3, 7], essential: [0, 3] },
  {
    label: "dominant 7th",
    baseQuality: "dominant",
    seventh: "minor7",
    allowed: [0, 4, 7, 10],
    essential: [0, 4, 10],
  },
  {
    label: "major 7th",
    baseQuality: "major",
    seventh: "major7",
    allowed: [0, 4, 7, 11],
    essential: [0, 4, 11],
  },
  {
    label: "minor 7th",
    baseQuality: "minor",
    seventh: "minor7",
    allowed: [0, 3, 7, 10],
    essential: [0, 3, 10],
  },
  {
    label: "minor-major 7th",
    baseQuality: "minor",
    seventh: "major7",
    allowed: [0, 3, 7, 11],
    essential: [0, 3, 11],
  },
  {
    label: "half-diminished 7th",
    baseQuality: "diminished",
    seventh: "half-diminished7",
    allowed: [0, 3, 6, 10],
    essential: [0, 3, 10],
  },
  {
    label: "diminished 7th",
    baseQuality: "diminished",
    seventh: "diminished7",
    allowed: [0, 3, 6, 9],
    essential: [0, 3, 9],
  },
  { label: "diminished triad", baseQuality: "diminished", allowed: [0, 3, 6], essential: [0, 3] },
  { label: "augmented triad", baseQuality: "augmented", allowed: [0, 4, 8], essential: [0, 4, 8] },
];

const ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

function resolve(root: number, testCase: Case) {
  return resolveGuitarChordVoicing({
    rootPitchClass: root,
    baseQuality: testCase.baseQuality,
    spelling: { symbol: PITCH_CLASS_NAMES[root]!, root: { step: "C", alter: 0 } },
    ...(testCase.seventh !== undefined ? { seventh: testCase.seventh } : {}),
  });
}

describe("guitar voicing harmonic content", () => {
  for (const testCase of CASES) {
    it(`${testCase.label}: every root sounds the right chord tones`, () => {
      for (const root of ROOTS) {
        const voicing = resolve(root, testCase);
        const relative = [
          ...new Set(voicing.pitches.map((pitch) => ((pitch.midiNumber % 12) - root + 12) % 12)),
        ].sort((a, b) => a - b);

        const missing = testCase.essential.filter((interval) => !relative.includes(interval));
        const foreign = relative.filter((interval) => !testCase.allowed.includes(interval));

        const context = `${PITCH_CLASS_NAMES[root]} ${testCase.label} frets=[${voicing.frets}]`;
        expect(missing, `${context} is missing ${JSON.stringify(missing)}`).toEqual([]);
        expect(foreign, `${context} contains foreign tones ${JSON.stringify(foreign)}`).toEqual([]);
      }
    });
  }

  it("keeps the root as the lowest sounding pitch", () => {
    for (const testCase of CASES) {
      for (const root of ROOTS) {
        const voicing = resolve(root, testCase);
        const lowest = voicing.pitches[0];
        expect(
          lowest?.pitchClassIdentity,
          `${PITCH_CLASS_NAMES[root]} ${testCase.label} bass is not the root`,
        ).toBe(root);
      }
    }
  });

  it("regression: a minor 7th never uses a major third (Cm7 must not equal C7)", () => {
    for (const root of ROOTS) {
      const minorSeventh = resolve(
        root,
        CASES.find((c) => c.label === "minor 7th")!,
      );
      const dominantSeventh = resolve(
        root,
        CASES.find((c) => c.label === "dominant 7th")!,
      );

      const relativeOf = (voicing: { pitches: readonly { midiNumber: number }[] }) =>
        [...new Set(voicing.pitches.map((p) => ((p.midiNumber % 12) - root + 12) % 12))].sort(
          (a, b) => a - b,
        );

      const minorRel = relativeOf(minorSeventh);
      expect(minorRel, `${PITCH_CLASS_NAMES[root]}m7 must contain a minor third`).toContain(3);
      expect(minorRel, `${PITCH_CLASS_NAMES[root]}m7 must not contain a major third`).not.toContain(
        4,
      );
      expect(
        minorRel,
        `${PITCH_CLASS_NAMES[root]}m7 must differ from ${PITCH_CLASS_NAMES[root]}7`,
      ).not.toEqual(relativeOf(dominantSeventh));
    }
  });

  it("regression: an augmented triad is never rendered as a diminished shape", () => {
    for (const root of ROOTS) {
      const voicing = resolve(
        root,
        CASES.find((c) => c.label === "augmented triad")!,
      );
      const relative = [
        ...new Set(voicing.pitches.map((p) => ((p.midiNumber % 12) - root + 12) % 12)),
      ].sort((a, b) => a - b);

      expect(relative, `${PITCH_CLASS_NAMES[root]}+ must contain a major third (+4)`).toContain(4);
      expect(
        relative,
        `${PITCH_CLASS_NAMES[root]}+ must contain an augmented fifth (+8)`,
      ).toContain(8);
      expect(
        relative,
        `${PITCH_CLASS_NAMES[root]}+ must not contain a perfect fifth (+7)`,
      ).not.toContain(7);
    }
  });

  it("honours the deprecated isSeventh flag without losing the minor third", () => {
    // Callers that still pass the old boolean must not regress minor-family chords.
    const minorSeventh = resolveGuitarChordVoicing({
      rootPitchClass: 0,
      baseQuality: "minor",
      spelling: { symbol: "Cm7", root: { step: "C", alter: 0 } },
      isSeventh: true,
    });
    const relative = [
      ...new Set(minorSeventh.pitches.map((p) => ((p.midiNumber % 12) - 0 + 12) % 12)),
    ].sort((a, b) => a - b);

    expect(relative).toContain(3);
    expect(relative).not.toContain(4);
  });

  it("voices every authored tone for supported options and never restores omitted thirds/fifths", () => {
    const base = realizeChord({ moduleId: "progressions", functionId: "I", category: "core" }, 0);
    const variant = (partial: Partial<HarmonicVariant>): HarmonicVariant => ({
      extensions: [],
      suspensions: [],
      alterations: [],
      ...partial,
    });
    const cases = [
      variant({ no5: true }),
      variant({ add11: true }),
      variant({ no3: true, add13: true }),
    ];

    for (const harmonicVariant of cases) {
      const voicing = resolveGuitarChordVoicing({ ...base, variant: harmonicVariant });
      expect(voicing.unsupportedReason).toBeUndefined();
      const soundingPitchClasses = new Set(
        voicing.pitches.map((pitch) => pitch.pitchClassIdentity),
      );
      if (harmonicVariant.no3) expect(soundingPitchClasses).not.toContain(4);
      if (harmonicVariant.no5) expect(soundingPitchClasses).not.toContain(7);
      if (harmonicVariant.add11) expect(soundingPitchClasses).toContain(5);
      if (harmonicVariant.add13) expect(soundingPitchClasses).toContain(9);
    }
  });

  it("reports an explicit missing fingering when seven distinct extension tones exceed six strings", () => {
    const base = realizeChord({ moduleId: "progressions", functionId: "I", category: "core" }, 0);
    const voicing = resolveGuitarChordVoicing({
      ...base,
      variant: {
        seventh: "minor7",
        extensions: [9, 11, 13],
        suspensions: [],
        alterations: [],
      },
    });

    expect(voicing.unsupportedReason).toMatch(/needs 7 distinct pitch classes/i);
    expect(voicing.pitches).toEqual([]);
  });
});
