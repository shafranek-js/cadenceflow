import type { ReactNode } from "react";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { getResolutionTarget } from "../../domain/harmony/tendencyArrows";
import { realizeChord } from "../../domain/harmony/realization";
import type { ChordStep, ProgressionStep } from "../../domain/progression/step";
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import type { Project } from "../../domain/project/project";
import {
  createProgressionMeasureLayout,
  type ProgressionMeasureFragment,
} from "../../domain/timing/measureLayout";
import { formatMusicalDuration, musicalDuration } from "../../domain/timing/duration";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import {
  realizeProgressionStepChord,
  stepTranspositionSemitones,
} from "../../domain/progression/transposition";
import { GuitarCardView } from "../guitar/GuitarCardView";
import { StepTranspositionBadge } from "./StepTranspositionBadge";

function chordLabel(step: ChordStep, tonic: Project["tonic"]): string {
  const chord = realizeProgressionStepChord(step, tonic);
  return formatChordSymbol(
    withEffectiveBass(chord, realizeProgressionStepRealization(step, tonic).bassPitch),
  );
}

function nextChordStep(
  steps: readonly ProgressionStep[],
  stepIndex: number,
): ChordStep | undefined {
  return steps.slice(stepIndex + 1).find((step): step is ChordStep => step.kind === "chord");
}

function directionTarget(step: ChordStep, moduleId: Project["activeModule"]): string | undefined {
  return (
    step.harmonicFunction.targetId ??
    step.harmonicFunction.targetFunctionId ??
    getResolutionTarget(step.harmonicFunction.functionId, moduleId)
  );
}

function renderChordBody(
  fragment: ProgressionMeasureFragment,
  project: Project,
  nextStep: ChordStep | undefined,
): ReactNode {
  if (fragment.step.kind !== "chord") return null;
  const label = chordLabel(fragment.step, project.tonic);
  const direction =
    nextStep &&
    directionTarget(fragment.step, project.activeModule) === nextStep.harmonicFunction.functionId
      ? nextStep.harmonicFunction.functionId
      : undefined;
  const chord = withEffectiveBass(
    realizeProgressionStepChord(fragment.step, project.tonic),
    realizeProgressionStepRealization(fragment.step, project.tonic).bassPitch,
  );

  return (
    <>
      <span className="printable-chord-symbol" data-testid="printable-chord-symbol">
        {label}
      </span>
      <span className="printable-chord-function">{fragment.step.harmonicFunction.functionId}</span>
      <StepTranspositionBadge
        semitones={stepTranspositionSemitones(fragment.step)}
        className="printable-transposition-indicator"
      />
      <span className="printable-duration">{formatMusicalDuration(fragment.step.duration)}</span>
      {direction ? (
        <span
          className="printable-direction-arrow"
          aria-label={`Harmonic direction toward ${direction}`}
          title={`Harmonic direction toward ${direction}`}
        >
          →
        </span>
      ) : null}
      <div className="printable-guitar-diagram" data-testid="printable-guitar-diagram">
        <GuitarCardView chord={chord} chordLabel={label} orientation="horizontal" />
      </div>
    </>
  );
}

function PrintableFragment({
  fragment,
  project,
  nextStep,
}: {
  readonly fragment: ProgressionMeasureFragment;
  readonly project: Project;
  readonly nextStep: ChordStep | undefined;
}) {
  const duration = formatMusicalDuration(musicalDuration(fragment.durationBeats));
  const stepNumber = fragment.stepIndex + 1;
  if (fragment.step.kind === "rest") {
    return (
      <div className="printable-step printable-rest" data-testid="printable-rest">
        <span className="printable-step-number">{stepNumber}</span>
        <span className="printable-rest-symbol" aria-hidden="true">
          𝄽
        </span>
        <span className="printable-rest-label">Rest</span>
        <span className="printable-duration">{duration}</span>
      </div>
    );
  }

  if (!fragment.startsHere) {
    return (
      <div
        className="printable-step printable-continuation"
        data-testid="printable-continuation"
        aria-label={`Continuation of progression step ${stepNumber}, ${duration}`}
      >
        <span aria-hidden="true">↪</span>
        <span>Continuation</span>
        <span className="printable-duration">{duration}</span>
      </div>
    );
  }

  return (
    <div
      className="printable-step printable-chord"
      data-testid="printable-chord-step"
      data-step-id={fragment.step.id}
      aria-label={`Progression step ${stepNumber}: ${chordLabel(fragment.step, project.tonic)}`}
    >
      <span className="printable-step-number">{stepNumber}</span>
      {renderChordBody(fragment, project, nextStep)}
    </div>
  );
}

function PrintableMeasure({
  measure,
  project,
}: {
  readonly measure: ReturnType<typeof createProgressionMeasureLayout>["measures"][number];
  readonly project: Project;
}) {
  return (
    <section
      className="printable-progression-measure"
      data-testid="printable-measure"
      data-measure-index={measure.measureIndex}
      aria-label={`Printable measure ${measure.number}`}
    >
      <header className="printable-measure-header">
        <strong>Measure {measure.number}</strong>
        <span>
          {project.globalTiming.meter.numerator}/{project.globalTiming.meter.denominator}
        </span>
        <span aria-label={`Grouping ${project.globalTiming.meter.grouping.join(" plus ")}`}>
          {project.globalTiming.meter.grouping.join("+")}
        </span>
      </header>
      <div className="printable-measure-items">
        {measure.items.map((item, itemIndex) => {
          if (item.kind === "gap") {
            return (
              <div
                key={`gap-${itemIndex}`}
                className="printable-step printable-gap"
                data-testid="printable-gap"
                aria-label={`Unfilled measure space, ${formatMusicalDuration(musicalDuration(item.durationBeats))}`}
              >
                <span className="printable-gap-symbol" aria-hidden="true">
                  □
                </span>
                <span>Unfilled</span>
                <span className="printable-duration">
                  {formatMusicalDuration(musicalDuration(item.durationBeats))}
                </span>
              </div>
            );
          }
          return (
            <PrintableFragment
              key={`${item.stepId}-${item.fragmentIndex}`}
              fragment={item}
              project={project}
              nextStep={
                item.startsHere && item.step.kind === "chord"
                  ? nextChordStep(project.progression.steps, item.stepIndex)
                  : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}

export function PrintableProgression({ project }: { readonly project: Project }) {
  const layout = createProgressionMeasureLayout(
    project.progression.steps,
    project.globalTiming.meter,
  );
  return (
    <div className="printable-progression" data-testid="printable-progression">
      <header className="printable-progression-header">
        <div>
          <p className="printable-kicker">CadenceFlow · My Progression</p>
          <h1>{project.name}</h1>
        </div>
        <div className="printable-project-meta">
          <span>{project.activeModule === "progressions" ? "Progressions" : "Dark Harmony"}</span>
          <span>
            Meter {project.globalTiming.meter.numerator}/{project.globalTiming.meter.denominator}
          </span>
          <span>{layout.measures.length} measures</span>
        </div>
      </header>
      {layout.measures.length === 0 ? (
        <p className="printable-empty-state">My Progression is empty.</p>
      ) : (
        <div className="printable-measure-list">
          {layout.measures.map((measure) => (
            <PrintableMeasure key={measure.measureIndex} measure={measure} project={project} />
          ))}
        </div>
      )}
      <footer className="printable-progression-footer">
        <span>Read-only print projection · Project and session history unchanged</span>
        <span>Suzuki colors are not required for meaning</span>
      </footer>
    </div>
  );
}
