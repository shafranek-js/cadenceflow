import type { PresentationMode } from "../../domain/project/project";
import type { RecommendationCandidate } from "../../domain/recommendations/engine";
import { explainRecommendation } from "../../domain/recommendations/explanations";

export function RecommendationInspector({
  candidate,
  mode,
}: {
  readonly candidate: RecommendationCandidate | null;
  readonly mode: PresentationMode;
}) {
  if (!candidate)
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p>Select a chord to explore its harmonic context.</p>
      </aside>
    );
  const explanation = explainRecommendation(candidate, mode);
  return (
    <aside className="inspector">
      <h2>{candidate.functionId}</h2>
      <strong>{explanation.headline}</strong>
      <ul>
        {explanation.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
    </aside>
  );
}
