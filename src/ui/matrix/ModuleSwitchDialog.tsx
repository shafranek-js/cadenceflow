import { useMemo, useState, type ChangeEvent } from "react";
import type { HarmonicFunctionIdentity } from "../../domain/harmony/functions";
import type { ModuleSwitchPlan } from "../../domain/harmony/moduleSwitch";

export function ModuleSwitchDialog({ plan, onCancel, onConfirm }: {
  readonly plan: ModuleSwitchPlan;
  readonly onCancel: () => void;
  readonly onConfirm: (resolutions: Readonly<Record<string, HarmonicFunctionIdentity | "keep-original">>) => void;
}) {
  const ambiguous = useMemo(() => plan.resolutions.filter((item) => !item.automaticTarget), [plan]);
  const [selections, setSelections] = useState<Readonly<Record<string, string>>>(() => Object.freeze(Object.fromEntries(ambiguous.map((item) => [item.stepId, "keep-original"]))));

  const confirm = () => {
    const resolved: Record<string, HarmonicFunctionIdentity | "keep-original"> = {};
    for (const item of ambiguous) {
      const selected = selections[item.stepId] ?? "keep-original";
      resolved[item.stepId] = selected === "keep-original"
        ? "keep-original"
        : item.alternatives.find((candidate) => candidate.functionId === selected) ?? "keep-original";
    }
    onConfirm(Object.freeze(resolved));
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="module-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="module-switch-title">
        <h2 id="module-switch-title">Resolve ambiguous harmony</h2>
        <p>Unambiguous functions will convert automatically. Choose how to handle the remaining steps.</p>
        <div className="module-switch-resolutions">
          {ambiguous.map((item) => (
            <label key={item.stepId}>
              <span>{item.source.functionId}</span>
              <select
                value={selections[item.stepId] ?? "keep-original"}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelections(Object.freeze({ ...selections, [item.stepId]: event.target.value }))}
              >
                <option value="keep-original">Keep Original</option>
                {item.alternatives.map((candidate) => <option key={candidate.functionId} value={candidate.functionId}>{candidate.functionId}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="dialog-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" onClick={confirm}>Switch Module</button></div>
      </section>
    </div>
  );
}
