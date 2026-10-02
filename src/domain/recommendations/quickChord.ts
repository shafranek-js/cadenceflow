import { formatChordSymbol } from "../harmony/chord";
import {
  getHarmonicModule,
  recommendationVocabulary,
  topologyEntryForFunction,
} from "../harmony/moduleRegistry";
import {
  evaluateHarmonicRoute,
  semanticTargetForFunction,
  type HarmonicRouteDecision,
} from "../harmony/routing";
import { getFunctionSemantics } from "../harmony/functionSemantics";
import { realizeChord } from "../harmony/realization";
import type { HarmonicFunctionIdentity } from "../harmony/functions";
import type { Project } from "../project/project";
import { recommend } from "./engine";

export interface QuickChordRouteContext {
  readonly currentFunctionId?: string;
  readonly currentTargetId?: string;
}

export interface QuickChordCandidate {
  readonly functionId: string;
  readonly chordLabel: string;
  readonly categoryLabel: string;
  readonly title: string;
  readonly explanation: string;
  readonly routeStatus: HarmonicRouteDecision["status"];
  readonly routeReasonCode: HarmonicRouteDecision["reasonCode"];
  readonly routeMessage?: string;
  readonly directedTargetId?: string;
  readonly recommendationScore?: number;
  readonly searchText: string;
}

const CATEGORY_LABELS: Readonly<Record<HarmonicFunctionIdentity["category"], string>> = {
  core: "Core harmony",
  "secondary-dominant": "Secondary dominant",
  "modal-interchange": "Modal interchange",
  "secondary-diminished": "Secondary diminished",
  neapolitan: "Neapolitan color",
  "chromatic-color": "Chromatic color",
};

function allIdentities(project: Project): readonly HarmonicFunctionIdentity[] {
  const seen = new Set<string>();
  const identities: HarmonicFunctionIdentity[] = [];
  const candidates = [
    ...getHarmonicModule(project.activeModule).topology.cards.map((entry) => entry.identity),
    ...recommendationVocabulary(project.activeModule),
  ];
  for (const identity of candidates) {
    if (seen.has(identity.functionId)) continue;
    seen.add(identity.functionId);
    identities.push(identity);
  }
  return identities;
}

function routeTarget(project: Project, functionId: string): string | undefined {
  const entry = topologyEntryForFunction(project.activeModule, functionId);
  return (
    entry?.targetId ??
    entry?.identity.targetId ??
    entry?.identity.targetFunctionId ??
    semanticTargetForFunction(project.activeModule, functionId)
  );
}

function explanationFor(identity: HarmonicFunctionIdentity, route: HarmonicRouteDecision): string {
  if (route.status === "requires-confirmation") return route.message;
  const semantics = getFunctionSemantics(identity.functionId);
  if (route.directedTargetId) {
    return `Directed target: ${route.directedTargetId}. ${semantics.description}`;
  }
  return semantics.description;
}

/**
 * Builds the deterministic read-only result set for Quick Chord. Applying a
 * result is intentionally outside this helper so the UI cannot bypass App's
 * canonical add/route-guard path.
 */
export function createQuickChordCandidates(
  project: Project,
  context: QuickChordRouteContext = {},
): readonly QuickChordCandidate[] {
  const identities = allIdentities(project);
  const recommendation = context.currentFunctionId
    ? recommend({
        moduleId: project.activeModule,
        currentFunctionId: context.currentFunctionId,
        ...(context.currentTargetId ? { currentTargetId: context.currentTargetId } : {}),
        recentFunctionIds: [context.currentFunctionId],
        visibleFunctionIds: identities.map((identity) => identity.functionId),
        genreFocus: project.presentation.genreFocus ?? "all",
      })
    : null;
  const scoreByFunctionId = new Map(
    [
      ...(recommendation?.bestMatch ? [recommendation.bestMatch] : []),
      ...(recommendation?.alternatives ?? []),
      ...(recommendation?.blockedCandidates ?? []),
    ].map((candidate) => [candidate.functionId, candidate.score]),
  );

  return Object.freeze(
    identities
      .map((identity) => {
        const targetId = routeTarget(project, identity.functionId);
        const route = evaluateHarmonicRoute(
          {
            moduleId: project.activeModule,
            ...(context.currentFunctionId ? { currentFunctionId: context.currentFunctionId } : {}),
            ...(context.currentTargetId ? { currentTargetId: context.currentTargetId } : {}),
          },
          identity.functionId,
          targetId,
        );
        const chord = realizeChord(identity, project.tonic);
        const semantics = getFunctionSemantics(identity.functionId);
        const categoryLabel = CATEGORY_LABELS[identity.category];
        const chordLabel = formatChordSymbol(chord);
        const explanation = explanationFor(identity, route);
        const recommendationScore = scoreByFunctionId.get(identity.functionId);
        return Object.freeze({
          functionId: identity.functionId,
          chordLabel,
          categoryLabel,
          title: semantics.title,
          explanation,
          routeStatus: route.status,
          routeReasonCode: route.reasonCode,
          ...(route.message ? { routeMessage: route.message } : {}),
          ...(route.directedTargetId ? { directedTargetId: route.directedTargetId } : {}),
          ...(recommendationScore !== undefined ? { recommendationScore } : {}),
          searchText: [
            identity.functionId,
            chordLabel,
            categoryLabel,
            semantics.title,
            semantics.description,
            explanation,
          ]
            .join(" ")
            .toLowerCase(),
        });
      })
      .sort(
        (left, right) =>
          Number(left.routeStatus === "requires-confirmation") -
            Number(right.routeStatus === "requires-confirmation") ||
          (right.recommendationScore ?? -1) - (left.recommendationScore ?? -1) ||
          left.functionId.localeCompare(right.functionId),
      ),
  );
}
