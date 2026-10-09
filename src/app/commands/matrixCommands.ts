import { realizeChord } from "../../domain/harmony/realization";
import type { HarmonicFunctionIdentity, HarmonicModuleId } from "../../domain/harmony/functions";
import { getHarmonicModule, recommendationVocabulary } from "../../domain/harmony/moduleRegistry";
import type { Project, MatrixCardTemplateState } from "../../domain/project/project";
import { resolveStepCreationDefaults } from "../../domain/project/defaults";
import { snapshotStepPerformance, type ChordStep } from "../../domain/progression/step";
import type { AppliedCommand, ProjectCommand } from ".";

export interface AddMatrixPreviewPayload {
  readonly functionId: string;
  readonly stepId: string;
  readonly nowIso: string;
}

export type AddMatrixPreviewCommand = ProjectCommand<AddMatrixPreviewPayload> & {
  readonly type: "matrix/add-preview";
};

export function identityForMatrixFunction(
  project: Project,
  functionId: string,
  moduleId: HarmonicModuleId = project.activeModule,
): HarmonicFunctionIdentity {
  const vocabulary = recommendationVocabulary(moduleId);
  const found = vocabulary.find((candidate) => candidate.functionId === functionId);
  if (found) return found;
  const card = getHarmonicModule(moduleId).topology.cards.find(
    (c) => c.identity.functionId === functionId,
  );
  if (card) return card.identity;
  throw new RangeError(`Unsupported ${moduleId} function: ${functionId}`);
}

function templateFor(
  project: Project,
  functionId: string,
  moduleId: HarmonicModuleId = project.activeModule,
): MatrixCardTemplateState | undefined {
  return project.moduleTemplateStates[moduleId]?.cards[functionId];
}

export function createMatrixChordStep(
  project: Project,
  functionId: string,
  stepId: string,
  moduleId: HarmonicModuleId = project.activeModule,
): ChordStep {
  const identity = identityForMatrixFunction(project, functionId, moduleId);
  const chord = realizeChord(identity, project.tonic);
  const template = templateFor(project, functionId, moduleId);
  const resolved = resolveStepCreationDefaults(project.defaults.piano, template?.explicitOverrides);
  const performance = snapshotStepPerformance(
    Object.freeze({
      ...resolved.performance,
      ...(template?.manualPreviewVoicing
        ? {
            voicingMode: "manual" as const,
            manualVoicing: Object.freeze([...template.manualPreviewVoicing]),
          }
        : resolved.performance.manualVoicing
          ? { manualVoicing: Object.freeze([...resolved.performance.manualVoicing]) }
          : {}),
    }),
  );
  const duration = resolved.duration;
  return Object.freeze({
    id: stepId,
    kind: "chord",
    harmonicFunction: chord.harmonicFunction,
    harmonicVariant: template?.harmonicVariantOverride ?? chord.variant,
    duration,
    performance,
    cardView: template?.cardViewOverride ?? project.presentation.globalMatrixCardView,
  });
}

export function addMatrixPreview(
  project: Project,
  command: AddMatrixPreviewCommand,
): AppliedCommand {
  const step = createMatrixChordStep(project, command.payload.functionId, command.payload.stepId);
  const next: Project = Object.freeze({
    ...project,
    updatedAt: command.payload.nowIso,
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([...project.progression.steps, step]),
    }),
  });
  return {
    project: next,
    // The inverse restores the exact previous Progression rather than issuing
    // `progression/remove-step`. That command does not delete a Step: it clears a chord in place by
    // turning it into a rest (delegating to `setSystemRest`). Using it here made Undo of an "add"
    // leave an empty rest behind instead of removing the Step. A snapshot is what the other
    // add/append commands use, and it also brings back `selectedStepId` and `loopRegion` exactly as
    // they were.
    inverse: {
      type: "progression/restore",
      payload: { progression: project.progression, nowIso: command.payload.nowIso },
    },
  };
}
