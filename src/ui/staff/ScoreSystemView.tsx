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
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import { realizeProgressionStepChord } from "../../domain/progression/transposition";
import {
  pitchToGuitarTabPosition,
  resolveGuitarTabEntry,
  optimizeGuitarMelodyTab,
  type GuitarMelodyInputNote,
  type GuitarTabPosition,
} from "../../domain/instruments/guitar/tablature";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { Project } from "../../domain/project/project";
import type { PlaybackClockSnapshot } from "../transport/transportStore";
import { formatMusicalDuration, musicalDuration } from "../../domain/timing/duration";
import type {
  ProgressionMeasure,
  ProgressionMeasureLayout,
} from "../../domain/timing/measureLayout";
import {
  addRational,
  compareRational,
  rationalToNumber,
  subtractRational,
} from "../../domain/timing/rational";
import {
  projectScoreSystems,
  type ScoreSystem,
  type ScoreSystemAttack,
} from "../../notation/scoreSystemProjection";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import {
  renderStaffSystem,
  type StaffSequenceNoteEntry,
  type StaffSequenceEntry,
  type StaffSystemMeasureInput,
  type StaffSystemPosition,
} from "../../notation/vexflowAdapter";
import type {
  MelodyInstrumentLane,
  MelodyTimelineEvent,
  MelodyStaffEntry,
  MelodyStaffMeasure,
  MelodyTimeline,
} from "../../notation/melodyStaffProjection";
import { Icon } from "../common/Icon";
import { PianoRollSelectionAction } from "../melody/PianoRollSelectionAction";
import type { MelodyMenuPosition } from "../melody/MelodyContextMenu";
import { melodyInstrumentLabel } from "../melody/labels";
import type { MeasureStaffChordItem, MeasureStaffItem } from "./MeasureStaffView";
import { performanceOctaveShiftPatch } from "./staffOctave";
import { ScoreSystemContextMenu, type ScoreSystemMenuPosition } from "./ScoreSystemContextMenu";
import { GuitarHandLegendModal, type TabFingeringStyle } from "../guitar/GuitarHandLegendModal";

const DEFAULT_SCORE_WIDTH_PX = 960;
const SCORE_STAFF_HEIGHT_PX = 160;
const SCORE_STAFF_GAP_PX = 18;
const PIANO_ROLL_PITCH_GUTTER_WIDTH_PX = 34;
const SCORE_SYSTEM_VIEW_BORDER_WIDTH_PX = 2;
const BASE_SCORE_LABEL_BAND_PX = 32;
const SONG_SECTION_MARKER_ROW_PX = 24;
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
  const chord = realizeProgressionStepChord(step, project.tonic);
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
      const chord = realizeProgressionStepChord(step, project.tonic);
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
    sourceEventKeys: [item.stepId],
    duration: item.duration,
    startOffsetBeats: item.startOffsetBeats,
    continuesFromPrevious: item.continuesFromPrevious,
    continuesToNext: item.continuesToNext,
    ...(item.stepId === playingStepId ? { highlighted: true } : {}),
  };
}

function melodySequenceEntries(
  entry: MelodyStaffEntry,
  isTablature = false,
  customTabPosition?: GuitarTabPosition,
): readonly StaffSequenceEntry[] {
  const writtenRhythms = entry.writtenRhythm;
  return writtenRhythms.map((writtenRhythm) => {
    const key =
      writtenRhythm.count === 1 ? entry.key : `${entry.key}:written-${writtenRhythm.index}`;
    const startOffsetBeats = addRational(entry.startOffsetBeats, writtenRhythm.offsetBeats);
    const duration = musicalDuration(writtenRhythm.beats);
    if (entry.kind === "rest") {
      return { key, kind: "rest", duration, startOffsetBeats, writtenRhythm };
    }
    const tabPositions = isTablature
      ? [customTabPosition ?? pitchToGuitarTabPosition(entry.pitch, "melody")]
      : undefined;
    return {
      key,
      kind: "note",
      projection: projectPitchesToStaff([entry.pitch]),
      sourceEventKeys: [entry.eventKey],
      ...(tabPositions ? { tabPositions } : {}),
      duration,
      startOffsetBeats,
      writtenRhythm,
      continuesFromPrevious: entry.continuesFromPrevious,
      continuesToNext: entry.continuesToNext,
    };
  });
}

function melodyRhythmicVoiceByEvent(lane: MelodyInstrumentLane): ReadonlyMap<string, number> {
  const attacks = new Map<
    string,
    {
      readonly start: MelodyTimelineEvent["startBeats"];
      end: MelodyTimelineEvent["startBeats"];
      keys: string[];
    }
  >();
  lane.events.forEach((event) => {
    const key = `${exact(event.startBeats)}:${exact(event.durationBeats)}`;
    const current = attacks.get(key);
    if (current) {
      current.keys.push(event.eventKey);
    } else {
      attacks.set(key, {
        start: event.startBeats,
        end: addRational(event.startBeats, event.durationBeats),
        keys: [event.eventKey],
      });
    }
  });
  const ordered = [...attacks.values()].sort((a, b) => compareRational(a.start, b.start));
  const voiceEnds: MelodyTimelineEvent["startBeats"][] = [];
  const eventVoices = new Map<string, number>();
  ordered.forEach((attack) => {
    let voiceIndex = voiceEnds.findIndex((end) => compareRational(end, attack.start) <= 0);
    if (voiceIndex < 0) voiceIndex = voiceEnds.length;
    voiceEnds[voiceIndex] = attack.end;
    attack.keys.forEach((key) => eventVoices.set(key, voiceIndex));
  });
  return eventVoices;
}

function groupSimultaneousMelodyEntries(
  entries: readonly StaffSequenceEntry[],
): readonly StaffSequenceEntry[] {
  const groups = new Map<string, { readonly index: number; entries: StaffSequenceNoteEntry[] }>();
  entries.forEach((entry, index) => {
    if (entry.kind !== "note") return;
    const rhythm = entry.writtenRhythm;
    const groupKey = [
      exact(entry.startOffsetBeats),
      exact(entry.duration.beats),
      rhythm?.notation ?? "",
      rhythm ? `${rhythm.index}/${rhythm.count}` : "",
      entry.rhythmicVoice ?? "",
      entry.continuesFromPrevious ? "previous" : "start",
      entry.continuesToNext ? "next" : "end",
    ].join("|");
    const group = groups.get(groupKey);
    if (group) group.entries.push(entry);
    else groups.set(groupKey, { index, entries: [entry] });
  });

  const replacements = new Map<number, StaffSequenceEntry>();
  groups.forEach(({ index, entries: notes }) => {
    if (notes.length < 2) {
      replacements.set(index, notes[0]!);
      return;
    }
    const first = notes[0]!;
    const sourceEventKeys = [...new Set(notes.flatMap((note) => note.sourceEventKeys ?? []))];
    const tabPositions = notes.flatMap((note) => note.tabPositions ?? []);
    const hasTabPositions = notes.some((note) => note.tabPositions !== undefined);
    const strings = new Set<number>();
    let tabPositionConflict = notes.some((note) => note.tabPositionConflict === true);
    tabPositions.forEach((position) => {
      if (strings.has(position.str)) tabPositionConflict = true;
      strings.add(position.str);
    });
    replacements.set(
      index,
      Object.freeze({
        key: `melody-chord:${sourceEventKeys.join("+")}:${exact(first.startOffsetBeats)}`,
        kind: "chord",
        projection: Object.freeze({
          notes: Object.freeze(notes.flatMap((note) => note.projection.notes)),
        }),
        ...(hasTabPositions ? { tabPositions: Object.freeze(tabPositions) } : {}),
        ...(tabPositionConflict ? { tabPositionConflict: true } : {}),
        duration: first.duration,
        startOffsetBeats: first.startOffsetBeats,
        ...(first.writtenRhythm ? { writtenRhythm: first.writtenRhythm } : {}),
        ...(first.rhythmicVoice ? { rhythmicVoice: first.rhythmicVoice } : {}),
        sourceEventKeys: Object.freeze(sourceEventKeys),
        ...(first.continuesFromPrevious ? { continuesFromPrevious: true } : {}),
        ...(first.continuesToNext ? { continuesToNext: true } : {}),
        ...(notes.some((note) => note.highlighted) ? { highlighted: true } : {}),
      }),
    );
  });

  return Object.freeze(
    entries.flatMap((entry, index) => {
      const replacement = replacements.get(index);
      return replacement ? [replacement] : entry.kind === "note" ? [] : [entry];
    }),
  );
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

function systemMeasureResizeGeometry(
  system: ScoreSystem,
  displayWidthPx: number,
  measureIndex: number,
  showBass: boolean,
): { readonly leftPx: number; readonly widthPx: number } {
  const connectorInset = showBass ? 14 : 0;
  const systemWidth = Math.max(displayWidthPx, 1);
  const scale = Math.max(systemWidth - connectorInset, 1) / Math.max(system.requiredWidthPx, 1);
  const measurePosition = system.measures.findIndex(
    (measure) => measure.measureIndex === measureIndex,
  );
  if (measurePosition < 0) return { leftPx: 0, widthPx: systemWidth };
  const measureStart = system.measures
    .slice(0, measurePosition)
    .reduce((sum, measure) => sum + measure.requiredWidthPx, 0);
  const measure = system.measures[measurePosition]!;
  const measureStartPx = connectorInset + measureStart * scale;
  const measureWidthPx = measure.requiredWidthPx * scale;
  const leftPadding = measurePosition === 0 ? (system.index === 0 ? 84 : 54) : 24;
  const rightPadding = 24;
  return {
    leftPx: measureStartPx + leftPadding,
    widthPx: Math.max(measureWidthPx - leftPadding - rightPadding, 1),
  };
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
  readonly pianoRollMeasureCapacity?: number | undefined;
  readonly pianoRollMeasureMinimumWidthPx?: number | undefined;
  readonly pianoRollMusicViewportWidthPx?: number | undefined;
  readonly melodyTimeline: MelodyTimeline | null;
  readonly measureItems: Readonly<Record<number, readonly MeasureStaffItem[]>>;
  readonly selectedStepId: string | undefined;
  readonly rangeSelectedStepIds?: ReadonlySet<string> | undefined;
  readonly playingStepId: string | undefined;
  readonly activeMelodyEventKey: string | null | undefined;
  readonly playbackClockSnapshot?: PlaybackClockSnapshot | null | undefined;
  readonly onSelectStep: (stepId: string) => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: MelodyMenuPosition,
  ) => void;
  readonly onOpenMeasureMenu?: (
    measureIndex: number,
    anchor: HTMLElement,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly onDeleteMeasureFromButton?: (measureIndex: number, invoker: HTMLElement) => void;
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
  readonly onAuditionSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onSetPianoRollSystemScope?: ((systemIndex: number) => void) | undefined;
  readonly onSelectPianoRollSystemNotes?: ((system: ScoreSystem) => void) | undefined;
  readonly pianoRollSelectionScopeLabel?: string | undefined;
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
  readonly renderMeasureContent?:
    ((measure: ProgressionMeasure, systemIndex?: number) => ReactNode) | undefined;
  readonly renderSystemPitchScale?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderSystemNotePanel?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderSystemControls?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderSystemChordPanel?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderDurationResizeHandle?: (
    item: MeasureStaffChordItem,
    measure: ProgressionMeasure,
  ) => ReactNode | undefined;
}

function ScoreSystemCanvas({
  project,
  layout,
  system,
  displayWidthPx,
  pianoRollMeasureCapacity,
  pianoRollMeasureMinimumWidthPx,
  pianoRollMusicViewportWidthPx,
  melodyTimeline,
  measureItems,
  selectedStepId,
  rangeSelectedStepIds,
  playingStepId,
  activeMelodyEventKey,
  playbackClockSnapshot,
  onSelectStep,
  onEditPerformance,
  onReorder,
  onOpenMelodyMenu,
  onOpenMeasureMenu,
  onDeleteMeasureFromButton,
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
  onAuditionSystem,
  onSetPianoRollSystemScope,
  onSelectPianoRollSystemNotes,
  pianoRollSelectionScopeLabel = "Progression",
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
  renderSystemPitchScale,
  renderSystemNotePanel,
  renderSystemChordPanel,
  renderSystemControls,
  renderDurationResizeHandle,
}: ScoreSystemCanvasProps) {
  const hasPianoRollMeasureSlots =
    pianoRollMeasureCapacity !== undefined &&
    pianoRollMeasureMinimumWidthPx !== undefined &&
    pianoRollMusicViewportWidthPx !== undefined;
  const pianoRollSystemWidthPx = hasPianoRollMeasureSlots
    ? Math.max(
        pianoRollMusicViewportWidthPx,
        pianoRollMeasureCapacity * pianoRollMeasureMinimumWidthPx,
      )
    : 0;
  const systemHorizontallyScrollable = hasPianoRollMeasureSlots
    ? pianoRollSystemWidthPx > pianoRollMusicViewportWidthPx + 0.5
    : system.horizontallyScrollable;

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

  const songSectionLayout = useMemo(() => {
    const marks = new Map<
      string,
      {
        stepId: string;
        stepNumber: number;
        measureNumber: number;
        xRatio: number;
        names: string[];
      }
    >();
    const barLength = rationalToNumber(layout.barLengthBeats);
    for (const section of project.progression.sections ?? []) {
      for (const { measure, measureIndex } of system.measures) {
        const start = measure.fragments.find(
          (fragment) => fragment.stepId === section.startStepId && fragment.startsHere,
        );
        if (!start) continue;
        const key = `${section.startStepId}:${measureIndex}`;
        const mark = marks.get(key) ?? {
          stepId: section.startStepId,
          stepNumber: start.stepIndex + 1,
          measureNumber: measure.number,
          xRatio: systemMeasureRatio(
            system,
            displayWidthPx,
            measureIndex,
            subtractRational(start.startBeats, measure.startBeats),
            barLength,
            project.presentation.progressionView !== "tablature" &&
              project.presentation.showBassInStaff,
          ),
          names: [],
        };
        mark.names.push(section.name);
        marks.set(key, mark);
        break;
      }
    }
    const maxMarkerWidthPx = Math.max(120, Math.min(displayWidthPx * 0.44, 360));
    const occupiedIntervalsByRow: Array<Array<{ leftPx: number; rightPx: number }>> = [];
    const positionedMarks = [...marks.values()]
      .sort((left, right) => left.xRatio - right.xRatio || left.stepId.localeCompare(right.stepId))
      .map((mark) => {
        const markerWidthPx = Math.min(
          maxMarkerWidthPx,
          Math.max(150, mark.names.join(" · ").length * 6.5 + 116),
        );
        const anchorPx = mark.xRatio * displayWidthPx;
        const leftPx = Math.min(
          Math.max(anchorPx - markerWidthPx / 2, 0),
          Math.max(displayWidthPx - markerWidthPx, 0),
        );
        let row = occupiedIntervalsByRow.findIndex((occupiedIntervals) =>
          occupiedIntervals.every(
            (interval) =>
              leftPx >= interval.rightPx + 6 || leftPx + markerWidthPx <= interval.leftPx - 6,
          ),
        );
        if (row < 0) row = occupiedIntervalsByRow.length;
        occupiedIntervalsByRow[row] ??= [];
        occupiedIntervalsByRow[row]!.push({
          leftPx,
          rightPx: leftPx + markerWidthPx,
        });
        return {
          ...mark,
          row,
          leftPx,
          widthPx: markerWidthPx,
          anchorOffsetPx: anchorPx - leftPx,
        };
      });
    return { marks: positionedMarks, rowCount: occupiedIntervalsByRow.length };
  }, [
    displayWidthPx,
    layout.barLengthBeats,
    project.presentation.progressionView,
    project.presentation.showBassInStaff,
    project.progression.sections,
    system,
  ]);
  const songSectionMarks = songSectionLayout.marks;
  const scoreLabelBandPx =
    BASE_SCORE_LABEL_BAND_PX + songSectionLayout.rowCount * SONG_SECTION_MARKER_ROW_PX;

  const chordSteps = useMemo<readonly ChordStep[]>(() => {
    return Array.from(systemStepIndices)
      .map((idx) => project.progression.steps[idx])
      .filter((s): s is ChordStep => Boolean(s && s.kind === "chord"));
  }, [systemStepIndices, project.progression.steps]);

  const melodySteps = chordSteps.filter((s) => s.melody !== undefined);
  const systemHasMelody = melodySteps.length > 0;
  const currentGrid =
    melodySteps.length > 0 &&
    melodySteps.every(
      (s) =>
        s.melody?.mode === "generated" &&
        melodySteps[0]?.melody?.mode === "generated" &&
        s.melody.recipe.grid === melodySteps[0].melody.recipe.grid,
    )
      ? melodySteps[0]?.melody?.mode === "generated"
        ? melodySteps[0].melody.recipe.grid
        : undefined
      : undefined;
  const currentPitchMotion =
    melodySteps.length > 0 &&
    melodySteps.every((s) => {
      const motion =
        (s.melody?.mode === "generated" ? s.melody.recipe.pitchMotion : undefined) ??
        (s.melody as unknown as { readonly pattern?: MelodyPitchMotion })?.pattern;
      const firstMotion =
        (melodySteps[0]?.melody?.mode === "generated"
          ? melodySteps[0].melody.recipe.pitchMotion
          : undefined) ??
        (melodySteps[0]?.melody as unknown as { readonly pattern?: MelodyPitchMotion })?.pattern;
      return motion === firstMotion;
    })
      ? ((melodySteps[0]?.melody?.mode === "generated"
          ? melodySteps[0].melody.recipe.pitchMotion
          : undefined) ??
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
  const suzukiColors = project.presentation.noteColorMode === "suzuki";

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
              ...realizeProgressionStepChord(step, project.tonic),
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
  }, [isNotationView, isTablature, system.measures, measureItems, project, systemMelodyLanes]);

  const inputs = useMemo<readonly StaffSystemMeasureInput[]>(() => {
    if (!isNotationView) return [];
    return system.measures.map((measure) => {
      const harmonyEntries = (measureItems[measure.measureIndex] ?? []).map((item) =>
        harmonySequenceEntry(item, playingStepId, isTablature, project),
      );
      const melodyLanes = systemMelodyLanes.map((lane) => {
        const voiceByEvent = melodyRhythmicVoiceByEvent(lane);
        const laneEntries = (lane.measures[measure.measureIndex]?.entries ?? []).flatMap((entry) =>
          melodySequenceEntries(
            entry,
            isTablature,
            entry.kind === "note" ? optimizedMelodyTabPositions.get(entry.key) : undefined,
          ).map((sequenceEntry) => ({
            ...sequenceEntry,
            rhythmicVoice:
              entry.kind === "note"
                ? `melody:${lane.instrumentId}:${voiceByEvent.get(entry.eventKey) ?? 0}`
                : `rest:${lane.instrumentId}`,
          })),
        );
        return {
          id: lane.instrumentId,
          clef: lane.clef,
          entries: groupSimultaneousMelodyEntries(laneEntries),
        };
      });
      return {
        measureIndex: measure.measureIndex,
        widthPx: measure.requiredWidthPx,
        harmonyEntries,
        ...(melodyLanes.length > 0 ? { melodyLanes } : {}),
        ...(melodyLanes[0]?.entries ? { melodyEntries: melodyLanes[0].entries } : {}),
      };
    });
  }, [
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
    isNotationView,
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

  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeMeasureRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const wasPlaybackVisibleRef = useRef(false);

  useEffect(() => {
    const snapshot = playbackClockSnapshot;
    const activeMeasure = activeMeasureRef.current;
    const playhead = playheadRef.current;
    const hideOverlay = () => {
      if (activeMeasure) activeMeasure.style.display = "none";
      if (playhead) playhead.style.display = "none";
    };
    const canvas = canvasRef.current;
    if (!isNotationView || !snapshot || !activeMeasure || !playhead || !canvas) {
      hideOverlay();
      wasPlaybackVisibleRef.current = false;
      return;
    }

    const barLength = rationalToNumber(layout.barLengthBeats);
    const connectorInset = showBass ? 14 : 0;
    const widthScale =
      Math.max(displayWidthPx - connectorInset, 1) / Math.max(system.requiredWidthPx, 1);
    const beatStart = rationalToNumber(snapshot.startBeats);
    const beatEnd = rationalToNumber(snapshot.endBeats);
    const loopStart = snapshot.loopStartBeats ? rationalToNumber(snapshot.loopStartBeats) : null;
    const loopEnd = snapshot.loopEndBeats ? rationalToNumber(snapshot.loopEndBeats) : null;
    const sourceEvents = systemMelodyLanes.flatMap((lane) =>
      lane.events.map((event) => ({
        key: event.eventKey,
        start: rationalToNumber(event.startBeats),
        end: rationalToNumber(event.startBeats) + rationalToNumber(event.durationBeats),
      })),
    );
    const sourceNoteElements = Array.from(
      canvas.querySelectorAll<SVGElement>("[data-source-event-keys]"),
    ).map((element) => {
      let keys: readonly string[] = [];
      try {
        const parsed: unknown = JSON.parse(element.getAttribute("data-source-event-keys") ?? "[]");
        if (Array.isArray(parsed) && parsed.every((key) => typeof key === "string")) {
          keys = parsed;
        }
      } catch {
        // Ignore malformed metadata on a rendered SVG element.
      }
      return { element, keys, originalFilter: element.style.filter };
    });
    let activeSourceSignature = "";
    let lastMeasureIndex: number | null = null;
    let frameId = 0;
    const clearSourceHighlights = () => {
      sourceNoteElements.forEach(({ element, originalFilter }) => {
        element.style.filter = originalFilter;
        element.removeAttribute("data-staff-sounding");
      });
    };
    const hideForPosition = () => {
      hideOverlay();
      clearSourceHighlights();
      activeSourceSignature = "";
      lastMeasureIndex = null;
      wasPlaybackVisibleRef.current = false;
    };

    const tick = (frameNow: number) => {
      if (snapshot.state === "playing" && frameNow < snapshot.performanceClockAnchorMs) {
        hideForPosition();
        frameId = requestAnimationFrame(tick);
        return;
      }

      const elapsedBeats =
        snapshot.state === "playing"
          ? (Math.max(0, frameNow - snapshot.performanceClockAnchorMs) * snapshot.tempoBpm) / 60_000
          : 0;
      let beat = snapshot.musicalPositionAnchorBeats + elapsedBeats;
      if (loopStart !== null && loopEnd !== null && loopEnd > loopStart && beat >= loopEnd) {
        beat = loopStart + ((beat - loopStart) % (loopEnd - loopStart));
      }
      if (beat < beatStart || (loopStart === null && beat >= beatEnd)) {
        hideForPosition();
        if (snapshot.state === "playing") frameId = requestAnimationFrame(tick);
        return;
      }

      const measurePosition = system.measures.findIndex(({ measure }) => {
        const start = rationalToNumber(measure.startBeats);
        const end = rationalToNumber(measure.endBeats);
        return beat >= start && beat < end;
      });
      if (measurePosition < 0) {
        hideForPosition();
        if (snapshot.state === "playing") frameId = requestAnimationFrame(tick);
        return;
      }

      const projectedMeasure = system.measures[measurePosition]!;
      const measureLeft =
        connectorInset +
        system.measures
          .slice(0, measurePosition)
          .reduce((sum, measure) => sum + measure.requiredWidthPx, 0) *
          widthScale;
      const measureWidth = projectedMeasure.requiredWidthPx * widthScale;
      const measureStartBeat = rationalToNumber(projectedMeasure.measure.startBeats);
      const x =
        measureLeft +
        Math.min(Math.max((beat - measureStartBeat) / Math.max(barLength, 1e-9), 0), 1) *
          measureWidth;
      activeMeasure.style.display = "block";
      activeMeasure.style.left = `${measureLeft}px`;
      activeMeasure.style.width = `${measureWidth}px`;
      activeMeasure.dataset.measureIndex = String(projectedMeasure.measureIndex);
      playhead.style.display = "block";
      playhead.style.transform = `translateX(${x}px)`;

      if (!wasPlaybackVisibleRef.current) {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
      if (lastMeasureIndex !== projectedMeasure.measureIndex && system.horizontallyScrollable) {
        const container = scrollContainerRef.current;
        if (
          container &&
          (x > container.scrollLeft + container.clientWidth - 100 || x < container.scrollLeft + 40)
        ) {
          container.scrollTo({
            left: Math.max(0, x - container.clientWidth / 3),
            behavior: "smooth",
          });
        }
      }
      wasPlaybackVisibleRef.current = true;
      lastMeasureIndex = projectedMeasure.measureIndex;

      const activeSourceKeys = sourceEvents
        .filter((event) => beat >= event.start && beat < event.end)
        .map((event) => event.key)
        .sort();
      const nextSignature = activeSourceKeys.join("\u0000");
      if (nextSignature !== activeSourceSignature) {
        const activeSet = new Set(activeSourceKeys);
        sourceNoteElements.forEach(({ element, keys, originalFilter }) => {
          const active = keys.some((key) => activeSet.has(key));
          element.style.filter = active
            ? "drop-shadow(0 0 3px var(--score-playback-border, #8a5732))"
            : originalFilter;
          if (active) element.setAttribute("data-staff-sounding", "true");
          else element.removeAttribute("data-staff-sounding");
        });
        activeSourceSignature = nextSignature;
      }
      if (snapshot.state === "playing") frameId = requestAnimationFrame(tick);
    };

    tick(performance.now());
    return () => {
      cancelAnimationFrame(frameId);
      hideOverlay();
      clearSourceHighlights();
      wasPlaybackVisibleRef.current = false;
    };
  }, [
    displayWidthPx,
    inputs,
    isNotationView,
    layout.barLengthBeats,
    playbackClockSnapshot,
    showBass,
    system,
    systemMelodyLanes,
  ]);

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
        data-horizontally-scrollable={systemHorizontallyScrollable ? "true" : undefined}
        data-is-muted={isMuted ? "true" : undefined}
        data-is-solo={isSolo ? "true" : undefined}
        data-is-looping={isLooping ? "true" : undefined}
        aria-label={`Score system ${system.index + 1}, measures ${system.measures[0]?.measure.number} through ${system.measures.at(-1)?.measure.number}`}
      >
        <header
          className="score-system-header"
          data-testid="score-system-header"
          data-system-index={system.index}
          tabIndex={project.presentation.progressionView === "piano-roll" ? 0 : undefined}
          aria-label={
            project.presentation.progressionView === "piano-roll"
              ? `Set Ctrl+A selection scope to System ${system.index + 1}`
              : undefined
          }
          aria-keyshortcuts={
            project.presentation.progressionView === "piano-roll" ? "Enter Space" : undefined
          }
          onFocus={(event) => {
            if (
              project.presentation.progressionView === "piano-roll" &&
              event.target === event.currentTarget
            )
              onSetPianoRollSystemScope?.(system.index);
          }}
          onClick={(event) => {
            if (
              project.presentation.progressionView === "piano-roll" &&
              event.target === event.currentTarget
            )
              onSetPianoRollSystemScope?.(system.index);
          }}
          onKeyDown={(event) => {
            if (
              project.presentation.progressionView !== "piano-roll" ||
              event.target !== event.currentTarget ||
              (event.key !== "Enter" && event.key !== " ")
            )
              return;
            event.preventDefault();
            event.stopPropagation();
            onSetPianoRollSystemScope?.(system.index);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSystemMenu({
              anchor: e.currentTarget,
              position: { x: e.clientX, y: e.clientY },
            });
          }}
        >
          {onAuditionSystem ? (
            <button
              type="button"
              data-testid={`score-system-audition-${system.index}`}
              aria-label={`Play System ${system.index + 1}`}
              onFocus={() => onSetPianoRollSystemScope?.(system.index)}
              onClick={() => {
                onSetPianoRollSystemScope?.(system.index);
                onAuditionSystem(system);
              }}
            >{`System ${system.index + 1}`}</button>
          ) : (
            <strong>{`System ${system.index + 1}`}</strong>
          )}
          {project.presentation.progressionView === "piano-roll" && onSetPianoRollSystemScope ? (
            <button
              type="button"
              className="piano-roll-system-scope-button"
              data-testid={`piano-roll-system-scope-${system.index}`}
              aria-label={`Set Ctrl+A scope to System ${system.index + 1}`}
              onFocus={() => onSetPianoRollSystemScope(system.index)}
              onClick={(event) => {
                event.stopPropagation();
                onSetPianoRollSystemScope(system.index);
              }}
            >
              Scope
            </button>
          ) : null}
          {project.presentation.progressionView === "piano-roll" && onSelectPianoRollSystemNotes ? (
            <PianoRollSelectionAction
              accessibleName={`Select effective Melody notes in System ${system.index + 1}`}
              title={`Select Melody notes in System ${system.index + 1}`}
              testId={`piano-roll-select-system-notes-${system.index}`}
              selectionScopeLabel={pianoRollSelectionScopeLabel}
              onSelect={() => onSelectPianoRollSystemNotes(system)}
            >
              Select
            </PianoRollSelectionAction>
          ) : null}
          <span>{`${system.measures.length} measure${system.measures.length === 1 ? "" : "s"}`}</span>
          {project.presentation.progressionView === "staff" ||
          project.presentation.progressionView === "tablature" ? (
            <div
              className="score-system-measure-menu-triggers"
              role="group"
              aria-label={`Measure commands in System ${system.index + 1}`}
            >
              {system.measures.map(({ measure }) => (
                <div key={measure.measureIndex} className="score-system-measure-actions">
                  <button
                    type="button"
                    className="score-system-measure-menu-trigger"
                    data-measure-context-trigger
                    data-measure-index={measure.measureIndex}
                    aria-label={`Measure ${measure.number} commands`}
                    aria-haspopup="menu"
                    title={`Measure ${measure.number} commands`}
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      onOpenMeasureMenu?.(measure.measureIndex, event.currentTarget, {
                        x: rect.left,
                        y: rect.bottom,
                      });
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenMeasureMenu?.(measure.measureIndex, event.currentTarget, {
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      onOpenMeasureMenu?.(measure.measureIndex, event.currentTarget, {
                        x: rect.left,
                        y: rect.bottom,
                      });
                    }}
                  >
                    Measure {measure.number} <span aria-hidden="true">⋯</span>
                  </button>
                  {onDeleteMeasureFromButton ? (
                    <button
                      type="button"
                      className="measure-close-trigger"
                      data-measure-close-trigger
                      data-measure-index={measure.measureIndex}
                      aria-label={`Delete Measure ${measure.number}`}
                      title={`Delete Measure ${measure.number}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteMeasureFromButton(measure.measureIndex, event.currentTarget);
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {renderSystemChordPanel?.(system) ?? renderSystemNotePanel?.(system)}
          {renderSystemControls?.(system)}
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
          {systemHorizontallyScrollable ? <span>Dense measure scrolls locally</span> : null}
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
          className={`score-system-pitch-layout${renderSystemPitchScale ? " has-system-pitch-scale" : ""}`}
          data-testid={renderSystemPitchScale ? "score-system-pitch-layout" : undefined}
          data-system-index={renderSystemPitchScale ? system.index : undefined}
        >
          {renderSystemPitchScale?.(system)}
          <div
            ref={scrollContainerRef}
            className="score-system-scroll"
            style={{
              maxWidth: "100%",
              overflowX: systemHorizontallyScrollable ? "auto" : "hidden",
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
                  height: `${systemHeight + scoreLabelBandPx}px`,
                }}
              >
                <div
                  ref={activeMeasureRef}
                  className="score-system-active-measure"
                  data-testid={`score-system-active-measure-${system.index}`}
                  style={{
                    display: "none",
                    position: "absolute",
                    left: 0,
                    width: 0,
                    top: `${scoreLabelBandPx}px`,
                    height: `${systemHeight}px`,
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                />
                <div
                  ref={playheadRef}
                  className="score-system-playhead"
                  data-testid={`score-system-playhead-${system.index}`}
                  style={{
                    display: "none",
                    position: "absolute",
                    left: 0,
                    top: `${scoreLabelBandPx}px`,
                    height: `${systemHeight}px`,
                    willChange: "transform",
                  }}
                >
                  <div className="score-system-playhead-cap" />
                  <div className="score-system-playhead-line" />
                </div>
                {songSectionMarks.map((mark) => (
                  <div
                    className="song-section-score-marker"
                    key={`${mark.stepId}:${mark.measureNumber}`}
                    data-testid="song-section-boundary"
                    data-step-id={mark.stepId}
                    data-section-marker-row={mark.row}
                    data-section-anchor-x={mark.anchorOffsetPx}
                    aria-label={`${mark.names.join(", ")} section boundary at Step ${mark.stepNumber}, Measure ${mark.measureNumber}`}
                    style={
                      {
                        left: `${mark.leftPx}px`,
                        top: `${mark.row * SONG_SECTION_MARKER_ROW_PX}px`,
                        width: `${mark.widthPx}px`,
                        "--section-marker-anchor-offset": `${mark.anchorOffsetPx}px`,
                      } as CSSProperties
                    }
                  >
                    <span
                      className="song-section-boundary song-section-marker-name"
                      title={mark.names.join(" · ")}
                    >
                      {mark.names.join(" · ")}
                    </span>
                    <span className="song-section-boundary-position">
                      Step {mark.stepNumber} · Measure {mark.measureNumber}
                    </span>
                  </div>
                ))}
                <div
                  ref={canvasRef}
                  className="measure-staff score-system-canvas"
                  role="img"
                  aria-label={`Score notation for measures ${system.measures[0]?.measure.number} through ${system.measures.at(-1)?.measure.number}`}
                  style={{
                    position: "absolute",
                    top: `${scoreLabelBandPx}px`,
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
                            top: `${scoreLabelBandPx + laneIndex * (SCORE_STAFF_HEIGHT_PX + SCORE_STAFF_GAP_PX) + 2}px`,
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
                    const selected =
                      rangeSelectedStepIds?.has(item.stepId) || selectedStepId === item.stepId;
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
                    const resizeGeometry = systemMeasureResizeGeometry(
                      system,
                      displayWidthPx,
                      projectedMeasure.measureIndex,
                      showBass,
                    );
                    const style = {
                      "--measure-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
                      "--measure-staff-event-span": `${systemMeasureSpan(system, displayWidthPx, projectedMeasure.measureIndex, Math.max(durationRatio, 0), showBass) * 100}%`,
                      top: `${scoreLabelBandPx + harmonyRowTop + 3}px`,
                      bottom: "auto",
                      height: `${SCORE_STAFF_HEIGHT_PX - 6}px`,
                    } as CSSProperties;
                    return (
                      <div
                        key={`${projectedMeasure.measureIndex}-${item.key}`}
                        className={`measure-staff-event ${selected ? "is-selected" : ""} ${playing ? "is-playing" : ""} ${item.kind === "rest" ? "is-rest" : ""} ${chord && !chord.startsHere ? "is-continuation" : ""} ${renderDurationResizeHandle && chord && !chord.continuesToNext ? "has-duration-resize-handle" : ""}`}
                        style={style}
                        data-staff-item-key={item.key}
                        data-resize-measure-left-px={resizeGeometry.leftPx}
                        data-resize-measure-width-px={resizeGeometry.widthPx}
                        data-resize-paper-width-px={displayWidthPx}
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
                        {item.kind === "chord" &&
                        !item.continuesToNext &&
                        renderDurationResizeHandle
                          ? renderDurationResizeHandle(item, projectedMeasure.measure)
                          : null}
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
                      top: `${scoreLabelBandPx + harmonyRowTop + 50}px`,
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
                        const selected =
                          rangeSelectedStepIds?.has(entry.sourceStepId) ||
                          selectedStepId === entry.sourceStepId;
                        const active = activeMelodyEventKey === entry.eventKey;
                        const label = `Melody ${melodyInstrumentLabel(lane.instrumentId)}, ${formatPitch(entry.pitch)}, onset ${exact(entry.startBeats)} beats, duration ${exact(entry.durationBeats)} beats, source chord ${sourceChordLabel(project, entry.sourceStepId)}`;
                        const style = {
                          "--melody-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
                          top: `${scoreLabelBandPx + laneIndex * (SCORE_STAFF_HEIGHT_PX + SCORE_STAFF_GAP_PX) + 4 + (melodyRows[annotationKey] ?? 0) * MELODY_NOTE_ANNOTATION_ROW_GAP_PX}px`,
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
                className={`score-system-measures-row${
                  hasPianoRollMeasureSlots ? " piano-roll-system-measures-row" : ""
                }`}
                data-testid="score-system-measures-row"
                data-system-index={system.index}
                style={{
                  width: hasPianoRollMeasureSlots
                    ? `${pianoRollSystemWidthPx}px`
                    : system.horizontallyScrollable
                      ? `${displayWidthPx}px`
                      : "100%",
                  minWidth: hasPianoRollMeasureSlots
                    ? `${pianoRollSystemWidthPx}px`
                    : system.horizontallyScrollable
                      ? `${displayWidthPx}px`
                      : "100%",
                  ...(hasPianoRollMeasureSlots
                    ? {
                        gridTemplateColumns: `repeat(${pianoRollMeasureCapacity}, minmax(${pianoRollMeasureMinimumWidthPx}px, 1fr))`,
                      }
                    : {}),
                }}
              >
                {system.measures.map((sm) =>
                  renderMeasureContent ? renderMeasureContent(sm.measure, system.index) : null,
                )}
              </div>
            )}
          </div>
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
  readonly pianoRollMeasureMinimumWidthPx?: number | undefined;
  readonly selectedStepId: string | undefined;
  readonly rangeSelectedStepIds?: ReadonlySet<string> | undefined;
  readonly playingStepId: string | undefined;
  readonly activeMelodyEventKey: string | null | undefined;
  readonly playbackClockSnapshot?: PlaybackClockSnapshot | null | undefined;
  readonly measureItemsForMeasure: (measure: ProgressionMeasure) => readonly MeasureStaffItem[];
  readonly onSelectStep: (stepId: string) => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: MelodyMenuPosition,
  ) => void;
  readonly onOpenMeasureMenu?: (
    measureIndex: number,
    anchor: HTMLElement,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly onDeleteMeasureFromButton?: (measureIndex: number, invoker: HTMLElement) => void;
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
  readonly onAuditionSystem?: ((system: ScoreSystem) => void) | undefined;
  readonly onSetPianoRollSystemScope?: ((systemIndex: number) => void) | undefined;
  readonly onSelectPianoRollSystemNotes?: ((system: ScoreSystem) => void) | undefined;
  readonly pianoRollSelectionScopeLabel?: string | undefined;
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
  readonly renderMeasureContent?:
    ((measure: ProgressionMeasure, systemIndex?: number) => ReactNode) | undefined;
  readonly renderSystemPitchScale?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderSystemNotePanel?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderSystemControls?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderSystemChordPanel?: ((system: ScoreSystem) => ReactNode) | undefined;
  readonly renderDurationResizeHandle?: (
    item: MeasureStaffChordItem,
    measure: ProgressionMeasure,
  ) => ReactNode | undefined;
}

/** Responsive multi-measure Staff and Tablature projection used by My Progression. */
export function ScoreSystemView({
  project,
  layout,
  melodyTimeline,
  measuresPerSystem,
  pianoRollMeasureMinimumWidthPx,
  selectedStepId,
  rangeSelectedStepIds,
  playingStepId,
  activeMelodyEventKey,
  playbackClockSnapshot,
  measureItemsForMeasure,
  onSelectStep,
  onEditPerformance,
  onReorder,
  onOpenMelodyMenu,
  onOpenMeasureMenu,
  onDeleteMeasureFromButton,
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
  onAuditionSystem,
  onSetPianoRollSystemScope,
  onSelectPianoRollSystemNotes,
  pianoRollSelectionScopeLabel,
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
  renderSystemPitchScale,
  renderSystemNotePanel,
  renderSystemChordPanel,
  renderSystemControls,
  renderDurationResizeHandle,
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
  const isStaffView = project.presentation.progressionView === "staff";
  const usesScoreSystems =
    isStaffView ||
    project.presentation.progressionView === "tablature" ||
    project.presentation.progressionView === "piano-roll";
  const projection = useMemo(() => {
    if (!usesScoreSystems) return null;
    return projectScoreSystems(layout, {
      availableWidthPx: availableWidthPx || DEFAULT_SCORE_WIDTH_PX,
      measuresPerSystem,
      additionalAttacks,
    });
  }, [additionalAttacks, availableWidthPx, usesScoreSystems, layout, measuresPerSystem]);
  const progressionViewLabel = isStaffView
    ? "Staff score"
    : usesScoreSystems
      ? "Tablature score"
      : `${project.presentation.progressionView.charAt(0).toUpperCase()}${project.presentation.progressionView.slice(1)} progression`;
  const scoreLabel = projection
    ? `${progressionViewLabel} systems; ${measuresPerSystem === "auto" ? `Auto currently allows up to ${projection.maximumMeasuresPerSystem} measures per system` : `up to ${projection.maximumMeasuresPerSystem} measures per system`}`
    : `${progressionViewLabel} measures`;

  return (
    <div
      ref={rootRef}
      className={`score-system-view${usesScoreSystems ? "" : " progression-measures-stack"}`}
      data-testid="progression-score-systems"
      data-progression-view={project.presentation.progressionView}
      data-layout-mode={usesScoreSystems ? "systems" : "measures"}
      data-system-count={projection?.systems.length}
      data-measures-per-system={usesScoreSystems ? String(measuresPerSystem) : undefined}
      data-auto-maximum={
        usesScoreSystems && measuresPerSystem === "auto"
          ? projection?.maximumMeasuresPerSystem
          : undefined
      }
      aria-label={scoreLabel}
      style={{ gridColumn: "1 / -1", minWidth: 0, width: "100%", maxWidth: "100%" }}
    >
      {projection
        ? projection.systems.map((system) => {
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
                {...(renderSystemPitchScale
                  ? {
                      pianoRollMeasureCapacity: projection.maximumMeasuresPerSystem,
                      pianoRollMeasureMinimumWidthPx: pianoRollMeasureMinimumWidthPx ?? 250,
                      pianoRollMusicViewportWidthPx: Math.max(
                        0,
                        projection.availableWidthPx -
                          PIANO_ROLL_PITCH_GUTTER_WIDTH_PX -
                          SCORE_SYSTEM_VIEW_BORDER_WIDTH_PX,
                      ),
                    }
                  : {})}
                melodyTimeline={melodyTimeline}
                measureItems={measureItems}
                selectedStepId={selectedStepId}
                rangeSelectedStepIds={rangeSelectedStepIds}
                playingStepId={playingStepId}
                activeMelodyEventKey={activeMelodyEventKey}
                playbackClockSnapshot={playbackClockSnapshot}
                onSelectStep={onSelectStep}
                onEditPerformance={onEditPerformance}
                onReorder={onReorder}
                {...(onOpenMelodyMenu ? { onOpenMelodyMenu } : {})}
                {...(onOpenMeasureMenu ? { onOpenMeasureMenu } : {})}
                {...(onDeleteMeasureFromButton ? { onDeleteMeasureFromButton } : {})}
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
                onAuditionSystem={onAuditionSystem}
                onSetPianoRollSystemScope={onSetPianoRollSystemScope}
                onSelectPianoRollSystemNotes={onSelectPianoRollSystemNotes}
                pianoRollSelectionScopeLabel={pianoRollSelectionScopeLabel}
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
                {...(renderSystemPitchScale ? { renderSystemPitchScale } : {})}
                {...(renderSystemNotePanel ? { renderSystemNotePanel } : {})}
                {...(renderSystemChordPanel ? { renderSystemChordPanel } : {})}
                {...(renderSystemControls ? { renderSystemControls } : {})}
                {...(renderDurationResizeHandle ? { renderDurationResizeHandle } : {})}
              />
            );
          })
        : layout.measures.map((measure) => renderMeasureContent?.(measure) ?? null)}
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
