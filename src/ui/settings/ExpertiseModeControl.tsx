import type { PresentationMode } from "../../domain/project/project";

const MODES: readonly {
  readonly value: PresentationMode;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: "beginner",
    label: "Beginner",
    description: "Plain-language explanations",
  },
  {
    value: "composer",
    label: "Composer",
    description: "Functional harmony vocabulary",
  },
  {
    value: "expert",
    label: "Expert",
    description: "Scores and diagnostic detail",
  },
];

export function ExpertiseModeControl({
  value,
  onChange,
}: {
  readonly value: PresentationMode;
  readonly onChange: (mode: PresentationMode) => void;
}) {
  return (
    <div
      className="presentation-control expertise-mode-control"
      role="group"
      aria-label="Expertise mode"
    >
      <span className="presentation-control-label">Expertise</span>
      <div className="presentation-control-options">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className={value === mode.value ? "is-active" : ""}
            aria-pressed={value === mode.value}
            aria-label={`${mode.label} expertise mode`}
            title={`${mode.label}: ${mode.description}`}
            onClick={() => onChange(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
