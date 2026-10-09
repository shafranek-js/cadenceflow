import { useState, useEffect, useId, type ChangeEvent } from "react";
import type { GrooveSettings } from "../../domain/timing/swing";
import { useInspectorDisclosure } from "./useInspectorDisclosure";

export interface InspectorGrooveSectionProps {
  readonly groove: GrooveSettings;
  readonly onSetGroove: (groove: GrooveSettings) => void;
  readonly defaultOpen?: boolean;
  readonly storageKey?: string;
  readonly dragHandle?: React.ReactNode;
}

export function InspectorGrooveSection({
  groove,
  onSetGroove,
  defaultOpen = true,
  storageKey,
  dragHandle,
}: InspectorGrooveSectionProps) {
  const disclosure = useInspectorDisclosure(storageKey ?? null, defaultOpen);
  const swingSliderId = useId();

  const [cachedSwingAmount, setCachedSwingAmount] = useState(
    groove.swingAmount > 0 ? groove.swingAmount : 0.66,
  );

  useEffect(() => {
    if (groove.swingAmount > 0) {
      setCachedSwingAmount(groove.swingAmount);
    }
  }, [groove.swingAmount]);

  const handleGrooveToggle = () => {
    const isCurrentlySwing = groove.feel === "swing";
    const nextGroove: GrooveSettings = isCurrentlySwing
      ? { feel: "straight", swingAmount: 0 }
      : { feel: "swing", swingAmount: cachedSwingAmount };
    onSetGroove(nextGroove);
  };

  const handleSwingAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const amount = parseFloat(e.target.value);
    if (Number.isFinite(amount)) {
      setCachedSwingAmount(amount);
      onSetGroove({
        feel: amount > 0 ? "swing" : "straight",
        swingAmount: amount,
      });
    }
  };

  return (
    <details
      className="inspector-disclosure global-groove-disclosure"
      open={disclosure.isOpen}
      onToggle={(event) => disclosure.setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          {dragHandle}
          Groove &amp; swing
        </span>
        <span className="disclosure-status">
          {groove.feel === "swing" ? `Swing ${Math.round(groove.swingAmount * 100)}%` : "Straight"}
        </span>
      </summary>
      <div className="inspector-disclosure-body">
        <div className="inspector-group" role="group" aria-label="Global Rhythmic Feel Controls">
          <div className="groove-controls-group">
            <button
              type="button"
              className={`groove-toggle-btn ${groove.feel === "swing" ? "is-active" : ""}`}
              onClick={handleGrooveToggle}
              aria-pressed={groove.feel === "swing"}
              aria-label="Toggle Swing Feel"
            >
              {groove.feel === "swing" ? "Swing" : "Straight"}
            </button>
            {groove.feel === "swing" ? (
              <div className="swing-slider-group">
                <label htmlFor={swingSliderId} className="subgroup-label">
                  Swing Amount
                </label>
                <input
                  id={swingSliderId}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={groove.swingAmount}
                  onChange={handleSwingAmountChange}
                  className="swing-slider"
                  aria-label="Swing Amount"
                />
                <span className="swing-percent">{Math.round(groove.swingAmount * 100)}%</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </details>
  );
}
