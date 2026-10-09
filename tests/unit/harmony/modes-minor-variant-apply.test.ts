import { describe, expect, it } from "vitest";
import {
  CANONICAL_MODAL_FORMULAS,
  computeModalChords,
  getModalParentKeyAndFunction,
  type ExtendedScaleId,
} from "../../../src/domain/harmony/modes";
import { realizeChord } from "../../../src/domain/harmony/realization";
import type { HarmonicFunctionCategory } from "../../../src/domain/harmony/functions";

/**
 * Modes Explorer: Apply must materialize the chord the preview showed.
 *
 * Regression context: minor-variant modes mapped their degrees onto the RELATIVE MAJOR's
 * function vocabulary (`MINOR_SCALE_MAP` with `parentTonic = tonic + 3`). Roots landed
 * correctly for natural-minor degrees, but every degree the mode alters got the wrong
 * quality. Measured for A harmonic minor: degree 5 — authored as `V7` and previewed by
 * `computeModalChords` as E7 with the raised leading tone G# — resolved to `iii` in C major,
 * i.e. an Em triad, so Apply produced Em7 and lost the G# that defines the mode.
 *
 * These tests derive the expectation from `computeModalChords`, which is the same source
 * the preview card and its audition use, so preview and Apply cannot drift apart again.
 */

const A_TONIC = 9;
const MINOR_VARIANT_MODES = ["harmonic-minor", "melodic-minor"] as const;

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

interface Triad {
  readonly rootPitchClass: number;
  readonly quality: string;
  readonly pitchClasses: readonly number[];
}

/** The chord Apply produces for a degree, reduced to root + triad. */
function appliedTriad(modeId: ExtendedScaleId, modalTonic: number, degree: number): Triad {
  const mapped = getModalParentKeyAndFunction(modalTonic, modeId, degree);
  const chord = realizeChord(
    {
      moduleId: mapped.moduleId,
      functionId: mapped.functionId,
      category: "core" as HarmonicFunctionCategory,
    },
    mapped.parentTonic,
  );

  const thirdInterval = chord.baseQuality === "minor" || chord.baseQuality === "diminished" ? 3 : 4;
  const fifthInterval =
    chord.baseQuality === "diminished" ? 6 : chord.baseQuality === "augmented" ? 8 : 7;
  const root = chord.rootPitchClass;

  return {
    rootPitchClass: root,
    quality: chord.baseQuality,
    pitchClasses: [
      ...new Set([root, (root + thirdInterval) % 12, (root + fifthInterval) % 12]),
    ].sort((a, b) => a - b),
  };
}

/** The triad the preview implies, derived from the preview's own pitches. */
function previewTriad(modeId: ExtendedScaleId, modalTonic: number, degree: number): Triad {
  const preview = computeModalChords(modalTonic, modeId)[degree - 1]!;
  const pitchClasses = [...new Set(preview.pitches.map((p) => p.midiNumber % 12))];

  // The preview voice-leads upward from its own root, so its first pitch is the root.
  const root = preview.pitches[0]!.midiNumber % 12;
  const relative = pitchClasses.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
  const third = relative.includes(3) ? 3 : 4;
  const fifth = relative.includes(6) ? 6 : relative.includes(8) ? 8 : 7;
  const quality =
    third === 4 && fifth === 8
      ? "augmented"
      : third === 4
        ? "major"
        : fifth === 6
          ? "diminished"
          : "minor";

  return {
    rootPitchClass: root,
    quality,
    pitchClasses: [...new Set([root, (root + third) % 12, (root + fifth) % 12])].sort(
      (a, b) => a - b,
    ),
  };
}

describe("Modes Explorer minor-variant Apply matches preview", () => {
  for (const modeId of MINOR_VARIANT_MODES) {
    it(`${modeId}: every degree applies the previewed root and triad quality`, () => {
      for (let degree = 1; degree <= 7; degree += 1) {
        const applied = appliedTriad(modeId, A_TONIC, degree);
        const preview = previewTriad(modeId, A_TONIC, degree);

        const context = `${modeId} degree ${degree}: applied ${PITCH_CLASS_NAMES[applied.rootPitchClass]} ${applied.quality} [${applied.pitchClasses.map((p) => PITCH_CLASS_NAMES[p])}] vs preview ${PITCH_CLASS_NAMES[preview.rootPitchClass]} ${preview.quality} [${preview.pitchClasses.map((p) => PITCH_CLASS_NAMES[p])}]`;

        expect(applied.rootPitchClass, `${context} (root)`).toBe(preview.rootPitchClass);
        expect(applied.quality, `${context} (quality)`).toBe(preview.quality);
        expect(applied.pitchClasses, `${context} (triad tones)`).toEqual(preview.pitchClasses);
      }
    });
  }

  it("harmonic minor degree 5 keeps the raised leading tone (E major, not Em)", () => {
    const applied = appliedTriad("harmonic-minor", A_TONIC, 5);

    expect(applied.rootPitchClass).toBe(4); // E
    expect(applied.quality).toBe("major");
    expect(applied.pitchClasses).toContain(8); // G#, the raised seventh
    expect(applied.pitchClasses).not.toContain(7); // G natural would be Em
  });

  it("resolves minor-variant modes inside the parallel minor, not the relative major", () => {
    for (const modeId of MINOR_VARIANT_MODES) {
      const mapped = getModalParentKeyAndFunction(A_TONIC, modeId, 1);
      // A harmonic/melodic minor is its own tonic; the old mapping sent this to C major.
      expect(mapped.parentTonic, `${modeId} parent tonic`).toBe(A_TONIC);
      expect(mapped.moduleId, `${modeId} module`).toBe("dark-harmony");
    }
  });

  it("applies every canonical minor formula step with complete triad tones", () => {
    const minorFormulas = CANONICAL_MODAL_FORMULAS.filter(
      (formula) => formula.modeId === "harmonic-minor" || formula.modeId === "melodic-minor",
    );
    expect(minorFormulas.length).toBeGreaterThan(0);

    for (const formula of minorFormulas) {
      for (const step of formula.steps) {
        const mapped = getModalParentKeyAndFunction(A_TONIC, formula.modeId, step.degree);

        // Every mapped function must be resolvable — no RangeError from a missing identity.
        expect(
          () =>
            realizeChord(
              {
                moduleId: mapped.moduleId,
                functionId: mapped.functionId,
                category: "core" as HarmonicFunctionCategory,
              },
              mapped.parentTonic,
            ),
          `${formula.id} degree ${step.degree} (${mapped.functionId}) must resolve`,
        ).not.toThrow();

        const applied = appliedTriad(formula.modeId, A_TONIC, step.degree);
        const preview = previewTriad(formula.modeId, A_TONIC, step.degree);
        const context = `${formula.id} degree ${step.degree}: applied ${PITCH_CLASS_NAMES[applied.rootPitchClass]} ${applied.quality} vs preview ${PITCH_CLASS_NAMES[preview.rootPitchClass]} ${preview.quality}`;

        expect(applied.rootPitchClass, context).toBe(preview.rootPitchClass);
        expect(applied.quality, context).toBe(preview.quality);
      }
    }
  });
});
