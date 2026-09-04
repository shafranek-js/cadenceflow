import type { RecommendationCandidate } from "./engine";
import type { PresentationMode } from "../project/project";

const BEGINNER: Readonly<Record<string, string>> = {
  "dominant-resolution": "Strong pull back home to the tonic.",
  "predominant-to-dominant": "Builds tension naturally toward the dominant.",
  "secondary-dominant-resolution": "This dominant strongly points to its target chord.",
  "deceptive-resolution": "Avoids the expected tonic for a softer surprise.",
  "minor-plagal-resolution": "A darker borrowed chord resolves warmly to the tonic.",
};

export interface RecommendationExplanation {
  readonly headline: string;
  readonly details: readonly string[];
}

export function explainRecommendation(candidate: RecommendationCandidate, mode: PresentationMode): RecommendationExplanation {
  const top = [...candidate.factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const primary = top[0];
  if (!primary) return { headline: "Valid harmonic option", details: ["No strong functional tendency dominates this choice."] };
  if (mode === "beginner") return { headline: BEGINNER[primary.code] ?? "Musically useful next step.", details: top.slice(1).map((f) => BEGINNER[f.code] ?? f.code.replaceAll("-", " ")) };
  if (mode === "composer") return { headline: primary.code.replaceAll("-", " "), details: top.map((f) => `${f.source}: ${f.code} (${f.contribution >= 0 ? "+" : ""}${f.contribution})`) };
  return { headline: `${primary.code} · score ${candidate.score}`, details: top.map((f) => `${f.source}/${f.code}: ${f.contribution >= 0 ? "+" : ""}${f.contribution}`) };
}
