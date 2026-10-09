import { GENRE_FOCUS_OPTIONS, type GenreFocusId } from "../../domain/harmony/functionSemantics";

export function GenreFocusSelector({
  value,
  onChange,
}: {
  readonly value: GenreFocusId;
  readonly onChange: (genre: GenreFocusId) => void;
}) {
  return (
    <div
      className="genre-focus-selector"
      role="radiogroup"
      aria-label="Musical style focus"
      data-testid="genre-focus-selector"
    >
      <span className="genre-focus-label">Style</span>
      <div className="genre-focus-pills">
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
    </div>
  );
}
