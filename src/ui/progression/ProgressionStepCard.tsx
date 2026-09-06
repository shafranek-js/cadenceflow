import type { ChangeEvent, MouseEvent } from "react";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import type {
  ChordStep,
  PianoArticulation,
  RegisterOffset,
  StepPerformance,
} from "../../domain/progression/step";
import { realizeProgressionStepPitches } from "../../instruments/piano/profile";
import { formatMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { PianoCardView } from "../piano/PianoCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { StepCardViewSwitcher } from "./StepCardViewSwitcher";
import { StepDurationControl } from "./StepDurationControl";
import { StepActions } from "./StepActions";

const ARTICULATIONS: readonly PianoArticulation[] = [
  "block",
  "arp-up",
  "arp-down",
  "broken-chord",
  "humanized",
];

export function ProgressionStepCard({
  step,
  tonic,
  selected,
  playing = false,
  inLoop = false,
  canReplace,
  onSelect,
  onPerformanceChange,
  onDurationChange,
  onViewChange,
  onReplace,
  onReset,
  onRemove,
  onMoveLeft,
  onMoveRight,
}: {
  readonly step: ChordStep;
  readonly tonic: PitchClassIdentity;
  readonly selected: boolean;
  readonly playing?: boolean;
  readonly inLoop?: boolean;
  readonly canReplace: boolean;
  readonly onSelect: () => void;
  readonly onPerformanceChange: (performance: Partial<StepPerformance>) => void;
  readonly onDurationChange?: (duration: MusicalDuration) => void;
  readonly onViewChange: (view: ChordStep["cardView"]) => void;
  readonly onReplace: () => void;
  readonly onReset: () => void;
  readonly onRemove: () => void;
  readonly onMoveLeft: () => void;
  readonly onMoveRight: () => void;
}) {
  const pitches = realizeProgressionStepPitches(step, tonic);
  const durationLabel = formatMusicalDuration(step.duration);

  return (
    <article
      className={`progression-step-card ${selected ? "is-selected" : ""} ${playing ? "is-playing" : ""} ${inLoop ? "is-in-loop" : ""}`}
      data-testid="progression-step"
      data-selected={selected ? "true" : undefined}
      data-playing={playing ? "true" : undefined}
      data-in-loop={inLoop ? "true" : undefined}
      onClick={onSelect}
    >
      <div className="step-view">
        {step.cardView === "harmonic" ? (
          <>
            <strong data-testid="step-function">{step.harmonicFunction.functionId}</strong>
            <span>
              {step.performance.articulation} · v{step.performance.masterVelocity} · {durationLabel}
            </span>
          </>
        ) : null}
        {step.cardView === "piano" ? <PianoCardView pitches={pitches} /> : null}
        {step.cardView === "staff" ? <StaffCardView pitches={pitches} /> : null}
      </div>
      <StepCardViewSwitcher value={step.cardView} stepId={step.id} onChange={onViewChange} />
      {selected ? (
        <div
          className="step-editor"
          onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
        >
          <label>
            Articulation
            <select
              value={step.performance.articulation}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onPerformanceChange({ articulation: event.target.value as PianoArticulation })
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
            Velocity
            <input
              type="number"
              min="1"
              max="127"
              value={step.performance.masterVelocity}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onPerformanceChange({
                  masterVelocity: Math.max(1, Math.min(127, Number(event.target.value))),
                })
              }
            />
          </label>
          <label>
            Register
            <select
              value={String(step.performance.register)}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onPerformanceChange({
                  register:
                    event.target.value === "auto"
                      ? "auto"
                      : (Number(event.target.value) as RegisterOffset),
                })
              }
            >
              <option value="auto">auto</option>
              {[-2, -1, 0, 1, 2].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {onDurationChange ? (
            <StepDurationControl value={step.duration} onChange={onDurationChange} />
          ) : null}
          <StepActions
            canReplace={canReplace}
            onReplace={onReplace}
            onReset={onReset}
            onRemove={onRemove}
            onMoveLeft={onMoveLeft}
            onMoveRight={onMoveRight}
          />
        </div>
      ) : null}
    </article>
  );
}
