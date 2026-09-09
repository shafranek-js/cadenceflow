import type { CardViewId } from "../../domain/progression/step";
import type { ChordCardViewModel } from "./views/types";
import { CardViewSwitcher } from "./CardViewSwitcher";
import { PianoCardView } from "../piano/PianoCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { ChordCardSettingsButton } from "./ChordCardSettingsButton";
import { Icon } from "../common/Icon";

export function ChordCard({
  model,
  view,
  selected,
  customizedCount,
  onSelect,
  onAdd,
  onViewChange,
  onSettingsOpen,
  onReset,
}: {
  readonly model: ChordCardViewModel;
  readonly view: CardViewId;
  readonly selected: boolean;
  readonly customizedCount: number;
  readonly onSelect: () => void;
  readonly onAdd: () => void;
  readonly onViewChange: (view: CardViewId) => void;
  readonly onSettingsOpen: () => void;
  readonly onReset: () => void;
}) {
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
      <button
        className="chord-main"
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`Preview ${model.chord.harmonicFunction.functionId} ${model.chord.spelling.symbol}`}
        aria-describedby={
          model.recommendationStatus !== "none"
            ? `recommendation-${model.chord.harmonicFunction.functionId}`
            : undefined
        }
      >
        {view === "harmonic" && (
          <span className="chord-card-identity">
            <strong>{model.chord.harmonicFunction.functionId}</strong>
            <span>{model.chord.spelling.symbol}</span>
          </span>
        )}
        {view === "piano" && <PianoCardView pitches={model.realizedPitches} />}
        {view === "staff" && <StaffCardView pitches={model.realizedPitches} />}
      </button>
      <div className="chord-card-actions">
        <button
          type="button"
          className="add-chord"
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onAdd();
          }}
          aria-label={`Add ${model.chord.harmonicFunction.functionId} to progression`}
          title="Add to My Progression"
        >
          <Icon name="add" />
        </button>
        <CardViewSwitcher
          value={view}
          onChange={onViewChange}
          label={`View for ${model.chord.harmonicFunction.functionId}`}
        />
        <ChordCardSettingsButton
          functionId={model.chord.harmonicFunction.functionId}
          customizedCount={customizedCount}
          onOpen={onSettingsOpen}
          onReset={onReset}
        />
      </div>
    </article>
  );
}
