import { Icon } from "../common/Icon";

export interface HistoryControlsProps {
  readonly onUndo: () => void;
  readonly canUndo: boolean;
  readonly onRedo: () => void;
  readonly canRedo: boolean;
}

export function HistoryControls({ onUndo, canUndo, onRedo, canRedo }: HistoryControlsProps) {
  return (
    <div className="history-bar" role="group" aria-label="History Controls">
      <button
        type="button"
        className="transport-button transport-undo"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo last action (Ctrl+Z)"
      >
        <span className="transport-btn-icon" aria-hidden="true">
          <Icon name="undo" />
        </span>
        <span className="transport-btn-label">Undo</span>
      </button>

      <button
        type="button"
        className="transport-button transport-redo"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo last undone action (Ctrl+Shift+Z or Ctrl+Y)"
      >
        <span className="transport-btn-icon" aria-hidden="true">
          <Icon name="redo" />
        </span>
        <span className="transport-btn-label">Redo</span>
      </button>
    </div>
  );
}
