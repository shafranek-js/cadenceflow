import {
  useRef,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { MeasuresPerSystem, ProgressionView, Project } from "../../domain/project/project";
import type { AudioProviderState } from "../../audio/contracts";
import type { PianoArticulation, StepPerformance } from "../../domain/progression/step";
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
import type { MeasureStaffItem } from "../staff/MeasureStaffView";
import { ScoreSystemView } from "../staff/ScoreSystemView";
import type { ScoreSystem } from "../../notation/scoreSystemProjection";
import { MelodyContextMenu, type MelodyMenuPosition } from "../melody/MelodyContextMenu";
import { MelodyEditorDialog } from "../melody/MelodyEditorDialog";
import { MelodyTrackControls } from "../melody/MelodyTrackControls";
import { HarmonyTrackControls } from "../harmony/HarmonyTrackControls";
import { createMelodyTimeline } from "../../notation/melodyStaffProjection";
import type {
  ChordMelodyRecipe,
  MelodyInstrument,
  MelodyTrackSettings,
} from "../../domain/melody/types";
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import { canShiftPerformanceOctave } from "../staff/staffOctave";

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
  onSetProgressionView,
  onRemove,
  onReorder,
  onAddRest,
  onFocusMatrix,
  onFillGapWithRest,
  onExtendFinalChord,
  onRepeatFinalChord,
  onSetMelodyRecipe,
  onRemoveMelodyRecipe,
  onMelodyTrackSettingsChange,
  onHarmonyTrackSettingsChange,
  activeMelodyEventKey,
  melodyAudioState,
  melodyAudioError,
  onRetryMelodyAudio,
  harmonyAudioState,
  harmonyAudioError,
  onRetryHarmonyAudio,
  isMelodyPreviewPlaying,
  onPlayMelodyPreview,
  onStopMelodyPreview,
  onSetMeasuresPerSystem,
  onDuplicateSystem,
  onDeleteSystem,
  isSystemLooping,
  isSystemMuted,
  isSystemSolo,
  canPasteSystem,
  onPlayFromSystem,
  onToggleLoopSystem,
  onToggleMuteSystem,
  onToggleSoloSystem,
  onMoveSystemUp,
  onMoveSystemDown,
  onCopySystem,
  onPasteSystemAfter,
  onInsertEmptySystemAfter,
  onOctaveUpSystem,
  onOctaveDownSystem,
  onResetPerformanceSystem,
  onSetArticulationSystem,
  onApplyMelodyContourSystem,
  onClearMelodySystem,
}: {
  readonly project: Project;
  readonly currentPlayingStepIndex?: number | null;
  readonly loopState?: LoopState;
  readonly onSelectStep: (stepId: string) => void;
  readonly onClearSelection?: () => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onSetProgressionView: (view: ProgressionView) => void;
  readonly onRemove: (stepId: string) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onAddRest?: (duration?: MusicalDuration) => void;
  readonly onFocusMatrix?: (measureNumber: number) => void;
  readonly onFillGapWithRest?: () => void;
  readonly onExtendFinalChord?: () => void;
  readonly onRepeatFinalChord?: () => void;
  readonly onSetMelodyRecipe?: (
    stepId: string,
    recipe: ChordMelodyRecipe,
    instrument: MelodyInstrument,
  ) => void;
  readonly onRemoveMelodyRecipe?: (stepId: string) => void;
  readonly onMelodyTrackSettingsChange?: (patch: Partial<MelodyTrackSettings>) => void;
  readonly onHarmonyTrackSettingsChange?: (patch: Partial<HarmonyTrackSettings>) => void;
  readonly activeMelodyEventKey?: string | null;
  readonly melodyAudioState?: AudioProviderState;
  readonly melodyAudioError?: string | null;
  readonly onRetryMelodyAudio?: () => void;
  readonly harmonyAudioState?: AudioProviderState;
  readonly harmonyAudioError?: string | null;
  readonly onRetryHarmonyAudio?: () => void;
  readonly isMelodyPreviewPlaying?: boolean;
  readonly onPlayMelodyPreview?: (project: Project) => void;
  readonly onStopMelodyPreview?: () => void;
  readonly onSetMeasuresPerSystem?: (value: MeasuresPerSystem) => void;
  readonly onDuplicateSystem?: (system: ScoreSystem) => void;
  readonly onDeleteSystem?: (system: ScoreSystem) => void;
  readonly isSystemLooping?: ((system: ScoreSystem) => boolean) | undefined;
  readonly isSystemMuted?: ((system: ScoreSystem) => boolean) | undefined;
  readonly isSystemSolo?: ((system: ScoreSystem) => boolean) | undefined;
  readonly canPasteSystem?: boolean | undefined;
  readonly onPlayFromSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onToggleLoopSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onToggleMuteSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onToggleSoloSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onMoveSystemUp?: ((system: ScoreSystem) => void) | undefined;
  readonly onMoveSystemDown?: ((system: ScoreSystem) => void) | undefined;
  readonly onCopySystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onPasteSystemAfter?: ((system: ScoreSystem) => void) | undefined;
  readonly onInsertEmptySystemAfter?: ((system: ScoreSystem) => void) | undefined;
  readonly onOctaveUpSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onOctaveDownSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onResetPerformanceSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onSetArticulationSystem?: ((system: ScoreSystem, articulation: PianoArticulation) => void) | undefined;
  readonly onApplyMelodyContourSystem?: ((system: ScoreSystem, recipe: ChordMelodyRecipe) => void) | undefined;
  readonly onClearMelodySystem?: ((system: ScoreSystem) => void) | undefined;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [matrixGapHint, setMatrixGapHint] = useState<number | null>(null);
  const [melodyMenu, setMelodyMenu] = useState<{
    readonly stepId: string;
    readonly position: MelodyMenuPosition;
    readonly invoker: HTMLElement;
  } | null>(null);
  const [melodyEditorStepId, setMelodyEditorStepId] = useState<string | null>(null);
  const melodyInvokerRef = useRef<HTMLElement | null>(null);
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
  const hasMelodyRecipe = project.progression.steps.some(
    (step) => step.kind === "chord" && step.melody !== undefined,
  );
  const melodyTimeline = useMemo(
    () => (hasMelodyRecipe ? createMelodyTimeline(project) : null),
    [hasMelodyRecipe, project],
  );

  const openMelodyMenu = (stepId: string, anchor: HTMLElement, position?: MelodyMenuPosition) => {
    const step = project.progression.steps.find(
      (candidate) => candidate.id === stepId && candidate.kind === "chord",
    );
    if (!step || step.kind !== "chord") return;
    const rect = anchor.getBoundingClientRect();
    melodyInvokerRef.current = anchor;
    if (project.progression.selectedStepId !== stepId) onSelectStep(stepId);
    setMelodyMenu({
      stepId,
      invoker: anchor,
      position: position ?? { x: rect.left, y: rect.bottom },
    });
  };

  const openMelodyMenuFromEvent = (
    stepId: string,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) => {
    if ("clientX" in event) {
      event.preventDefault();
      event.stopPropagation();
      openMelodyMenu(stepId, event.currentTarget, {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openMelodyMenu(stepId, event.currentTarget, { x: rect.left, y: rect.bottom });
  };

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
    onFocusMatrix?.(measureNumber);
    setMatrixGapHint(measureNumber);
  };

  const handleProgressionViewChange = (view: ProgressionView) => {
    onSetProgressionView(view);
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
      const isChordFragment = fragment.step.kind === "chord";
      return (
        <div
          key={`${fragment.stepId}-continuation-${fragment.fragmentIndex}`}
          className="progression-step-continuation measure-step-segment"
          style={segmentStyle(fragment.durationBeats, layout.barLengthBeats)}
          data-testid="progression-step-continuation"
          onClick={() => onSelectStep(fragment.stepId)}
          onContextMenu={
            isChordFragment && onSetMelodyRecipe
              ? (event) => openMelodyMenuFromEvent(fragment.stepId, event)
              : undefined
          }
          role="button"
          tabIndex={0}
          aria-haspopup={isChordFragment && onSetMelodyRecipe ? "menu" : undefined}
          aria-label={`Continuation of progression step ${fragment.stepIndex + 1} in measure ${measureNumber}, ${formatMusicalDuration(musicalDuration(fragment.durationBeats))}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectStep(fragment.stepId);
            }
            if (
              isChordFragment &&
              onSetMelodyRecipe &&
              (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
            ) {
              openMelodyMenuFromEvent(fragment.stepId, event);
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
          view={project.presentation.progressionView}
          compactStaff={compactStaff}
          selected={isSelected}
          playing={isPlaying}
          inLoop={isInLoop}
          showBassInStaff={project.presentation.showBassInStaff}
          onSelect={() => onSelectStep(step.id)}
          onPerformanceChange={(performance) => onEditPerformance(step.id, performance)}
          onRemove={() => onRemove(step.id)}
          {...(onSetMelodyRecipe
            ? {
                onOpenMelodyMenu: (anchor: HTMLElement, position?: MelodyMenuPosition) =>
                  openMelodyMenu(step.id, anchor, position),
              }
            : {})}
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

  const usesStaffSystems = project.presentation.progressionView === "staff";
  const renderMeasureCard = (measure: (typeof layout.measures)[number]) => {
    const isSelectedMeasure = measure.items.some(
      (item) => item.kind !== "gap" && item.stepId === selectedStepId,
    );
    return (
      <section
        key={measure.measureIndex}
        className={`progression-measure-card ${usesStaffSystems ? "has-shared-staff" : ""} ${isSelectedMeasure ? "has-selected-step" : ""}`}
        data-testid="progression-measure"
        data-measure-index={measure.measureIndex}
        data-has-selected-step={isSelectedMeasure ? "true" : undefined}
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
        <div className="progression-measure-grid" data-testid="progression-measure-grid">
          {measure.items.map((item: ProgressionMeasureItem, itemIndex) => (
            <div
              key={
                item.kind === "gap" ? `gap-${itemIndex}` : `${item.stepId}-${item.fragmentIndex}`
              }
              className="measure-item-wrapper"
            >
              {item.kind === "gap"
                ? renderGap(measure.number, item.durationBeats)
                : renderFragment(item, measure.number, usesStaffSystems)}
            </div>
          ))}
        </div>
      </section>
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
            value={project.presentation.progressionView}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              handleProgressionViewChange(event.target.value as ProgressionView)
            }
          >
            <option value="harmonic">Harmonic</option>
            <option value="piano">Piano</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        {usesStaffSystems && onSetMeasuresPerSystem ? (
          <label>
            Measures / system
            <select
              aria-label="Measures Layout"
              aria-describedby={
                project.presentation.measuresPerSystem === "auto"
                  ? "progression-measures-layout-description"
                  : undefined
              }
              value={String(project.presentation.measuresPerSystem)}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const value = event.target.value;
                onSetMeasuresPerSystem(
                  value === "auto" ? "auto" : (Number(value) as MeasuresPerSystem),
                );
              }}
            >
              <option value="auto">Auto (Responsive)</option>
              <option value="4">4 Measures / System</option>
              <option value="3">3 Measures / System</option>
              <option value="2">2 Measures / System</option>
              <option value="1">1 Measure / System (Full)</option>
            </select>
          </label>
        ) : null}
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
      <div
        className="progression-step-cards"
        data-view={project.presentation.progressionView}
        data-layout={String(project.presentation.measuresPerSystem)}
        onClick={handleBackgroundClick}
      >
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
        {usesStaffSystems ? (
          <>
            <ScoreSystemView
              project={project}
              layout={layout}
              melodyTimeline={melodyTimeline}
              measuresPerSystem={project.presentation.measuresPerSystem}
              selectedStepId={selectedStepId}
              playingStepId={currentPlayingStepId}
              activeMelodyEventKey={activeMelodyEventKey}
              measureItemsForMeasure={staffItemsForMeasure}
              onSelectStep={onSelectStep}
              onEditPerformance={onEditPerformance}
              onReorder={onReorder}
              {...(onSetMelodyRecipe ? { onOpenMelodyMenu: openMelodyMenu } : {})}
              {...(onFocusMatrix ? { onFocusMatrix: focusMatrixForGap } : {})}
              {...(onFillGapWithRest ? { onFillGapWithRest } : {})}
              {...(onExtendFinalChord ? { onExtendFinalChord } : {})}
              {...(onRepeatFinalChord ? { onRepeatFinalChord } : {})}
              {...(onDuplicateSystem ? { onDuplicateSystem } : {})}
              {...(onDeleteSystem ? { onDeleteSystem } : {})}
              {...(isSystemLooping ? { isSystemLooping } : {})}
              {...(isSystemMuted ? { isSystemMuted } : {})}
              {...(isSystemSolo ? { isSystemSolo } : {})}
              {...(canPasteSystem !== undefined ? { canPasteSystem } : {})}
              {...(onPlayFromSystem ? { onPlayFromSystem } : {})}
              {...(onToggleLoopSystem ? { onToggleLoopSystem } : {})}
              {...(onToggleMuteSystem ? { onToggleMuteSystem } : {})}
              {...(onToggleSoloSystem ? { onToggleSoloSystem } : {})}
              {...(onMoveSystemUp ? { onMoveSystemUp } : {})}
              {...(onMoveSystemDown ? { onMoveSystemDown } : {})}
              {...(onCopySystem ? { onCopySystem } : {})}
              {...(onPasteSystemAfter ? { onPasteSystemAfter } : {})}
              {...(onInsertEmptySystemAfter ? { onInsertEmptySystemAfter } : {})}
              {...(onOctaveUpSystem ? { onOctaveUpSystem } : {})}
              {...(onOctaveDownSystem ? { onOctaveDownSystem } : {})}
              {...(onResetPerformanceSystem ? { onResetPerformanceSystem } : {})}
              {...(onSetArticulationSystem ? { onSetArticulationSystem } : {})}
              {...(onApplyMelodyContourSystem ? { onApplyMelodyContourSystem } : {})}
              {...(onClearMelodySystem ? { onClearMelodySystem } : {})}
            />
          </>
        ) : (
          layout.measures.map(renderMeasureCard)
        )}
      </div>
      {melodyMenu
        ? (() => {
            const step = project.progression.steps.find(
              (candidate) => candidate.id === melodyMenu.stepId && candidate.kind === "chord",
            );
            if (!step || step.kind !== "chord") return null;
            return (
              <MelodyContextMenu
                step={step}
                position={melodyMenu.position}
                invoker={melodyMenu.invoker}
                tonic={project.tonic}
                onCreate={() => {
                  setMelodyMenu(null);
                  setMelodyEditorStepId(step.id);
                }}
                onEdit={() => {
                  setMelodyMenu(null);
                  setMelodyEditorStepId(step.id);
                }}
                onRemove={() => {
                  onRemoveMelodyRecipe?.(step.id);
                  setMelodyMenu(null);
                }}
                onClose={() => {
                  setMelodyMenu(null);
                  restoreSelectedStepFocus(step.id);
                }}
              />
            );
          })()
        : null}
      {melodyEditorStepId && onSetMelodyRecipe
        ? (() => {
            const step = project.progression.steps.find(
              (candidate) => candidate.id === melodyEditorStepId && candidate.kind === "chord",
            );
            if (!step || step.kind !== "chord") return null;
            return (
              <MelodyEditorDialog
                isOpen
                mode={step.melody ? "edit" : "create"}
                step={step}
                project={project}
                restoreFocusRef={melodyInvokerRef}
                onClose={() => setMelodyEditorStepId(null)}
                onApply={(recipe, instrument) => {
                  onSetMelodyRecipe(step.id, recipe, instrument);
                  setMelodyEditorStepId(null);
                }}
                {...(onPlayMelodyPreview ? { onPlayPreview: onPlayMelodyPreview } : {})}
                {...(onStopMelodyPreview ? { onStopPreview: onStopMelodyPreview } : {})}
                {...(isMelodyPreviewPlaying !== undefined
                  ? { isPreviewPlaying: isMelodyPreviewPlaying }
                  : {})}
                {...(melodyAudioState ? { providerState: melodyAudioState } : {})}
                {...(melodyAudioError !== undefined ? { providerError: melodyAudioError } : {})}
                {...(onRetryMelodyAudio ? { onRetryAudio: onRetryMelodyAudio } : {})}
              />
            );
          })()
        : null}
    </div>
  );
}
