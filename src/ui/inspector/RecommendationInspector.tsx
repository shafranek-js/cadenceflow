import type { PresentationMode } from "../../domain/project/project";
import type { RecommendationCandidate } from "../../domain/recommendations/engine";
import { explainRecommendation } from "../../domain/recommendations/explanations";
import { useInspectorDisclosure } from "./useInspectorDisclosure";

const RECOMMENDATION_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.recommendation-context-open";

export function RecommendationInspector({
  candidate,
  blockedCandidates = [],
  mode,
}: {
  readonly candidate: RecommendationCandidate | null;
  readonly blockedCandidates?: readonly RecommendationCandidate[];
  readonly mode: PresentationMode;
}) {
  const disclosure = useInspectorDisclosure(RECOMMENDATION_DISCLOSURE_STORAGE_KEY, false);
  const explanation = candidate ? explainRecommendation(candidate, mode) : null;

  return (
    <details
      className="inspector inspector-disclosure recommendation-inspector"
      aria-label="Recommendation inspector"
      data-context={candidate ? "recommendation" : "neutral"}
      open={disclosure.isOpen}
      onToggle={(event) => disclosure.setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>Recommendation context</span>
        <span className="disclosure-status">
          {candidate ? candidate.functionId : "No selection"}
        </span>
      </summary>
      <div className="inspector-disclosure-body recommendation-inspector-body">
        {!candidate || !explanation ? (
          <>
            <h2>Inspector</h2>
            <p>Select a chord to explore its harmonic context.</p>
          </>
        ) : (
          <>
            <h2>{candidate.functionId}</h2>
            <strong>{explanation.headline}</strong>
            <ul>
              {explanation.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </>
        )}
        {blockedCandidates.length > 0 ? (
          <section
            className="recommendation-blocked-routes"
            aria-label="Routes requiring confirmation"
            data-testid="recommendation-blocked-routes"
          >
            <h3>Requires confirmation</h3>
            <ul>
              {blockedCandidates.map((blocked) => {
                const blockedExplanation = explainRecommendation(blocked, mode);
                return (
                  <li key={blocked.functionId}>
                    <strong>{blocked.functionId}</strong>: {blockedExplanation.details[0]}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
