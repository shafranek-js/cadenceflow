import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { exactPitch, type ExactPitch } from "../../domain/harmony/pitch";
import type { AuthoredMelodyEdit } from "../../app/commands/authoredMelodyTransaction";
import { rational } from "../../domain/timing/rational";
import type { Project } from "../../domain/project/project";
import type { ChordMelodyRecipe } from "../../domain/melody/types";
import type {
  ProgressionMeasureFragment,
  ProgressionMeasure,
  ProgressionMeasureLayout,
} from "../../domain/timing/measureLayout";
import {
  addRational,
  compareRational,
  multiplyRational,
  rationalToNumber,
  subtractRational,
  type Rational,
} from "../../domain/timing/rational";
import { createEffectiveMelodyTimeline } from "../../domain/melody/effectiveTimeline";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import { type LabelHierarchyMode } from "../progression/labelHierarchy";
import { Icon } from "../common/Icon";
import { ProgressionChordLabel } from "../progression/ProgressionChordLabel";
import { StepTranspositionBadge } from "../progression/StepTranspositionBadge";
import {
  createHarmonicNoteRoleContext,
  classifyHarmonicNoteRole,
} from "../../domain/harmony/noteRoles";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import {
  realizeProgressionStepChord,
  stepTranspositionSemitones,
} from "../../domain/progression/transposition";
import { getSuzukiNoteColor, getSuzukiNoteStroke } from "../../notation/suzukiColors";
import { modeForModule } from "../../domain/harmony/functions";
import {
  isPianoRollNoteAuthored,
  pianoRollDegreeLabel,
  pianoRollPaletteColor,
  pianoRollPaletteDegrees,
  projectPianoRollChordToneGuide,
  projectPianoRollScaleChordToneGuide,
  pianoRollMoveStart,
  pianoRollResolvedGestureIntent,
  pianoRollSnapBeats,
  pianoRollSnapOffsets,
  projectPianoRollNoteFragment,
} from "./pianoRollProjection";
import { snapMidiCursor } from "./midiStepInput";
import { isAppShortcutProtectedTarget } from "../studio/focusManagement";
import { PianoRollSelectionAction } from "./PianoRollSelectionAction";
import {
  pianoRollNoteIdentity,
  pianoRollRectanglesIntersect,
  planPianoRollGroupMoveByDelta,
  planPianoRollPaste,
} from "./pianoRollGroupSelection";
import {
  getPianoRollClipboard,
  getPianoRollGesture,
  setPianoRollClipboard,
  setPianoRollGesture,
  subscribePianoRollSession,
} from "./pianoRollSession";
import { derivePianoRollPitchBounds, requiredPianoRollPitchExpansion } from "./pianoRollPitchRange";
import {
  createPianoRollPitchGeometry,
  derivePianoRollScalePitchBounds,
  pianoRollPitchRows,
} from "./pianoRollGeometry";

type GridMode = "degrees" | "chromatic";
const CHROMATIC_NOTE_NAMES = [
  "C",
  "C♯/D♭",
  "D",
  "D♯/E♭",
  "E",
  "F",
  "F♯/G♭",
  "G",
  "G♯/A♭",
  "A",
  "A♯/B♭",
  "B",
];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
export type PianoRollColorMode = "hookpad" | "project" | "standard" | "suzuki" | "harmonic-role";
export interface PianoRollInspectorRequest {
  readonly stepId: string;
  readonly eventKey: string;
  readonly requestId: number;
}
function paletteStyle(degrees: readonly number[]): CSSProperties {
  const first = pianoRollPaletteColor(degrees[0] ?? 1);
  const second = pianoRollPaletteColor(degrees[1] ?? degrees[0] ?? 1);
  return {
    "--piano-roll-degree-color": first,
    "--piano-roll-degree-color-secondary": second,
    "--piano-roll-palette-pair": degrees.length > 1 ? "1" : "0",
  } as CSSProperties;
}
function pianoRollTimelineFraction(clientX: number, rect: DOMRect): number {
  return Math.max(0, Math.min(0.999999, (clientX - rect.left) / Math.max(1, rect.width)));
}

function visibleNoteRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const visible = {
    left: Math.max(0, rect.left),
    right: Math.min(window.innerWidth, rect.right),
    top: Math.max(0, rect.top),
    bottom: Math.min(window.innerHeight, rect.bottom),
  };
  for (let ancestor = element.parentElement; ancestor && ancestor !== document.body;) {
    const style = window.getComputedStyle(ancestor);
    const clipRect = ancestor.getBoundingClientRect();
    if (style.overflowX !== "visible") {
      visible.left = Math.max(visible.left, clipRect.left);
      visible.right = Math.min(visible.right, clipRect.right);
    }
    if (style.overflowY !== "visible") {
      visible.top = Math.max(visible.top, clipRect.top);
      visible.bottom = Math.min(visible.bottom, clipRect.bottom);
    }
    ancestor = ancestor.parentElement;
  }
  return visible.right > visible.left && visible.bottom > visible.top ? visible : null;
}

function formatPitchScaleLabel(
  midi: number,
  gridMode: GridMode,
  tonic: number,
  minor: boolean,
): string {
  if (gridMode === "chromatic") {
    const pc = ((midi % 12) + 12) % 12;
    const octave = String(Math.floor(midi / 12) - 1).replace(
      /\d/g,
      (digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)] ?? digit,
    );
    return `${CHROMATIC_NOTE_NAMES[pc]}${octave}`;
  }
  const pc = ((midi % 12) + 12) % 12;
  const octave = String(Math.floor(midi / 12) - 1).replace(
    /\d/g,
    (digit) => "₀₁₂₃₄₅₆₇₈₉"[Number(digit)] ?? digit,
  );
  return `${pianoRollDegreeLabel(pc, tonic, minor)}${octave}`;
}

export function PianoRollSystemPitchGutter({
  project,
  gridMode,
  pitchRange,
  pitchExpansion,
  systemIndex,
}: {
  readonly project: Project;
  readonly gridMode: GridMode;
  readonly pitchRange: number;
  readonly pitchExpansion: number;
  readonly systemIndex: number;
}) {
  const notes = useMemo(() => createEffectiveMelodyTimeline(project), [project]);
  const tonic = project.tonic;
  const pitchMode = modeForModule(project.activeModule) === "major" ? "major" : "minor";
  const pitchValues = notes.map((note) => note.pitch.midiNumber);
  const bounds =
    gridMode === "degrees"
      ? derivePianoRollScalePitchBounds(pitchValues, tonic, pitchMode, pitchRange, pitchExpansion)
      : derivePianoRollPitchBounds(pitchValues, tonic, pitchRange, pitchExpansion);
  const geometry = createPianoRollPitchGeometry(bounds.min, bounds.max, tonic, pitchMode, gridMode);
  const rowCount = geometry.unitCount;
  const height = Math.max(54, rowCount * 18);
  const pitchRows = pianoRollPitchRows(bounds.min, bounds.max, geometry);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const [gridTop, setGridTop] = useState(0);

  useLayoutEffect(() => {
    const gutter = gutterRef.current;
    const layout = gutter?.parentElement;
    const firstMeasure = layout?.querySelector<HTMLElement>(".piano-roll-measure");
    const grid = firstMeasure?.querySelector<HTMLElement>(".piano-roll-grid");
    if (!firstMeasure || !grid) return;
    const update = () => {
      const measureRect = firstMeasure.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      setGridTop((current) =>
        Math.abs(current - (gridRect.top - measureRect.top)) < 0.25
          ? current
          : gridRect.top - measureRect.top,
      );
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(firstMeasure);
    observer?.observe(grid);
    for (const child of Array.from(firstMeasure.children).slice(0, 2)) observer?.observe(child);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [gridMode, project.globalTiming.meter, rowCount]);

  return (
    <div
      ref={gutterRef}
      className="piano-roll-system-pitch-gutter"
      data-testid="piano-roll-system-pitch-gutter"
      data-system-index={systemIndex}
      data-pitch-row-count={pitchRows.length}
      data-pitch-unit-count={rowCount}
      role="group"
      aria-label={`Pitch scale for System ${systemIndex + 1}`}
    >
      <div aria-hidden="true" style={{ height: `${gridTop}px`, flex: `0 0 ${gridTop}px` }} />
      <div
        className={`piano-roll-system-pitch-scale ${gridMode === "chromatic" ? "is-chromatic" : "is-degrees"}`}
        data-testid="piano-roll-system-pitch-scale"
        style={{
          height: `${height}px`,
          gridTemplateRows: `repeat(${rowCount}, minmax(18px, 1fr))`,
        }}
      >
        {pitchRows.map((midi) => {
          const pc = ((midi % 12) + 12) % 12;
          const inScale = geometry.isDiatonicPitch(midi);
          const degrees = pianoRollPaletteDegrees(pc, tonic, project.activeModule);
          return (
            <div
              key={midi}
              className={`piano-roll-system-pitch-row ${pc % 12 === 0 ? "is-octave" : ""} ${inScale ? "is-scale" : "is-accidental"} ${[1, 3, 6, 8, 10].includes(pc) ? "is-black-key" : "is-white-key"}`}
              data-pitch-midi={midi}
              data-palette-degrees={degrees.join("-")}
              style={{
                gridRow: `${geometry.rowStart(midi) + 1} / span 1`,
                ...paletteStyle(degrees),
              }}
            >
              <span aria-hidden="true">
                {formatPitchScaleLabel(
                  midi,
                  gridMode,
                  tonic,
                  modeForModule(project.activeModule) !== "major",
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function pianoRollResizeHitWidth(width: number): number {
  return Math.min(7, Math.max(1, (width - 1) / 2));
}
export interface PianoRollToolbarProps {
  readonly gridMode: GridMode;
  readonly onGridModeChange: (mode: GridMode) => void;
  readonly zoom: number;
  readonly onZoomChange: (zoom: number) => void;
  readonly snap: string;
  readonly onSnapChange: (snap: string) => void;
  readonly pitchRange: number;
  readonly onPitchRangeChange: (range: number) => void;
  readonly colorMode: PianoRollColorMode;
  readonly onColorModeChange: (mode: PianoRollColorMode) => void;
  readonly guidesEnabled: boolean;
  readonly onGuidesEnabledChange: (enabled: boolean) => void;
  readonly selectionScopeLabel?: string;
}

function PianoRollPlayhead({
  measure,
  stepStart,
  startedAt,
  playing,
  tempoBpm,
  audition,
  onAuditionFinished,
}: {
  measure: ProgressionMeasure;
  stepStart: Rational | null;
  startedAt?: number | null | undefined;
  playing: boolean;
  tempoBpm: number;
  audition?: {
    readonly requestId: number;
    readonly startBeat: number;
    readonly endBeat: number;
    readonly startedAt: number;
    readonly clockNow: () => number;
  } | null;
  onAuditionFinished?: ((requestId: number) => void) | undefined;
}) {
  const [frameTime, setFrameTime] = useState<number | null>(null);
  useEffect(() => {
    if (!audition && (!playing || stepStart === null || startedAt == null)) return;
    let raf = 0;
    const tick = () => {
      const frameNow = performance.now();
      setFrameTime(frameNow);
      if (audition) {
        const elapsedSeconds = Math.max(0, audition.clockNow() - audition.startedAt);
        const beat = audition.startBeat + (elapsedSeconds * Math.max(1, tempoBpm)) / 60;
        if (beat >= audition.endBeat) {
          onAuditionFinished?.(audition.requestId);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, stepStart, startedAt, audition, onAuditionFinished, tempoBpm]);
  if (!audition && (!playing || stepStart === null || startedAt == null)) return null;
  const baseBeat = audition?.startBeat ?? (stepStart ? rationalToNumber(stepStart) : null);
  const baseTime = audition?.startedAt ?? startedAt;
  if (baseBeat === null || baseTime == null) return null;
  const elapsedMs = audition
    ? Math.max(0, (audition.clockNow() - audition.startedAt) * 1000)
    : Math.max(0, (frameTime ?? baseTime) - baseTime);
  const beat = baseBeat + (elapsedMs * Math.max(1, tempoBpm)) / 60_000;
  const start = rationalToNumber(measure.startBeats);
  const end = rationalToNumber(measure.endBeats);
  if (beat < start || beat > end || (audition && beat >= audition.endBeat)) return null;
  const left = ((beat - start) / (end - start)) * 100;
  return (
    <div
      className="piano-roll-playhead"
      style={{ left: `${left}%` }}
      data-testid="piano-roll-playhead"
      data-current-beat={beat.toFixed(4)}
      data-audition-end-beat={audition?.endBeat}
    />
  );
}

export function PianoRollToolbar({
  gridMode,
  onGridModeChange,
  zoom,
  onZoomChange,
  snap,
  onSnapChange,
  pitchRange,
  onPitchRangeChange,
  colorMode,
  onColorModeChange,
  guidesEnabled,
  onGuidesEnabledChange,
  selectionScopeLabel = "Progression",
}: PianoRollToolbarProps) {
  return (
    <div
      className="piano-roll-toolbar"
      role="group"
      aria-label="Piano Roll display controls"
      data-testid="piano-roll-toolbar"
    >
      <div role="group" aria-label="Pitch grid">
        <button
          type="button"
          aria-pressed={gridMode === "degrees"}
          onClick={() => onGridModeChange("degrees")}
        >
          Degrees
        </button>
        <button
          type="button"
          aria-pressed={gridMode === "chromatic"}
          onClick={() => onGridModeChange("chromatic")}
        >
          Chromatic
        </button>
      </div>
      <label>
        Snap{" "}
        <select
          aria-label="Snap resolution"
          value={snap}
          onChange={(e) => onSnapChange(e.target.value)}
        >
          {[
            "1/1",
            "1/2",
            "1/4",
            "1/8",
            "1/16",
            "1/1 triplet",
            "1/2 triplet",
            "1/4 triplet",
            "1/8 triplet",
            "1/16 triplet",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Horizontal zoom{" "}
        <input
          aria-label="Horizontal zoom"
          type="range"
          min="70"
          max="180"
          step="10"
          value={zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
        />
      </label>
      <label>
        Vertical range{" "}
        <select
          aria-label="Vertical range"
          value={pitchRange}
          onChange={(e) => onPitchRangeChange(Number(e.target.value))}
        >
          <option value={0}>Auto</option>
          <option value={1}>Extend one octave</option>
          <option value={2}>Extend two octaves</option>
        </select>
      </label>
      <label>
        Note colors{" "}
        <select
          aria-label="Piano Roll note colors"
          value={colorMode}
          onChange={(event) => onColorModeChange(event.target.value as PianoRollColorMode)}
        >
          <option value="hookpad">Scale degrees</option>
          <option value="project">Project setting</option>
          <option value="standard">Standard</option>
          <option value="suzuki">Suzuki</option>
          <option value="harmonic-role">Harmonic roles</option>
        </select>
      </label>
      <button
        type="button"
        aria-label="Guides"
        aria-pressed={guidesEnabled}
        title="Highlight chord tones. Colored rows are chord tones and stable guide notes; neutral rows are more dissonant."
        onClick={() => onGuidesEnabledChange(!guidesEnabled)}
      >
        Guides
      </button>
      <span className="piano-roll-selection-scope" data-testid="piano-roll-selection-scope">
        Ctrl/Cmd+A: {selectionScopeLabel}
      </span>
    </div>
  );
}

export function PianoRollMeasure({
  project,
  layout,
  measure,
  systemIndex,
  selectedStepId,
  selectedChordStepIds,
  selectedNoteKey,
  selectedNoteIdentities,
  onNoteSelectionChange,
  onReplaceNoteSelection,
  onClearNoteSelection,
  onActiveMeasureChange,
  onSelectMeasureNotes,
  selectionScopeLabel,
  playingStepId,
  activeEventStartedAt,
  transportPlaying,
  labelMode,
  onSelectStep,
  onHarmonySelected,
  renderBoundaryResizeHandle,
  boundaryResizePreview,
  onNoteSelect,
  zoom,
  gridMode,
  pitchRange,
  snap,
  pitchExpansion = 0,
  onPitchExpansionChange,
  onApplyMelodyEdits,
  onAuditionMeasure,
  onOpenMeasureMenu,
  onDeleteMeasureFromButton,
  onAuditionChord,
  onOpenMelodyMenu,
  onAuditionNote,
  auditionPlayhead,
  onAuditionFinished,
  colorMode,
  guidesEnabled,
  inspectorRequest,
  emptyCursor,
  midiCursor,
  onEmptyCellCursor,
}: {
  readonly project: Project;
  readonly layout: ProgressionMeasureLayout;
  readonly measure: ProgressionMeasure;
  readonly systemIndex?: number;
  readonly selectedStepId?: string;
  readonly selectedChordStepIds?: ReadonlySet<string>;
  readonly selectedNoteKey?: string | undefined;
  readonly selectedNoteIdentities: ReadonlySet<string>;
  readonly onNoteSelectionChange: (stepId: string, eventKey: string, additive: boolean) => void;
  readonly onReplaceNoteSelection?: (
    identities: readonly { readonly sourceStepId: string; readonly eventKey: string }[],
  ) => void;
  readonly onClearNoteSelection: () => void;
  readonly onActiveMeasureChange?: (measureIndex: number, systemIndex?: number) => void;
  readonly onSelectMeasureNotes: () => void;
  readonly selectionScopeLabel: string;
  readonly playingStepId?: string | null;
  readonly activeEventStartedAt?: number | null | undefined;
  readonly transportPlaying?: boolean | undefined;
  readonly labelMode: LabelHierarchyMode;
  readonly onSelectStep: (stepId: string) => void;
  readonly onHarmonySelected?: (
    stepId: string,
    systemIndex: number | undefined,
    additive: boolean,
  ) => void;
  readonly renderBoundaryResizeHandle?: (
    fragment: ProgressionMeasureFragment,
    edge: "left" | "right",
    measure: ProgressionMeasure,
  ) => ReactNode;
  readonly boundaryResizePreview?: Rational | null;
  readonly onNoteSelect: (stepId: string, eventKey: string, systemIndex?: number) => void;
  readonly zoom: number;
  readonly gridMode: GridMode;
  readonly pitchRange: number;
  readonly pitchExpansion?: number;
  readonly onPitchExpansionChange?: (expansion: number) => void;
  readonly snap: string;
  readonly onApplyMelodyEdits?: (
    edits: readonly AuthoredMelodyEdit[],
    convertStepIds?: readonly string[],
    expectedUpdatedAt?: string,
    appendSteps?: readonly import("../../domain/progression/step").RestStep[],
  ) => string | null | void;
  readonly onSetMelodyRecipe?: (stepId: string, recipe: ChordMelodyRecipe) => void;
  readonly onAuditionMeasure?: (measure: ProgressionMeasure) => void;
  readonly onOpenMeasureMenu?: (
    measureIndex: number,
    invoker: HTMLElement,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly onDeleteMeasureFromButton?: (measureIndex: number, invoker: HTMLElement) => void;
  readonly onAuditionChord?: (stepId: string) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: { readonly x: number; readonly y: number },
  ) => void;
  readonly onAuditionNote?: (stepId: string, eventKey: string) => void;
  readonly auditionPlayhead?: {
    readonly requestId: number;
    readonly startBeat: number;
    readonly endBeat: number;
    readonly startedAt: number;
    readonly clockNow: () => number;
  } | null;
  readonly onAuditionFinished?: (requestId: number) => void;
  readonly colorMode: PianoRollColorMode;
  readonly guidesEnabled: boolean;
  readonly inspectorRequest?: PianoRollInspectorRequest | null | undefined;
  readonly onEmptyCellCursor?: (cursor: {
    readonly startBeats: Rational;
    readonly pitch: ExactPitch;
  }) => void;
  readonly emptyCursor?: { readonly startBeats: Rational; readonly pitch: ExactPitch } | null;
  readonly midiCursor?: Rational | null;
}) {
  const notes = useMemo(() => createEffectiveMelodyTimeline(project), [project]);
  const gridOffsets = useMemo(
    () => pianoRollSnapOffsets(layout.barLengthBeats, snap, measure.startBeats),
    [layout.barLengthBeats, measure.startBeats, snap],
  );
  const noteGesture = useSyncExternalStore(
    subscribePianoRollSession,
    getPianoRollGesture,
    () => null,
  );
  const groupPreviews = new Map(
    noteGesture?.groupNotes?.map((entry) => [
      pianoRollNoteIdentity(entry.sourceStepId, entry.eventKey),
      entry.note,
    ]) ?? [],
  );
  const renderNotes = notes.map((note) => {
    const preview = groupPreviews.get(pianoRollNoteIdentity(note.sourceStepId, note.eventKey));
    if (preview)
      return {
        ...note,
        pitch: preview.pitch,
        startBeats: preview.startBeats,
        durationBeats: preview.durationBeats,
      };
    return noteGesture?.sourceStepId === note.sourceStepId && noteGesture.note.id === note.eventKey
      ? {
          ...note,
          pitch: noteGesture.note.pitch,
          startBeats: noteGesture.note.startBeats,
          durationBeats: noteGesture.note.durationBeats,
        }
      : note;
  });
  const visibleNotes = renderNotes.flatMap((note) => {
    const fragment = projectPianoRollNoteFragment(note, measure, layout.barLengthBeats);
    return fragment ? [{ ...note, fragment }] : [];
  });
  const sectionBoundaries = new Map(
    project.progression.steps.map((step) => [
      step.id,
      project.progression.sections
        ?.filter((section) => section.startStepId === step.id)
        .map((section) => section.name) ?? [],
    ]),
  );
  const tonic = project.tonic;
  const pitchMode = modeForModule(project.activeModule) === "major" ? "major" : "minor";
  const pitchValues = notes.map((note) => note.pitch.midiNumber);
  const deriveBounds = (gestureOctaves: number) =>
    gridMode === "degrees"
      ? derivePianoRollScalePitchBounds(pitchValues, tonic, pitchMode, pitchRange, gestureOctaves)
      : derivePianoRollPitchBounds(pitchValues, tonic, pitchRange, gestureOctaves);
  const basePitchBounds = deriveBounds(0);
  const pitchBounds = deriveBounds(pitchExpansion);
  const minPitch = pitchBounds.min;
  const maxPitch = pitchBounds.max;
  const pitchGeometry = createPianoRollPitchGeometry(
    minPitch,
    maxPitch,
    tonic,
    pitchMode,
    gridMode,
  );
  const rowCount = pitchGeometry.unitCount;
  const pitchRows = pianoRollPitchRows(minPitch, maxPitch, pitchGeometry);
  const pitchCount = pitchRows.length;
  const [focusPitch, setFocusPitch] = useState(60);
  const activeStepStart =
    layout.measures
      .flatMap((candidate) => candidate.fragments)
      .find((fragment) => fragment.stepId === selectedStepId)?.startBeats ?? measure.startBeats;
  const [keyboardStartBeats, setKeyboardStartBeats] = useState<Rational | null>(null);
  const [keyboardGridFocused, setKeyboardGridFocused] = useState(false);
  const keyboardCellStart = keyboardStartBeats ?? activeStepStart;
  const [hoveredNoteEdge, setHoveredNoteEdge] = useState<{
    eventKey: string;
    edge: "left" | "right" | "body";
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    pointerId: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    additive: boolean;
    baseline: string;
  } | null>(null);
  const marqueeRef = useRef<typeof marquee>(null);
  const updateMarquee = useCallback((value: typeof marquee) => {
    marqueeRef.current = value;
    setMarquee(value);
  }, []);
  const marqueeStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
    additive: boolean;
    baseline: string;
  } | null>(null);
  const ignoreNextEmptyGridClick = useRef(false);
  const pendingNoteGesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    originY: number;
    originGridYOffset: number;
    initialPitchExpansion: number;
    pitchRowHeight: number;
    sourceStepId: string;
    mode: "move" | "resize-left" | "resize-right";
    grabOffset: Rational;
    originalEnd: Rational;
    note: { id: string; pitch: ExactPitch; startBeats: Rational; durationBeats: Rational };
    groupNotes?: NonNullable<ReturnType<typeof getPianoRollGesture>>["groupNotes"];
  } | null>(null);
  const gestureProjectId = useRef(project.id);
  useEffect(() => {
    const cancelTransientGestures = () => {
      pendingNoteGesture.current = null;
      marqueeStart.current = null;
      ignoreNextEmptyGridClick.current = false;
      updateMarquee(null);
      setPianoRollGesture(null);
    };
    window.addEventListener("blur", cancelTransientGestures);
    return () => window.removeEventListener("blur", cancelTransientGestures);
  }, [updateMarquee]);
  useEffect(() => {
    const gesture = getPianoRollGesture();
    if (
      gestureProjectId.current !== project.id ||
      (gesture && gesture.baseline !== project.updatedAt)
    ) {
      gestureProjectId.current = project.id;
      pendingNoteGesture.current = null;
      marqueeStart.current = null;
      ignoreNextEmptyGridClick.current = false;
      updateMarquee(null);
      setPianoRollGesture(null);
    }
  }, [project.id, project.updatedAt, updateMarquee]);
  useEffect(
    () => () => {
      if (getPianoRollGesture()) setPianoRollGesture(null);
      pendingNoteGesture.current = null;
      marqueeStart.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!noteGesture && pitchExpansion > 0) onPitchExpansionChange?.(0);
  }, [noteGesture, onPitchExpansionChange, pitchExpansion]);
  const [inspectorDraft, setInspectorDraft] = useState<{
    pitch: string;
    onsetN: string;
    onsetD: string;
    durationN: string;
    durationD: string;
  } | null>(null);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const skipInspectorBlur = useRef(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPosition, setInspectorPosition] = useState<{
    readonly top: number;
    readonly left: number;
    readonly width: number;
    readonly maxHeight: number;
  } | null>(null);
  const inspectorElementRef = useRef<HTMLElement | null>(null);
  const focusInspectorOnOpen = useRef(false);
  const handledInspectorRequestId = useRef<number | null>(null);
  const pointerSelectedNoteIdentity = useRef<string | null>(null);
  const pitchSpelling = (midi: number) => {
    const names = [
      { step: "C", alter: 0 },
      { step: "C", alter: 1 },
      { step: "D", alter: 0 },
      { step: "D", alter: 1 },
      { step: "E", alter: 0 },
      { step: "F", alter: 0 },
      { step: "F", alter: 1 },
      { step: "G", alter: 0 },
      { step: "G", alter: 1 },
      { step: "A", alter: 0 },
      { step: "A", alter: 1 },
      { step: "B", alter: 0 },
    ] as const;
    const spelling = names[((midi % 12) + 12) % 12]!;
    return exactPitch(midi, spelling);
  };
  const durationForSnap = (): Rational => {
    const values: Record<string, Rational> = {
      "1/1": rational(4),
      "1/2": rational(2),
      "1/4": rational(1),
      "1/8": rational(1, 2),
      "1/16": rational(1, 4),
      "1/1 triplet": rational(8, 3),
      "1/2 triplet": rational(4, 3),
      "1/4 triplet": rational(2, 3),
      "1/8 triplet": rational(1, 3),
      "1/16 triplet": rational(1, 6),
    };
    return values[snap] ?? rational(1, 2);
  };
  const deleteSelection = (fallbackIdentity?: { sourceStepId: string; eventKey: string }) => {
    const selectedNotes = notes.filter((note) =>
      selectedNoteIdentities.has(pianoRollNoteIdentity(note.sourceStepId, note.eventKey)),
    );
    const notesToDelete =
      selectedNotes.length || !fallbackIdentity
        ? selectedNotes
        : notes.filter(
            (note) =>
              note.sourceStepId === fallbackIdentity.sourceStepId &&
              note.eventKey === fallbackIdentity.eventKey,
          );
    const edits: AuthoredMelodyEdit[] = notesToDelete.map((note) => ({
      type: "delete",
      sourceStepId: note.sourceStepId,
      noteId: note.eventKey,
    }));
    if (edits.length) {
      const first = notesToDelete[0]!;
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button.piano-roll-note:not(:disabled)"),
      );
      const oldIndex = buttons.findIndex(
        (button) =>
          button.dataset.sourceStepId === first.sourceStepId &&
          button.dataset.pianoRollEventKey === first.eventKey,
      );
      if (!onApplyMelodyEdits) {
        setEditorMessage("Melody editing is unavailable in this Piano Roll.");
        return;
      }
      const error = onApplyMelodyEdits(edits, [], project.updatedAt);
      if (error) {
        setEditorMessage(error);
        return;
      }
      onClearNoteSelection();
      setEditorMessage(null);
      requestAnimationFrame(() => {
        const current = Array.from(
          document.querySelectorAll<HTMLButtonElement>("button.piano-roll-note:not(:disabled)"),
        );
        (
          current[Math.min(oldIndex, current.length - 1)] ??
          document.querySelector<HTMLElement>(".piano-roll-grid[tabindex='0']")
        )?.focus();
      });
    }
  };
  const copySelection = (duplicate: boolean) => {
    const selectedNotes = notes.filter((note) =>
      selectedNoteIdentities.has(JSON.stringify([note.sourceStepId, note.eventKey])),
    );
    if (!selectedNotes.length) return;
    const start = selectedNotes.reduce(
      (value, note) => (compareRational(note.startBeats, value) < 0 ? note.startBeats : value),
      selectedNotes[0]!.startBeats,
    );
    setPianoRollClipboard(
      selectedNotes.map((note) => ({
        pitch: note.pitch,
        onset: subtractRational(note.startBeats, start),
        duration: note.durationBeats,
        instrument: note.instrument,
      })),
    );
    if (!duplicate) return;
    const end = selectedNotes.reduce((latest, note) => {
      const noteEnd = addRational(note.startBeats, note.durationBeats);
      return compareRational(noteEnd, latest) > 0 ? noteEnd : latest;
    }, rational(0));
    pasteSelection(end);
  };
  const pasteSelection = (anchorOverride?: Rational) => {
    const clipboard = getPianoRollClipboard();
    if (!clipboard.length) return;
    try {
      const anchor =
        anchorOverride ??
        emptyCursor?.startBeats ??
        (keyboardGridFocused ? keyboardCellStart : null);
      if (!anchor) throw new Error("Click a target time in the Piano Roll before pasting notes.");
      if (!onApplyMelodyEdits) throw new Error("Melody editing is unavailable in this Piano Roll.");
      const plan = planPianoRollPaste(project, clipboard, anchor);
      const error = onApplyMelodyEdits(plan.edits, [], project.updatedAt, plan.appendedSteps);
      if (error) throw new Error(error);
      onReplaceNoteSelection?.(plan.selection);
      const active = plan.selection[0];
      if (active) onNoteSelect(active.sourceStepId, active.eventKey, systemIndex);
      setEditorMessage(null);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Paste was rejected.");
    }
  };
  const moveGroupByKeyboard = (
    activeNote: (typeof notes)[number],
    deltaPitch: number,
    deltaStart: Rational,
  ): boolean => {
    const identity = pianoRollNoteIdentity(activeNote.sourceStepId, activeNote.eventKey);
    if (!selectedNoteIdentities.has(identity) || selectedNoteIdentities.size < 2) return false;
    const selected = notes.filter((note) =>
      selectedNoteIdentities.has(pianoRollNoteIdentity(note.sourceStepId, note.eventKey)),
    );
    if (selected.length !== selectedNoteIdentities.size) {
      setEditorMessage("A selected note is no longer available. Select the current notes again.");
      return true;
    }
    try {
      if (!onApplyMelodyEdits) throw new Error("Melody editing is unavailable in this Piano Roll.");
      const plan = planPianoRollGroupMoveByDelta(project, selected, deltaPitch, deltaStart);
      const error = onApplyMelodyEdits(plan.edits, [], project.updatedAt);
      if (error) throw new Error(error);
      onReplaceNoteSelection?.(plan.selection);
      const activeIndex = selected.findIndex(
        (note) =>
          note.sourceStepId === activeNote.sourceStepId && note.eventKey === activeNote.eventKey,
      );
      const movedActive = plan.selection[activeIndex];
      if (movedActive) onNoteSelect(movedActive.sourceStepId, movedActive.eventKey, systemIndex);
      setEditorMessage(null);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "The group move was rejected.");
    }
    return true;
  };
  const beginMarquee = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest("button, input, select, textarea, .piano-roll-note") ||
      (target !== event.currentTarget && !event.currentTarget.contains(target))
    )
      return;
    onActiveMeasureChange?.(measure.measureIndex, systemIndex);
    marqueeStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      additive: event.shiftKey,
      baseline: project.updatedAt,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional on older browser implementations.
    }
  };
  const finishMarquee = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const start = marqueeStart.current;
    const currentMarquee = marqueeRef.current;
    marqueeStart.current = null;
    updateMarquee(null);
    if (!currentMarquee || currentMarquee.pointerId !== event.pointerId || !start) return;
    if (
      commit &&
      currentMarquee.baseline === project.updatedAt &&
      start.baseline === project.updatedAt
    ) {
      const bounds = {
        left: Math.min(currentMarquee.x1, event.clientX),
        right: Math.max(currentMarquee.x1, event.clientX),
        top: Math.min(currentMarquee.y1, event.clientY),
        bottom: Math.max(currentMarquee.y1, event.clientY),
      };
      const hitByIdentity = new Map<
        string,
        { sourceStepId: string; eventKey: string; systemIndex?: number }
      >();
      for (const button of Array.from(
        document.querySelectorAll<HTMLButtonElement>("button.piano-roll-note"),
      )) {
        const sourceStepId = button.dataset.sourceStepId;
        const eventKey = button.dataset.pianoRollEventKey;
        const rect = visibleNoteRect(button);
        if (!sourceStepId || !eventKey || !rect || !pianoRollRectanglesIntersect(rect, bounds))
          continue;
        const identity = pianoRollNoteIdentity(sourceStepId, eventKey);
        const noteMeasure = button.closest<HTMLElement>(".piano-roll-measure");
        const parsedSystemIndex = Number(noteMeasure?.dataset.systemIndex);
        hitByIdentity.set(identity, {
          sourceStepId,
          eventKey,
          ...(Number.isInteger(parsedSystemIndex) ? { systemIndex: parsedSystemIndex } : {}),
        });
      }
      const hits = [...hitByIdentity.values()];
      if (hits.length) {
        hits.forEach((hit, index) =>
          onNoteSelectionChange(hit.sourceStepId, hit.eventKey, start.additive || index > 0),
        );
        onNoteSelect(hits[0]!.sourceStepId, hits[0]!.eventKey, hits[0]!.systemIndex);
      } else if (!start.additive) onClearNoteSelection();
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4)
        ignoreNextEmptyGridClick.current = true;
    }
  };
  const createAt = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = pianoRollTimelineFraction(event.clientX, rect);
    const y = Math.max(0, Math.min(0.999999, (event.clientY - rect.top) / rect.height));
    const rawStart = addRational(
      measure.startBeats,
      rational(Math.round(x * rationalToNumber(layout.barLengthBeats) * 96), 96),
    );
    const snapUnit = durationForSnap();
    const startBeats = multiplyRational(
      snapUnit,
      rational(Math.round(rationalToNumber(rawStart) / rationalToNumber(snapUnit))),
    );
    const pitch = pitchGeometry.pitchAtYFraction(y);
    const id = crypto.randomUUID();
    onApplyMelodyEdits?.([
      {
        type: "upsert",
        note: { id, pitch: pitchSpelling(pitch), startBeats, durationBeats: durationForSnap() },
      },
    ]);
  };
  const diatonicSteps = modeForModule(project.activeModule) === "major" ? MAJOR_STEPS : MINOR_STEPS;
  const displayColorMode = colorMode === "project" ? project.presentation.noteColorMode : colorMode;
  const hookpadColors = displayColorMode === "hookpad";
  const sectionLabels = measure.items.flatMap((item) =>
    item.kind === "step" && item.startsHere
      ? (() => {
          const names = sectionBoundaries.get(item.stepId) ?? [];
          return names.length
            ? [
                {
                  name: names.join(" · "),
                  left:
                    (rationalToNumber(subtractRational(item.startBeats, measure.startBeats)) /
                      rationalToNumber(layout.barLengthBeats)) *
                    100,
                },
              ]
            : [];
        })()
      : [],
  );
  const playingStepStart = (() => {
    if (!transportPlaying || !playingStepId) return null;
    let start = rational(0);
    for (const step of project.progression.steps) {
      if (step.id === playingStepId) return start;
      start = addRational(start, step.duration.beats);
    }
    return null;
  })();
  const guidePitchClassesByStep = guidesEnabled
    ? new Map(
        measure.items.flatMap((item) => {
          if (item.kind !== "step" || item.step.kind !== "chord") return [];
          const realization = realizeProgressionStepRealization(item.step, tonic);
          const pitchClasses = new Set(
            [
              ...realization.pitches.map((pitch) => pitch.pitchClassIdentity),
              ...(realization.bassPitch ? [realization.bassPitch.pitchClassIdentity] : []),
            ].map((pitchClass) => ((pitchClass % 12) + 12) % 12),
          );
          return [[item.stepId, pitchClasses] as const];
        }),
      )
    : new Map<string, ReadonlySet<number>>();
  const selectedPair = selectedNoteKey ? (JSON.parse(selectedNoteKey) as [string, string]) : null;
  const inspectorNote = selectedPair
    ? notes.find(
        (note) => note.sourceStepId === selectedPair[0] && note.eventKey === selectedPair[1],
      )
    : undefined;
  useEffect(() => {
    if (!inspectorOpen || !inspectorNote) {
      setInspectorPosition(null);
      return;
    }
    let frame = 0;
    const placeInspector = () => {
      const noteElement = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button.piano-roll-note"),
      ).find(
        (button) =>
          button.dataset.sourceStepId === inspectorNote.sourceStepId &&
          button.dataset.pianoRollEventKey === inspectorNote.eventKey,
      );
      const measureElement = noteElement?.closest<HTMLElement>(".piano-roll-measure");
      const inspectorElement = inspectorElementRef.current;
      if (!noteElement || !measureElement || !inspectorElement) return;

      const noteRect = noteElement.getBoundingClientRect();
      const measureRect = measureElement.getBoundingClientRect();
      const toolbarRect = document
        .querySelector<HTMLElement>("[data-testid='piano-roll-toolbar']")
        ?.getBoundingClientRect();
      const appHeaderRect = document
        .querySelector<HTMLElement>(".app-header")
        ?.getBoundingClientRect();
      const headerOverlapsViewport =
        appHeaderRect !== undefined &&
        appHeaderRect.bottom > 0 &&
        appHeaderRect.top < window.innerHeight;
      const headerBound = headerOverlapsViewport ? appHeaderRect.bottom + 8 : 16;
      const toolbarOverlapsViewport =
        toolbarRect !== undefined && toolbarRect.bottom > 0 && toolbarRect.top < window.innerHeight;
      const toolbarBound = toolbarOverlapsViewport ? toolbarRect.bottom + 8 : 16;
      const topBound = Math.max(16, headerBound, toolbarBound);
      const viewportBottom = window.innerHeight - 8;
      const maxHeight = Math.max(80, Math.min(380, viewportBottom - topBound));
      const visibleMeasureLeft = Math.max(8, measureRect.left + 8);
      const visibleMeasureRight = Math.min(window.innerWidth - 8, measureRect.right - 8);
      const width = Math.max(120, Math.min(320, visibleMeasureRight - visibleMeasureLeft));
      const maxLeft = Math.max(visibleMeasureLeft, visibleMeasureRight - width);
      const preferredLeft =
        noteRect.right + width + 8 <= visibleMeasureRight
          ? noteRect.right + 8
          : noteRect.left - width - 8;
      const left = Math.max(visibleMeasureLeft, Math.min(maxLeft, preferredLeft));
      const measuredHeight = Math.min(inspectorElement.scrollHeight || 280, maxHeight);
      const top = Math.max(topBound, Math.min(noteRect.top, viewportBottom - measuredHeight));
      setInspectorPosition((current) =>
        current?.top === top &&
        current.left === left &&
        current.width === width &&
        current.maxHeight === maxHeight
          ? current
          : { top, left, width, maxHeight },
      );
    };
    const schedulePlacement = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(placeInspector);
    };
    schedulePlacement();
    window.addEventListener("resize", schedulePlacement);
    window.addEventListener("scroll", schedulePlacement, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePlacement);
      window.removeEventListener("scroll", schedulePlacement, true);
    };
  }, [inspectorOpen, inspectorNote?.eventKey, inspectorNote?.sourceStepId]);
  useEffect(() => {
    if (!inspectorPosition || !focusInspectorOnOpen.current) return;
    const frame = requestAnimationFrame(() => {
      const inspectorElement = inspectorElementRef.current;
      if (!inspectorElement?.contains(document.activeElement)) {
        inspectorElement
          ?.querySelector<HTMLInputElement>('[aria-label="Inspector pitch MIDI"]')
          ?.focus();
      }
      focusInspectorOnOpen.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [inspectorPosition]);
  useEffect(() => {
    if (!inspectorRequest || handledInspectorRequestId.current === inspectorRequest.requestId)
      return;
    const requestedNote = notes.find(
      (note) =>
        note.sourceStepId === inspectorRequest.stepId &&
        note.eventKey === inspectorRequest.eventKey,
    );
    if (
      !requestedNote ||
      compareRational(requestedNote.startBeats, measure.startBeats) < 0 ||
      compareRational(requestedNote.startBeats, measure.endBeats) >= 0
    )
      return;
    handledInspectorRequestId.current = inspectorRequest.requestId;
    onNoteSelectionChange(requestedNote.sourceStepId, requestedNote.eventKey, false);
    onNoteSelect(requestedNote.sourceStepId, requestedNote.eventKey, systemIndex);
    focusInspectorOnOpen.current = true;
    setInspectorOpen(true);
  }, [
    inspectorRequest?.requestId,
    inspectorRequest?.stepId,
    inspectorRequest?.eventKey,
    notes,
    measure.startBeats,
    measure.endBeats,
    onNoteSelectionChange,
    onNoteSelect,
    onSelectStep,
  ]);
  useEffect(() => {
    if (!inspectorNote) {
      setInspectorDraft(null);
      return;
    }
    setInspectorDraft({
      pitch: String(inspectorNote.pitch.midiNumber),
      onsetN: String(inspectorNote.startBeats.numerator),
      onsetD: String(inspectorNote.startBeats.denominator),
      durationN: String(inspectorNote.durationBeats.numerator),
      durationD: String(inspectorNote.durationBeats.denominator),
    });
  }, [
    inspectorNote?.sourceStepId,
    inspectorNote?.eventKey,
    inspectorNote?.startBeats.numerator,
    inspectorNote?.startBeats.denominator,
    inspectorNote?.durationBeats.numerator,
    inspectorNote?.durationBeats.denominator,
    inspectorNote?.pitch.midiNumber,
  ]);
  useEffect(() => {
    if (noteGesture && noteGesture.baseline !== project.updatedAt) setPianoRollGesture(null);
  }, [noteGesture, project.updatedAt]);
  useEffect(() => {
    if (!noteGesture) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPianoRollGesture(null);
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => window.removeEventListener("keydown", cancelOnEscape, true);
  }, [noteGesture]);
  useEffect(
    () => () => {
      if (getPianoRollGesture()) setPianoRollGesture(null);
    },
    [],
  );
  const applyInspector = () => {
    if (!inspectorNote || !inspectorDraft) return;
    try {
      const pitch = Number(inspectorDraft.pitch);
      const onsetN = Number(inspectorDraft.onsetN);
      const onsetD = Number(inspectorDraft.onsetD);
      const durationN = Number(inspectorDraft.durationN);
      const durationD = Number(inspectorDraft.durationD);
      if (
        !Number.isInteger(pitch) ||
        pitch < 0 ||
        pitch > 127 ||
        !Number.isSafeInteger(onsetN) ||
        onsetN < 0 ||
        !Number.isSafeInteger(onsetD) ||
        onsetD <= 0 ||
        !Number.isSafeInteger(durationN) ||
        durationN <= 0 ||
        !Number.isSafeInteger(durationD) ||
        durationD <= 0
      )
        throw new RangeError("Enter a valid pitch, non-negative onset, and positive duration.");
      const onset = rational(onsetN, onsetD);
      const duration = rational(durationN, durationD);
      if (
        pitch === inspectorNote.pitch.midiNumber &&
        compareRational(onset, inspectorNote.startBeats) === 0 &&
        compareRational(duration, inspectorNote.durationBeats) === 0
      ) {
        setEditorMessage(null);
        return;
      }
      onApplyMelodyEdits?.([
        {
          type: "upsert",
          sourceStepId: inspectorNote.sourceStepId,
          note: {
            id: inspectorNote.eventKey,
            pitch: pitchSpelling(Number(inspectorDraft.pitch)),
            startBeats: onset,
            durationBeats: duration,
          },
        },
      ]);
      setEditorMessage(null);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Melody edit was rejected.");
      setInspectorDraft({
        pitch: String(inspectorNote.pitch.midiNumber),
        onsetN: String(inspectorNote.startBeats.numerator),
        onsetD: String(inspectorNote.startBeats.denominator),
        durationN: String(inspectorNote.durationBeats.numerator),
        durationD: String(inspectorNote.durationBeats.denominator),
      });
    }
  };
  const startNoteGesture = (
    event: PointerEvent<HTMLButtonElement>,
    note: (typeof notes)[number],
  ) => {
    onActiveMeasureChange?.(measure.measureIndex, systemIndex);
    const rect = event.currentTarget.getBoundingClientRect();
    const hitWidth = pianoRollResizeHitWidth(rect.width);
    const mode =
      event.clientX - rect.left < hitWidth
        ? "resize-left"
        : rect.right - event.clientX < hitWidth
          ? "resize-right"
          : "move";
    const grid = event.currentTarget
      .closest<HTMLElement>(".piano-roll-grid")!
      .getBoundingClientRect();
    const pitchRowHeight = grid.height / rowCount;
    const raw = addRational(
      measure.startBeats,
      rational(
        Math.round(
          pianoRollTimelineFraction(event.clientX, grid) *
            rationalToNumber(layout.barLengthBeats) *
            96,
        ),
        96,
      ),
    );
    const identity = pianoRollNoteIdentity(note.sourceStepId, note.eventKey);
    const groupNotes =
      mode === "move" && selectedNoteIdentities.has(identity) && selectedNoteIdentities.size > 1
        ? notes
            .filter((candidate) =>
              selectedNoteIdentities.has(
                pianoRollNoteIdentity(candidate.sourceStepId, candidate.eventKey),
              ),
            )
            .map((candidate) => ({
              sourceStepId: candidate.sourceStepId,
              eventKey: candidate.eventKey,
              originalNote: {
                id: candidate.eventKey,
                pitch: candidate.pitch,
                startBeats: candidate.startBeats,
                durationBeats: candidate.durationBeats,
              },
              note: {
                id: candidate.eventKey,
                pitch: candidate.pitch,
                startBeats: candidate.startBeats,
                durationBeats: candidate.durationBeats,
              },
            }))
        : undefined;
    pendingNoteGesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originY: event.clientY,
      originGridYOffset: event.clientY - grid.top,
      initialPitchExpansion: pitchExpansion,
      pitchRowHeight,
      sourceStepId: note.sourceStepId,
      mode,
      grabOffset: subtractRational(raw, note.startBeats),
      originalEnd: addRational(note.startBeats, note.durationBeats),
      note: {
        id: note.eventKey,
        pitch: note.pitch,
        startBeats: note.startBeats,
        durationBeats: note.durationBeats,
      },
      ...(groupNotes ? { groupNotes } : {}),
    };
  };
  const scrollWorkspaceAtPointerEdge = (currentTarget: HTMLElement, clientY: number) => {
    const studioScroller = currentTarget.closest<HTMLElement>(".studio-grid");
    if (studioScroller) {
      const bounds = studioScroller.getBoundingClientRect();
      if (clientY < bounds.top + 28) studioScroller.scrollBy({ top: -16, behavior: "instant" });
      else if (clientY > bounds.bottom - 28)
        studioScroller.scrollBy({ top: 16, behavior: "instant" });
      return;
    }
    if (clientY < 28) window.scrollBy({ top: -16, behavior: "instant" });
    else if (clientY > window.innerHeight - 28) window.scrollBy({ top: 16, behavior: "instant" });
  };
  const updateNoteGesture = (event: PointerEvent<HTMLElement>) => {
    const activeGesture = getPianoRollGesture();
    if (
      !activeGesture ||
      activeGesture.pointerId !== event.pointerId ||
      activeGesture.baseline !== project.updatedAt
    )
      return;
    const locatedGrid = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>(".piano-roll-grid");
    const sourceGrid =
      document
        .querySelector<HTMLElement>(`button[data-source-step-id="${activeGesture.sourceStepId}"]`)
        ?.closest<HTMLElement>(".piano-roll-grid") ??
      event.currentTarget.closest<HTMLElement>(".piano-roll-grid");
    const sourceScroller = sourceGrid?.closest<HTMLElement>(".score-system-scroll");
    if (!locatedGrid && sourceGrid && sourceScroller) {
      const sourceRect = sourceGrid.getBoundingClientRect();
      if (event.clientX < sourceRect.left + 10) sourceScroller.scrollLeft -= 14;
      if (event.clientX > sourceRect.right - 10) sourceScroller.scrollLeft += 14;
    }
    const studioBounds = event.currentTarget
      .closest<HTMLElement>(".studio-grid")
      ?.getBoundingClientRect();
    const autoScrollingVertically =
      (!locatedGrid || locatedGrid === sourceGrid) &&
      (studioBounds
        ? event.clientY < studioBounds.top + 28 || event.clientY > studioBounds.bottom - 28
        : event.clientY < 28 || event.clientY > window.innerHeight - 28);
    if (autoScrollingVertically) {
      scrollWorkspaceAtPointerEdge(event.currentTarget, event.clientY);
      return;
    }
    const grid = locatedGrid ?? sourceGrid;
    const measureIndex = Number(
      grid?.closest<HTMLElement>(".piano-roll-measure")?.dataset.measureIndex,
    );
    const target = Number.isInteger(measureIndex) ? layout.measures[measureIndex] : measure;
    if (!grid || !target) return;
    const rect = grid.getBoundingClientRect();
    const raw = addRational(
      target.startBeats,
      rational(
        Math.round(
          pianoRollTimelineFraction(event.clientX, rect) *
            rationalToNumber(layout.barLengthBeats) *
            96,
        ),
        96,
      ),
    );
    const unit = durationForSnap();
    const snapped = multiplyRational(
      unit,
      rational(Math.round(rationalToNumber(raw) / rationalToNumber(unit))),
    );
    const horizontalDelta = event.clientX - activeGesture.originX;
    const verticalDelta = event.clientY - activeGesture.originY;
    const gestureIntent = pianoRollResolvedGestureIntent(
      activeGesture.horizontalIntent
        ? "horizontal"
        : activeGesture.verticalIntent
          ? "vertical"
          : null,
      horizontalDelta,
      verticalDelta,
    );
    const horizontalIntent = gestureIntent === "horizontal";
    const verticalIntent = gestureIntent === "vertical";
    const snappedMoveStart = pianoRollMoveStart(
      activeGesture.originalNote.startBeats,
      raw,
      activeGesture.grabOffset,
      unit,
      horizontalIntent,
    );
    const start =
      activeGesture.mode === "move"
        ? horizontalIntent
          ? snappedMoveStart
          : activeGesture.originalNote.startBeats
        : activeGesture.mode === "resize-left"
          ? snapped
          : activeGesture.note.startBeats;
    const end =
      activeGesture.mode === "resize-right"
        ? snapped
        : activeGesture.mode === "resize-left"
          ? activeGesture.originalEnd
          : addRational(start, activeGesture.note.durationBeats);
    if (compareRational(start, rational(0)) < 0 || compareRational(end, start) <= 0) {
      if (activeGesture.groupNotes)
        setPianoRollGesture({
          ...activeGesture,
          rejectionMessage: "The group move must keep every note inside the current progression.",
        });
      return;
    }
    const expansionOffset =
      (pitchExpansion - activeGesture.initialPitchExpansion) * pitchGeometry.unitsPerOctave;
    const requestedPitch = Math.max(
      0,
      Math.min(
        127,
        pitchGeometry.pitchAtYFraction(
          (event.clientY - rect.top) / rect.height + expansionOffset / rowCount,
        ),
      ),
    );
    if (activeGesture.mode === "move") {
      onPitchExpansionChange?.(
        requiredPianoRollPitchExpansion(requestedPitch, basePitchBounds, pitchExpansion),
      );
    }
    const groupDeltaPitch =
      activeGesture.mode === "move" && verticalIntent && !autoScrollingVertically
        ? requestedPitch - activeGesture.originalNote.pitch.midiNumber
        : 0;
    const groupDeltaStart =
      activeGesture.mode === "move" && horizontalIntent
        ? subtractRational(start, activeGesture.originalNote.startBeats)
        : rational(0);
    const invalidGroupPitch = activeGesture.groupNotes?.some(
      (entry) =>
        entry.originalNote.pitch.midiNumber + groupDeltaPitch < 0 ||
        entry.originalNote.pitch.midiNumber + groupDeltaPitch > 127,
    );
    if (invalidGroupPitch) {
      setPianoRollGesture({
        ...activeGesture,
        rejectionMessage: "The group edit would move a note outside MIDI pitches 0–127.",
      });
      setEditorMessage("The group edit would move a note outside MIDI pitches 0–127.");
      return;
    }
    const groupNotes = activeGesture.groupNotes?.map((entry) => ({
      ...entry,
      note: {
        ...entry.originalNote,
        pitch: pitchSpelling(entry.originalNote.pitch.midiNumber + groupDeltaPitch),
        startBeats: addRational(entry.originalNote.startBeats, groupDeltaStart),
      },
    }));
    const activeGroupNote = groupNotes?.find(
      (entry) =>
        entry.sourceStepId === activeGesture.sourceStepId &&
        entry.eventKey === activeGesture.note.id,
    );
    const { rejectionMessage: _previousRejection, ...gestureWithoutRejection } = activeGesture;
    setPianoRollGesture({
      ...gestureWithoutRejection,
      horizontalIntent,
      verticalIntent,
      note: activeGroupNote?.note ?? {
        ...activeGesture.note,
        pitch:
          activeGesture.mode === "move" && !autoScrollingVertically
            ? pitchSpelling(requestedPitch)
            : activeGesture.note.pitch,
        startBeats: start,
        durationBeats: subtractRational(end, start),
      },
      ...(groupNotes ? { groupNotes } : {}),
    });
    const scroller = grid.closest<HTMLElement>(".score-system-scroll");
    if (scroller && event.clientX > rect.right - 12) scroller.scrollLeft += 12;
    if (scroller && event.clientX < rect.left + 12) scroller.scrollLeft -= 12;
  };
  const finishNoteGesture = (event: PointerEvent<HTMLElement>, cancel: boolean) => {
    const activeGesture = getPianoRollGesture();
    if (!activeGesture || activeGesture.pointerId !== event.pointerId) return;
    if (!cancel && activeGesture.rejectionMessage) {
      setEditorMessage(activeGesture.rejectionMessage);
      setPianoRollGesture(null);
      return;
    }
    const finalIntent = pianoRollResolvedGestureIntent(
      activeGesture.horizontalIntent
        ? "horizontal"
        : activeGesture.verticalIntent
          ? "vertical"
          : null,
      event.clientX - activeGesture.originX,
      event.clientY - activeGesture.originY,
    );
    const committedNote =
      activeGesture.mode === "move" && finalIntent === "vertical"
        ? {
            ...activeGesture.note,
            startBeats: activeGesture.originalNote.startBeats,
            durationBeats: activeGesture.originalNote.durationBeats,
          }
        : activeGesture.note;
    const changed =
      committedNote.pitch.midiNumber !== activeGesture.originalNote.pitch.midiNumber ||
      compareRational(committedNote.startBeats, activeGesture.originalNote.startBeats) !== 0 ||
      compareRational(committedNote.durationBeats, activeGesture.originalNote.durationBeats) !== 0;
    if (!cancel && changed && activeGesture.baseline === project.updatedAt) {
      try {
        if (activeGesture.mode === "move") {
          const identities = activeGesture.groupNotes?.map((entry) =>
            pianoRollNoteIdentity(entry.sourceStepId, entry.eventKey),
          ) ?? [pianoRollNoteIdentity(activeGesture.sourceStepId, activeGesture.note.id)];
          const selected = notes.filter((note) =>
            identities.includes(pianoRollNoteIdentity(note.sourceStepId, note.eventKey)),
          );
          if (selected.length !== identities.length)
            throw new Error("A selected note changed before the group move could commit.");
          const plan = planPianoRollGroupMoveByDelta(
            project,
            selected,
            committedNote.pitch.midiNumber - activeGesture.originalNote.pitch.midiNumber,
            subtractRational(committedNote.startBeats, activeGesture.originalNote.startBeats),
          );
          if (!onApplyMelodyEdits)
            throw new Error("Melody editing is unavailable in this Piano Roll.");
          const error = onApplyMelodyEdits(plan.edits, [], activeGesture.baseline);
          if (error) throw new Error(error);
          onReplaceNoteSelection?.(plan.selection);
          const active = plan.selection[0];
          if (active) onNoteSelect?.(active.sourceStepId, active.eventKey, systemIndex);
          setEditorMessage(null);
        } else {
          const error = onApplyMelodyEdits?.(
            [
              {
                type: "upsert",
                sourceStepId: activeGesture.sourceStepId,
                note: committedNote,
              },
            ],
            [],
            activeGesture.baseline,
          );
          if (error) throw new Error(error);
          let cursor = rational(0);
          let destination = project.progression.steps[0];
          for (const step of project.progression.steps) {
            const next = addRational(cursor, step.duration.beats);
            if (compareRational(committedNote.startBeats, next) < 0) {
              destination = step;
              break;
            }
            cursor = next;
          }
          if (destination) {
            const existingIds =
              destination.kind === "rest"
                ? (destination.authoredMelody?.notes.map((note) => note.id) ?? [])
                : destination.melody?.mode === "authored"
                  ? destination.melody.phrase.notes.map((note) => note.id)
                  : notes
                      .filter((note) => note.sourceStepId === destination!.id)
                      .map((note) => note.eventKey);
            let destinationNoteId = activeGesture.note.id;
            if (
              destination.id !== activeGesture.sourceStepId &&
              existingIds.includes(destinationNoteId)
            ) {
              let suffix = 1;
              do {
                destinationNoteId = `${activeGesture.note.id}~${destination.id}~${suffix++}`;
              } while (existingIds.includes(destinationNoteId));
            }
            const selection = [{ sourceStepId: destination.id, eventKey: destinationNoteId }];
            onReplaceNoteSelection?.(selection);
            onNoteSelect?.(destination.id, destinationNoteId, systemIndex);
          }
          setEditorMessage(null);
        }
      } catch (error) {
        setEditorMessage(error instanceof Error ? error.message : "Melody edit was rejected.");
      }
    }
    setPianoRollGesture(null);
  };
  return (
    <section
      className="piano-roll-measure"
      data-measure-index={measure.measureIndex}
      data-system-index={systemIndex}
      data-testid="piano-roll-measure"
      aria-label={`Measure ${measure.number}`}
      style={{
        flex: `${rationalToNumber(measure.capacityBeats)} 1 0%`,
        minWidth: `${Math.max(150, (250 * zoom) / 100)}px`,
      }}
    >
      <header
        className="piano-roll-measure-header"
        tabIndex={0}
        aria-label={`Measure ${measure.number}. Set Ctrl+A selection scope to this Measure.`}
        aria-haspopup="menu"
        onFocus={(event) => {
          if (event.target === event.currentTarget)
            onActiveMeasureChange?.(measure.measureIndex, systemIndex);
        }}
        onClick={(event) => {
          const target = event.target;
          if (
            target === event.currentTarget ||
            (target instanceof Element && !target.closest("button"))
          )
            onActiveMeasureChange?.(measure.measureIndex, systemIndex);
        }}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            event.stopPropagation();
            onActiveMeasureChange?.(measure.measureIndex, systemIndex);
            return;
          }
          if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenMeasureMenu?.(measure.measureIndex, event.currentTarget, {
              x: rect.left,
              y: rect.bottom,
            });
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMeasureMenu?.(measure.measureIndex, event.currentTarget, {
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        <button
          type="button"
          className="piano-roll-audition-measure"
          data-testid="piano-roll-audition-measure"
          aria-label={`Play Measure ${measure.number}`}
          onFocus={() => onActiveMeasureChange?.(measure.measureIndex, systemIndex)}
          onClick={() => {
            onActiveMeasureChange?.(measure.measureIndex, systemIndex);
            onAuditionMeasure?.(measure);
          }}
        >
          Measure {measure.number}
        </button>
        <span>
          {project.globalTiming.meter.numerator}/{project.globalTiming.meter.denominator}
        </span>
        <PianoRollSelectionAction
          accessibleName={`Select effective Melody notes in Measure ${measure.number}`}
          title={`Select Melody notes in Measure ${measure.number}`}
          testId={`piano-roll-select-measure-notes-${measure.measureIndex}`}
          selectionScopeLabel={selectionScopeLabel}
          onSelect={onSelectMeasureNotes}
        >
          Select
        </PianoRollSelectionAction>
        <button
          type="button"
          className="measure-context-trigger"
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
        >
          ⋯
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
      </header>
      <div className="piano-roll-section-lane" role="group" aria-label="Song sections">
        <div className="piano-roll-section-timeline">
          {sectionLabels.map(({ name, left }, i) => (
            <span
              className="piano-roll-section-boundary"
              key={`${name}-${i}`}
              style={
                {
                  left: `${left}%`,
                  "--section-label-width": `${Math.max(0, (sectionLabels[i + 1]?.left ?? 100) - left)}%`,
                } as CSSProperties
              }
              title={name}
            >
              <span>{name}</span>
            </span>
          ))}
        </div>
      </div>
      <div
        className={`piano-roll-grid ${gridMode === "chromatic" ? "is-chromatic" : "is-degrees"} ${hookpadColors ? "is-hookpad-palette" : ""} ${guidesEnabled ? "is-guides-on" : ""} ${noteGesture?.mode === "resize-left" || noteGesture?.mode === "resize-right" ? "is-note-resizing" : ""} ${noteGesture?.mode === "move" ? "is-note-moving" : ""}`}
        role="group"
        aria-label={`Melody grid, measure ${measure.number}`}
        data-min-pitch={minPitch}
        data-max-pitch={maxPitch}
        data-pitch-row-count={pitchCount}
        data-pitch-unit-count={rowCount}
        data-keyboard-focus-pitch={keyboardGridFocused ? focusPitch : undefined}
        data-keyboard-focus-onset={
          keyboardGridFocused
            ? `${keyboardCellStart.numerator}/${keyboardCellStart.denominator}`
            : undefined
        }
        style={{
          height: `${Math.max(54, rowCount * 18)}px`,
          gridTemplateRows: `repeat(${rowCount}, minmax(18px, 1fr))`,
        }}
        tabIndex={0}
        onClick={(event) => {
          if (ignoreNextEmptyGridClick.current) {
            ignoreNextEmptyGridClick.current = false;
            return;
          }
          onActiveMeasureChange?.(measure.measureIndex, systemIndex);
          if ((event.target as HTMLElement).closest("button.piano-roll-note")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = pianoRollTimelineFraction(event.clientX, rect);
          const rawStartBeats = addRational(
            measure.startBeats,
            rational(Math.round(x * rationalToNumber(layout.barLengthBeats) * 96), 96),
          );
          const startBeats = snapMidiCursor(rawStartBeats, pianoRollSnapBeats(snap));
          const y = Math.max(0, Math.min(0.999999, (event.clientY - rect.top) / rect.height));
          onEmptyCellCursor?.({
            startBeats,
            pitch: pitchSpelling(pitchGeometry.pitchAtYFraction(y)),
          });
        }}
        onFocusCapture={(event) => {
          onActiveMeasureChange?.(measure.measureIndex, systemIndex);
          if (event.target !== event.currentTarget) return;
          setKeyboardGridFocused(true);
          setKeyboardStartBeats(activeStepStart);
          setFocusPitch((current) => Math.max(minPitch, Math.min(maxPitch, current)));
        }}
        onBlurCapture={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          setKeyboardGridFocused(false);
        }}
        onDoubleClick={(event) => {
          if (!(event.target as HTMLElement).closest("button.piano-roll-note")) createAt(event);
        }}
        onPointerDown={beginMarquee}
        onPointerMove={(event) => {
          const activeGesture = getPianoRollGesture();
          if (!activeGesture && !pendingNoteGesture.current) {
            const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
              "button.piano-roll-note",
            );
            if (target) {
              const rect = target.getBoundingClientRect();
              const edgeWidth = pianoRollResizeHitWidth(rect.width);
              setHoveredNoteEdge({
                eventKey: target.dataset.pianoRollEventKey ?? "",
                edge:
                  event.clientX - rect.left < edgeWidth
                    ? "left"
                    : rect.right - event.clientX < edgeWidth
                      ? "right"
                      : "body",
              });
            } else {
              setHoveredNoteEdge(null);
            }
          }
          const pending = pendingNoteGesture.current;
          if (
            pending?.pointerId === event.pointerId &&
            Math.hypot(event.clientX - pending.x, event.clientY - pending.y) >= 4
          ) {
            pointerSelectedNoteIdentity.current = pianoRollNoteIdentity(
              pending.sourceStepId,
              pending.note.id,
            );
            pendingNoteGesture.current = null;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.focus({ preventScroll: true });
            setPianoRollGesture({
              pointerId: pending.pointerId,
              originX: pending.x,
              originY: pending.originY,
              originGridYOffset: pending.originGridYOffset,
              initialPitchExpansion: pending.initialPitchExpansion,
              pitchRowHeight: pending.pitchRowHeight,
              horizontalIntent: false,
              verticalIntent: false,
              baseline: project.updatedAt,
              sourceStepId: pending.sourceStepId,
              mode: pending.mode,
              grabOffset: pending.grabOffset,
              originalEnd: pending.originalEnd,
              originalNote: pending.note,
              note: pending.note,
              ...(pending.groupNotes ? { groupNotes: pending.groupNotes } : {}),
            });
            updateNoteGesture(event);
          }
          if (noteGesture?.pointerId === event.pointerId) updateNoteGesture(event);
          const start = marqueeStart.current;
          if (start?.pointerId === event.pointerId && start.baseline !== project.updatedAt) {
            marqueeStart.current = null;
            updateMarquee(null);
            return;
          }
          if (
            start?.pointerId === event.pointerId &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 4
          ) {
            updateMarquee({
              pointerId: start.pointerId,
              x1: start.x,
              y1: start.y,
              x2: event.clientX,
              y2: event.clientY,
              additive: start.additive,
              baseline: start.baseline,
            });
            ignoreNextEmptyGridClick.current = true;
          }
          const activeMarquee = marqueeRef.current;
          if (activeMarquee?.pointerId === event.pointerId)
            updateMarquee({ ...activeMarquee, x2: event.clientX, y2: event.clientY });
          if (activeMarquee?.pointerId === event.pointerId) {
            scrollWorkspaceAtPointerEdge(event.currentTarget, event.clientY);
            const scroller = event.currentTarget.closest<HTMLElement>(".score-system-scroll");
            if (scroller) {
              const scrollerRect = scroller.getBoundingClientRect();
              if (event.clientX < scrollerRect.left + 14) scroller.scrollLeft -= 14;
              else if (event.clientX > scrollerRect.right - 14) scroller.scrollLeft += 14;
            }
          }
        }}
        onPointerUp={(event) => {
          setHoveredNoteEdge(null);
          if (getPianoRollGesture()?.pointerId === event.pointerId)
            ignoreNextEmptyGridClick.current = true;
          const pointerTarget = (event.target as HTMLElement).closest<HTMLButtonElement>(
            "button.piano-roll-note",
          );
          const pendingPointerSelection = pendingNoteGesture.current?.pointerId === event.pointerId;
          if (pendingPointerSelection && pointerTarget && !getPianoRollGesture()) {
            const sourceStepId = pointerTarget.dataset.sourceStepId;
            const eventKey = pointerTarget.dataset.pianoRollEventKey;
            if (sourceStepId && eventKey) {
              const identity = pianoRollNoteIdentity(sourceStepId, eventKey);
              pointerSelectedNoteIdentity.current = identity;
              onNoteSelectionChange(sourceStepId, eventKey, event.shiftKey);
              onNoteSelect(sourceStepId, eventKey, systemIndex);
            }
          }
          if (pendingNoteGesture.current?.pointerId === event.pointerId)
            pendingNoteGesture.current = null;
          finishNoteGesture(event, false);
          finishMarquee(event, true);
        }}
        onPointerCancel={(event) => {
          setHoveredNoteEdge(null);
          if (pendingNoteGesture.current?.pointerId === event.pointerId)
            pendingNoteGesture.current = null;
          finishNoteGesture(event, true);
          finishMarquee(event, false);
        }}
        onLostPointerCapture={(event) => {
          setHoveredNoteEdge(null);
          const activeGesture = getPianoRollGesture();
          if (activeGesture?.pointerId === event.pointerId) finishNoteGesture(event, true);
          if (pendingNoteGesture.current?.pointerId === event.pointerId)
            pendingNoteGesture.current = null;
          if (marqueeStart.current?.pointerId === event.pointerId) finishMarquee(event, false);
        }}
        onPointerLeave={() => {
          if (!getPianoRollGesture()) setHoveredNoteEdge(null);
        }}
        onKeyDown={(event) => {
          if (isAppShortcutProtectedTarget(event.target)) return;
          if (event.key === "Escape") {
            if (noteGesture || pendingNoteGesture.current || marqueeStart.current)
              ignoreNextEmptyGridClick.current = true;
            pendingNoteGesture.current = null;
            if (noteGesture) setPianoRollGesture(null);
            else onClearNoteSelection();
            updateMarquee(null);
            marqueeStart.current = null;
            setInspectorOpen(false);
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            if (!notes.length) {
              onClearNoteSelection();
              return;
            }
            onReplaceNoteSelection?.(
              notes.map((note) => ({
                sourceStepId: note.sourceStepId,
                eventKey: note.eventKey,
              })),
            );
            const first = notes[0]!;
            const firstButton = Array.from(
              document.querySelectorAll<HTMLButtonElement>("button.piano-roll-note"),
            ).find(
              (button) =>
                button.dataset.sourceStepId === first.sourceStepId &&
                button.dataset.pianoRollEventKey === first.eventKey,
            );
            const ownerSystem = Number(
              firstButton?.closest<HTMLElement>(".piano-roll-measure")?.dataset.systemIndex,
            );
            onNoteSelect(
              first.sourceStepId,
              first.eventKey,
              Number.isInteger(ownerSystem) ? ownerSystem : systemIndex,
            );
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
            event.preventDefault();
            copySelection(false);
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
            event.preventDefault();
            pasteSelection();
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
            event.preventDefault();
            copySelection(true);
            return;
          }
          if (event.key === "Enter" && event.target === event.currentTarget) {
            event.preventDefault();
            const id = crypto.randomUUID();
            onApplyMelodyEdits?.([
              {
                type: "upsert",
                note: {
                  id,
                  pitch: pitchSpelling(focusPitch),
                  startBeats: keyboardCellStart,
                  durationBeats: durationForSnap(),
                },
              },
            ]);
            let cursor = rational(0);
            const destination = project.progression.steps.find((step) => {
              const end = addRational(cursor, step.duration.beats);
              if (compareRational(keyboardCellStart, end) < 0) return true;
              cursor = end;
              return false;
            });
            if (destination) {
              onNoteSelectionChange(destination.id, id, false);
              onNoteSelect(destination.id, id, systemIndex);
            }
            requestAnimationFrame(() => {
              document
                .querySelector<HTMLButtonElement>(
                  `button.piano-roll-note[data-piano-roll-event-key="${id}"]`,
                )
                ?.focus();
            });
            return;
          }
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
            event.target === event.currentTarget
          ) {
            event.preventDefault();
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              const direction = event.key === "ArrowUp" ? 1 : -1;
              setFocusPitch(Math.max(minPitch, Math.min(maxPitch, focusPitch + direction)));
            } else {
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const unit = durationForSnap();
              const candidate = addRational(
                keyboardCellStart,
                multiplyRational(unit, rational(direction)),
              );
              const latestStart = subtractRational(measure.endBeats, unit);
              setKeyboardStartBeats(
                compareRational(candidate, measure.startBeats) < 0
                  ? measure.startBeats
                  : compareRational(candidate, latestStart) > 0
                    ? latestStart
                    : candidate,
              );
            }
            return;
          }
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            const focusedNote = (event.target as HTMLElement).closest<HTMLButtonElement>(
              "button.piano-roll-note",
            );
            const sourceStepId = focusedNote?.dataset.sourceStepId;
            const eventKey = focusedNote?.dataset.pianoRollEventKey;
            deleteSelection(sourceStepId && eventKey ? { sourceStepId, eventKey } : undefined);
          }
        }}
      >
        <svg
          className="piano-roll-svg"
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {Array.from({ length: rowCount + 1 }, (_, i) => (
            <line
              key={`row-${i}`}
              x1="0"
              x2="100"
              y1={(i / rowCount) * 100}
              y2={(i / rowCount) * 100}
            />
          ))}
          {gridOffsets.map((offset, i) => {
            const x = (rationalToNumber(offset) / rationalToNumber(layout.barLengthBeats)) * 100;
            return (
              <line
                className={`piano-roll-snap-line ${compareRational(offset, rational(0)) === 0 ? "is-bar-line" : offset.denominator === 1 ? "is-beat-line" : "is-subdivision-line"}`}
                data-grid-offset={`${offset.numerator}/${offset.denominator}`}
                key={`snap-${i}`}
                x1={x}
                x2={x}
                y1="0"
                y2="100"
              />
            );
          })}
        </svg>
        {pitchRows.map((midi) => {
          const rowStart = pitchGeometry.rowStart(midi);
          const pc = midi % 12;
          const inScale = diatonicSteps.includes((pc - tonic + 12) % 12);
          const paletteDegrees = pianoRollPaletteDegrees(pc, tonic, project.activeModule);
          const degreeStyle = paletteStyle(paletteDegrees);
          const guideItems = guidesEnabled
            ? gridMode === "degrees"
              ? projectPianoRollScaleChordToneGuide(measure, pc, guidePitchClassesByStep)
              : projectPianoRollChordToneGuide(measure, pc, guidePitchClassesByStep).map(
                  ({ item, chordTone }) => ({
                    item,
                    neutral: true,
                    tones: chordTone ? [{ pitchClass: pc, half: null }] : [],
                  }),
                )
            : [];
          return (
            <div
              key={midi}
              className={`piano-roll-row ${pc % 12 === 0 ? "is-octave" : ""} ${inScale ? "is-scale" : "is-accidental"} ${[1, 3, 6, 8, 10].includes(pc) ? "is-black-key" : "is-white-key"}`}
              data-pitch-midi={midi}
              data-palette-degrees={paletteDegrees.join("-")}
              style={{ gridRow: `${rowStart + 1} / span 1`, ...degreeStyle }}
            >
              {guidesEnabled ? (
                <span className="piano-roll-guide-layer" aria-hidden="true">
                  {guideItems.map(({ item, tones }, index) => {
                    const hasHarmony = item.kind === "step" && item.step.kind === "chord";
                    return (
                      <span
                        key={`${item.kind}-${index}`}
                        className="piano-roll-guide-step"
                        style={{ flex: `${rationalToNumber(item.durationBeats)} 1 0` }}
                      >
                        <i
                          className={`piano-roll-guide-segment is-neutral ${hasHarmony ? "" : "is-no-harmony"}`.trim()}
                          data-testid="piano-roll-guide-neutral"
                          {...(item.kind === "step" ? { "data-source-step-id": item.stepId } : {})}
                          data-start-beats={`${item.startBeats.numerator}/${item.startBeats.denominator}`}
                          data-duration-beats={`${item.durationBeats.numerator}/${item.durationBeats.denominator}`}
                          data-pitch-class={((midi % 12) + 12) % 12}
                          data-palette-degrees={paletteDegrees.join("-")}
                        />
                        {tones.map((tone, toneIndex) => (
                          <i
                            key={`${tone.pitchClass}-${tone.half ?? "full"}-${toneIndex}`}
                            className={`piano-roll-guide-segment is-chord-tone${tone.half ? ` is-${tone.half}-half` : ""}`}
                            data-testid="piano-roll-guide-tone"
                            {...(item.kind === "step"
                              ? { "data-source-step-id": item.stepId }
                              : {})}
                            data-start-beats={`${item.startBeats.numerator}/${item.startBeats.denominator}`}
                            data-duration-beats={`${item.durationBeats.numerator}/${item.durationBeats.denominator}`}
                            data-pitch-class={tone.pitchClass}
                            data-guide-half={tone.half ?? "full"}
                            data-palette-degrees={pianoRollPaletteDegrees(
                              tone.pitchClass,
                              tonic,
                              project.activeModule,
                            ).join("-")}
                            style={paletteStyle(
                              pianoRollPaletteDegrees(tone.pitchClass, tonic, project.activeModule),
                            )}
                          />
                        ))}
                      </span>
                    );
                  })}
                </span>
              ) : null}
            </div>
          );
        })}
        <div className="piano-roll-note-layer" data-testid="piano-roll-note-layer">
          {midiCursor &&
          compareRational(midiCursor, measure.startBeats) >= 0 &&
          compareRational(midiCursor, measure.endBeats) < 0 ? (
            <i
              className="piano-roll-midi-insertion-cursor"
              aria-hidden="true"
              data-testid="piano-roll-midi-cursor"
              data-start-beats={`${midiCursor.numerator}/${midiCursor.denominator}`}
              style={{
                left: `${(rationalToNumber(subtractRational(midiCursor, measure.startBeats)) / rationalToNumber(layout.barLengthBeats)) * 100}%`,
              }}
            />
          ) : null}
          {emptyCursor &&
          compareRational(emptyCursor.startBeats, measure.startBeats) >= 0 &&
          compareRational(emptyCursor.startBeats, measure.endBeats) < 0 ? (
            <i
              className="piano-roll-editing-cursor"
              aria-hidden="true"
              data-testid="piano-roll-editing-cursor"
              style={{
                left: `${(rationalToNumber(subtractRational(emptyCursor.startBeats, measure.startBeats)) / rationalToNumber(layout.barLengthBeats)) * 100}%`,
                top: `${(pitchGeometry.rowStart(emptyCursor.pitch.midiNumber) / rowCount) * 100}%`,
                height: `${(pitchGeometry.rowSpan(emptyCursor.pitch.midiNumber) / rowCount) * 100}%`,
              }}
            />
          ) : null}
          {keyboardGridFocused ? (
            <i
              className="piano-roll-keyboard-caret"
              aria-hidden="true"
              data-testid="piano-roll-keyboard-caret"
              style={{
                left: `${(rationalToNumber(subtractRational(keyboardCellStart, measure.startBeats)) / rationalToNumber(layout.barLengthBeats)) * 100}%`,
                top: `${(pitchGeometry.rowStart(focusPitch) / rowCount) * 100}%`,
                height: `${(pitchGeometry.rowSpan(focusPitch) / rowCount) * 100}%`,
              }}
            />
          ) : null}
          <PianoRollPlayhead
            measure={measure}
            stepStart={playingStepStart}
            startedAt={activeEventStartedAt}
            playing={Boolean(transportPlaying)}
            tempoBpm={project.globalTiming.tempoBpm}
            audition={auditionPlayhead ?? null}
            onAuditionFinished={onAuditionFinished}
          />
          {measure.items.map((item, i) =>
            item.kind === "step" ? (
              <i
                key={`boundary-${item.stepId}-${i}`}
                className="piano-roll-boundary"
                style={{
                  left: `${(rationalToNumber(subtractRational(item.startBeats, measure.startBeats)) / rationalToNumber(layout.barLengthBeats)) * 100}%`,
                }}
              />
            ) : null,
          )}
          {visibleNotes.map((note) => {
            const isDragging =
              noteGesture?.sourceStepId === note.sourceStepId &&
              noteGesture.note.id === note.eventKey;
            const previewNote = isDragging
              ? {
                  ...note,
                  pitch: noteGesture.note.pitch,
                  startBeats: noteGesture.note.startBeats,
                  durationBeats: noteGesture.note.durationBeats,
                }
              : note;
            const previewFragment = isDragging
              ? projectPianoRollNoteFragment(previewNote, measure, layout.barLengthBeats)
              : note.fragment;
            if (!previewFragment) return null;
            const left = previewFragment.leftPercent;
            const width = previewFragment.widthPercent;
            const rowStart = pitchGeometry.rowStart(previewNote.pitch.midiNumber);
            const rowSpan = pitchGeometry.rowSpan(previewNote.pitch.midiNumber);
            const step = project.progression.steps.find(
              (candidate) => candidate.id === note.sourceStepId,
            );
            const authored = isPianoRollNoteAuthored(step);
            const stepIndex = step
              ? project.progression.steps.findIndex((candidate) => candidate.id === step.id)
              : -1;
            const nextStep = project.progression.steps
              .slice(stepIndex + 1)
              .find((candidate) => candidate.kind === "chord");
            const role =
              step?.kind === "chord"
                ? classifyHarmonicNoteRole(
                    note.pitch.pitchClassIdentity,
                    createHarmonicNoteRoleContext({
                      tonic: project.tonic,
                      moduleId: project.activeModule,
                      rootPitchClass: realizeProgressionStepChord(step, project.tonic)
                        .rootPitchClass,
                      chordPitches: realizeProgressionStepRealization(step, project.tonic).pitches,
                      ...(nextStep?.kind === "chord"
                        ? {
                            nextChordPitches: realizeProgressionStepRealization(
                              nextStep,
                              project.tonic,
                            ).pitches,
                          }
                        : {}),
                    }),
                  )
                : undefined;
            const suzukiColor =
              displayColorMode === "suzuki"
                ? getSuzukiNoteColor(previewNote.pitch.spelling.step)
                : undefined;
            const paletteDegrees = pianoRollPaletteDegrees(
              previewNote.pitch.pitchClassIdentity,
              tonic,
              project.activeModule,
            );
            const noteIdentity = JSON.stringify([note.sourceStepId, note.eventKey]);
            const isSelectedNote =
              selectedNoteKey === noteIdentity || selectedNoteIdentities.has(noteIdentity);
            const hoverEdge =
              hoveredNoteEdge?.eventKey === note.eventKey ? hoveredNoteEdge.edge : null;
            const activeResize =
              isDragging &&
              (noteGesture.mode === "resize-left" || noteGesture.mode === "resize-right");
            const noteClassName = `piano-roll-note ${hookpadColors ? "is-hookpad-palette" : ""} ${role && displayColorMode === "harmonic-role" ? `role-${role.primary} ${role.targetNext ? "is-target-next" : ""}` : ""} ${isSelectedNote ? "is-selected" : ""} ${playingStepId === note.sourceStepId ? "is-playing" : ""} ${!authored ? "is-generated" : ""} ${note.fragment.continuesFromPrevious ? "is-continuation" : ""} ${hoverEdge === "left" ? "is-resize-edge-left" : ""} ${hoverEdge === "right" ? "is-resize-edge-right" : ""} ${hoverEdge === "body" ? "is-move-body" : ""} ${activeResize ? "is-gesture-resizing" : ""}`;
            const noteStyle: CSSProperties = {
              left: `${left}%`,
              width: `${Math.max(width, 0.7)}%`,
              top: `${(rowStart / rowCount) * 100}%`,
              height: `${(rowSpan / rowCount) * 100}%`,
              cursor:
                activeResize || hoverEdge === "left" || hoverEdge === "right"
                  ? "ew-resize"
                  : "grab",
              ...paletteStyle(paletteDegrees),
              ...(role && displayColorMode === "harmonic-role"
                ? ({
                    "--melody-role-color":
                      role.primary === "root"
                        ? "#b6472d"
                        : role.primary === "chord-tone"
                          ? "#245da0"
                          : role.primary === "scale-tone"
                            ? "#1e7158"
                            : "#74418f",
                  } as CSSProperties)
                : {}),
              ...(suzukiColor
                ? ({
                    "--piano-roll-note-color": suzukiColor,
                    "--piano-roll-note-stroke": getSuzukiNoteStroke(note.pitch.spelling.step),
                  } as CSSProperties)
                : {}),
            };
            const pitchLabel = `${note.pitch.spelling.step}${note.pitch.spelling.alter ? (note.pitch.spelling.alter > 0 ? "♯" : "♭") : ""}${note.pitch.octave}`;
            return (
              <span className="piano-roll-note-wrapper" key={`wrap-${noteIdentity}`}>
                <svg
                  className={`piano-roll-note-svg ${noteClassName}`}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={noteStyle}
                  aria-hidden="true"
                >
                  <rect x="0.5" y="1" width="99" height="98" rx="3" />
                </svg>
                <button
                  type="button"
                  className={noteClassName}
                  data-testid="piano-roll-note"
                  data-piano-roll-event-key={note.eventKey}
                  data-pitch-midi={previewNote.pitch.midiNumber}
                  data-source-step-id={note.sourceStepId}
                  data-start-beats={`${note.startBeats.numerator}/${note.startBeats.denominator}`}
                  data-duration-beats={`${note.durationBeats.numerator}/${note.durationBeats.denominator}`}
                  data-fragment-start-beats={`${note.fragment.startBeats.numerator}/${note.fragment.startBeats.denominator}`}
                  data-fragment-duration-beats={`${note.fragment.durationBeats.numerator}/${note.fragment.durationBeats.denominator}`}
                  data-generated={!authored ? "true" : "false"}
                  data-palette-degrees={paletteDegrees.join("-")}
                  data-pitch-spelling={`${previewNote.pitch.spelling.step}${previewNote.pitch.spelling.alter > 0 ? "#".repeat(previewNote.pitch.spelling.alter) : "b".repeat(-previewNote.pitch.spelling.alter)}`}
                  title={`${previewNote.pitch.spelling.step}${previewNote.pitch.spelling.alter > 0 ? "♯".repeat(previewNote.pitch.spelling.alter) : "♭".repeat(-previewNote.pitch.spelling.alter)}${previewNote.pitch.octave} · ${previewNote.startBeats.numerator}/${previewNote.startBeats.denominator} onset · ${previewNote.durationBeats.numerator}/${previewNote.durationBeats.denominator} duration`}
                  style={noteStyle}
                  aria-label={`${authored ? "Authored" : "Generated"} ${previewNote.pitch.spelling.step}${previewNote.pitch.spelling.alter === 1 ? " sharp" : previewNote.pitch.spelling.alter > 1 ? ` ${previewNote.pitch.spelling.alter} sharps` : previewNote.pitch.spelling.alter === -1 ? " flat" : previewNote.pitch.spelling.alter < -1 ? ` ${-previewNote.pitch.spelling.alter} flats` : ""}${previewNote.pitch.octave}${role && displayColorMode === "harmonic-role" ? `, ${role.primary}${role.targetNext ? ", target next chord" : ""}` : ""}, ${previewNote.startBeats.numerator}/${previewNote.startBeats.denominator} beat onset, ${previewNote.durationBeats.numerator}/${previewNote.durationBeats.denominator} beat duration${previewFragment.continuesFromPrevious ? ", continuation" : ""}; Step ${note.stepIndex + 1}`}
                  aria-pressed={selectedNoteIdentities.has(noteIdentity) || isSelectedNote}
                  aria-disabled={false}
                  onPointerDown={(event) => {
                    pointerSelectedNoteIdentity.current = null;
                    startNoteGesture(event, note);
                  }}
                  onClick={(event) => {
                    setInspectorOpen(false);
                    const identity = pianoRollNoteIdentity(note.sourceStepId, note.eventKey);
                    const measureIndex = Number(
                      event.currentTarget.closest<HTMLElement>(".piano-roll-measure")?.dataset
                        .measureIndex,
                    );
                    if (Number.isInteger(measureIndex))
                      onActiveMeasureChange?.(measureIndex, systemIndex);
                    if (pointerSelectedNoteIdentity.current === identity) {
                      pointerSelectedNoteIdentity.current = null;
                      if (!event.shiftKey && event.detail > 0)
                        onAuditionNote?.(note.sourceStepId, note.eventKey);
                    } else {
                      onNoteSelectionChange(note.sourceStepId, note.eventKey, event.shiftKey);
                      onNoteSelect(note.sourceStepId, note.eventKey, systemIndex);
                    }
                    setFocusPitch(note.pitch.midiNumber);
                  }}
                  onKeyDown={(event) => {
                    if (event.key.toLowerCase() === "e" && !event.ctrlKey && !event.metaKey) {
                      event.preventDefault();
                      onNoteSelectionChange(note.sourceStepId, note.eventKey, false);
                      onNoteSelect(note.sourceStepId, note.eventKey, systemIndex);
                      setFocusPitch(note.pitch.midiNumber);
                      focusInspectorOnOpen.current = true;
                      setInspectorOpen(true);
                      return;
                    }
                    const verticalArrow = event.key === "ArrowUp" || event.key === "ArrowDown";
                    const horizontalEdit =
                      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                      (event.altKey || event.shiftKey);
                    if (verticalArrow || horizontalEdit) {
                      event.preventDefault();
                      const keyboardDeltaPitch = verticalArrow
                        ? event.key === "ArrowUp"
                          ? 1
                          : -1
                        : 0;
                      const keyboardDeltaStart = horizontalEdit
                        ? multiplyRational(
                            durationForSnap(),
                            rational(event.key === "ArrowRight" ? 1 : -1),
                          )
                        : rational(0);
                      if (moveGroupByKeyboard(note, keyboardDeltaPitch, keyboardDeltaStart)) return;
                      let pitch = note.pitch.midiNumber;
                      let startBeats = note.startBeats;
                      if (verticalArrow) {
                        const direction = event.key === "ArrowUp" ? 1 : -1;
                        pitch = Math.max(0, Math.min(127, pitch + direction));
                      } else {
                        const offset = durationForSnap();
                        startBeats =
                          event.key === "ArrowRight"
                            ? addRational(note.startBeats, offset)
                            : subtractRational(note.startBeats, offset);
                      }
                      onApplyMelodyEdits?.(
                        [
                          {
                            type: "upsert",
                            sourceStepId: note.sourceStepId,
                            note: {
                              id: note.eventKey,
                              pitch: pitchSpelling(pitch),
                              startBeats,
                              durationBeats: note.durationBeats,
                            },
                          },
                        ],
                        [],
                        project.updatedAt,
                      );
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onNoteSelectionChange(note.sourceStepId, note.eventKey, false);
                      onNoteSelect(note.sourceStepId, note.eventKey, systemIndex);
                      onAuditionNote?.(note.sourceStepId, note.eventKey);
                    }
                    if (
                      ["ArrowLeft", "ArrowRight"].includes(event.key) &&
                      !event.altKey &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();
                      const all = Array.from(
                        document.querySelectorAll<HTMLButtonElement>(
                          "button.piano-roll-note:not(:disabled)",
                        ),
                      );
                      const index = all.indexOf(event.currentTarget);
                      const delta = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
                      all[Math.max(0, Math.min(all.length - 1, index + delta))]?.focus();
                    }
                  }}
                >
                  <span>{pitchLabel}</span>
                </button>
              </span>
            );
          })}
        </div>
      </div>
      <div
        className="piano-roll-harmony"
        role="group"
        aria-label={`Harmony, measure ${measure.number}`}
      >
        <svg
          className="piano-roll-harmony-grid-lines"
          data-testid="piano-roll-harmony-grid-lines"
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {gridOffsets.map((offset, index) => {
            const x = (rationalToNumber(offset) / rationalToNumber(layout.barLengthBeats)) * 100;
            const kind =
              compareRational(offset, rational(0)) === 0
                ? "bar"
                : offset.denominator === 1
                  ? "beat"
                  : "subdivision";
            return (
              <line
                key={`harmony-grid-${index}`}
                className={`piano-roll-harmony-grid-line is-${kind}`}
                data-grid-kind={kind}
                data-grid-offset={`${offset.numerator}/${offset.denominator}`}
                x1={x}
                x2={x}
                y1="0"
                y2="22"
              />
            );
          })}
          {gridOffsets.map((offset, index) => {
            const x = (rationalToNumber(offset) / rationalToNumber(layout.barLengthBeats)) * 100;
            const kind =
              compareRational(offset, rational(0)) === 0
                ? "bar"
                : offset.denominator === 1
                  ? "beat"
                  : "subdivision";
            return (
              <line
                key={`harmony-grid-lower-${index}`}
                className={`piano-roll-harmony-grid-line is-${kind}`}
                data-grid-kind={kind}
                data-grid-offset={`${offset.numerator}/${offset.denominator}`}
                x1={x}
                x2={x}
                y1="78"
                y2="100"
              />
            );
          })}
        </svg>
        {measure.items.map((item, index) => {
          if (item.kind === "gap")
            return (
              <div
                className="piano-roll-chord is-gap"
                key={`gap-${index}`}
                style={{ flex: `${rationalToNumber(item.durationBeats)} 1 0` }}
                aria-label="No harmony"
              />
            );
          const step = item.step;
          const chordRootPitchClass =
            step.kind === "chord"
              ? realizeProgressionStepChord(step, project.tonic).rootPitchClass
              : null;
          const chordPaletteDegrees =
            chordRootPitchClass !== null
              ? pianoRollPaletteDegrees(chordRootPitchClass, tonic, project.activeModule)
              : undefined;
          const chord =
            step.kind === "chord"
              ? formatChordSymbol(
                  withEffectiveBass(
                    realizeProgressionStepChord(step, project.tonic),
                    realizeProgressionStepRealization(step, project.tonic).bassPitch,
                  ),
                )
              : "Rest";
          const functionName = step.kind === "chord" ? step.harmonicFunction.functionId : "";
          const isSelectedChord = !selectedNoteKey && selectedStepId === step.id;
          const hasLeftBoundary = isSelectedChord && step.kind === "chord" && item.startsHere;
          const hasRightBoundary =
            isSelectedChord && step.kind === "chord" && !item.continuesToNext;
          return (
            <div
              className="piano-roll-harmony-fragment"
              key={`${step.id}-${item.fragmentIndex}`}
              data-source-step-id={step.id}
              style={{ flex: `${rationalToNumber(item.durationBeats)} 1 0` }}
            >
              {hasLeftBoundary ? renderBoundaryResizeHandle?.(item, "left", measure) : null}
              <button
                type="button"
                className={`piano-roll-chord ${hookpadColors && chordPaletteDegrees ? "is-hookpad-palette" : ""} ${!selectedNoteKey && (selectedChordStepIds?.size ? selectedChordStepIds.has(step.id) : selectedStepId === step.id) ? "is-selected" : ""} ${playingStepId === step.id ? "is-playing" : ""} ${step.kind === "rest" ? "is-rest" : ""}`}
                data-testid="piano-roll-chord"
                data-source-step-id={step.id}
                {...(chordPaletteDegrees
                  ? {
                      "data-palette-degrees": chordPaletteDegrees.join("-"),
                      style: {
                        flex: "1 1 0",
                        ...paletteStyle(chordPaletteDegrees),
                      },
                    }
                  : { style: { flex: "1 1 0" } })}
                data-start-beats={`${item.startBeats.numerator}/${item.startBeats.denominator}`}
                onClick={(event) => {
                  onClearNoteSelection();
                  if (onHarmonySelected) onHarmonySelected(step.id, systemIndex, event.shiftKey);
                  else onSelectStep(step.id);
                  if (!event.shiftKey && step.kind === "chord") onAuditionChord?.(step.id);
                }}
                onContextMenu={(event) => {
                  if (step.kind !== "chord") return;
                  event.preventDefault();
                  if (!selectedChordStepIds?.has(step.id) && selectedStepId !== step.id)
                    onHarmonySelected?.(step.id, systemIndex, false);
                  onOpenMelodyMenu?.(step.id, event.currentTarget, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                aria-label={`${step.kind === "rest" ? "Rest, no harmony" : `Harmony ${chord}, ${functionName}`}, measure ${measure.number}${item.continuesFromPrevious ? ", continuation" : ""}`}
                aria-pressed={
                  selectedChordStepIds?.size
                    ? selectedChordStepIds.has(step.id)
                    : !selectedNoteKey && selectedStepId === step.id
                }
              >
                {step.kind === "chord" ? (
                  <>
                    {item.continuesFromPrevious ? <span aria-hidden="true">↪</span> : null}
                    <ProgressionChordLabel
                      mode={labelMode}
                      functionLabel={functionName}
                      chordLabel={chord}
                    />
                    {step.kind === "chord" ? (
                      <StepTranspositionBadge semitones={stepTranspositionSemitones(step)} />
                    ) : null}
                  </>
                ) : (
                  <strong>Rest · no harmony</strong>
                )}
              </button>
              {hasRightBoundary ? renderBoundaryResizeHandle?.(item, "right", measure) : null}
            </div>
          );
        })}
        {boundaryResizePreview &&
        compareRational(boundaryResizePreview, measure.startBeats) >= 0 &&
        compareRational(boundaryResizePreview, measure.endBeats) <= 0 ? (
          <i
            className="piano-roll-chord-boundary-preview"
            aria-hidden="true"
            style={{
              left: `${(rationalToNumber(subtractRational(boundaryResizePreview, measure.startBeats)) / rationalToNumber(layout.barLengthBeats)) * 100}%`,
            }}
          />
        ) : null}
      </div>
      {inspectorOpen &&
      inspectorNote &&
      inspectorDraft &&
      compareRational(inspectorNote.startBeats, measure.startBeats) >= 0 &&
      compareRational(inspectorNote.startBeats, measure.endBeats) < 0 ? (
        <aside
          ref={inspectorElementRef}
          className="piano-roll-inspector"
          role="region"
          aria-label="Piano Roll Inspector"
          style={{
            top: inspectorPosition?.top ?? 16,
            left: inspectorPosition?.left ?? 8,
            width: inspectorPosition?.width ?? 320,
            maxHeight: inspectorPosition?.maxHeight ?? "calc(100vh - 32px)",
            visibility: inspectorPosition ? "visible" : "hidden",
          }}
          onBlurCapture={(event) => {
            if (!(event.target instanceof HTMLInputElement)) return;
            if (skipInspectorBlur.current) {
              skipInspectorBlur.current = false;
              return;
            }
            applyInspector();
          }}
          onKeyDownCapture={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              skipInspectorBlur.current = true;
              setInspectorDraft({
                pitch: String(inspectorNote.pitch.midiNumber),
                onsetN: String(inspectorNote.startBeats.numerator),
                onsetD: String(inspectorNote.startBeats.denominator),
                durationN: String(inspectorNote.durationBeats.numerator),
                durationD: String(inspectorNote.durationBeats.denominator),
              });
              setInspectorOpen(false);
              requestAnimationFrame(() => {
                document
                  .querySelector<HTMLButtonElement>(
                    `button.piano-roll-note[data-source-step-id="${inspectorNote.sourceStepId}"][data-piano-roll-event-key="${inspectorNote.eventKey}"]`,
                  )
                  ?.focus();
                skipInspectorBlur.current = false;
              });
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              applyInspector();
            }
          }}
        >
          <strong>Selected note</strong>
          <button
            type="button"
            aria-label="Close note details"
            onClick={() => {
              setInspectorOpen(false);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLButtonElement>(
                    `button.piano-roll-note[data-source-step-id="${inspectorNote.sourceStepId}"][data-piano-roll-event-key="${inspectorNote.eventKey}"]`,
                  )
                  ?.focus(),
              );
            }}
          >
            Close
          </button>
          <label>
            Pitch MIDI{" "}
            <input
              aria-label="Inspector pitch MIDI"
              type="number"
              min="0"
              max="127"
              value={inspectorDraft.pitch}
              onChange={(event) =>
                setInspectorDraft({ ...inspectorDraft, pitch: event.target.value })
              }
            />
          </label>
          <label>
            Onset numerator{" "}
            <input
              aria-label="Inspector onset numerator"
              type="number"
              value={inspectorDraft.onsetN}
              onChange={(event) =>
                setInspectorDraft({ ...inspectorDraft, onsetN: event.target.value })
              }
            />
          </label>
          <label>
            Onset denominator{" "}
            <input
              aria-label="Inspector onset denominator"
              type="number"
              min="1"
              value={inspectorDraft.onsetD}
              onChange={(event) =>
                setInspectorDraft({ ...inspectorDraft, onsetD: event.target.value })
              }
            />
          </label>
          <label>
            Duration numerator{" "}
            <input
              aria-label="Inspector duration numerator"
              type="number"
              min="1"
              value={inspectorDraft.durationN}
              onChange={(event) =>
                setInspectorDraft({ ...inspectorDraft, durationN: event.target.value })
              }
            />
          </label>
          <label>
            Duration denominator{" "}
            <input
              aria-label="Inspector duration denominator"
              type="number"
              min="1"
              value={inspectorDraft.durationD}
              onChange={(event) =>
                setInspectorDraft({ ...inspectorDraft, durationD: event.target.value })
              }
            />
          </label>

          <span>{`Exact pitch ${inspectorNote.pitch.midiNumber}; onset ${inspectorNote.startBeats.numerator}/${inspectorNote.startBeats.denominator}; duration ${inspectorNote.durationBeats.numerator}/${inspectorNote.durationBeats.denominator}`}</span>
          <strong>Overlapping notes</strong>
          <ul>
            {notes
              .filter(
                (note) =>
                  note.sourceStepId !== inspectorNote.sourceStepId ||
                  note.eventKey !== inspectorNote.eventKey,
              )
              .filter(
                (note) =>
                  compareRational(
                    note.startBeats,
                    addRational(inspectorNote.startBeats, inspectorNote.durationBeats),
                  ) < 0 &&
                  compareRational(
                    addRational(note.startBeats, note.durationBeats),
                    inspectorNote.startBeats,
                  ) > 0,
              )
              .map((note) => {
                const end = addRational(note.startBeats, note.durationBeats);
                return (
                  <li
                    key={`${note.sourceStepId}:${note.eventKey}`}
                  >{`${note.pitch.midiNumber}, Step ${note.stepIndex + 1}, ${note.startBeats.numerator}/${note.startBeats.denominator}–${end.numerator}/${end.denominator}`}</li>
                );
              })}
          </ul>
          {editorMessage ? <p role="status">{editorMessage}</p> : null}
        </aside>
      ) : null}
      {editorMessage && !inspectorOpen ? (
        <p className="piano-roll-edit-status" role="status">
          {editorMessage}
        </p>
      ) : null}
      {marquee ? (
        <div
          aria-hidden="true"
          className="piano-roll-marquee"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
          }}
        />
      ) : null}
    </section>
  );
}
