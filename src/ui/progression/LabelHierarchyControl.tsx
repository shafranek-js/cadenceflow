import { LABEL_HIERARCHY_MODES, type LabelHierarchyMode } from "./labelHierarchy";

export function LabelHierarchyControl({
  value,
  onChange,
}: {
  readonly value: LabelHierarchyMode;
  readonly onChange: (mode: LabelHierarchyMode) => void;
}) {
  return (
    <div
      className="label-hierarchy-control"
      role="group"
      aria-label="Chord label hierarchy"
      data-testid="label-hierarchy-control"
    >
      <span className="label-hierarchy-control-label">Labels</span>
      <div
        className="label-hierarchy-control-options"
        role="group"
        aria-label="Chord label hierarchy mode"
      >
        {LABEL_HIERARCHY_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={`label-hierarchy-btn${value === mode.value ? " is-active" : ""}`}
            onClick={() => onChange(mode.value)}
            aria-label={mode.label}
            aria-pressed={value === mode.value}
            title={mode.description}
            data-testid={`label-hierarchy-${mode.value}`}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
