import type { DerivedMode } from "../../domain/harmony/functions";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import { defaultTonicSpelling, formatPitchSpelling } from "../../domain/harmony/spelling";

const PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export function TonicSelector({
  tonic,
  mode,
  onChange,
}: {
  readonly tonic: PitchClassIdentity;
  readonly mode: DerivedMode;
  readonly onChange: (tonic: PitchClassIdentity) => void;
}) {
  return (
    <aside className="tonic-selector" aria-label="Set The Key">
      <strong>Set The Key</strong>
      <div className="tonic-buttons">
        {PITCH_CLASSES.map((pc) => {
          const label = formatPitchSpelling(defaultTonicSpelling(pc, mode));
          return (
            <button
              key={pc}
              type="button"
              className={pc === tonic ? "is-active" : ""}
              aria-pressed={pc === tonic}
              aria-label={`Set key ${label}`}
              onClick={() => onChange(pc)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
