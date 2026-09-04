import type { HarmonicModuleId } from "../harmony/functions";

export interface RecommendationRule {
  readonly from: string;
  readonly to: string;
  readonly score: number;
  readonly factor: string;
}

export const PROGRESSIONS_RULES: readonly RecommendationRule[] = [
  { from: "I", to: "V", score: 92, factor: "tonic-to-dominant" },
  { from: "I", to: "vi", score: 86, factor: "tonic-to-relative-minor" },
  { from: "I", to: "IV", score: 82, factor: "tonic-to-subdominant" },
  { from: "vi", to: "IV", score: 90, factor: "relative-minor-to-subdominant" },
  { from: "vi", to: "ii", score: 84, factor: "predominant-expansion" },
  { from: "vi", to: "V", score: 80, factor: "minor-to-dominant" },
  { from: "IV", to: "V", score: 96, factor: "predominant-to-dominant" },
  { from: "IV", to: "I", score: 82, factor: "plagal-resolution" },
  { from: "IV", to: "ii", score: 76, factor: "predominant-variation" },
  { from: "ii", to: "V", score: 100, factor: "predominant-to-dominant" },
  { from: "ii", to: "IV", score: 74, factor: "predominant-color" },
  { from: "V", to: "I", score: 110, factor: "dominant-resolution" },
  { from: "V", to: "vi", score: 88, factor: "deceptive-resolution" },
  { from: "iii", to: "vi", score: 88, factor: "mediant-to-relative-minor" },
  { from: "iii", to: "IV", score: 72, factor: "stepwise-bass-motion" },
  { from: "vii°", to: "I", score: 106, factor: "leading-tone-resolution" },
  { from: "bVII", to: "IV", score: 92, factor: "modal-backdoor-motion" },
  { from: "bVII", to: "I", score: 84, factor: "modal-tonic-return" },
  { from: "iv", to: "I", score: 98, factor: "minor-plagal-resolution" },
  { from: "bVI", to: "V", score: 94, factor: "chromatic-predominant-to-dominant" },
  { from: "bIII", to: "bVI", score: 84, factor: "borrowed-mediant-chain" },
];

/** Compact v1 Dark Harmony ruleset. It intentionally ranks the curated vocabulary
 * without pretending to be an exhaustive harmony textbook. */
export const DARK_HARMONY_RULES: readonly RecommendationRule[] = [
  { from: "i", to: "iv", score: 92, factor: "minor-tonic-to-predominant" },
  { from: "i", to: "V", score: 90, factor: "minor-tonic-to-functional-dominant" },
  { from: "i", to: "VI", score: 82, factor: "minor-tonic-to-submediant" },
  { from: "ii°", to: "V", score: 102, factor: "minor-predominant-to-dominant" },
  { from: "III", to: "VI", score: 88, factor: "minor-mediant-to-submediant" },
  { from: "iv", to: "V", score: 104, factor: "minor-predominant-to-dominant" },
  { from: "iv", to: "i", score: 82, factor: "minor-plagal-return" },
  { from: "V", to: "i", score: 114, factor: "minor-dominant-resolution" },
  { from: "V", to: "VI", score: 88, factor: "minor-deceptive-resolution" },
  { from: "VI", to: "ii°", score: 84, factor: "minor-submediant-to-predominant" },
  { from: "VI", to: "iv", score: 80, factor: "minor-submediant-to-subdominant" },
  { from: "vii°", to: "i", score: 112, factor: "minor-leading-tone-resolution" },
  { from: "N6", to: "V", score: 108, factor: "neapolitan-to-dominant" },
  { from: "CT°7", to: "i", score: 98, factor: "common-tone-diminished-return" },
  { from: "Pass°7", to: "V", score: 84, factor: "chromatic-passing-to-dominant" },
  { from: "ChrMed+M3", to: "iv", score: 76, factor: "chromatic-mediant-to-predominant" },
  { from: "ChrMed-m3↓", to: "VI", score: 76, factor: "chromatic-mediant-color-motion" },
];

export function rulesForModule(moduleId: HarmonicModuleId): readonly RecommendationRule[] {
  return moduleId === "dark-harmony" ? DARK_HARMONY_RULES : PROGRESSIONS_RULES;
}

export function secondaryDominantTarget(functionId: string): string | undefined {
  return functionId.startsWith("V7/") ? functionId.slice(3) : undefined;
}

export function secondaryDiminishedTarget(functionId: string): string | undefined {
  return functionId.startsWith("vii°7/") ? functionId.slice("vii°7/".length) : undefined;
}
