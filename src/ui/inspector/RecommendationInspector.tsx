import { useState } from "react";
import type { PresentationMode } from "../../domain/project/project";
import type { RecommendationCandidate } from "../../domain/recommendations/engine";
import { explainRecommendation } from "../../domain/recommendations/explanations";

const RECOMMENDATION_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.recommendation-context-open";

function readDisclosureState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(RECOMMENDATION_DISCLOSURE_STORAGE_KEY);
    return stored === null ? false : stored === "true";
  } catch {
    return false;
  }
}

export function RecommendationInspector({
  candidate,
  mode,
}: {
  readonly candidate: RecommendationCandidate | null;
  readonly mode: PresentationMode;
}) {
  const [open, setOpen] = useState(readDisclosureState);
  const explanation = candidate ? explainRecommendation(candidate, mode) : null;

  const persistDisclosureState = (nextOpen: boolean) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECOMMENDATION_DISCLOSURE_STORAGE_KEY, String(nextOpen));
    } catch {
      // Disclosure preferences are best-effort when storage is unavailable.
    }
  };

  return (
    <details
      className="inspector inspector-disclosure recommendation-inspector"
      aria-label="Recommendation inspector"
      data-context={candidate ? "recommendation" : "neutral"}
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        persistDisclosureState(nextOpen);
      }}
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
      </div>
    </details>
  );
}
