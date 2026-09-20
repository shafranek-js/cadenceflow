import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ExactPitch } from "../../domain/harmony/pitch";
import type { ChordStep, PianoArticulation, StepPerformance } from "../../domain/progression/step";
import type { MelodyGrid, MelodyPitchMotion } from "../../domain/melody/types";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import {
  pitchToGuitarTabPosition,
  resolveGuitarTabEntry,
  optimizeGuitarMelodyTab,
  type GuitarMelodyInputNote,
  type GuitarTabPosition,
} from "../../domain/instruments/guitar/tablature";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { Project } from "../../domain/project/project";
import { formatMusicalDuration, musicalDuration } from "../../domain/timing/duration";
import type {
  ProgressionMeasure,
  ProgressionMeasureLayout,
} from "../../domain/timing/measureLayout";
import { rationalToNumber } from "../../domain/timing/rational";
import {
  projectScoreSystems,
  type ScoreSystem,
  type ScoreSystemAttack,
} from "../../notation/scoreSystemProjection";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import {
  renderStaffSystem,
  type StaffSequenceEntry,
  type StaffSystemMeasureInput,
  type StaffSystemPosition,
} from "../../notation/vexflowAdapter";
import type {
  MelodyInstrumentLane,
  MelodyStaffEntry,
  MelodyStaffMeasure,
  MelodyTimeline,
} from "../../notation/melodyStaffProjection";
import { Icon } from "../common/Icon";
import type { MelodyMenuPosition } from "../melody/MelodyContextMenu";
import { melodyInstrumentLabel } from "../melody/labels";
import type { MeasureStaffItem } from "./MeasureStaffView";
import { performanceOctaveShiftPatch } from "./staffOctave";
import { ScoreSystemContextMenu, type ScoreSystemMenuPosition } from "./ScoreSystemContextMenu";
import { GuitarHandLegendModal, type TabFingeringStyle } from "../guitar/GuitarHandLegendModal";

const DEFAULT_SCORE_WIDTH_PX = 960;
const SCORE_STAFF_HEIGHT_PX = 160;
const SCORE_STAFF_GAP_PX = 18;
const SCORE_LABEL_BAND_PX = 32;
const MELODY_NOTE_ANNOTATION_ROW_GAP_PX = 31;
const MELODY_NOTE_ANNOTATION_MIN_GAP_PX = 36;

function formatPitch(pitch: ExactPitch): string {
  return `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`;
}

function exact(value: { readonly numerator: number; readonly denominator: number }): string {
  return `${value.numerator}/${value.denominator}`;
}

function positionKey(staff: StaffSystemPosition["staff"], key: string): string {
  return `${staff}:${key}`;
}

function positionRecord(
  positions: readonly StaffSystemPosition[],
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(
      positions.map((position) => [positionKey(position.staff, position.key), position.ratio]),
    ),
  );
}

function sourceChordLabel(project: Project, stepId: string): string {
  const step = project.progression.steps.find(
    (candidate) => candidate.id === stepId && candidate.kind === "chord",
  );
  if (!step || step.kind !== "chord") return stepId;
  const chord = {
    ...realizeChord(step.harmonicFunction, project.tonic),
    variant: step.harmonicVariant,
  };
  return formatChordSymbol(
    withEffectiveBass(chord, realizeProgressionStepRealization(step, project.tonic).bassPitch),
  );
}

function harmonySequenceEntry(
  item: MeasureStaffItem,
  playingStepId: string | undefined,
  isTablature = false,
  project?: Project,
): StaffSequenceEntry {
  if (item.kind === "gap") {
    return {
      key: item.key,
      kind: "gap",
      duration: item.duration,
      startOffsetBeats: item.startOffsetBeats,
    };
  }
  if (item.kind === "rest") {
    return {
      key: item.key,
      kind: "rest",
      duration: item.duration,
      startOffsetBeats: item.startOffsetBeats,
    };
  }
  let tabPositions:
    | readonly { readonly str: number; readonly fret: number; readonly finger?: number }[]
    | undefined;
  if (isTablature && project) {
    const step = project.progression.steps.find(
      (candidate) => candidate.id === item.stepId && candidate.kind === "chord",
    );
    if (step && step.kind === "chord") {
      const chord = {
        ...realizeChord(step.harmonicFunction, project.tonic),
        variant: step.harmonicVariant,
      };
      const tabEntry = resolveGuitarTabEntry(withEffectiveBass(chord, item.bassPitch), item.label);
      tabPositions = tabEntry.strings
        .filter((s) => s.fret >= 0)
        .map((s) => ({
          str: s.stringNumber,
          fret: s.fret,
          ...(typeof s.finger === "number" ? { finger: s.finger } : {}),
        }));
    }
  }
  return {
    key: item.key,
    kind: "chord",
    projection: projectPitchesToStaff(item.pitches),
    ...(item.bassPitch ? { bassProjection: projectPitchesToStaff([item.bassPitch]) } : {}),
    ...(tabPositions ? { tabPositions } : {}),
    duration: item.duration,
    startOffsetBeats: item.startOffsetBeats,
    continuesFromPrevious: item.continuesFromPrevious,
    continuesToNext: item.continuesToNext,
    ...(item.stepId === playingStepId ? { highlighted: true } : {}),
  };
}

function melodySequenceEntry(
  entry: MelodyStaffEntry,
  activeMelodyEventKey: string | null | undefined,
  isTablature = false,
  customTabPosition?: GuitarTabPosition,
): StaffSequenceEntry {
  if (entry.kind === "rest") {
    return {
      key: entry.key,
      kind: "rest",
      duration: musicalDuration(entry.durationBeats),
      startOffsetBeats: entry.startOffsetBeats,
    };
  }
  const tabPositions = isTablature
    ? [customTabPosition ?? pitchToGuitarTabPosition(entry.pitch, "melody")]
    : undefined;
  return {
    key: entry.key,
    kind: "note",
    projection: projectPitchesToStaff([entry.pitch]),
    ...(tabPositions ? { tabPositions } : {}),
    duration: musicalDuration(entry.durationBeats),
    startOffsetBeats: entry.startOffsetBeats,
    continuesFromPrevious: entry.continuesFromPrevious,
    continuesToNext: entry.continuesToNext,
    ...(entry.eventKey === activeMelodyEventKey ? { highlighted: true } : {}),
  };
}

function scoreSystemHeight(melodyLaneCount: number, showBass: boolean): number {
  const rows = melodyLaneCount + 1 + Number(showBass);
  return rows * SCORE_STAFF_HEIGHT_PX + Math.max(0, rows - 1) * SCORE_STAFF_GAP_PX;
}

function systemMeasureRatio(
  system: ScoreSystem,
  displayWidthPx: number,
  measureIndex: number,
  startOffsetBeats: { readonly numerator: number; readonly denominator: number },
  barLengthBeats: number,
  showBass: boolean,
): number {
  const connectorInset = showBass ? 14 : 0;
  const systemWidth = Math.max(displayWidthPx, 1);
  const scale = Math.max(systemWidth - connectorInset, 1) / Math.max(system.requiredWidthPx, 1);
  const measurePosition = system.measures.findIndex(
    (measure) => measure.measureIndex === measureIndex,
  );
  if (measurePosition < 0) return 0;
  const measureStart = system.measures
    .slice(0, measurePosition)
    .reduce((sum, measure) => sum + measure.requiredWidthPx, 0);
  const measure = system.measures[measurePosition]!;
  const measureStartPx = connectorInset + measureStart * scale;
  const measureWidthPx = measure.requiredWidthPx * scale;
  const leftPadding = measurePosition === 0 ? (system.index === 0 ? 84 : 54) : 24;
  const rightPadding = 24;
  const usableWidth = Math.max(measureWidthPx - leftPadding - rightPadding, 1);
  const onsetRatio = Math.min(Math.max(rationalToNumber(startOffsetBeats) / barLengthBeats, 0), 1);
  return (measureStartPx + leftPadding + onsetRatio * usableWidth) / systemWidth;
}

function systemMeasureSpan(
  system: ScoreSystem,
  displayWidthPx: number,
  measureIndex: number,
  durationRatio: number,
  showBass: boolean,
): number {
  const measure = system.measures.find((candidate) => candidate.measureIndex === measureIndex);
  const connectorInset = showBass ? 14 : 0;
  const scale = Math.max(displayWidthPx - connectorInset, 1) / Math.max(system.requiredWidthPx, 1);
  return (((measure?.requiredWidthPx ?? 0) * scale) / Math.max(displayWidthPx, 1)) * durationRatio;
}

function melodyEventRatio(
  system: ScoreSystem,
  displayWidthPx: number,
  projectedMeasure: ScoreSystem["measures"][number],
  entry: MelodyStaffEntry,
  laneId: string,
  renderedPositions: Readonly<Record<string, number>>,
  barLengthBeats: number,
  showBass: boolean,
): number {
  return (
    renderedPositions[positionKey(`melody:${laneId}`, entry.key)] ??
    systemMeasureRatio(
      system,
      displayWidthPx,
      projectedMeasure.measureIndex,
      entry.startOffsetBeats,
      barLengthBeats,
      showBass,
    )
  );
}

function melodyAnnotationRows(
  system: ScoreSystem,
  melodyLanes: readonly MelodyInstrumentLane[],
  displayWidthPx: number,
  renderedPositions: Readonly<Record<string, number>>,
  barLengthBeats: number,
  showBass: boolean,
): Readonly<Record<string, number>> {
  const lastXByRow: number[] = [];
  const rows: Record<string, number> = {};
  melodyLanes.forEach((lane) => {
    system.measures.forEach((projectedMeasure) => {
      const measure = lane.measures[projectedMeasure.measureIndex];
      measure?.entries.forEach((entry) => {
        if (entry.kind !== "note") return;
        const xRatio = melodyEventRatio(
          system,
          displayWidthPx,
          projectedMeasure,
          entry,
          lane.instrumentId,
          renderedPositions,
          barLengthBeats,
          showBass,
        );
        const x = Math.min(Math.max(xRatio, 0), 1) * displayWidthPx;
        let row = lastXByRow.findIndex((lastX) => x - lastX >= MELODY_NOTE_ANNOTATION_MIN_GAP_PX);
        if (row < 0) {
          row = lastXByRow.length;
          lastXByRow.push(x);
        } else {
          lastXByRow[row] = x;
        }
        rows[`${lane.instrumentId}-${projectedMeasure.measureIndex}-${entry.key}`] = row;
      });
    });
  });
  return Object.freeze(rows);
}

interface ScoreSystemCanvasProps {
  readonly project: Project;
  readonly layout: ProgressionMeasureLayout;
  readonly system: ScoreSystem;
  readonly displayWidthPx: number;
  readonly melodyTimeline: MelodyTimeline | null;
  readonly measureItems: Readonly<Record<number, readonly MeasureStaffItem[]>>;
  readonly selectedStepId: string | undefined;
  readonly playingStepId: string | undefined;
  readonly activeMelodyEventKey: string | null | undefined;
  readonly activeEventStartedAt?: number | null | undefined;
  readonly onSelectStep: (stepId: string) => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: MelodyMenuPosition,
  ) => void;
  readonly onFocusMatrix?: (measureNumber: number) => void;
  readonly onFillGapWithRest?: () => void;
  readonly onExtendFinalChord?: () => void;
  readonly onRepeatFinalChord?: () => void;
  readonly onDuplicateSystem?: (system: ScoreSystem) => void;
  readonly onDeleteSystem?: (system: ScoreSystem) => void;
  readonly totalSystems?: number | undefined;
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
  readonly onInsertRestAfterSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onExploreAlternativeFromSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onOctaveUpSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onOctaveDownSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onResetPerformanceSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onSetArticulationSystem?:
    ((system: ScoreSystem, articulation: PianoArticulation) => void) | undefined;
  readonly onApplyMelodyContourSystem?:
    ((system: ScoreSystem, motion: MelodyPitchMotion) => void) | undefined;
  readonly onSetMelodyGridSystem?: ((system: ScoreSystem, grid: MelodyGrid) => void) | undefined;
  readonly onClearMelodySystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onToggleSuzukiColors?: (() => void) | undefined;
  readonly showFingering?: boolean | undefined;
  readonly onToggleFingering?: (() => void) | undefined;
  readonly fingeringStyle?: TabFingeringStyle | undefined;
  readonly onOpenHandLegend?: (() => void) | undefined;
  readonly renderMeasureContent?: ((measure: ProgressionMeasure) => ReactNode) | undefined;
}

function ScoreSystemPlayhead({
  startX,
  endX,
  durationMs,
  eventKey,
  topPx,
  heightPx,
  systemIndex,
  startedAt,
}: {
  startX: number;
  endX: number;
  durationMs: number;
  eventKey: string;
  topPx: number;
  heightPx: number;
  systemIndex: number;
  startedAt?: number | null | undefined;
}) {
  const lineRef = useRef<HTMLDivElement | null>(null);
  const currentXRef = useRef<number | null>(null);

  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;

    let frameId: number;
    const now = performance.now();
    // Anchor playback animation to the audio clock onset timestamp when available.
    // If startedAt was recorded when the event triggered in WebAudio, effectiveStartTime accounts
    // for any polling or React rendering latency so the playhead arrives on each notehead exactly
    // as the audio sounds without accumulating drift.
    const effectiveStartTime =
      typeof startedAt === "number" && startedAt > 0 && startedAt <= now ? startedAt : now;

    const span = endX - startX;
    // Allow extrapolation forward for up to 300ms while waiting for the next step update
    const maxElapsed = durationMs + 300;

    const tick = (frameNow: number) => {
      const elapsed = frameNow - effectiveStartTime;
      if (elapsed > maxElapsed) {
        // Playback likely paused or stopped; clamp at endX
        currentXRef.current = endX;
        el.style.transform = `translateX(${endX}px)`;
        return;
      }

      const progress = durationMs > 0 ? Math.min(Math.max(elapsed / durationMs, 0), 1.3) : 1;
      const currentX = startX + span * progress;
      currentXRef.current = currentX;
      el.style.transform = `translateX(${currentX}px)`;

      frameId = requestAnimationFrame(tick);
    };

    tick(now);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [startX, endX, durationMs, eventKey, startedAt]);

  return (
    <div
      ref={lineRef}
      className="score-system-playhead"
      data-testid={`score-system-playhead-${systemIndex}`}
      style={{
        position: "absolute",
        left: 0,
        top: `${topPx}px`,
        height: `${heightPx}px`,
        willChange: "transform",
      }}
    >
      <div className="score-system-playhead-cap" />
      <div className="score-system-playhead-line" />
    </div>
  );
}

function ScoreSystemCanvas({
  project,
  layout,
  system,
  displayWidthPx,
  melodyTimeline,
  measureItems,
  selectedStepId,
  playingStepId,
  activeMelodyEventKey,
  activeEventStartedAt,
  onSelectStep,
  onEditPerformance,
  onReorder,
  onOpenMelodyMenu,
  onFocusMatrix,
  onFillGapWithRest,
  onExtendFinalChord,
  onRepeatFinalChord,
  onDuplicateSystem,
  onDeleteSystem,
  totalSystems = 1,
  isSystemLooping,
  isSystemMuted,
  isSystemSolo,
  canPasteSystem = false,
  onPlayFromSystem,
  onToggleLoopSystem,
  onToggleMuteSystem,
  onToggleSoloSystem,
  onMoveSystemUp,
  onMoveSystemDown,
  onCopySystem,
  onPasteSystemAfter,
  onInsertEmptySystemAfter,
  onInsertRestAfterSystem,
  onExploreAlternativeFromSystem,
  onOctaveUpSystem,
  onOctaveDownSystem,
  onResetPerformanceSystem,
  onSetArticulationSystem,
  onApplyMelodyContourSystem,
  onSetMelodyGridSystem,
  onClearMelodySystem,
  onToggleSuzukiColors,
  showFingering,
  onToggleFingering,
  fingeringStyle,
  onOpenHandLegend,
  renderMeasureContent,
}: ScoreSystemCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [localShowFingering, setLocalShowFingering] = useState(true);
  const effectiveShowFingering = showFingering ?? localShowFingering;
  const handleToggleFingering = onToggleFingering ?? (() => setLocalShowFingering((v) => !v));
  const [renderedPositions, setRenderedPositions] = useState<Readonly<Record<string, number>>>({});
  const [systemMenu, setSystemMenu] = useState<{
    readonly anchor: HTMLElement;
    readonly position: ScoreSystemMenuPosition;
  } | null>(null);

  const systemStepIndices = useMemo(() => {
    const indices = new Set<number>();
    for (const sm of system.measures) {
      for (const frag of sm.measure.fragments) {
        indices.add(frag.stepIndex);
      }
    }
    return indices;
  }, [system.measures]);

  const chordSteps = useMemo<readonly ChordStep[]>(() => {
    return Array.from(systemStepIndices)
      .map((idx) => project.progression.steps[idx])
      .filter((s): s is ChordStep => Boolean(s && s.kind === "chord"));
  }, [systemStepIndices, project.progression.steps]);

  const melodySteps = chordSteps.filter((s) => s.melody !== undefined);
  const systemHasMelody = melodySteps.length > 0;
  const currentGrid =
    melodySteps.length > 0 &&
    melodySteps.every((s) => s.melody?.grid === melodySteps[0]?.melody?.grid)
      ? melodySteps[0]?.melody?.grid
      : undefined;
  const currentPitchMotion =
    melodySteps.length > 0 &&
    melodySteps.every((s) => {
      const motion =
        s.melody?.pitchMotion ??
        (s.melody as unknown as { readonly pattern?: MelodyPitchMotion })?.pattern;
      const firstMotion =
        melodySteps[0]?.melody?.pitchMotion ??
        (melodySteps[0]?.melody as unknown as { readonly pattern?: MelodyPitchMotion })?.pattern;
      return motion === firstMotion;
    })
      ? (melodySteps[0]?.melody?.pitchMotion ??
        (melodySteps[0]?.melody as unknown as { readonly pattern?: MelodyPitchMotion })?.pattern)
      : undefined;
  const canShiftOctaveUp = chordSteps.some(
    (s) => performanceOctaveShiftPatch(s.performance, 1) !== null,
  );
  const canShiftOctaveDown = chordSteps.some(
    (s) => performanceOctaveShiftPatch(s.performance, -1) !== null,
  );

  const isLooping = isSystemLooping ? isSystemLooping(system) : false;
  const isMuted = isSystemMuted ? isSystemMuted(system) : false;
  const isSolo = isSystemSolo ? isSystemSolo(system) : false;

  const systemMelodyLanes = useMemo(
    () =>
      melodyTimeline?.lanes.filter((lane) =>
        system.measures.some((measure) =>
          lane.measures[measure.measureIndex]?.entries.some((entry) => entry.kind === "note"),
        ),
      ) ?? [],
    [melodyTimeline, system.measures],
  );
  const isTablature = project.presentation.progressionView === "tablature";
  const isNotationView = project.presentation.progressionView === "staff" || isTablature;
  const showBass = isTablature ? false : project.presentation.showBassInStaff;
  const suzukiColors = project.presentation.suzukiColors ?? false;

  const optimizedMelodyTabPositions = useMemo(() => {
    if (!isTablature || !isNotationView) return new Map<string, GuitarTabPosition>();

    const chordBaseFretByMeasure = new Map<number, number>();
    for (const projectedMeasure of system.measures) {
      const items = measureItems[projectedMeasure.measureIndex] ?? [];
      for (const item of items) {
        if (item.kind === "chord") {
          const step = project.progression.steps.find(
            (c) => c.id === item.stepId && c.kind === "chord",
          );
          if (step && step.kind === "chord") {
            const chord = {
              ...realizeChord(step.harmonicFunction, project.tonic),
              variant: step.harmonicVariant,
            };
            const bassPc = item.bassPitch?.pitchClassIdentity;
            const tabEntry = resolveGuitarTabEntry(chord, item.label, bassPc);
            chordBaseFretByMeasure.set(projectedMeasure.measureIndex, tabEntry.baseFret);
            break;
          }
        }
      }
    }

    const melodyNotes: GuitarMelodyInputNote[] = [];
    for (const lane of systemMelodyLanes) {
      for (const projectedMeasure of system.measures) {
        const laneMeasure = lane.measures[projectedMeasure.measureIndex];
        if (!laneMeasure) continue;
        for (const entry of laneMeasure.entries) {
          if (entry.kind === "note") {
            melodyNotes.push({
              key: entry.key,
              pitch: entry.pitch,
              startOffsetBeats: rationalToNumber(entry.startBeats),
              durationBeats: rationalToNumber(entry.durationBeats),
              measureIndex: projectedMeasure.measureIndex,
            });
          }
        }
      }
    }

    if (melodyNotes.length === 0) return new Map<string, GuitarTabPosition>();

    melodyNotes.sort((a, b) => (a.startOffsetBeats ?? 0) - (b.startOffsetBeats ?? 0));
    const optimizedPositions = optimizeGuitarMelodyTab(melodyNotes, chordBaseFretByMeasure);
    const result = new Map<string, GuitarTabPosition>();
    for (let i = 0; i < melodyNotes.length; i++) {
      const note = melodyNotes[i]!;
      const pos = optimizedPositions[i];
      if (pos) {
        result.set(note.key, pos);
      }
    }
    return result;
  }, [isTablature, system.measures, measureItems, project, systemMelodyLanes]);

  const inputs = useMemo<readonly StaffSystemMeasureInput[]>(() => {
    if (!isNotationView) return [];
    return system.measures.map((measure) => {
      const harmonyEntries = (measureItems[measure.measureIndex] ?? []).map((item) =>
        harmonySequenceEntry(item, playingStepId, isTablature, project),
      );
      const melodyLanes = systemMelodyLanes.map((lane) => ({
        id: lane.instrumentId,
        clef: lane.clef,
        entries: (lane.measures[measure.measureIndex]?.entries ?? []).map((entry) =>
          melodySequenceEntry(
            entry,
            activeMelodyEventKey,
            isTablature,
            entry.kind === "note" ? optimizedMelodyTabPositions.get(entry.key) : undefined,
          ),
        ),
      }));
      return {
        measureIndex: measure.measureIndex,
        widthPx: measure.requiredWidthPx,
        harmonyEntries,
        ...(melodyLanes.length > 0 ? { melodyLanes } : {}),
        ...(melodyLanes[0]?.entries ? { melodyEntries: melodyLanes[0].entries } : {}),
      };
    });
  }, [
    activeMelodyEventKey,
    isNotationView,
    isTablature,
    measureItems,
    optimizedMelodyTabPositions,
    playingStepId,
    project,
    system.measures,
    systemMelodyLanes,
  ]);

  useEffect(() => {
    if (!isNotationView) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cleanup: () => void = () => undefined;
    cleanup = renderStaffSystem(
      canvas,
      inputs,
      project.globalTiming.meter,
      (positions) => {
        const next = positionRecord(positions);
        setRenderedPositions((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next,
        );
      },
      {
        widthPx: displayWidthPx,
        showBass,
        showTimeSignature: system.index === 0,
        suzukiColors,
        isTablature,
        showFingering: effectiveShowFingering,
        fingeringStyle,
      },
    );
    return () => {
      cleanup();
    };
  }, [
    displayWidthPx,
    effectiveShowFingering,
    fingeringStyle,
    inputs,
    isTablature,
    project.globalTiming.meter,
    showBass,
    suzukiColors,
    system.index,
  ]);

  const barLengthBeats = rationalToNumber(layout.barLengthBeats);
  const systemHeight = scoreSystemHeight(systemMelodyLanes.length, showBass);
  const melodyRows = melodyAnnotationRows(
    system,
    systemMelodyLanes,
    displayWidthPx,
    renderedPositions,
    barLengthBeats,
    showBass,
  );
  const harmonyAnnotations = system.measures.flatMap((projectedMeasure) =>
    (measureItems[projectedMeasure.measureIndex] ?? [])
      .filter((item): item is Exclude<MeasureStaffItem, { kind: "gap" }> => item.kind !== "gap")
      .map((item) => ({ projectedMeasure, item })),
  );
  const gapAnnotations = system.measures.flatMap((projectedMeasure) =>
    (measureItems[projectedMeasure.measureIndex] ?? [])
      .filter((item): item is Extract<MeasureStaffItem, { kind: "gap" }> => item.kind === "gap")
      .map((item) => ({ projectedMeasure, item })),
  );
  const canRepeatOrExtend = project.progression.steps.at(-1)?.kind === "chord";

  const activeMeasureAndPlayhead = useMemo(() => {
    if (!isNotationView) return null;
    const isPlaying = Boolean(playingStepId || activeMelodyEventKey);
    if (!isPlaying) return null;

    const tempoBpm = project.globalTiming.tempoBpm || 120;
    const msPerBeat = 60000 / tempoBpm;

    const connectorInset = showBass ? 14 : 0;
    const systemWidth = Math.max(displayWidthPx, 1);
    const scale = Math.max(systemWidth - connectorInset, 1) / Math.max(system.requiredWidthPx, 1);

    const getMeasureEndPx = (measureIdx: number): number => {
      const measurePos = system.measures.findIndex((m) => m.measureIndex === measureIdx);
      if (measurePos < 0) return displayWidthPx;
      const startPx =
        connectorInset +
        system.measures.slice(0, measurePos).reduce((sum, m) => sum + m.requiredWidthPx, 0) * scale;
      return startPx + system.measures[measurePos]!.requiredWidthPx * scale;
    };

    let activeMeasureIndex: number | null = null;
    let startX = 0;
    let endX = 0;
    let durationMs = 0;
    let activeEventKey = "";

    // 1. Check if an active melody note is playing in this system
    if (activeMelodyEventKey) {
      for (const lane of systemMelodyLanes) {
        const laneEntries: {
          readonly entry: MelodyStaffEntry;
          readonly measureIndex: number;
          readonly startX: number;
        }[] = [];

        for (const projectedMeasure of system.measures) {
          const laneMeasure = lane.measures[projectedMeasure.measureIndex];
          if (!laneMeasure) continue;
          for (const entry of laneMeasure.entries) {
            const startRatio =
              renderedPositions[positionKey(`melody:${lane.instrumentId}`, entry.key)] ??
              melodyEventRatio(
                system,
                displayWidthPx,
                projectedMeasure,
                entry,
                lane.instrumentId,
                renderedPositions,
                barLengthBeats,
                showBass,
              );
            laneEntries.push({
              entry,
              measureIndex: projectedMeasure.measureIndex,
              startX: startRatio * displayWidthPx,
            });
          }
        }

        const matchIndex = laneEntries.findIndex(
          (item) => item.entry.kind === "note" && item.entry.eventKey === activeMelodyEventKey,
        );

        if (matchIndex >= 0) {
          const currentItem = laneEntries[matchIndex]!;
          activeMeasureIndex = currentItem.measureIndex;
          startX = currentItem.startX;
          durationMs = Math.max(rationalToNumber(currentItem.entry.durationBeats) * msPerBeat, 50);
          activeEventKey = `melody-${lane.instrumentId}-${currentItem.entry.key}`;

          if (matchIndex + 1 < laneEntries.length) {
            endX = laneEntries[matchIndex + 1]!.startX;
          } else {
            endX = getMeasureEndPx(currentItem.measureIndex);
          }
          endX = Math.max(endX, startX + 4);
          break;
        }
      }
    }

    // 2. If not found in melody, check harmony (chord or rest)
    if (activeMeasureIndex === null && playingStepId) {
      const allHarmonyItems: {
        readonly item: MeasureStaffItem;
        readonly measureIndex: number;
        readonly startX: number;
      }[] = [];

      for (const projectedMeasure of system.measures) {
        const items = measureItems[projectedMeasure.measureIndex] ?? [];
        for (const item of items) {
          const startRatio =
            renderedPositions[positionKey("harmony", item.key)] ??
            systemMeasureRatio(
              system,
              displayWidthPx,
              projectedMeasure.measureIndex,
              item.startOffsetBeats,
              barLengthBeats,
              showBass,
            );
          allHarmonyItems.push({
            item,
            measureIndex: projectedMeasure.measureIndex,
            startX: startRatio * displayWidthPx,
          });
        }
      }

      const matchingIndices: number[] = [];
      allHarmonyItems.forEach((candidate, idx) => {
        if (candidate.item.kind !== "gap" && candidate.item.stepId === playingStepId) {
          matchingIndices.push(idx);
        }
      });

      if (matchingIndices.length > 0) {
        const firstIndex = matchingIndices[0]!;
        const lastIndex = matchingIndices[matchingIndices.length - 1]!;
        const firstItem = allHarmonyItems[firstIndex]!;
        const lastItem = allHarmonyItems[lastIndex]!;

        activeMeasureIndex = firstItem.measureIndex;
        startX = firstItem.startX;

        if (lastIndex + 1 < allHarmonyItems.length) {
          endX = allHarmonyItems[lastIndex + 1]!.startX;
        } else {
          endX = getMeasureEndPx(lastItem.measureIndex);
        }
        endX = Math.max(endX, startX + 4);

        const totalBeats = matchingIndices.reduce(
          (sum, idx) => sum + rationalToNumber(allHarmonyItems[idx]!.item.duration.beats),
          0,
        );
        durationMs = Math.max(totalBeats * msPerBeat, 50);
        activeEventKey = `harmony-${firstItem.item.key}`;
      }
    }

    if (activeMeasureIndex === null) return null;

    const measurePos = system.measures.findIndex((m) => m.measureIndex === activeMeasureIndex);
    if (measurePos < 0) return null;

    const measureStartPx =
      connectorInset +
      system.measures.slice(0, measurePos).reduce((sum, m) => sum + m.requiredWidthPx, 0) * scale;
    const measureWidthPx = system.measures[measurePos]!.requiredWidthPx * scale;

    return {
      measureIndex: activeMeasureIndex,
      measureLeftPx: measureStartPx,
      measureWidthPx,
      startX,
      endX,
      durationMs,
      eventKey: activeEventKey,
      startedAt: activeEventStartedAt ?? null,
    };
  }, [
    activeEventStartedAt,
    activeMelodyEventKey,
    barLengthBeats,
    displayWidthPx,
    measureItems,
    playingStepId,
    project.globalTiming.tempoBpm,
    renderedPositions,
    showBass,
    system,
    systemMelodyLanes,
  ]);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const wasActiveRef = useRef(false);

  // Auto-scroll vertically to keep the currently playing system centered in focus
  useEffect(() => {
    const isSystemActive = Boolean(activeMeasureAndPlayhead);
    if (isSystemActive && !wasActiveRef.current && cardRef.current) {
      cardRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
    wasActiveRef.current = isSystemActive;
  }, [Boolean(activeMeasureAndPlayhead)]);

  // Auto-scroll horizontally if this system is horizontally scrollable
  useEffect(() => {
    if (
      !activeMeasureAndPlayhead ||
      !system.horizontallyScrollable ||
      !scrollContainerRef.current
    ) {
      return;
    }
    const container = scrollContainerRef.current;
    const playheadX = activeMeasureAndPlayhead.startX;
    const scrollLeft = container.scrollLeft;
    const clientWidth = container.clientWidth;

    if (playheadX > scrollLeft + clientWidth - 100 || playheadX < scrollLeft + 40) {
      container.scrollTo({
        left: Math.max(0, playheadX - clientWidth / 3),
        behavior: "smooth",
      });
    }
  }, [activeMeasureAndPlayhead?.measureIndex, system.horizontallyScrollable]);

  return (
    <div
      ref={cardRef}
      className="progression-measure-score score-system-card"
      data-testid="progression-measure-score"
    >
      <section
        className={`score-system ${isMuted ? "is-muted" : ""}`.trim()}
        data-testid="progression-score-system"
        data-system-index={system.index}
        data-measure-count={system.measures.length}
        data-horizontally-scrollable={system.horizontallyScrollable ? "true" : undefined}
        data-is-muted={isMuted ? "true" : undefined}
        data-is-solo={isSolo ? "true" : undefined}
        data-is-looping={isLooping ? "true" : undefined}
        aria-label={`Score system ${system.index + 1}, measures ${system.measures[0]?.measure.number} through ${system.measures.at(-1)?.measure.number}`}
      >
        <header
          className="score-system-header"
          data-testid="score-system-header"
          data-system-index={system.index}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSystemMenu({
              anchor: e.currentTarget,
              position: { x: e.clientX, y: e.clientY },
            });
          }}
        >
          <strong>{`System ${system.index + 1}`}</strong>
          <span>{`${system.measures.length} measure${system.measures.length === 1 ? "" : "s"}`}</span>
          {isMuted ? (
            <span
              className="score-system-status-tag muted"
              data-testid={`score-system-status-muted-${system.index}`}
            >
              Muted
            </span>
          ) : null}
          {isSolo ? (
            <span
              className="score-system-status-tag solo"
              data-testid={`score-system-status-solo-${system.index}`}
            >
              Solo
            </span>
          ) : null}
          {isLooping ? (
            <span
              className="score-system-status-tag loop"
              data-testid={`score-system-status-loop-${system.index}`}
            >
              Loop
            </span>
          ) : null}
          {isTablature ? (
            <>
              <button
                type="button"
                className={`score-system-status-tag fingering ${effectiveShowFingering ? "active" : ""}`}
                data-testid={`score-system-fingering-toggle-${system.index}`}
                title={
                  effectiveShowFingering
                    ? "Аппликатура: включена (нажмите, чтобы скрыть)"
                    : "Аппликатура: скрыта (нажмите, чтобы показать)"
                }
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFingering();
                }}
              >
                Fingering {effectiveShowFingering ? "ON" : "OFF"}
              </button>
              {effectiveShowFingering ? (
                <button
                  type="button"
                  className="score-system-status-tag hand-legend-trigger"
                  data-testid={`score-system-hand-legend-btn-${system.index}`}
                  title="Открыть схему аппликатуры левой руки и палитру пальцев"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHandLegend?.();
                  }}
                >
                  🖐 Легенда
                </button>
              ) : null}
              {effectiveShowFingering ? (
                <span
                  className="score-system-fingering-dots-legend"
                  title="Цвета пальцев: 1=Указательный (янтарный), 2=Средний (фиолетовый), 3=Безымянный (синий), 4=Мизинец (красный). Нажмите для открытия схемы"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenHandLegend?.();
                  }}
                >
                  <span className="dot-mini dot-1">1</span>
                  <span className="dot-mini dot-2">2</span>
                  <span className="dot-mini dot-3">3</span>
                  <span className="dot-mini dot-4">4</span>
                </span>
              ) : null}
            </>
          ) : null}
          {system.horizontallyScrollable ? <span>Dense measure scrolls locally</span> : null}
          {onDeleteSystem ? (
            <button
              type="button"
              className="score-system-remove-button"
              data-testid={`score-system-remove-${system.index}`}
              aria-label={`Delete System ${system.index + 1}`}
              title={`Delete System ${system.index + 1}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSystem(system);
              }}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </header>
        <div
          ref={scrollContainerRef}
          className="score-system-scroll"
          style={{
            maxWidth: "100%",
            overflowX: system.horizontallyScrollable ? "auto" : "hidden",
            overflowY: "hidden",
          }}
        >
          {isNotationView ? (
            <div
              className="score-system-paper"
              style={{
                position: "relative",
                width: `${displayWidthPx}px`,
                minWidth: `${displayWidthPx}px`,
                height: `${systemHeight + SCORE_LABEL_BAND_PX}px`,
              }}
            >
              {activeMeasureAndPlayhead ? (
                <div
                  className="score-system-active-measure"
                  data-testid={`score-system-active-measure-${system.index}`}
                  data-measure-index={activeMeasureAndPlayhead.measureIndex}
                  style={{
                    position: "absolute",
                    left: `${activeMeasureAndPlayhead.measureLeftPx}px`,
                    width: `${activeMeasureAndPlayhead.measureWidthPx}px`,
                    top: `${SCORE_LABEL_BAND_PX}px`,
                    height: `${systemHeight}px`,
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                />
              ) : null}
              {activeMeasureAndPlayhead ? (
                <ScoreSystemPlayhead
                  startX={activeMeasureAndPlayhead.startX}
                  endX={activeMeasureAndPlayhead.endX}
                  durationMs={activeMeasureAndPlayhead.durationMs}
                  eventKey={activeMeasureAndPlayhead.eventKey}
                  topPx={SCORE_LABEL_BAND_PX}
                  heightPx={systemHeight}
                  systemIndex={system.index}
                  startedAt={activeMeasureAndPlayhead.startedAt}
                />
              ) : null}
              <div
                ref={canvasRef}
                className="measure-staff score-system-canvas"
                role="img"
                aria-label={`Score notation for measures ${system.measures[0]?.measure.number} through ${system.measures.at(-1)?.measure.number}`}
                style={{
                  position: "absolute",
                  top: `${SCORE_LABEL_BAND_PX}px`,
                  left: 0,
                  width: `${displayWidthPx}px`,
                  minWidth: `${displayWidthPx}px`,
                  height: `${systemHeight}px`,
                  zIndex: 2,
                }}
              />
              <div
                className="score-system-annotations"
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              >
                {systemMelodyLanes.map((lane, laneIndex) => {
                  const laneLabel = melodyInstrumentLabel(lane.instrumentId);
                  return (
                    <span
                      key={`lane-label-${lane.instrumentId}`}
                      className="score-system-melody-lane-label"
                      data-testid={`score-system-melody-lane-label-${lane.instrumentId}`}
                      data-melody-instrument={lane.instrumentId}
                      role="img"
                      aria-label={`Melody lane ${laneLabel}`}
                      style={
                        {
                          top: `${SCORE_LABEL_BAND_PX + laneIndex * (SCORE_STAFF_HEIGHT_PX + SCORE_STAFF_GAP_PX) + 2}px`,
                        } as CSSProperties
                      }
                    >
                      {laneLabel}
                    </span>
                  );
                })}
                {harmonyAnnotations.map(({ projectedMeasure, item }) => {
                  const xRatio =
                    renderedPositions[positionKey("harmony", item.key)] ??
                    systemMeasureRatio(
                      system,
                      displayWidthPx,
                      projectedMeasure.measureIndex,
                      item.startOffsetBeats,
                      barLengthBeats,
                      showBass,
                    );
                  const durationRatio = rationalToNumber(item.duration.beats) / barLengthBeats;
                  const selected = selectedStepId === item.stepId;
                  const playing = playingStepId === item.stepId;
                  const chord = item.kind === "chord" ? item : null;
                  const displayPitches = chord
                    ? chord.bassPitch
                      ? [chord.bassPitch, ...chord.pitches]
                      : chord.pitches
                    : [];
                  const notes = displayPitches.map(formatPitch).join(" ");
                  const label =
                    item.kind === "rest"
                      ? `Rest: ${formatMusicalDuration(item.duration)} beats`
                      : `${item.label}: ${notes}; ${formatMusicalDuration(item.duration)} beats${item.startsHere ? "" : "; continuation"}`;
                  const keyboardDescription =
                    item.kind === "rest"
                      ? "Arrow Left or Arrow Right reorders this step."
                      : "Arrow Up or Arrow Down changes octave; Arrow Left or Arrow Right reorders this step.";
                  const harmonyRowTop =
                    systemMelodyLanes.length * (SCORE_STAFF_HEIGHT_PX + SCORE_STAFF_GAP_PX);
                  const style = {
                    "--measure-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
                    "--measure-staff-event-span": `${systemMeasureSpan(system, displayWidthPx, projectedMeasure.measureIndex, Math.max(durationRatio, 0), showBass) * 100}%`,
                    top: `${harmonyRowTop + 3}px`,
                    bottom: "auto",
                    height: `${SCORE_STAFF_HEIGHT_PX - 6}px`,
                  } as CSSProperties;
                  return (
                    <div
                      key={`${projectedMeasure.measureIndex}-${item.key}`}
                      className={`measure-staff-event ${selected ? "is-selected" : ""} ${playing ? "is-playing" : ""} ${item.kind === "rest" ? "is-rest" : ""} ${chord && !chord.startsHere ? "is-continuation" : ""}`}
                      style={style}
                      data-staff-item-key={item.key}
                    >
                      <button
                        type="button"
                        className="measure-staff-event-select"
                        data-progression-step-select
                        data-step-id={item.stepId}
                        aria-label={`Select ${label}`}
                        aria-pressed={selected}
                        aria-current={playing ? "step" : undefined}
                        aria-haspopup={onOpenMelodyMenu ? "menu" : undefined}
                        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                        title={`${label}. ${keyboardDescription}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectStep(item.stepId);
                        }}
                        onContextMenu={(event) => {
                          if (!onOpenMelodyMenu) return;
                          event.preventDefault();
                          event.stopPropagation();
                          onOpenMelodyMenu(item.stepId, event.currentTarget, {
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }}
                        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                          if (!event.repeat) {
                            const direction =
                              event.key === "ArrowLeft"
                                ? -1
                                : event.key === "ArrowRight"
                                  ? 1
                                  : null;
                            if (direction !== null) {
                              const currentIndex = project.progression.steps.findIndex(
                                (step) => step.id === item.stepId,
                              );
                              const targetIndex = currentIndex + direction;
                              if (
                                currentIndex >= 0 &&
                                targetIndex >= 0 &&
                                targetIndex < project.progression.steps.length
                              ) {
                                event.preventDefault();
                                event.stopPropagation();
                                onSelectStep(item.stepId);
                                onReorder(item.stepId, targetIndex);
                                const restoreFocus = () => {
                                  document
                                    .querySelector<HTMLButtonElement>(
                                      `[data-progression-step-select][data-step-id="${item.stepId}"]`,
                                    )
                                    ?.focus();
                                };
                                if (typeof requestAnimationFrame === "function")
                                  requestAnimationFrame(restoreFocus);
                                else restoreFocus();
                                return;
                              }
                            }
                            if (chord && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                              const sourceStep = project.progression.steps.find(
                                (step) => step.id === item.stepId && step.kind === "chord",
                              );
                              if (sourceStep?.kind === "chord") {
                                const patch = performanceOctaveShiftPatch(
                                  sourceStep.performance,
                                  event.key === "ArrowUp" ? 1 : -1,
                                );
                                if (patch) {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  onSelectStep(item.stepId);
                                  onEditPerformance(item.stepId, patch);
                                  return;
                                }
                              }
                            }
                          }
                          if (
                            !onOpenMelodyMenu ||
                            (event.key !== "ContextMenu" &&
                              !(event.key === "F10" && event.shiftKey))
                          ) {
                            return;
                          }
                          event.preventDefault();
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          onOpenMelodyMenu(item.stepId, event.currentTarget, {
                            x: rect.left,
                            y: rect.bottom,
                          });
                        }}
                      >
                        {item.kind === "rest" ? "Rest" : item.startsHere ? item.label : "↪"}
                      </button>
                    </div>
                  );
                })}
                {gapAnnotations.map(({ projectedMeasure, item }) => {
                  const xRatio = systemMeasureRatio(
                    system,
                    displayWidthPx,
                    projectedMeasure.measureIndex,
                    item.startOffsetBeats,
                    barLengthBeats,
                    showBass,
                  );
                  const durationRatio = rationalToNumber(item.duration.beats) / barLengthBeats;
                  const harmonyRowTop =
                    systemMelodyLanes.length * (SCORE_STAFF_HEIGHT_PX + SCORE_STAFF_GAP_PX);
                  const gapStyle = {
                    "--measure-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
                    "--measure-staff-event-span": `${systemMeasureSpan(system, displayWidthPx, projectedMeasure.measureIndex, Math.max(durationRatio, 0), showBass) * 100}%`,
                    top: `${SCORE_LABEL_BAND_PX + harmonyRowTop + 50}px`,
                  } as CSSProperties;
                  const measureNumber = projectedMeasure.measureIndex + 1;
                  return (
                    <div
                      key={`${projectedMeasure.measureIndex}-${item.key}`}
                      className="measure-staff-gap"
                      style={gapStyle}
                      data-testid="progression-score-gap"
                      data-measure-index={projectedMeasure.measureIndex}
                      aria-label={`Empty space in measure ${measureNumber}: ${formatMusicalDuration(item.duration)} beats`}
                    >
                      <strong>Empty</strong>
                      <span>{formatMusicalDuration(item.duration)}</span>
                      <div className="progression-gap-actions">
                        {onFocusMatrix ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onFocusMatrix(measureNumber);
                            }}
                            aria-label={`Add chord to measure ${measureNumber}`}
                          >
                            <Icon name="add" /> Add chord
                          </button>
                        ) : null}
                        {onFillGapWithRest ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onFillGapWithRest();
                            }}
                            aria-label={`Fill measure ${measureNumber} with rest`}
                          >
                            Rest
                          </button>
                        ) : null}
                        {onExtendFinalChord && canRepeatOrExtend ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onExtendFinalChord();
                            }}
                            aria-label={`Extend chord to end of measure ${measureNumber}`}
                          >
                            Extend
                          </button>
                        ) : null}
                        {onRepeatFinalChord && canRepeatOrExtend ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onRepeatFinalChord();
                            }}
                            aria-label={`Repeat chord to end of measure ${measureNumber}`}
                          >
                            Repeat
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {systemMelodyLanes.flatMap((lane, laneIndex) =>
                  system.measures.flatMap((projectedMeasure) => {
                    const measure: MelodyStaffMeasure | undefined =
                      lane.measures[projectedMeasure.measureIndex];
                    if (!measure) return [];
                    return measure.entries.flatMap((entry) => {
                      if (entry.kind !== "note") return [];
                      const annotationKey = `${lane.instrumentId}-${projectedMeasure.measureIndex}-${entry.key}`;
                      const xRatio = melodyEventRatio(
                        system,
                        displayWidthPx,
                        projectedMeasure,
                        entry,
                        lane.instrumentId,
                        renderedPositions,
                        barLengthBeats,
                        showBass,
                      );
                      const selected = selectedStepId === entry.sourceStepId;
                      const active = activeMelodyEventKey === entry.eventKey;
                      const label = `Melody ${melodyInstrumentLabel(lane.instrumentId)}, ${formatPitch(entry.pitch)}, onset ${exact(entry.startBeats)} beats, duration ${exact(entry.durationBeats)} beats, source chord ${sourceChordLabel(project, entry.sourceStepId)}`;
                      const style = {
                        "--melody-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
                        top: `${SCORE_LABEL_BAND_PX + laneIndex * (SCORE_STAFF_HEIGHT_PX + SCORE_STAFF_GAP_PX) + 4 + (melodyRows[annotationKey] ?? 0) * MELODY_NOTE_ANNOTATION_ROW_GAP_PX}px`,
                      } as CSSProperties;
                      return (
                        <button
                          key={`${lane.instrumentId}-${projectedMeasure.measureIndex}-${entry.key}`}
                          type="button"
                          className={`melody-staff-note ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${entry.startsHere ? "" : "is-continuation"}`.trim()}
                          style={style}
                          data-melody-event-key={entry.eventKey}
                          data-step-id={entry.sourceStepId}
                          data-melody-instrument={lane.instrumentId}
                          aria-label={label}
                          aria-pressed={selected}
                          aria-current={active ? "step" : undefined}
                          title={label}
                          onClick={() => onSelectStep(entry.sourceStepId)}
                        />
                      );
                    });
                  }),
                )}
              </div>
            </div>
          ) : (
            <div
              className="score-system-measures-row"
              data-testid="score-system-measures-row"
              data-system-index={system.index}
              style={{
                width: system.horizontallyScrollable ? `${displayWidthPx}px` : "100%",
                minWidth: system.horizontallyScrollable ? `${displayWidthPx}px` : "100%",
              }}
            >
              {system.measures.map((sm) =>
                renderMeasureContent ? renderMeasureContent(sm.measure) : null,
              )}
            </div>
          )}
        </div>
        {systemMenu ? (
          <ScoreSystemContextMenu
            system={system}
            position={systemMenu.position}
            invoker={systemMenu.anchor}
            isLooping={isLooping}
            isMuted={isMuted}
            isSolo={isSolo}
            canMoveUp={system.index > 0}
            canMoveDown={system.index < totalSystems - 1}
            canPaste={canPasteSystem}
            canShiftOctaveUp={canShiftOctaveUp}
            canShiftOctaveDown={canShiftOctaveDown}
            hasMelody={systemHasMelody}
            onPlayFromHere={onPlayFromSystem ? () => onPlayFromSystem(system) : undefined}
            onToggleLoop={onToggleLoopSystem ? () => onToggleLoopSystem(system) : undefined}
            onToggleMute={onToggleMuteSystem ? () => onToggleMuteSystem(system) : undefined}
            onToggleSolo={onToggleSoloSystem ? () => onToggleSoloSystem(system) : undefined}
            onMoveUp={onMoveSystemUp ? () => onMoveSystemUp(system) : undefined}
            onMoveDown={onMoveSystemDown ? () => onMoveSystemDown(system) : undefined}
            onDuplicate={() => onDuplicateSystem?.(system)}
            onCopy={onCopySystem ? () => onCopySystem(system) : undefined}
            onPasteAfter={onPasteSystemAfter ? () => onPasteSystemAfter(system) : undefined}
            onInsertEmptyAfter={
              onInsertEmptySystemAfter ? () => onInsertEmptySystemAfter(system) : undefined
            }
            onInsertRestAfter={
              onInsertRestAfterSystem ? () => onInsertRestAfterSystem(system) : undefined
            }
            onExploreAlternative={
              onExploreAlternativeFromSystem
                ? () => onExploreAlternativeFromSystem(system)
                : undefined
            }
            onOctaveUp={onOctaveUpSystem ? () => onOctaveUpSystem(system) : undefined}
            onOctaveDown={onOctaveDownSystem ? () => onOctaveDownSystem(system) : undefined}
            onResetPerformance={
              onResetPerformanceSystem ? () => onResetPerformanceSystem(system) : undefined
            }
            onSetArticulation={
              onSetArticulationSystem ? (art) => onSetArticulationSystem(system, art) : undefined
            }
            onApplyMelodyContour={
              onApplyMelodyContourSystem
                ? (motion) => onApplyMelodyContourSystem(system, motion)
                : undefined
            }
            currentPitchMotion={currentPitchMotion}
            onSetMelodyGrid={
              onSetMelodyGridSystem ? (grid) => onSetMelodyGridSystem(system, grid) : undefined
            }
            currentGrid={currentGrid}
            onClearMelody={onClearMelodySystem ? () => onClearMelodySystem(system) : undefined}
            suzukiColors={suzukiColors}
            onToggleSuzukiColors={onToggleSuzukiColors}
            onDelete={onDeleteSystem ? () => onDeleteSystem(system) : undefined}
            onClose={() => setSystemMenu(null)}
          />
        ) : null}
      </section>
    </div>
  );
}

export interface ScoreSystemViewProps {
  readonly project: Project;
  readonly layout: ProgressionMeasureLayout;
  readonly melodyTimeline: MelodyTimeline | null;
  readonly measuresPerSystem: Project["presentation"]["measuresPerSystem"];
  readonly selectedStepId: string | undefined;
  readonly playingStepId: string | undefined;
  readonly activeMelodyEventKey: string | null | undefined;
  readonly activeEventStartedAt?: number | null | undefined;
  readonly measureItemsForMeasure: (measure: ProgressionMeasure) => readonly MeasureStaffItem[];
  readonly onSelectStep: (stepId: string) => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: MelodyMenuPosition,
  ) => void;
  readonly onFocusMatrix?: (measureNumber: number) => void;
  readonly onFillGapWithRest?: () => void;
  readonly onExtendFinalChord?: () => void;
  readonly onRepeatFinalChord?: () => void;
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
  readonly onInsertRestAfterSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onExploreAlternativeFromSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onOctaveUpSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onOctaveDownSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onResetPerformanceSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onSetArticulationSystem?:
    ((system: ScoreSystem, articulation: PianoArticulation) => void) | undefined;
  readonly onApplyMelodyContourSystem?:
    ((system: ScoreSystem, motion: MelodyPitchMotion) => void) | undefined;
  readonly onSetMelodyGridSystem?: ((system: ScoreSystem, grid: MelodyGrid) => void) | undefined;
  readonly onClearMelodySystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onToggleSuzukiColors?: (() => void) | undefined;
  readonly renderMeasureContent?: ((measure: ProgressionMeasure) => ReactNode) | undefined;
}

/** Responsive multi-measure Staff projection used by My Progression. */
export function ScoreSystemView({
  project,
  layout,
  melodyTimeline,
  measuresPerSystem,
  selectedStepId,
  playingStepId,
  activeMelodyEventKey,
  activeEventStartedAt,
  measureItemsForMeasure,
  onSelectStep,
  onEditPerformance,
  onReorder,
  onOpenMelodyMenu,
  onFocusMatrix,
  onFillGapWithRest,
  onExtendFinalChord,
  onRepeatFinalChord,
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
  onInsertRestAfterSystem,
  onExploreAlternativeFromSystem,
  onOctaveUpSystem,
  onOctaveDownSystem,
  onResetPerformanceSystem,
  onSetArticulationSystem,
  onApplyMelodyContourSystem,
  onSetMelodyGridSystem,
  onClearMelodySystem,
  onToggleSuzukiColors,
  renderMeasureContent,
}: ScoreSystemViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [availableWidthPx, setAvailableWidthPx] = useState(0);
  const [showFingering, setShowFingering] = useState(true);
  const [fingeringStyle, setFingeringStyle] = useState<TabFingeringStyle>(() => {
    try {
      const stored = window.localStorage.getItem("cadenceflow.tabFingeringStyle");
      if (stored === "badge" || stored === "dots" || stored === "numbers") {
        return stored;
      }
    } catch {
      // localStorage may be unavailable in private or embedded contexts.
    }
    return "badge";
  });
  const [showHandLegend, setShowHandLegend] = useState(false);

  const handleSetFingeringStyle = (style: TabFingeringStyle) => {
    setFingeringStyle(style);
    try {
      window.localStorage.setItem("cadenceflow.tabFingeringStyle", style);
    } catch {
      // localStorage may be unavailable in private or embedded contexts.
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      setAvailableWidthPx(root.getBoundingClientRect().width);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(root);
    return () => observer?.disconnect();
  }, []);

  const measureItems = useMemo(
    () =>
      Object.freeze(
        Object.fromEntries(
          layout.measures.map((measure) => [measure.measureIndex, measureItemsForMeasure(measure)]),
        ),
      ) as Readonly<Record<number, readonly MeasureStaffItem[]>>,
    [layout.measures, measureItemsForMeasure],
  );
  const additionalAttacks = useMemo<readonly ScoreSystemAttack[]>(
    () =>
      melodyTimeline
        ? Object.freeze(
            melodyTimeline.measures.flatMap((measure) =>
              measure.entries.flatMap((entry) =>
                entry.kind === "note" && entry.startsHere
                  ? [
                      {
                        measureIndex: measure.measureIndex,
                        startOffsetBeats: entry.startOffsetBeats,
                      },
                    ]
                  : [],
              ),
            ),
          )
        : Object.freeze([]),
    [melodyTimeline],
  );
  const projection = useMemo(
    () =>
      projectScoreSystems(layout, {
        availableWidthPx: availableWidthPx || DEFAULT_SCORE_WIDTH_PX,
        measuresPerSystem,
        additionalAttacks,
      }),
    [additionalAttacks, availableWidthPx, layout, measuresPerSystem],
  );

  return (
    <div
      ref={rootRef}
      className="score-system-view"
      data-testid="progression-score-systems"
      data-progression-view={project.presentation.progressionView}
      data-system-count={projection.systems.length}
      data-measures-per-system={String(measuresPerSystem)}
      data-auto-maximum={
        measuresPerSystem === "auto" ? projection.maximumMeasuresPerSystem : undefined
      }
      aria-label={`Staff score systems; ${measuresPerSystem === "auto" ? `Auto currently allows up to ${projection.maximumMeasuresPerSystem} measures per system` : `up to ${projection.maximumMeasuresPerSystem} measures per system`}`}
      style={{ gridColumn: "1 / -1", minWidth: 0, width: "100%", maxWidth: "100%" }}
    >
      {projection.systems.map((system) => {
        const displayWidthPx = system.horizontallyScrollable
          ? system.requiredWidthPx
          : Math.max(system.requiredWidthPx, projection.availableWidthPx - 2);
        return (
          <ScoreSystemCanvas
            key={system.index}
            project={project}
            layout={layout}
            system={system}
            displayWidthPx={displayWidthPx}
            melodyTimeline={melodyTimeline}
            measureItems={measureItems}
            selectedStepId={selectedStepId}
            playingStepId={playingStepId}
            activeMelodyEventKey={activeMelodyEventKey}
            activeEventStartedAt={activeEventStartedAt}
            onSelectStep={onSelectStep}
            onEditPerformance={onEditPerformance}
            onReorder={onReorder}
            {...(onOpenMelodyMenu ? { onOpenMelodyMenu } : {})}
            {...(onFocusMatrix ? { onFocusMatrix } : {})}
            {...(onFillGapWithRest ? { onFillGapWithRest } : {})}
            {...(onExtendFinalChord ? { onExtendFinalChord } : {})}
            {...(onRepeatFinalChord ? { onRepeatFinalChord } : {})}
            {...(onDuplicateSystem ? { onDuplicateSystem } : {})}
            {...(onDeleteSystem ? { onDeleteSystem } : {})}
            totalSystems={projection.systems.length}
            isSystemLooping={isSystemLooping}
            isSystemMuted={isSystemMuted}
            isSystemSolo={isSystemSolo}
            canPasteSystem={canPasteSystem}
            onPlayFromSystem={onPlayFromSystem}
            onToggleLoopSystem={onToggleLoopSystem}
            onToggleMuteSystem={onToggleMuteSystem}
            onToggleSoloSystem={onToggleSoloSystem}
            onMoveSystemUp={onMoveSystemUp}
            onMoveSystemDown={onMoveSystemDown}
            onCopySystem={onCopySystem}
            onPasteSystemAfter={onPasteSystemAfter}
            onInsertEmptySystemAfter={onInsertEmptySystemAfter}
            onInsertRestAfterSystem={onInsertRestAfterSystem}
            onExploreAlternativeFromSystem={onExploreAlternativeFromSystem}
            onOctaveUpSystem={onOctaveUpSystem}
            onOctaveDownSystem={onOctaveDownSystem}
            onResetPerformanceSystem={onResetPerformanceSystem}
            onSetArticulationSystem={onSetArticulationSystem}
            onApplyMelodyContourSystem={onApplyMelodyContourSystem}
            onSetMelodyGridSystem={onSetMelodyGridSystem}
            onClearMelodySystem={onClearMelodySystem}
            {...(onToggleSuzukiColors ? { onToggleSuzukiColors } : {})}
            showFingering={showFingering}
            onToggleFingering={() => setShowFingering((prev) => !prev)}
            fingeringStyle={fingeringStyle}
            onOpenHandLegend={() => setShowHandLegend(true)}
            renderMeasureContent={renderMeasureContent}
          />
        );
      })}
      {showHandLegend ? (
        <GuitarHandLegendModal
          onClose={() => setShowHandLegend(false)}
          fingeringStyle={fingeringStyle}
          onSetFingeringStyle={handleSetFingeringStyle}
        />
      ) : null}
    </div>
  );
}
