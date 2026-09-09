import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { Project } from "../../domain/project/project";
import type { CardViewId, StepPerformance } from "../../domain/progression/step";
import { formatMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import type { LoopState } from "../transport/loopState";
import { ProgressionStepCard } from "./ProgressionStepCard";
import { ProgressionStepRemoveButton } from "./ProgressionStepRemoveButton";
import { StepDurationControl } from "./StepDurationControl";

export function ProgressionTrack({
  project,
  previewFunctionId,
  currentPlayingStepIndex,
  loopState,
  onSelectStep,
  onClearSelection,
  onEditPerformance,
  onDurationChange,
  onSetStepView,
  onSetAllViews,
  onReplace,
  onReset,
  onRemove,
  onReorder,
  onAddRest,
}: {
  readonly project: Project;
  readonly previewFunctionId?: string;
  readonly currentPlayingStepIndex?: number | null;
  readonly loopState?: LoopState;
  readonly onSelectStep: (stepId: string) => void;
  readonly onClearSelection?: () => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onDurationChange?: (stepId: string, duration: MusicalDuration) => void;
  readonly onSetStepView: (stepId: string, view: CardViewId) => void;
  readonly onSetAllViews: (view: CardViewId) => void;
  readonly onReplace: (stepId: string, functionId: string) => void;
  readonly onReset: (stepId: string) => void;
  readonly onRemove: (stepId: string) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onAddRest?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const selectedStepId = project.progression.selectedStepId;
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
  const dragStart = (event: DragEvent<HTMLElement>, stepId: string) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("button, input, select, textarea, label, [data-no-drag]")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", stepId);
    setDraggingStepId(stepId);
  };
  const dragOver = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    if (draggingStepId) setDropTargetIndex(targetIndex);
  };
  const clearDragState = () => {
    setDraggingStepId(null);
    setDropTargetIndex(null);
  };
  const drop = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    const stepId = event.dataTransfer.getData("text/plain");
    if (stepId) onReorder(stepId, targetIndex);
    clearDragState();
  };
  const restoreSelectedStepFocus = (stepId: string) => {
    const focus = () => {
      const buttons = trackRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-progression-step-select]",
      );
      const selectedButton = buttons
        ? Array.from(buttons).find((button) => button.dataset.stepId === stepId)
        : undefined;
      selectedButton?.focus();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
    else focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !selectedStepId || !onClearSelection) return;
    event.preventDefault();
    event.stopPropagation();
    onClearSelection();
    restoreSelectedStepFocus(selectedStepId);
  };
  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClearSelection?.();
  };
  return (
    <div
      ref={trackRef}
      className="progression-track"
      onClick={handleBackgroundClick}
      onKeyDown={handleKeyDown}
    >
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
        {onAddRest ? (
          <button
            type="button"
            className="add-rest-btn"
            onClick={onAddRest}
            aria-label="Add Rest to progression"
          >
            + Rest
          </button>
        ) : null}
      </div>
      <div className="progression-step-cards" onClick={handleBackgroundClick}>
        {project.progression.steps.length === 0 ? (
          <div
            className="progression-empty-state"
            role="status"
            data-testid="progression-empty-state"
          >
            <strong>No steps yet</strong>
            <span>Preview a chord in the Matrix, then press + to add it.</span>
          </div>
        ) : null}
        {project.progression.steps.map((step, index) => {
          const isPlaying = currentPlayingStepIndex === index;
          const isInLoop = Boolean(
            loopIndices && index >= loopIndices.start && index <= loopIndices.end,
          );

          const isSelected = project.progression.selectedStepId === step.id;

          return step.kind === "rest" ? (
            <div
              key={step.id}
              className={`progression-rest-card ${isPlaying ? "is-playing" : ""} ${isInLoop ? "is-in-loop" : ""} ${isSelected ? "is-selected" : ""} ${dropTargetIndex === index ? "is-drop-target" : ""}`}
              data-testid="progression-step"
              data-playing={isPlaying ? "true" : undefined}
              data-in-loop={isInLoop ? "true" : undefined}
              onClick={() => onSelectStep(step.id)}
              onDragOver={(event) => dragOver(event, index)}
              onDrop={(event) => drop(event, index)}
            >
              <span
                className="progression-step-number"
                data-testid="progression-step-number"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <ProgressionStepRemoveButton
                accessibleName={`Remove progression step ${index + 1}: Rest`}
                onRemove={() => onRemove(step.id)}
              />
              <button
                type="button"
                className="progression-step-select-button"
                data-progression-step-select
                data-step-id={step.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectStep(step.id);
                }}
                aria-label={`Select progression step ${index + 1}: Rest${isPlaying ? ", Playing" : ""}`}
                aria-pressed={isSelected}
                aria-current={isPlaying ? "step" : undefined}
              >
                <span className="step-view">
                  <strong>Rest</strong>
                  <span>{formatMusicalDuration(step.duration)}</span>
                </span>
                {isPlaying ? (
                  <span className="step-state-indicator playing-indicator" aria-hidden="true">
                    ▶ Playing
                  </span>
                ) : null}
              </button>
              {isSelected ? (
                <div
                  className="step-editor"
                  onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
                >
                  {onDurationChange ? (
                    <StepDurationControl
                      value={step.duration}
                      onChange={(duration) => onDurationChange(step.id, duration)}
                    />
                  ) : null}
                  <div className="step-actions">
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => onRemove(step.id)}
                      aria-label={`Remove selected progression step ${index + 1}: Rest`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              key={step.id}
              className={`progression-drag-item ${dropTargetIndex === index ? "is-drop-target" : ""}`}
              draggable
              data-progression-step-drag
              data-step-id={step.id}
              data-dragging={draggingStepId === step.id ? "true" : undefined}
              onDragStart={(event: DragEvent<HTMLDivElement>) => dragStart(event, step.id)}
              onDragOver={(event: DragEvent<HTMLDivElement>) => dragOver(event, index)}
              onDrop={(event: DragEvent<HTMLDivElement>) => drop(event, index)}
              onDragEnd={clearDragState}
            >
              <ProgressionStepCard
                step={step}
                stepNumber={index + 1}
                tonic={project.tonic}
                selected={isSelected}
                playing={isPlaying}
                inLoop={isInLoop}
                canReplace={Boolean(previewFunctionId)}
                onSelect={() => onSelectStep(step.id)}
                onPerformanceChange={(performance) => onEditPerformance(step.id, performance)}
                onDurationChange={(duration) => onDurationChange?.(step.id, duration)}
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
