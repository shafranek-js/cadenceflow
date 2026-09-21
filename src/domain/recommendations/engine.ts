import type { HarmonicModuleId } from "../harmony/functions";
import { rulesForModule, secondaryDiminishedTarget, secondaryDominantTarget } from "./scoring";
import type { CompositionIntent } from "../progression/branch";
import { intentAdjustment } from "./intents";
import { type GenreFocusId, isFunctionRelevantToGenre } from "../harmony/functionSemantics";
import {
  evaluateHarmonicRoute,
  isDirectedTensionFunction,
  semanticTargetForFunction,
  type HarmonicRouteReasonCode,
} from "../harmony/routing";

export interface RecommendationFactor {
  readonly code: string;
  readonly contribution: number;
  readonly source: "function" | "path" | "variant" | "intent";
}

export interface RecommendationCandidate {
  readonly functionId: string;
  readonly score: number;
  readonly factors: readonly RecommendationFactor[];
  readonly routeStatus?: "allowed" | "requires-confirmation";
  readonly routeReason?: HarmonicRouteReasonCode;
  readonly routeMessage?: string;
}

export interface RecommendationResult {
  readonly contextHash: string;
  readonly bestMatch: RecommendationCandidate | null;
  readonly alternatives: readonly RecommendationCandidate[];
  readonly blockedCandidates: readonly RecommendationCandidate[];
}

export interface RecommendationContext {
  readonly moduleId?: HarmonicModuleId;
  readonly currentFunctionId: string;
  readonly currentTargetId?: string;
  readonly recentFunctionIds: readonly string[];
  readonly visibleFunctionIds: readonly string[];
  readonly variantEvidence?: Readonly<Record<string, number>>;
  readonly compositionIntent?: CompositionIntent;
  readonly genreFocus?: GenreFocusId;
}

const MIN_STRONG_SCORE = 68;

const PRIMARY_DIATONIC_PROGRESSIONS = new Set(["I", "IV", "V"]);
const MODAL_BORROWED_PROGRESSIONS = new Set(["bIII", "bVI", "iv", "bVII"]);
function isTensionChord(functionId: string, targetId?: string): boolean {
  return isDirectedTensionFunction(functionId, targetId);
}

function baseScore(
  moduleId: HarmonicModuleId,
  from: string,
  to: string,
  currentTargetId?: string,
): RecommendationCandidate {
  const factors: RecommendationFactor[] = [];
  const currentTonicizationTarget = semanticTargetForFunction(
    moduleId,
    from,
    currentTargetId ??
      (moduleId === "dark-harmony"
        ? secondaryDiminishedTarget(from)
        : secondaryDominantTarget(from)),
  );
  let score = 30;

  if (currentTonicizationTarget === to) {
    score = 112;
    factors.push({
      code:
        moduleId === "dark-harmony"
          ? "secondary-diminished-resolution"
          : "secondary-dominant-resolution",
      contribution: 82,
      source: "function",
    });
  } else if (moduleId === "dark-harmony" && to.startsWith("vii°7/")) {
    // A contextual diminished approach can be recommended when its target is a
    // strong destination from the current function. This is what allows the
    // expanded strip to surface useful non-baseline secondary diminished cards.
    const target = secondaryDiminishedTarget(to)!;
    const targetRule = rulesForModule(moduleId).find(
      (candidate) => candidate.from === from && candidate.to === target,
    );
    if (targetRule) {
      score = Math.max(MIN_STRONG_SCORE, targetRule.score - 8);
      factors.push({
        code: "approach-via-secondary-diminished",
        contribution: score - 30,
        source: "function",
      });
    }
  } else {
    const rule = rulesForModule(moduleId).find(
      (candidate) => candidate.from === from && candidate.to === to,
    );
    if (rule) {
      score = rule.score;
      factors.push({ code: rule.factor, contribution: rule.score - 30, source: "function" });
    }
  }

  // Modal Corridor scoring remains descriptive; strict eligibility is applied
  // by evaluateHarmonicRoute below so weak choices are never promoted merely
  // to fill an Alternative slot.
  if (moduleId === "progressions") {
    if (PRIMARY_DIATONIC_PROGRESSIONS.has(from) && MODAL_BORROWED_PROGRESSIONS.has(to)) {
      if (score < 72) {
        const contribution = 72 - score;
        score = 72;
        factors.push({ code: "modal-corridor-entry", contribution, source: "function" });
      }
    } else if (MODAL_BORROWED_PROGRESSIONS.has(from) && PRIMARY_DIATONIC_PROGRESSIONS.has(to)) {
      if (score < 78) {
        const contribution = 78 - score;
        score = 78;
        factors.push({ code: "modal-corridor-return", contribution, source: "function" });
      }
    }
  }

  return { functionId: to, score, factors };
}

export function recommend(context: RecommendationContext): RecommendationResult {
  const moduleId = context.moduleId ?? "progressions";
  const directedTargetId = semanticTargetForFunction(
    moduleId,
    context.currentFunctionId,
    context.currentTargetId,
  );
  const candidates = context.visibleFunctionIds
    .filter((id) => id !== context.currentFunctionId)
    .map((id) => {
      const base = baseScore(moduleId, context.currentFunctionId, id, context.currentTargetId);
      let score = base.score;
      const factors = [...base.factors];
      const route = evaluateHarmonicRoute(
        {
          moduleId,
          currentFunctionId: context.currentFunctionId,
          ...(context.currentTargetId ? { currentTargetId: context.currentTargetId } : {}),
        },
        id,
        semanticTargetForFunction(moduleId, id),
      );
      const previous = context.recentFunctionIds.at(-2);
      if (previous && previous === id) {
        score -= 8;
        factors.push({ code: "immediate-backtrack", contribution: -8, source: "path" });
      }
      const variantBoost = context.variantEvidence?.[id] ?? 0;
      if (variantBoost !== 0) {
        score += variantBoost;
        factors.push({ code: "variant-tendency", contribution: variantBoost, source: "variant" });
      }
      const intent = intentAdjustment(
        context.compositionIntent ?? "neutral",
        moduleId,
        context.currentFunctionId,
        id,
      );
      if (intent) {
        score += intent.amount;
        factors.push({ code: intent.code, contribution: intent.amount, source: "intent" });
      }
      if (context.genreFocus && context.genreFocus !== "all") {
        if (isFunctionRelevantToGenre(id, context.genreFocus)) {
          score += 12;
          factors.push({ code: "genre-affinity", contribution: 12, source: "intent" });
        }
      }
      return {
        functionId: id,
        score,
        factors: Object.freeze(factors),
        routeStatus: route.status,
        ...(route.status === "requires-confirmation"
          ? {
              routeReason: route.reasonCode,
              routeMessage: route.message,
            }
          : {}),
      } satisfies RecommendationCandidate;
    })
    .sort((a, b) => b.score - a.score || a.functionId.localeCompare(b.functionId));

  const blockedCandidates = candidates.filter(
    (candidate) => candidate.routeStatus === "requires-confirmation",
  );
  const strong = candidates.filter(
    (candidate) =>
      candidate.routeStatus !== "requires-confirmation" && candidate.score >= MIN_STRONG_SCORE,
  );
  const targetCandidate = directedTargetId
    ? candidates.find((candidate) => candidate.functionId === directedTargetId)
    : undefined;
  const bestMatch = directedTargetId ? (targetCandidate ?? null) : (strong[0] ?? null);
  const alternatives = bestMatch
    ? strong
        .filter(
          (candidate) =>
            candidate.functionId !== bestMatch.functionId &&
            (!directedTargetId ||
              !isTensionChord(
                candidate.functionId,
                semanticTargetForFunction(moduleId, candidate.functionId),
              )),
        )
        .slice(0, 3)
    : [];
  return {
    contextHash: JSON.stringify([
      moduleId,
      context.currentFunctionId,
      context.currentTargetId ?? null,
      context.recentFunctionIds,
      context.variantEvidence ?? {},
      context.compositionIntent ?? "neutral",
      context.genreFocus ?? "all",
    ]),
    bestMatch,
    alternatives: Object.freeze(alternatives),
    blockedCandidates: Object.freeze(blockedCandidates),
  };
}
