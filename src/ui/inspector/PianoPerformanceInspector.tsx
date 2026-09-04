import type { ChangeEvent } from "react";
import type {
  BassChoice,
  BassOctaveOffset,
  ChordStep,
  DynamicsViewPreference,
  PianoArticulation,
  StepPerformance,
} from "../../domain/progression/step";
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
import { realizeProgressionStepPitches } from "../../instruments/piano/profile";
import { RegisterControl } from "./RegisterControl";

const ARTICULATIONS: readonly { readonly value: PianoArticulation; readonly label: string }[] =
  Object.freeze([
    Object.freeze({ value: "block", label: "Block" }),
    Object.freeze({ value: "arp-up", label: "Arp Up" }),
    Object.freeze({ value: "arp-down", label: "Arp Down" }),
    Object.freeze({ value: "broken-chord", label: "Broken Chord" }),
    Object.freeze({ value: "humanized", label: "Humanized" }),
  ]);

const BASS_CHOICES: readonly { readonly value: BassChoice; readonly label: string }[] =
  Object.freeze([
    Object.freeze({ value: "auto", label: "Auto" }),
    Object.freeze({ value: "root", label: "Root" }),
    Object.freeze({ value: "third", label: "3rd" }),
    Object.freeze({ value: "fifth", label: "5th" }),
    Object.freeze({ value: "custom", label: "Custom" }),
  ]);

const BASS_OCTAVES: readonly { readonly value: BassOctaveOffset; readonly label: string }[] =
  Object.freeze([
    Object.freeze({ value: "auto", label: "Auto" }),
    Object.freeze({ value: -1, label: "-1 Octave" }),
    Object.freeze({ value: -2, label: "-2 Octaves" }),
  ]);

const MUSICAL_DYNAMICS: readonly MusicalDynamicLabel[] = ["pp", "p", "mp", "mf", "f", "ff"];

export interface PianoPerformanceInspectorProps {
  readonly step: ChordStep;
  readonly tonic: number;
  readonly onPerformanceChange: (performance: Partial<StepPerformance>) => void;
  readonly onOpenVoicingEditor: () => void;
}

export function PianoPerformanceInspector({
  step,
  tonic,
  onPerformanceChange,
  onOpenVoicingEditor,
}: PianoPerformanceInspectorProps) {
  const perf = step.performance;
  const isManual = perf.voicingMode === "manual";
  const overrideCount = Object.keys(perf.perNoteVelocityOverrides || {}).length;

  const handleArticulationChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onPerformanceChange({ articulation: e.target.value as PianoArticulation });
  };

  const handleVoicingModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const mode = e.target.value as "auto" | "manual";
    onPerformanceChange({ voicingMode: mode });
  };

  const handleBassChoiceChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onPerformanceChange({
      bass: {
        ...perf.bass,
        choice: e.target.value as BassChoice,
      },
    });
  };

  const handleBassOctaveChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onPerformanceChange({
      bass: {
        ...perf.bass,
        octaveOffset: val === "auto" ? "auto" : (Number(val) as BassOctaveOffset),
      },
    });
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
    const pitches = realizeProgressionStepPitches(step, tonic);
    const overrides = applyDynamicsPreset(presetId, pitches, perf.masterVelocity);
    onPerformanceChange({ perNoteVelocityOverrides: overrides });
  };

  const handleClearOverrides = () => {
    onPerformanceChange({ perNoteVelocityOverrides: {} });
  };

  return (
    <section
      className="piano-performance-inspector"
      aria-label={`Performance settings for step ${step.harmonicFunction.functionId}`}
    >
      <header className="performance-inspector-header">
        <div>
          <h3>Step Performance: {step.harmonicFunction.functionId}</h3>
          <span>Piano Voicing & Dynamics</span>
        </div>
      </header>

      {/* Voicing Mode & Manual Voicing Editor */}
      <div className="inspector-group" aria-label="Voicing mode controls">
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

      {/* Register Control */}
      <div className="inspector-group" aria-label="Register controls">
        <RegisterControl
          value={perf.register}
          disabled={isManual}
          onChange={(register) => onPerformanceChange({ register })}
        />
        {isManual && (
          <p className="hint-text">Register offset does not shift manual exact voicings.</p>
        )}
      </div>

      {/* Independent Bass Controls */}
      <div className="inspector-group" aria-label="Bass voice controls">
        <h4>Independent Bass</h4>
        <div className="subgroup">
          <label htmlFor="bass-choice-select">Bass Note</label>
          <select
            id="bass-choice-select"
            value={perf.bass.choice}
            onChange={handleBassChoiceChange}
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
          <label htmlFor="bass-octave-select">Bass Octave</label>
          <select
            id="bass-octave-select"
            value={String(perf.bass.octaveOffset)}
            onChange={handleBassOctaveChange}
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

      {/* Articulation Control */}
      <div className="inspector-group" aria-label="Articulation controls">
        <label htmlFor="piano-articulation-select">Articulation</label>
        <select
          id="piano-articulation-select"
          value={perf.articulation}
          onChange={handleArticulationChange}
          aria-label="Piano Articulation"
        >
          {ARTICULATIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Dynamics & Velocity Controls */}
      <div className="inspector-group" aria-label="Dynamics and velocity controls">
        <h4>Dynamics & Velocity</h4>
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
              onChange={(e) => handleMusicalDynamicSelect(e.target.value as MusicalDynamicLabel)}
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
        <div className="dynamics-presets" aria-label="Dynamics presets">
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

        {/* Per-note Overrides summary */}
        <div className="per-note-overrides-summary">
          <span>
            {overrideCount === 0
              ? "No note velocity overrides (notes follow Master Velocity)"
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
      </div>
    </section>
  );
}
