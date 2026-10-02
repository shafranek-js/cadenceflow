import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { PresentationMode } from "../../domain/project/project";
import type {
  AlternativesTrayCandidate,
  AlternativesTraySnapshot,
} from "../../domain/recommendations/alternatives";
import { explainRecommendation } from "../../domain/recommendations/explanations";
import { useModalFocus } from "../common/useModalFocus";

export interface AlternativesTrayProps {
  readonly snapshot: AlternativesTraySnapshot;
  readonly mode: PresentationMode;
  readonly originLabel: string;
  readonly applyError?: string | null;
  readonly onAudition: (candidate: AlternativesTrayCandidate) => void;
  /** Returns an accessible error message when the snapshot is stale/blocked. */
  readonly onApply: (candidate: AlternativesTrayCandidate) => string | undefined;
  readonly onClose: () => void;
}

function candidateTestId(functionId: string): string {
  return `alternatives-candidate-${functionId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function AlternativesTray({
  snapshot,
  mode,
  originLabel,
  applyError = null,
  onAudition,
  onApply,
  onClose,
}: AlternativesTrayProps) {
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dialogRef = useModalFocus<HTMLElement>({ isOpen: true, onClose });
  const [activeIndex, setActiveIndex] = useState(0);
  const [documentZoom, setDocumentZoom] = useState(1);
  const candidates = snapshot.candidates;

  useEffect(() => {
    const updateZoom = () => {
      const value = Number.parseFloat(getComputedStyle(document.documentElement).zoom);
      setDocumentZoom(Number.isFinite(value) && value > 0 ? value : 1);
    };
    updateZoom();
    window.addEventListener("resize", updateZoom);
    return () => window.removeEventListener("resize", updateZoom);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => candidateRefs.current[activeIndex]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeIndex]);

  const move = (delta: number) => {
    if (candidates.length === 0) return;
    setActiveIndex((current) => (current + delta + candidates.length) % candidates.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    const isCandidateSelection =
      target instanceof HTMLElement && target.matches(".alternatives-tray-candidate-select");

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!isCandidateSelection) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      move(1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      move(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(0, candidates.length - 1));
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const candidate = candidates[activeIndex];
      if (candidate) onAudition(candidate);
      return;
    }
    if (event.key === "Enter") {
      const candidate = candidates[activeIndex];
      if (!candidate) return;
      event.preventDefault();
      event.stopPropagation();
      onApply(candidate);
    }
  };

  const trayStyle: CSSProperties = {
    width: `min(760px, calc(${100 / documentZoom}vw - ${48 / documentZoom}px))`,
    maxHeight: `min(720px, calc(${100 / documentZoom}vh - ${48 / documentZoom}px))`,
    minHeight: 0,
    boxSizing: "border-box",
  };

  return (
    <div className="alternatives-tray-backdrop" data-testid="alternatives-tray-backdrop">
      <section
        ref={dialogRef}
        className="alternatives-tray"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alternatives-tray-title"
        data-testid="alternatives-tray"
        onKeyDown={handleKeyDown}
        style={trayStyle}
      >
        <header className="alternatives-tray-header">
          <div>
            <p className="alternatives-tray-eyebrow">Deterministic alternatives</p>
            <h2 id="alternatives-tray-title">Explore alternatives after {originLabel}</h2>
            <p className="alternatives-tray-help">
              Use ←/→ to choose, Space to audition, Enter to apply, and Escape to close.
            </p>
          </div>
          <button
            type="button"
            className="alternatives-tray-close"
            aria-label="Close alternatives"
            data-testid="alternatives-tray-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {candidates.length > 0 ? (
          <div
            className="alternatives-tray-candidates"
            role="group"
            aria-label="Allowed harmonic alternatives"
            data-active-key={candidates[activeIndex]?.key}
          >
            {candidates.map((candidate, index) => {
              const explanation = explainRecommendation(candidate, mode);
              const selected = index === activeIndex;
              return (
                <article
                  className={`alternatives-tray-candidate${selected ? " is-active" : ""}`}
                  key={candidate.key}
                  data-testid="alternatives-candidate"
                  data-candidate-key={candidate.key}
                >
                  <button
                    ref={(element) => {
                      candidateRefs.current[index] = element;
                    }}
                    type="button"
                    className="alternatives-tray-candidate-select"
                    id={candidate.key}
                    aria-label={`Select ${candidate.functionId}, score ${candidate.score}`}
                    aria-pressed={selected}
                    data-testid={candidateTestId(candidate.functionId)}
                    onClick={() => setActiveIndex(index)}
                  >
                    <span className="alternatives-tray-candidate-function">
                      {candidate.functionId}
                    </span>
                    <span className="alternatives-tray-candidate-score">
                      Score {candidate.score}
                    </span>
                  </button>
                  <div className="alternatives-tray-rationale">
                    <strong>{explanation.headline}</strong>
                    <p>{explanation.details[0] ?? "Valid harmonic option."}</p>
                  </div>
                  <button
                    type="button"
                    className="alternatives-tray-audition"
                    aria-label={`Audition ${candidate.functionId}`}
                    data-testid={`alternatives-audition-${candidateTestId(candidate.functionId).replace("alternatives-candidate-", "")}`}
                    onClick={() => {
                      setActiveIndex(index);
                      onAudition(candidate);
                    }}
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    className="alternatives-tray-apply"
                    aria-label={`Apply ${candidate.functionId}`}
                    data-testid={`alternatives-apply-${candidateTestId(candidate.functionId).replace("alternatives-candidate-", "")}`}
                    onClick={() => {
                      setActiveIndex(index);
                      onApply(candidate);
                    }}
                  >
                    Apply
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="alternatives-tray-empty" role="status">
            No strong allowed alternatives are available for this Step.
          </p>
        )}

        {snapshot.blockedCandidates.length > 0 ? (
          <section
            className="alternatives-tray-blocked"
            aria-label="Blocked alternatives"
            data-testid="alternatives-blocked"
          >
            <h3>Requires confirmation</h3>
            <p>Strict route guard keeps these candidates from being applied here.</p>
            <ul>
              {snapshot.blockedCandidates.map((candidate) => (
                <li key={candidate.key} data-testid="alternatives-blocked-candidate">
                  <strong>{candidate.functionId}</strong>
                  <span>{candidate.routeMessage ?? "This route requires confirmation."}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {applyError ? (
          <p className="alternatives-tray-error" role="alert" data-testid="alternatives-tray-error">
            {applyError}
          </p>
        ) : null}

        <footer className="alternatives-tray-footer">
          <span aria-live="polite">Preview and audition do not change the Project.</span>
          <button type="button" onClick={onClose} data-testid="alternatives-tray-cancel">
            Cancel
          </button>
        </footer>
      </section>
    </div>
  );
}
