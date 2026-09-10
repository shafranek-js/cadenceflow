import type { Project } from "../../domain/project/project";
import type { HarmonicFunctionIdentity } from "../../domain/harmony/functions";
import { getHarmonicModule } from "../../domain/harmony/moduleRegistry";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import type { ChordDefinition } from "../../domain/harmony/chord";
import type { ChordStep } from "../../domain/progression/step";
import type { ExactPitch } from "../../domain/harmony/pitch";
import type { AudioNoteEvent } from "../../audio/contracts";
import { realizeChord } from "../../domain/harmony/realization";
import {
  createMatrixChordStep,
  identityForMatrixFunction,
} from "../../app/commands/matrixCommands";
import { realizeStepAudioEvents } from "../../audio/eventRealizer";

export interface PreviousHarmonicRealizationContext {
  readonly previousPitches?: readonly ExactPitch[] | undefined;
  readonly previousBassPitch?: ExactPitch | undefined;
}

export interface MatrixCardPreviewRealization {
  readonly functionId: string;
  readonly identity: HarmonicFunctionIdentity;
  readonly chord: ChordDefinition;
  readonly step: ChordStep;
  readonly pitches: readonly ExactPitch[];
  readonly upperPitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch | undefined;
  readonly events: readonly AudioNoteEvent[];
}

/**
 * Resolves the previous chord realization context from the latest progression or branch chord step
 * to enable continuous, smooth voice leading during preview and audition.
 */
export function resolvePreviousHarmonicContext(
  project: Project,
): PreviousHarmonicRealizationContext | undefined {
  const steps = project.temporaryBranch?.steps ?? project.progression.steps;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step && step.kind === "chord") {
      const context: HarmonicContext = {
        tonic: project.tonic,
        mode: getHarmonicModule(project.activeModule).mode,
        moduleId: project.activeModule,
        spellingContext: {
          tonic: project.tonic,
          mode: getHarmonicModule(project.activeModule).mode,
        },
      };
      const realized = realizeStepAudioEvents({
        step,
        tonic: project.tonic,
        context,
        tempoBpm: project.globalTiming.tempoBpm,
      });
      return {
        previousPitches: realized.upperPitches,
        previousBassPitch: realized.bassPitch,
      };
    }
  }
  return undefined;
}

/**
 * Canonical Matrix Card preview realization.
 * Piano Card View intentionally uses upperPitches only. Staff and audition retain
 * the full realization in pitches/events, including an independent bass when present.
 */
export function realizeMatrixCardPreview(
  project: Project,
  functionId: string,
  previous?: PreviousHarmonicRealizationContext,
): MatrixCardPreviewRealization {
  const identity = identityForMatrixFunction(project, functionId);
  const baseChord = realizeChord(identity, project.tonic);
  const step = createMatrixChordStep(project, functionId, `preview-${functionId}`);
  const chord: ChordDefinition = Object.freeze({
    ...baseChord,
    variant: step.harmonicVariant,
  });

  const context: HarmonicContext = {
    tonic: project.tonic,
    mode: getHarmonicModule(project.activeModule).mode,
    moduleId: project.activeModule,
    spellingContext: {
      tonic: project.tonic,
      mode: getHarmonicModule(project.activeModule).mode,
    },
  };

  const realized = realizeStepAudioEvents({
    step,
    tonic: project.tonic,
    context,
    tempoBpm: project.globalTiming.tempoBpm,
    ...(previous?.previousPitches ? { previousPitches: previous.previousPitches } : {}),
    ...(previous?.previousBassPitch ? { previousBassPitch: previous.previousBassPitch } : {}),
  });

  const allPitches = realized.bassPitch
    ? Object.freeze([realized.bassPitch, ...realized.upperPitches])
    : realized.upperPitches;

  return Object.freeze({
    functionId,
    identity,
    chord,
    step,
    pitches: allPitches,
    upperPitches: realized.upperPitches,
    bassPitch: realized.bassPitch,
    events: realized.events,
  });
}
