import { useMemo, useState } from "react";
import type { MeasuresPerSystem, Project, ProgressionView } from "../../domain/project/project";
import type {
  BassChoice,
  BassOctaveOffset,
  ChordStep,
  DynamicsViewPreference,
  StepPerformance,
} from "../../domain/progression/step";
import { formatMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { createProgressionMeasureLayout } from "../../domain/timing/measureLayout";
import {
  musicalDynamicToVelocity,
  velocityToMusicalDynamic,
} from "../../instruments/piano/dynamics";
import type { MusicalDynamicLabel } from "../../instruments/contracts";
import { ArticulationControl } from "./ArticulationControl";
import { RegisterControl } from "./RegisterControl";
import { StepDurationControl } from "../timing/StepDurationControl";

const GLOBAL_REGISTER_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-register-disclosure-open";
const GLOBAL_ARTICULATION_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-articulation-disclosure-open";
const GLOBAL_DURATION_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-duration-disclosure-open";
const GLOBAL_DYNAMICS_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-dynamics-disclosure-open";
const GLOBAL_BASS_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.progression-global-bass-disclosure-open";
const GLOBAL_PROGRESSION_VIEW_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-view-disclosure-open";
const GLOBAL_MEASURES_LAYOUT_STORAGE_KEY =
  "cadenceflow.ui.progression-global-measures-layout-disclosure-open";

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
    // Best effort
  }
}

const BASS_CHOICES: readonly { readonly value: BassChoice; readonly label: string }[] =
  Object.freeze([
    Object.freeze({ value: "auto", label: "Auto" }),
    Object.freeze({ value: "root", label: "Root" }),
    Object.freeze({ value: "third", label: "3rd" }),
    Object.freeze({ value: "fifth", label: "5th" }),
  ]);

const BASS_OCTAVES: readonly { readonly value: BassOctaveOffset; readonly label: string }[] =
  Object.freeze([
    Object.freeze({ value: "auto", label: "Auto" }),
    Object.freeze({ value: -1, label: "-1 Octave" }),
    Object.freeze({ value: -2, label: "-2 Octaves" }),
  ]);

const MUSICAL_DYNAMICS: readonly MusicalDynamicLabel[] = ["pp", "p", "mp", "mf", "f", "ff"];

export interface ProgressionGlobalInspectorProps {
  readonly project: Project;
  readonly onBatchPerformanceChange: (performance: Partial<StepPerformance>) => void;
  readonly onBatchDurationChange: (duration: MusicalDuration) => void;
  readonly onResetAll: () => void;
  readonly onSetProgressionView?: (view: ProgressionView) => void;
  readonly onSetMeasuresPerSystem?: (value: MeasuresPerSystem) => void;
}

export function ProgressionGlobalInspector({
  project,
  onBatchPerformanceChange,
  onBatchDurationChange,
  onResetAll,
  onSetProgressionView,
  onSetMeasuresPerSystem,
}: ProgressionGlobalInspectorProps) {
  const [registerOpen, setRegisterOpen] = useState(() =>
    readDisclosureState(GLOBAL_REGISTER_DISCLOSURE_STORAGE_KEY, true),
  );
  const [articulationOpen, setArticulationOpen] = useState(() =>
    readDisclosureState(GLOBAL_ARTICULATION_DISCLOSURE_STORAGE_KEY, true),
  );
  const [durationOpen, setDurationOpen] = useState(() =>
    readDisclosureState(GLOBAL_DURATION_DISCLOSURE_STORAGE_KEY, true),
  );
  const [dynamicsOpen, setDynamicsOpen] = useState(() =>
    readDisclosureState(GLOBAL_DYNAMICS_DISCLOSURE_STORAGE_KEY, true),
  );
  const [bassOpen, setBassOpen] = useState(() =>
    readDisclosureState(GLOBAL_BASS_DISCLOSURE_STORAGE_KEY, true),
  );
  const [progressionViewOpen, setProgressionViewOpen] = useState(() =>
    readDisclosureState(GLOBAL_PROGRESSION_VIEW_DISCLOSURE_STORAGE_KEY, true),
  );
  const [measuresLayoutOpen, setMeasuresLayoutOpen] = useState(() =>
    readDisclosureState(GLOBAL_MEASURES_LAYOUT_STORAGE_KEY, true),
  );
  const [viewPreference, setViewPreference] = useState<DynamicsViewPreference>("musical");

  const steps = project.progression.steps;
  const chordSteps = useMemo(
    () => steps.filter((s): s is ChordStep => s.kind === "chord"),
    [steps],
  );
  const measureLayout = useMemo(
    () => createProgressionMeasureLayout(steps, project.globalTiming.meter),
    [steps, project.globalTiming.meter],
  );

  const measureCount = measureLayout.measures.length;
  const stepCount = steps.length;
  const chordStepCount = chordSteps.length;

  // Resolve representative / common values across chord steps
  const commonRegister =
    chordSteps.length > 0 &&
    chordSteps.every((s) => s.performance.register === chordSteps[0]!.performance.register)
      ? chordSteps[0]!.performance.register
      : project.defaults.piano.performance.register;

  const commonArticulation =
    chordSteps.length > 0 &&
    chordSteps.every((s) => s.performance.articulation === chordSteps[0]!.performance.articulation)
      ? chordSteps[0]!.performance.articulation
      : project.defaults.piano.performance.articulation;

  const commonDuration =
    steps.length > 0 &&
    steps.every(
      (s) =>
        s.duration.beats.numerator === steps[0]!.duration.beats.numerator &&
        s.duration.beats.denominator === steps[0]!.duration.beats.denominator,
    )
      ? steps[0]!.duration
      : project.defaults.piano.duration;

  const commonMasterVelocity =
    chordSteps.length > 0 &&
    chordSteps.every(
      (s) => s.performance.masterVelocity === chordSteps[0]!.performance.masterVelocity,
    )
      ? chordSteps[0]!.performance.masterVelocity
      : project.defaults.piano.performance.masterVelocity;

  const commonBassChoice =
    chordSteps.length > 0 &&
    chordSteps.every((s) => s.performance.bass.choice === chordSteps[0]!.performance.bass.choice)
      ? chordSteps[0]!.performance.bass.choice
      : "auto";

  const commonBassOctave =
    chordSteps.length > 0 &&
    chordSteps.every(
      (s) => s.performance.bass.octaveOffset === chordSteps[0]!.performance.bass.octaveOffset,
    )
      ? chordSteps[0]!.performance.bass.octaveOffset
      : "auto";

  const totalOverridesCount = chordSteps.reduce(
    (acc, step) => acc + Object.keys(step.performance.perNoteVelocityOverrides || {}).length,
    0,
  );

  const handleMasterVelocityChange = (val: number) => {
    const clamped = Math.max(1, Math.min(127, Math.round(val)));
    onBatchPerformanceChange({ masterVelocity: clamped });
  };

  const handleMusicalDynamicSelect = (label: MusicalDynamicLabel) => {
    const vel = musicalDynamicToVelocity(label);
    handleMasterVelocityChange(vel);
  };

  const handleClearAllOverrides = () => {
    onBatchPerformanceChange({ perNoteVelocityOverrides: {} });
  };

  return (
    <section
      className="progression-global-inspector inspector"
      aria-label="Progression Global Settings"
      data-scope="global"
      data-testid="progression-global-inspector"
    >
      <header className="progression-global-header">
        <div>
          <span className="inspector-context-kicker">My Progression</span>
          <h3>All Steps &amp; Measures</h3>
          <span className="template-status is-inherited">
            {stepCount === 0
              ? "0 steps · Empty progression"
              : `${measureCount} measure${measureCount === 1 ? "" : "s"} · ${stepCount} step${stepCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <button
          type="button"
          disabled={chordStepCount === 0}
          onClick={onResetAll}
          className="reset-all-steps-btn"
          aria-label="Reset all progression steps to defaults"
        >
          Reset All to Defaults
        </button>
      </header>

      {stepCount === 0 ? (
        <p className="hint-text" style={{ padding: "12px 16px" }}>
          No steps in progression. Add chords from the Harmonic Matrix to apply global progression
          settings.
        </p>
      ) : null}

      {/* Register */}
      <details
        className="inspector-disclosure template-register-disclosure"
        open={registerOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setRegisterOpen(open);
          persistDisclosureState(GLOBAL_REGISTER_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Register</span>
          <span className="disclosure-status">
            {commonRegister === "auto"
              ? "Auto"
              : `${commonRegister > 0 ? "+" : ""}${commonRegister} oct.`}
          </span>
        </summary>
        <div className="inspector-disclosure-body">
          <RegisterControl
            value={commonRegister}
            disabled={chordStepCount === 0}
            showLabel={false}
            onChange={(register) => onBatchPerformanceChange({ register })}
          />
        </div>
      </details>

      {/* Articulation */}
      <details
        className="inspector-disclosure template-articulation-disclosure"
        open={articulationOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setArticulationOpen(open);
          persistDisclosureState(GLOBAL_ARTICULATION_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Articulation</span>
          <span className="disclosure-status">{commonArticulation}</span>
        </summary>
        <div className="inspector-disclosure-body">
          <fieldset
            disabled={chordStepCount === 0}
            style={{ border: "none", margin: 0, padding: 0 }}
          >
            <ArticulationControl
              value={commonArticulation}
              showLabel={false}
              onChange={(articulation) => onBatchPerformanceChange({ articulation })}
            />
          </fieldset>
        </div>
      </details>

      {/* Duration */}
      <details
        className="inspector-disclosure template-duration-disclosure"
        open={durationOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setDurationOpen(open);
          persistDisclosureState(GLOBAL_DURATION_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Duration</span>
          <span className="disclosure-status">{formatMusicalDuration(commonDuration)} beats</span>
        </summary>
        <div className="inspector-disclosure-body">
          <div data-testid="progression-global-duration">
            <StepDurationControl
              variant="buttons"
              value={commonDuration}
              disabled={stepCount === 0}
              meter={project.globalTiming.meter}
              includeFullBar={Boolean(project.globalTiming.meter)}
              onChange={onBatchDurationChange}
              id="progression-global-duration-buttons"
              label=""
            />
          </div>
        </div>
      </details>

      {/* Dynamics & Velocity */}
      <details
        className="inspector-disclosure dynamics-disclosure"
        open={dynamicsOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setDynamicsOpen(open);
          persistDisclosureState(GLOBAL_DYNAMICS_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Dynamics &amp; velocity</span>
          <span className="disclosure-status">Velocity: {commonMasterVelocity}</span>
        </summary>
        <div className="inspector-disclosure-body">
          <div className="inspector-group" role="group" aria-label="Dynamics controls">
            <div
              className="view-preference-toggle"
              role="radiogroup"
              aria-label="Velocity View Preference"
            >
              <button
                type="button"
                className={viewPreference === "musical" ? "is-active" : ""}
                onClick={() => setViewPreference("musical")}
                aria-label="Musical view"
              >
                Musical (pp..ff)
              </button>
              <button
                type="button"
                className={viewPreference === "midi" ? "is-active" : ""}
                onClick={() => setViewPreference("midi")}
                aria-label="MIDI velocity view"
              >
                MIDI (1..127)
              </button>
            </div>

            {viewPreference === "musical" ? (
              <div className="musical-dynamic-select">
                <label htmlFor="global-musical-dynamic-picker">Dynamic Label</label>
                <select
                  id="global-musical-dynamic-picker"
                  disabled={chordStepCount === 0}
                  value={velocityToMusicalDynamic(commonMasterVelocity)}
                  onChange={(e) =>
                    handleMusicalDynamicSelect(e.target.value as MusicalDynamicLabel)
                  }
                  aria-label="Musical Dynamic Label"
                >
                  {MUSICAL_DYNAMICS.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
                <span className="velocity-readout">Exact: {commonMasterVelocity}</span>
              </div>
            ) : (
              <div className="midi-velocity-input">
                <label htmlFor="global-master-velocity-input">Master Velocity</label>
                <input
                  id="global-master-velocity-input"
                  type="number"
                  disabled={chordStepCount === 0}
                  min={1}
                  max={127}
                  value={commonMasterVelocity}
                  onChange={(e) => handleMasterVelocityChange(Number(e.target.value))}
                  aria-label="Master Velocity"
                />
              </div>
            )}

            {totalOverridesCount > 0 ? (
              <div className="per-note-overrides-summary" style={{ marginTop: 8 }}>
                <span>{totalOverridesCount} note overrides active across steps</span>
                <button
                  type="button"
                  onClick={handleClearAllOverrides}
                  className="clear-overrides-btn"
                  aria-label="Clear all note overrides across progression"
                >
                  Clear Overrides (Balanced)
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </details>

      {/* Bass Voice */}
      <details
        className="inspector-disclosure bass-disclosure"
        open={bassOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          setBassOpen(open);
          persistDisclosureState(GLOBAL_BASS_DISCLOSURE_STORAGE_KEY, open);
        }}
      >
        <summary>
          <span>Bass voice</span>
          <span className="disclosure-status">
            {commonBassChoice === "auto" ? "Auto" : `Note: ${commonBassChoice}`}
          </span>
        </summary>
        <div className="inspector-disclosure-body">
          <div className="inspector-group" role="group" aria-label="Global bass controls">
            <div className="subgroup">
              <label htmlFor="global-bass-choice-select">Bass Note</label>
              <select
                id="global-bass-choice-select"
                disabled={chordStepCount === 0}
                value={commonBassChoice}
                onChange={(e) =>
                  onBatchPerformanceChange({
                    bass: {
                      choice: e.target.value as BassChoice,
                      octaveOffset: commonBassOctave,
                    },
                  })
                }
                aria-label="Bass Note"
              >
                {BASS_CHOICES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="subgroup">
              <label htmlFor="global-bass-octave-select">Bass Octave</label>
              <select
                id="global-bass-octave-select"
                disabled={chordStepCount === 0}
                value={String(commonBassOctave)}
                onChange={(e) =>
                  onBatchPerformanceChange({
                    bass: {
                      choice: commonBassChoice,
                      octaveOffset:
                        e.target.value === "auto"
                          ? "auto"
                          : (Number(e.target.value) as BassOctaveOffset),
                    },
                  })
                }
                aria-label="Bass Octave"
              >
                {BASS_OCTAVES.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </details>

      {/* Global My Progression View */}
      {onSetProgressionView ? (
        <details
          className="inspector-disclosure progression-view-disclosure"
          open={progressionViewOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setProgressionViewOpen(open);
            persistDisclosureState(GLOBAL_PROGRESSION_VIEW_DISCLOSURE_STORAGE_KEY, open);
          }}
        >
          <summary>
            <span>Progression view</span>
            <span className="disclosure-status">{project.presentation.progressionView}</span>
          </summary>
          <div className="inspector-disclosure-body">
            <div
              className="view-preference-toggle"
              role="radiogroup"
              aria-label="Progression View Selection"
            >
              <button
                type="button"
                className={project.presentation.progressionView === "harmonic" ? "is-active" : ""}
                onClick={() => onSetProgressionView("harmonic")}
                aria-label="Harmonic view"
              >
                Harmonic
              </button>
              <button
                type="button"
                className={project.presentation.progressionView === "piano" ? "is-active" : ""}
                onClick={() => onSetProgressionView("piano")}
                aria-label="Piano view"
              >
                Piano
              </button>
              <button
                type="button"
                className={project.presentation.progressionView === "staff" ? "is-active" : ""}
                onClick={() => onSetProgressionView("staff")}
                aria-label="Staff view"
              >
                Staff
              </button>
            </div>
          </div>
        </details>
      ) : null}

      {/* Measures per system */}
      {onSetMeasuresPerSystem && project.presentation.progressionView === "staff" ? (
        <details
          className="inspector-disclosure measures-per-system-disclosure"
          open={measuresLayoutOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setMeasuresLayoutOpen(open);
            persistDisclosureState(GLOBAL_MEASURES_LAYOUT_STORAGE_KEY, open);
          }}
        >
          <summary>
            <span>Measures per system</span>
            <span className="disclosure-status">
              {project.presentation.measuresPerSystem === "auto"
                ? "Auto"
                : `${project.presentation.measuresPerSystem} / system`}
            </span>
          </summary>
          <div className="inspector-disclosure-body">
            <div
              className="view-preference-toggle"
              role="radiogroup"
              aria-label="Measures per system selection"
            >
              <button
                type="button"
                className={project.presentation.measuresPerSystem === "auto" ? "is-active" : ""}
                onClick={() => onSetMeasuresPerSystem("auto")}
                aria-label="Auto responsive layout"
              >
                Auto
              </button>
              <button
                type="button"
                className={project.presentation.measuresPerSystem === 4 ? "is-active" : ""}
                onClick={() => onSetMeasuresPerSystem(4)}
                aria-label="4 measures per system"
              >
                4 Bars
              </button>
              <button
                type="button"
                className={project.presentation.measuresPerSystem === 3 ? "is-active" : ""}
                onClick={() => onSetMeasuresPerSystem(3)}
                aria-label="3 measures per system"
              >
                3 Bars
              </button>
              <button
                type="button"
                className={project.presentation.measuresPerSystem === 2 ? "is-active" : ""}
                onClick={() => onSetMeasuresPerSystem(2)}
                aria-label="2 measures per system"
              >
                2 Bars
              </button>
              <button
                type="button"
                className={project.presentation.measuresPerSystem === 1 ? "is-active" : ""}
                onClick={() => onSetMeasuresPerSystem(1)}
                aria-label="1 measure per system"
              >
                1 Bar
              </button>
            </div>
          </div>
        </details>
      ) : null}

      <p className="hint-text" style={{ padding: "12px 16px 4px" }}>
        These settings apply globally to all cards in all measures of My Progression.
      </p>
    </section>
  );
}
