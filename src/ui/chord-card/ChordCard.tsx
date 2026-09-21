import type { CardViewId } from "../../domain/progression/step";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { ChordCardViewModel } from "./views/types";
import { PianoCardView } from "../piano/PianoCardView";
import { GuitarCardView } from "../guitar/GuitarCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { CustomizedIndicator } from "./CustomizedIndicator";
import { Icon } from "../common/Icon";
import { getFunctionSemantics } from "../../domain/harmony/functionSemantics";
import type { StaffOctaveDirection } from "../staff/staffOctave";
import type { MatrixCardTopologyEntry } from "../../domain/harmony/topology";

export function ChordCard({
  model,
  view,
  selected,
  playing = false,
  customizedCount,
  showBassInStaff = false,
  suzukiColors = false,
  guitarChordOrientation = "vertical",
  resolutionTargetSymbol,
  isResolutionTarget,
  isGenreFocused = false,
  isGenreDimmed = false,
  contextual = false,
  accessibleDescription,
  topologyEntry,
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
  readonly playing?: boolean | undefined;
  readonly customizedCount: number;
  readonly showBassInStaff?: boolean;
  readonly suzukiColors?: boolean;
  readonly guitarChordOrientation?: "vertical" | "horizontal";
  readonly resolutionTargetSymbol?: string | undefined;
  readonly isResolutionTarget?: boolean | undefined;
  readonly isGenreFocused?: boolean | undefined;
  readonly isGenreDimmed?: boolean | undefined;
  readonly contextual?: boolean | undefined;
  readonly accessibleDescription?: string | undefined;
  readonly topologyEntry?: MatrixCardTopologyEntry | undefined;
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
  const selectionAriaLabel = `${accessibleDescription ? `${accessibleDescription}; ` : ""}Preview ${model.chord.harmonicFunction.functionId} ${model.chord.spelling.symbol}; Notes: ${noteNames.join(", ")}; Ctrl-click or Ctrl+Enter to add to My Progression; Alt-click to reset card settings`;
  const selectionTitle =
    "Click or Enter to preview; Ctrl-click or Ctrl+Enter to add to My Progression; Alt-click to reset card settings";
  const describedBy =
    model.recommendationStatus !== "none"
      ? `recommendation-${model.chord.harmonicFunction.functionId}`
      : undefined;
  const semantics = getFunctionSemantics(model.chord.harmonicFunction.functionId);
  const targetId =
    topologyEntry?.targetId ??
    model.chord.harmonicFunction.targetId ??
    model.chord.harmonicFunction.targetFunctionId;
  const semanticBassPitch =
    model.chord.bassPitchClass !== undefined ? model.realizedPitches[0] : undefined;
  const cardTooltip = `${model.chord.harmonicFunction.functionId} · ${semantics.title}\n${semantics.description}\nХарактер: ${semantics.emotionalColor}\nСтили: ${semantics.styleHints.join(", ")}\nПравило: ${semantics.rule}${model.recommendation?.routeMessage ? `\nRoute: ${model.recommendation.routeMessage}` : ""}`;
  const recommendationLabel =
    model.recommendationStatus === "best"
      ? "Best Match"
      : model.recommendationStatus === "alternative"
        ? "Alternative"
        : "Requires confirmation";
  const recommendationBadgeText =
    model.recommendationStatus === "blocked" ? "Confirm" : recommendationLabel;

  const select = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.altKey) onAltClickReset();
    else if (event.ctrlKey) onCtrlClickAdd();
    else onSelect();
  };
  const selectFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      onCtrlClickAdd();
    }
  };

  return (
    <article
      className={`chord-card recommendation-${model.recommendationStatus} ${selected ? "is-selected is-previewed" : ""} ${playing ? "is-playing" : ""} ${isResolutionTarget ? "is-resolution-target" : ""} ${isGenreFocused ? "is-genre-focus" : ""} ${isGenreDimmed ? "is-genre-dimmed" : ""}`.trim()}
      style={style}
      title={cardTooltip}
      data-testid={`chord-card-${model.chord.harmonicFunction.functionId}`}
      data-recommendation={model.recommendationStatus}
      data-customized={customizedCount > 0 ? customizedCount : undefined}
      data-resolution-target={isResolutionTarget ? "true" : undefined}
      data-genre-focus={isGenreFocused ? "true" : undefined}
      data-genre-dimmed={isGenreDimmed ? "true" : undefined}
      data-matrix-contextual={contextual ? "true" : undefined}
      data-playing={playing ? "true" : undefined}
      data-matrix-column={topologyEntry ? String(topologyEntry.position.column) : undefined}
      data-matrix-row={topologyEntry ? String(topologyEntry.position.row) : undefined}
      data-mix-policy={topologyEntry?.mixPolicy ?? model.chord.harmonicFunction.mixPolicy}
      data-target-id={targetId}
      data-bass-scale-degree={
        topologyEntry?.bassScaleDegree ?? model.chord.harmonicFunction.bassScaleDegree
      }
      data-matrix-auxiliary={topologyEntry?.auxiliary ? "true" : undefined}
      data-aliases={topologyEntry?.aliases?.join(",")}
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
            <span className="chord-resolution-arrow" aria-hidden="true">
              ↓
            </span>
            <span className="chord-resolution-name">{resolutionTargetSymbol}</span>
          </button>
        ) : null}
        {model.recommendationStatus !== "none" && (
          <span
            className={`recommendation-badge recommendation-${model.recommendationStatus}-badge`}
            id={`recommendation-${model.chord.harmonicFunction.functionId}`}
            role="img"
            aria-label={`${model.recommendationStatus === "blocked" ? "Route status" : "Recommendation"}: ${recommendationLabel}`}
          >
            {model.recommendationStatus === "blocked" ? (
              <span className="recommendation-blocked-symbol" aria-hidden="true">
                !
              </span>
            ) : (
              <Icon name={model.recommendationStatus === "best" ? "best" : "alternative"} />
            )}
            {recommendationBadgeText}
          </span>
        )}
        {contextual ? (
          <span className="matrix-contextual-badge" aria-label="Contextual">
            Contextual
          </span>
        ) : null}
      </div>
      {view === "staff" ? (
        <StaffCardView
          className="chord-main"
          pitches={
            showBassInStaff || model.chord.bassPitchClass !== undefined
              ? model.realizedPitches
              : model.pianoPitches
          }
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
          onKeyDown={selectFromKeyboard}
          onOctaveChange={onStaffOctaveChange}
        />
      ) : (
        <button
          className="chord-main"
          type="button"
          onClick={select}
          onKeyDown={selectFromKeyboard}
          aria-pressed={selected}
          aria-label={selectionAriaLabel}
          title={selectionTitle}
          aria-describedby={describedBy}
        >
          {view === "harmonic" && (
            <span className="chord-card-identity" title={cardTooltip}>
              <strong>{model.chord.harmonicFunction.functionId}</strong>
              <span>{chordLabel}</span>
              <span className="chord-card-notes-label">Notes</span>
              <span className="chord-card-notes" data-testid="chord-card-notes">
                {noteSummary || "—"}
              </span>
            </span>
          )}
          {view === "piano" && (
            <PianoCardView
              chordPitches={model.pianoPitches}
              bassPitch={semanticBassPitch}
              chordLabel={chordLabel}
            />
          )}
          {view === "guitar" && (
            <GuitarCardView
              chord={model.chord}
              chordLabel={chordLabel}
              orientation={guitarChordOrientation}
            />
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
