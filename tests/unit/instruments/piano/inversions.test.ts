import { describe, expect, it } from "vitest";
import { pianoProfile } from "../../../../src/instruments/piano/profile";
import { realizeChord as realizeHarmonyChord } from "../../../../src/domain/harmony/realization";
import { resolveBassPitch } from "../../../../src/instruments/piano/bass";
import type { HarmonicContext } from "../../../../src/domain/harmony/modules/types";
import type { StepPerformance } from "../../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../../src/domain/harmony/chord";

const C_MAJOR_CONTEXT: HarmonicContext = Object.freeze({
  tonic: 0,
  mode: "major",
  activeModuleId: "progressions",
});

function createPerformance(overrides?: Partial<StepPerformance>): StepPerformance {
  return Object.freeze({
    articulation: "block",
    register: "auto",
    voicingMode: "auto",
    bass: Object.freeze({
      choice: "auto",
      octaveOffset: "auto",
    }),
    masterVelocity: 80,
    perNoteVelocityOverrides: Object.freeze({}),
    dynamicsViewPreference: "musical",
    ...overrides,
  });
}

describe("Piano Inversions and Seventh Bass Support", () => {
  it("realizes Root Position (inversion 0) with root in the lowest upper voice", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0); // C Major
    const realization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: { ...chord, variant: EMPTY_HARMONIC_VARIANT },
      performance: createPerformance({ inversion: 0 }),
    });

    // In C major triad (C, E, G), root position has C as lowest upper note
    const lowestNote = realization.pitches[0]!;
    expect(lowestNote.pitchClassIdentity).toBe(0); // C
  });

  it("realizes 1st Inversion (inversion 1) with 3rd in the lowest upper voice", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0); // C Major
    const realization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: { ...chord, variant: EMPTY_HARMONIC_VARIANT },
      performance: createPerformance({ inversion: 1 }),
    });

    // 1st inversion has 3rd (E = 4) as lowest upper note
    const lowestNote = realization.pitches[0]!;
    expect(lowestNote.pitchClassIdentity).toBe(4); // E
  });

  it("realizes 2nd Inversion (inversion 2) with 5th in the lowest upper voice", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0); // C Major
    const realization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: { ...chord, variant: EMPTY_HARMONIC_VARIANT },
      performance: createPerformance({ inversion: 2 }),
    });

    // 2nd inversion has 5th (G = 7) as lowest upper note
    const lowestNote = realization.pitches[0]!;
    expect(lowestNote.pitchClassIdentity).toBe(7); // G
  });

  it("realizes 3rd Inversion (inversion 3) for seventh chord with 7th in the lowest upper voice", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "V7" }, 0); // G7
    const realization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: {
        ...chord,
        variant: { ...EMPTY_HARMONIC_VARIANT, seventh: "minor7" },
      },
      performance: createPerformance({ inversion: 3 }),
    });

    // G7 is G (7), B (11), D (2), F (5).
    // 3rd inversion has 7th (F = 5) as lowest upper note
    const lowestNote = realization.pitches[0]!;
    expect(lowestNote.pitchClassIdentity).toBe(5); // F
  });

  it("resolves Seventh in the bass for G7 (dominant chord)", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "V7" }, 0); // G7
    const bass = resolveBassPitch(
      { ...chord, variant: { ...EMPTY_HARMONIC_VARIANT, seventh: "minor7" } },
      { choice: "seventh", octaveOffset: "auto" },
    );

    // 7th of G7 is F (pitch class 5)
    expect(bass.pitchClassIdentity).toBe(5);
    expect(bass.spelling.step).toBe("F");
  });

  it("resolves Seventh in the bass for Cmaj7", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0); // C
    const bass = resolveBassPitch(
      { ...chord, variant: { ...EMPTY_HARMONIC_VARIANT, seventh: "major7" } },
      { choice: "seventh", octaveOffset: "auto" },
    );

    // Major 7th of C is B (pitch class 11)
    expect(bass.pitchClassIdentity).toBe(11);
    expect(bass.spelling.step).toBe("B");
  });
});
