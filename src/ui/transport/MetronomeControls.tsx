import { Icon } from "../common/Icon";

export interface MetronomeControlsProps {
  readonly metronomeEnabled: boolean;
  readonly countInEnabled: boolean;
  readonly onToggleMetronome: () => void;
  readonly onToggleCountIn: () => void;
  readonly disabled?: boolean | undefined;
}

export function MetronomeControls({
  metronomeEnabled,
  countInEnabled,
  onToggleMetronome,
  onToggleCountIn,
  disabled = false,
}: MetronomeControlsProps) {
  return (
    <div className="metronome-controls" role="group" aria-label="Metronome and Count-in">
      <button
        type="button"
        className={`transport-toggle-button ${metronomeEnabled ? "is-active" : ""}`}
        onClick={onToggleMetronome}
        disabled={disabled}
        aria-pressed={metronomeEnabled}
        aria-label="Toggle Metronome"
        title="Toggle Metronome"
      >
        <span className="toggle-icon" aria-hidden="true">
          <Icon name="metronome" />
        </span>
        <span className="toggle-label">Metro</span>
      </button>

      <button
        type="button"
        className={`transport-toggle-button ${countInEnabled ? "is-active" : ""}`}
        onClick={onToggleCountIn}
        disabled={disabled}
        aria-pressed={countInEnabled}
        aria-label="Toggle Count-in"
        title="Toggle 1-Bar Count-in"
      >
        <span className="toggle-icon" aria-hidden="true">
          <Icon name="count-in" />
        </span>
        <span className="toggle-label">Count-in</span>
      </button>
    </div>
  );
}
