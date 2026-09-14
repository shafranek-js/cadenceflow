import type { ChangeEvent } from "react";
import type { CardViewId } from "../../domain/progression/step";

export interface ViewModeToggleProps {
  readonly currentView: CardViewId;
  readonly onChangeView: (view: CardViewId) => void;
  readonly selectAriaLabel: string;
  readonly testIdPrefix?: string;
}

export function ViewModeToggle({
  currentView,
  onChangeView,
  selectAriaLabel,
  testIdPrefix = "view-mode",
}: ViewModeToggleProps) {
  return (
    <div
      className="view-mode-toggle"
      role="group"
      data-testid={`${testIdPrefix}-toggle`}
    >
      <button
        type="button"
        className={`view-mode-btn ${currentView === "harmonic" ? "is-active" : ""}`}
        onClick={() => onChangeView("harmonic")}
        title="Harmonic View [H]"
        aria-label="Harmonic View"
        aria-pressed={currentView === "harmonic"}
        data-testid={`${testIdPrefix}-btn-harmonic`}
      >
        H
      </button>
      <button
        type="button"
        className={`view-mode-btn ${currentView === "piano" ? "is-active" : ""}`}
        onClick={() => onChangeView("piano")}
        title="Piano View [P]"
        aria-label="Piano View"
        aria-pressed={currentView === "piano"}
        data-testid={`${testIdPrefix}-btn-piano`}
      >
        P
      </button>
      <button
        type="button"
        className={`view-mode-btn ${currentView === "staff" ? "is-active" : ""}`}
        onClick={() => onChangeView("staff")}
        title="Staff View [S]"
        aria-label="Staff View"
        aria-pressed={currentView === "staff"}
        data-testid={`${testIdPrefix}-btn-staff`}
      >
        S
      </button>
      <select
        className="view-mode-hidden-select"
        aria-label={selectAriaLabel}
        value={currentView}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChangeView(event.target.value as CardViewId)
        }
        tabIndex={-1}
      >
        <option value="harmonic">Harmonic</option>
        <option value="piano">Piano</option>
        <option value="staff">Staff</option>
      </select>
    </div>
  );
}
