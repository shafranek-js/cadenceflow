import type { HarmonicModuleId } from "../harmony/functions";
import { recommendationVocabulary, topologyEntryForFunction } from "../harmony/moduleRegistry";
import { semanticTargetForFunction } from "../harmony/routing";
import type { ChordStep } from "../progression/step";
import type { Project } from "../project/project";
import { recommend, type RecommendationCandidate, type RecommendationResult } from "./engine";

export interface AlternativesTrayCandidate extends RecommendationCandidate {
  /** Stable identity for keyboard selection and deterministic UI assertions. */
  readonly key: string;
}

export interface AlternativesTraySnapshot {
  /** Stable Step that supplies the FROM context; Apply inserts after it. */
  readonly originStepId: string;
  readonly sourceFunctionId: string;
  readonly moduleId: HarmonicModuleId;
  readonly contextHash: string;
  readonly result: RecommendationResult;
  readonly candidates: readonly AlternativesTrayCandidate[];
  readonly blockedCandidates: readonly AlternativesTrayCandidate[];
}

function targetForStep(project: Project, step: ChordStep): string | undefined {
  const topology = topologyEntryForFunction(project.activeModule, step.harmonicFunction.functionId);
  return (
    step.harmonicFunction.targetId ??
    step.harmonicFunction.targetFunctionId ??
    topology?.targetId ??
    semanticTargetForFunction(project.activeModule, step.harmonicFunction.functionId)
  );
}

function candidateWithKey(
  contextHash: string,
  candidate: RecommendationCandidate,
): AlternativesTrayCandidate {
  return Object.freeze({
    ...candidate,
    key: `${contextHash}:${candidate.functionId}`,
  });
}

/**
 * Creates the read-only T203 projection for one stable chord Step.
 *
 * The recommendation engine remains the only scoring/rationale source. This
 * function only supplies the Step context and gives each returned candidate a
 * stable key for the transient tray.
 */
export function createAlternativesTraySnapshot(
  project: Project,
  originStepId: string,
): AlternativesTraySnapshot | null {
  const originStep = project.progression.steps.find((step) => step.id === originStepId);
  if (!originStep || originStep.kind !== "chord") return null;

  const targetIndex = project.progression.steps.findIndex((step) => step.id === originStepId);
  const recentFunctionIds = project.progression.steps
    .slice(0, targetIndex + 1)
    .filter((step): step is ChordStep => step.kind === "chord")
    .map((step) => step.harmonicFunction.functionId);
  const moduleId = project.activeModule;
  const currentTargetId = targetForStep(project, originStep);
  const result = recommend({
    moduleId,
    currentFunctionId: originStep.harmonicFunction.functionId,
    ...(currentTargetId ? { currentTargetId } : {}),
    recentFunctionIds,
    visibleFunctionIds: recommendationVocabulary(moduleId).map((identity) => identity.functionId),
    compositionIntent: "neutral",
    genreFocus: project.presentation.genreFocus ?? "all",
  });
  const contextHash = `${originStepId}:${result.contextHash}`;
  const bestAndAlternatives = [
    ...(result.bestMatch ? [result.bestMatch] : []),
    ...result.alternatives,
  ];
  const candidates = Object.freeze(
    bestAndAlternatives.map((candidate) => candidateWithKey(contextHash, candidate)),
  );
  const blockedCandidates = Object.freeze(
    result.blockedCandidates.map((candidate) => candidateWithKey(contextHash, candidate)),
  );

  return Object.freeze({
    originStepId,
    sourceFunctionId: originStep.harmonicFunction.functionId,
    moduleId,
    contextHash,
    result,
    candidates,
    blockedCandidates,
  });
}
