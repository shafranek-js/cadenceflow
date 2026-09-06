import type { CardViewId } from "../../domain/progression/step";
import type { ChordCardViewModel } from "./views/types";
import { CardViewSwitcher } from "./CardViewSwitcher";
import { PianoCardView } from "../piano/PianoCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { ChordCardSettingsButton } from "./ChordCardSettingsButton";

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
      className={`chord-card recommendation-${model.recommendationStatus} ${selected ? "is-selected" : ""}`}
      data-testid={`chord-card-${model.chord.harmonicFunction.functionId}`}
    >
      <button className="chord-main" type="button" onClick={onSelect} aria-pressed={selected}>
        {view === "harmonic" && (
          <>
            <strong>{model.chord.harmonicFunction.functionId}</strong>
            <span>{model.chord.spelling.symbol}</span>
          </>
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
        >
          +
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
      {model.recommendationStatus !== "none" && (
        <span className="recommendation-badge">
          {model.recommendationStatus === "best" ? "Best Match" : "Alternative"}
        </span>
      )}
    </article>
  );
}
