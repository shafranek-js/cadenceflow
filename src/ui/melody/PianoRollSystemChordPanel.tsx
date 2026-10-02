import { useMemo, useState } from "react";
import { computeScalePitches } from "../../domain/harmony/modes";
import { getHarmonicModule } from "../../domain/harmony/moduleRegistry";
import { realizeChord } from "../../domain/harmony/realization";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { ProgressionStep } from "../../domain/progression/step";
import type { Project } from "../../domain/project/project";
import type { ScoreSystem } from "../../notation/scoreSystemProjection";
import { DURATION_PRESETS } from "../timing/stepDuration";
import { formatMusicalDuration, musicalDuration } from "../../domain/timing/duration";
import {
  compareRational,
  multiplyRational,
  rational,
  type Rational,
} from "../../domain/timing/rational";
import { pianoRollPaletteColor } from "./pianoRollProjection";
import { systemTieDisabledReason } from "../../app/commands/systemChordCommands";
import { createMatrixChordStep } from "../../app/commands/matrixCommands";

function exact(value: Rational): string {
  return `${value.numerator}/${value.denominator}`;
}

const CHORD_DURATION_PRESETS = DURATION_PRESETS.filter((preset) =>
  ["4/1", "2/1", "1/1", "1/2", "1/4"].includes(preset.id),
);

function currentDuration(step: ProgressionStep): {
  readonly preset: string;
  readonly triplet: boolean;
  readonly custom: boolean;
} {
  for (const preset of CHORD_DURATION_PRESETS) {
    if (compareRational(step.duration.beats, preset.beats) === 0)
      return { preset: exact(preset.beats), triplet: false, custom: false };
    if (compareRational(step.duration.beats, multiplyRational(preset.beats, rational(2, 3))) === 0)
      return { preset: exact(preset.beats), triplet: true, custom: false };
  }
  return { preset: "custom", triplet: false, custom: true };
}

function scaleChordChoices(project: Project) {
  const scale = computeScalePitches(
    project.tonic,
    project.activeModule === "progressions" ? "ionian" : "aeolian",
  );
  const module = getHarmonicModule(project.activeModule);
  return scale.map((pitch) => {
    const choices = module.topology.cards
      .filter((entry) => entry.identity.category === "core")
      .filter(
        (entry) => realizeChord(entry.identity, project.tonic).rootPitchClass === pitch.pitchClass,
      )
      .sort((left, right) => {
        const baselineOrder = Number(right.baseline) - Number(left.baseline);
        return baselineOrder || left.identity.functionId.localeCompare(right.identity.functionId);
      });
    return {
      degree: pitch.degree,
      label: `${pitch.degree} ${formatPitchSpelling(pitch.spelling)}`,
      identity: choices[0]?.identity,
    };
  });
}

function wouldReplacementBeNoop(
  project: Project,
  step: ProgressionStep,
  functionId: string,
): boolean {
  if (step.kind !== "chord") return false;
  const replacement = createMatrixChordStep(project, functionId, step.id);
  return (
    step.harmonicFunction.moduleId === replacement.harmonicFunction.moduleId &&
    step.harmonicFunction.functionId === replacement.harmonicFunction.functionId &&
    JSON.stringify(step.harmonicVariant) === JSON.stringify(replacement.harmonicVariant) &&
    step.explicitSpellingOverrides === undefined
  );
}

export function PianoRollSystemChordPanel({
  project,
  system,
  step,
  selectedStepIds,
  matrixFunctionId,
  onReplace,
  onFocusMatrix,
  onCancelMatrixChoice,
  onSetRest,
  onSetDuration,
  onSplit,
  onTie,
}: {
  readonly project: Project;
  readonly system: ScoreSystem;
  readonly step: ProgressionStep;
  readonly selectedStepIds: readonly string[];
  readonly matrixFunctionId?: string;
  readonly onReplace: (stepId: string, functionId: string) => void;
  readonly onFocusMatrix: (stepId: string) => void;
  readonly onCancelMatrixChoice: () => void;
  readonly onSetRest: (stepId: string) => void;
  readonly onSetDuration: (stepId: string, duration: ReturnType<typeof musicalDuration>) => void;
  readonly onSplit: (stepId: string) => void;
  readonly onTie: (stepIds: readonly string[]) => void;
}) {
  const [message, setMessage] = useState("");
  const choices = useMemo(() => scaleChordChoices(project), [project]);
  const duration = currentDuration(step);
  const tieReason =
    selectedStepIds.length > 1 ? systemTieDisabledReason(project, selectedStepIds) : null;
  const matchingMatrixFunction = matrixFunctionId
    ? wouldReplacementBeNoop(project, step, matrixFunctionId)
    : false;

  const applyPreset = (presetValue: string, triplet: boolean) => {
    const selected = CHORD_DURATION_PRESETS.find(
      (candidate) => exact(candidate.beats) === presetValue,
    );
    if (!selected) return;
    const beats = triplet ? multiplyRational(selected.beats, rational(2, 3)) : selected.beats;
    run(() => onSetDuration(step.id, musicalDuration(beats)));
  };

  const run = (action: () => void) => {
    try {
      setMessage("");
      action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chord edit could not be applied.");
    }
  };

  return (
    <div
      className="piano-roll-system-chord-panel"
      role="group"
      aria-label={`System ${system.index + 1} chord editing`}
      data-testid={`piano-roll-system-chord-panel-${system.index}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setMessage("");
          onCancelMatrixChoice();
          document
            .querySelector<HTMLButtonElement>(
              `[data-system-index="${system.index}"] button.piano-roll-chord[data-source-step-id="${step.id}"]`,
            )
            ?.focus({ preventScroll: true });
        }
      }}
    >
      <div className="piano-roll-chord-roots" role="group" aria-label="Replace with scale chord">
        {choices.map((choice) => (
          <button
            key={choice.degree}
            type="button"
            disabled={
              !choice.identity || wouldReplacementBeNoop(project, step, choice.identity.functionId)
            }
            aria-pressed={Boolean(
              choice.identity && wouldReplacementBeNoop(project, step, choice.identity.functionId),
            )}
            aria-label={
              choice.identity
                ? `Replace with degree ${choice.degree}, ${choice.label}, ${choice.identity.functionId}`
                : `No chord for scale degree ${choice.degree}`
            }
            title={
              choice.identity ? `${choice.label} · ${choice.identity.functionId}` : choice.label
            }
            style={{ backgroundColor: pianoRollPaletteColor(choice.degree), color: "#fff" }}
            onClick={() => {
              if (!choice.identity) return;
              run(() => onReplace(step.id, choice.identity!.functionId));
            }}
          >
            {choice.degree}
          </button>
        ))}
      </div>
      <div className="piano-roll-chord-matrix" role="group" aria-label="Matrix replacement">
        <button
          type="button"
          onClick={() => onFocusMatrix(step.id)}
          title="Choose a replacement chord in the Harmonic Matrix"
        >
          Matrix…
        </button>
        <button
          type="button"
          disabled={!matrixFunctionId || Boolean(matchingMatrixFunction)}
          onClick={() => {
            if (matrixFunctionId) run(() => onReplace(step.id, matrixFunctionId));
          }}
          title={
            matrixFunctionId
              ? `Replace with Matrix selection ${matrixFunctionId}`
              : "Choose a chord in the Matrix first"
          }
        >
          Replace
        </button>
        {matrixFunctionId ? (
          <button
            type="button"
            aria-label="Cancel Matrix replacement"
            onClick={onCancelMatrixChoice}
          >
            Cancel
          </button>
        ) : null}
      </div>
      <div className="piano-roll-chord-duration" role="group" aria-label="Harmony duration">
        <select
          aria-label="Harmony duration"
          value={duration.preset}
          onChange={(event) => applyPreset(event.target.value, duration.triplet)}
        >
          {duration.custom ? (
            <option value="custom" disabled>
              Current: {formatMusicalDuration(step.duration)}
            </option>
          ) : null}
          {CHORD_DURATION_PRESETS.map((preset) => (
            <option key={exact(preset.beats)} value={exact(preset.beats)}>
              {preset.shortLabel}
            </option>
          ))}
        </select>
        <label title="Use the exact 2/3 triplet duration">
          <input
            type="checkbox"
            aria-label="Triplet duration"
            checked={duration.triplet}
            disabled={duration.custom}
            onChange={(event) => applyPreset(duration.preset, event.target.checked)}
          />
          T
        </label>
      </div>
      {step.kind === "chord" ? (
        <button
          type="button"
          aria-label="Remove Harmony and make Rest"
          title="Remove Harmony and make this Step a Rest"
          onClick={() => run(() => onSetRest(step.id))}
        >
          Rest
        </button>
      ) : null}
      {selectedStepIds.length > 1 ? (
        <button
          type="button"
          disabled={Boolean(tieReason)}
          title={tieReason ?? "Tie the selected contiguous chords"}
          onClick={() => run(() => onTie(selectedStepIds))}
        >
          Tie
        </button>
      ) : null}
      {step.kind === "chord" ? (
        <button
          type="button"
          aria-label="Split Step into equal halves"
          title="Split the whole Step into exact halves"
          onClick={() => run(() => onSplit(step.id))}
        >
          Split
        </button>
      ) : null}
      {tieReason && selectedStepIds.length > 1 ? <span role="status">{tieReason}</span> : null}
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
