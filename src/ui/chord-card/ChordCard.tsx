import type { CardViewId } from "../../domain/progression/step";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { ChordCardViewModel } from "./views/types";
import { PianoCardView } from "../piano/PianoCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { CustomizedIndicator } from "./CustomizedIndicator";
import { Icon } from "../common/Icon";
import type { StaffOctaveDirection } from "../staff/staffOctave";

export function ChordCard({
  model,
  view,
  selected,
  customizedCount,
  showBassInStaff = false,
  onSelect,
  onCtrlClickAdd,
  onAltClickReset,
  onStaffOctaveChange,
}: {
  readonly model: ChordCardViewModel;
  readonly view: CardViewId;
  readonly selected: boolean;
  readonly customizedCount: number;
  readonly showBassInStaff?: boolean;
  readonly onSelect: () => void;
  readonly onCtrlClickAdd: () => void;
  readonly onAltClickReset: () => void;
  readonly onStaffOctaveChange: (direction: StaffOctaveDirection) => void;
}) {
  const noteNames = [
    ...new Set(model.pianoPitches.map((pitch) => formatPitchSpelling(pitch.spelling))),
  ];
  const noteSummary = noteNames.join(" · ");
  const chordLabel = formatChordSymbol(model.chord);
  const selectionAriaLabel = `Preview ${model.chord.harmonicFunction.functionId} ${model.chord.spelling.symbol}; Notes: ${noteNames.join(", ")}; Ctrl-click to add to My Progression; Alt-click to reset card settings`;
  const selectionTitle =
    "Click to preview; Ctrl-click to add to My Progression; Alt-click to reset card settings";
  const describedBy =
    model.recommendationStatus !== "none"
      ? `recommendation-${model.chord.harmonicFunction.functionId}`
      : undefined;
  const select = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.altKey) onAltClickReset();
    else if (event.ctrlKey) onCtrlClickAdd();
    else onSelect();
  };

  return (
    <article
      className={`chord-card recommendation-${model.recommendationStatus} ${selected ? "is-selected is-previewed" : ""}`}
      data-testid={`chord-card-${model.chord.harmonicFunction.functionId}`}
      data-recommendation={model.recommendationStatus}
      data-customized={customizedCount > 0 ? customizedCount : undefined}
    >
      <div className="chord-card-status-row">
        {model.recommendationStatus !== "none" && (
          <span
            className={`recommendation-badge recommendation-${model.recommendationStatus}-badge`}
            id={`recommendation-${model.chord.harmonicFunction.functionId}`}
            role="img"
            aria-label={`Recommendation: ${model.recommendationStatus === "best" ? "Best Match" : "Alternative"}`}
          >
            <Icon name={model.recommendationStatus === "best" ? "best" : "alternative"} />
            {model.recommendationStatus === "best" ? "Best Match" : "Alternative"}
          </span>
        )}
      </div>
      {view === "staff" ? (
        <StaffCardView
          className="chord-main"
          pitches={showBassInStaff ? model.realizedPitches : model.pianoPitches}
          chordPitches={model.pianoPitches}
          chordLabel={chordLabel}
          duration={model.duration}
          selected={selected}
          selectionAriaLabel={selectionAriaLabel}
          selectionTitle={selectionTitle}
          {...(describedBy ? { selectionDescribedBy: describedBy } : {})}
          canShiftUp={model.canRaiseStaffOctave}
          canShiftDown={model.canLowerStaffOctave}
          onSelect={select}
          onOctaveChange={onStaffOctaveChange}
        />
      ) : (
        <button
          className="chord-main"
          type="button"
          onClick={select}
          aria-pressed={selected}
          aria-label={selectionAriaLabel}
          title={selectionTitle}
          aria-describedby={describedBy}
        >
          {view === "harmonic" && (
            <span className="chord-card-identity">
              <strong>{model.chord.harmonicFunction.functionId}</strong>
              <span>{model.chord.spelling.symbol}</span>
              <span className="chord-card-notes-label">Notes</span>
              <span className="chord-card-notes" data-testid="chord-card-notes">
                {noteSummary || "—"}
              </span>
            </span>
          )}
          {view === "piano" && (
            <PianoCardView chordPitches={model.pianoPitches} chordLabel={chordLabel} />
          )}
        </button>
      )}
      <div className="chord-card-actions">
        {customizedCount > 0 ? (
          <span className="chord-card-customized-indicator">
            <CustomizedIndicator count={customizedCount} />
          </span>
        ) : null}
      </div>
    </article>
  );
}
