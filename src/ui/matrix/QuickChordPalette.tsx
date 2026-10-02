import { useRef, useState, type KeyboardEvent } from "react";
import type { QuickChordCandidate } from "../../domain/recommendations/quickChord";
import { useModalFocus } from "../common/useModalFocus";

export interface QuickChordPaletteProps {
  readonly candidates: readonly QuickChordCandidate[];
  readonly onPreview: (functionId: string) => void;
  /** Returns false when the canonical route guard opened a confirmation dialog. */
  readonly onApply: (functionId: string) => boolean;
  readonly onClose: () => void;
  readonly isTopmost?: boolean;
}

function candidateTestId(functionId: string): string {
  return `quick-chord-candidate-${functionId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function QuickChordPalette({
  candidates,
  onPreview,
  onApply,
  onClose,
  isTopmost = true,
}: QuickChordPaletteProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useModalFocus<HTMLElement>({
    isOpen: true,
    isTopmost,
    onClose,
    initialFocusRef: searchRef,
  });

  const normalizedQuery = normalizeQuery(query);
  const visibleCandidates = normalizedQuery
    ? candidates.filter((candidate) => candidate.searchText.includes(normalizedQuery))
    : candidates;
  const activeCandidate = visibleCandidates[activeIndex] ?? visibleCandidates[0];

  const focusCandidate = (index: number) => {
    if (visibleCandidates.length === 0) return;
    const nextIndex = (index + visibleCandidates.length) % visibleCandidates.length;
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => candidateRefs.current[nextIndex]?.focus());
  };

  const previewCandidate = (candidate: QuickChordCandidate) => {
    setActiveIndex(Math.max(0, visibleCandidates.indexOf(candidate)));
    onPreview(candidate.functionId);
  };

  const applyCandidate = (candidate: QuickChordCandidate | undefined) => {
    if (!candidate) return;
    onApply(candidate.functionId);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCandidate(0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCandidate(Math.max(0, visibleCandidates.length - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      applyCandidate(activeCandidate);
    }
  };

  const handleCandidateKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    candidate: QuickChordCandidate,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusCandidate(index + 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusCandidate(index - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      applyCandidate(candidate);
    }
  };

  return (
    <div
      className="quick-chord-palette-backdrop"
      data-testid="quick-chord-palette-backdrop"
      role="presentation"
      onClick={(event) => {
        if (isTopmost && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="quick-chord-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-chord-palette-title"
        aria-describedby="quick-chord-palette-help"
        data-testid="quick-chord-palette"
        onKeyDown={(event) => {
          if (event.key === "Escape" && isTopmost) {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="quick-chord-palette-header">
          <div>
            <p className="quick-chord-palette-eyebrow">Deterministic discovery</p>
            <h2 id="quick-chord-palette-title">Quick Chord / Command Palette</h2>
            <p id="quick-chord-palette-help" className="quick-chord-palette-help">
              Search by function or chord symbol. Preview is temporary; Apply adds a new Step.
            </p>
          </div>
          <button
            type="button"
            className="quick-chord-palette-close"
            aria-label="Close Quick Chord palette"
            data-testid="quick-chord-palette-close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <label className="quick-chord-palette-search-label" htmlFor="quick-chord-palette-search">
          Find a chord or command
          <input
            ref={searchRef}
            id="quick-chord-palette-search"
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Try V7/V, D7, modal, or dominant"
            data-testid="quick-chord-palette-search"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
          />
        </label>

        <div className="quick-chord-palette-command" role="group" aria-label="Commands">
          <div>
            <strong>Add selected chord</strong>
            <span>Adds the highlighted result through the Matrix Add route guard.</span>
          </div>
          <button
            type="button"
            className="quick-chord-palette-command-apply"
            disabled={!activeCandidate}
            data-testid="quick-chord-command-add-selected"
            onClick={() => applyCandidate(activeCandidate)}
          >
            Apply
          </button>
        </div>

        <div className="quick-chord-palette-results" role="list" aria-label="Chord results">
          {visibleCandidates.length > 0 ? (
            visibleCandidates.map((candidate, index) => {
              const selected = candidate.functionId === activeCandidate?.functionId;
              return (
                <article
                  key={candidate.functionId}
                  className={`quick-chord-result${selected ? " is-active" : ""}`}
                  role="listitem"
                  data-testid="quick-chord-result"
                  data-function-id={candidate.functionId}
                  data-route-status={candidate.routeStatus}
                >
                  <button
                    ref={(element) => {
                      candidateRefs.current[index] = element;
                    }}
                    type="button"
                    className="quick-chord-result-select"
                    id={candidateTestId(candidate.functionId)}
                    aria-label={`Preview ${candidate.functionId}, ${candidate.chordLabel}`}
                    aria-pressed={selected}
                    data-testid={candidateTestId(candidate.functionId)}
                    onClick={() => previewCandidate(candidate)}
                    onKeyDown={(event) => handleCandidateKeyDown(event, index, candidate)}
                  >
                    <span className="quick-chord-result-function">{candidate.functionId}</span>
                    <span className="quick-chord-result-symbol">{candidate.chordLabel}</span>
                  </button>
                  <div className="quick-chord-result-copy">
                    <strong>{candidate.title}</strong>
                    <span>{candidate.explanation}</span>
                  </div>
                  <span className={`quick-chord-route quick-chord-route-${candidate.routeStatus}`}>
                    {candidate.routeStatus === "allowed" ? "Allowed" : "Requires confirmation"}
                  </span>
                  <button
                    type="button"
                    className="quick-chord-result-apply"
                    aria-label={`Apply ${candidate.functionId}`}
                    data-testid={`quick-chord-apply-${candidate.functionId.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`}
                    onClick={() => applyCandidate(candidate)}
                  >
                    Apply
                  </button>
                </article>
              );
            })
          ) : (
            <p className="quick-chord-palette-empty" role="status">
              No deterministic chord or command matches this search.
            </p>
          )}
        </div>

        <footer className="quick-chord-palette-footer">
          <span>↑/↓ choose · Enter Apply · click Preview · Escape Cancel</span>
          <button type="button" onClick={onClose} data-testid="quick-chord-palette-cancel">
            Cancel
          </button>
        </footer>
      </section>
    </div>
  );
}
