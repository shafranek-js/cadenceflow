import type { ChordDefinition } from "../../domain/harmony/chord";
import type { ChordStep } from "../../domain/progression/step";
import {
  stepTranspositionSemitones,
  transposeExactPitch,
} from "../../domain/progression/transposition";
import { exactPitch, type ExactPitch, type PitchClassIdentity } from "../../domain/harmony/pitch";
import { realizeChord as realizeHarmonyChord } from "../../domain/harmony/realization";
import { resolveChordTones } from "../../domain/harmony/chordTones";
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

export interface PreviewPianoRealization {
  readonly pitches: readonly ExactPitch[];
}

export function realizeBasicPreview(chord: ChordDefinition): PreviewPianoRealization {
  const rootMidi = 60 + ((chord.rootPitchClass - 0 + 12) % 12);
  const pitches = resolveChordTones(chord).map((tone) =>
    exactPitch(rootMidi + tone.semitoneInterval, tone.spelling),
  );
  return Object.freeze({ pitches: Object.freeze(pitches) });
}

export const PIANO_CARD_VIEWS: readonly CardViewDescriptor[] = Object.freeze([
  Object.freeze({ id: "harmonic", label: "Harmonic" }),
  Object.freeze({ id: "piano", label: "Piano" }),
  Object.freeze({ id: "staff", label: "Staff" }),
  Object.freeze({ id: "guitar", label: "Guitar" }),
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
      input.concertTranspositionSemitones ?? 0,
    );

    return Object.freeze({
      pitches: Object.freeze(upperPitches),
      bassPitch,
    });
  },
});

export function realizeProgressionStepSourceRealization(
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
    concertTranspositionSemitones: stepTranspositionSemitones(step),
  });
}

export function realizeProgressionStepRealization(
  step: ChordStep,
  tonic: PitchClassIdentity,
  context?: import("../../domain/harmony/modules/types").HarmonicContext,
): InstrumentRealization {
  const realization = realizeProgressionStepSourceRealization(step, tonic, context);
  const semitones = stepTranspositionSemitones(step);
  return Object.freeze({
    pitches: Object.freeze(
      realization.pitches.map((pitch) => transposeExactPitch(pitch, semitones)),
    ),
    ...(realization.bassPitch
      ? { bassPitch: transposeExactPitch(realization.bassPitch, semitones) }
      : {}),
  });
}

export function realizeProgressionStepPitches(
  step: ChordStep,
  tonic: PitchClassIdentity,
  context?: import("../../domain/harmony/modules/types").HarmonicContext,
): readonly ExactPitch[] {
  return realizeProgressionStepRealization(step, tonic, context).pitches;
}
