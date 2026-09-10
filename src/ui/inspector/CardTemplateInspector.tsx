import type { ChangeEvent } from "react";
import { useState } from "react";
import { resolveStepCreationDefaults } from "../../domain/project/defaults";
import {
  matrixCardOverrideCount,
  matrixCardOverrideKeys,
  type Project,
} from "../../domain/project/project";
import type { StepPerformanceOverrides } from "../../domain/project/defaults";
import type { MusicalDuration } from "../../domain/timing/duration";
import { ArticulationControl } from "./ArticulationControl";
import { RegisterControl } from "./RegisterControl";
import { StepDurationControl } from "../timing/StepDurationControl";

const TEMPLATE_REGISTER_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.template-register-disclosure-open";
const TEMPLATE_ARTICULATION_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.template-articulation-disclosure-open";
const TEMPLATE_DURATION_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.template-duration-disclosure-open";
const TEMPLATE_VELOCITY_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.template-velocity-disclosure-open";

function readDisclosureState(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function persistDisclosureState(key: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(open));
  } catch {
    // Disclosure preferences are best-effort when storage is unavailable.
  }
}

export function CardTemplateInspector({
  project,
  functionId,
  onPerformancePatch,
  onDurationChange,
  onReset,
}: {
  readonly project: Project;
  readonly functionId: string | null;
  readonly onPerformancePatch: (overrides: StepPerformanceOverrides) => void;
  readonly onDurationChange: (duration: MusicalDuration) => void;
  readonly onReset: () => void;
}) {
  const [registerOpen, setRegisterOpen] = useState(() =>
    readDisclosureState(TEMPLATE_REGISTER_DISCLOSURE_STORAGE_KEY, true),
  );
  const [articulationOpen, setArticulationOpen] = useState(() =>
    readDisclosureState(TEMPLATE_ARTICULATION_DISCLOSURE_STORAGE_KEY, true),
  );
  const [durationOpen, setDurationOpen] = useState(() =>
    readDisclosureState(TEMPLATE_DURATION_DISCLOSURE_STORAGE_KEY, true),
  );
  const [velocityOpen, setVelocityOpen] = useState(() =>
    readDisclosureState(TEMPLATE_VELOCITY_DISCLOSURE_STORAGE_KEY, true),
  );
  if (!functionId) return null;
  const card = project.moduleTemplateStates[project.activeModule].cards[functionId];
  const resolved = resolveStepCreationDefaults(project.defaults.piano, card?.explicitOverrides);
  const keys = matrixCardOverrideKeys(card);
  const count = matrixCardOverrideCount(card);
  return (
    <section
      className="card-template-inspector"
      aria-label={`Template settings for ${functionId}`}
      data-context="matrix-template"
      data-testid="matrix-template-inspector"
    >
      <header>
        <div>
          <span className="inspector-context-kicker">Matrix preview template</span>
          <h3>{functionId} Template</h3>
          <span
            className={count ? "template-status is-customized" : "template-status is-inherited"}
          >
            {count ? `Customized · ${count} overrides` : "Inheriting defaults · Inherited"}
          </span>
        </div>
        <button type="button" disabled={count === 0} onClick={onReset}>
          Reset Card to Defaults
        </button>
      </header>
      <details
        className="inspector-disclosure template-register-disclosure"
        open={registerOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setRegisterOpen(open);
          persistDisclosureState(TEMPLATE_REGISTER_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Register</span>
          <span className="disclosure-status">
            {resolved.performance.register === "auto"
              ? "Auto"
              : `${resolved.performance.register > 0 ? "+" : ""}${resolved.performance.register} oct.`}
          </span>
        </summary>
        <div className="inspector-disclosure-body">
          <RegisterControl
            value={resolved.performance.register}
            showLabel={false}
            onChange={(register) => onPerformancePatch({ register })}
          />
        </div>
      </details>

      <details
        className="inspector-disclosure template-articulation-disclosure"
        open={articulationOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setArticulationOpen(open);
          persistDisclosureState(TEMPLATE_ARTICULATION_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Articulation</span>
          <span className="disclosure-status">{resolved.performance.articulation}</span>
        </summary>
        <div className="inspector-disclosure-body">
          <ArticulationControl
            value={resolved.performance.articulation}
            showLabel={false}
            onChange={(articulation) => onPerformancePatch({ articulation })}
          />
        </div>
      </details>

      <details
        className="inspector-disclosure template-duration-disclosure"
        open={durationOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setDurationOpen(open);
          persistDisclosureState(TEMPLATE_DURATION_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Duration</span>
          <span className="disclosure-status">
            {resolved.duration.beats.numerator}/{resolved.duration.beats.denominator} beats
          </span>
        </summary>
        <div className="inspector-disclosure-body">
          <div data-testid="matrix-template-duration">
            <StepDurationControl
              variant="buttons"
              value={resolved.duration}
              onChange={onDurationChange}
              id={`matrix-template-duration-${functionId}`}
              label=""
            />
          </div>
        </div>
      </details>

      <details
        className="inspector-disclosure template-velocity-disclosure"
        open={velocityOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setVelocityOpen(open);
          persistDisclosureState(TEMPLATE_VELOCITY_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Master velocity</span>
          <span className="disclosure-status">{resolved.performance.masterVelocity}</span>
        </summary>
        <div className="inspector-disclosure-body">
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
        </div>
      </details>
      {keys.length ? (
        <p>Overrides: {keys.join(", ")}</p>
      ) : (
        <p>No explicit overrides. Values follow current Project/Piano Defaults.</p>
      )}
    </section>
  );
}
