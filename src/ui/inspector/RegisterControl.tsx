import type { RegisterOffset } from "../../domain/progression/step";
import { Icon } from "../common/Icon";

const REGISTER_OPTIONS: readonly {
  readonly value: RegisterOffset;
  readonly label: string;
  readonly shortLabel: string;
  readonly icon: "arrow-down" | "arrow-up" | "reset";
}[] = Object.freeze([
  Object.freeze({ value: -2, label: "-2 Octaves", shortLabel: "2", icon: "arrow-down" }),
  Object.freeze({ value: -1, label: "-1 Octave", shortLabel: "1", icon: "arrow-down" }),
  Object.freeze({ value: "auto", label: "Auto", shortLabel: "A", icon: "reset" }),
  Object.freeze({ value: 0, label: "0 (Default)", shortLabel: "0", icon: "reset" }),
  Object.freeze({ value: 1, label: "+1 Octave", shortLabel: "1", icon: "arrow-up" }),
  Object.freeze({ value: 2, label: "+2 Octaves", shortLabel: "2", icon: "arrow-up" }),
]);

export interface RegisterControlProps {
  readonly value: RegisterOffset;
  readonly disabled?: boolean;
  readonly showLabel?: boolean;
  readonly onChange: (register: RegisterOffset) => void;
}

export function RegisterControl({
  value,
  disabled = false,
  showLabel = true,
  onChange,
}: RegisterControlProps) {
  return (
    <div className="register-control" role="group" aria-label="Step register control">
      {showLabel ? <span className="register-label">Register</span> : null}
      <div className="register-options" role="group" aria-label="Register offset">
        {REGISTER_OPTIONS.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className="register-option"
            aria-label={`Register offset: ${opt.label}`}
            aria-pressed={value === opt.value}
            data-testid="register-option"
            data-register-value={String(opt.value)}
            title={opt.label}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
          >
            <Icon name={opt.icon} />
            <span>{opt.shortLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
