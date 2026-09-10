import {
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { Project } from "../../domain/project/project";
import type { CardViewId, StepPerformance } from "../../domain/progression/step";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import {
  formatMusicalDuration,
  musicalDuration,
  type MusicalDuration,
} from "../../domain/timing/duration";
import {
  createProgressionMeasureLayout,
  type ProgressionMeasureFragment,
  type ProgressionMeasureItem,
} from "../../domain/timing/measureLayout";
import { rationalToNumber, subtractRational } from "../../domain/timing/rational";
import type { LoopState } from "../transport/loopState";
import { ProgressionStepCard } from "./ProgressionStepCard";
import { ProgressionStepRemoveButton } from "./ProgressionStepRemoveButton";
import { Icon } from "../common/Icon";
import { MeasureStaffView, type MeasureStaffItem } from "../staff/MeasureStaffView";
import {
  canShiftPerformanceOctave,
  performanceOctaveShiftPatch,
  type StaffOctaveDirection,
} from "../staff/staffOctave";

function segmentStyle(
  durationBeats: MusicalDuration["beats"],
  barLengthBeats: MusicalDuration["beats"],
): CSSProperties {
  const ratio = rationalToNumber(durationBeats) / rationalToNumber(barLengthBeats);
  return { flex: `${Math.max(0, ratio)} 1 0` };
}

export function ProgressionTrack({
  project,
  currentPlayingStepIndex,
  loopState,
  onSelectStep,
  onClearSelection,
  onEditPerformance,
  onSetAllViews,
  onRemove,
  onReorder,
  onAddRest,
  onFocusMatrix,
  onFillGapWithRest,
  onExtendFinalChord,
  onRepeatFinalChord,
}: {
  readonly project: Project;
  readonly currentPlayingStepIndex?: number | null;
  readonly loopState?: LoopState;
  readonly onSelectStep: (stepId: string) => void;
  readonly onClearSelection?: () => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onSetAllViews: (view: CardViewId) => void;
  readonly onRemove: (stepId: string) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onAddRest?: (duration?: MusicalDuration) => void;
  readonly onFocusMatrix?: () => void;
  readonly onFillGapWithRest?: () => void;
  readonly onExtendFinalChord?: () => void;
  readonly onRepeatFinalChord?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [matrixGapHint, setMatrixGapHint] = useState<number | null>(null);
  const selectedStepId = project.progression.selectedStepId;
  const currentPlayingStepId =
    currentPlayingStepIndex === null || currentPlayingStepIndex === undefined
      ? undefined
      : project.progression.steps[currentPlayingStepIndex]?.id;
  const layout = createProgressionMeasureLayout(
    project.progression.steps,
    project.globalTiming.meter,
  );
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

  const staffItemsForMeasure = (measure: (typeof layout.measures)[number]): MeasureStaffItem[] =>
    measure.items.map((item, itemIndex) => {
      const duration = musicalDuration(item.durationBeats);
      const startOffsetBeats = subtractRational(item.startBeats, measure.startBeats);
      if (item.kind === "gap") {
        return {
          key: `gap-${measure.measureIndex}-${itemIndex}`,
          kind: "gap",
          duration,
          startOffsetBeats,
        };
      }
      if (item.step.kind === "rest") {
        return {
          key: `${item.step.id}-${item.fragmentIndex}`,
          kind: "rest",
          stepId: item.step.id,
          label: "Rest",
          duration,
          startOffsetBeats,
        };
      }
      const realization = realizeProgressionStepRealization(item.step, project.tonic);
      return {
        key: `${item.step.id}-${item.fragmentIndex}`,
        kind: "chord",
        stepId: item.step.id,
        label: formatChordSymbol({
          ...realizeChord(item.step.harmonicFunction, project.tonic),
          variant: item.step.harmonicVariant,
        }),
        pitches: realization.pitches,
        ...(project.presentation.showBassInStaff && realization.bassPitch
          ? { bassPitch: realization.bassPitch }
          : {}),
        chordPitches: realization.pitches,
        duration,
        startOffsetBeats,
        startsHere: item.startsHere,
        continuesFromPrevious: item.continuesFromPrevious,
        continuesToNext: item.continuesToNext,
        canShiftUp: canShiftPerformanceOctave(item.step.performance, 1),
        canShiftDown: canShiftPerformanceOctave(item.step.performance, -1),
      };
    });

  const shiftStaffOctave = (stepId: string, direction: StaffOctaveDirection) => {
    const step = project.progression.steps.find(
      (candidate) => candidate.id === stepId && candidate.kind === "chord",
    );
    if (!step || step.kind !== "chord") return;
    const patch = performanceOctaveShiftPatch(step.performance, direction);
    if (patch) onEditPerformance(step.id, patch);
  };

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
      const selectedButton = Array.from(
        trackRef.current?.querySelectorAll<HTMLButtonElement>("[data-progression-step-select]") ??
          [],
      ).find((button) => button.dataset.stepId === stepId);
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
    const target = event.target;
    if (!(target instanceof Element)) return;
    const clickedInteractive = target.closest(
      ".progression-step-card, .progression-rest-card, .progression-step-continuation, .progression-measure-header, .progression-measure-gap, .progression-view-control, .progression-gap-hint, button, select, input, textarea, label",
    );
    if (clickedInteractive) return;
    if (event.currentTarget.classList.contains("progression-step-cards")) {
      event.stopPropagation();
    }
    onClearSelection?.();
  };

  const focusMatrixForGap = (measureNumber: number) => {
    onFocusMatrix?.();
    setMatrixGapHint(measureNumber);
  };

  const renderRest = (fragment: ProgressionMeasureFragment) => {
    const step = fragment.step;
    const index = fragment.stepIndex;
    const isPlaying = currentPlayingStepIndex === index;
    const isInLoop = Boolean(loopIndices && index >= loopIndices.start && index <= loopIndices.end);
    const isSelected = selectedStepId === step.id;
    return (
      <div
        className={`progression-drag-item measure-step-segment ${dropTargetIndex === index ? "is-drop-target" : ""}`}
        style={segmentStyle(fragment.durationBeats, layout.barLengthBeats)}
        draggable
        data-progression-step-drag
        data-step-id={step.id}
        data-dragging={draggingStepId === step.id ? "true" : undefined}
        onDragStart={(event) => dragStart(event, step.id)}
        onDragOver={(event) => dragOver(event, index)}
        onDrop={(event) => drop(event, index)}
        onDragEnd={clearDragState}
      >
        <div
          className={`progression-rest-card ${isPlaying ? "is-playing" : ""} ${isInLoop ? "is-in-loop" : ""} ${isSelected ? "is-selected" : ""}`}
          data-testid="progression-step"
          data-playing={isPlaying ? "true" : undefined}
          data-in-loop={isInLoop ? "true" : undefined}
          onClick={() => onSelectStep(step.id)}
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
          </button>
        </div>
      </div>
    );
  };

  const renderFragment = (
    fragment: ProgressionMeasureFragment,
    measureNumber: number,
    compactStaff: boolean,
  ) => {
    if (!fragment.startsHere) {
      return (
        <div
          key={`${fragment.stepId}-continuation-${fragment.fragmentIndex}`}
          className="progression-step-continuation measure-step-segment"
          style={segmentStyle(fragment.durationBeats, layout.barLengthBeats)}
          data-testid="progression-step-continuation"
          onClick={() => onSelectStep(fragment.stepId)}
          role="button"
          tabIndex={0}
          aria-label={`Continuation of progression step ${fragment.stepIndex + 1} in measure ${measureNumber}, ${formatMusicalDuration(musicalDuration(fragment.durationBeats))}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectStep(fragment.stepId);
            }
          }}
        >
          <span aria-hidden="true">↪</span>
          <span>{formatMusicalDuration(musicalDuration(fragment.durationBeats))}</span>
        </div>
      );
    }
    if (fragment.step.kind === "rest") return renderRest(fragment);
    const step = fragment.step;
    const index = fragment.stepIndex;
    const isPlaying = currentPlayingStepIndex === index;
    const isInLoop = Boolean(loopIndices && index >= loopIndices.start && index <= loopIndices.end);
    const isSelected = selectedStepId === step.id;
    return (
      <div
        key={step.id}
        className={`progression-drag-item measure-step-segment ${dropTargetIndex === index ? "is-drop-target" : ""}`}
        style={segmentStyle(fragment.durationBeats, layout.barLengthBeats)}
        draggable
        data-progression-step-drag
        data-step-id={step.id}
        data-dragging={draggingStepId === step.id ? "true" : undefined}
        onDragStart={(event) => dragStart(event, step.id)}
        onDragOver={(event) => dragOver(event, index)}
        onDrop={(event) => drop(event, index)}
        onDragEnd={clearDragState}
      >
        <ProgressionStepCard
          step={step}
          stepNumber={index + 1}
          tonic={project.tonic}
          compactStaff={compactStaff}
          selected={isSelected}
          playing={isPlaying}
          inLoop={isInLoop}
          showBassInStaff={project.presentation.showBassInStaff}
          onSelect={() => onSelectStep(step.id)}
          onPerformanceChange={(performance) => onEditPerformance(step.id, performance)}
          onRemove={() => onRemove(step.id)}
        />
      </div>
    );
  };

  const renderGap = (measureNumber: number, durationBeats: MusicalDuration["beats"]) => {
    const finalStep = project.progression.steps.at(-1);
    const canRepeatOrExtend = finalStep?.kind === "chord";
    return (
      <div
        className="progression-measure-gap measure-step-segment"
        style={segmentStyle(durationBeats, layout.barLengthBeats)}
        data-testid="progression-measure-gap"
        role="group"
        aria-label={`Empty space in measure ${measureNumber}: ${formatMusicalDuration(musicalDuration(durationBeats))}`}
      >
        <strong>Empty</strong>
        <span>{formatMusicalDuration(musicalDuration(durationBeats))}</span>
        <div className="progression-gap-actions">
          {onFocusMatrix ? (
            <button
              type="button"
              onClick={() => focusMatrixForGap(measureNumber)}
              aria-label={`Add chord to measure ${measureNumber}`}
            >
              <Icon name="add" /> Add chord
            </button>
          ) : null}
          {onFillGapWithRest ? (
            <button
              type="button"
              onClick={onFillGapWithRest}
              aria-label={`Fill measure ${measureNumber} with rest`}
            >
              Rest
            </button>
          ) : null}
          {onExtendFinalChord && canRepeatOrExtend ? (
            <button
              type="button"
              onClick={onExtendFinalChord}
              aria-label={`Extend chord to end of measure ${measureNumber}`}
            >
              Extend
            </button>
          ) : null}
          {onRepeatFinalChord && canRepeatOrExtend ? (
            <button
              type="button"
              onClick={onRepeatFinalChord}
              aria-label={`Repeat chord to end of measure ${measureNumber}`}
            >
              Repeat
            </button>
          ) : null}
        </div>
      </div>
    );
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
            onClick={() => onAddRest()}
            aria-label="Add Rest to progression"
          >
            <Icon name="add" /> Rest
          </button>
        ) : null}
      </div>
      <div className="progression-step-cards" onClick={handleBackgroundClick}>
        {matrixGapHint !== null ? (
          <p className="progression-gap-hint" role="status" data-testid="progression-gap-hint">
            Choose a chord in Matrix; it will be added after the authored content in measure{" "}
            {matrixGapHint}.
          </p>
        ) : null}
        {project.progression.steps.length === 0 ? (
          <div
            className="progression-empty-state"
            role="status"
            data-testid="progression-empty-state"
          >
            <strong className="progression-first-use-guidance">
              Choose key → explore Matrix → click to hear → + to add
            </strong>
            <span>Preview a chord in the Matrix, then press + to add it.</span>
          </div>
        ) : null}
        {layout.measures.map((measure) => {
          const usesSharedStaff = commonView === "staff";
          const staffItems = usesSharedStaff ? staffItemsForMeasure(measure) : [];
          return (
            <section
              key={measure.measureIndex}
              className={`progression-measure-card ${usesSharedStaff ? "has-shared-staff" : ""}`}
              data-testid="progression-measure"
              aria-label={`Measure ${measure.number}, ${project.globalTiming.meter.numerator}/${project.globalTiming.meter.denominator}`}
            >
              <header className="progression-measure-header">
                <strong>Measure {measure.number}</strong>
                <span>
                  {project.globalTiming.meter.numerator}/{project.globalTiming.meter.denominator}
                </span>
                <span aria-label={`Grouping ${project.globalTiming.meter.grouping.join(" plus ")}`}>
                  {project.globalTiming.meter.grouping.join("+")}
                </span>
              </header>
              {usesSharedStaff ? (
                <MeasureStaffView
                  items={staffItems}
                  meter={project.globalTiming.meter}
                  barLengthBeats={layout.barLengthBeats}
                  selectedStepId={selectedStepId}
                  playingStepId={currentPlayingStepId}
                  onSelect={onSelectStep}
                  onOctaveChange={shiftStaffOctave}
                />
              ) : null}
              <div className="progression-measure-grid" data-testid="progression-measure-grid">
                {measure.items.map((item: ProgressionMeasureItem, itemIndex) => (
                  <div
                    key={
                      item.kind === "gap"
                        ? `gap-${itemIndex}`
                        : `${item.stepId}-${item.fragmentIndex}`
                    }
                    className="measure-item-wrapper"
                  >
                    {item.kind === "gap"
                      ? renderGap(measure.number, item.durationBeats)
                      : renderFragment(item, measure.number, usesSharedStaff)}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
