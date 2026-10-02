import { useState } from "react";

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
}: RangeSelectionToolbarProps) {
  const [performanceOpen, setPerformanceOpen] = useState(false);
  if (selectedCount === 0) return null;

  return (
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
      <button
        type="button"
        data-testid="range-toolbar-transpose"
        disabled
        title="Transpose is unavailable: the current Project model has no per-step pitch offset command."
        aria-label="Transpose unavailable"
      >
        Transpose
      </button>
    </div>
  );
}
