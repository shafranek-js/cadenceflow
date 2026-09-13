import type { HarmonicContext } from "../../domain/harmony/modules/types";
import { realizeChord as realizeHarmonyChord } from "../../domain/harmony/realization";
import type { ExactPitch, PitchClassIdentity } from "../../domain/harmony/pitch";
import type { ProgressionStep } from "../../domain/progression/step";
import { pianoProfile } from "./profile";

export interface OrderedPianoRealization {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly upperPitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch | undefined;
}

export interface OrderedPianoRealizationInput {
  readonly steps: readonly ProgressionStep[];
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly previousPitches?: readonly ExactPitch[] | undefined;
  readonly previousBassPitch?: ExactPitch | undefined;
}

/**
 * Resolves authored progression steps once, in musical order, carrying the
 * previous upper voicing and bass through automatic voice leading. Rest Steps
 * advance time for consumers but do not create or reset a realization.
 */
export function realizeOrderedPianoProgression(
  input: OrderedPianoRealizationInput,
): readonly (OrderedPianoRealization | null)[] {
  let previousPitches = input.previousPitches;
  let previousBassPitch = input.previousBassPitch;

  const realizations = input.steps.map((step, stepIndex) => {
    if (step.kind === "rest") return null;

    const chord = realizeHarmonyChord(step.harmonicFunction, input.tonic);
    const realization = pianoProfile.realizeChord({
      context: input.context,
      chord: { ...chord, variant: step.harmonicVariant },
      performance: step.performance,
      ...(previousPitches ? { previousPitches } : {}),
      ...(previousBassPitch ? { previousBassPitch } : {}),
    });

    const ordered = Object.freeze({
      stepIndex,
      stepId: step.id,
      upperPitches: realization.pitches,
      bassPitch: realization.bassPitch,
    });
    // An explicit register is a Step-local performance override. It must change
    // this Step without turning its shifted realization into the voice-leading
    // context for later automatic Steps. Re-realize the unshifted context so
    // later Steps retain the same context they had before this local edit.
    const contextRealization =
      step.performance.register === "auto"
        ? realization
        : pianoProfile.realizeChord({
            context: input.context,
            chord: { ...chord, variant: step.harmonicVariant },
            performance: { ...step.performance, register: "auto" },
            ...(previousPitches ? { previousPitches } : {}),
            ...(previousBassPitch ? { previousBassPitch } : {}),
          });
    previousPitches = contextRealization.pitches;
    previousBassPitch = contextRealization.bassPitch;
    return ordered;
  });

  return Object.freeze(realizations);
}
