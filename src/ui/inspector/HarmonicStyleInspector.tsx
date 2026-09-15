import {
  GENRE_FOCUS_OPTIONS,
  type GenreFocusId,
} from "../../domain/harmony/functionSemantics";

export interface HarmonicStyleInspectorProps {
  readonly value: GenreFocusId;
  readonly onChange: (genre: GenreFocusId) => void;
}

export function HarmonicStyleInspector({
  value,
  onChange,
}: HarmonicStyleInspectorProps) {
  const currentOption =
    GENRE_FOCUS_OPTIONS.find((opt) => opt.id === value) ?? GENRE_FOCUS_OPTIONS[0]!;

  return (
    <section
      className="harmonic-style-inspector"
      aria-label="Harmonic Style and Genre Focus"
      data-context="style-focus"
      data-testid="harmonic-style-inspector"
    >
      <header className="harmonic-style-header">
        <div>
          <span className="inspector-context-kicker">Harmonic Guide</span>
          <h3>Style Focus</h3>
        </div>
        <span
          className="style-active-badge"
          data-testid="style-active-badge"
          title={`Active style: ${currentOption.label}`}
        >
          {currentOption.label}
        </span>
      </header>

      <div className="harmonic-style-body">
        <div
          className="genre-focus-pills"
          role="radiogroup"
          aria-label="Select musical style focus"
          data-testid="genre-focus-selector"
        >
          {GENRE_FOCUS_OPTIONS.map((option) => {
            const active = value === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`genre-focus-pill ${active ? "is-active" : ""}`}
                title={`${option.label}: ${option.description}`}
                data-testid={`genre-focus-${option.id}`}
                onClick={() => onChange(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="harmonic-style-description" data-testid="harmonic-style-description">
          {currentOption.description}
        </p>
      </div>
    </section>
  );
}
