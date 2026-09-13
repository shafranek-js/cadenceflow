import { useState, useEffect, useId, type ChangeEvent } from "react";
import type { Meter, MeterChangePolicy } from "../../domain/timing/meter";
import { meter } from "../../domain/timing/meter";

export interface InspectorMeterSectionProps {
  readonly currentMeter: Meter;
  readonly onSetMeter: (newMeter: Meter, policy: MeterChangePolicy) => void;
  readonly defaultOpen?: boolean;
  readonly storageKey?: string;
}

function readDisclosureState(key?: string, fallback: boolean = true): boolean {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

export function InspectorMeterSection({
  currentMeter,
  onSetMeter,
  defaultOpen = true,
  storageKey,
}: InspectorMeterSectionProps) {
  const [isOpen, setIsOpen] = useState(() => readDisclosureState(storageKey, defaultOpen));

  const meterNumId = useId();
  const meterDenId = useId();
  const meterGroupingId = useId();

  const [meterNum, setMeterNum] = useState(currentMeter.numerator);
  const [meterDen, setMeterDen] = useState<Meter["denominator"]>(currentMeter.denominator);
  const [groupingText, setGroupingText] = useState(currentMeter.grouping.join("+"));
  const [meterPolicy, setMeterPolicy] = useState<MeterChangePolicy>("reflow");
  const [groupingError, setGroupingError] = useState<string | null>(null);

  useEffect(() => {
    setMeterNum(currentMeter.numerator);
    setMeterDen(currentMeter.denominator);
    setGroupingText(currentMeter.grouping.join("+"));
    setGroupingError(null);
  }, [currentMeter.numerator, currentMeter.denominator, currentMeter.grouping]);

  const parseGrouping = (
    text: string,
    expectedNum: number,
  ): { grouping: number[]; error: string | null } => {
    const trimmed = text.trim();
    if (!trimmed) {
      return { grouping: [expectedNum], error: null };
    }
    const parts = trimmed
      .split(/[+, ]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return { grouping: [expectedNum], error: null };
    }
    const numbers: number[] = [];
    for (const p of parts) {
      const parsed = Number(p);
      if (!/^[1-9]\d*$/.test(p) || !Number.isSafeInteger(parsed)) {
        return { grouping: [], error: `Invalid group element "${p}": must be positive integer` };
      }
      numbers.push(parsed);
    }
    const sum = numbers.reduce((a, b) => a + b, 0);
    if (sum !== expectedNum) {
      return {
        grouping: [],
        error: `Grouping sum (${sum}) does not equal numerator (${expectedNum})`,
      };
    }
    return { grouping: numbers, error: null };
  };

  const handleGroupingChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value;
    setGroupingText(nextText);
    const { error } = parseGrouping(nextText, meterNum);
    setGroupingError(error);
  };

  const handleNumeratorChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (Number.isSafeInteger(val) && val > 0 && val <= 32) {
      setMeterNum(val);
      const { error } = parseGrouping(groupingText, val);
      setGroupingError(error);
    }
  };

  const handleApplyMeter = () => {
    const { grouping, error } = parseGrouping(groupingText, meterNum);
    if (error) {
      setGroupingError(error);
      return;
    }
    try {
      const validatedMeter = meter(meterNum, meterDen, grouping);
      onSetMeter(validatedMeter, meterPolicy);
      setGroupingError(null);
    } catch (err) {
      setGroupingError(String(err));
    }
  };

  return (
    <details
      className="inspector-disclosure global-meter-disclosure"
      open={isOpen}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setIsOpen(nextOpen);
        if (storageKey && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storageKey, String(nextOpen));
          } catch {
            // ignore
          }
        }
      }}
    >
      <summary>
        <span>Time signature &amp; meter</span>
        <span className="disclosure-status">
          {currentMeter.numerator}/{currentMeter.denominator} ({currentMeter.grouping.join("+")})
        </span>
      </summary>
      <div className="inspector-disclosure-body">
        <div className="inspector-group" role="group" aria-label="Time Signature and Meter">
          <div className="meter-controls-group">
            <div className="meter-fraction-inputs">
              <label htmlFor={meterNumId} className="meter-input-label transport-label">
                Meter
              </label>
              <div className="fraction-row">
                <input
                  id={meterNumId}
                  type="number"
                  min={1}
                  max={32}
                  value={meterNum}
                  onChange={handleNumeratorChange}
                  className="meter-num-input"
                  aria-label="Meter numerator"
                />
                <span className="meter-divider">/</span>
                <select
                  id={meterDenId}
                  value={meterDen}
                  onChange={(e) =>
                    setMeterDen(parseInt(e.target.value, 10) as Meter["denominator"])
                  }
                  className="meter-den-select"
                  aria-label="Meter denominator"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                </select>
              </div>
            </div>

            <div className="grouping-control">
              <label htmlFor={meterGroupingId} className="subgroup-label">
                Pulse Grouping
              </label>
              <input
                id={meterGroupingId}
                type="text"
                value={groupingText}
                onChange={handleGroupingChange}
                placeholder="e.g. 3+2+2"
                className={`meter-grouping-input ${groupingError ? "has-error" : ""}`}
                aria-label="Pulse grouping"
                title="Pulse grouping pattern (e.g. 3+2+2)"
              />
            </div>

            <div
              className="meter-policy-toggle"
              role="radiogroup"
              aria-label="Time Signature Policy"
            >
              <label className={`policy-option ${meterPolicy === "reflow" ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="global-meter-policy"
                  value="reflow"
                  aria-label="Reflow"
                  checked={meterPolicy === "reflow"}
                  onChange={() => setMeterPolicy("reflow")}
                />
                Reflow
              </label>
              <label
                className={`policy-option ${meterPolicy === "preserve-beat-lengths" ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="global-meter-policy"
                  value="preserve-beat-lengths"
                  aria-label="Preserve"
                  checked={meterPolicy === "preserve-beat-lengths"}
                  onChange={() => setMeterPolicy("preserve-beat-lengths")}
                />
                Preserve
              </label>
            </div>

            <button
              type="button"
              className="meter-apply-btn"
              onClick={handleApplyMeter}
              disabled={Boolean(groupingError)}
              aria-label="Apply Meter Change"
            >
              Apply Meter Change
            </button>
          </div>
          {groupingError ? (
            <span className="grouping-error-message" role="alert">
              {groupingError}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  );
}
