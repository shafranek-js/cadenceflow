import type { ChangeEvent } from "react";
import type { RegisterOffset } from "../../domain/progression/step";

const REGISTER_OPTIONS: readonly {
  readonly value: RegisterOffset;
  readonly label: string;
}[] = Object.freeze([
  Object.freeze({ value: "auto", label: "Auto" }),
  Object.freeze({ value: -2, label: "-2 Octaves" }),
  Object.freeze({ value: -1, label: "-1 Octave" }),
  Object.freeze({ value: 0, label: "0 (Default)" }),
  Object.freeze({ value: 1, label: "+1 Octave" }),
  Object.freeze({ value: 2, label: "+2 Octaves" }),
]);

export interface RegisterControlProps {
  readonly value: RegisterOffset;
  readonly disabled?: boolean;
  readonly onChange: (register: RegisterOffset) => void;
}

export function RegisterControl({ value, disabled = false, onChange }: RegisterControlProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const raw = event.target.value;
    if (raw === "auto") {
      onChange("auto");
    } else {
      onChange(Number(raw) as RegisterOffset);
    }
  };

  return (
    <div className="register-control" aria-label="Step register control">
      <label htmlFor="step-register-select">Register</label>
      <select
        id="step-register-select"
        value={String(value)}
        disabled={disabled}
        onChange={handleChange}
        aria-label="Register offset"
      >
        {REGISTER_OPTIONS.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
