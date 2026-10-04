import {
  useCallback,
  useRef,
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { MeasuresPerSystem, ProgressionView, Project } from "../../domain/project/project";
import type { AudioProviderState } from "../../audio/contracts";
import type {
  ChordStep,
  PianoArticulation,
  RestStep,
  StepPerformance,
} from "../../domain/progression/step";
import { formatChordSymbol } from "../../domain/harmony/chord";
import type { ExactPitch } from "../../domain/harmony/pitch";
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import {
  realizeProgressionStepChord,
  stepTranspositionSemitones,
} from "../../domain/progression/transposition";
import {
  formatMusicalDuration,
  musicalDuration,
  type MusicalDuration,
} from "../../domain/timing/duration";
import {
  createProgressionMeasureLayout,
  resolveExactMeasureStepRange,
  type ProgressionMeasureFragment,
  type ProgressionMeasureItem,
} from "../../domain/timing/measureLayout";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  rationalToNumber,
  subtractRational,
  type Rational,
} from "../../domain/timing/rational";
import type { LoopState } from "../transport/loopState";
import type { PlaybackClockSnapshot } from "../transport/transportStore";
import {
  getAvailableSubstitutions,
  type ChordSubstitution,
} from "../../domain/harmony/reharmonization";
import { ProgressionStepCard } from "./ProgressionStepCard";
import { RangeSelectionToolbar } from "./RangeSelectionToolbar";
import { isPianoRollSelectionHelpOpenTarget } from "../melody/pianoRollSelectionHelp";
import { previewRangeTransposition } from "../../app/commands/rangeTranspositionCommands";
import {
  EMPTY_RANGE_SELECTION,
  reduceRangeSelection,
  type RangeSelectionState,
} from "./rangeSelection";
import { ProgressionStepRemoveButton } from "./ProgressionStepRemoveButton";
import { orderSongSections } from "../../domain/progression/sections";
import type { SongSection } from "../../domain/progression/progression";
import {
  planMeasureDeletion,
  planMeasureDuplication,
  planMeasureInsertion,
} from "../../domain/progression/measureDeletion";
import { Icon } from "../common/Icon";
import type { MeasureStaffChordItem, MeasureStaffItem } from "../staff/MeasureStaffView";
import { ScoreSystemView } from "../staff/ScoreSystemView";
import type { ScoreSystem } from "../../notation/scoreSystemProjection";
import { MelodyContextMenu, type MelodyMenuPosition } from "../melody/MelodyContextMenu";
import { MeasureContextMenu, type MeasureMenuPosition } from "./MeasureContextMenu";
import { MelodyEditorDialog } from "../melody/MelodyEditorDialog";
import { InlineMelodyLane } from "../melody/InlineMelodyLane";
import {
  PianoRollMeasure,
  PianoRollSystemPitchGutter,
  PianoRollToolbar,
  type PianoRollColorMode,
  type PianoRollInspectorRequest,
} from "../melody/PianoRollView";
import {
  PianoRollMidiStepInput,
  type MidiStepInsertResult,
} from "../melody/PianoRollMidiStepInput";
import {
  INITIAL_MIDI_STEP_INPUT_SNAPSHOT,
  MidiStepInputController,
  advanceMidiCursor,
  midiStepDuration,
  type MidiNavigatorLike,
  type MidiStepDurationId,
  type MidiStepInputSnapshot,
} from "../melody/midiStepInput";
import { PianoRollSystemNotePanel } from "../melody/PianoRollSystemNotePanel";
import { PianoRollSystemChordPanel } from "../melody/PianoRollSystemChordPanel";
import {
  sameSystemChordIdentity,
  systemTieDisabledReason,
} from "../../app/commands/systemChordCommands";
import {
  readPianoRollPreferences,
  writePianoRollPreferences,
} from "../melody/pianoRollPreferences";
import type { AuthoredMelodyEdit } from "../../app/commands/authoredMelodyTransaction";
import { createMelodyTimeline } from "../../notation/melodyStaffProjection";
import { createEffectiveMelodyTimeline } from "../../domain/melody/effectiveTimeline";
import { pianoRollNoteIdentity, planPianoRollPaste } from "../melody/pianoRollGroupSelection";
import { isAppShortcutProtectedTarget } from "../studio/focusManagement";
import {
  getPianoRollClipboard,
  setPianoRollClipboard,
  type PianoRollClipboardNote,
} from "../melody/pianoRollSession";
import type {
  ChordMelodyRecipe,
  AuthoredMelodyPhrase,
  MelodyGrid,
  MelodyInstrument,
  MelodyPitchMotion,
  MelodyTrackSettings,
} from "../../domain/melody/types";

type PianoRollSelectionScope =
  | { readonly kind: "progression" }
  | { readonly kind: "measure"; readonly measureIndex: number }
  | { readonly kind: "system"; readonly systemIndex: number };

export interface PianoRollSelectionKeyEvent {
  readonly target: EventTarget | null;
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  readonly defaultPrevented: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}
import type { HarmonyTrackSettings } from "../../domain/harmony/track";
import { canShiftPerformanceOctave } from "../staff/staffOctave";
import type { FunctionalPreset, PresetApplyMode } from "../../domain/progression/presets";
import { GuidedStart } from "./GuidedStart";
import { formatProgressionChordLabel, type LabelHierarchyMode } from "./labelHierarchy";
import {
  createDurationResizeSnapshot,
  durationForResizeEndpoint,
  isDurationResizeSnapshotCurrent,
  moveDurationResizeEndpoint,
  screenXToAbsoluteResizeEndpoint,
  snapDurationResizeEndpoint,
  stepLabelForDurationResize,
  type DurationResizePreview,
  type DurationResizeSnapshot,
} from "./durationResizeAdapter";
import { pianoRollSnapBeats } from "../melody/pianoRollProjection";

function segmentStyle(
  durationBeats: MusicalDuration["beats"],
  barLengthBeats: MusicalDuration["beats"],
): CSSProperties {
  const ratio = rationalToNumber(durationBeats) / rationalToNumber(barLengthBeats);
  return { flex: `${Math.max(0, ratio)} 1 0` };
}

function exactRational(value: {
  readonly numerator: number;
  readonly denominator: number;
}): string {
  return `${value.numerator}/${value.denominator}`;
}

function focusDurationResizeTarget(track: HTMLDivElement | null, stepId: string): void {
  const focus = () => {
    const handles =
      track?.querySelectorAll<HTMLButtonElement>("[data-duration-resize-handle]") ?? [];
    const handle = Array.from(handles).find(
      (candidate) => candidate.dataset.durationResizeHandle === stepId,
    );
    const buttons =
      track?.querySelectorAll<HTMLButtonElement>("[data-progression-step-select]") ?? [];
    const fallback = Array.from(buttons).find((candidate) => candidate.dataset.stepId === stepId);
    (handle ?? fallback)?.focus();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
  else focus();
}

const NOOP_DURATION_RESIZE_STATUS_CHANGE = () => undefined;

interface PianoRollBoundaryResizeDraft {
  readonly selectedStepId: string;
  readonly edge: "left" | "right";
  readonly resizeMode: "boundary" | "isolated";
  readonly leftStepId: string;
  readonly rightStepId: string;
  readonly baseline: string;
  readonly originalBoundary: Rational;
  readonly previewBoundary: Rational;
  readonly pairStart: Rational;
  readonly pairEnd: Rational;
  readonly candidates: readonly Rational[];
  readonly snapQuantum: Rational;
  readonly draggedEdge: "left" | "right";
  readonly pointerId?: number;
  readonly grabOffset?: Rational;
  readonly pointerClientX?: number;
  readonly scrollContainer?: HTMLElement;
}

function stepTimelineStarts(
  steps: readonly Project["progression"]["steps"][number][],
): ReadonlyMap<string, Rational> {
  const starts = new Map<string, Rational>();
  let cursor = rational(0);
  for (const step of steps) {
    starts.set(step.id, cursor);
    cursor = addRational(cursor, step.duration.beats);
  }
  return starts;
}

function measureIndexAtBeat(beat: Rational, barLengthBeats: Rational): number {
  return Math.floor(
    (beat.numerator * barLengthBeats.denominator) / (beat.denominator * barLengthBeats.numerator),
  );
}

function boundarySnapCandidates(
  minimum: Rational,
  maximum: Rational,
  quantum: Rational,
): readonly Rational[] {
  if (compareRational(minimum, maximum) > 0 || compareRational(quantum, rational(0)) <= 0)
    return [];
  const minNumerator = minimum.numerator * quantum.denominator;
  const minDenominator = minimum.denominator * quantum.numerator;
  let index = Math.ceil(minNumerator / minDenominator);
  const candidates: Rational[] = [];
  for (let count = 0; count < 500_000; count += 1, index += 1) {
    const candidate = multiplyRational(quantum, rational(index));
    if (compareRational(candidate, maximum) > 0) break;
    if (compareRational(candidate, minimum) >= 0) candidates.push(candidate);
  }
  return Object.freeze(candidates);
}

function nearestBoundarySnap(raw: Rational, candidates: readonly Rational[]): Rational {
  let best = candidates[0];
  if (!best) throw new RangeError("This boundary has no valid Snap positions.");
  for (const candidate of candidates.slice(1)) {
    if (
      Math.abs(rationalToNumber(candidate) - rationalToNumber(raw)) <
      Math.abs(rationalToNumber(best) - rationalToNumber(raw))
    )
      best = candidate;
  }
  return best;
}

export function ProgressionTrack({
  project,
  currentPlayingStepIndex,
  loopState,
  onSelectStep,
  onClearSelection,
  onEditPerformance,
  onSetStepDuration,
  onDurationResizeStatusChange = NOOP_DURATION_RESIZE_STATUS_CHANGE,
  labelMode = "function-first",
  onRemove,
  onDuplicateStep,
  onInsertStepBefore,
  onInsertStepAfter,
  activeMatrixFunctionId,
  matrixReplacementFunctionId,
  pianoRollMatrixReplacement,
  selectedMatrixChordName,
  onReorder,
  onFocusMatrix,
  onFocusMatrixKey,
  onFocusMatrixChord,
  onCancelMatrixChordChoice,
  onFillGapWithRest,
  onExtendFinalChord,
  onRepeatFinalChord,
  onSetMelodyRecipe,
  onAuditionPianoRollMeasure,
  onAuditionPianoRollChord,
  onReplacePianoRollChord,
  onSetPianoRollRest,
  onSetPianoRollStepDuration,
  onSplitPianoRollStep,
  onTiePianoRollSteps,
  onTransferPianoRollBoundary,
  onAuditionPianoRollNote,
  onAuditionPianoRollSystem,
  pianoRollAuditionPlayhead,
  onPianoRollAuditionFinished,
  selectedPianoNote = null,
  onSelectedPianoNoteChange,
  onSelectedPianoChordChange,
  pianoRollInspectorRequest,
  pianoRollSelectionScopeResetVersion = 0,
  pianoRollSelectionKeyDownRef,
  pianoRollSelectAllActionRef,
  onPianoRollSelectionScopeLabelChange,
  onSetAuthoredMelody,
  onApplyPianoRollMelodyEdits,
  onInsertPianoRollMidiNote,
  onAuditionPianoRollMidiNote,
  onStopPianoRollMidiAudition,
  midiSessionKey = 0,
  midiStartupReady = true,
  transportStatus = "stopped",
  onRemoveMelodyRecipe,
  activeMelodyEventKey,
  activeEventStartedAt,
  playbackClockSnapshot,
  transportPlaying,
  melodyAudioState,
  melodyAudioError,
  onRetryMelodyAudio,
  isMelodyPreviewPlaying,
  onPlayMelodyPreview,
  onStopMelodyPreview,
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
  onOpenProgressionMenu,
  onDeleteMeasure,
  onDuplicateMeasure,
  onInsertMeasureAfter,
  onLoopMeasure,
  onToggleSuzukiColors,
  onApplyPreset,
  onOpenPresets,
  onApplySubstitution,
  onOpenModulation,
  onPlayRange,
  onToggleLoopRange,
  isLoopRangeActive,
  onCopyRange,
  onDuplicateRange,
  onDeleteRange,
  onResetPerformanceRange,
  onTransposeRange,
  onExploreRange,
}: {
  readonly project: Project;
  readonly currentPlayingStepIndex?: number | null;
  readonly loopState?: LoopState;
  readonly onSelectStep: (stepId: string) => void;
  readonly onClearSelection?: () => void;
  readonly onEditPerformance: (stepId: string, performance: Partial<StepPerformance>) => void;
  readonly onSetStepDuration: (stepId: string, duration: MusicalDuration) => void;
  readonly onDurationResizeStatusChange?: (status: string | null) => void;
  readonly labelMode?: LabelHierarchyMode;
  readonly onSetProgressionView: (view: ProgressionView) => void;
  readonly onRemove: (stepId: string) => void;
  readonly onDuplicateStep?: ((stepId: string) => void) | undefined;
  readonly onInsertStepBefore?: ((targetStepId: string, functionId: string) => void) | undefined;
  readonly onInsertStepAfter?: ((targetStepId: string, functionId: string) => void) | undefined;
  readonly activeMatrixFunctionId?: string | undefined;
  readonly matrixReplacementFunctionId?: string | undefined;
  readonly pianoRollMatrixReplacement?: {
    readonly stepId: string;
    readonly functionId: string | null;
  } | null;
  readonly selectedMatrixChordName?: string | undefined;
  readonly onReorder: (stepId: string, targetIndex: number) => void;
  readonly onAddRest?: (duration?: MusicalDuration) => void;
  readonly onFocusMatrix?: (measureNumber: number) => void;
  readonly onFocusMatrixKey?: () => void;
  readonly onFocusMatrixChord?: (stepId: string) => void;
  readonly onCancelMatrixChordChoice?: () => void;
  readonly onFillGapWithRest?: () => void;
  readonly onExtendFinalChord?: () => void;
  readonly onRepeatFinalChord?: () => void;
  readonly onSetMelodyRecipe?: (
    stepId: string,
    recipe: ChordMelodyRecipe,
    instrumentOverride?: MelodyInstrument,
  ) => void;
  readonly onAuditionPianoRollMeasure?: (
    measure: import("../../domain/timing/measureLayout").ProgressionMeasure,
  ) => void;
  readonly onAuditionPianoRollChord?: (stepId: string) => void;
  readonly onReplacePianoRollChord?: (stepId: string, functionId: string) => void;
  readonly onSetPianoRollRest?: (stepId: string) => void;
  readonly onSetPianoRollStepDuration?: (stepId: string, duration: MusicalDuration) => void;
  readonly onSplitPianoRollStep?: (stepId: string) => void;
  readonly onTiePianoRollSteps?: (stepIds: readonly string[]) => void;
  readonly onTransferPianoRollBoundary?: (
    leftStepId: string,
    boundary: Rational,
    snapQuantum: Rational,
    draggedStepId?: string,
    draggedEdge?: "left" | "right",
    resizeMode?: "boundary" | "isolated",
  ) => void;
  readonly onAuditionPianoRollNote?: (stepId: string, eventKey: string) => void;
  readonly onAuditionPianoRollSystem?: (system: ScoreSystem) => void;
  readonly pianoRollAuditionPlayhead?: {
    readonly requestId: number;
    readonly startBeat: number;
    readonly endBeat: number;
    readonly startedAt: number;
    readonly clockNow: () => number;
  } | null;
  readonly onPianoRollAuditionFinished?: (requestId: number) => void;
  readonly selectedPianoNote?: { readonly stepId: string; readonly eventKey: string } | null;
  readonly onSelectedPianoNoteChange?: (
    identity: { readonly stepId: string; readonly eventKey: string } | null,
  ) => void;
  readonly onSelectedPianoChordChange?: (stepId: string | null) => void;
  readonly pianoRollInspectorRequest?: PianoRollInspectorRequest | null | undefined;
  readonly pianoRollSelectionScopeResetVersion?: number;
  readonly pianoRollSelectionKeyDownRef?: {
    current: ((event: PianoRollSelectionKeyEvent) => void) | null;
  };
  readonly pianoRollSelectAllActionRef?: { current: (() => void) | null };
  readonly onPianoRollSelectionScopeLabelChange?: (label: string) => void;
  readonly onSetAuthoredMelody?: (
    stepId: string,
    phrase: AuthoredMelodyPhrase,
    sourceRecipe?: ChordMelodyRecipe,
  ) => void;
  readonly onApplyPianoRollMelodyEdits?: (
    edits: readonly AuthoredMelodyEdit[],
    convertStepIds?: readonly string[],
    expectedUpdatedAt?: string,
    appendSteps?: readonly RestStep[],
  ) => string | null | void;
  readonly onInsertPianoRollMidiNote?: (
    midiPitch: number,
    startBeats: Rational,
    durationBeats: Rational,
  ) => MidiStepInsertResult;
  readonly onAuditionPianoRollMidiNote?: (stepId: string, eventKey: string) => void;
  readonly onStopPianoRollMidiAudition?: () => void;
  readonly midiSessionKey?: number;
  readonly midiStartupReady?: boolean;
  readonly transportStatus?: "stopped" | "playing" | "paused";
  readonly onRemoveMelodyRecipe?: (stepId: string) => void;
  readonly onMelodyTrackSettingsChange?: (patch: Partial<MelodyTrackSettings>) => void;
  readonly onHarmonyTrackSettingsChange?: (patch: Partial<HarmonyTrackSettings>) => void;
  readonly activeMelodyEventKey?: string | null;
  readonly activeEventStartedAt?: number | null | undefined;
  readonly playbackClockSnapshot?: PlaybackClockSnapshot | null | undefined;
  readonly transportPlaying?: boolean;
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
  readonly onOpenProgressionMenu?:
    ((anchor: HTMLElement, position: { x: number; y: number }) => void) | undefined;
  readonly onDeleteMeasure?: ((measureIndex: number) => string | undefined) | undefined;
  readonly onDuplicateMeasure?: ((measureIndex: number) => string | undefined) | undefined;
  readonly onInsertMeasureAfter?: ((measureIndex: number) => string | undefined) | undefined;
  readonly onLoopMeasure?: ((measureIndex: number) => void) | undefined;
  readonly onToggleSuzukiColors?: (() => void) | undefined;
  readonly onApplyPreset?: ((preset: FunctionalPreset, mode: PresetApplyMode) => void) | undefined;
  readonly onOpenPresets?: (() => void) | undefined;
  readonly onApplySubstitution?:
    ((stepId: string, substitution: ChordSubstitution) => void) | undefined;
  readonly onOpenModulation?: ((stepId?: string) => void) | undefined;
  readonly onPlayRange?: ((stepIds: readonly string[]) => void) | undefined;
  readonly onToggleLoopRange?: ((stepIds: readonly string[]) => void) | undefined;
  readonly isLoopRangeActive?: ((stepIds: readonly string[]) => boolean) | undefined;
  readonly onCopyRange?: ((stepIds: readonly string[]) => void) | undefined;
  readonly onDuplicateRange?: ((stepIds: readonly string[]) => void) | undefined;
  readonly onDeleteRange?: ((stepIds: readonly string[]) => void) | undefined;
  readonly onResetPerformanceRange?: ((stepIds: readonly string[]) => void) | undefined;
  readonly onTransposeRange?:
    ((stepIds: readonly string[], semitones: number) => string | undefined) | undefined;
  readonly onExploreRange?: ((stepIds: readonly string[]) => void) | undefined;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pianoRollGridMode, setPianoRollGridMode] = useState<"degrees" | "chromatic">(
    () => readPianoRollPreferences().gridMode,
  );
  const [pianoRollColorMode, setPianoRollColorMode] = useState<PianoRollColorMode>(
    () => readPianoRollPreferences().colorMode,
  );
  const [pianoRollGuidesEnabled, setPianoRollGuidesEnabled] = useState(
    () => readPianoRollPreferences().guidesEnabled,
  );
  const [pianoRollZoom, setPianoRollZoom] = useState(() => readPianoRollPreferences().zoom);
  const [pianoRollSnap, setPianoRollSnap] = useState(() => readPianoRollPreferences().snap);
  const [pianoRollPitchRange, setPianoRollPitchRange] = useState(
    () => readPianoRollPreferences().pitchRange,
  );
  const [pianoRollPitchExpansion, setPianoRollPitchExpansion] = useState(0);
  useEffect(() => {
    writePianoRollPreferences({
      gridMode: pianoRollGridMode,
      paletteMode: readPianoRollPreferences().paletteMode,
      prospectiveDuration: readPianoRollPreferences().prospectiveDuration,
      prospectiveTriplet: readPianoRollPreferences().prospectiveTriplet,
      colorMode: pianoRollColorMode,
      guidesEnabled: pianoRollGuidesEnabled,
      zoom: pianoRollZoom,
      snap: pianoRollSnap,
      pitchRange: pianoRollPitchRange,
    });
  }, [
    pianoRollColorMode,
    pianoRollGridMode,
    pianoRollGuidesEnabled,
    pianoRollPitchRange,
    pianoRollSnap,
    pianoRollZoom,
  ]);
  const [selectedPianoNoteIdentities, setSelectedPianoNoteIdentities] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [pianoRollSelectionScope, setPianoRollSelectionScope] = useState<PianoRollSelectionScope>({
    kind: "progression",
  });
  const pianoRollSelectionSessionRef = useRef(`${project.id}\u0000${midiSessionKey}`);
  const [pianoRollEmptyCursor, setPianoRollEmptyCursor] = useState<{
    readonly startBeats: Rational;
    readonly pitch: ExactPitch;
  } | null>(null);
  const initialMidiCursor =
    stepTimelineStarts(project.progression.steps).get(project.progression.selectedStepId ?? "") ??
    rational(0);
  const [midiInsertionCursor, setMidiInsertionCursorState] = useState<Rational>(initialMidiCursor);
  const midiInsertionCursorRef = useRef(midiInsertionCursor);
  const [midiStepDurationId, setMidiStepDurationId] = useState<MidiStepDurationId>("quarter");
  const midiStepDurationIdRef = useRef<MidiStepDurationId>("quarter");
  const [manualMidiPitch, setManualMidiPitch] = useState("60");
  const manualMidiPitchRef = useRef("60");
  const [midiAuditionEnabled, setMidiAuditionEnabled] = useState(true);
  const midiAuditionEnabledRef = useRef(true);
  const [midiStepInputSnapshot, setMidiStepInputSnapshot] = useState<MidiStepInputSnapshot>(
    INITIAL_MIDI_STEP_INPUT_SNAPSHOT,
  );
  const [midiStepInsertStatus, setMidiStepInsertStatus] = useState<string | null>(null);
  const midiStepInputControllerRef = useRef<MidiStepInputController | null>(null);
  const midiStepInsertRef = useRef<(pitch: number) => MidiStepInsertResult>(() => ({
    ok: false,
    message: "MIDI step input is not ready.",
  }));
  const midiSessionIdentityRef = useRef(`${project.id}\u0000${midiSessionKey}`);
  const updateMidiInsertionCursor = useCallback((cursor: Rational) => {
    midiInsertionCursorRef.current = cursor;
    setMidiInsertionCursorState(cursor);
  }, []);
  const midiActivationRef = useRef(false);
  useLayoutEffect(() => {
    midiActivationRef.current =
      project.presentation.progressionView === "piano-roll" && transportStatus === "stopped";
  });
  const midiStopPreviewRef = useRef(onStopPianoRollMidiAudition);
  useLayoutEffect(() => {
    midiStopPreviewRef.current = onStopPianoRollMidiAudition;
  });
  useEffect(() => {
    const controller = new MidiStepInputController(
      (pitch) => {
        midiStepInsertRef.current(pitch);
      },
      () => midiActivationRef.current,
      () => midiStopPreviewRef.current?.(),
    );
    midiStepInputControllerRef.current = controller;
    const unsubscribe = controller.subscribe(setMidiStepInputSnapshot);
    return () => {
      unsubscribe();
      controller.dispose();
      midiStepInputControllerRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!midiStepInputSnapshot.effectiveInputEnabled) midiStopPreviewRef.current?.();
  }, [midiStepInputSnapshot.effectiveInputEnabled, midiStepInputSnapshot.selectedDeviceId]);
  useEffect(() => {
    if (!midiStartupReady) return;
    void midiStepInputControllerRef.current?.connectStartup(
      navigator as unknown as MidiNavigatorLike,
    );
  }, [midiStartupReady]);
  useLayoutEffect(() => {
    const identity = `${project.id}\u0000${midiSessionKey}`;
    if (midiSessionIdentityRef.current === identity) return;
    midiSessionIdentityRef.current = identity;
    const selectedStart = stepTimelineStarts(project.progression.steps).get(
      project.progression.selectedStepId ?? "",
    );
    updateMidiInsertionCursor(selectedStart ?? rational(0));
    midiStepInputControllerRef.current?.invalidateSession();
    onStopPianoRollMidiAudition?.();
  }, [
    midiSessionKey,
    onStopPianoRollMidiAudition,
    project.id,
    project.progression,
    updateMidiInsertionCursor,
  ]);
  useLayoutEffect(() => {
    if (project.presentation.progressionView !== "piano-roll" || transportStatus !== "stopped") {
      midiStepInputControllerRef.current?.disarm(
        transportStatus === "stopped"
          ? "Piano Roll is inactive. MIDI step input is disarmed."
          : "Transport is not stopped. MIDI step input is disarmed.",
      );
      onStopPianoRollMidiAudition?.();
    }
  }, [onStopPianoRollMidiAudition, project.presentation.progressionView, transportStatus]);
  useEffect(() => {
    const handleWindowBlur = () => {
      midiStepInputControllerRef.current?.suspendFocus();
      onStopPianoRollMidiAudition?.();
    };
    const handleWindowFocus = () => midiStepInputControllerRef.current?.resumeFocus();
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [onStopPianoRollMidiAudition]);
  useEffect(() => {
    const handleMidiInputKeyDown = (event: WindowEventMap["keydown"]) => {
      const controller = midiStepInputControllerRef.current;
      if (!controller) return;
      if (
        event.key === "Escape" &&
        (controller.snapshot.armed ||
          controller.pendingPermission ||
          project.presentation.progressionView === "piano-roll")
      ) {
        controller.disarm("Escape pressed. MIDI step input is disarmed.");
        onStopPianoRollMidiAudition?.();
        return;
      }
      if (
        event.key !== "Enter" ||
        event.repeat ||
        event.defaultPrevented ||
        !controller.snapshot.effectiveInputEnabled ||
        project.presentation.progressionView !== "piano-roll" ||
        transportStatus !== "stopped" ||
        !(event.target instanceof Element) ||
        event.target.closest(".piano-roll-midi-step-input")
      )
        return;
      if (event.target.closest(".piano-roll-grid")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!manualMidiPitchRef.current.trim()) {
          setMidiStepInsertStatus("Enter a MIDI pitch from 0 to 127.");
          return;
        }
        midiStepInsertRef.current(Number(manualMidiPitchRef.current));
      }
    };
    window.addEventListener("keydown", handleMidiInputKeyDown, true);
    return () => window.removeEventListener("keydown", handleMidiInputKeyDown, true);
  }, [onStopPianoRollMidiAudition, project.presentation.progressionView, transportStatus]);
  const [activePianoRollSystemIndex, setActivePianoRollSystemIndex] = useState<number | null>(() =>
    project.progression.steps.length ? 0 : null,
  );
  const [pianoRollChordSelection, setPianoRollChordSelection] = useState<{
    readonly stepIds: readonly string[];
    readonly anchorStepId: string;
    readonly activeStepId: string;
    readonly systemIndex: number;
  } | null>(null);
  useEffect(() => {
    if (project.presentation.progressionView === "piano-roll") return;
    setPianoRollEmptyCursor(null);
    setActivePianoRollSystemIndex(null);
    setPianoRollSelectionScope({ kind: "progression" });
    setPianoRollChordSelection(null);
    setSelectedPianoNoteIdentities((current) => (current.size === 0 ? current : new Set()));
    if (selectedPianoNote) onSelectedPianoNoteChange?.(null);
    onSelectedPianoChordChange?.(null);
  }, [
    onSelectedPianoChordChange,
    onSelectedPianoNoteChange,
    project.presentation.progressionView,
    selectedPianoNote,
  ]);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [matrixGapHint, setMatrixGapHint] = useState<number | null>(null);
  const [dismissedGuidanceProjectIds, setDismissedGuidanceProjectIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [melodyMenu, setMelodyMenu] = useState<{
    readonly stepId: string;
    readonly position: MelodyMenuPosition;
    readonly invoker: HTMLElement;
  } | null>(null);
  const [measureMenu, setMeasureMenu] = useState<{
    readonly measureIndex: number;
    readonly position: MeasureMenuPosition;
    readonly invoker: HTMLElement;
  } | null>(null);
  const [melodyEditorStepId, setMelodyEditorStepId] = useState<string | null>(null);
  const [rangeSelection, setRangeSelection] = useState<RangeSelectionState>(EMPTY_RANGE_SELECTION);
  const pendingFocusStepIdRef = useRef<string | null>(null);
  const [marquee, setMarquee] = useState<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly currentX: number;
    readonly currentY: number;
    readonly trackLeft: number;
    readonly trackTop: number;
  } | null>(null);
  const ignoreNextClickRef = useRef(false);
  const [durationResizeDraft, setDurationResizeDraft] = useState<{
    readonly stepId: string;
    readonly snapshot: DurationResizeSnapshot;
    readonly preview: DurationResizePreview;
    readonly pointerId?: number;
    readonly pointerStartClientX?: number;
    readonly pointerStartEndpointBeats?: number;
  } | null>(null);
  const durationResizeDraftRef = useRef<typeof durationResizeDraft>(null);
  const [pianoRollBoundaryResizeDraft, setPianoRollBoundaryResizeDraft] =
    useState<PianoRollBoundaryResizeDraft | null>(null);
  const pianoRollBoundaryResizeDraftRef = useRef<PianoRollBoundaryResizeDraft | null>(null);
  const durationResizeSnapshotsRef = useRef<{
    project: Project;
    snapshots: Map<string, DurationResizeSnapshot>;
  } | null>(null);
  const melodyInvokerRef = useRef<HTMLElement | null>(null);
  const selectedStepId =
    project.presentation.progressionView === "piano-roll"
      ? (pianoRollChordSelection?.activeStepId ?? project.progression.selectedStepId)
      : project.progression.selectedStepId;
  const orderedStepIds = useMemo(
    () => project.progression.steps.map((step) => step.id),
    [project.progression.steps],
  );
  const rangeStepIds = rangeSelection.stepIds;
  const rangeStepIdSet = useMemo(() => new Set(rangeStepIds), [rangeStepIds]);
  const pianoRollChordStepIdSet = useMemo(
    () => new Set(pianoRollChordSelection?.stepIds ?? []),
    [pianoRollChordSelection?.stepIds],
  );
  const isGuidanceDismissed = dismissedGuidanceProjectIds.has(project.id);

  useEffect(() => {
    if (project.progression.steps.length === 0) return;
    setDismissedGuidanceProjectIds((current) =>
      current.has(project.id) ? current : new Set([...current, project.id]),
    );
  }, [project.id, project.progression.steps.length]);
  const currentPlayingStepId =
    currentPlayingStepIndex === null || currentPlayingStepIndex === undefined
      ? undefined
      : project.progression.steps[currentPlayingStepIndex]?.id;
  const layout = createProgressionMeasureLayout(
    project.progression.steps,
    project.globalTiming.meter,
  );
  useEffect(() => {
    if (project.presentation.progressionView === "piano-roll")
      setPianoRollSelectionScope({ kind: "progression" });
  }, [pianoRollSelectionScopeResetVersion, project.presentation.progressionView]);
  useEffect(() => {
    if (project.presentation.progressionView !== "piano-roll") return;
    const measureCount = layout.measures.length;
    const systemCount = Array.from(
      trackRef.current?.querySelectorAll<HTMLElement>(".score-system[data-system-index]") ?? [],
    ).length;
    setActivePianoRollSystemIndex((current) =>
      systemCount === 0 ? null : current === null || current >= systemCount ? 0 : current,
    );
    setPianoRollSelectionScope((current) => {
      if (
        (current.kind === "measure" &&
          (current.measureIndex < 0 || current.measureIndex >= measureCount)) ||
        (current.kind === "system" &&
          (current.systemIndex < 0 || current.systemIndex >= systemCount))
      )
        return { kind: "progression" };
      return current;
    });
  }, [
    layout.measures.length,
    project.presentation.measuresPerSystem,
    project.presentation.progressionView,
  ]);
  useEffect(() => {
    const sessionIdentity = `${project.id}\u0000${midiSessionKey}`;
    if (pianoRollSelectionSessionRef.current === sessionIdentity) return;
    pianoRollSelectionSessionRef.current = sessionIdentity;
    setPianoRollSelectionScope({ kind: "progression" });
    setActivePianoRollSystemIndex(project.progression.steps.length ? 0 : null);
    setSelectedPianoNoteIdentities(new Set());
    setPianoRollChordSelection(null);
    setPianoRollEmptyCursor(null);
    onSelectedPianoNoteChange?.(null);
    onSelectedPianoChordChange?.(null);
  }, [
    midiSessionKey,
    onSelectedPianoChordChange,
    onSelectedPianoNoteChange,
    pianoRollSelectionSessionRef,
    project.id,
    project.progression.steps.length,
  ]);
  const attemptMidiStepInsert = (pitch: number): MidiStepInsertResult => {
    if (midiStepInputControllerRef.current?.snapshot.focusSuspended)
      return {
        ok: false,
        message: "MIDI input is temporarily paused while the window is inactive.",
      };
    if (
      project.presentation.progressionView !== "piano-roll" ||
      transportStatus !== "stopped" ||
      !onInsertPianoRollMidiNote
    ) {
      const message = "MIDI step input requires the Piano Roll with transport stopped.";
      setMidiStepInsertStatus(message);
      return { ok: false, message };
    }
    const duration = midiStepDuration(midiStepDurationIdRef.current).beats;
    const start = midiInsertionCursorRef.current;
    const result = onInsertPianoRollMidiNote(pitch, start, duration);
    if (!result.ok) {
      setMidiStepInsertStatus(result.message);
      return result;
    }
    updateMidiInsertionCursor(advanceMidiCursor(start, duration));
    setMidiStepInsertStatus(null);
    if (midiAuditionEnabledRef.current)
      onAuditionPianoRollMidiNote?.(result.stepId, result.eventKey);
    return result;
  };
  useLayoutEffect(() => {
    midiStepInsertRef.current = attemptMidiStepInsert;
  });
  const changeMidiStepDuration = (durationId: MidiStepDurationId) => {
    midiStepDurationIdRef.current = durationId;
    setMidiStepDurationId(durationId);
  };
  const changeManualMidiPitch = (pitch: string) => {
    manualMidiPitchRef.current = pitch;
    setManualMidiPitch(pitch);
  };
  const changeMidiAuditionEnabled = (enabled: boolean) => {
    midiAuditionEnabledRef.current = enabled;
    setMidiAuditionEnabled(enabled);
    if (!enabled) onStopPianoRollMidiAudition?.();
  };
  const cursorMeasureIndex = Math.floor(
    rationalToNumber(midiInsertionCursor) / rationalToNumber(layout.barLengthBeats),
  );
  const cursorMeasureStart = multiplyRational(layout.barLengthBeats, rational(cursorMeasureIndex));
  const cursorBeat = subtractRational(midiInsertionCursor, cursorMeasureStart);
  const loopIndices = (() => {
    if (!loopState?.enabled || !loopState.region) return null;
    const start = project.progression.steps.findIndex(
      (s) => s.id === loopState.region?.startStepId,
    );
    const end = project.progression.steps.findIndex((s) => s.id === loopState.region?.endStepId);
    if (start === -1 || end === -1 || start > end) return null;
    return { start, end };
  })();
  const hasMelodyRecipe = project.progression.steps.some((step) =>
    step.kind === "chord" ? step.melody !== undefined : step.authoredMelody !== undefined,
  );
  const melodyTimeline = useMemo(
    () => (hasMelodyRecipe ? createMelodyTimeline(project) : null),
    [hasMelodyRecipe, project],
  );
  const effectivePianoRollNotes = useMemo(() => createEffectiveMelodyTimeline(project), [project]);

  const getRenderedPianoRollMeasureIndices = (systemIndex?: number): number[] =>
    Array.from(
      trackRef.current?.querySelectorAll<HTMLElement>(
        ".piano-roll-measure[data-measure-index][data-system-index]",
      ) ?? [],
    )
      .filter(
        (element) =>
          systemIndex === undefined || Number(element.dataset.systemIndex) === systemIndex,
      )
      .map((element) => Number(element.dataset.measureIndex))
      .filter((index) => Number.isInteger(index));

  const selectPianoRollNotesInMeasures = (measureIndices: readonly number[]) => {
    const measureWindows = measureIndices
      .map((index) => layout.measures[index])
      .filter((measure): measure is (typeof layout.measures)[number] => measure !== undefined);
    const selected = new Map<
      string,
      { readonly sourceStepId: string; readonly eventKey: string }
    >();
    for (const note of effectivePianoRollNotes) {
      const noteEnd = addRational(note.startBeats, note.durationBeats);
      if (
        measureWindows.some(
          (window) =>
            compareRational(note.startBeats, window.endBeats) < 0 &&
            compareRational(noteEnd, window.startBeats) > 0,
        )
      )
        selected.set(pianoRollNoteIdentity(note.sourceStepId, note.eventKey), {
          sourceStepId: note.sourceStepId,
          eventKey: note.eventKey,
        });
    }
    const identities = [...selected.keys()];
    setSelectedPianoNoteIdentities(new Set(identities));
    setPianoRollChordSelection(null);
    onSelectedPianoChordChange?.(null);
    const first = selected.values().next().value as
      { readonly sourceStepId: string; readonly eventKey: string } | undefined;
    if (!first) {
      onSelectedPianoNoteChange?.(null);
      return;
    }
    onSelectedPianoNoteChange?.({ stepId: first.sourceStepId, eventKey: first.eventKey });
  };

  const selectAllPianoRollNotes = () =>
    selectPianoRollNotesInMeasures(layout.measures.map((measure) => measure.measureIndex));

  const handlePianoRollActiveMeasureChange = (measureIndex: number, systemIndex?: number) => {
    setActivePianoRollSystemIndex(systemIndex ?? null);
    setPianoRollSelectionScope({ kind: "measure", measureIndex });
  };

  const setPianoRollSystemScope = (systemIndex: number) => {
    setActivePianoRollSystemIndex(systemIndex);
    setPianoRollSelectionScope({ kind: "system", systemIndex });
  };

  const pianoRollSelectionScopeLabel =
    pianoRollSelectionScope.kind === "progression"
      ? "Progression"
      : pianoRollSelectionScope.kind === "measure"
        ? `Measure ${layout.measures[pianoRollSelectionScope.measureIndex]?.number ?? pianoRollSelectionScope.measureIndex + 1}`
        : `System ${pianoRollSelectionScope.systemIndex + 1}`;
  useEffect(() => {
    onPianoRollSelectionScopeLabelChange?.(pianoRollSelectionScopeLabel);
  }, [onPianoRollSelectionScopeLabelChange, pianoRollSelectionScopeLabel]);

  const getSelectedEffectivePianoRollNotes = () =>
    effectivePianoRollNotes.filter((note) =>
      selectedPianoNoteIdentities.has(pianoRollNoteIdentity(note.sourceStepId, note.eventKey)),
    );

  const getPianoRollClipboardForNotes = (
    notes: readonly (typeof effectivePianoRollNotes)[number][],
  ): readonly PianoRollClipboardNote[] => {
    if (!notes.length) return [];
    const earliest = notes.reduce(
      (start, note) => (compareRational(note.startBeats, start) < 0 ? note.startBeats : start),
      notes[0]!.startBeats,
    );
    return notes.map((note) => ({
      pitch: note.pitch,
      onset: subtractRational(note.startBeats, earliest),
      duration: note.durationBeats,
      instrument: note.instrument,
    }));
  };

  const clearTransientPianoRollNoteSelection = () => {
    setSelectedPianoNoteIdentities(new Set());
    setPianoRollChordSelection(null);
    onSelectedPianoNoteChange?.(null);
    onSelectedPianoChordChange?.(null);
  };

  const deleteSelectedPianoRollNotes = (): string | null => {
    const notes = getSelectedEffectivePianoRollNotes();
    if (!notes.length) {
      clearTransientPianoRollNoteSelection();
      return null;
    }
    if (!onApplyPianoRollMelodyEdits) return "Melody editing is unavailable in this Piano Roll.";
    const edits: AuthoredMelodyEdit[] = notes.map((note) => ({
      type: "delete",
      sourceStepId: note.sourceStepId,
      noteId: note.eventKey,
    }));
    const error = onApplyPianoRollMelodyEdits(edits, [], project.updatedAt);
    if (error) return error;
    clearTransientPianoRollNoteSelection();
    return null;
  };

  const commitPianoRollPasteAt = (anchor: Rational): string | null => {
    const clipboard = getPianoRollClipboard();
    if (!clipboard.length) return null;
    if (!onApplyPianoRollMelodyEdits) return "Melody editing is unavailable in this Piano Roll.";
    try {
      const plan = planPianoRollPaste(project, clipboard, anchor);
      const error = onApplyPianoRollMelodyEdits(
        plan.edits,
        [],
        project.updatedAt,
        plan.appendedSteps ?? [],
      );
      if (error) return error;
      const identities = plan.selection.map((identity) =>
        pianoRollNoteIdentity(identity.sourceStepId, identity.eventKey),
      );
      setSelectedPianoNoteIdentities(new Set(identities));
      const first = plan.selection[0];
      onSelectedPianoNoteChange?.(
        first ? { stepId: first.sourceStepId, eventKey: first.eventKey } : null,
      );
      onSelectedPianoChordChange?.(null);
      setPianoRollChordSelection(null);
      setPianoRollEmptyCursor(null);
      onDurationResizeStatusChange(null);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Piano Roll paste was rejected.";
    }
  };

  const handlePianoRollKeyDownCapture = (event: PianoRollSelectionKeyEvent) => {
    if (event.key === "Escape" && isPianoRollSelectionHelpOpenTarget(event.target)) return;
    if (
      project.presentation.progressionView !== "piano-roll" ||
      isAppShortcutProtectedTarget(event.target)
    )
      return;
    const target = event.target instanceof Element ? event.target : null;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (event.key === "Escape") {
      event.preventDefault();
      if (selectedPianoNoteIdentities.size > 0) clearTransientPianoRollNoteSelection();
      if (rangeStepIds.length > 0) setRangeSelection(EMPTY_RANGE_SELECTION);
      if (pianoRollChordSelection) {
        setPianoRollChordSelection(null);
        onSelectedPianoChordChange?.(null);
      }
      return;
    }

    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      !event.repeat &&
      selectedPianoNoteIdentities.size > 0
    ) {
      event.preventDefault();
      event.stopPropagation();
      onDurationResizeStatusChange(deleteSelectedPianoRollNotes());
      return;
    }

    if (modifier && key === "a") {
      event.preventDefault();
      event.stopPropagation();
      const measureIndices =
        pianoRollSelectionScope.kind === "progression"
          ? layout.measures.map((measure) => measure.measureIndex)
          : pianoRollSelectionScope.kind === "measure"
            ? [pianoRollSelectionScope.measureIndex]
            : getRenderedPianoRollMeasureIndices(pianoRollSelectionScope.systemIndex);
      selectPianoRollNotesInMeasures(measureIndices);
      return;
    }

    if (modifier && (key === "c" || key === "x") && selectedPianoNoteIdentities.size > 0) {
      event.preventDefault();
      event.stopPropagation();
      const notes = getSelectedEffectivePianoRollNotes();
      if (!notes.length) {
        clearTransientPianoRollNoteSelection();
        return;
      }
      const nextClipboard = getPianoRollClipboardForNotes(notes);
      if (key === "c") {
        setPianoRollClipboard(nextClipboard);
        onDurationResizeStatusChange(null);
        return;
      }
      const error = deleteSelectedPianoRollNotes();
      if (error) {
        onDurationResizeStatusChange(error);
        return;
      }
      setPianoRollClipboard(nextClipboard);
      onDurationResizeStatusChange(null);
      return;
    }

    if (modifier && key === "d" && selectedPianoNoteIdentities.size > 0) {
      event.preventDefault();
      event.stopPropagation();
      const notes = getSelectedEffectivePianoRollNotes();
      if (!notes.length) {
        clearTransientPianoRollNoteSelection();
        return;
      }
      const nextClipboard = getPianoRollClipboardForNotes(notes);
      const end = notes.reduce((latest, note) => {
        const noteEnd = addRational(note.startBeats, note.durationBeats);
        return compareRational(noteEnd, latest) > 0 ? noteEnd : latest;
      }, notes[0]!.startBeats);
      if (!onApplyPianoRollMelodyEdits) {
        onDurationResizeStatusChange("Melody editing is unavailable in this Piano Roll.");
        return;
      }
      try {
        const plan = planPianoRollPaste(project, nextClipboard, end);
        const error = onApplyPianoRollMelodyEdits(
          plan.edits,
          [],
          project.updatedAt,
          plan.appendedSteps ?? [],
        );
        if (error) {
          onDurationResizeStatusChange(error);
          return;
        }
        setPianoRollClipboard(nextClipboard);
        const identities = plan.selection.map((identity) =>
          pianoRollNoteIdentity(identity.sourceStepId, identity.eventKey),
        );
        setSelectedPianoNoteIdentities(new Set(identities));
        const first = plan.selection[0];
        onSelectedPianoNoteChange?.(
          first ? { stepId: first.sourceStepId, eventKey: first.eventKey } : null,
        );
        onSelectedPianoChordChange?.(null);
        setPianoRollChordSelection(null);
        onDurationResizeStatusChange(null);
      } catch (error) {
        onDurationResizeStatusChange(
          error instanceof Error ? error.message : "Piano Roll duplicate was rejected.",
        );
      }
      return;
    }

    if (
      modifier &&
      key === "v" &&
      !target?.closest(".piano-roll-grid, button.piano-roll-note") &&
      getPianoRollClipboard().length > 0
    ) {
      event.preventDefault();
      event.stopPropagation();
      const anchor = pianoRollEmptyCursor?.startBeats;
      if (!anchor) {
        onDurationResizeStatusChange("Click a target time in the Piano Roll before pasting notes.");
        return;
      }
      onDurationResizeStatusChange(commitPianoRollPasteAt(anchor));
    }
  };

  const latestPianoRollKeyDownHandlerRef = useRef<
    ((event: PianoRollSelectionKeyEvent) => void) | null
  >(null);
  const latestPianoRollSelectAllHandlerRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    latestPianoRollKeyDownHandlerRef.current = handlePianoRollKeyDownCapture;
    latestPianoRollSelectAllHandlerRef.current = selectAllPianoRollNotes;
  });
  useLayoutEffect(() => {
    const keyDownRef = pianoRollSelectionKeyDownRef;
    const selectAllRef = pianoRollSelectAllActionRef;
    const keyDownHandler = (event: PianoRollSelectionKeyEvent) =>
      latestPianoRollKeyDownHandlerRef.current?.(event);
    const selectAllHandler = () => latestPianoRollSelectAllHandlerRef.current?.();
    if (keyDownRef) keyDownRef.current = keyDownHandler;
    if (selectAllRef) selectAllRef.current = selectAllHandler;
    return () => {
      if (keyDownRef?.current === keyDownHandler) keyDownRef.current = null;
      if (selectAllRef?.current === selectAllHandler) selectAllRef.current = null;
    };
  }, [pianoRollSelectAllActionRef, pianoRollSelectionKeyDownRef]);

  useEffect(() => {
    setRangeSelection((current) =>
      reduceRangeSelection(current, { type: "sync", orderedStepIds }, orderedStepIds),
    );
  }, [orderedStepIds]);

  const focusStepTarget = useCallback((stepId: string | undefined) => {
    if (!stepId) return;
    const focus = () => {
      const pianoRollTarget = Array.from(
        trackRef.current?.querySelectorAll<HTMLButtonElement>(
          ".piano-roll-chord[data-source-step-id]",
        ) ?? [],
      ).find((candidate) => candidate.dataset.sourceStepId === stepId);
      const target = Array.from(
        trackRef.current?.querySelectorAll<HTMLElement>("[data-progression-step-select]") ?? [],
      ).find((candidate) => candidate.dataset.stepId === stepId);
      (pianoRollTarget ?? target)?.focus();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
    else focus();
  }, []);

  useLayoutEffect(() => {
    const stepId = pendingFocusStepIdRef.current;
    if (!stepId || !project.progression.steps.some((step) => step.id === stepId)) return;
    pendingFocusStepIdRef.current = null;
    const pianoRollTarget = Array.from(
      trackRef.current?.querySelectorAll<HTMLButtonElement>(
        ".piano-roll-chord[data-source-step-id]",
      ) ?? [],
    ).find((candidate) => candidate.dataset.sourceStepId === stepId);
    const progressionTarget = Array.from(
      trackRef.current?.querySelectorAll<HTMLElement>("[data-progression-step-select]") ?? [],
    ).find((candidate) => candidate.dataset.stepId === stepId);
    (pianoRollTarget ?? progressionTarget)?.focus({ preventScroll: true });
  }, [project.progression.steps]);

  const removeStepAndRestoreFocus = (stepId: string) => {
    const step = project.progression.steps.find((candidate) => candidate.id === stepId);
    if (!step || step.kind === "rest") return;
    pendingFocusStepIdRef.current = stepId;
    onRemove(stepId);
  };

  const applyPianoRollChordTie = (stepIds: readonly string[]): void => {
    const retainedStepId = stepIds.find(
      (id) => project.progression.steps.find((step) => step.id === id)?.kind === "chord",
    );
    onTiePianoRollSteps?.(stepIds);
    if (!retainedStepId) return;
    onSelectedPianoChordChange?.(retainedStepId);
    setPianoRollChordSelection((current) => ({
      stepIds: [retainedStepId],
      anchorStepId: retainedStepId,
      activeStepId: retainedStepId,
      systemIndex: current?.systemIndex ?? 0,
    }));
  };

  const updateRangeSelection = (
    stepId: string,
    extend: boolean,
    focus = true,
    updateProjectSelection = true,
  ): void => {
    setRangeSelection((current) =>
      reduceRangeSelection(current, { type: extend ? "extend" : "click", stepId }, orderedStepIds),
    );
    if (updateProjectSelection) onSelectStep(stepId);
    if (focus) focusStepTarget(stepId);
  };

  const stepIdFromSelectionTarget = (target: EventTarget | null): string | undefined => {
    if (!(target instanceof Element)) return undefined;
    if (target.closest("[data-duration-resize-handle], [role=slider], .staff-octave-button")) {
      return undefined;
    }
    const selectionTarget = target.closest<HTMLElement>(
      "[data-progression-step-select], [data-melody-event-key], .progression-step-continuation, .progression-rest-card",
    );
    if (!selectionTarget) return undefined;
    if (
      selectionTarget.tagName === "BUTTON" &&
      !selectionTarget.matches("[data-progression-step-select], [data-melody-event-key]")
    ) {
      return undefined;
    }
    return selectionTarget.dataset.stepId;
  };

  const handleSelectionClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        '[data-testid="piano-roll-audition-measure"], [data-testid^="score-system-audition-"]',
      )
    ) {
      ignoreNextClickRef.current = false;
      return;
    }
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const stepId = stepIdFromSelectionTarget(event.target);
    if (!stepId) return;
    event.preventDefault();
    event.stopPropagation();
    updateRangeSelection(stepId, event.shiftKey);
  };

  const handleRangeKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isAppShortcutProtectedTarget(event.target)) return;
    if (event.key === "Delete" && !event.repeat && rangeStepIds.length <= 1) {
      const target = event.target instanceof Element ? event.target : null;
      // Melody notes own Delete/Backspace on their grid. A selected harmony
      // chord can be cleared from the surrounding progression surface.
      if (target?.closest(".piano-roll-grid, button.piano-roll-note")) return;
      const selected = project.progression.steps.find((step) => step.id === selectedStepId);
      if (selected?.kind === "chord" && onRemove) {
        event.preventDefault();
        event.stopPropagation();
        pendingFocusStepIdRef.current = selected.id;
        onRemove(selected.id);
        return;
      }
    }
    // Piano Roll notes own Shift+Arrow as onset editing; do not consume it as
    // progression range navigation before the note button can handle it.
    if (event.target instanceof Element && event.target.closest("button.piano-roll-note")) {
      return;
    }

    if (event.key === "Escape" && rangeStepIds.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      const restoreId =
        selectedStepId ?? rangeSelection.focusId ?? rangeSelection.anchorId ?? undefined;
      setRangeSelection(EMPTY_RANGE_SELECTION);
      focusStepTarget(restoreId);
      return;
    }

    if (
      !event.shiftKey ||
      event.repeat ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    const currentId =
      (event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-progression-step-select]")?.dataset.stepId
        : undefined) ??
      rangeSelection.focusId ??
      selectedStepId;
    if (!currentId) return;
    const currentIndex = orderedStepIds.indexOf(currentId);
    const nextIndex = currentIndex + (event.key === "ArrowRight" ? 1 : -1);
    const nextId = orderedStepIds[nextIndex];
    if (currentIndex < 0 || !nextId) return;
    event.preventDefault();
    event.stopPropagation();
    setRangeSelection((current) =>
      reduceRangeSelection(current, { type: "extend", stepId: nextId }, orderedStepIds),
    );
    onSelectStep(nextId);
    focusStepTarget(nextId);
  };

  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.startX, marquee.currentX),
        top: Math.min(marquee.startY, marquee.currentY),
        right: Math.max(marquee.startX, marquee.currentX),
        bottom: Math.max(marquee.startY, marquee.currentY),
      }
    : null;

  const collectMarqueeStepIds = (rect: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  }): readonly string[] => {
    const boundsById = new Map<
      string,
      { left: number; top: number; right: number; bottom: number }
    >();
    for (const element of trackRef.current?.querySelectorAll<HTMLElement>("[data-step-id]") ?? []) {
      const stepId = element.dataset.stepId;
      if (!stepId || !orderedStepIds.includes(stepId)) continue;
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) continue;
      const previous = boundsById.get(stepId);
      boundsById.set(stepId, {
        left: Math.min(previous?.left ?? bounds.left, bounds.left),
        top: Math.min(previous?.top ?? bounds.top, bounds.top),
        right: Math.max(previous?.right ?? bounds.right, bounds.right),
        bottom: Math.max(previous?.bottom ?? bounds.bottom, bounds.bottom),
      });
    }
    return orderedStepIds.filter((stepId) => {
      const bounds = boundsById.get(stepId);
      return Boolean(
        bounds &&
        bounds.left <= rect.right &&
        bounds.right >= rect.left &&
        bounds.top <= rect.bottom &&
        bounds.bottom >= rect.top,
      );
    });
  };

  const isMarqueeBackground = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (
      target.closest(
        "button, input, select, textarea, a, [contenteditable], [data-progression-step-drag], [data-duration-resize-handle], .progression-step-card, .progression-rest-card, .progression-step-continuation, .measure-staff-event, .piano-roll-grid, .piano-roll-note-layer, .piano-roll-note, .piano-roll-toolbar, [role=menu], [role=dialog]",
      )
    ) {
      return false;
    }
    return Boolean(
      target.closest(
        ".progression-track, .progression-step-cards, .progression-measure-grid, .score-system-paper",
      ),
    );
  };

  const handleMarqueePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (project.presentation.progressionView === "piano-roll") return;
    if (event.button !== 0 || !isMarqueeBackground(event.target)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setMarquee({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      trackLeft: event.currentTarget.getBoundingClientRect().left,
      trackTop: event.currentTarget.getBoundingClientRect().top,
    });
  };

  const handleMarqueePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    if (
      Math.abs(event.clientX - marquee.startX) > 3 ||
      Math.abs(event.clientY - marquee.startY) > 3
    ) {
      ignoreNextClickRef.current = true;
    }
    setMarquee((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, currentX: event.clientX, currentY: event.clientY }
        : current,
    );
  };

  const finishMarquee = (event: PointerEvent<HTMLDivElement>) => {
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    const finalRect = {
      left: Math.min(marquee.startX, event.clientX),
      top: Math.min(marquee.startY, event.clientY),
      right: Math.max(marquee.startX, event.clientX),
      bottom: Math.max(marquee.startY, event.clientY),
    };
    const stepIds = collectMarqueeStepIds(finalRect);
    setMarquee(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (stepIds.length === 0) {
      setRangeSelection(EMPTY_RANGE_SELECTION);
      onClearSelection?.();
      return;
    }
    setRangeSelection((current) =>
      reduceRangeSelection(current, { type: "marquee", stepIds }, orderedStepIds),
    );
    onSelectStep(stepIds[0]!);
    focusStepTarget(stepIds[0]);
  };

  const restoreDurationResizeFocus = (stepId: string) => {
    focusDurationResizeTarget(trackRef.current, stepId);
  };

  const setDurationResizeDraftValue = (draft: typeof durationResizeDraft): void => {
    durationResizeDraftRef.current = draft;
    setDurationResizeDraft(draft);
  };

  const getDurationResizeSnapshot = (stepId: string): DurationResizeSnapshot => {
    if (durationResizeSnapshotsRef.current?.project !== project) {
      durationResizeSnapshotsRef.current = { project, snapshots: new Map() };
    }
    const snapshots = durationResizeSnapshotsRef.current.snapshots;
    let snapshot = snapshots.get(stepId);
    if (!snapshot) {
      snapshot = createDurationResizeSnapshot(project, stepId);
      snapshots.set(stepId, snapshot);
    }
    return snapshot;
  };

  useEffect(() => {
    onDurationResizeStatusChange(durationResizeDraft?.preview.announcement ?? null);
  }, [durationResizeDraft, onDurationResizeStatusChange]);

  useEffect(() => () => onDurationResizeStatusChange(null), [onDurationResizeStatusChange]);

  const cancelDurationResize = (restoreFocus = true) => {
    const current = durationResizeDraftRef.current;
    if (!current) return;
    setDurationResizeDraftValue(null);
    if (restoreFocus) restoreDurationResizeFocus(current.stepId);
  };

  useEffect(() => {
    const current = durationResizeDraftRef.current;
    if (current && !isDurationResizeSnapshotCurrent(project, current.snapshot)) {
      durationResizeDraftRef.current = null;
      setDurationResizeDraft(null);
      focusDurationResizeTarget(trackRef.current, current.stepId);
    }
  }, [project]);

  useEffect(() => {
    const handleWindowBlur = () => {
      const current = durationResizeDraftRef.current;
      if (!current) return;
      durationResizeDraftRef.current = null;
      setDurationResizeDraft(null);
      focusDurationResizeTarget(trackRef.current, current.stepId);
    };
    const handleWindowFocus = () => midiStepInputControllerRef.current?.resumeFocus();
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  const measureGeometryForPointer = (
    target: HTMLElement,
    measure: (typeof layout.measures)[number],
    clientX: number,
  ): number => {
    const grid = target.closest<HTMLElement>("[data-testid=progression-measure-grid]");
    if (grid) {
      const rect = grid.getBoundingClientRect();
      return screenXToAbsoluteResizeEndpoint(clientX, {
        measureStartBeats: measure.startBeats,
        barLengthBeats: layout.barLengthBeats,
        viewportLeftPx: rect.left,
        viewportWidthPx: Math.max(grid.clientWidth, 1),
        screenWidthPx: Math.max(rect.width, 1),
        contentWidthPx: Math.max(grid.scrollWidth, grid.clientWidth, 1),
        scrollLeftPx: grid.scrollLeft,
      });
    }

    const staffEvent = target.closest<HTMLElement>(".measure-staff-event");
    const paper = target.closest<HTMLElement>(".score-system-paper");
    if (!staffEvent || !paper) throw new RangeError("duration resize geometry is unavailable");
    const leftPx = Number(staffEvent.dataset.resizeMeasureLeftPx);
    const widthPx = Number(staffEvent.dataset.resizeMeasureWidthPx);
    const paperWidthPx = Number(staffEvent.dataset.resizePaperWidthPx);
    const paperRect = paper.getBoundingClientRect();
    if (
      ![leftPx, widthPx, paperWidthPx].every(Number.isFinite) ||
      widthPx <= 0 ||
      paperWidthPx <= 0
    ) {
      throw new RangeError("duration resize staff geometry is invalid");
    }
    const screenScale = paperRect.width / paperWidthPx;
    return screenXToAbsoluteResizeEndpoint(clientX, {
      measureStartBeats: measure.startBeats,
      barLengthBeats: layout.barLengthBeats,
      viewportLeftPx: paperRect.left + leftPx * screenScale,
      viewportWidthPx: widthPx,
      screenWidthPx: widthPx * screenScale,
      contentWidthPx: widthPx,
    });
  };

  const setPianoRollBoundaryDraftValue = useCallback(
    (draft: PianoRollBoundaryResizeDraft | null): void => {
      pianoRollBoundaryResizeDraftRef.current = draft;
      setPianoRollBoundaryResizeDraft(draft);
    },
    [],
  );

  const restorePianoRollBoundaryFocus = useCallback((draft: PianoRollBoundaryResizeDraft): void => {
    const handle = Array.from(
      trackRef.current?.querySelectorAll<HTMLButtonElement>(".piano-roll-chord-boundary-handle") ??
        [],
    ).find(
      (candidate) =>
        candidate.dataset.boundaryStepId === draft.selectedStepId &&
        candidate.dataset.boundaryEdge === draft.edge,
    );
    handle?.focus({ preventScroll: true });
  }, []);

  const cancelPianoRollBoundaryResize = useCallback(
    (restoreFocus = true): void => {
      const current = pianoRollBoundaryResizeDraftRef.current;
      if (!current) return;
      setPianoRollBoundaryDraftValue(null);
      onDurationResizeStatusChange(null);
      if (restoreFocus) restorePianoRollBoundaryFocus(current);
    },
    [onDurationResizeStatusChange, restorePianoRollBoundaryFocus, setPianoRollBoundaryDraftValue],
  );

  const createPianoRollBoundarySnapshot = (
    selectedStepId: string,
    edge: "left" | "right",
    resizeMode: "boundary" | "isolated" = "boundary",
  ): PianoRollBoundaryResizeDraft => {
    const selectedIndex = project.progression.steps.findIndex((step) => step.id === selectedStepId);
    if (selectedIndex < 0) throw new RangeError("The selected Step no longer exists.");
    const selected = project.progression.steps[selectedIndex]!;
    const starts = stepTimelineStarts(project.progression.steps);
    const snapQuantum = pianoRollSnapBeats(pianoRollSnap);
    const minimumDuration = rational(1, 24);
    if (edge === "left" && selectedIndex === 0) {
      if (selected.kind !== "chord")
        throw new RangeError("Only a chord has a resizable left edge.");
      const pairStart = starts.get(selected.id)!;
      const pairEnd = addRational(pairStart, selected.duration.beats);
      const candidates = boundarySnapCandidates(
        pairStart,
        subtractRational(pairEnd, minimumDuration),
        snapQuantum,
      );
      if (!candidates.length)
        throw new RangeError("This chord has no valid left-edge Snap positions.");
      return {
        selectedStepId,
        edge,
        resizeMode,
        leftStepId: selected.id,
        rightStepId: selected.id,
        baseline: project.updatedAt,
        originalBoundary: pairStart,
        previewBoundary: pairStart,
        pairStart,
        pairEnd,
        candidates,
        snapQuantum,
        draggedEdge: edge,
      };
    }
    if (edge === "right" && selectedIndex === project.progression.steps.length - 1) {
      if (selected.kind !== "chord")
        throw new RangeError("Only a chord has a resizable right edge.");
      const pairStart = starts.get(selected.id)!;
      const pairEnd = addRational(pairStart, selected.duration.beats);
      const candidates = boundarySnapCandidates(
        addRational(pairStart, minimumDuration),
        pairEnd,
        snapQuantum,
      );
      if (!candidates.length)
        throw new RangeError("This chord has no valid right-edge Snap positions.");
      return {
        selectedStepId,
        edge,
        resizeMode,
        leftStepId: selected.id,
        rightStepId: selected.id,
        baseline: project.updatedAt,
        originalBoundary: pairEnd,
        previewBoundary: pairEnd,
        pairStart,
        pairEnd,
        candidates,
        snapQuantum,
        draggedEdge: edge,
      };
    }
    const leftIndex = edge === "left" ? selectedIndex - 1 : selectedIndex;
    const rightIndex = leftIndex + 1;
    const left = project.progression.steps[leftIndex];
    const right = project.progression.steps[rightIndex];
    if (!left || !right) throw new RangeError("There is no adjacent Step boundary to resize.");
    const pairStart = starts.get(left.id)!;
    const originalBoundary = starts.get(right.id)!;
    const pairEnd = addRational(originalBoundary, right.duration.beats);
    const measureIndex = measureIndexAtBeat(pairStart, layout.barLengthBeats);
    const measureEnd = multiplyRational(layout.barLengthBeats, rational(measureIndex + 1));
    const boundaryMeasureStart = multiplyRational(
      layout.barLengthBeats,
      rational(measureIndexAtBeat(originalBoundary, layout.barLengthBeats)),
    );
    const boundaryMeasureEnd = addRational(boundaryMeasureStart, layout.barLengthBeats);
    const sameMeasurePair =
      measureIndexAtBeat(pairStart, layout.barLengthBeats) ===
        measureIndexAtBeat(originalBoundary, layout.barLengthBeats) &&
      compareRational(pairEnd, measureEnd) <= 0;
    const sameMeasureChordPair = left.kind === "chord" && right.kind === "chord" && sameMeasurePair;
    const identicalChordPair =
      sameMeasureChordPair && left.kind === "chord" && right.kind === "chord"
        ? sameSystemChordIdentity(left, right)
        : false;
    const transferMinimumDuration =
      compareRational(snapQuantum, minimumDuration) > 0 ? snapQuantum : minimumDuration;
    let minimumBoundary = addRational(
      pairStart,
      left.kind === "chord" ? minimumDuration : rational(0),
    );
    let maximumBoundary = subtractRational(
      pairEnd,
      right.kind === "chord" ? minimumDuration : rational(0),
    );
    const leftRestExtensionStart =
      compareRational(pairStart, boundaryMeasureStart) > 0 ? pairStart : boundaryMeasureStart;
    const rightRestExtensionEnd =
      compareRational(pairEnd, boundaryMeasureEnd) < 0 ? pairEnd : boundaryMeasureEnd;
    const leftRestCanExtend =
      left.kind === "rest" && compareRational(originalBoundary, leftRestExtensionStart) > 0;
    const rightRestCanExtend =
      right.kind === "rest" && compareRational(rightRestExtensionEnd, originalBoundary) > 0;
    const canExtendLeft =
      leftRestCanExtend ||
      (sameMeasureChordPair && (resizeMode === "boundary" || identicalChordPair));
    const canExtendRight =
      rightRestCanExtend ||
      (sameMeasureChordPair && (resizeMode === "boundary" || identicalChordPair));
    if (edge === "left") {
      minimumBoundary = canExtendLeft
        ? left.kind === "rest"
          ? leftRestExtensionStart
          : sameMeasureChordPair
            ? pairStart
            : addRational(pairStart, transferMinimumDuration)
        : originalBoundary;
      maximumBoundary = subtractRational(pairEnd, minimumDuration);
    } else if (sameMeasureChordPair && left.kind === "chord" && right.kind === "chord") {
      maximumBoundary =
        canExtendRight && selectedStepId === left.id && edge === "right"
          ? sameMeasureChordPair
            ? pairEnd
            : subtractRational(pairEnd, transferMinimumDuration)
          : originalBoundary;
    } else if (right.kind === "rest") {
      maximumBoundary = canExtendRight ? rightRestExtensionEnd : originalBoundary;
    } else if (left.kind === "chord" && right.kind === "chord") {
      maximumBoundary = originalBoundary;
    }
    const candidates = boundarySnapCandidates(minimumBoundary, maximumBoundary, snapQuantum);
    if (!candidates.length)
      throw new RangeError("Both neighboring Steps must fit at least one current Snap unit.");
    return {
      selectedStepId,
      edge,
      resizeMode,
      leftStepId: left.id,
      rightStepId: right.id,
      baseline: project.updatedAt,
      originalBoundary,
      previewBoundary: originalBoundary,
      pairStart,
      pairEnd,
      candidates,
      snapQuantum,
      draggedEdge: edge,
    };
  };

  const pianoRollBeatAtPointer = (
    clientX: number,
    clientY: number,
    fallbackMeasure: (typeof layout.measures)[number],
  ): Rational => {
    const targetMeasureElement =
      document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(".piano-roll-measure") ??
      trackRef.current?.querySelector<HTMLElement>(
        `.piano-roll-measure[data-measure-index="${fallbackMeasure.measureIndex}"]`,
      );
    const measureIndex = Number(targetMeasureElement?.dataset.measureIndex);
    const targetMeasure = Number.isInteger(measureIndex)
      ? (layout.measures[measureIndex] ?? fallbackMeasure)
      : fallbackMeasure;
    const grid = targetMeasureElement?.querySelector<HTMLElement>(".piano-roll-grid");
    const rect = (grid ?? targetMeasureElement)?.getBoundingClientRect();
    if (!rect || rect.width <= 0)
      throw new RangeError("Piano Roll boundary geometry is unavailable.");
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const offset = rational(
      Math.round(fraction * rationalToNumber(layout.barLengthBeats) * 96),
      96,
    );
    return addRational(targetMeasure.startBeats, offset);
  };

  const previewPianoRollBoundaryPointer = (
    draft: PianoRollBoundaryResizeDraft,
    target: HTMLButtonElement,
    fallbackMeasure: (typeof layout.measures)[number],
    clientX: number,
    clientY: number,
  ): Rational => {
    if (!draft.grabOffset) throw new RangeError("Boundary pointer offset is unavailable.");
    const pointerMeasure = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>(".piano-roll-measure");
    const sourceMeasure = target.closest<HTMLElement>(".piano-roll-measure");
    const sourceScroller = draft.scrollContainer;
    if (!pointerMeasure && sourceMeasure && sourceScroller) {
      const rect = sourceMeasure.getBoundingClientRect();
      if (clientX < rect.left + 10) sourceScroller.scrollLeft -= 14;
      if (clientX > rect.right - 10) sourceScroller.scrollLeft += 14;
    }
    const studioScroller = target.closest<HTMLElement>(".studio-grid");
    const studioBounds = studioScroller?.getBoundingClientRect();
    if (studioScroller && studioBounds) {
      if (clientY < studioBounds.top + 28) {
        studioScroller.scrollBy({ top: -16, behavior: "instant" });
        return draft.previewBoundary;
      }
      if (clientY > studioBounds.bottom - 28) {
        studioScroller.scrollBy({ top: 16, behavior: "instant" });
        return draft.previewBoundary;
      }
    } else {
      if (clientY < 28) {
        window.scrollBy({ top: -16, behavior: "instant" });
        return draft.previewBoundary;
      }
      if (clientY > window.innerHeight - 28) {
        window.scrollBy({ top: 16, behavior: "instant" });
        return draft.previewBoundary;
      }
    }
    const pointerBeat = pianoRollBeatAtPointer(clientX, clientY, fallbackMeasure);
    const raw = addRational(pointerBeat, draft.grabOffset);
    return nearestBoundarySnap(raw, draft.candidates);
  };

  const commitPianoRollBoundaryResize = (draft: PianoRollBoundaryResizeDraft): void => {
    if (draft.baseline !== project.updatedAt) {
      cancelPianoRollBoundaryResize();
      return;
    }
    setPianoRollBoundaryDraftValue(null);
    onDurationResizeStatusChange(null);
    if (compareRational(draft.previewBoundary, draft.originalBoundary) !== 0) {
      try {
        onTransferPianoRollBoundary?.(
          draft.leftStepId,
          draft.previewBoundary,
          draft.snapQuantum,
          draft.selectedStepId,
          draft.draggedEdge,
          draft.resizeMode,
        );
      } catch (error) {
        onDurationResizeStatusChange(
          error instanceof Error ? error.message : "Boundary transfer could not be applied.",
        );
      }
    }
    restorePianoRollBoundaryFocus(draft);
  };

  const beginPianoRollBoundaryPointer = (
    event: PointerEvent<HTMLButtonElement>,
    fragment: ProgressionMeasureFragment,
    edge: "left" | "right",
    measure: (typeof layout.measures)[number],
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const snapshot = createPianoRollBoundarySnapshot(
        fragment.stepId,
        edge,
        event.altKey ? "isolated" : "boundary",
      );
      const pointerBeat = pianoRollBeatAtPointer(event.clientX, event.clientY, measure);
      const handle = event.currentTarget;
      handle.focus();
      handle.setPointerCapture(event.pointerId);
      setPianoRollBoundaryDraftValue({
        ...snapshot,
        pointerId: event.pointerId,
        grabOffset: subtractRational(snapshot.originalBoundary, pointerBeat),
        pointerClientX: event.clientX,
        ...(handle.closest<HTMLElement>(".score-system-scroll")
          ? { scrollContainer: handle.closest<HTMLElement>(".score-system-scroll")! }
          : {}),
      });
    } catch (error) {
      onDurationResizeStatusChange(
        error instanceof Error ? error.message : "Boundary resize could not start.",
      );
    }
  };

  const updatePianoRollBoundaryPointer = (
    event: PointerEvent<HTMLButtonElement>,
    measure: (typeof layout.measures)[number],
  ): void => {
    const current = pianoRollBoundaryResizeDraftRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (current.baseline !== project.updatedAt) {
      cancelPianoRollBoundaryResize();
      return;
    }
    try {
      setPianoRollBoundaryDraftValue({
        ...current,
        pointerClientX: event.clientX,
        previewBoundary: previewPianoRollBoundaryPointer(
          current,
          event.currentTarget,
          measure,
          event.clientX,
          event.clientY,
        ),
      });
    } catch {
      cancelPianoRollBoundaryResize();
    }
  };

  const finishPianoRollBoundaryPointer = (
    event: PointerEvent<HTMLButtonElement>,
    measure: (typeof layout.measures)[number],
  ): void => {
    const current = pianoRollBoundaryResizeDraftRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const completed = {
        ...current,
        previewBoundary: previewPianoRollBoundaryPointer(
          current,
          event.currentTarget,
          measure,
          event.clientX,
          event.clientY,
        ),
      };
      pianoRollBoundaryResizeDraftRef.current = null;
      setPianoRollBoundaryResizeDraft(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (compareRational(completed.previewBoundary, completed.originalBoundary) === 0) {
        onDurationResizeStatusChange(null);
        restorePianoRollBoundaryFocus(completed);
      } else commitPianoRollBoundaryResize(completed);
    } catch {
      cancelPianoRollBoundaryResize();
    }
  };

  const handlePianoRollBoundaryKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    fragment: ProgressionMeasureFragment,
    edge: "left" | "right",
  ): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelPianoRollBoundaryResize();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const current = pianoRollBoundaryResizeDraftRef.current;
      if (current?.selectedStepId === fragment.stepId && current.edge === edge)
        commitPianoRollBoundaryResize(current);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const current = pianoRollBoundaryResizeDraftRef.current;
      const resizeMode =
        current?.selectedStepId === fragment.stepId && current.edge === edge
          ? current.resizeMode
          : event.altKey
            ? "isolated"
            : "boundary";
      const snapshot =
        current?.selectedStepId === fragment.stepId && current.edge === edge
          ? current
          : createPianoRollBoundarySnapshot(fragment.stepId, edge, resizeMode);
      const next =
        event.key === "ArrowRight"
          ? snapshot.candidates.find(
              (candidate) => compareRational(candidate, snapshot.previewBoundary) > 0,
            )
          : [...snapshot.candidates]
              .reverse()
              .find((candidate) => compareRational(candidate, snapshot.previewBoundary) < 0);
      if (next) setPianoRollBoundaryDraftValue({ ...snapshot, previewBoundary: next });
    } catch (error) {
      onDurationResizeStatusChange(
        error instanceof Error ? error.message : "Boundary has no available Snap positions.",
      );
    }
  };

  const renderPianoRollBoundaryResizeHandle = (
    fragment: ProgressionMeasureFragment,
    edge: "left" | "right",
    measure: (typeof layout.measures)[number],
  ) => {
    const current =
      pianoRollBoundaryResizeDraft?.selectedStepId === fragment.stepId &&
      pianoRollBoundaryResizeDraft.edge === edge
        ? pianoRollBoundaryResizeDraft
        : null;
    let snapshot: PianoRollBoundaryResizeDraft;
    try {
      snapshot = createPianoRollBoundarySnapshot(
        fragment.stepId,
        edge,
        current?.resizeMode ?? "boundary",
      );
    } catch {
      return null;
    }
    const value = current?.previewBoundary ?? snapshot.originalBoundary;
    const isLeft = edge === "left";
    return (
      <button
        type="button"
        role="slider"
        className={`piano-roll-chord-boundary-handle ${isLeft ? "is-left" : "is-right"} ${current ? "is-previewing" : ""}`.trim()}
        data-piano-roll-boundary-handle="true"
        data-boundary-step-id={fragment.stepId}
        data-boundary-edge={edge}
        aria-label={`${isLeft ? "Resize left" : "Resize right"} edge of Step ${fragment.stepIndex + 1}; normal resize transfers a same-measure chord boundary, Alt resize leaves a Rest when shrinking`}
        aria-valuemin={rationalToNumber(snapshot.candidates[0]!)}
        aria-valuemax={rationalToNumber(snapshot.candidates.at(-1)!)}
        aria-valuenow={rationalToNumber(value)}
        aria-valuetext={`${value.numerator}/${value.denominator} beats; ${current?.resizeMode === "isolated" ? "Alt isolated" : "shared-boundary"} mode; hold Alt while dragging or press Alt+Arrow to shrink into a Rest`}
        title={`${current ? "Preview" : "Resize"} edge. Drag normally to transfer the shared boundary between same-measure chords. Hold Alt while dragging to shrink only this chord and leave a Rest. Keyboard: Arrow Left/Right resizes; Alt+Arrow shrinks into a Rest; Enter applies; Escape cancels.`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => beginPianoRollBoundaryPointer(event, fragment, edge, measure)}
        onPointerMove={(event) => updatePianoRollBoundaryPointer(event, measure)}
        onPointerUp={(event) => finishPianoRollBoundaryPointer(event, measure)}
        onPointerCancel={() => cancelPianoRollBoundaryResize()}
        onLostPointerCapture={() => {
          if (pianoRollBoundaryResizeDraftRef.current?.pointerId !== undefined)
            cancelPianoRollBoundaryResize();
        }}
        onBlur={() => {
          const active = pianoRollBoundaryResizeDraftRef.current;
          if (active?.selectedStepId === fragment.stepId && active.edge === edge)
            cancelPianoRollBoundaryResize(false);
        }}
        onKeyDown={(event) => handlePianoRollBoundaryKeyDown(event, fragment, edge)}
      />
    );
  };

  useEffect(() => {
    const current = pianoRollBoundaryResizeDraftRef.current;
    if (current && current.baseline !== project.updatedAt) cancelPianoRollBoundaryResize();
  }, [cancelPianoRollBoundaryResize, project]);

  useEffect(() => {
    if (project.presentation.progressionView !== "piano-roll") cancelPianoRollBoundaryResize(false);
  }, [cancelPianoRollBoundaryResize, project.presentation.progressionView]);

  useEffect(() => {
    const handleWindowBlur = () => cancelPianoRollBoundaryResize();
    const handleWindowFocus = () => midiStepInputControllerRef.current?.resumeFocus();
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [cancelPianoRollBoundaryResize]);

  useEffect(() => {
    if (pianoRollBoundaryResizeDraft) {
      const boundary = pianoRollBoundaryResizeDraft.previewBoundary;
      onDurationResizeStatusChange(
        `Preview boundary ${boundary.numerator}/${boundary.denominator} beats; adjacent durations remain at least 1/24 beat.`,
      );
    } else onDurationResizeStatusChange(null);
  }, [onDurationResizeStatusChange, pianoRollBoundaryResizeDraft]);

  const commitDurationResize = (draft: NonNullable<typeof durationResizeDraft>) => {
    if (!isDurationResizeSnapshotCurrent(project, draft.snapshot)) {
      cancelDurationResize();
      return;
    }
    const target = project.progression.steps.find((step) => step.id === draft.stepId);
    if (!target || target.kind === "rest") {
      cancelDurationResize();
      return;
    }
    setDurationResizeDraftValue(null);
    onSetStepDuration(
      draft.stepId,
      durationForResizeEndpoint(draft.snapshot, draft.preview.endpoint),
    );
    restoreDurationResizeFocus(draft.stepId);
  };

  const beginDurationResizePointer = (
    event: PointerEvent<HTMLButtonElement>,
    stepId: string,
    measure: (typeof layout.measures)[number],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    try {
      const snapshot = getDurationResizeSnapshot(stepId);
      const pointerStartEndpointBeats = measureGeometryForPointer(handle, measure, event.clientX);
      const originalEndpoint = addRational(
        snapshot.stepStartBeats,
        snapshot.originalDuration.beats,
      );
      const preview = snapDurationResizeEndpoint(rationalToNumber(originalEndpoint), snapshot);
      handle.focus();
      handle.setPointerCapture(event.pointerId);
      setDurationResizeDraftValue({
        stepId,
        snapshot,
        preview,
        pointerId: event.pointerId,
        pointerStartClientX: event.clientX,
        pointerStartEndpointBeats,
      });
    } catch {
      cancelDurationResize(false);
    }
  };

  const previewDurationResizePointer = (
    draft: NonNullable<typeof durationResizeDraft>,
    target: HTMLButtonElement,
    measure: (typeof layout.measures)[number],
    clientX: number,
  ): DurationResizePreview => {
    if (draft.pointerStartClientX === undefined || draft.pointerStartEndpointBeats === undefined) {
      throw new RangeError("duration resize pointer anchor is unavailable");
    }
    const originalEndpoint = addRational(
      draft.snapshot.stepStartBeats,
      draft.snapshot.originalDuration.beats,
    );
    // The visible handle can sit inside a centered Staff event, far from the
    // musical endpoint. Only its movement, never its absolute x, changes time.
    if (Math.abs(clientX - draft.pointerStartClientX) < 3) {
      return snapDurationResizeEndpoint(rationalToNumber(originalEndpoint), draft.snapshot);
    }
    const pointerBeats = measureGeometryForPointer(target, measure, clientX);
    return snapDurationResizeEndpoint(
      rationalToNumber(originalEndpoint) + pointerBeats - draft.pointerStartEndpointBeats,
      draft.snapshot,
    );
  };

  const updateDurationResizePointer = (
    event: PointerEvent<HTMLButtonElement>,
    measure: (typeof layout.measures)[number],
  ) => {
    const current = durationResizeDraftRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!isDurationResizeSnapshotCurrent(project, current.snapshot)) {
      cancelDurationResize();
      return;
    }
    try {
      setDurationResizeDraftValue({
        ...current,
        preview: previewDurationResizePointer(current, event.currentTarget, measure, event.clientX),
      });
    } catch {
      cancelDurationResize();
    }
  };

  const finishDurationResizePointer = (
    event: PointerEvent<HTMLButtonElement>,
    measure: (typeof layout.measures)[number],
  ) => {
    const current = durationResizeDraftRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const completed = {
        ...current,
        preview: previewDurationResizePointer(current, event.currentTarget, measure, event.clientX),
      };
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (
        compareRational(completed.preview.duration, current.snapshot.originalDuration.beats) === 0
      ) {
        cancelDurationResize();
      } else {
        commitDurationResize(completed);
      }
    } catch {
      cancelDurationResize();
    }
  };

  const handleDurationResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, stepId: string) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelDurationResize();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const current = durationResizeDraftRef.current;
      if (current?.stepId === stepId) commitDurationResize(current);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const current = durationResizeDraftRef.current;
      const snapshot =
        current?.stepId === stepId ? current.snapshot : getDurationResizeSnapshot(stepId);
      const currentEndpoint =
        current?.stepId === stepId
          ? current.preview.endpoint
          : addRational(snapshot.stepStartBeats, snapshot.originalDuration.beats);
      const preview = moveDurationResizeEndpoint(
        snapshot,
        currentEndpoint,
        event.key === "ArrowRight" ? "right" : "left",
      );
      setDurationResizeDraftValue({ stepId, snapshot, preview });
    } catch {
      cancelDurationResize(false);
    }
  };

  const renderDurationResizeHandle = (
    fragment: Pick<ProgressionMeasureFragment, "step" | "stepId" | "stepIndex" | "continuesToNext">,
    measure: (typeof layout.measures)[number],
  ) => {
    if (fragment.step.kind === "rest" || fragment.continuesToNext) return null;
    const current = durationResizeDraft?.stepId === fragment.stepId ? durationResizeDraft : null;
    const snapshot = current?.snapshot ?? getDurationResizeSnapshot(fragment.stepId);
    const duration = current?.preview.duration ?? fragment.step.duration.beats;
    const label = stepLabelForDurationResize(fragment.step, fragment.stepIndex + 1);
    const valueText = `${formatMusicalDuration(musicalDuration(duration))} beats`;
    const statusId = current ? "duration-resize-status" : undefined;
    return (
      <button
        type="button"
        role="slider"
        className={`progression-step-resize-handle ${current ? "is-previewing" : ""}`.trim()}
        data-duration-resize-handle={fragment.stepId}
        data-resize-preview={current ? "true" : undefined}
        aria-label={`Resize duration for ${label}`}
        aria-valuemin={rationalToNumber(
          subtractRational(snapshot.candidates[0]!, snapshot.stepStartBeats),
        )}
        aria-valuemax={rationalToNumber(
          subtractRational(snapshot.editableEnd, snapshot.stepStartBeats),
        )}
        aria-valuenow={rationalToNumber(duration)}
        aria-valuetext={valueText}
        aria-describedby={statusId}
        title={`${current?.preview.announcement ?? `Resize ${label}; current duration ${valueText}`}. Drag left/right to shorten/lengthen; click focuses the handle without changing duration. Arrow Left/Right choose exact endpoints; Enter applies; Escape cancels.`}
        onPointerDown={(event) => beginDurationResizePointer(event, fragment.stepId, measure)}
        onPointerMove={(event) => updateDurationResizePointer(event, measure)}
        onPointerUp={(event) => finishDurationResizePointer(event, measure)}
        onPointerCancel={() => cancelDurationResize()}
        onLostPointerCapture={() => {
          if (durationResizeDraftRef.current?.pointerId !== undefined) cancelDurationResize();
        }}
        onBlur={() => {
          if (durationResizeDraftRef.current?.stepId === fragment.stepId) cancelDurationResize();
        }}
        onKeyDown={(event) => handleDurationResizeKeyDown(event, fragment.stepId)}
      >
        <span aria-hidden="true">↔</span>
      </button>
    );
  };

  const renderDurationResizeHandleForStaffItem = (
    item: MeasureStaffChordItem,
    measure: (typeof layout.measures)[number],
  ) => {
    const step = project.progression.steps.find((candidate) => candidate.id === item.stepId);
    if (!step || step.kind !== "chord") return null;
    return renderDurationResizeHandle(
      {
        step,
        stepId: step.id,
        stepIndex: project.progression.steps.findIndex((candidate) => candidate.id === step.id),
        continuesToNext: item.continuesToNext,
      },
      measure,
    );
  };

  const openMelodyMenu = (stepId: string, anchor: HTMLElement, position?: MelodyMenuPosition) => {
    const step = project.progression.steps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    const rect = anchor.getBoundingClientRect();
    melodyInvokerRef.current = anchor;
    if (
      project.presentation.progressionView !== "piano-roll" &&
      project.progression.selectedStepId !== stepId
    )
      onSelectStep(stepId);
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

  const closeMeasureMenu = useCallback(() => setMeasureMenu(null), []);
  const openMeasureMenu = useCallback(
    (measureIndex: number, invoker: HTMLElement, position: MeasureMenuPosition) => {
      if (!onDeleteMeasure) return;
      setMeasureMenu({ measureIndex, invoker, position });
    },
    [onDeleteMeasure],
  );
  const openMeasureMenuFromEvent = (
    measureIndex: number,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if ("clientX" in event) {
      openMeasureMenu(measureIndex, event.currentTarget, {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    openMeasureMenu(measureIndex, event.currentTarget, { x: rect.left, y: rect.bottom });
  };
  const handleMeasureDeleteFromButton = (measureIndex: number, invoker: HTMLElement) => {
    const refusal = onDeleteMeasure?.(measureIndex);
    if (refusal) {
      const rect = invoker.getBoundingClientRect();
      openMeasureMenu(measureIndex, invoker, { x: rect.left, y: rect.bottom });
      return;
    }
    requestAnimationFrame(() => {
      const find = (index: number) =>
        trackRef.current?.querySelector<HTMLElement>(
          `[data-measure-context-trigger][data-measure-index="${index}"]`,
        ) ?? null;
      (find(measureIndex) ?? find(measureIndex - 1) ?? trackRef.current)?.focus();
    });
  };
  const measureMenuFocusFallback = useCallback(() => {
    const measureIndex = measureMenu?.measureIndex;
    if (measureIndex === undefined || !trackRef.current) return null;
    const nextIndex = Math.min(measureIndex, layout.measures.length - 1);
    const previousIndex = Math.max(0, Math.min(measureIndex - 1, layout.measures.length - 1));
    const find = (index: number) =>
      trackRef.current?.querySelector<HTMLElement>(
        `[data-measure-context-trigger][data-measure-index="${index}"]`,
      ) ?? null;
    return find(nextIndex) ?? find(previousIndex) ?? trackRef.current;
  }, [layout.measures.length, measureMenu?.measureIndex]);

  const openMelodyEditorFromLane = (stepId: string, anchor: HTMLButtonElement) => {
    const step = project.progression.steps.find(
      (candidate) => candidate.id === stepId && candidate.kind === "chord",
    );
    if (!step || !onSetMelodyRecipe) return;
    melodyInvokerRef.current = anchor;
    if (project.progression.selectedStepId !== stepId) onSelectStep(stepId);
    setMelodyEditorStepId(stepId);
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
      const chord = realizeProgressionStepChord(item.step, project.tonic);
      const effectiveChord = withEffectiveBass(
        {
          ...chord,
        },
        realization.bassPitch,
      );
      const label = formatProgressionChordLabel(
        labelMode,
        item.step.harmonicFunction.functionId,
        formatChordSymbol(effectiveChord),
      );
      const transpositionSemitones = stepTranspositionSemitones(item.step);
      const transpositionLabel =
        transpositionSemitones === 0
          ? ""
          : ` · local transposition ${transpositionSemitones > 0 ? "+" : ""}${transpositionSemitones} semitones`;
      const isInvertedBass =
        realization.bassPitch !== undefined &&
        realization.bassPitch.pitchClassIdentity !== chord.rootPitchClass;
      return {
        key: `${item.step.id}-${item.fragmentIndex}`,
        kind: "chord",
        stepId: item.step.id,
        label: `${label}${transpositionLabel}`,
        pitches: realization.pitches,
        ...((project.presentation.showBassInStaff ||
          project.presentation.progressionView === "tablature" ||
          isInvertedBass) &&
        realization.bassPitch
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
    if (isAppShortcutProtectedTarget(event.target) || event.key !== "Escape") return;
    if (project.presentation.progressionView === "piano-roll") return;
    if (!selectedStepId || !onClearSelection) return;
    event.preventDefault();
    event.stopPropagation();
    onClearSelection();
    restoreSelectedStepFocus(selectedStepId);
  };
  const handleBackgroundClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const clickedInteractive = target.closest(
      ".progression-step-card, .progression-rest-card, .progression-step-continuation, .progression-measure-header, .progression-measure-gap, .progression-view-control, .progression-gap-hint, .piano-roll-grid, .piano-roll-measure-header, .score-system-header, button, select, input, textarea, label",
    );
    if (clickedInteractive) return;
    if (project.presentation.progressionView === "piano-roll") {
      setPianoRollSelectionScope({ kind: "progression" });
      return;
    }
    if (event.currentTarget.classList.contains("progression-step-cards")) {
      event.stopPropagation();
    }
    onClearSelection?.();
  };

  const focusMatrixForGap = (measureNumber: number) => {
    onFocusMatrix?.(measureNumber);
    setMatrixGapHint(measureNumber);
  };

  const renderSongSectionBoundaries = (sections: readonly SongSection[]) =>
    sections.length ? (
      <div className="song-section-boundaries" aria-label="Song section boundary">
        {sections.map((section) => (
          <span
            className="song-section-boundary"
            key={section.id}
            data-testid="song-section-boundary"
            title={section.name}
          >
            {section.name}
          </span>
        ))}
      </div>
    ) : null;

  const renderRest = (
    fragment: ProgressionMeasureFragment,
    boundarySections: readonly SongSection[] = [],
  ) => {
    const step = fragment.step;
    const index = fragment.stepIndex;
    const isPlaying = currentPlayingStepIndex === index;
    const isInLoop = Boolean(loopIndices && index >= loopIndices.start && index <= loopIndices.end);
    const isSelected = rangeStepIdSet.has(step.id) || selectedStepId === step.id;
    return (
      <div
        className={`progression-drag-item measure-step-segment ${dropTargetIndex === index ? "is-drop-target" : ""}`}
        style={segmentStyle(fragment.durationBeats, layout.barLengthBeats)}
        draggable
        data-progression-step-drag
        data-step-id={step.id}
        data-start-beats={exactRational(fragment.startBeats)}
        data-duration-beats={exactRational(fragment.durationBeats)}
        data-dragging={draggingStepId === step.id ? "true" : undefined}
        onDragStart={(event) => dragStart(event, step.id)}
        onDragOver={(event) => dragOver(event, index)}
        onDrop={(event) => drop(event, index)}
        onDragEnd={clearDragState}
      >
        {renderSongSectionBoundaries(boundarySections)}
        <div
          className={`progression-rest-card ${isPlaying ? "is-playing" : ""} ${isInLoop ? "is-in-loop" : ""} ${isSelected ? "is-selected" : ""}`}
          data-testid="progression-step"
          data-playing={isPlaying ? "true" : undefined}
          data-in-loop={isInLoop ? "true" : undefined}
          onClick={() => onSelectStep(step.id)}
          onContextMenu={(event) => openMelodyMenuFromEvent(step.id, event)}
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
            onRemove={() => removeStepAndRestoreFocus(step.id)}
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
            onContextMenu={(event) => openMelodyMenuFromEvent(step.id, event)}
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
    measure: (typeof layout.measures)[number],
    compactStaff: boolean,
    boundarySections: readonly SongSection[] = [],
  ) => {
    const measureNumber = measure.number;
    if (!fragment.startsHere) {
      const isChordFragment = fragment.step.kind === "chord";
      return (
        <div
          key={`${fragment.stepId}-continuation-${fragment.fragmentIndex}`}
          className={`progression-step-continuation measure-step-segment ${!fragment.continuesToNext && isChordFragment ? "has-duration-resize-handle" : ""}`.trim()}
          style={segmentStyle(fragment.durationBeats, layout.barLengthBeats)}
          data-testid="progression-step-continuation"
          data-step-id={fragment.stepId}
          data-start-beats={exactRational(fragment.startBeats)}
          data-duration-beats={exactRational(fragment.durationBeats)}
          onClick={() => updateRangeSelection(fragment.stepId, false)}
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
              updateRangeSelection(fragment.stepId, event.shiftKey);
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
          {renderDurationResizeHandle(fragment, measure)}
        </div>
      );
    }
    if (fragment.step.kind === "rest") return renderRest(fragment, boundarySections);
    const step = fragment.step;
    const index = fragment.stepIndex;
    const isPlaying = currentPlayingStepIndex === index;
    const isInLoop = Boolean(loopIndices && index >= loopIndices.start && index <= loopIndices.end);
    const isSelected = rangeStepIdSet.has(step.id) || selectedStepId === step.id;
    return (
      <div
        key={step.id}
        className={`progression-drag-item measure-step-segment ${dropTargetIndex === index ? "is-drop-target" : ""} ${!fragment.continuesToNext ? "has-duration-resize-handle" : ""}`.trim()}
        style={segmentStyle(fragment.durationBeats, layout.barLengthBeats)}
        draggable
        data-progression-step-drag
        data-step-id={step.id}
        data-start-beats={exactRational(fragment.startBeats)}
        data-duration-beats={exactRational(fragment.durationBeats)}
        data-dragging={draggingStepId === step.id ? "true" : undefined}
        onDragStart={(event) => dragStart(event, step.id)}
        onDragOver={(event) => dragOver(event, index)}
        onDrop={(event) => drop(event, index)}
        onDragEnd={clearDragState}
      >
        {renderSongSectionBoundaries(boundarySections)}
        <ProgressionStepCard
          step={step}
          stepNumber={index + 1}
          tonic={project.tonic}
          view={project.presentation.progressionView}
          labelMode={labelMode}
          compactStaff={compactStaff}
          selected={isSelected}
          playing={isPlaying}
          inLoop={isInLoop}
          showBassInStaff={project.presentation.showBassInStaff}
          noteColorMode={project.presentation.noteColorMode}
          activeModule={project.activeModule}
          nextStep={project.progression.steps
            .slice(index + 1)
            .find((candidate): candidate is ChordStep => candidate.kind === "chord")}
          guitarChordOrientation={project.presentation.guitarChordOrientation ?? "vertical"}
          guitarChordColorMode={project.presentation.guitarChordColorMode ?? "chord-roles"}
          onSelect={() => onSelectStep(step.id)}
          onPerformanceChange={(performance) => onEditPerformance(step.id, performance)}
          onRemove={() => removeStepAndRestoreFocus(step.id)}
          {...(onSetMelodyRecipe
            ? {
                onOpenMelodyMenu: (anchor: HTMLElement, position?: MelodyMenuPosition) =>
                  openMelodyMenu(step.id, anchor, position),
              }
            : {})}
        />
        {renderDurationResizeHandle(fragment, measure)}
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

  const renderMeasureContent = (
    measure: (typeof layout.measures)[number],
    systemIndex?: number,
  ) => {
    if (project.presentation.progressionView === "piano-roll") {
      return (
        <PianoRollMeasure
          key={measure.measureIndex}
          project={project}
          layout={layout}
          measure={measure}
          {...(systemIndex !== undefined ? { systemIndex } : {})}
          selectedChordStepIds={pianoRollChordStepIdSet}
          onSelectMeasureNotes={() => selectPianoRollNotesInMeasures([measure.measureIndex])}
          selectionScopeLabel={pianoRollSelectionScopeLabel}
          renderBoundaryResizeHandle={renderPianoRollBoundaryResizeHandle}
          boundaryResizePreview={pianoRollBoundaryResizeDraft?.previewBoundary ?? null}
          onHarmonySelected={(stepId, displaySystemIndex, additive) => {
            updateRangeSelection(stepId, additive, false, false);
            const anchorStepId =
              additive && pianoRollChordSelection ? pianoRollChordSelection.anchorStepId : stepId;
            const anchorIndex = orderedStepIds.indexOf(anchorStepId);
            const stepIndex = orderedStepIds.indexOf(stepId);
            const low = Math.min(anchorIndex, stepIndex);
            const high = Math.max(anchorIndex, stepIndex);
            const stepIds =
              anchorIndex >= 0 && stepIndex >= 0 ? orderedStepIds.slice(low, high + 1) : [stepId];
            setPianoRollEmptyCursor(null);
            setActivePianoRollSystemIndex(null);
            setSelectedPianoNoteIdentities(new Set());
            onSelectedPianoNoteChange?.(null);
            onSelectedPianoChordChange?.(null);
            setPianoRollChordSelection({
              stepIds,
              anchorStepId,
              activeStepId: stepId,
              systemIndex: displaySystemIndex ?? systemIndex ?? 0,
            });
            onSelectedPianoChordChange?.(stepId);
          }}
          colorMode={pianoRollColorMode}
          guidesEnabled={pianoRollGuidesEnabled}
          inspectorRequest={pianoRollInspectorRequest}
          emptyCursor={pianoRollEmptyCursor}
          midiCursor={midiInsertionCursor}
          onEmptyCellCursor={(cursor) => {
            setPianoRollEmptyCursor(cursor);
            updateMidiInsertionCursor(cursor.startBeats);
            setPianoRollChordSelection(null);
            setSelectedPianoNoteIdentities(new Set());
            onSelectedPianoNoteChange?.(null);
            onSelectedPianoChordChange?.(null);
          }}
          {...(onAuditionPianoRollMeasure ? { onAuditionMeasure: onAuditionPianoRollMeasure } : {})}
          onOpenMeasureMenu={(measureIndex, invoker, position) =>
            openMeasureMenu(measureIndex, invoker, position)
          }
          onDeleteMeasureFromButton={handleMeasureDeleteFromButton}
          {...(onAuditionPianoRollChord ? { onAuditionChord: onAuditionPianoRollChord } : {})}
          {...(onSetMelodyRecipe
            ? {
                onOpenMelodyMenu: (
                  stepId: string,
                  anchor: HTMLElement,
                  position: MelodyMenuPosition,
                ) => openMelodyMenu(stepId, anchor, position),
              }
            : {})}
          {...(onAuditionPianoRollNote ? { onAuditionNote: onAuditionPianoRollNote } : {})}
          {...(pianoRollAuditionPlayhead ? { auditionPlayhead: pianoRollAuditionPlayhead } : {})}
          {...(onPianoRollAuditionFinished
            ? { onAuditionFinished: onPianoRollAuditionFinished }
            : {})}
          {...(selectedStepId ? { selectedStepId } : {})}
          selectedNoteKey={
            selectedPianoNote
              ? JSON.stringify([selectedPianoNote.stepId, selectedPianoNote.eventKey])
              : undefined
          }
          selectedNoteIdentities={selectedPianoNoteIdentities}
          onNoteSelectionChange={(stepId, eventKey, additive) => {
            const identity = pianoRollNoteIdentity(stepId, eventKey);
            setSelectedPianoNoteIdentities((previous) =>
              additive ? new Set([...previous, identity]) : new Set([identity]),
            );
          }}
          onReplaceNoteSelection={(identities) =>
            setSelectedPianoNoteIdentities(
              new Set(
                identities.map((identity) =>
                  pianoRollNoteIdentity(identity.sourceStepId, identity.eventKey),
                ),
              ),
            )
          }
          onActiveMeasureChange={handlePianoRollActiveMeasureChange}
          onClearNoteSelection={() => {
            setSelectedPianoNoteIdentities(new Set());
            onSelectedPianoNoteChange?.(null);
            onSelectedPianoChordChange?.(null);
          }}
          playingStepId={
            currentPlayingStepIndex == null
              ? null
              : (project.progression.steps[currentPlayingStepIndex]?.id ?? null)
          }
          activeEventStartedAt={activeEventStartedAt}
          transportPlaying={transportPlaying}
          labelMode={labelMode}
          onSelectStep={onSelectStep}
          onNoteSelect={(stepId, eventKey, systemIndex) => {
            setPianoRollEmptyCursor(null);
            const button = Array.from(
              trackRef.current?.querySelectorAll<HTMLButtonElement>("button.piano-roll-note") ?? [],
            ).find(
              (candidate) =>
                candidate.dataset.sourceStepId === stepId &&
                candidate.dataset.pianoRollEventKey === eventKey,
            );
            const measureElement = button?.closest<HTMLElement>(".piano-roll-measure");
            const measureIndex = Number(measureElement?.dataset.measureIndex);
            const ownerSystemIndex = Number(measureElement?.dataset.systemIndex);
            if (Number.isInteger(measureIndex)) {
              setPianoRollSelectionScope({ kind: "measure", measureIndex });
            }
            setActivePianoRollSystemIndex(
              Number.isInteger(ownerSystemIndex) ? ownerSystemIndex : (systemIndex ?? null),
            );
            setPianoRollChordSelection(null);
            onSelectedPianoChordChange?.(null);
            onSelectedPianoNoteChange?.({ stepId, eventKey });
          }}
          zoom={pianoRollZoom}
          gridMode={pianoRollGridMode}
          pitchRange={pianoRollPitchRange}
          pitchExpansion={pianoRollPitchExpansion}
          onPitchExpansionChange={(expansion) =>
            setPianoRollPitchExpansion((current) => (current === expansion ? current : expansion))
          }
          snap={pianoRollSnap}
          {...(onSetMelodyRecipe
            ? {
                onSetMelodyRecipe: (stepId: string, recipe: ChordMelodyRecipe) =>
                  onSetMelodyRecipe(stepId, recipe),
              }
            : {})}
          {...(onApplyPianoRollMelodyEdits
            ? { onApplyMelodyEdits: onApplyPianoRollMelodyEdits }
            : {})}
        />
      );
    }
    const isSelectedMeasure = measure.items.some(
      (item) =>
        item.kind !== "gap" && (rangeStepIdSet.has(item.stepId) || item.stepId === selectedStepId),
    );
    const deletion = onDeleteMeasure ? planMeasureDeletion(project, measure.measureIndex) : null;
    const deleteDisabledReason = deletion && "reason" in deletion ? deletion.reason : null;
    return (
      <section
        key={measure.measureIndex}
        className={`score-system-measure progression-measure-card ${isSelectedMeasure ? "has-selected-step" : ""}`}
        data-testid="progression-measure"
        data-measure-index={measure.measureIndex}
        data-has-selected-step={isSelectedMeasure ? "true" : undefined}
        aria-label={`Measure ${measure.number}, ${project.globalTiming.meter.numerator}/${project.globalTiming.meter.denominator}`}
        style={{
          flex: `${rationalToNumber(measure.capacityBeats)} 1 0%`,
          minWidth: 0,
        }}
      >
        <header
          className="score-system-measure-header progression-measure-header"
          tabIndex={0}
          aria-haspopup="menu"
          onContextMenu={(event) => openMeasureMenuFromEvent(measure.measureIndex, event)}
          onKeyDown={(event) => {
            if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
              openMeasureMenuFromEvent(measure.measureIndex, event);
          }}
        >
          <strong>Measure {measure.number}</strong>
          <span>
            {project.globalTiming.meter.numerator}/{project.globalTiming.meter.denominator}
          </span>
          <span aria-label={`Grouping ${project.globalTiming.meter.grouping.join(" plus ")}`}>
            {project.globalTiming.meter.grouping.join("+")}
          </span>
          {project.presentation.progressionView !== "staff" &&
          project.presentation.progressionView !== "tablature" ? (
            <>
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
                  openMeasureMenu(measure.measureIndex, event.currentTarget, {
                    x: rect.left,
                    y: rect.bottom,
                  });
                }}
              >
                ⋯
              </button>
              {onDeleteMeasure ? (
                <button
                  type="button"
                  className="measure-close-trigger"
                  data-measure-close-trigger
                  data-measure-index={measure.measureIndex}
                  aria-label={`Delete Measure ${measure.number}`}
                  title={deleteDisabledReason ?? `Delete Measure ${measure.number}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleMeasureDeleteFromButton(measure.measureIndex, event.currentTarget);
                  }}
                >
                  <Icon name="close" />
                </button>
              ) : null}
            </>
          ) : null}
        </header>
        <div
          className="progression-measure-timeline-scroll"
          data-testid="progression-measure-timeline"
        >
          <div className="progression-measure-timeline-content">
            {melodyTimeline &&
            project.presentation.progressionView !== "staff" &&
            project.presentation.progressionView !== "tablature" ? (
              <InlineMelodyLane
                project={project}
                timeline={melodyTimeline}
                measure={measure}
                {...(selectedStepId ? { selectedStepId } : {})}
                {...(activeMelodyEventKey !== undefined ? { activeMelodyEventKey } : {})}
                onSelectStep={onSelectStep}
                {...(onSetMelodyRecipe ? { onOpenMelodyEditor: openMelodyEditorFromLane } : {})}
              />
            ) : null}
            <div
              className="score-system-measure-grid progression-measure-grid"
              data-testid="progression-measure-grid"
            >
              {measure.items.map((item: ProgressionMeasureItem, itemIndex) => {
                const boundarySections =
                  item.kind !== "gap" && item.fragmentIndex === 0
                    ? orderSongSections(project.progression).filter(
                        (section) => section.startStepId === item.stepId,
                      )
                    : [];
                return (
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
                      : renderFragment(item, measure, false, boundarySections)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, select, input, textarea, a")) {
      return;
    }
    e.preventDefault();
    onOpenProgressionMenu?.(e.currentTarget, { x: e.clientX, y: e.clientY });
  };

  return (
    <div
      ref={trackRef}
      className="progression-track"
      data-audition-end-beat={pianoRollAuditionPlayhead?.endBeat}
      onClickCapture={handleSelectionClickCapture}
      onKeyDownCapture={(event) => {
        handlePianoRollKeyDownCapture(event);
        if (!event.defaultPrevented) handleRangeKeyDownCapture(event);
      }}
      onPointerDown={handleMarqueePointerDown}
      onPointerMove={handleMarqueePointerMove}
      onPointerUp={finishMarquee}
      onPointerCancel={() => setMarquee(null)}
      onClick={handleBackgroundClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      <MidiSettingsPortal snapshot={midiStepInputSnapshot}>
        <PianoRollMidiStepInput
          snapshot={midiStepInputSnapshot}
          cursor={midiInsertionCursor}
          cursorEnd={layout.authoredDurationBeats}
          cursorMeasure={cursorMeasureIndex + 1}
          cursorBeat={cursorBeat}
          durationId={midiStepDurationId}
          manualPitch={manualMidiPitch}
          active={project.presentation.progressionView === "piano-roll"}
          transportStatus={transportStatus}
          auditionEnabled={midiAuditionEnabled}
          insertStatus={midiStepInsertStatus}
          onConnect={() => {
            setMidiStepInsertStatus(null);
            const targetNavigator =
              typeof navigator === "undefined" ? {} : (navigator as unknown as MidiNavigatorLike);
            void midiStepInputControllerRef.current?.connect(targetNavigator);
          }}
          onDisconnect={() => {
            midiStepInputControllerRef.current?.disconnect();
            setMidiStepInsertStatus(null);
            onStopPianoRollMidiAudition?.();
          }}
          onDeviceSelect={(deviceId) => {
            midiStepInputControllerRef.current?.selectDevice(deviceId);
            setMidiStepInsertStatus(null);
            onStopPianoRollMidiAudition?.();
          }}
          onArm={() => {
            const armed = midiStepInputControllerRef.current?.arm() ?? false;
            setMidiStepInsertStatus(
              armed ? null : "Connect and select a MIDI input before arming step input.",
            );
          }}
          onDisarm={() => {
            midiStepInputControllerRef.current?.disarm();
            onStopPianoRollMidiAudition?.();
          }}
          onDurationChange={changeMidiStepDuration}
          onManualPitchChange={changeManualMidiPitch}
          onManualInsert={attemptMidiStepInsert}
          onCursorChange={(cursor) => {
            updateMidiInsertionCursor(cursor);
            setMidiStepInsertStatus(null);
          }}
          onAuditionChange={changeMidiAuditionEnabled}
        />
      </MidiSettingsPortal>
      {rangeStepIds.length > 0 ? (
        <RangeSelectionToolbar
          selectedCount={rangeStepIds.length}
          loopActive={isLoopRangeActive?.(rangeStepIds) ?? false}
          onPlay={() => onPlayRange?.(rangeStepIds)}
          onToggleLoop={() => onToggleLoopRange?.(rangeStepIds)}
          onCopy={() => onCopyRange?.(rangeStepIds)}
          onDuplicate={() => {
            onDuplicateRange?.(rangeStepIds);
            setRangeSelection(EMPTY_RANGE_SELECTION);
          }}
          onDelete={() => {
            onDeleteRange?.(rangeStepIds);
            setRangeSelection(EMPTY_RANGE_SELECTION);
          }}
          onResetPerformance={() => onResetPerformanceRange?.(rangeStepIds)}
          previewTransposition={(semitones) =>
            previewRangeTransposition(project, rangeStepIds, semitones)
          }
          onApplyTransposition={(semitones) => {
            if (!onTransposeRange) return "Range transposition is unavailable.";
            onTransposeRange(rangeStepIds, semitones);
            return undefined;
          }}
          onExplore={() => onExploreRange?.(rangeStepIds)}
        />
      ) : null}
      {marquee && marqueeRect ? (
        <div
          className="progression-range-marquee"
          data-testid="progression-range-marquee"
          aria-hidden="true"
          style={{
            left: `${marqueeRect.left - marquee.trackLeft}px`,
            top: `${marqueeRect.top - marquee.trackTop}px`,
            width: `${marqueeRect.right - marqueeRect.left}px`,
            height: `${marqueeRect.bottom - marqueeRect.top}px`,
          }}
        />
      ) : null}
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
            role="region"
            {...(isGuidanceDismissed
              ? { "aria-label": "Empty progression" }
              : { "aria-labelledby": "guided-start-title" })}
            data-testid="progression-empty-state"
          >
            {isGuidanceDismissed ? (
              <span data-testid="progression-empty-dismissed">
                Blank project ready. Choose a chord in the Matrix when you are ready.
              </span>
            ) : (
              <GuidedStart
                activeModule={project.activeModule}
                genreFocus={project.presentation.genreFocus}
                {...(onApplyPreset ? { onApplyPreset } : {})}
                {...(onOpenPresets ? { onOpenPresets } : {})}
                {...(onFocusMatrix ? { onFocusMatrix } : {})}
                {...(onFocusMatrixKey ? { onFocusMatrixKey } : {})}
                onDismiss={() =>
                  setDismissedGuidanceProjectIds((current) => new Set([...current, project.id]))
                }
              />
            )}
          </div>
        ) : null}
        {project.progression.steps.length > 0 ? (
          project.presentation.progressionView === "piano-roll" ? (
            <>
              <PianoRollToolbar
                gridMode={pianoRollGridMode}
                onGridModeChange={setPianoRollGridMode}
                zoom={pianoRollZoom}
                onZoomChange={setPianoRollZoom}
                snap={pianoRollSnap}
                onSnapChange={setPianoRollSnap}
                pitchRange={pianoRollPitchRange}
                onPitchRangeChange={setPianoRollPitchRange}
                colorMode={pianoRollColorMode}
                onColorModeChange={setPianoRollColorMode}
                guidesEnabled={pianoRollGuidesEnabled}
                onGuidesEnabledChange={setPianoRollGuidesEnabled}
                selectionScopeLabel={pianoRollSelectionScopeLabel}
              />
            </>
          ) : null
        ) : null}
        {project.progression.steps.length > 0 ? (
          <ScoreSystemView
            project={project}
            layout={layout}
            melodyTimeline={melodyTimeline}
            measuresPerSystem={project.presentation.measuresPerSystem}
            {...(project.presentation.progressionView === "piano-roll"
              ? { pianoRollMeasureMinimumWidthPx: Math.max(150, (250 * pianoRollZoom) / 100) }
              : {})}
            selectedStepId={selectedStepId}
            rangeSelectedStepIds={rangeStepIdSet}
            playingStepId={currentPlayingStepId}
            activeMelodyEventKey={activeMelodyEventKey}
            playbackClockSnapshot={playbackClockSnapshot}
            measureItemsForMeasure={staffItemsForMeasure}
            onSelectStep={onSelectStep}
            onEditPerformance={onEditPerformance}
            onReorder={onReorder}
            renderMeasureContent={renderMeasureContent}
            {...(project.presentation.progressionView === "piano-roll"
              ? {
                  onSelectPianoRollSystemNotes: (system: ScoreSystem) =>
                    selectPianoRollNotesInMeasures(
                      getRenderedPianoRollMeasureIndices(system.index),
                    ),
                }
              : {})}
            {...(project.presentation.progressionView === "piano-roll"
              ? {
                  renderSystemPitchScale: (system: ScoreSystem) => (
                    <PianoRollSystemPitchGutter
                      project={project}
                      gridMode={pianoRollGridMode}
                      pitchRange={pianoRollPitchRange}
                      pitchExpansion={pianoRollPitchExpansion}
                      systemIndex={system.index}
                    />
                  ),
                  renderSystemNotePanel: (system: ScoreSystem) => (
                    <PianoRollSystemNotePanel
                      project={project}
                      system={system}
                      selectedNoteIdentities={selectedPianoNoteIdentities}
                      activeSystemIndex={activePianoRollSystemIndex}
                      activeNoteIdentity={
                        selectedPianoNote
                          ? JSON.stringify([selectedPianoNote.stepId, selectedPianoNote.eventKey])
                          : null
                      }
                      {...(onApplyPianoRollMelodyEdits
                        ? { onApply: onApplyPianoRollMelodyEdits }
                        : {})}
                    />
                  ),
                  renderSystemChordPanel: (system: ScoreSystem) => {
                    if (
                      !pianoRollChordSelection ||
                      pianoRollChordSelection.systemIndex !== system.index
                    )
                      return null;
                    const step = project.progression.steps.find(
                      (candidate) => candidate.id === pianoRollChordSelection.activeStepId,
                    );
                    if (!step) return null;
                    const matrixFunctionId =
                      pianoRollMatrixReplacement?.stepId === step.id
                        ? pianoRollMatrixReplacement.functionId
                        : matrixReplacementFunctionId;
                    return (
                      <PianoRollSystemChordPanel
                        project={project}
                        system={system}
                        step={step}
                        selectedStepIds={pianoRollChordSelection.stepIds}
                        {...(matrixFunctionId ? { matrixFunctionId } : {})}
                        onReplace={(stepId, functionId) =>
                          onReplacePianoRollChord?.(stepId, functionId)
                        }
                        onFocusMatrix={(stepId) => onFocusMatrixChord?.(stepId)}
                        onCancelMatrixChoice={() => onCancelMatrixChordChoice?.()}
                        onSetRest={(stepId) => onSetPianoRollRest?.(stepId)}
                        onSetDuration={(stepId, duration) =>
                          onSetPianoRollStepDuration?.(stepId, duration)
                        }
                        onSplit={(stepId) => onSplitPianoRollStep?.(stepId)}
                        onTie={applyPianoRollChordTie}
                      />
                    );
                  },
                }
              : {})}
            renderDurationResizeHandle={renderDurationResizeHandleForStaffItem}
            onOpenMeasureMenu={(measureIndex, invoker, position) =>
              openMeasureMenu(measureIndex, invoker, position)
            }
            onDeleteMeasureFromButton={handleMeasureDeleteFromButton}
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
            {...(project.presentation.progressionView === "piano-roll" && onAuditionPianoRollSystem
              ? { onAuditionSystem: onAuditionPianoRollSystem }
              : {})}
            {...(project.presentation.progressionView === "piano-roll"
              ? { onSetPianoRollSystemScope: setPianoRollSystemScope }
              : {})}
            {...(project.presentation.progressionView === "piano-roll"
              ? { pianoRollSelectionScopeLabel }
              : {})}
            {...(onToggleLoopSystem ? { onToggleLoopSystem } : {})}
            {...(onToggleMuteSystem ? { onToggleMuteSystem } : {})}
            {...(onToggleSoloSystem ? { onToggleSoloSystem } : {})}
            {...(onMoveSystemUp ? { onMoveSystemUp } : {})}
            {...(onMoveSystemDown ? { onMoveSystemDown } : {})}
            {...(onCopySystem ? { onCopySystem } : {})}
            {...(onPasteSystemAfter ? { onPasteSystemAfter } : {})}
            {...(onInsertEmptySystemAfter ? { onInsertEmptySystemAfter } : {})}
            {...(onInsertRestAfterSystem ? { onInsertRestAfterSystem } : {})}
            {...(onExploreAlternativeFromSystem ? { onExploreAlternativeFromSystem } : {})}
            {...(onOctaveUpSystem ? { onOctaveUpSystem } : {})}
            {...(onOctaveDownSystem ? { onOctaveDownSystem } : {})}
            {...(onResetPerformanceSystem ? { onResetPerformanceSystem } : {})}
            {...(onSetArticulationSystem ? { onSetArticulationSystem } : {})}
            {...(onApplyMelodyContourSystem ? { onApplyMelodyContourSystem } : {})}
            {...(onSetMelodyGridSystem ? { onSetMelodyGridSystem } : {})}
            {...(onClearMelodySystem ? { onClearMelodySystem } : {})}
            {...(onToggleSuzukiColors ? { onToggleSuzukiColors } : {})}
          />
        ) : null}
      </div>
      {measureMenu
        ? (() => {
            const measure = layout.measures[measureMenu.measureIndex];
            if (!measure) return null;
            const deletion = planMeasureDeletion(project, measureMenu.measureIndex);
            const deleteDisabledReason = "reason" in deletion ? deletion.reason : null;
            const insertion = planMeasureInsertion(project, measureMenu.measureIndex);
            const insertDisabledReason = "reason" in insertion ? insertion.reason : null;
            const duplication = onDuplicateMeasure
              ? planMeasureDuplication(project, measureMenu.measureIndex)
              : { reason: "Measure duplication is unavailable." };
            const duplicateDisabledReason = "reason" in duplication ? duplication.reason : null;
            const exactLoopRange = resolveExactMeasureStepRange(
              project.progression.steps,
              project.globalTiming.meter,
              measure.measureIndex,
            );
            const loopDisabledReason =
              onLoopMeasure && !exactLoopRange
                ? "This Measure crosses a Step boundary, so its exact duration cannot be looped."
                : null;
            const canPlayMeasure = project.presentation.progressionView === "piano-roll";
            return (
              <MeasureContextMenu
                measureNumber={measure.number}
                position={measureMenu.position}
                invoker={measureMenu.invoker}
                focusFallback={measureMenuFocusFallback}
                deleteDisabledReason={deleteDisabledReason}
                insertDisabledReason={insertDisabledReason}
                duplicateDisabledReason={duplicateDisabledReason}
                loopDisabledReason={loopDisabledReason}
                onPlay={
                  canPlayMeasure && onAuditionPianoRollMeasure
                    ? () => onAuditionPianoRollMeasure(measure)
                    : undefined
                }
                onLoop={onLoopMeasure ? () => onLoopMeasure(measure.measureIndex) : undefined}
                onInsertAfter={() => onInsertMeasureAfter?.(measure.measureIndex)}
                onDuplicate={() => onDuplicateMeasure?.(measure.measureIndex)}
                onDelete={() => onDeleteMeasure?.(measure.measureIndex)}
                onClose={closeMeasureMenu}
              />
            );
          })()
        : null}
      {melodyMenu
        ? (() => {
            const step = project.progression.steps.find(
              (candidate) => candidate.id === melodyMenu.stepId,
            );
            if (!step) return null;
            const subs =
              step.kind === "chord"
                ? getAvailableSubstitutions(step, project.activeModule, project.tonic)
                : undefined;
            const sourceRecipe =
              step.kind === "chord" && step.melody?.mode === "authored"
                ? step.melody.sourceRecipe
                : undefined;
            return (
              <MelodyContextMenu
                step={step}
                position={melodyMenu.position}
                invoker={melodyMenu.invoker}
                tonic={project.tonic}
                substitutions={subs}
                onApplySubstitution={
                  onApplySubstitution ? (sub) => onApplySubstitution(step.id, sub) : undefined
                }
                onOpenModulation={onOpenModulation ? () => onOpenModulation(step.id) : undefined}
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
                onReturnToGeneration={
                  sourceRecipe
                    ? () => {
                        onSetMelodyRecipe?.(step.id, sourceRecipe);
                        setMelodyMenu(null);
                      }
                    : undefined
                }
                onDuplicate={
                  onDuplicateStep
                    ? () => {
                        onDuplicateStep(step.id);
                        setMelodyMenu(null);
                      }
                    : undefined
                }
                onInsertSelectedBefore={
                  onInsertStepBefore
                    ? activeMatrixFunctionId
                      ? () => {
                          onInsertStepBefore(step.id, activeMatrixFunctionId);
                          setMelodyMenu(null);
                        }
                      : null
                    : undefined
                }
                onInsertSelectedAfter={
                  onInsertStepAfter
                    ? activeMatrixFunctionId
                      ? () => {
                          onInsertStepAfter(step.id, activeMatrixFunctionId);
                          setMelodyMenu(null);
                        }
                      : null
                    : undefined
                }
                selectedMatrixChordName={selectedMatrixChordName}
                onDeleteStep={() => {
                  onRemove(step.id);
                  setMelodyMenu(null);
                }}
                {...(project.presentation.progressionView === "piano-roll" && step.kind === "chord"
                  ? {
                      onSplitStep: () => {
                        onSplitPianoRollStep?.(step.id);
                        setMelodyMenu(null);
                      },
                    }
                  : {})}
                {...(project.presentation.progressionView === "piano-roll" &&
                pianoRollChordSelection?.stepIds.length &&
                pianoRollChordSelection.stepIds.length > 1
                  ? {
                      onTieSteps: () => {
                        applyPianoRollChordTie(pianoRollChordSelection.stepIds);
                        setMelodyMenu(null);
                      },
                      tieDisabledReason: systemTieDisabledReason(
                        project,
                        pianoRollChordSelection.stepIds,
                      ),
                    }
                  : {})}
                onClose={() => {
                  setMelodyMenu(null);
                  const focusId =
                    pianoRollChordSelection?.stepIds.includes(step.id) &&
                    pianoRollChordSelection.stepIds.length > 1
                      ? (pianoRollChordSelection.stepIds[0] ?? step.id)
                      : step.id;
                  restoreSelectedStepFocus(focusId);
                }}
              />
            );
          })()
        : null}
      {melodyEditorStepId && onSetMelodyRecipe
        ? (() => {
            const targetStep = project.progression.steps.find(
              (candidate) => candidate.id === melodyEditorStepId,
            );
            if (!targetStep) return null;
            const isRestTarget = targetStep.kind === "rest";
            const sourceChord = isRestTarget
              ? project.progression.steps.find((candidate) => candidate.kind === "chord")
              : targetStep;
            if (!sourceChord || sourceChord.kind !== "chord") return null;
            const { melody: _discardMelody, ...sourceChordBase } = sourceChord;
            const step =
              targetStep.kind === "chord"
                ? targetStep
                : {
                    ...sourceChordBase,
                    id: targetStep.id,
                    ...(targetStep.authoredMelody
                      ? {
                          melody: {
                            mode: "authored" as const,
                            phrase: targetStep.authoredMelody,
                          },
                        }
                      : {}),
                  };
            return (
              <MelodyEditorDialog
                isOpen
                mode={
                  targetStep.kind === "chord"
                    ? step.melody
                      ? "edit"
                      : "create"
                    : targetStep.authoredMelody
                      ? "edit"
                      : "create"
                }
                step={step}
                project={project}
                {...(isRestTarget
                  ? { authoredOnly: true, authoredTargetLabel: "this Rest step" }
                  : {})}
                restoreFocusRef={melodyInvokerRef}
                onClose={() => setMelodyEditorStepId(null)}
                onApply={(recipe, instrumentOverride) => {
                  if (targetStep.kind === "chord") {
                    onSetMelodyRecipe(step.id, recipe, instrumentOverride);
                  }
                  setMelodyEditorStepId(null);
                }}
                onApplyAuthored={(phrase) => {
                  const sourceRecipe =
                    targetStep.kind === "chord" && step.melody?.mode === "generated"
                      ? step.melody.recipe
                      : targetStep.kind === "chord" && step.melody?.mode === "authored"
                        ? step.melody.sourceRecipe
                        : undefined;
                  onSetAuthoredMelody?.(targetStep.id, phrase, sourceRecipe);
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
function MidiSettingsPortal({
  snapshot,
  children,
}: {
  snapshot: MidiStepInputSnapshot;
  children: import("react").ReactNode;
}) {
  const panel = document.getElementById("midi-settings-content");
  const status = document.getElementById("midi-status-content");
  const device = snapshot.inputs.find((input) => input.id === snapshot.selectedDeviceId)?.name;
  const [lastDevice, setLastDevice] = useState(device);
  useEffect(() => {
    if (device) setLastDevice(device);
  }, [device]);
  const text = `${device ?? lastDevice ?? "MIDI"} - ${snapshot.status} - ${snapshot.focusSuspended ? "temporarily paused (window inactive)" : snapshot.armed ? "Armed" : "Disarmed"}`;
  return (
    <>
      {panel ? createPortal(children, panel) : null}
      {status
        ? createPortal(
            <span role="status" aria-live="polite" title={`${text}. ${snapshot.message}`}>
              {text}
            </span>,
            status,
          )
        : null}
    </>
  );
}
