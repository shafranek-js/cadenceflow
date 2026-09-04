import type { ChangeEvent } from "react";
import { resolveStepCreationDefaults } from "../../domain/project/defaults";
import {
  matrixCardOverrideCount,
  matrixCardOverrideKeys,
  type Project,
} from "../../domain/project/project";
import type { PianoArticulation, RegisterOffset } from "../../domain/progression/step";
import type { StepPerformanceOverrides } from "../../domain/project/defaults";

const ARTICULATIONS: readonly PianoArticulation[] = [
  "block",
  "arp-up",
  "arp-down",
  "broken-chord",
  "humanized",
];
const REGISTERS: readonly RegisterOffset[] = ["auto", -2, -1, 0, 1, 2];

export function CardTemplateInspector({
  project,
  functionId,
  onPerformancePatch,
  onReset,
}: {
  readonly project: Project;
  readonly functionId: string | null;
  readonly onPerformancePatch: (overrides: StepPerformanceOverrides) => void;
  readonly onReset: () => void;
}) {
  if (!functionId) return null;
  const card = project.moduleTemplateStates[project.activeModule].cards[functionId];
  const resolved = resolveStepCreationDefaults(project.defaults.piano, card?.explicitOverrides);
  const keys = matrixCardOverrideKeys(card);
  const count = matrixCardOverrideCount(card);
  return (
    <section className="card-template-inspector" aria-label={`Template settings for ${functionId}`}>
      <header>
        <div>
          <h3>{functionId} Template</h3>
          <span>{count ? `Customized · ${count} overrides` : "Inheriting defaults"}</span>
        </div>
        <button type="button" disabled={count === 0} onClick={onReset}>
          Reset Card to Defaults
        </button>
      </header>
      <label>
        Articulation
        <select
          value={resolved.performance.articulation}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onPerformancePatch({ articulation: event.target.value as PianoArticulation })
          }
        >
          {ARTICULATIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Register
        <select
          value={String(resolved.performance.register)}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onPerformancePatch({
              register:
                event.target.value === "auto"
                  ? "auto"
                  : (Number(event.target.value) as RegisterOffset),
            })
          }
        >
          {REGISTERS.map((value) => (
            <option key={String(value)} value={String(value)}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Master Velocity
        <input
          type="number"
          min="1"
          max="127"
          value={resolved.performance.masterVelocity}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onPerformancePatch({
              masterVelocity: Math.max(1, Math.min(127, Number(event.target.value))),
            })
          }
        />
      </label>
      {keys.length ? (
        <p>Overrides: {keys.join(", ")}</p>
      ) : (
        <p>No explicit overrides. Values follow current Project/Piano Defaults.</p>
      )}
    </section>
  );
}
