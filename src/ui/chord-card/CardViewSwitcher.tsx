import type { CardViewId } from "../../domain/progression/step";

const VIEWS: readonly CardViewId[] = ["harmonic", "piano", "staff"];
const VIEW_GLYPHS: Readonly<Record<CardViewId, string>> = {
  harmonic: "H",
  piano: "P",
  staff: "S",
};

export function CardViewSwitcher({
  value,
  onChange,
  label = "Card view",
}: {
  readonly value: CardViewId;
  readonly onChange: (view: CardViewId) => void;
  readonly label?: string;
}) {
  return (
    <div className="card-view-switcher" role="group" aria-label={label}>
      {VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          data-view={view}
          title={`${view[0]!.toUpperCase()}${view.slice(1)} card view`}
          onClick={() => onChange(view)}
        >
          <span className="card-view-glyph" aria-hidden="true">
            {VIEW_GLYPHS[view]}
          </span>
          <span className="card-view-label">{view}</span>
        </button>
      ))}
    </div>
  );
}
