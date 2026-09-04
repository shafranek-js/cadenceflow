import { describe, expect, it } from "vitest";
import { realizeChord as realizeHarmonyChord } from "../../../../src/domain/harmony/realization";
import { pianoProfile } from "../../../../src/instruments/piano/profile";
import type { InstrumentRealizationInput } from "../../../../src/instruments/contracts";
import type { HarmonicContext } from "../../../../src/domain/harmony/modules/types";
import type { StepPerformance, ChordStep } from "../../../../src/domain/progression/step";
import { musicalDuration } from "../../../../src/domain/timing/duration";
import { rational } from "../../../../src/domain/timing/rational";
import {
  EMPTY_HARMONIC_VARIANT,
  type ChordDefinition,
  type HarmonicVariant,
} from "../../../../src/domain/harmony/chord";
import type { ExactPitch } from "../../../../src/domain/harmony/pitch";

const C_MAJOR_CONTEXT: HarmonicContext = Object.freeze({
  tonic: 0, // C
  mode: "major",
  activeModuleId: "progressions",
});

function createDefaultPerformance(overrides?: Partial<StepPerformance>): StepPerformance {
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

function createStep(id: string, functionId: string, performance: StepPerformance): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId,
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(1, 1)),
    performance,
    cardView: "piano",
  });
}

/**
 * Test contract metric for evaluating voice leading distance between two chords.
 * Penalizes unmatched voice counts so that transitions between triads and 7th/9th chords
 * cannot obtain artificially low distance by simply ignoring extra voices.
 */
function computeVoiceLeadingDistance(
  fromPitches: readonly ExactPitch[],
  toPitches: readonly ExactPitch[],
): number {
  if (!fromPitches.length || !toPitches.length) return Number.POSITIVE_INFINITY;
  const fromSorted = [...fromPitches].map((p) => p.midiNumber).sort((a, b) => a - b);
  const toSorted = [...toPitches].map((p) => p.midiNumber).sort((a, b) => a - b);

  let distance = 0;
  const sharedCount = Math.min(fromSorted.length, toSorted.length);
  for (let i = 0; i < sharedCount; i++) {
    distance += Math.abs(fromSorted[i]! - toSorted[i]!);
  }

  // Penalty for voice count mismatch: unmatched voices must be accounted for
  const countDiff = Math.abs(fromSorted.length - toSorted.length);
  if (countDiff > 0) {
    const penaltyPerVoice = 12; // Octave penalty weight for added/dropped voices
    distance += countDiff * penaltyPerVoice;
  }

  return distance;
}

describe("T077 — Piano contextual voice-leading contract", () => {
  it("retains common tones where musically reasonable", () => {
    const chordC = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0);
    const chordAm = realizeHarmonyChord({ moduleId: "progressions", functionId: "vi" }, 0);

    const inputC: InstrumentRealizationInput = {
      context: C_MAJOR_CONTEXT,
      chord: chordC,
      performance: createDefaultPerformance(),
    };
    const realizationC = pianoProfile.realizeChord(inputC);
    expect(realizationC.pitches.length).toBeGreaterThanOrEqual(3);

    // Common tones between C Major (C, E, G) and A minor (A, C, E) are C and E
    const cMidis = realizationC.pitches.map((p) => p.midiNumber);

    const inputAm: InstrumentRealizationInput = {
      context: C_MAJOR_CONTEXT,
      chord: chordAm,
      performance: createDefaultPerformance(),
      previousPitches: realizationC.pitches,
    };
    const realizationAm = pianoProfile.realizeChord(inputAm);
    const amMidis = realizationAm.pitches.map((p) => p.midiNumber);

    // At least one common tone should be retained at the exact same pitch/octave
    const retainedCommonTones = amMidis.filter((m) => cMidis.includes(m));
    expect(retainedCommonTones.length).toBeGreaterThanOrEqual(1);

    // Retained pitch classes must belong to the intersection {C=0, E=4}
    for (const midi of retainedCommonTones) {
      const pc = midi % 12;
      expect([0, 4]).toContain(pc);
    }
  });

  it("prefers bounded/minimal movement over independent root-position jumps between consecutive voicings", () => {
    const chordC = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0);
    const chordF = realizeHarmonyChord({ moduleId: "progressions", functionId: "IV" }, 0);
    const chordG = realizeHarmonyChord({ moduleId: "progressions", functionId: "V" }, 0);

    const stepCRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: chordC,
      performance: createDefaultPerformance(),
    });

    // Contextual realization for F following C
    const stepFRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: chordF,
      performance: createDefaultPerformance(),
      previousPitches: stepCRealization.pitches,
    });

    // Independent root-position F realization (no previousPitches)
    const independentFRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: chordF,
      performance: createDefaultPerformance(),
    });

    // Contextual realization for G following F
    const stepGRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: chordG,
      performance: createDefaultPerformance(),
      previousPitches: stepFRealization.pitches,
    });

    const contextualDistCtoF = computeVoiceLeadingDistance(
      stepCRealization.pitches,
      stepFRealization.pitches,
    );
    const independentDistCtoF = computeVoiceLeadingDistance(
      stepCRealization.pitches,
      independentFRealization.pitches,
    );

    // Contextual voice leading distance should be less than or equal to independent jump
    expect(contextualDistCtoF).toBeLessThanOrEqual(independentDistCtoF);

    // Movement to G should also be bounded (smooth voice leading across 3-4 voices)
    const distFtoG = computeVoiceLeadingDistance(
      stepFRealization.pitches,
      stepGRealization.pitches,
    );
    expect(distFtoG).toBeLessThanOrEqual(12);
  });

  it("allows repeated chords to retain/adjust voicing contextually without sharing mutable step state", () => {
    const perf1 = createDefaultPerformance();
    const perf2 = createDefaultPerformance();
    const step1 = createStep("step-1", "I", perf1);
    const step2 = createStep("step-2", "I", perf2);

    // Objects are independent
    expect(step1).not.toBe(step2);
    expect(step1.performance).not.toBe(step2.performance);
    expect(step1.performance.bass).not.toBe(step2.performance.bass);

    const chord = realizeHarmonyChord(step1.harmonicFunction, 0);

    const realization1 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: step1.performance,
    });

    const realization2 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: step2.performance,
      previousPitches: realization1.pitches,
    });

    // Both realizations must produce valid piano realizations (at least triad pitch count)
    expect(realization1.pitches.length).toBeGreaterThanOrEqual(3);
    expect(realization2.pitches.length).toBeGreaterThanOrEqual(3);

    // In repeated chords, auto-voicing retains identical pitches smoothly
    expect(realization2.pitches.map((p) => p.midiNumber)).toEqual(
      realization1.pitches.map((p) => p.midiNumber),
    );

    // Mutating step1 performance snapshot does not affect step2
    const modifiedPerf1 = Object.freeze({
      ...step1.performance,
      register: 1 as const,
    });
    expect(step2.performance.register).toBe("auto");
    expect(modifiedPerf1.register).toBe(1);
  });

  it("constrains register preference without redefining harmonic identity", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "V" }, 0); // G major: G, B, D

    const baseRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ register: 0 }),
    });

    const upRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ register: 1 }),
    });

    const downRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ register: -1 }),
    });

    expect(baseRealization.pitches.length).toBeGreaterThan(0);
    expect(upRealization.pitches.length).toBe(baseRealization.pitches.length);
    expect(downRealization.pitches.length).toBe(baseRealization.pitches.length);

    // Shifts by exactly 12 semitones up and down
    for (let i = 0; i < baseRealization.pitches.length; i++) {
      expect(upRealization.pitches[i]!.midiNumber).toBe(
        baseRealization.pitches[i]!.midiNumber + 12,
      );
      expect(downRealization.pitches[i]!.midiNumber).toBe(
        baseRealization.pitches[i]!.midiNumber - 12,
      );
    }

    // Harmonic identity (pitch class set) is unchanged
    const basePcs = new Set(baseRealization.pitches.map((p) => p.pitchClassIdentity));
    const upPcs = new Set(upRealization.pitches.map((p) => p.pitchClassIdentity));
    const downPcs = new Set(downRealization.pitches.map((p) => p.pitchClassIdentity));

    expect(upPcs).toEqual(basePcs);
    expect(downPcs).toEqual(basePcs);
  });

  it("produces deterministic auto-voicing given deterministic input", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "ii" }, 0);
    const input: InstrumentRealizationInput = {
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance(),
    };

    const firstRun = pianoProfile.realizeChord(input);
    const secondRun = pianoProfile.realizeChord(input);

    expect(firstRun.pitches.length).toBeGreaterThan(0);
    expect(firstRun.pitches.map((p) => p.midiNumber)).toEqual(
      secondRun.pitches.map((p) => p.midiNumber),
    );
    expect(firstRun.pitches.map((p) => p.spelling)).toEqual(
      secondRun.pitches.map((p) => p.spelling),
    );
  });

  it("handles voice-count transitions (triad -> seventh chord) without ignoring unmatched voices", () => {
    const triadC = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0); // C Major triad (3 voices: C, E, G)
    const seventhG7: ChordDefinition = {
      ...realizeHarmonyChord({ moduleId: "progressions", functionId: "V" }, 0),
      baseQuality: "dominant", // 4 voices: G, B, D, F
    };

    const realizationC = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: triadC,
      performance: createDefaultPerformance(),
    });

    // G7 following C triad
    const realizationG7 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: seventhG7,
      performance: createDefaultPerformance(),
      previousPitches: realizationC.pitches,
    });

    // Realized G7 must realize all 4 voices (root, 3rd, 5th, 7th)
    expect(realizationC.pitches.length).toBe(3);
    expect(realizationG7.pitches.length).toBe(4);

    // G7 must contain the 7th (F, PC 5) and not drop voices to match previous voice count
    const g7Pcs = realizationG7.pitches.map((p) => p.pitchClassIdentity);
    expect(g7Pcs).toContain(5); // F (the 7th)
    expect(g7Pcs).toContain(7); // G (root)
    expect(g7Pcs).toContain(11); // B (3rd)
    expect(g7Pcs).toContain(2); // D (5th)

    // Metric must properly account for voice count differences with penalty
    const distance = computeVoiceLeadingDistance(realizationC.pitches, realizationG7.pitches);
    expect(distance).toBeGreaterThanOrEqual(12);
  });

  it("realizes supported chord extensions and tensions in contextual auto-voicing", () => {
    // ii7 (Dm7: D, F, A, C) -> V7 (G7: G, B, D, F) using structured HarmonicVariant
    // Common tone F (PC 5) should be retained smoothly without dropping the 7th extension
    const variantDm7: HarmonicVariant = Object.freeze({
      seventh: "minor7",
      extensions: Object.freeze([]),
      suspensions: Object.freeze([]),
      alterations: Object.freeze([]),
    });
    const chordDm7: ChordDefinition = Object.freeze({
      ...realizeHarmonyChord({ moduleId: "progressions", functionId: "ii" }, 0),
      baseQuality: "minor",
      variant: variantDm7,
    });

    const variantG7: HarmonicVariant = Object.freeze({
      seventh: "minor7",
      extensions: Object.freeze([]),
      suspensions: Object.freeze([]),
      alterations: Object.freeze([]),
    });
    const chordG7: ChordDefinition = Object.freeze({
      ...realizeHarmonyChord({ moduleId: "progressions", functionId: "V" }, 0),
      baseQuality: "dominant",
      variant: variantG7,
    });

    const dm7Input: InstrumentRealizationInput = {
      context: C_MAJOR_CONTEXT,
      chord: chordDm7,
      performance: createDefaultPerformance(),
    };
    const realizationDm7 = pianoProfile.realizeChord(dm7Input);

    const realizationG7 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: chordG7,
      performance: createDefaultPerformance(),
      previousPitches: realizationDm7.pitches,
    });

    // Realized Dm7 must contain 4 voices including the 7th extension C (PC 0)
    expect(realizationDm7.pitches.length).toBeGreaterThanOrEqual(4);
    const dm7Pcs = new Set(realizationDm7.pitches.map((p) => p.pitchClassIdentity));
    expect(dm7Pcs.has(2)).toBe(true); // D (root)
    expect(dm7Pcs.has(5)).toBe(true); // F (minor 3rd)
    expect(dm7Pcs.has(9)).toBe(true); // A (5th)
    expect(dm7Pcs.has(0)).toBe(true); // C (added 7th extension tone)

    // Realized G7 must contain 4 voices including the 7th extension F (PC 5)
    expect(realizationG7.pitches.length).toBeGreaterThanOrEqual(4);
    const g7Pcs = new Set(realizationG7.pitches.map((p) => p.pitchClassIdentity));
    expect(g7Pcs.has(7)).toBe(true); // G (root)
    expect(g7Pcs.has(11)).toBe(true); // B (major 3rd)
    expect(g7Pcs.has(2)).toBe(true); // D (5th)
    expect(g7Pcs.has(5)).toBe(true); // F (added 7th extension tone)

    // Contextual voice leading retains common tone F without dropping the added chord tone
    const dm7F = realizationDm7.pitches.find((p) => p.pitchClassIdentity === 5);
    expect(dm7F).toBeDefined();
    const g7F = realizationG7.pitches.find((p) => p.pitchClassIdentity === 5);
    expect(g7F).toBeDefined();
    expect(g7F!.midiNumber).toBe(dm7F!.midiNumber);

    // Also verifies that an extended chord with 9th tension realizes the 9th
    const variantDm9: HarmonicVariant = Object.freeze({
      seventh: "minor7",
      extensions: Object.freeze([9]),
      suspensions: Object.freeze([]),
      alterations: Object.freeze([]),
    });
    const chordDm9: ChordDefinition = Object.freeze({
      ...realizeHarmonyChord({ moduleId: "progressions", functionId: "ii" }, 0),
      baseQuality: "minor",
      variant: variantDm9,
    });
    const realizationDm9 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: chordDm9,
      performance: createDefaultPerformance(),
    });
    expect(realizationDm9.pitches.length).toBeGreaterThanOrEqual(4);
    const dm9Pcs = new Set(realizationDm9.pitches.map((p) => p.pitchClassIdentity));
    expect(dm9Pcs.has(4)).toBe(true); // E (added 9th tension tone: 2 + 14 = 16 = 4 mod 12)
  });
});
