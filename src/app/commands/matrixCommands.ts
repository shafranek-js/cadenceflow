import { realizeChord } from "../../domain/harmony/realization";
import type { HarmonicFunctionIdentity } from "../../domain/harmony/functions";
import { recommendationVocabulary } from "../../domain/harmony/moduleRegistry";
import type { Project, MatrixCardTemplateState } from "../../domain/project/project";
import { resolveStepCreationDefaults } from "../../domain/project/defaults";
import { snapshotStepPerformance, type ChordStep } from "../../domain/progression/step";
import type { AppliedCommand, ProjectCommand } from ".";

export interface AddMatrixPreviewPayload {
  readonly functionId: string;
  readonly stepId: string;
  readonly nowIso: string;
}

export type AddMatrixPreviewCommand = ProjectCommand<AddMatrixPreviewPayload> & { readonly type: "matrix/add-preview" };

export function identityForMatrixFunction(project: Project, functionId: string): HarmonicFunctionIdentity {
  const identity = recommendationVocabulary(project.activeModule).find((candidate) => candidate.functionId === functionId);
  if (!identity) throw new RangeError(`Unsupported ${project.activeModule} function: ${functionId}`);
  return identity;
}

function templateFor(project: Project, functionId: string): MatrixCardTemplateState | undefined {
  return project.moduleTemplateStates[project.activeModule].cards[functionId];
}

export function createMatrixChordStep(project: Project, functionId: string, stepId: string): ChordStep {
  const identity = identityForMatrixFunction(project, functionId);
  const chord = realizeChord(identity, project.tonic);
  const template = templateFor(project, functionId);
  const resolved = resolveStepCreationDefaults(project.defaults.piano, template?.explicitOverrides);
  const performance = snapshotStepPerformance(Object.freeze({
    ...resolved.performance,
    ...(template?.manualPreviewVoicing
      ? { voicingMode: "manual" as const, manualVoicing: Object.freeze([...template.manualPreviewVoicing]) }
      : resolved.performance.manualVoicing ? { manualVoicing: Object.freeze([...resolved.performance.manualVoicing]) } : {}),
  }));
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

export function addMatrixPreview(project: Project, command: AddMatrixPreviewCommand): AppliedCommand {
  const step = createMatrixChordStep(project, command.payload.functionId, command.payload.stepId);
  const next: Project = Object.freeze({
    ...project,
    updatedAt: command.payload.nowIso,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze([...project.progression.steps, step]) }),
  });
  return {
    project: next,
    inverse: { type: "progression/remove-step", payload: { stepId: step.id, nowIso: command.payload.nowIso } },
  };
}
