import { useId, useMemo, type ChangeEvent } from "react";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import { harmonicFunctionLabel } from "../../domain/harmony/functions";
import type { ExactPitch } from "../../domain/harmony/pitch";
import type {
  ChordStep,
  DynamicsViewPreference,
  ProgressionStep,
  StepPerformance,
} from "../../domain/progression/step";
import { formatMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import type { Meter, MeterChangePolicy } from "../../domain/timing/meter";
import type { GrooveSettings } from "../../domain/timing/swing";
import type { LoopMode, LoopState } from "../transport/loopState";
import { InspectorProgressionSettings } from "./InspectorProgressionSettings";
import {
  PIANO_DYNAMICS_PRESETS,
  type DynamicsPresetId,
  type MusicalDynamicLabel,
} from "../../instruments/contracts";
import {
  applyDynamicsPreset,
  musicalDynamicToVelocity,
  velocityToMusicalDynamic,
} from "../../instruments/piano/dynamics";
import {
  realizeProgressionStepRealization,
  realizeProgressionStepSourceRealization,
} from "../../instruments/piano/profile";
import { RegisterControl } from "./RegisterControl";
import { ArticulationControl } from "./ArticulationControl";
import { StepActions } from "../progression/StepActions";
import { StepDurationControl } from "../progression/StepDurationControl";
import { formatDurationBeats } from "../timing/stepDuration";
import type { MelodyTrackSettings } from "../../domain/melody/types";
import type { AudioProviderState } from "../../audio/contracts";
import { Icon } from "../common/Icon";
import { InspectorDisclosureToggle } from "./InspectorDisclosure";
import { useInspectorDisclosure } from "./useInspectorDisclosure";
import { useReorderableSections } from "./useReorderableSections";
import {
  getAvailableSubstitutions,
  getSubstitutionKindBadge,
  type ChordSubstitution,
} from "../../domain/harmony/reharmonization";

const MUSICAL_DYNAMICS: readonly MusicalDynamicLabel[] = ["pp", "p", "mp", "mf", "f", "ff"];

export type SelectedStepSectionId =
  | "reharmonization"
  | "register"
  | "articulation"
  | "duration"
  | "voicing"
  | "dynamics"
  | "progression";

export const DEFAULT_SELECTED_STEP_SECTIONS: readonly SelectedStepSectionId[] = Object.freeze([
  "reharmonization",
  "register",
  "articulation",
  "duration",
  "voicing",
  "dynamics",
  "progression",
]);

export const SELECTED_STEP_SECTION_ORDER_STORAGE_KEY =
  "cadenceflow:inspector:selected_step:sections_order";

const PANEL_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.step-performance-inspector-disclosure-open";
const REHARMONIZATION_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.reharmonization-disclosure-open";
const DYNAMICS_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.dynamics-disclosure-open";
const PER_NOTE_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.per-note-disclosure-open";
const VOICING_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.voicing-disclosure-open";
const REGISTER_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.register-disclosure-open";
const ARTICULATION_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.articulation-disclosure-open";
const DURATION_DISCLOSURE_STORAGE_KEY = "cadenceflow.ui.duration-disclosure-open";

export interface PianoPerformanceInspectorProps {
  readonly step: ChordStep;
  readonly tonic: number;
  readonly context: HarmonicContext;
  readonly independentBassEnabled?: boolean;
  readonly onSetIndependentBassEnabled?: (enabled: boolean) => void;
  readonly meter?: Meter;
  readonly onPerformanceChange: (performance: Partial<StepPerformance>) => void;
  readonly onDurationChange?: (duration: MusicalDuration) => void;
  readonly canReplace?: boolean;
  readonly onReplace?: () => void;
  readonly onReset?: () => void;
  readonly onRemove?: () => void;
  readonly onMoveLeft?: () => void;
  readonly onMoveRight?: () => void;
  readonly onOpenVoicingEditor: () => void;
  readonly melodyTrack?: MelodyTrackSettings;
  readonly onMelodyTrackSettingsChange?: (settings: Partial<MelodyTrackSettings>) => void;
  readonly melodyAudioState?: AudioProviderState;
  readonly melodyAudioError?: string | null;
  readonly onRetryMelodyAudio?: () => void;
  readonly hasMelodyRecipe?: boolean;
  readonly onSetMeter?: (meter: Meter, policy: MeterChangePolicy) => void;
  readonly groove?: GrooveSettings;
  readonly onSetGroove?: (groove: GrooveSettings) => void;
  readonly loopState?: LoopState;
  readonly steps?: readonly ProgressionStep[];
  readonly onSetLoopMode?: (mode: LoopMode) => void;
  readonly onSetLoopRange?: ((startStepId: string, endStepId: string) => void) | undefined;
  readonly onApplySubstitution?: (substitution: ChordSubstitution) => void;
  readonly onAuditionSubstitution?: (substitution: ChordSubstitution) => void;
  readonly auditioningSubstitutionId?: string | null;
}

export function PianoPerformanceInspector({
  step,
  tonic,
  context,
  independentBassEnabled = true,
  onSetIndependentBassEnabled,
  meter,
  onPerformanceChange,
  onDurationChange,
  canReplace = false,
  onReplace,
  onReset,
  onRemove,
  onMoveLeft,
  onMoveRight,
  onOpenVoicingEditor,
  melodyTrack,
  onMelodyTrackSettingsChange,
  melodyAudioState,
  melodyAudioError,
  onRetryMelodyAudio,
  hasMelodyRecipe = false,
  onSetMeter,
  groove,
  onSetGroove,
  loopState,
  steps,
  onSetLoopMode,
  onSetLoopRange,
  onApplySubstitution,
  onAuditionSubstitution,
  auditioningSubstitutionId,
}: PianoPerformanceInspectorProps) {
  const perf = step.performance;
  const isManual = perf.voicingMode === "manual";
  const overrideCount = Object.keys(perf.perNoteVelocityOverrides || {}).length;

  const panelBodyId = useId();
  const panelDisclosure = useInspectorDisclosure(PANEL_DISCLOSURE_STORAGE_KEY, true);
  const reharmonizationDisclosure = useInspectorDisclosure(
    REHARMONIZATION_DISCLOSURE_STORAGE_KEY,
    true,
  );
  const registerDisclosure = useInspectorDisclosure(REGISTER_DISCLOSURE_STORAGE_KEY, true);
  const articulationDisclosure = useInspectorDisclosure(ARTICULATION_DISCLOSURE_STORAGE_KEY, true);
  const durationDisclosure = useInspectorDisclosure(DURATION_DISCLOSURE_STORAGE_KEY, true);
  const dynamicsDisclosure = useInspectorDisclosure(DYNAMICS_DISCLOSURE_STORAGE_KEY, true);
  const perNoteDisclosure = useInspectorDisclosure(PER_NOTE_DISCLOSURE_STORAGE_KEY, true);
  const voicingDisclosure = useInspectorDisclosure(VOICING_DISCLOSURE_STORAGE_KEY, true);

  const availableSubstitutions = useMemo(
    () => getAvailableSubstitutions(step, context.moduleId, tonic),
    [step, context.moduleId, tonic],
  );

  // Realize current full chord step (upper voices + bass voice) within actual harmonic context
  const realization = realizeProgressionStepRealization(step, tonic, context);
  const sourceRealization = realizeProgressionStepSourceRealization(step, tonic, context);

  const handleVoicingModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const mode = e.target.value as "auto" | "manual";
    onPerformanceChange({ voicingMode: mode });
  };

  const handleMasterVelocityChange = (val: number) => {
    const clamped = Math.max(1, Math.min(127, Math.round(val)));
    onPerformanceChange({ masterVelocity: clamped });
  };

  const handleMusicalDynamicSelect = (label: MusicalDynamicLabel) => {
    const vel = musicalDynamicToVelocity(label);
    handleMasterVelocityChange(vel);
  };

  const handleViewPreferenceToggle = (pref: DynamicsViewPreference) => {
    onPerformanceChange({ dynamicsViewPreference: pref });
  };

  const handleApplyPreset = (presetId: DynamicsPresetId) => {
    const overrides = applyDynamicsPreset(
      presetId,
      sourceRealization.pitches,
      perf.masterVelocity,
      undefined,
      independentBassEnabled ? sourceRealization.bassPitch : undefined,
    );
    onPerformanceChange({ perNoteVelocityOverrides: overrides });
  };

  const handleClearOverrides = () => {
    onPerformanceChange({ perNoteVelocityOverrides: {} });
  };

  const handleSetNoteOverride = (noteKey: string, velocity: number) => {
    const clamped = Math.max(1, Math.min(127, Math.round(velocity)));
    const updated = {
      ...perf.perNoteVelocityOverrides,
      [noteKey]: clamped,
    };
    onPerformanceChange({ perNoteVelocityOverrides: updated });
  };

  const handleResetNoteToInherit = (noteKey: string) => {
    const updated = { ...perf.perNoteVelocityOverrides };
    delete updated[noteKey];
    onPerformanceChange({ perNoteVelocityOverrides: updated });
  };

  // Compile full note list for per-note velocity editor.
  //
  // Velocity overrides are keyed by the SOURCE realisation's MIDI number, so a note without a
  // matching source pitch cannot be addressed and is skipped.
  //
  // Regression context: this used `throw new Error(...)` for both mismatches. Because the list
  // is built during render, a violation unmounted the whole application (there was no error
  // boundary), so the user lost the session instead of seeing one uneditable note.
  const notesToDisplay: {
    readonly noteKey: string;
    readonly label: string;
    readonly role: "bass" | "upper";
    readonly pitch: ExactPitch;
  }[] = [];
  let unmappedNoteCount = 0;

  if (independentBassEnabled && realization.bassPitch) {
    const b = realization.bassPitch;
    const sourceBass = sourceRealization.bassPitch;
    if (sourceBass) {
      const alterStr = b.spelling.alter === 1 ? "#" : b.spelling.alter === -1 ? "b" : "";
      notesToDisplay.push({
        noteKey: String(sourceBass.midiNumber),
        label: `Bass: ${b.spelling.step}${alterStr}${b.octave}`,
        role: "bass",
        pitch: b,
      });
    } else {
      unmappedNoteCount += 1;
    }
  }

  realization.pitches.forEach((p, index) => {
    const sourcePitch = sourceRealization.pitches[index];
    if (!sourcePitch) {
      unmappedNoteCount += 1;
      return;
    }
    const alterStr = p.spelling.alter === 1 ? "#" : p.spelling.alter === -1 ? "b" : "";
    notesToDisplay.push({
      noteKey: String(sourcePitch.midiNumber),
      label: `${p.spelling.step}${alterStr}${p.octave}`,
      role: "upper",
      pitch: p,
    });
  });

  const {
    order: sectionOrder,
    isCustomOrder,
    resetOrder,
    getSectionItemProps,
    getDragHandleProps,
  } = useReorderableSections<SelectedStepSectionId>({
    storageKey: SELECTED_STEP_SECTION_ORDER_STORAGE_KEY,
    defaultOrder: DEFAULT_SELECTED_STEP_SECTIONS,
  });

  const renderSectionContent = (sectionId: SelectedStepSectionId) => {
    switch (sectionId) {
      case "reharmonization":
        return (
          <details
            className="inspector-disclosure reharmonization-disclosure"
            open={reharmonizationDisclosure.isOpen}
            onToggle={(event) => reharmonizationDisclosure.setOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <span
                  {...getDragHandleProps("reharmonization", "Reharmonization")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Reharmonization
              </span>
              <span className="disclosure-status">
                {availableSubstitutions.length} suggestion
                {availableSubstitutions.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="inspector-disclosure-body">
              <div
                className="inspector-group reharmonization-group"
                role="group"
                aria-label="Reharmonization suggestions"
              >
                <div className="reharmonization-header">
                  <h4>Chord Substitutions</h4>
                  <p className="reharmonization-subtitle">
                    Contextual harmonic substitutions for{" "}
                    {harmonicFunctionLabel(step.harmonicFunction)}
                  </p>
                </div>
                {availableSubstitutions.length === 0 ? (
                  <div className="reharmonization-empty" data-testid="reharmonization-empty">
                    No automatic substitutions found for this chord.
                  </div>
                ) : (
                  <div
                    className="reharmonization-list"
                    role="list"
                    data-testid="reharmonization-list"
                  >
                    {availableSubstitutions.map((sub) => {
                      const badge = getSubstitutionKindBadge(sub.kind);
                      const isAuditioning = auditioningSubstitutionId === sub.id;
                      return (
                        <div
                          key={sub.id}
                          className="reharmonization-card"
                          data-testid={`reharmonization-card-${sub.id}`}
                          role="listitem"
                        >
                          <div className="reharmonization-card-header">
                            <span className={`sub-badge ${badge.badgeClass}`}>{badge.label}</span>
                            <span className={`sub-op-tag sub-op-${sub.operation}`}>
                              {sub.operation === "replace" ? "Swap" : "Insert Before"}
                            </span>
                          </div>
                          <div className="reharmonization-card-title-row">
                            <div className="sub-title-chord">
                              <span className="sub-target-symbol">{sub.chordSymbol}</span>
                              <span className="sub-title">{sub.title}</span>
                            </div>
                            <div className="sub-actions">
                              {onAuditionSubstitution && (
                                <button
                                  type="button"
                                  className={`sub-audition-btn ${isAuditioning ? "is-playing" : ""}`}
                                  onClick={() => onAuditionSubstitution(sub)}
                                  aria-label={
                                    isAuditioning
                                      ? `Stop auditioning ${sub.chordSymbol}`
                                      : `Audition ${sub.chordSymbol}`
                                  }
                                  title={isAuditioning ? "Stop Preview" : "Audition (Play)"}
                                  data-testid={`sub-audition-btn-${sub.id}`}
                                >
                                  <Icon name={isAuditioning ? "stop" : "play"} />
                                </button>
                              )}
                              {onApplySubstitution && (
                                <button
                                  type="button"
                                  className="sub-apply-btn"
                                  onClick={() => onApplySubstitution(sub)}
                                  aria-label={`Apply ${sub.title}`}
                                  data-testid={`sub-apply-btn-${sub.id}`}
                                >
                                  Apply
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="sub-description">{sub.description}</p>
                          <div className="sub-rationale-box">
                            <span className="sub-rationale-label">Why it works</span>
                            <span className="sub-rationale-text">{sub.theoreticalRationale}</span>
                          </div>
                          {sub.tags.length > 0 && (
                            <div className="sub-tags-row">
                              {sub.tags.map((tag) => (
                                <span key={tag} className="sub-tag">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </details>
        );

      case "register":
        return (
          <details
            className="inspector-disclosure register-disclosure"
            open={registerDisclosure.isOpen}
            onToggle={(event) => registerDisclosure.setOpen(event.currentTarget.open)}
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
                {perf.register === "auto"
                  ? "Auto"
                  : `${perf.register > 0 ? "+" : ""}${perf.register} oct.`}
              </span>
            </summary>
            <div className="inspector-disclosure-body">
              <div className="inspector-group" role="group" aria-label="Register controls">
                <RegisterControl
                  value={perf.register}
                  disabled={isManual}
                  showLabel={false}
                  onChange={(register) => onPerformanceChange({ register })}
                />
                {isManual && (
                  <p className="hint-text">Register offset does not shift manual exact voicings.</p>
                )}
              </div>
            </div>
          </details>
        );

      case "articulation":
        return (
          <details
            className="inspector-disclosure articulation-disclosure"
            open={articulationDisclosure.isOpen}
            onToggle={(event) => articulationDisclosure.setOpen(event.currentTarget.open)}
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
              <span className="disclosure-status">{perf.articulation}</span>
            </summary>
            <div className="inspector-disclosure-body">
              <ArticulationControl
                value={perf.articulation}
                showLabel={false}
                onChange={(articulation) => onPerformanceChange({ articulation })}
              />
            </div>
          </details>
        );

      case "duration":
        return onDurationChange ? (
          <details
            className="inspector-disclosure duration-disclosure"
            open={durationDisclosure.isOpen}
            onToggle={(event) => durationDisclosure.setOpen(event.currentTarget.open)}
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
                {formatMusicalDuration(step.duration)} beats
              </span>
            </summary>
            <div className="inspector-disclosure-body">
              <div
                className="transport-section transport-step-duration inspector-group selected-step-duration"
                role="group"
                aria-label="Step duration controls"
              >
                <span className="transport-label">
                  Step Duration ({formatDurationBeats(step.duration)})
                </span>
                <StepDurationControl
                  variant="buttons"
                  label=""
                  value={step.duration}
                  meter={meter}
                  includeFullBar={Boolean(meter)}
                  onChange={onDurationChange}
                />
              </div>
            </div>
          </details>
        ) : null;

      case "voicing":
        return (
          <details
            className="inspector-disclosure voicing-disclosure"
            open={voicingDisclosure.isOpen}
            onToggle={(event) => voicingDisclosure.setOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <span
                  {...getDragHandleProps("voicing", "Voicing mode")}
                  onClick={(e) => e.stopPropagation()}
                >
                  ⋮⋮
                </span>
                Voicing mode
              </span>
              <span className="disclosure-status">
                {perf.voicingMode === "manual" ? "Manual" : "Automatic"}
              </span>
            </summary>
            <div className="inspector-disclosure-body">
              <div className="inspector-group" role="group" aria-label="Voicing mode controls">
                <label htmlFor="voicing-mode-select">Voicing Mode</label>
                <select
                  id="voicing-mode-select"
                  value={perf.voicingMode}
                  onChange={handleVoicingModeChange}
                  aria-label="Voicing Mode"
                >
                  <option value="auto">Auto Voicing</option>
                  <option value="manual">Manual Exact Voicing</option>
                </select>

                <button
                  type="button"
                  onClick={onOpenVoicingEditor}
                  className="open-voicing-editor-btn"
                  aria-label="Open Piano Voicing Editor"
                >
                  {isManual
                    ? `Edit Manual Voicing (${perf.manualVoicing?.length ?? 0} notes)`
                    : "Customize Exact Voicing..."}
                </button>
              </div>
            </div>
          </details>
        );

      case "dynamics":
        return (
          <details
            className="inspector-disclosure dynamics-disclosure"
            open={dynamicsDisclosure.isOpen}
            onToggle={(event) => dynamicsDisclosure.setOpen(event.currentTarget.open)}
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
              <span className="disclosure-status">Master + per-note</span>
            </summary>
            <div className="inspector-disclosure-body">
              <div
                className="inspector-group"
                role="group"
                aria-label="Dynamics and velocity controls"
              >
                <div
                  className="view-preference-toggle"
                  role="radiogroup"
                  aria-label="Velocity View Preference"
                >
                  <button
                    type="button"
                    className={perf.dynamicsViewPreference === "musical" ? "is-active" : ""}
                    onClick={() => handleViewPreferenceToggle("musical")}
                    aria-label="Musical view"
                  >
                    Musical (pp..ff)
                  </button>
                  <button
                    type="button"
                    className={perf.dynamicsViewPreference === "midi" ? "is-active" : ""}
                    onClick={() => handleViewPreferenceToggle("midi")}
                    aria-label="MIDI velocity view"
                  >
                    MIDI (1..127)
                  </button>
                </div>

                {perf.dynamicsViewPreference === "musical" ? (
                  <div className="musical-dynamic-select">
                    <label htmlFor="musical-dynamic-picker">Dynamic Label</label>
                    <select
                      id="musical-dynamic-picker"
                      value={velocityToMusicalDynamic(perf.masterVelocity)}
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
                    <span className="velocity-readout">Exact: {perf.masterVelocity}</span>
                  </div>
                ) : (
                  <div className="midi-velocity-input">
                    <label htmlFor="master-velocity-input">Master Velocity</label>
                    <input
                      id="master-velocity-input"
                      type="number"
                      min={1}
                      max={127}
                      value={perf.masterVelocity}
                      onChange={(e) => handleMasterVelocityChange(Number(e.target.value))}
                      aria-label="Master Velocity"
                    />
                  </div>
                )}

                {/* Dynamics Presets */}
                <div className="dynamics-presets" role="group" aria-label="Dynamics presets">
                  <label htmlFor="dynamics-preset-select">Apply Dynamics Preset</label>
                  <select
                    id="dynamics-preset-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleApplyPreset(e.target.value as DynamicsPresetId);
                        e.target.value = "";
                      }
                    }}
                    aria-label="Apply Dynamics Preset"
                  >
                    <option value="" disabled>
                      Select Preset...
                    </option>
                    {PIANO_DYNAMICS_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} — {p.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Per-note Overrides summary & Clear */}
                <div className="per-note-overrides-summary">
                  <span>
                    {overrideCount === 0
                      ? "All notes inheriting Master Velocity"
                      : `${overrideCount} note velocity override${overrideCount > 1 ? "s" : ""} active`}
                  </span>
                  {overrideCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClearOverrides}
                      className="clear-overrides-btn"
                      aria-label="Clear per-note overrides"
                    >
                      Clear Overrides (Balanced)
                    </button>
                  )}
                </div>

                {/* Per-Note Velocity Editor */}
                <details
                  className="inspector-disclosure per-note-disclosure"
                  open={perNoteDisclosure.isOpen}
                  onToggle={(event) => perNoteDisclosure.setOpen(event.currentTarget.open)}
                >
                  <summary>
                    <span>Per-note velocity overrides</span>
                    <span className="disclosure-status">
                      {overrideCount === 0 ? "Inherited" : `${overrideCount} customized`}
                    </span>
                  </summary>
                  <div
                    className="per-note-velocity-editor"
                    role="group"
                    aria-label="Per-note velocity editor"
                  >
                    <p className="inspector-helper">
                      Each row keeps the exact MIDI velocity or inherits Master.
                    </p>
                    {!independentBassEnabled ? (
                      <p className="inspector-helper" role="note">
                        Independent bass is off; its saved note settings remain stored and are not
                        sounding.
                      </p>
                    ) : null}
                    {unmappedNoteCount > 0 ? (
                      <p
                        className="inspector-helper is-warning"
                        role="status"
                        data-testid="per-note-unmapped-warning"
                      >
                        {unmappedNoteCount === 1
                          ? "1 sounding note has no matching source pitch and cannot be edited here."
                          : `${unmappedNoteCount} sounding notes have no matching source pitch and cannot be edited here.`}
                      </p>
                    ) : null}
                    <div className="per-note-list">
                      {notesToDisplay.map((note) => {
                        const isOverridden =
                          perf.perNoteVelocityOverrides[note.noteKey] !== undefined;
                        const currentVel = isOverridden
                          ? perf.perNoteVelocityOverrides[note.noteKey]!
                          : perf.masterVelocity;

                        return (
                          <div
                            key={`${note.role}-${note.noteKey}`}
                            className="per-note-velocity-row"
                          >
                            <div className="note-info">
                              <span className="note-label">{note.label}</span>
                              <span className="note-midi">(MIDI {note.pitch.midiNumber})</span>
                              <span className={`note-role-badge role-${note.role}`}>
                                {note.role === "bass" ? "Independent Bass" : "Upper"}
                              </span>
                            </div>
                            <div className="note-velocity-controls">
                              {isOverridden ? (
                                <div className="override-active-controls">
                                  <span className="status-badge override">
                                    Override: {currentVel}
                                  </span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={127}
                                    value={currentVel}
                                    onChange={(e) =>
                                      handleSetNoteOverride(note.noteKey, Number(e.target.value))
                                    }
                                    aria-label={`Velocity override for ${note.label}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleResetNoteToInherit(note.noteKey)}
                                    className="reset-inherit-btn"
                                    aria-label={`Reset ${note.label} to inherit master velocity`}
                                  >
                                    Reset to Inherit
                                  </button>
                                </div>
                              ) : (
                                <div className="inherit-active-controls">
                                  <span className="status-badge inherit">
                                    Inherits Master ({perf.masterVelocity})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleSetNoteOverride(note.noteKey, perf.masterVelocity)
                                    }
                                    className="set-override-btn"
                                    aria-label={`Override velocity for ${note.label}`}
                                  >
                                    Override...
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </details>
        );

      case "progression":
        return (
          <InspectorProgressionSettings
            dragHandle={
              <span
                {...getDragHandleProps("progression", "Progression settings")}
                onClick={(e) => e.stopPropagation()}
              >
                ⋮⋮
              </span>
            }
            meter={meter}
            onSetMeter={onSetMeter}
            groove={groove}
            onSetGroove={onSetGroove}
            loopState={loopState}
            steps={steps}
            onSetLoopMode={onSetLoopMode}
            onSetLoopRange={onSetLoopRange}
            melodyTrack={melodyTrack}
            onMelodyTrackSettingsChange={onMelodyTrackSettingsChange}
            melodyAudioState={melodyAudioState}
            melodyAudioError={melodyAudioError}
            onRetryMelodyAudio={onRetryMelodyAudio}
            hasMelodyRecipe={hasMelodyRecipe}
            independentBassEnabled={independentBassEnabled}
            onSetIndependentBassEnabled={onSetIndependentBassEnabled}
          />
        );

      default:
        return null;
    }
  };

  return (
    <section
      className="piano-performance-inspector"
      aria-label={`Performance settings for step ${harmonicFunctionLabel(step.harmonicFunction)}`}
      data-context="selected-step"
      data-testid="step-performance-inspector"
    >
      <header className="performance-inspector-header">
        <div className="inspector-panel-heading">
          <InspectorDisclosureToggle
            isOpen={panelDisclosure.isOpen}
            onToggle={panelDisclosure.toggle}
            ariaLabel="Toggle step performance sections"
            controlsId={panelBodyId}
            testId="step-performance-disclosure-btn"
          />
          <div>
            <span className="inspector-context-kicker">Selected step</span>
            <h3>Step Performance: {harmonicFunctionLabel(step.harmonicFunction)}</h3>
            <span>Step-specific controls live here. Progression settings are grouped below.</span>
          </div>
        </div>
        {isCustomOrder ? (
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              type="button"
              onClick={resetOrder}
              className="inspector-header-icon-btn reset-sections-order-btn"
              aria-label="Reset sections order to default"
              title="Reset sections order to default"
            >
              <Icon name="undo" />
            </button>
          </div>
        ) : null}
      </header>

      {onReplace && onReset && onRemove && onMoveLeft && onMoveRight ? (
        <StepActions
          canReplace={canReplace}
          onReplace={onReplace}
          onReset={onReset}
          onRemove={onRemove}
          onMoveLeft={onMoveLeft}
          onMoveRight={onMoveRight}
        />
      ) : null}

      {panelDisclosure.isOpen ? (
        <div id={panelBodyId} className="inspector-panel-body">
          {sectionOrder.map((sectionId) => {
            const content = renderSectionContent(sectionId);
            if (!content) return null;
            return (
              <div key={sectionId} {...getSectionItemProps(sectionId)}>
                {content}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
