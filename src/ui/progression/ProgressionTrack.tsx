import type { ChangeEvent, DragEvent } from "react";
import type { Project } from "../../domain/project/project";
import type { CardViewId, StepPerformance } from "../../domain/progression/step";
import type { LoopState } from "../transport/loopState";
import { ProgressionStepCard } from "./ProgressionStepCard";

export function ProgressionTrack({
  project,
  previewFunctionId,
  currentPlayingStepIndex,
  loopState,
  onSelectStep,
  onEditPerformance,
  onSetStepView,
  onSetAllViews,
  onReplace,
  onReset,
  onRemove,
  onReorder,
}: {
  readonly project: Project;
  readonly previewFunctionId?: string;
  readonly currentPlayingStepIndex?: number | null;
  readonly loopState?: LoopState;
  readonly onSelectStep: (stepId: string) => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onSetStepView: (stepId: string, view: CardViewId) => void;
  readonly onSetAllViews: (view: CardViewId) => void;
  readonly onReplace: (stepId: string, functionId: string) => void;
  readonly onReset: (stepId: string) => void;
  readonly onRemove: (stepId: string) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
}) {
  const loopIndices = (() => {
    if (!loopState?.enabled || !loopState.region) return null;
    const start = project.progression.steps.findIndex(
      (s) => s.id === loopState.region?.startStepId,
    );
    const end = project.progression.steps.findIndex((s) => s.id === loopState.region?.endStepId);
    if (start === -1 || end === -1 || start > end) return null;
    return { start, end };
  })();
  const chordViews = project.progression.steps
    .filter((step) => step.kind === "chord")
    .map((step) => step.cardView);
  const commonView =
    chordViews.length && chordViews.every((view) => view === chordViews[0])
      ? chordViews[0]!
      : "mixed";
  const dragStart = (event: DragEvent<HTMLElement>, stepId: string) =>
    event.dataTransfer.setData("text/plain", stepId);
  const drop = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    const stepId = event.dataTransfer.getData("text/plain");
    if (stepId) onReorder(stepId, targetIndex);
  };
  return (
    <div className="progression-track">
      <div className="progression-view-control">
        <label>
          Progression View
          <select
            aria-label="Progression Card View"
            value={commonView}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              event.target.value !== "mixed" && onSetAllViews(event.target.value as CardViewId)
            }
          >
            <option value="mixed" disabled>
              Mixed
            </option>
            <option value="harmonic">Harmonic</option>
            <option value="piano">Piano</option>
            <option value="staff">Staff</option>
          </select>
        </label>
      </div>
      <div className="progression-step-cards">
        {project.progression.steps.map((step, index) => {
          const isPlaying = currentPlayingStepIndex === index;
          const isInLoop = Boolean(
            loopIndices && index >= loopIndices.start && index <= loopIndices.end,
          );

          return step.kind === "rest" ? (
            <div
              key={step.id}
              className={`progression-rest-card ${isPlaying ? "is-playing" : ""} ${isInLoop ? "is-in-loop" : ""}`}
              data-testid="progression-step"
              data-playing={isPlaying ? "true" : undefined}
              data-in-loop={isInLoop ? "true" : undefined}
            >
              Rest
            </div>
          ) : (
            <div
              key={step.id}
              draggable
              onDragStart={(event: DragEvent<HTMLDivElement>) => dragStart(event, step.id)}
              onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
              onDrop={(event: DragEvent<HTMLDivElement>) => drop(event, index)}
            >
              <ProgressionStepCard
                step={step}
                tonic={project.tonic}
                selected={project.progression.selectedStepId === step.id}
                playing={isPlaying}
                inLoop={isInLoop}
                canReplace={Boolean(previewFunctionId)}
                onSelect={() => onSelectStep(step.id)}
                onPerformanceChange={(performance) => onEditPerformance(step.id, performance)}
                onViewChange={(view) => onSetStepView(step.id, view)}
                onReplace={() => previewFunctionId && onReplace(step.id, previewFunctionId)}
                onReset={() => onReset(step.id)}
                onRemove={() => onRemove(step.id)}
                onMoveLeft={() => onReorder(step.id, Math.max(0, index - 1))}
                onMoveRight={() =>
                  onReorder(step.id, Math.min(project.progression.steps.length - 1, index + 1))
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
