import type { LoopMode, LoopState } from "../transport/loopState";
import type { ProgressionStep } from "../../domain/progression/step";
import { useInspectorDisclosure } from "./useInspectorDisclosure";

export interface InspectorLoopSectionProps {
  readonly loopState: LoopState;
  readonly steps: readonly ProgressionStep[];
  readonly onSetLoopMode: (mode: LoopMode) => void;
  readonly onSetLoopRange?: ((startStepId: string, endStepId: string) => void) | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly storageKey?: string | undefined;
  readonly dragHandle?: React.ReactNode;
}

export function InspectorLoopSection({
  loopState,
  steps,
  onSetLoopMode,
  onSetLoopRange,
  defaultOpen = true,
  storageKey,
  dragHandle,
}: InspectorLoopSectionProps) {
  const disclosure = useInspectorDisclosure(storageKey ?? null, defaultOpen);

  return (
    <details
      className="inspector-disclosure loop-disclosure"
      open={disclosure.isOpen}
      onToggle={(event) => disclosure.setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          {dragHandle}
          Loop Settings
        </span>
        <span className="disclosure-status">
          {loopState.mode === "disabled" ? "Off" : loopState.mode === "all" ? "All" : "Range"}
        </span>
      </summary>
      <div className="inspector-disclosure-body">
        <div className="transport-section transport-loop" role="group" aria-label="Loop Controls">
          <span className="transport-label">Loop</span>
          <div className="loop-controls-group">
            <div className="loop-mode-selector" role="group" aria-label="Loop Mode">
              <button
                type="button"
                className={`loop-mode-btn ${loopState.mode === "disabled" ? "is-active" : ""}`}
                onClick={() => onSetLoopMode("disabled")}
                aria-pressed={loopState.mode === "disabled"}
              >
                Off
              </button>
              <button
                type="button"
                className={`loop-mode-btn ${loopState.mode === "all" ? "is-active" : ""}`}
                onClick={() => onSetLoopMode("all")}
                aria-pressed={loopState.mode === "all"}
              >
                All
              </button>
              <button
                type="button"
                className={`loop-mode-btn ${loopState.mode === "range" ? "is-active" : ""}`}
                onClick={() => onSetLoopMode("range")}
                aria-pressed={loopState.mode === "range"}
              >
                Range
              </button>
            </div>

            {loopState.mode === "range" && steps.length > 0 && (
              <div className="loop-range-selectors">
                <label className="loop-range-label">
                  From:
                  <select
                    value={loopState.region?.startStepId ?? steps[0]?.id}
                    onChange={(e) => {
                      const startId = e.target.value;
                      const endId =
                        loopState.region?.endStepId ?? steps[steps.length - 1]?.id ?? startId;
                      onSetLoopRange?.(startId, endId);
                    }}
                    className="loop-step-select"
                    aria-label="Loop start step"
                  >
                    {steps.map((s, idx) => (
                      <option key={s.id} value={s.id}>
                        {idx + 1}: {s.kind === "chord" ? s.harmonicFunction.functionId : "Rest"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="loop-range-label">
                  To:
                  <select
                    value={loopState.region?.endStepId ?? steps[steps.length - 1]?.id}
                    onChange={(e) => {
                      const endId = e.target.value;
                      const startId = loopState.region?.startStepId ?? steps[0]?.id ?? endId;
                      onSetLoopRange?.(startId, endId);
                    }}
                    className="loop-step-select"
                    aria-label="Loop end step"
                  >
                    {steps.map((s, idx) => (
                      <option key={s.id} value={s.id}>
                        {idx + 1}: {s.kind === "chord" ? s.harmonicFunction.functionId : "Rest"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
