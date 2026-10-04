import { useMemo, type ChangeEvent } from "react";
import { formatChordSymbol, type ChordDefinition } from "../../domain/harmony/chord";
import { getHarmonicModule } from "../../domain/harmony/moduleRegistry";
import type { HarmonicModuleId } from "../../domain/harmony/functions";
import { realizeChord } from "../../domain/harmony/realization";
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import type { ChordStep, InversionChoice, StepPerformance } from "../../domain/progression/step";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import {
  musicalDuration,
  formatMusicalDuration,
  type MusicalDuration,
} from "../../domain/timing/duration";
import { DURATION_PRESETS, formatDurationBeats } from "../timing/stepDuration";
import {
  musicalDynamicToVelocity,
  velocityToMusicalDynamic,
} from "../../instruments/piano/dynamics";
import type { MusicalDynamicLabel } from "../../instruments/contracts";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import {
  realizeProgressionStepChord,
  stepTranspositionSemitones,
} from "../../domain/progression/transposition";
import type { LabelHierarchyMode } from "./labelHierarchy";
import { ProgressionChordLabel } from "./ProgressionChordLabel";
import { StepTranspositionBadge } from "./StepTranspositionBadge";

const INVERSION_OPTIONS: readonly { readonly value: InversionChoice; readonly label: string }[] =
  Object.freeze([
    Object.freeze({ value: "auto" as const, label: "Auto" }),
    Object.freeze({ value: 0 as const, label: "Root" }),
    Object.freeze({ value: 1 as const, label: "1st" }),
    Object.freeze({ value: 2 as const, label: "2nd" }),
    Object.freeze({ value: 3 as const, label: "3rd" }),
  ]);

const DYNAMIC_OPTIONS: readonly MusicalDynamicLabel[] = Object.freeze([
  "pp",
  "p",
  "mp",
  "mf",
  "f",
  "ff",
]);

function durationId(duration: MusicalDuration): string {
  return `${duration.beats.numerator}/${duration.beats.denominator}`;
}

function currentChordLabel(step: ChordStep, tonic: PitchClassIdentity): string {
  const realization = realizeProgressionStepRealization(step, tonic);
  const chord: ChordDefinition = realizeProgressionStepChord(step, tonic);
  return formatChordSymbol(withEffectiveBass(chord, realization.bassPitch));
}

export function ProgressionQuickEdit({
  step,
  tonic,
  labelMode,
  onReplaceChord,
  onDurationChange,
  onPerformanceChange,
  onOpenInspector,
}: {
  readonly step: ChordStep;
  readonly tonic: PitchClassIdentity;
  readonly labelMode: LabelHierarchyMode;
  readonly onReplaceChord?:
    ((stepId: string, functionId: string, moduleId: HarmonicModuleId) => void) | undefined;
  readonly onDurationChange?: ((stepId: string, duration: MusicalDuration) => void) | undefined;
  readonly onPerformanceChange: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onOpenInspector?: (() => void) | undefined;
}) {
  const chordLabel = currentChordLabel(step, tonic);
  const functionOptions = useMemo(() => {
    const identities = [
      step.harmonicFunction,
      ...getHarmonicModule(step.harmonicFunction.moduleId).topology.cards.map(
        (entry) => entry.identity,
      ),
    ];
    const seen = new Set<string>();
    return identities.flatMap((identity) => {
      if (seen.has(identity.functionId)) return [];
      seen.add(identity.functionId);
      const label =
        identity.functionId === step.harmonicFunction.functionId
          ? chordLabel
          : formatChordSymbol(realizeChord(identity, tonic));
      return [{ functionId: identity.functionId, label }];
    });
  }, [chordLabel, step.harmonicFunction, tonic]);

  const durationOptions = useMemo(() => {
    const currentId = durationId(step.duration);
    if (DURATION_PRESETS.some((preset) => preset.id === currentId)) return DURATION_PRESETS;
    return [
      {
        id: currentId,
        label: `Current — ${formatDurationBeats(step.duration)}`,
        shortLabel: formatMusicalDuration(step.duration),
        beats: step.duration.beats,
        beatsNumerator: step.duration.beats.numerator,
        beatsDenominator: step.duration.beats.denominator,
      },
      ...DURATION_PRESETS,
    ];
  }, [step.duration]);

  const handleDurationChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const preset = durationOptions.find((candidate) => candidate.id === event.target.value);
    if (preset) onDurationChange?.(step.id, musicalDuration(preset.beats));
  };

  const handleInversionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    onPerformanceChange(step.id, {
      inversion: value === "auto" ? "auto" : (Number(value) as 0 | 1 | 2 | 3),
    });
  };

  const handleDynamicsChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onPerformanceChange(step.id, {
      masterVelocity: musicalDynamicToVelocity(event.target.value as MusicalDynamicLabel),
    });
  };

  return (
    <div
      className="progression-quick-edit"
      role="group"
      aria-label={`Quick edit selected chord step ${step.id}`}
      data-testid="progression-quick-edit"
      data-step-id={step.id}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="progression-quick-edit-heading">
        <span className="progression-quick-edit-kicker">Quick edit</span>
        <ProgressionChordLabel
          mode={labelMode}
          functionLabel={step.harmonicFunction.functionId}
          chordLabel={chordLabel}
          className="progression-quick-edit-label"
        />
        <StepTranspositionBadge semitones={stepTranspositionSemitones(step)} />
      </div>
      <label>
        <span>Chord label</span>
        <select
          aria-label="Quick edit chord label"
          data-testid="quick-edit-chord-label"
          value={step.harmonicFunction.functionId}
          disabled={!onReplaceChord}
          onChange={(event) =>
            onReplaceChord?.(step.id, event.target.value, step.harmonicFunction.moduleId)
          }
        >
          {functionOptions.map((option) => (
            <option key={option.functionId} value={option.functionId}>
              {option.functionId} — {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Duration</span>
        <select
          aria-label="Quick edit duration"
          data-testid="quick-edit-duration"
          value={durationId(step.duration)}
          disabled={!onDurationChange}
          onChange={handleDurationChange}
        >
          {durationOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.shortLabel}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Inversion</span>
        <select
          aria-label="Quick edit inversion"
          data-testid="quick-edit-inversion"
          value={String(step.performance.inversion ?? "auto")}
          onChange={handleInversionChange}
        >
          {INVERSION_OPTIONS.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Dynamics</span>
        <select
          aria-label="Quick edit dynamics"
          data-testid="quick-edit-dynamics"
          value={velocityToMusicalDynamic(step.performance.masterVelocity)}
          onChange={handleDynamicsChange}
        >
          {DYNAMIC_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="progression-quick-edit-more"
        data-testid="progression-quick-edit-more"
        aria-label={`More settings for selected chord step ${step.id}`}
        onClick={onOpenInspector}
      >
        More
      </button>
    </div>
  );
}
