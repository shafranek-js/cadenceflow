import { useEffect, useId, useState, type ChangeEvent } from "react";
import {
  formatMusicalDuration,
  musicalDuration,
  type MusicalDuration,
} from "../../domain/timing/duration";
import { DURATION_PRESETS, findDurationPreset, parseCustomDuration } from "./stepDuration";

export interface StepDurationControlProps {
  readonly value: MusicalDuration;
  readonly onChange: (duration: MusicalDuration) => void;
  readonly disabled?: boolean;
  readonly id?: string;
}

export function StepDurationControl({
  value,
  onChange,
  disabled = false,
  id,
}: StepDurationControlProps) {
  const generatedId = useId();
  const selectId = id ?? `step-duration-select-${generatedId}`;
  const customInputId = `step-duration-custom-${generatedId}`;
  const errorId = `step-duration-error-${generatedId}`;

  const matchedPreset = findDurationPreset(value);
  const [isCustomMode, setIsCustomMode] = useState(!matchedPreset);
  const [customText, setCustomText] = useState(formatMusicalDuration(value));
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    const currentMatched = findDurationPreset(value);
    setCustomText(formatMusicalDuration(value));
    setCustomError(null);
    if (!currentMatched) {
      setIsCustomMode(true);
    } else {
      setIsCustomMode(false);
    }
  }, [value]);

  const selectValue = isCustomMode || !matchedPreset ? "custom" : matchedPreset.id;

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (selectedId === "custom") {
      setIsCustomMode(true);
      setCustomText(formatMusicalDuration(value));
      setCustomError(null);
    } else {
      const preset = DURATION_PRESETS.find((p) => p.id === selectedId);
      if (preset) {
        setIsCustomMode(false);
        setCustomError(null);
        onChange(musicalDuration(preset.beats));
      }
    }
  };

  const handleApplyCustom = () => {
    const result = parseCustomDuration(customText);
    if (result.error) {
      setCustomError(result.error);
    } else if (result.duration) {
      setCustomError(null);
      onChange(result.duration);
    }
  };

  return (
    <div className="step-duration-control">
      <label htmlFor={selectId} className="step-duration-label">
        Duration
      </label>
      <select
        id={selectId}
        data-testid="step-duration-select"
        aria-label="Duration"
        value={selectValue}
        onChange={handleSelectChange}
        disabled={disabled}
      >
        {DURATION_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
        <option value="custom">
          {!matchedPreset ? `Custom (${formatMusicalDuration(value)} beats)` : "Custom..."}
        </option>
      </select>

      {(isCustomMode || !matchedPreset) && (
        <div className="step-duration-custom">
          <label htmlFor={customInputId} className="step-duration-custom-label">
            Beats:
          </label>
          <div className="step-duration-custom-input-group">
            <input
              id={customInputId}
              type="text"
              data-testid="step-duration-custom-input"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setCustomError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleApplyCustom();
                }
              }}
              placeholder="e.g. 3/4"
              className={customError ? "has-error" : ""}
              disabled={disabled}
              aria-label="Custom step duration in beats"
              aria-describedby={customError ? errorId : undefined}
            />
            <button
              type="button"
              data-testid="step-duration-custom-set-btn"
              className="step-duration-set-btn"
              onClick={handleApplyCustom}
              disabled={disabled}
              aria-label="Set custom duration in beats"
            >
              Set
            </button>
          </div>
          {customError && (
            <span id={errorId} className="duration-error-message" role="alert">
              {customError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
