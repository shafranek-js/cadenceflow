import type { HarmonicModuleId } from "../harmony/functions";
import { rulesForModule, secondaryDiminishedTarget, secondaryDominantTarget } from "./scoring";
import type { CompositionIntent } from "../progression/branch";
import { intentAdjustment } from "./intents";

export interface RecommendationFactor {
  readonly code: string;
  readonly contribution: number;
  readonly source: "function" | "path" | "variant" | "intent";
}

export interface RecommendationCandidate {
  readonly functionId: string;
  readonly score: number;
  readonly factors: readonly RecommendationFactor[];
}

export interface RecommendationResult {
  readonly contextHash: string;
  readonly bestMatch: RecommendationCandidate | null;
  readonly alternatives: readonly RecommendationCandidate[];
}

export interface RecommendationContext {
  readonly moduleId?: HarmonicModuleId;
  readonly currentFunctionId: string;
  readonly recentFunctionIds: readonly string[];
  readonly visibleFunctionIds: readonly string[];
  readonly variantEvidence?: Readonly<Record<string, number>>;
  readonly compositionIntent?: CompositionIntent;
}

const MIN_STRONG_SCORE = 68;

function baseScore(moduleId: HarmonicModuleId, from: string, to: string): RecommendationCandidate {
  const factors: RecommendationFactor[] = [];
  const currentTonicizationTarget =
    moduleId === "dark-harmony" ? secondaryDiminishedTarget(from) : secondaryDominantTarget(from);
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
  return { functionId: to, score, factors };
}

export function recommend(context: RecommendationContext): RecommendationResult {
  const moduleId = context.moduleId ?? "progressions";
  const candidates = context.visibleFunctionIds
    .filter((id) => id !== context.currentFunctionId)
    .map((id) => {
      const base = baseScore(moduleId, context.currentFunctionId, id);
      let score = base.score;
      const factors = [...base.factors];
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
      return {
        functionId: id,
        score,
        factors: Object.freeze(factors),
      } satisfies RecommendationCandidate;
    })
    .sort((a, b) => b.score - a.score || a.functionId.localeCompare(b.functionId));

  const strong = candidates.filter((candidate) => candidate.score >= MIN_STRONG_SCORE);
  const bestMatch = strong[0] ?? null;
  const alternatives = bestMatch ? strong.slice(1, 4) : [];
  return {
    contextHash: JSON.stringify([
      moduleId,
      context.currentFunctionId,
      context.recentFunctionIds,
      context.variantEvidence ?? {},
      context.compositionIntent ?? "neutral",
    ]),
    bestMatch,
    alternatives: Object.freeze(alternatives),
  };
}
