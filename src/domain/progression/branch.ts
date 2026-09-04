import type { Progression } from "./progression";
import type { ProgressionStep } from "./step";

export type CompositionIntent = "neutral" | "resolve" | "build-tension" | "darken-emotional" | "surprise" | "smooth-voice-leading";

export interface TemporaryBranch {
  readonly id: string;
  readonly originStepId?: string;
  readonly originAtEnd: boolean;
  readonly rejoinStepId?: string;
  readonly steps: readonly ProgressionStep[];
  readonly compositionIntent: CompositionIntent;
}

function indexOfStep(progression: Progression, stepId: string): number {
  return progression.steps.findIndex((step) => step.id === stepId);
}

export function startTemporaryBranch(progression: Progression, id: string, originStepId?: string, compositionIntent: CompositionIntent = "neutral"): TemporaryBranch {
  if (originStepId !== undefined && indexOfStep(progression, originStepId) < 0) throw new RangeError(`Unknown branch origin step: ${originStepId}`);
  return Object.freeze({
    id,
    ...(originStepId ? { originStepId } : {}),
    originAtEnd: originStepId === undefined,
    steps: Object.freeze([]),
    compositionIntent,
  });
}

export function appendBranchStep(branch: TemporaryBranch, step: ProgressionStep): TemporaryBranch {
  if (branch.steps.some((candidate) => candidate.id === step.id)) throw new Error(`Duplicate branch step id: ${step.id}`);
  return Object.freeze({ ...branch, steps: Object.freeze([...branch.steps, step]) });
}

export function setBranchRejoin(progression: Progression, branch: TemporaryBranch, rejoinStepId?: string): TemporaryBranch {
  if (branch.originAtEnd) {
    if (rejoinStepId !== undefined) throw new Error("A branch starting at the progression end cannot rejoin an earlier original step");
    const { rejoinStepId: _discard, ...withoutRejoin } = branch;
    return Object.freeze(withoutRejoin);
  }
  if (rejoinStepId === undefined) {
    const { rejoinStepId: _discard, ...withoutRejoin } = branch;
    return Object.freeze(withoutRejoin);
  }
  const originIndex = indexOfStep(progression, branch.originStepId!);
  const rejoinIndex = indexOfStep(progression, rejoinStepId);
  if (rejoinIndex < 0) throw new RangeError(`Unknown branch rejoin step: ${rejoinStepId}`);
  if (rejoinIndex <= originIndex) throw new RangeError("Rejoin step must occur after the branch origin");
  return Object.freeze({ ...branch, rejoinStepId });
}

export interface BranchComparison {
  readonly prefix: readonly ProgressionStep[];
  readonly originalInterval: readonly ProgressionStep[];
  readonly alternative: readonly ProgressionStep[];
  readonly suffix: readonly ProgressionStep[];
}

export function compareBranch(progression: Progression, branch: TemporaryBranch): BranchComparison {
  if (branch.originAtEnd) {
    return Object.freeze({ prefix: progression.steps, originalInterval: Object.freeze([]), alternative: branch.steps, suffix: Object.freeze([]) });
  }
  const originIndex = indexOfStep(progression, branch.originStepId!);
  if (originIndex < 0) throw new RangeError(`Unknown branch origin step: ${branch.originStepId}`);
  const rejoinIndex = branch.rejoinStepId ? indexOfStep(progression, branch.rejoinStepId) : progression.steps.length;
  if (branch.rejoinStepId && rejoinIndex <= originIndex) throw new RangeError("Rejoin step must occur after the branch origin");
  return Object.freeze({
    prefix: Object.freeze(progression.steps.slice(0, originIndex + 1)),
    originalInterval: Object.freeze(progression.steps.slice(originIndex + 1, rejoinIndex)),
    alternative: branch.steps,
    suffix: Object.freeze(progression.steps.slice(rejoinIndex)),
  });
}

export function branchRecommendationPath(progression: Progression, branch: TemporaryBranch): readonly ProgressionStep[] {
  const comparison = compareBranch(progression, branch);
  return Object.freeze([...comparison.prefix, ...branch.steps]);
}

export function commitBranch(progression: Progression, branch: TemporaryBranch, selectedBranchStepIds?: readonly string[]): Progression {
  if (!branch.originAtEnd && !branch.rejoinStepId) throw new Error("Mid-progression branch requires an explicit rejoin point before commit");
  const comparison = compareBranch(progression, branch);
  const selected = selectedBranchStepIds
    ? branch.steps.filter((step) => selectedBranchStepIds.includes(step.id))
    : branch.steps;
  if (selectedBranchStepIds && selected.length === 0) throw new Error("Selective branch commit requires at least one selected branch step");
  const selectedStepId = selected.at(-1)?.id ?? comparison.prefix.at(-1)?.id;
  return Object.freeze({
    ...progression,
    steps: Object.freeze([...comparison.prefix, ...selected, ...comparison.suffix]),
    ...(selectedStepId ? { selectedStepId } : {}),
  });
}
