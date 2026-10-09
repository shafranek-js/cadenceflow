import type { ChangeEvent } from "react";
import type { CardViewId } from "../../domain/progression/step";
import { DEFAULT_VIEW_IDS } from "./defaultViewIds";

type ViewModeId = CardViewId | "piano-roll";

export interface ViewModeToggleProps {
  readonly currentView: ViewModeId;
  readonly onChangeView: (view: ViewModeId) => void;
  readonly selectAriaLabel: string;
  readonly testIdPrefix?: string;
  readonly availableViews?: readonly ViewModeId[];
}

export function ViewModeToggle({
  currentView,
  onChangeView,
  selectAriaLabel,
  testIdPrefix = "view-mode",
  availableViews = DEFAULT_VIEW_IDS,
}: ViewModeToggleProps) {
  const views = availableViews;

  return (
    <div className="view-mode-toggle" role="group" data-testid={`${testIdPrefix}-toggle`}>
      {views.includes("harmonic") && (
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
      )}
      {views.includes("piano") && (
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
      )}
      {views.includes("staff") && (
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
      )}
      {views.includes("guitar") && (
        <button
          type="button"
          className={`view-mode-btn ${currentView === "guitar" ? "is-active" : ""}`}
          onClick={() => onChangeView("guitar")}
          title="Guitar View [G]"
          aria-label="Guitar View"
          aria-pressed={currentView === "guitar"}
          data-testid={`${testIdPrefix}-btn-guitar`}
        >
          G
        </button>
      )}
      {views.includes("tablature") && (
        <button
          type="button"
          className={`view-mode-btn ${currentView === "tablature" ? "is-active" : ""}`}
          onClick={() => onChangeView("tablature")}
          title="Tablature View [T]"
          aria-label="Tablature View"
          aria-pressed={currentView === "tablature"}
          data-testid={`${testIdPrefix}-btn-tablature`}
        >
          T
        </button>
      )}
      {views.includes("piano-roll") && (
        <button
          type="button"
          className={`view-mode-btn ${currentView === "piano-roll" ? "is-active" : ""}`}
          onClick={() => onChangeView("piano-roll")}
          title="Piano Roll View"
          aria-label="Piano Roll View"
          aria-pressed={currentView === "piano-roll"}
          data-testid={`${testIdPrefix}-btn-piano-roll`}
        >
          PR
        </button>
      )}
      <select
        className="view-mode-hidden-select"
        aria-label={selectAriaLabel}
        value={currentView}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChangeView(event.target.value as ViewModeId)
        }
        tabIndex={-1}
      >
        {views.includes("harmonic") && <option value="harmonic">Harmonic</option>}
        {views.includes("piano") && <option value="piano">Piano</option>}
        {views.includes("staff") && <option value="staff">Staff</option>}
        {views.includes("guitar") && <option value="guitar">Guitar</option>}
        {views.includes("tablature") && <option value="tablature">Tablature</option>}
        {views.includes("piano-roll") && <option value="piano-roll">Piano Roll</option>}
      </select>
    </div>
  );
}
