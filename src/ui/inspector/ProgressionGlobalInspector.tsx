import { useMemo, useState } from "react";
import type {
  MeasuresPerSystem,
  NoteColorMode,
  Project,
  ProgressionView,
} from "../../domain/project/project";
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
import type { Meter, MeterChangePolicy } from "../../domain/timing/meter";
import type { GrooveSettings } from "../../domain/timing/swing";
import type { AudioProviderState } from "../../audio/contracts";
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import type { MelodyTrackSettings } from "../../domain/melody/types";
import { ArticulationControl } from "./ArticulationControl";
import { RegisterControl } from "./RegisterControl";
import { StepDurationControl } from "../timing/StepDurationControl";
import { HarmonyTrackControls } from "../harmony/HarmonyTrackControls";
import { MelodyTrackControls } from "../melody/MelodyTrackControls";
import { InspectorMeterSection } from "./InspectorMeterSection";
import { InspectorGrooveSection } from "./InspectorGrooveSection";
import { InspectorLoopSection } from "./InspectorLoopSection";
import type { LoopMode, LoopState } from "../transport/loopState";
import { Icon } from "../common/Icon";
import { useReorderableSections } from "./useReorderableSections";

export const GLOBAL_INSPECTOR_SECTION_ORDER_STORAGE_KEY =
  "cadenceflow.ui.progression-global-inspector-section-order";

export const DEFAULT_GLOBAL_INSPECTOR_SECTIONS = [
  "meter",
  "groove",
  "loop",
  "tracks",
  "presets",
  "register",
  "articulation",
  "duration",
  "dynamics",
  "bass",
  "view",
  "measures",
] as const;

export type GlobalInspectorSectionId = (typeof DEFAULT_GLOBAL_INSPECTOR_SECTIONS)[number];

const GLOBAL_METER_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-meter-disclosure-open";
const GLOBAL_GROOVE_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-groove-disclosure-open";
const GLOBAL_TRACKS_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-tracks-disclosure-open";
const GLOBAL_PRESETS_DISCLOSURE_STORAGE_KEY =
  "cadenceflow.ui.progression-global-presets-disclosure-open";
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
  readonly onSetMeter?: (newMeter: Meter, policy: MeterChangePolicy) => void;
  readonly onSetGroove?: (groove: GrooveSettings) => void;
  readonly onHarmonyTrackSettingsChange?: (patch: Partial<HarmonyTrackSettings>) => void;
  readonly harmonyAudioState?: AudioProviderState;
  readonly harmonyAudioError?: string | null;
  readonly onRetryHarmonyAudio?: () => void;
  readonly onMelodyTrackSettingsChange?: (patch: Partial<MelodyTrackSettings>) => void;
  readonly melodyAudioState?: AudioProviderState;
  readonly melodyAudioError?: string | null;
  readonly onRetryMelodyAudio?: () => void;
  readonly loopState?: LoopState;
  readonly onSetLoopMode?: (mode: LoopMode) => void;
  readonly onSetLoopRange?: ((startStepId: string, endStepId: string) => void) | undefined;
  readonly onOpenPresets?: (() => void) | undefined;
  readonly onSaveAsPreset?: (() => void) | undefined;
  readonly onSetNoteColorMode?: ((mode: NoteColorMode) => void) | undefined;
  readonly selectedPianoNote?: { readonly stepId: string; readonly eventKey: string } | null;
  readonly onEditSelectedPianoNote?: (() => void) | undefined;
}

export function ProgressionGlobalInspector({
  project,
  onBatchPerformanceChange,
  onBatchDurationChange,
  onResetAll,
  onSetProgressionView,
  onSetMeasuresPerSystem,
  onSetMeter,
  onSetGroove,
  onHarmonyTrackSettingsChange,
  harmonyAudioState,
  harmonyAudioError,
  onRetryHarmonyAudio,
  onMelodyTrackSettingsChange,
  melodyAudioState,
  melodyAudioError,
  onRetryMelodyAudio,
  loopState,
  onSetLoopMode,
  onSetLoopRange,
  onOpenPresets,
  onSaveAsPreset,
  onSetNoteColorMode,
  selectedPianoNote = null,
  onEditSelectedPianoNote,
}: ProgressionGlobalInspectorProps) {
  const [tracksOpen, setTracksOpen] = useState(() =>
    readDisclosureState(GLOBAL_TRACKS_DISCLOSURE_STORAGE_KEY, false),
  );
  const [presetsOpen, setPresetsOpen] = useState(() =>
    readDisclosureState(GLOBAL_PRESETS_DISCLOSURE_STORAGE_KEY, true),
  );
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

  const currentMeter = project.globalTiming.meter;
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
  const hasMelodyRecipe = chordSteps.some((step) => step.melody !== undefined);

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

  const {
    order: sectionOrder,
    isCustomOrder,
    resetOrder,
    getSectionItemProps,
    getDragHandleProps,
  } = useReorderableSections<GlobalInspectorSectionId>({
    storageKey: GLOBAL_INSPECTOR_SECTION_ORDER_STORAGE_KEY,
    defaultOrder: DEFAULT_GLOBAL_INSPECTOR_SECTIONS,
  });

  const renderSectionContent = (sectionId: GlobalInspectorSectionId) => {
    switch (sectionId) {
      case "meter":
        return onSetMeter ? (
          <InspectorMeterSection
            currentMeter={currentMeter}
            onSetMeter={onSetMeter}
            storageKey={GLOBAL_METER_DISCLOSURE_STORAGE_KEY}
            dragHandle={
              <span
                {...getDragHandleProps("meter", "Time signature & meter")}
                onClick={(e) => e.stopPropagation()}
              >
                ⋮⋮
              </span>
            }
          />
        ) : null;

      case "groove":
        return onSetGroove ? (
          <InspectorGrooveSection
            groove={project.groove}
            onSetGroove={onSetGroove}
            defaultOpen={false}
            storageKey={GLOBAL_GROOVE_DISCLOSURE_STORAGE_KEY}
            dragHandle={
              <span
                {...getDragHandleProps("groove", "Groove & swing")}
                onClick={(e) => e.stopPropagation()}
              >
                ⋮⋮
              </span>
            }
          />
        ) : null;

      case "loop":
        return loopState && onSetLoopMode ? (
          <InspectorLoopSection
            loopState={loopState}
            steps={project.progression.steps}
            onSetLoopMode={onSetLoopMode}
            onSetLoopRange={onSetLoopRange}
            defaultOpen={false}
            storageKey="cadenceflow.ui.progression-global-loop-disclosure-open"
            dragHandle={
              <span
                {...getDragHandleProps("loop", "Loop Settings")}
                onClick={(e) => e.stopPropagation()}
              >
                ⋮⋮
              </span>
            }
          />
        ) : null;

      case "tracks":
        return onHarmonyTrackSettingsChange ? (
          <details
            className="inspector-disclosure global-tracks-disclosure"
            open={tracksOpen}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setTracksOpen(open);
              persistDisclosureState(GLOBAL_TRACKS_DISCLOSURE_STORAGE_KEY, open);
            }}
          >
            <summary>
              <span>
                <span
                  {...getDragHandleProps("tracks", "Tracks & audio mixer")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Tracks &amp; audio mixer
              </span>
              <span className="disclosure-status">
                {project.harmonyTrack.muted ? "Muted" : "Active"}
              </span>
            </summary>
            <div className="inspector-disclosure-body">
              <div className="global-tracks-mixer">
                <HarmonyTrackControls
                  settings={project.harmonyTrack}
                  onChange={onHarmonyTrackSettingsChange}
                  {...(harmonyAudioState ? { providerState: harmonyAudioState } : {})}
                  {...(harmonyAudioError !== undefined ? { providerError: harmonyAudioError } : {})}
                  {...(onRetryHarmonyAudio ? { onRetry: onRetryHarmonyAudio } : {})}
                />
                {hasMelodyRecipe && onMelodyTrackSettingsChange ? (
                  <MelodyTrackControls
                    settings={project.melodyTrack}
                    onChange={onMelodyTrackSettingsChange}
                    {...(melodyAudioState ? { providerState: melodyAudioState } : {})}
                    {...(melodyAudioError !== undefined ? { providerError: melodyAudioError } : {})}
                    {...(onRetryMelodyAudio ? { onRetry: onRetryMelodyAudio } : {})}
                  />
                ) : null}
              </div>
            </div>
          </details>
        ) : null;

      case "presets":
        return onOpenPresets || onSaveAsPreset ? (
          <details
            className="inspector-disclosure global-presets-disclosure presets-disclosure"
            data-testid="global-presets-disclosure"
            open={presetsOpen}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setPresetsOpen(open);
              persistDisclosureState(GLOBAL_PRESETS_DISCLOSURE_STORAGE_KEY, open);
            }}
          >
            <summary>
              <span>
                <span
                  {...getDragHandleProps("presets", "Presets")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Presets
              </span>
              <span className="disclosure-status">
                {stepCount === 0 ? "Empty" : `${stepCount} steps`}
              </span>
            </summary>
            <div className="inspector-disclosure-body">
              <div className="inspector-group" role="group" aria-label="Progression presets">
                <p className="inspector-helper" style={{ margin: "0 0 8px" }}>
                  Load built-in and custom harmonic progressions, or save the current sequence.
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {onOpenPresets ? (
                    <button
                      type="button"
                      className="secondary-btn presets-trigger-btn"
                      onClick={onOpenPresets}
                      data-testid="progression-presets-btn"
                    >
                      Presets
                    </button>
                  ) : null}
                  {onSaveAsPreset ? (
                    <button
                      type="button"
                      className="secondary-btn save-preset-trigger-btn"
                      onClick={onSaveAsPreset}
                      data-testid="progression-save-preset-btn"
                      title="Save current progression as a custom preset"
                    >
                      Save as Preset
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </details>
        ) : null;

      case "register":
        return stepCount > 0 ? (
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
              <span>
                <span
                  {...getDragHandleProps("register", "Register")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Register
              </span>
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
                ariaLabelPrefix="Batch octave shift: "
                onChange={(register) => onBatchPerformanceChange({ register })}
              />
            </div>
          </details>
        ) : null;

      case "articulation":
        return stepCount > 0 ? (
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
              <span>
                <span
                  {...getDragHandleProps("articulation", "Articulation")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Articulation
              </span>
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
        ) : null;

      case "duration":
        return stepCount > 0 ? (
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
              <span>
                <span
                  {...getDragHandleProps("duration", "Duration")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Duration
              </span>
              <span className="disclosure-status">
                {formatMusicalDuration(commonDuration)} beats
              </span>
            </summary>
            <div className="inspector-disclosure-body">
              <div data-testid="progression-global-duration" className="transport-step-duration">
                <span className="transport-label">Step Duration</span>
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
        ) : null;

      case "dynamics":
        return stepCount > 0 ? (
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
              <span>
                <span
                  {...getDragHandleProps("dynamics", "Dynamics & velocity")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Dynamics &amp; velocity
              </span>
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
        ) : null;

      case "bass":
        return stepCount > 0 ? (
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
              <span>
                <span
                  {...getDragHandleProps("bass", "Bass voice")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Bass voice
              </span>
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
        ) : null;

      case "view":
        return onSetProgressionView || onSetNoteColorMode ? (
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
              <span>
                <span
                  {...getDragHandleProps("view", "Progression view")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Progression view
              </span>
              <span className="disclosure-status">
                {project.presentation.progressionView}
                {project.presentation.noteColorMode !== "standard"
                  ? ` · ${project.presentation.noteColorMode === "suzuki" ? "Suzuki" : "Harmonic roles"}`
                  : ""}
              </span>
            </summary>
            <div className="inspector-disclosure-body" style={{ display: "grid", gap: "10px" }}>
              {onSetProgressionView ? (
                <div
                  className="view-preference-toggle"
                  role="radiogroup"
                  aria-label="Progression View Selection"
                >
                  <button
                    type="button"
                    className={
                      project.presentation.progressionView === "harmonic" ? "is-active" : ""
                    }
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
                  <button
                    type="button"
                    className={project.presentation.progressionView === "guitar" ? "is-active" : ""}
                    onClick={() => onSetProgressionView("guitar")}
                    aria-label="Guitar view"
                  >
                    Guitar
                  </button>
                  <button
                    type="button"
                    className={
                      project.presentation.progressionView === "tablature" ? "is-active" : ""
                    }
                    onClick={() => onSetProgressionView("tablature")}
                    aria-label="Tablature view"
                  >
                    Tab
                  </button>
                </div>
              ) : null}
              {onSetNoteColorMode ? (
                <label className="global-setting-option progression-note-color-mode">
                  <span>
                    <strong>Note colors</strong>
                    <small>Roles also use shapes and accessible note labels.</small>
                  </span>
                  <select
                    aria-label="Note color mode"
                    data-testid="note-color-mode"
                    value={project.presentation.noteColorMode}
                    onChange={(event) => onSetNoteColorMode(event.target.value as NoteColorMode)}
                  >
                    <option value="standard">Standard</option>
                    <option value="suzuki">Suzuki</option>
                    <option value="harmonic-role">Harmonic role</option>
                  </select>
                </label>
              ) : null}
            </div>
          </details>
        ) : null;

      case "measures":
        return onSetMeasuresPerSystem ? (
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
              <span>
                <span
                  {...getDragHandleProps("measures", "Measures per system")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Measures per system
              </span>
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
                  className={project.presentation.measuresPerSystem === 8 ? "is-active" : ""}
                  onClick={() => onSetMeasuresPerSystem(8)}
                  aria-label="8 measures per system"
                >
                  8 Bars
                </button>
                <button
                  type="button"
                  className={project.presentation.measuresPerSystem === 7 ? "is-active" : ""}
                  onClick={() => onSetMeasuresPerSystem(7)}
                  aria-label="7 measures per system"
                >
                  7 Bars
                </button>
                <button
                  type="button"
                  className={project.presentation.measuresPerSystem === 6 ? "is-active" : ""}
                  onClick={() => onSetMeasuresPerSystem(6)}
                  aria-label="6 measures per system"
                >
                  6 Bars
                </button>
                <button
                  type="button"
                  className={project.presentation.measuresPerSystem === 5 ? "is-active" : ""}
                  onClick={() => onSetMeasuresPerSystem(5)}
                  aria-label="5 measures per system"
                >
                  5 Bars
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
        ) : null;

      default:
        return null;
    }
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
          <h3>All Steps &amp; Measures</h3>
          <span className="template-status is-inherited">
            {stepCount === 0
              ? "0 steps · Empty progression"
              : `${measureCount} measure${measureCount === 1 ? "" : "s"} · ${stepCount} step${stepCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="progression-global-header-actions">
          {project.presentation.progressionView === "piano-roll" ? (
            <button
              type="button"
              className="piano-roll-edit-selected-note"
              data-testid="piano-roll-edit-selected-note"
              disabled={!selectedPianoNote}
              onClick={onEditSelectedPianoNote}
              aria-label="Edit selected note"
              title={selectedPianoNote ? "Edit selected Piano Roll note" : "Select a Piano Roll note to edit"}
            >
              Edit note
            </button>
          ) : null}
          {isCustomOrder ? (
            <button
              type="button"
              onClick={resetOrder}
              className="inspector-header-icon-btn reset-sections-order-btn"
              aria-label="Reset inspector sections order to default"
              title="Reset inspector sections order to default"
            >
              <Icon name="undo" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={chordStepCount === 0}
            onClick={onResetAll}
            className="inspector-header-icon-btn reset-all-steps-btn"
            aria-label="Reset all progression steps to defaults"
            title="Reset all progression steps to defaults"
          >
            <Icon name="reset" />
          </button>
        </div>
      </header>

      {stepCount === 0 ? (
        <p className="hint-text" style={{ padding: "12px 16px" }}>
          No steps in progression. Add chords from the Harmonic Matrix to apply global progression
          settings.
        </p>
      ) : null}

      {sectionOrder.map((sectionId) => {
        const content = renderSectionContent(sectionId);
        if (!content) return null;
        return (
          <div key={sectionId} {...getSectionItemProps(sectionId)}>
            {content}
          </div>
        );
      })}

      <p className="hint-text" style={{ padding: "12px 16px 4px" }}>
        These settings apply globally to all cards in all measures of My Progression.
      </p>
    </section>
  );
}
