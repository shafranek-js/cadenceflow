import { useEffect, useId, useState, type ChangeEvent } from "react";
import {
  formatMusicalDuration,
  musicalDuration,
  type MusicalDuration,
} from "../../domain/timing/duration";
import { durationBars } from "../../domain/timing/duration";
import type { Meter } from "../../domain/timing/meter";
import { equalRational } from "../../domain/timing/rational";
import {
  DURATION_PRESETS,
  durationDotted,
  durationTriplet,
  findDurationPreset,
  parseCustomDuration,
  QUICK_DURATION_BUTTON_PRESETS,
  type DurationPreset,
} from "./stepDuration";

const DURATION_SYMBOLS: Readonly<Record<string, string>> = {
  "4/1": "𝅝",
  "2/1": "𝅗𝅥",
  "1/1": "♩",
  "1/2": "♪",
  "1/4": "𝅘𝅥𝅯",
};

export interface StepDurationControlProps {
  readonly value: MusicalDuration;
  readonly onChange: (duration: MusicalDuration) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly stepId?: string;
  readonly variant?: "select" | "buttons";
  readonly label?: string;
  readonly meter?: Meter | undefined;
  readonly includeFullBar?: boolean;
}

export function StepDurationControl({
  value,
  onChange,
  disabled = false,
  id,
  stepId,
  variant = "select",
  label = "Duration",
  meter,
  includeFullBar = false,
}: StepDurationControlProps) {
  const generatedId = useId();
  const selectId =
    id ?? (stepId ? `step-duration-select-${stepId}` : `step-duration-select-${generatedId}`);
  const customInputId = stepId
    ? `step-duration-custom-${stepId}`
    : `step-duration-custom-${generatedId}`;
  const errorId = stepId ? `step-duration-error-${stepId}` : `step-duration-error-${generatedId}`;

  const matchedPreset = findDurationPreset(value);
  const fullBar = includeFullBar && meter ? durationBars(1, meter) : undefined;
  const isFullBar = Boolean(fullBar && equalRational(value.beats, fullBar.beats));
  const [isCustomMode, setIsCustomMode] = useState(!matchedPreset);
  const [customText, setCustomText] = useState(formatMusicalDuration(value));
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    const currentMatched = findDurationPreset(value);
    setCustomText(formatMusicalDuration(value));
    setCustomError(null);
    if (!currentMatched && !isFullBar) {
      setIsCustomMode(true);
    } else {
      setIsCustomMode(false);
    }
  }, [value, isFullBar]);

  const handlePresetSelect = (preset: DurationPreset) => {
    setIsCustomMode(false);
    setCustomError(null);
    onChange(musicalDuration(preset.beats));
  };

  const handleDotted = () => {
    setIsCustomMode(false);
    setCustomError(null);
    onChange(durationDotted(value));
  };

  const handleTriplet = () => {
    setIsCustomMode(false);
    setCustomError(null);
    onChange(durationTriplet(value));
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

  if (variant === "buttons") {
    return (
      <div className="step-duration-control duration-buttons-control">
        {label ? <span className="step-duration-label">{label}</span> : null}
        <div
          className="duration-buttons-group"
          role="group"
          aria-label={label || "Duration presets"}
        >
          <div className="duration-preset-row">
            {QUICK_DURATION_BUTTON_PRESETS.map((preset) => {
              const isSelected = !isFullBar && matchedPreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="duration-btn"
                  onClick={() => handlePresetSelect(preset)}
                  disabled={disabled}
                  title={preset.label}
                  aria-label={`${preset.shortLabel} note (${formatMusicalDuration(musicalDuration(preset.beats))} canonical beat${preset.beatsNumerator === 1 && preset.beatsDenominator === 1 ? "" : "s"})`}
                  aria-pressed={isSelected}
                  data-testid={preset.testId}
                  data-duration-value={preset.id}
                >
                  <span className="duration-symbol" aria-hidden="true">
                    {DURATION_SYMBOLS[preset.id] ?? "♩"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="duration-modifier-row">
            {fullBar ? (
              <button
                type="button"
                className="duration-btn duration-btn-wide"
                onClick={() =>
                  handlePresetSelect({
                    id: "full-bar",
                    label: `Full bar — ${formatMusicalDuration(fullBar)} beats`,
                    shortLabel: "Full bar",
                    beats: fullBar.beats,
                    beatsNumerator: fullBar.beats.numerator,
                    beatsDenominator: fullBar.beats.denominator,
                  })
                }
                disabled={disabled}
                title={`Full bar — ${formatMusicalDuration(fullBar)} beats`}
                aria-label={`Full bar (${formatMusicalDuration(fullBar)} beats)`}
                aria-pressed={isFullBar}
                data-testid="duration-preset-full-bar"
                data-duration-value="full-bar"
              >
                <span className="duration-symbol" aria-hidden="true">
                  𝄻
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="duration-btn duration-btn-wide"
              onClick={handleDotted}
              disabled={disabled}
              title="Dotted (× 1.5)"
              aria-label="Dotted (× 1.5 beats)"
              data-testid="duration-preset-dotted"
            >
              <span className="duration-symbol" aria-hidden="true">
                ♩·
              </span>
            </button>
            <button
              type="button"
              className="duration-btn duration-btn-wide"
              onClick={handleTriplet}
              disabled={disabled}
              title="Triplet (× 2/3)"
              aria-label="Triplet (× 2/3 beat)"
              data-testid="duration-preset-triplet"
            >
              <span className="duration-symbol" aria-hidden="true">
                ♩³
              </span>
            </button>
          </div>

          <div className="custom-duration-group">
            <label htmlFor={customInputId} className="custom-duration-label">
              Custom beats
            </label>
            <input
              id={customInputId}
              type="text"
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
              className={`custom-duration-input ${customError ? "has-error" : ""}`}
              disabled={disabled}
              aria-label="Duration in canonical quarter-note beats"
              title="Duration in canonical quarter-note beats (e.g. 3/4, 2, 1/2)"
            />
            <button
              type="button"
              className="custom-duration-apply-btn"
              onClick={handleApplyCustom}
              disabled={disabled}
              aria-label="Set custom duration in beats"
            >
              Set
            </button>
          </div>
          {customError ? (
            <span className="duration-error-message" role="alert">
              {customError}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  // variant === "select"
  const selectValue = isCustomMode
    ? "custom"
    : isFullBar
      ? "full-bar"
      : (matchedPreset?.id ?? "custom");

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (selectedId === "custom") {
      setIsCustomMode(true);
      setCustomText(formatMusicalDuration(value));
      setCustomError(null);
    } else if (selectedId === "full-bar" && fullBar) {
      handlePresetSelect({
        id: "full-bar",
        label: `Full bar — ${formatMusicalDuration(fullBar)} beats`,
        shortLabel: "Full bar",
        beats: fullBar.beats,
        beatsNumerator: fullBar.beats.numerator,
        beatsDenominator: fullBar.beats.denominator,
      });
    } else {
      const preset = DURATION_PRESETS.find((p) => p.id === selectedId);
      if (preset) {
        handlePresetSelect(preset);
      }
    }
  };

  return (
    <div className="step-duration-control">
      <label htmlFor={selectId} className="step-duration-label">
        {label}
      </label>
      <select
        id={selectId}
        data-testid="step-duration-select"
        aria-label={label}
        value={selectValue}
        onChange={handleSelectChange}
        disabled={disabled}
      >
        {DURATION_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
        {fullBar ? (
          <option value="full-bar">{`Full bar — ${formatMusicalDuration(fullBar)} beats`}</option>
        ) : null}
        <option value="custom">
          {!matchedPreset && !isFullBar
            ? `Custom (${formatMusicalDuration(value)} beats)`
            : "Custom..."}
        </option>
      </select>

      {(isCustomMode || (!matchedPreset && !isFullBar)) && (
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
