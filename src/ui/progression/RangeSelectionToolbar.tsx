import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export interface RangeSelectionToolbarProps {
  readonly selectedCount: number;
  readonly loopActive: boolean;
  readonly onPlay: () => void;
  readonly onToggleLoop: () => void;
  readonly onCopy: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onResetPerformance: () => void;
  readonly onExplore: () => void;
  readonly previewTransposition: (semitones: number) => {
    readonly valid: boolean;
    readonly message: string;
  };
  readonly onApplyTransposition: (semitones: number) => string | undefined;
}

/** Transient actions for the current stable-ID range; it never becomes Project state. */
export function RangeSelectionToolbar({
  selectedCount,
  loopActive,
  onPlay,
  onToggleLoop,
  onCopy,
  onDuplicate,
  onDelete,
  onResetPerformance,
  onExplore,
  previewTransposition,
  onApplyTransposition,
}: RangeSelectionToolbarProps) {
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [transpositionOpen, setTranspositionOpen] = useState(false);
  const [draftSemitones, setDraftSemitones] = useState(1);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [transpositionPosition, setTranspositionPosition] = useState<CSSProperties | null>(null);
  const transposeButtonRef = useRef<HTMLButtonElement>(null);
  const transpositionInputRef = useRef<HTMLInputElement>(null);
  const wasTranspositionOpen = useRef(false);
  const preview = previewTransposition(draftSemitones);
  useLayoutEffect(() => {
    if (!transpositionOpen) return;
    const reposition = () => {
      const trigger = transposeButtonRef.current;
      if (!trigger) return;
      const triggerBounds = trigger.getBoundingClientRect();
      const headerBottom =
        document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
      const top = Math.min(headerBottom + 8, Math.max(8, window.innerHeight - 96));
      const width = Math.min(336, Math.max(1, window.innerWidth - 16));
      const left = Math.max(8, Math.min(triggerBounds.left, window.innerWidth - width - 8));
      setTranspositionPosition({
        position: "fixed",
        zIndex: 100,
        top,
        left,
        width,
        maxHeight: Math.max(80, window.innerHeight - top - 8),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [transpositionOpen]);
  useLayoutEffect(() => {
    if (transpositionOpen && transpositionPosition) {
      wasTranspositionOpen.current = true;
      transpositionInputRef.current?.focus({ preventScroll: true });
    } else if (!transpositionOpen && wasTranspositionOpen.current) {
      wasTranspositionOpen.current = false;
      transposeButtonRef.current?.focus({ preventScroll: true });
    }
  }, [transpositionOpen, transpositionPosition]);
  if (selectedCount === 0) return null;

  return (
    <>
      <div
        className="range-selection-toolbar"
        data-testid="range-selection-toolbar"
        role="toolbar"
        aria-label={`Range selection actions, ${selectedCount} step${selectedCount === 1 ? "" : "s"} selected`}
      >
        <span className="range-selection-count" aria-live="polite">
          {selectedCount} selected
        </span>
        <button type="button" data-testid="range-toolbar-play" onClick={onPlay}>
          Play From First
        </button>
        <button
          type="button"
          data-testid="range-toolbar-loop"
          aria-pressed={loopActive}
          onClick={onToggleLoop}
        >
          Loop
        </button>
        <button type="button" data-testid="range-toolbar-copy" onClick={onCopy}>
          Copy
        </button>
        <button type="button" data-testid="range-toolbar-duplicate" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" data-testid="range-toolbar-delete" onClick={onDelete}>
          Delete
        </button>
        <span className="range-selection-toolbar-menu">
          <button
            type="button"
            data-testid="range-toolbar-performance"
            aria-expanded={performanceOpen}
            onClick={() => setPerformanceOpen((open) => !open)}
          >
            Performance
          </button>
          {performanceOpen ? (
            <span className="range-selection-toolbar-popover" role="menu">
              <button
                type="button"
                role="menuitem"
                data-testid="range-toolbar-performance-reset"
                onClick={() => {
                  onResetPerformance();
                  setPerformanceOpen(false);
                }}
              >
                Reset selected performance
              </button>
            </span>
          ) : null}
        </span>
        <button type="button" data-testid="range-toolbar-explore" onClick={onExplore}>
          Explore
        </button>
        <span className="range-selection-toolbar-menu">
          <button
            type="button"
            data-testid="range-toolbar-transpose"
            ref={transposeButtonRef}
            aria-expanded={transpositionOpen}
            onClick={() => {
              setApplyError(null);
              setTranspositionOpen((open) => !open);
            }}
          >
            Transpose
          </button>
        </span>
      </div>
      {transpositionOpen && transpositionPosition
        ? createPortal(
            <div
              className="range-selection-toolbar-popover range-transposition-popover"
              style={transpositionPosition}
              role="dialog"
              aria-label="Transpose selected range"
              data-testid="range-transposition-dialog"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setApplyError(null);
                  setTranspositionOpen(false);
                }
              }}
            >
              <label htmlFor="range-transposition-semitones">Semitones</label>
              <input
                id="range-transposition-semitones"
                data-testid="range-transposition-semitones"
                ref={transpositionInputRef}
                type="number"
                min={-127}
                max={127}
                step={1}
                value={draftSemitones}
                onChange={(event) => {
                  setDraftSemitones(Number(event.target.value));
                  setApplyError(null);
                }}
              />
              <p role="status" data-testid="range-transposition-preview">
                {preview.message}
              </p>
              {applyError ? <p role="alert">{applyError}</p> : null}
              <span className="range-transposition-actions">
                <button
                  type="button"
                  data-testid="range-transposition-cancel"
                  onClick={() => {
                    setApplyError(null);
                    setTranspositionOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="range-transposition-apply"
                  disabled={!preview.valid}
                  onClick={() => {
                    const error = onApplyTransposition(draftSemitones);
                    if (error) setApplyError(error);
                    else setTranspositionOpen(false);
                  }}
                >
                  Apply
                </button>
              </span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
