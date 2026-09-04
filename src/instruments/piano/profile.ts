import type { ChordDefinition } from "../../domain/harmony/chord";
import type { ChordStep } from "../../domain/progression/step";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import { realizeChord as realizeHarmonyChord } from "../../domain/harmony/realization";
import {
  exactPitch,
  normalizePitchClass,
  type DiatonicStep,
  type ExactPitch,
  type PitchSpelling,
} from "../../domain/harmony/pitch";
import type {
  ArticulationDescriptor,
  CardViewDescriptor,
  InstrumentProfile,
  InstrumentRealization,
  InstrumentRealizationInput,
  ValidationResult,
} from "../contracts";
import {
  applyRegisterOffset,
  contextualAutoVoicing,
  validateManualVoicing as validatePianoManualVoicing,
} from "./voicing";
import { resolveBassPitch } from "./bass";

const STEPS: readonly DiatonicStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PC: Readonly<Record<DiatonicStep, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const QUALITY_INTERVALS: Readonly<Record<ChordDefinition["baseQuality"], readonly number[]>> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  dominant: [0, 4, 7, 10],
};

function spellChordTone(root: PitchSpelling, semitone: number, toneIndex: number): PitchSpelling {
  const rootIndex = STEPS.indexOf(root.step);
  const letterOffset = toneIndex === 3 ? 6 : toneIndex * 2;
  const step = STEPS[(rootIndex + letterOffset) % 7]!;
  const targetPc = normalizePitchClass(NATURAL_PC[root.step] + root.alter + semitone);
  let alter = targetPc - NATURAL_PC[step];
  while (alter > 6) alter -= 12;
  while (alter < -6) alter += 12;
  return { step, alter };
}

export interface PreviewPianoRealization {
  readonly pitches: readonly ExactPitch[];
}

export function realizeBasicPreview(chord: ChordDefinition): PreviewPianoRealization {
  const intervals = QUALITY_INTERVALS[chord.baseQuality];
  const rootMidi = 60 + ((chord.rootPitchClass - 0 + 12) % 12);
  const pitches = intervals.map((semitone, index) => {
    const midi = rootMidi + semitone;
    return exactPitch(midi, spellChordTone(chord.spelling.root, semitone, index));
  });
  return Object.freeze({ pitches: Object.freeze(pitches) });
}

export const PIANO_CARD_VIEWS: readonly CardViewDescriptor[] = Object.freeze([
  Object.freeze({ id: "harmonic", label: "Harmonic" }),
  Object.freeze({ id: "piano", label: "Piano" }),
  Object.freeze({ id: "staff", label: "Staff" }),
]);

export const PIANO_ARTICULATIONS: readonly ArticulationDescriptor[] = Object.freeze([
  Object.freeze({ id: "block", label: "Block" }),
  Object.freeze({ id: "arp-up", label: "Arp Up" }),
  Object.freeze({ id: "arp-down", label: "Arp Down" }),
  Object.freeze({ id: "broken-chord", label: "Broken Chord" }),
  Object.freeze({ id: "humanized", label: "Humanized" }),
]);

export const pianoProfile: InstrumentProfile = Object.freeze({
  id: "piano",
  displayName: "Acoustic Piano",
  supportedCardViews(): readonly CardViewDescriptor[] {
    return PIANO_CARD_VIEWS;
  },
  supportedArticulations(): readonly ArticulationDescriptor[] {
    return PIANO_ARTICULATIONS;
  },
  validateManualVoicing(pitches: readonly ExactPitch[]): ValidationResult {
    return validatePianoManualVoicing(pitches);
  },
  realizeChord(input: InstrumentRealizationInput): InstrumentRealization {
    let upperPitches: readonly ExactPitch[];
    if (input.performance.voicingMode === "manual" && input.performance.manualVoicing?.length) {
      // Manual exact voicing is authoritative; register offset must NOT shift it
      upperPitches = input.performance.manualVoicing;
    } else {
      const autoPitches = contextualAutoVoicing(
        input.chord,
        input.performance,
        input.context,
        input.previousPitches,
      );
      upperPitches = applyRegisterOffset(autoPitches, input.performance.register);
    }

    const bassPitch = resolveBassPitch(
      input.chord,
      input.performance.bass,
      upperPitches,
      input.previousBassPitch,
    );

    return Object.freeze({
      pitches: Object.freeze(upperPitches),
      bassPitch,
    });
  },
});

export function realizeProgressionStepRealization(
  step: ChordStep,
  tonic: PitchClassIdentity,
  context?: import("../../domain/harmony/modules/types").HarmonicContext,
): InstrumentRealization {
  const actualContext = context ?? {
    tonic,
    mode: "major" as const,
    moduleId: step.harmonicFunction.moduleId,
    spellingContext: {
      tonic,
      mode: "major" as const,
    },
  };
  const chord = realizeHarmonyChord(step.harmonicFunction, tonic);
  return pianoProfile.realizeChord({
    context: actualContext,
    chord: {
      ...chord,
      variant: step.harmonicVariant,
    },
    performance: step.performance,
  });
}

export function realizeProgressionStepPitches(
  step: ChordStep,
  tonic: PitchClassIdentity,
  context?: import("../../domain/harmony/modules/types").HarmonicContext,
): readonly ExactPitch[] {
  return realizeProgressionStepRealization(step, tonic, context).pitches;
}
