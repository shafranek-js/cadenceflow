import type { CardViewId } from "../../domain/progression/step";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { ChordCardViewModel } from "./views/types";
import { PianoCardView } from "../piano/PianoCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { CustomizedIndicator } from "./CustomizedIndicator";
import { Icon } from "../common/Icon";
import { getFunctionSemantics } from "../../domain/harmony/functionSemantics";
import type { StaffOctaveDirection } from "../staff/staffOctave";

export function ChordCard({
  model,
  view,
  selected,
  customizedCount,
  showBassInStaff = false,
  suzukiColors = false,
  resolutionTargetSymbol,
  isResolutionTarget,
  isGenreFocused = false,
  isGenreDimmed = false,
  style,
  onMouseEnter,
  onMouseLeave,
  onClickResolutionTarget,
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
  readonly suzukiColors?: boolean;
  readonly resolutionTargetSymbol?: string | undefined;
  readonly isResolutionTarget?: boolean | undefined;
  readonly isGenreFocused?: boolean | undefined;
  readonly isGenreDimmed?: boolean | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly onMouseEnter?: (() => void) | undefined;
  readonly onMouseLeave?: (() => void) | undefined;
  readonly onClickResolutionTarget?: (() => void) | undefined;
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
  const semantics = getFunctionSemantics(model.chord.harmonicFunction.functionId);
  const cardTooltip = `${model.chord.harmonicFunction.functionId} · ${semantics.title}\n${semantics.description}\nХарактер: ${semantics.emotionalColor}\nСтили: ${semantics.styleHints.join(", ")}\nПравило: ${semantics.rule}`;

  const select = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.altKey) onAltClickReset();
    else if (event.ctrlKey) onCtrlClickAdd();
    else onSelect();
  };

  return (
    <article
      className={`chord-card recommendation-${model.recommendationStatus} ${selected ? "is-selected is-previewed" : ""} ${isResolutionTarget ? "is-resolution-target" : ""} ${isGenreFocused ? "is-genre-focus" : ""} ${isGenreDimmed ? "is-genre-dimmed" : ""}`.trim()}
      style={style}
      title={cardTooltip}
      data-testid={`chord-card-${model.chord.harmonicFunction.functionId}`}
      data-recommendation={model.recommendationStatus}
      data-customized={customizedCount > 0 ? customizedCount : undefined}
      data-resolution-target={isResolutionTarget ? "true" : undefined}
      data-genre-focus={isGenreFocused ? "true" : undefined}
      data-genre-dimmed={isGenreDimmed ? "true" : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="chord-card-status-row">
        {resolutionTargetSymbol ? (
          <button
            type="button"
            className="chord-resolution-badge"
            title={`Resolves to ${resolutionTargetSymbol} (${model.chord.harmonicFunction.targetFunctionId ?? ""})`}
            aria-label={`Resolves to ${resolutionTargetSymbol}`}
            onClick={(e) => {
              if (onClickResolutionTarget) {
                e.stopPropagation();
                onClickResolutionTarget();
              }
            }}
          >
            <span className="chord-resolution-arrow" aria-hidden="true">↓</span>
            <span className="chord-resolution-name">{resolutionTargetSymbol}</span>
          </button>
        ) : null}
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
          suzukiColors={suzukiColors}
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
            <span className="chord-card-identity" title={cardTooltip}>
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
