import type { CardViewId } from "../../domain/progression/step";

const VIEWS: readonly CardViewId[] = ["harmonic", "piano", "staff"];

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
          onClick={() => onChange(view)}
        >
          {view}
        </button>
      ))}
    </div>
  );
}
