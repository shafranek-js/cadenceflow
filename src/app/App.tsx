import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppStore } from "./appStore";
import { formatProjectOperationError, ProjectController } from "./projectController";
import {
  addMatrixPreview,
  createMatrixChordStep,
  type AddMatrixPreviewCommand,
} from "./commands/matrixCommands";
import { setGlobalCardView, type SetGlobalCardViewCommand } from "./commands/matrixViewCommands";
import {
  setTonic,
  switchModule,
  type SetTonicCommand,
  type SwitchModuleCommand,
} from "./commands/harmonyContextCommands";
import {
  addBranchPreview,
  commitBranchCommand,
  discardBranch,
  setBranchIntent,
  setBranchRejoinCommand,
  startBranch,
  type AddBranchPreviewCommand,
  type CommitBranchCommand,
  type DiscardBranchCommand,
  type SetBranchIntentCommand,
  type SetBranchRejoinCommand,
  type StartBranchCommand,
} from "./commands/branchCommands";
import { createDefaultProject, DEFAULT_PIANO_PERFORMANCE } from "../domain/project/factory";
import { recommend } from "../domain/recommendations/engine";
import {
  createAlternativesTraySnapshot,
  type AlternativesTrayCandidate,
  type AlternativesTraySnapshot,
} from "../domain/recommendations/alternatives";
import {
  baselineFunctionIdentities,
  getHarmonicModule,
  recommendationVocabulary,
  topologyEntryForFunction,
} from "../domain/harmony/moduleRegistry";
import {
  evaluateHarmonicRoute,
  semanticTargetForFunction,
  type HarmonicRouteDecision,
} from "../domain/harmony/routing";
import { planModuleSwitch, type ModuleSwitchPlan } from "../domain/harmony/moduleSwitch";
import {
  modeForModule,
  type HarmonicFunctionIdentity,
  type HarmonicModuleId,
} from "../domain/harmony/functions";
import { realizeChord } from "../domain/harmony/realization";
import { formatChordSymbol } from "../domain/harmony/chord";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import { branchRecommendationPath, type CompositionIntent } from "../domain/progression/branch";
import {
  snapshotStepPerformance,
  type CardViewId,
  type ChordStep,
  type PianoArticulation,
  type ProgressionStep,
  type RestStep,
  type StepPerformance,
} from "../domain/progression/step";
import { HarmonicMatrix } from "../ui/matrix/HarmonicMatrix";
import { ModuleSwitchDialog } from "../ui/matrix/ModuleSwitchDialog";
import { RouteWarningDialog } from "../ui/matrix/RouteWarningDialog";
import { RecommendationInspector } from "../ui/inspector/RecommendationInspector";
import { HarmonyDetails } from "../ui/inspector/HarmonyDetails";
import { CompositionIntentControl } from "../ui/inspector/CompositionIntentControl";
import { BranchComparison } from "../ui/progression/BranchComparison";
import { BranchControls } from "../ui/progression/BranchControls";
import { VoiceLeadingMenu } from "../ui/progression/VoiceLeadingMenu";
import { ModulationModal } from "../ui/modulation/ModulationModal";
import type { ModulationPath } from "../domain/harmony/modulation";
import { ModesExplorerModal } from "../ui/modes/ModesExplorerModal";
import type { ModalCadenceFormula } from "../domain/harmony/modes";
import { getModalParentKeyAndFunction } from "../domain/harmony/modes";
import {
  applyModesFormula,
  createModesFormulaSteps,
  type ApplyModesFormulaCommand,
} from "./commands/modesExplorerCommands";
import type { PitchClassIdentity } from "../domain/harmony/pitch";
import {
  optimizeProgressionVoiceLeading,
  type VoiceLeadingStrategy,
} from "../domain/progression/voiceLeadingOptimizer";
import { ProgressionTransportControls } from "../ui/progression/ProgressionTransportControls";
import { ProgressionTrack } from "../ui/progression/ProgressionTrack";
import { SongSectionControls } from "../ui/progression/SongSectionControls";
import { ProgressionQuickEdit } from "../ui/progression/ProgressionQuickEdit";
import { AlternativesTray } from "../ui/progression/AlternativesTray";
import { PrintableProgression } from "../ui/progression/PrintableProgression";
import { ProgressionContextMenu } from "../ui/progression/ProgressionContextMenu";
import { MatrixContextMenu } from "../ui/matrix/MatrixContextMenu";
import { ViewModeToggle } from "../ui/common/ViewModeToggle";
import { LabelHierarchyControl } from "../ui/progression/LabelHierarchyControl";
import type { LabelHierarchyMode } from "../ui/progression/labelHierarchy";
import { CardTemplateInspector } from "../ui/inspector/CardTemplateInspector";
import { AudioEnginesInspector } from "../ui/inspector/AudioEnginesInspector";
import { HarmonicStyleInspector } from "../ui/inspector/HarmonicStyleInspector";
import { PianoPerformanceInspector } from "../ui/inspector/PianoPerformanceInspector";
import { RestStepInspector } from "../ui/inspector/RestStepInspector";
import { ProgressionGlobalInspector } from "../ui/inspector/ProgressionGlobalInspector";
import { PianoVoicingEditor } from "../ui/piano/PianoVoicingEditor";
import { PianoAudioStatus } from "../ui/header/PianoAudioStatus";
import { HqSamplePianoProvider } from "../audio/hq-sample-piano/provider";
import { AcousticGuitarProvider } from "../audio/guitar/AcousticGuitarProvider";
import { guitarStrumOffsetSeconds } from "../audio/guitar/strumTiming";
import {
  formatMelodyPreparationNotice,
  MelodySoundFontProvider,
  type MelodyPreparationResult,
} from "../audio/soundfont/melodyProvider";
import type {
  AudioClock,
  AudioProviderState,
  InstrumentAudioProvider,
  ScheduledPlayback,
} from "../audio/contracts";
import {
  realizeStepAudioEvents,
  realizeProgressionAudioEvents,
  realizeGuitarStepAudioEvents,
} from "../audio/eventRealizer";
import { realizePianoRollChordAudition } from "../audio/pianoRollAudition";
import { realizeProgressionStepPitches } from "../instruments/piano/profile";
import { PlaybackSupportControls, TempoControls } from "../ui/transport/TransportBar";
import { HistoryControls } from "../ui/transport/HistoryControls";
import { getPianoRollGesture, setPianoRollGesture } from "../ui/melody/pianoRollSession";
import { TransportStore, type TransportState } from "../ui/transport/transportStore";
import { isAppShortcutProtectedTarget } from "../ui/studio/focusManagement";
import {
  INITIAL_LOOP_STATE,
  revalidateLoopState,
  setLoopMode,
  setLoopRange,
  type LoopMode,
  type LoopState,
} from "../ui/transport/loopState";
import { PlaybackController } from "../audio/playbackController";
import { PreviewAuditionController } from "../audio/previewAudition";
import {
  realizeMatrixCardPreview,
  resolvePreviousHarmonicContext,
} from "../ui/matrix/previewRealization";
import { QuickChordPalette } from "../ui/matrix/QuickChordPalette";
import { createQuickChordCandidates } from "../domain/recommendations/quickChord";
import { MetronomeClickProvider } from "../audio/metronome";
import {
  realizeMelodyStepAudition,
  realizeProgressionMelodyPerformance,
} from "../audio/melodyPerformance";
import type { ChordSubstitution } from "../domain/harmony/reharmonization";
import type { Meter, MeterChangePolicy } from "../domain/timing/meter";
import type { GrooveSettings } from "../domain/timing/swing";
import { musicalDuration, type MusicalDuration } from "../domain/timing/duration";
import { addRational, rationalToNumber, type Rational } from "../domain/timing/rational";
import { createProgressionMeasureLayout } from "../domain/timing/measureLayout";
import {
  createSetStepDurationCommand,
  setTempo,
  setMeter,
  setGroove,
  setStepDuration,
  type SetTempoCommand,
  type SetMeterCommand,
  type SetGrooveCommand,
} from "./commands/timingCommands";
import {
  patchMatrixTemplate,
  patchGlobalMatrixTemplate,
  resetCardTemplate,
  resetGlobalMatrixTemplate,
  resetMatrixScope,
  type PatchMatrixTemplateCommand,
  type PatchGlobalMatrixTemplateCommand,
  type ResetCardTemplateCommand,
  type ResetGlobalMatrixTemplateCommand,
  type ResetMatrixScopeCommand,
} from "./commands/matrixTemplateCommands";
import {
  addRestStep,
  batchEditStepPerformance,
  batchSetStepDuration,
  editStepPerformance,
  removeStep,
  reorderStep,
  replaceStep,
  resetAllStepPerformance,
  resetStepPerformance,
  selectStep,
  repeatChordStep,
  duplicateSteps,
  removeProgressionRange,
  removeSteps,
  reorderSteps,
  insertStepsAfter,
  insertStepsBefore,
  appendSteps,
  batchPatchSteps,
  type AddRestStepCommand,
  type BatchEditStepPerformanceCommand,
  type BatchSetStepDurationCommand,
  type EditStepPerformanceCommand,
  type RemoveStepCommand,
  type RemoveProgressionRangeCommand,
  type RemoveStepsCommand,
  type ReorderStepCommand,
  type ReplaceStepCommand,
  type ResetAllStepPerformanceCommand,
  type ResetStepPerformanceCommand,
  type SelectStepCommand,
  type RepeatChordStepCommand,
  type DuplicateStepsCommand,
  type ReorderStepsCommand,
  type InsertStepsAfterCommand,
  type InsertStepsBeforeCommand,
  type AppendStepsCommand,
  type BatchPatchStepsCommand,
  type StepPatch,
} from "./commands/progressionCommands";
import {
  replaceSystemChord,
  resizeSystemChordDuration,
  setSystemRest,
  setSystemStepDuration,
  splitSystemStep,
  tieSystemSteps,
  transferSystemChordBoundary,
  type ReplaceSystemChordCommand,
  type ResizeSystemChordDurationCommand,
  type SetSystemRestCommand,
  type SetSystemStepDurationCommand,
  type SplitSystemChordCommand,
  type TieSystemChordsCommand,
  type TransferSystemChordBoundaryCommand,
} from "./commands/systemChordCommands";
import { setSongSections, type SetSongSectionsCommand } from "./commands/sectionCommands";
import { projectScoreSystems, type ScoreSystem } from "../notation/scoreSystemProjection";
import { durationBars } from "../domain/timing/duration";
import {
  generatedMelodyRecipe,
  snapshotChordMelody,
  validateChordMelodyRecipe,
} from "../domain/melody/types";
import {
  saveCustomPreset,
  deleteCustomPreset,
  applyPreset,
  type SaveCustomPresetCommand,
  type DeleteCustomPresetCommand,
  type ApplyPresetCommand,
} from "./commands/presetCommands";
import {
  realizePresetSteps,
  type FunctionalPreset,
  type PresetApplyMode,
} from "../domain/progression/presets";
import { PresetsPanel } from "../ui/progression/PresetsPanel";
import { PresetApplyDialog } from "../ui/progression/PresetApplyDialog";
import { SavePresetDialog } from "../ui/progression/SavePresetDialog";
import type { StepPerformanceOverrides } from "../domain/project/defaults";
import {
  nextRegisterOffset,
  performanceOctaveShiftPatch,
  shiftPitchesByOctave,
  type StaffOctaveDirection,
} from "../ui/staff/staffOctave";
import { ProjectManager } from "../ui/projects/ProjectManager";
import {
  PortableProjectActions,
  PortableProjectExportAction,
} from "../ui/projects/PortableProjectActions";
import { ExportActions } from "../ui/projects/ExportActions";
import { ProjectTabs } from "../ui/projects/ProjectTabs";
import { StudioWorkspace } from "../ui/studio/StudioWorkspace";
import { AppMenuBar } from "../ui/studio/AppMenuBar";
import { HelpCenterModal, type HelpTabId } from "../ui/help/HelpCenterModal";
import { GuitarHandLegendModal } from "../ui/guitar/GuitarHandLegendModal";
import { ThemeControl } from "../ui/settings/ThemeControl";
import { ExpertiseModeControl } from "../ui/settings/ExpertiseModeControl";
import { GlobalSettingsControl } from "../ui/settings/GlobalSettingsControl";
import {
  GLOBAL_SETTINGS_STORAGE_KEY,
  readGlobalSettingsVisibility,
  type GlobalSettingsVisibility,
} from "../ui/settings/globalSettings";
import {
  persistLegacyOpenProjectIds,
  persistOpenProjectTabsMirror,
  readLegacyOpenProjectIds,
  readOpenProjectTabsMirror,
} from "../ui/projects/projectTabsState";
import type { OpenProjectTabsState } from "../persistence/projectRepository";
import {
  setTheme,
  setExpertiseMode,
  setStaffBassVisibility,
  setProgressionView,
  setMeasuresPerSystem,
  setNoteColorMode,
  setResolutionArrows,
  setGenreFocus,
  setGuitarChordOrientation,
  setSidePanelMode,
  type SetThemeCommand,
  type SetExpertiseModeCommand,
  type SetStaffBassVisibilityCommand,
  type SetProgressionViewCommand,
  type SetMeasuresPerSystemCommand,
  type SetNoteColorModeCommand,
  type SetResolutionArrowsCommand,
  type SetGenreFocusCommand,
  type SetGuitarChordOrientationCommand,
  type SetSidePanelModeCommand,
} from "./commands/presentationCommands";
import type { GenreFocusId } from "../domain/harmony/functionSemantics";
import type {
  MeasuresPerSystem,
  PresentationMode,
  ThemeMode,
  Project,
  ProgressionView,
  NoteColorMode,
} from "../domain/project/project";
import type {
  ChordMelodyRecipe,
  MelodyGrid,
  MelodyInstrument,
  MelodyPitchMotion,
  MelodyTrackSettings,
} from "../domain/melody/types";
import { resolveEffectiveMelodyInstrument } from "../domain/melody/instrumentCatalog";
import type { HarmonyTrackSettings } from "../domain/harmony/track";
import {
  createPatchMelodyTrackSettingsCommand,
  createRemoveMelodyRecipeCommand,
  createSetMelodyRecipeCommand,
  createSetAuthoredMelodyCommand,
  applyMelodyCommand,
  removeMelodyRecipe as applyRemoveMelodyRecipe,
  setMelodyRecipe as applySetMelodyRecipe,
  setMelodyTrackSettings as applyMelodyTrackSettings,
} from "./commands/melodyCommands";
import type { AuthoredMelodyEdit } from "./commands/authoredMelodyTransaction";
import {
  createPatchHarmonyTrackSettingsCommand,
  setHarmonyTrackSettings as applyHarmonyTrackSettings,
} from "./commands/harmonyCommands";

function useStore(store: AppStore) {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((value) => value + 1)), [store]);
  return { project: store.project, matrixSession: store.matrixSession };
}

export function App() {
  const store = useMemo(
    () =>
      new AppStore(createDefaultProject("local-dev", "CadenceFlow", "2026-09-04T00:00:00.000Z")),
    [],
  );
  const { project, matrixSession } = useStore(store);
  const [pendingSwitch, setPendingSwitch] = useState<ModuleSwitchPlan | null>(null);
  const [pendingRouteWarning, setPendingRouteWarning] = useState<{
    readonly functionId: string;
    readonly decision: HarmonicRouteDecision;
    readonly branch: boolean;
    readonly restoreMatrixPreview: string | undefined;
    readonly clearMatrixPreviewOnCancel: boolean;
  } | null>(null);
  const routeRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [quickChordPaletteOpen, setQuickChordPaletteOpen] = useState(false);
  const quickChordPreviewBeforeOpenRef = useRef<string | undefined>(undefined);
  const [selectedBranchStepIds, setSelectedBranchStepIds] = useState<readonly string[]>(
    Object.freeze([]),
  );
  const [selectedPianoNote, setSelectedPianoNote] = useState<{
    readonly stepId: string;
    readonly eventKey: string;
  } | null>(null);
  const [activePianoRollChordStepId, setActivePianoRollChordStepId] = useState<string | null>(null);
  const [pianoRollInspectorRequest, setPianoRollInspectorRequest] = useState<{
    readonly stepId: string;
    readonly eventKey: string;
    readonly requestId: number;
  } | null>(null);
  const [labelHierarchyMode, setLabelHierarchyMode] =
    useState<LabelHierarchyMode>("function-first");
  const [durationResizeStatus, setDurationResizeStatus] = useState<string | null>(null);
  const [settingsFunctionId, setSettingsFunctionId] = useState<string | null>(null);
  const [voicingEditorOpen, setVoicingEditorOpen] = useState(false);
  const [audioState, setAudioState] = useState<AudioProviderState>("idle");
  const [guitarAudioState, setGuitarAudioState] = useState<AudioProviderState>("idle");
  const [guitarSoundFontState, setGuitarSoundFontState] = useState<AudioProviderState>("idle");
  const [harmonySoundFontState, setHarmonySoundFontState] = useState<AudioProviderState>("idle");
  const [harmonySoundFontError, setHarmonySoundFontError] = useState<string | null>(null);
  const audioProviderRef = useRef<HqSamplePianoProvider | null>(null);
  const sharedAudioContextRef = useRef<AudioContext | null>(null);
  const harmonySoundFontProviderRef = useRef<MelodySoundFontProvider | null>(null);
  const guitarSoundFontProviderRef = useRef<MelodySoundFontProvider | null>(null);
  const [melodyAudioState, setMelodyAudioState] = useState<AudioProviderState>("idle");
  const [melodyAudioError, setMelodyAudioError] = useState<string | null>(null);
  const melodyProviderRef = useRef<MelodySoundFontProvider | null>(null);
  const [presetsPanelOpen, setPresetsPanelOpen] = useState(false);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [applyDialogPreset, setApplyDialogPreset] = useState<FunctionalPreset | null>(null);
  const [auditioningPresetId, setAuditioningPresetId] = useState<string | null>(null);
  const presetAuditionStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progressionMenu, setProgressionMenu] = useState<{
    anchor?: HTMLElement | undefined;
    position: { x: number; y: number };
  } | null>(null);
  const [matrixMenu, setMatrixMenu] = useState<{
    anchor?: HTMLElement | undefined;
    position: { x: number; y: number };
  } | null>(null);
  const [alternativesSession, setAlternativesSession] = useState<{
    readonly sourceProject: Project;
    readonly snapshot: AlternativesTraySnapshot;
    readonly invoker: HTMLElement | null;
    readonly applyError: string | null;
  } | null>(null);
  const [alternativesStatus, setAlternativesStatus] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpInitialTab, setHelpInitialTab] = useState<HelpTabId>("overview");
  const [isFingeringLegendOpen, setIsFingeringLegendOpen] = useState(false);

  const transportStore = useMemo(() => new TransportStore(), []);
  const [transportState, setTransportState] = useState<TransportState>(transportStore.getState());
  const [loopState, setLoopState] = useState<LoopState>(INITIAL_LOOP_STATE);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [countInEnabled, setCountInEnabled] = useState(false);
  const [mutedSystemIndices, setMutedSystemIndices] = useState<ReadonlySet<number>>(new Set());
  const [soloSystemIndex, setSoloSystemIndex] = useState<number | null>(null);
  const [copiedSystemSteps, setCopiedSystemSteps] = useState<readonly ProgressionStep[] | null>(
    null,
  );
  const playbackControllerRef = useRef<PlaybackController | null>(null);
  const playbackControllerProviderRef = useRef<InstrumentAudioProvider | null>(null);
  const previewAuditionControllerRef = useRef<PreviewAuditionController | null>(null);
  const guitarProviderRef = useRef<AcousticGuitarProvider | null>(null);
  const guitarPreviewAuditionControllerRef = useRef<PreviewAuditionController | null>(null);
  const melodyPreviewAuditionControllerRef = useRef<PreviewAuditionController | null>(null);
  const melodyPreviewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const melodyPreviewRequestRef = useRef(0);
  const [isMelodyPreviewPlaying, setIsMelodyPreviewPlaying] = useState(false);
  const [previewPlayingStepId, setPreviewPlayingStepId] = useState<string | null>(null);
  const [previewActiveMelodyEventKey, setPreviewActiveMelodyEventKey] = useState<string | null>(
    null,
  );
  const [pianoRollAuditionPlayhead, setPianoRollAuditionPlayhead] = useState<{
    readonly requestId: number;
    readonly startBeat: number;
    readonly endBeat: number;
    readonly startedAt: number;
    readonly clockNow: () => number;
  } | null>(null);
  const pianoRollAuditionPlayheadRef = useRef<typeof pianoRollAuditionPlayhead>(null);
  const pianoRollMatrixReplacementTargetRef = useRef<string | null>(null);
  const [pianoRollMatrixReplacement, setPianoRollMatrixReplacement] = useState<{
    readonly stepId: string;
    readonly functionId: string | null;
  } | null>(null);
  const pianoRollViewRef = useRef(project.presentation.progressionView);
  const pianoRollAuditionRequestRef = useRef(0);
  const clearPianoRollAuditionPlayhead = useCallback(() => {
    pianoRollAuditionRequestRef.current += 1;
    pianoRollAuditionPlayheadRef.current = null;
    setPianoRollAuditionPlayhead(null);
  }, []);
  const startPianoRollAuditionPlayhead = useCallback(
    (
      requestId: number,
      startBeat: number,
      endBeat: number,
      playback: ScheduledPlayback,
      clock: AudioClock,
    ) => {
      const audition = {
        requestId,
        startBeat,
        endBeat,
        startedAt: playback.scheduledAt ?? clock.now(),
        clockNow: clock.now,
      };
      pianoRollAuditionPlayheadRef.current = audition;
      setPianoRollAuditionPlayhead(audition);
    },
    [],
  );
  const finishPianoRollAuditionPlayhead = useCallback((requestId: number) => {
    if (pianoRollAuditionPlayheadRef.current?.requestId !== requestId) return;
    pianoRollAuditionPlayheadRef.current = null;
    if (pianoRollAuditionRequestRef.current === requestId) pianoRollAuditionRequestRef.current += 1;
    setPianoRollAuditionPlayhead(null);
  }, []);
  useEffect(() => {
    if (pianoRollViewRef.current === project.presentation.progressionView) return;
    pianoRollViewRef.current = project.presentation.progressionView;
    clearPianoRollAuditionPlayhead();
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
  }, [clearPianoRollAuditionPlayhead, project.presentation.progressionView]);
  const stepPreviewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const melodyHighlightTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [projectReady, setProjectReady] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [globalSettingsVisibility, setGlobalSettingsVisibility] =
    useState<GlobalSettingsVisibility>(readGlobalSettingsVisibility);
  const [projectList, setProjectList] = useState<
    Awaited<ReturnType<ProjectController["listProjects"]>>
  >([]);
  const [openProjectIds, setOpenProjectIds] = useState<readonly string[]>([]);
  const openTabsInitializedRef = useRef(false);
  const persistedOpenProjectTabsRef = useRef<OpenProjectTabsState | null | undefined>(undefined);
  const openTabsUserChangedRef = useRef(false);
  const openTabsUpdatedAtRef = useRef(0);
  const hasMelodyRecipe = useMemo(
    () =>
      project.progression.steps.some((step) =>
        step.kind === "chord" ? step.melody !== undefined : step.authoredMelody !== undefined,
      ),
    [project.progression.steps],
  );
  const effectiveMelodyInstruments = useMemo<readonly MelodyInstrument[]>(() => {
    const instruments = project.progression.steps
      .filter((step) =>
        step.kind === "chord" ? step.melody !== undefined : step.authoredMelody !== undefined,
      )
      .map((step) => {
        return resolveEffectiveMelodyInstrument(
          step.melodyInstrumentOverride,
          project.melodyTrack.instrument,
        ).id;
      });
    return Object.freeze([...new Set(instruments)]);
  }, [project.melodyTrack.instrument, project.progression.steps]);

  const applyMelodyPreparationResult = useCallback((result: MelodyPreparationResult) => {
    setMelodyAudioError(formatMelodyPreparationNotice(result));
  }, []);

  const applyHarmonyPreparationResult = useCallback((result: MelodyPreparationResult) => {
    setHarmonySoundFontError(formatMelodyPreparationNotice(result));
  }, []);

  const ensureMelodyProvider = useCallback(() => {
    if (!melodyProviderRef.current) {
      const provider = new MelodySoundFontProvider({
        ...(sharedAudioContextRef.current ? { audioContext: sharedAudioContextRef.current } : {}),
        instrument: project.melodyTrack.instrument,
        volume: project.melodyTrack.volume,
        onStateChange: (state) => {
          setMelodyAudioState(state);
          if (state !== "error") setMelodyAudioError(null);
        },
      });
      melodyProviderRef.current = provider;
      setMelodyAudioState(provider.state);
    }
    melodyProviderRef.current.setTrackSettings(project.melodyTrack);
    return melodyProviderRef.current;
  }, [project.melodyTrack]);

  const getMelodyPreviewAuditionController = useCallback(() => {
    const provider = melodyProviderRef.current ?? ensureMelodyProvider();
    if (!melodyPreviewAuditionControllerRef.current) {
      melodyPreviewAuditionControllerRef.current = new PreviewAuditionController({
        provider,
        clock: provider.clock,
      });
    }
    return melodyPreviewAuditionControllerRef.current;
  }, [ensureMelodyProvider]);

  const ensureGuitarProvider = useCallback(() => {
    if (!guitarProviderRef.current) {
      const sharedContext = sharedAudioContextRef.current;
      guitarProviderRef.current = new AcousticGuitarProvider({
        ...(sharedContext ? { audioContext: sharedContext } : {}),
        onStateChange: (state) => {
          setGuitarAudioState(state);
        },
      });
      void guitarProviderRef.current.prepare();
    }
    return guitarProviderRef.current;
  }, []);

  const ensureGuitarSoundFontProvider = useCallback(() => {
    const instrument: MelodyInstrument = project.harmonyTrack.guitarSoundfontInstrument ?? "gm-025";
    if (!guitarSoundFontProviderRef.current) {
      const provider = new MelodySoundFontProvider({
        ...(sharedAudioContextRef.current ? { audioContext: sharedAudioContextRef.current } : {}),
        instrument,
        volume: project.harmonyTrack.volume,
        onStateChange: (state) => {
          setGuitarSoundFontState(state);
        },
      });
      guitarSoundFontProviderRef.current = provider;
      setGuitarSoundFontState(provider.state);
    }
    guitarSoundFontProviderRef.current.setTrackSettings({
      instrument,
      volume: project.harmonyTrack.volume,
      muted: project.harmonyTrack.muted,
      solo: project.harmonyTrack.solo,
    });
    guitarSoundFontProviderRef.current.setPreviewSettings(instrument, project.harmonyTrack.volume);
    void guitarSoundFontProviderRef.current
      .prepareForInstruments([instrument])
      .then(applyHarmonyPreparationResult)
      .catch((error) => {
        setHarmonySoundFontError(error instanceof Error ? error.message : String(error));
      });
    return guitarSoundFontProviderRef.current;
  }, [applyHarmonyPreparationResult, project.harmonyTrack]);

  const getActiveGuitarProvider = useCallback(() => {
    if (project.harmonyTrack.guitarEngine === "soundfont") {
      return ensureGuitarSoundFontProvider();
    }
    return guitarProviderRef.current ?? ensureGuitarProvider();
  }, [ensureGuitarProvider, ensureGuitarSoundFontProvider, project.harmonyTrack.guitarEngine]);

  const ensureHarmonySoundFontProvider = useCallback(() => {
    const isPiano =
      project.harmonyTrack.instrument === "piano" || project.harmonyTrack.instrument === "gm-000";
    const soundFontInstrument: MelodyInstrument = isPiano
      ? (project.harmonyTrack.pianoSoundfontInstrument ?? "gm-000")
      : project.harmonyTrack.instrument;
    if (!harmonySoundFontProviderRef.current) {
      const provider = new MelodySoundFontProvider({
        ...(sharedAudioContextRef.current ? { audioContext: sharedAudioContextRef.current } : {}),
        instrument: soundFontInstrument,
        volume: project.harmonyTrack.volume,
        onStateChange: (state) => {
          setHarmonySoundFontState(state);
          if (state !== "error") setHarmonySoundFontError(null);
        },
      });
      harmonySoundFontProviderRef.current = provider;
      setHarmonySoundFontState(provider.state);
    }
    harmonySoundFontProviderRef.current.setTrackSettings({
      instrument: soundFontInstrument,
      volume: project.harmonyTrack.volume,
      muted: project.harmonyTrack.muted,
      solo: project.harmonyTrack.solo,
    });
    harmonySoundFontProviderRef.current.setPreviewSettings(
      soundFontInstrument,
      project.harmonyTrack.volume,
    );
    void harmonySoundFontProviderRef.current
      .prepareForInstruments([soundFontInstrument])
      .then(applyHarmonyPreparationResult)
      .catch((error) => {
        setHarmonySoundFontError(error instanceof Error ? error.message : String(error));
      });
    return harmonySoundFontProviderRef.current;
  }, [applyHarmonyPreparationResult, project.harmonyTrack]);

  const isGuitarProgressionView = (view: ProgressionView): boolean =>
    view === "guitar" || view === "tablature";

  const getActiveHarmonyProvider = useCallback(() => {
    if (isGuitarProgressionView(project.presentation.progressionView)) {
      return getActiveGuitarProvider();
    }
    const isSoundFontPiano = project.harmonyTrack.pianoEngine === "soundfont";
    if (
      project.harmonyTrack.instrument === "piano" ||
      project.harmonyTrack.instrument === "gm-000"
    ) {
      if (isSoundFontPiano) {
        return ensureHarmonySoundFontProvider();
      }
      return audioProviderRef.current;
    }
    return ensureHarmonySoundFontProvider();
  }, [
    getActiveGuitarProvider,
    ensureHarmonySoundFontProvider,
    project.harmonyTrack.instrument,
    project.harmonyTrack.pianoEngine,
    project.harmonyTrack.pianoSoundfontInstrument,
    project.presentation.progressionView,
  ]);

  const getPreviewAuditionController = useCallback(() => {
    const provider = getActiveHarmonyProvider();
    if (!provider) return null;
    if (
      !previewAuditionControllerRef.current ||
      previewAuditionControllerRef.current.getProvider() !== provider
    ) {
      previewAuditionControllerRef.current = new PreviewAuditionController({
        provider,
        clock: provider.clock,
      });
    }
    return previewAuditionControllerRef.current;
  }, [getActiveHarmonyProvider]);

  const getGuitarPreviewAuditionController = useCallback(() => {
    const provider = getActiveGuitarProvider();
    if (!provider) return null;
    if (
      !guitarPreviewAuditionControllerRef.current ||
      guitarPreviewAuditionControllerRef.current.getProvider() !== provider
    ) {
      guitarPreviewAuditionControllerRef.current = new PreviewAuditionController({
        provider,
        clock: provider.clock,
      });
    }
    return guitarPreviewAuditionControllerRef.current;
  }, [getActiveGuitarProvider]);

  const retryMelodyAudio = useCallback(() => {
    const provider = ensureMelodyProvider();
    void provider
      .prepareForInstruments(effectiveMelodyInstruments)
      .then(applyMelodyPreparationResult)
      .catch((error) => {
        setMelodyAudioError(error instanceof Error ? error.message : String(error));
      });
  }, [applyMelodyPreparationResult, effectiveMelodyInstruments, ensureMelodyProvider]);

  const retryAudio = useCallback(() => {
    const isGuitar =
      isGuitarProgressionView(project.presentation.progressionView) ||
      project.presentation.globalMatrixCardView === "guitar";
    const engine = isGuitar
      ? (project.harmonyTrack.guitarEngine ?? "hq-samples")
      : (project.harmonyTrack.pianoEngine ?? "hq-samples");

    if (isGuitar) {
      if (engine === "soundfont") {
        const provider = ensureGuitarSoundFontProvider();
        const inst = project.harmonyTrack.guitarSoundfontInstrument ?? "gm-025";
        void provider.prepareForInstruments([inst]).then(applyHarmonyPreparationResult);
      } else {
        const provider = ensureGuitarProvider();
        void provider.prepare();
      }
    } else {
      if (engine === "soundfont") {
        const provider = ensureHarmonySoundFontProvider();
        const soundFontInstrument =
          project.harmonyTrack.instrument === "piano"
            ? (project.harmonyTrack.pianoSoundfontInstrument ?? "gm-000")
            : project.harmonyTrack.instrument;
        void provider
          .prepareForInstruments([soundFontInstrument])
          .then(applyHarmonyPreparationResult);
      } else {
        if (audioProviderRef.current) {
          setAudioState("loading");
          void audioProviderRef.current.prepare().catch(() => {});
        }
      }
    }
  }, [
    project.presentation.progressionView,
    project.presentation.globalMatrixCardView,
    project.harmonyTrack.guitarEngine,
    project.harmonyTrack.pianoEngine,
    project.harmonyTrack.pianoSoundfontInstrument,
    project.harmonyTrack.guitarSoundfontInstrument,
    project.harmonyTrack.instrument,
    ensureGuitarSoundFontProvider,
    ensureGuitarProvider,
    ensureHarmonySoundFontProvider,
    applyHarmonyPreparationResult,
  ]);

  const clearStepPreviewHighlights = useCallback(() => {
    if (stepPreviewStopTimerRef.current !== null) {
      clearTimeout(stepPreviewStopTimerRef.current);
      stepPreviewStopTimerRef.current = null;
    }
    melodyHighlightTimerRefs.current.forEach((timer) => clearTimeout(timer));
    melodyHighlightTimerRefs.current = [];
    setPreviewPlayingStepId(null);
    setPreviewActiveMelodyEventKey(null);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        GLOBAL_SETTINGS_STORAGE_KEY,
        JSON.stringify(globalSettingsVisibility),
      );
    } catch {
      // UI preferences are best-effort when storage is unavailable.
    }
  }, [globalSettingsVisibility]);

  const stopProjectRuntime = useCallback(() => {
    clearPianoRollAuditionPlayhead();
    playbackControllerRef.current?.stop();
    previewAuditionControllerRef.current?.stop();
    guitarPreviewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
    if (melodyPreviewStopTimerRef.current !== null) {
      clearTimeout(melodyPreviewStopTimerRef.current);
      melodyPreviewStopTimerRef.current = null;
    }
    setIsMelodyPreviewPlaying(false);
    clearStepPreviewHighlights();
    transportStore.stop();
    setLoopState(INITIAL_LOOP_STATE);
    setPendingSwitch(null);
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    setPresetsPanelOpen(false);
    setSavePresetDialogOpen(false);
    setApplyDialogPreset(null);
    setMatrixMenu(null);
    setProgressionMenu(null);
    setAlternativesSession(null);
  }, [clearStepPreviewHighlights, clearPianoRollAuditionPlayhead, transportStore]);

  const projectController = useMemo(() => new ProjectController({ store }), [store]);

  const loadPersistedOpenProjectTabs =
    useCallback(async (): Promise<OpenProjectTabsState | null> => {
      let persistedFromIdb: OpenProjectTabsState | null = null;
      const getOpenProjectTabsState = projectController.repo.getOpenProjectTabsState;
      if (getOpenProjectTabsState) {
        try {
          persistedFromIdb = await getOpenProjectTabsState.call(projectController.repo);
        } catch {
          // The synchronous mirror remains available if the metadata store is unavailable.
        }
      }

      const persistedFromMirror = readOpenProjectTabsMirror();
      const persisted = [persistedFromIdb, persistedFromMirror]
        .filter((state): state is OpenProjectTabsState => state !== null)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (persisted) {
        openTabsUpdatedAtRef.current = persisted.updatedAt;
        return persisted;
      }

      const legacyIds = readLegacyOpenProjectIds();
      // A single legacy ID can be the incomplete value written by the old
      // localStorage implementation. Let the first IDB initialization recover
      // the complete set of saved projects in that case.
      if (legacyIds && legacyIds.length > 1) {
        const updatedAt = Date.now();
        if (projectController.repo.setOpenProjectTabsState) {
          try {
            await projectController.repo.setOpenProjectTabsState.call(projectController.repo, {
              ids: legacyIds,
              source: "initial",
              updatedAt,
            });
          } catch {
            // The existing localStorage value remains a usable fallback.
          }
        }
        openTabsUpdatedAtRef.current = updatedAt;
        return { ids: legacyIds, source: "initial", updatedAt };
      }

      return null;
    }, [projectController]);

  useLayoutEffect(() => {
    if (!openTabsInitializedRef.current || openProjectIds.length === 0) return;
    const setOpenProjectTabsState = projectController.repo.setOpenProjectTabsState;
    const updatedAt = Math.max(Date.now(), openTabsUpdatedAtRef.current + 1);
    openTabsUpdatedAtRef.current = updatedAt;
    const state: OpenProjectTabsState = {
      ids: openProjectIds,
      source: openTabsUserChangedRef.current ? "user" : "initial",
      updatedAt,
    };
    // Keep a synchronous mirror so an immediate reload cannot race the IDB write.
    persistOpenProjectTabsMirror(state);
    if (setOpenProjectTabsState) {
      try {
        void setOpenProjectTabsState
          .call(projectController.repo, state)
          .catch(() => persistLegacyOpenProjectIds(openProjectIds));
      } catch {
        persistLegacyOpenProjectIds(openProjectIds);
      }
      return;
    }
    persistLegacyOpenProjectIds(openProjectIds);
  }, [openProjectIds, projectController]);

  useEffect(() => {
    projectController.setBeforeProjectSwitch(stopProjectRuntime);
  }, [projectController, stopProjectRuntime]);

  const refreshProjectList = useCallback(async () => {
    const nextProjects = await projectController.listProjects();
    setProjectList(nextProjects);
    if (!openTabsInitializedRef.current && persistedOpenProjectTabsRef.current === undefined) {
      persistedOpenProjectTabsRef.current = await loadPersistedOpenProjectTabs();
    }
    const availableIds = new Set(nextProjects.map((item) => item.id));
    const activeId = store.project.id;
    if (!openTabsInitializedRef.current) {
      // Keep the ref mutation outside the state updater. React StrictMode may
      // invoke functional updaters twice, and the initializer must stay pure.
      openTabsInitializedRef.current = true;
      const persistedTabs = persistedOpenProjectTabsRef.current;
      const shouldRecoverAllProjects =
        persistedTabs?.source === "initial" &&
        persistedTabs.ids.length === 1 &&
        nextProjects.length > 1;
      const persistedIds = shouldRecoverAllProjects ? null : persistedTabs?.ids;
      const initialIds = persistedIds ?? nextProjects.map((item) => item.id);
      const retained = initialIds.filter((id) => availableIds.has(id));
      setOpenProjectIds(retained.includes(activeId) ? retained : [...retained, activeId]);
      return;
    }
    setOpenProjectIds((current) => {
      const retained = current.filter((id) => availableIds.has(id));
      return retained.includes(activeId) ? retained : [...retained, activeId];
    });
  }, [loadPersistedOpenProjectTabs, projectController, store]);

  useEffect(() => {
    return transportStore.subscribe(() => {
      setTransportState(transportStore.getState());
    });
  }, [transportStore]);

  useEffect(() => {
    setLoopState((prev) => revalidateLoopState(prev, project.progression.steps));
  }, [project.progression.steps]);

  useEffect(() => {
    return () => {
      playbackControllerRef.current?.stop();
      previewAuditionControllerRef.current?.dispose();
      guitarPreviewAuditionControllerRef.current?.dispose();
      melodyPreviewAuditionControllerRef.current?.dispose();
      if (melodyPreviewStopTimerRef.current !== null) {
        clearTimeout(melodyPreviewStopTimerRef.current);
      }
      if (stepPreviewStopTimerRef.current !== null) {
        clearTimeout(stepPreviewStopTimerRef.current);
      }
      melodyHighlightTimerRefs.current.forEach((timer) => clearTimeout(timer));
      melodyProviderRef.current?.stop();
      void melodyProviderRef.current?.dispose();
      guitarProviderRef.current?.stop();
      void guitarProviderRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const sharedAudioContext = typeof AudioContext !== "undefined" ? new AudioContext() : undefined;
    sharedAudioContextRef.current = sharedAudioContext ?? null;
    const provider = new HqSamplePianoProvider({
      ...(sharedAudioContext ? { audioContext: sharedAudioContext } : {}),
      onStateChange: (s) => setAudioState(s),
    });
    audioProviderRef.current = provider;
    setAudioState("loading");
    provider.prepare().catch(() => {
      // Handled and reflected in provider state
    });
    return () => {
      provider.stop();
      void provider.dispose();
      guitarProviderRef.current?.stop();
      void guitarProviderRef.current?.dispose();
      guitarSoundFontProviderRef.current?.stop();
      void guitarSoundFontProviderRef.current?.dispose();
      harmonySoundFontProviderRef.current?.stop();
      void harmonySoundFontProviderRef.current?.dispose();
      if (sharedAudioContextRef.current === sharedAudioContext) {
        sharedAudioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    audioProviderRef.current?.setVolume(project.harmonyTrack.volume);
    guitarProviderRef.current?.setVolume(project.harmonyTrack.volume);
    guitarSoundFontProviderRef.current?.setVolume(project.harmonyTrack.volume);
    harmonySoundFontProviderRef.current?.setVolume(project.harmonyTrack.volume);
  }, [project.harmonyTrack.volume]);

  useEffect(() => {
    const isGuitarActive =
      isGuitarProgressionView(project.presentation.progressionView) ||
      project.presentation.globalMatrixCardView === "guitar" ||
      project.harmonyTrack.guitarEngine === "soundfont";

    if (isGuitarActive) {
      if (project.harmonyTrack.guitarEngine === "soundfont") {
        const inst = project.harmonyTrack.guitarSoundfontInstrument ?? "gm-025";
        const provider = ensureGuitarSoundFontProvider();
        void provider
          .prepareForInstruments([inst])
          .then(applyHarmonyPreparationResult)
          .catch((error) => {
            setHarmonySoundFontError(error instanceof Error ? error.message : String(error));
          });
      } else {
        void ensureGuitarProvider()
          .prepare()
          .catch(() => {
            // Reflected in provider state
          });
      }
    }
  }, [
    applyHarmonyPreparationResult,
    ensureGuitarProvider,
    ensureGuitarSoundFontProvider,
    project.harmonyTrack.guitarEngine,
    project.harmonyTrack.guitarSoundfontInstrument,
    project.presentation.globalMatrixCardView,
    project.presentation.progressionView,
  ]);

  useEffect(() => {
    const isPiano =
      project.harmonyTrack.instrument === "piano" || project.harmonyTrack.instrument === "gm-000";
    if (isPiano && project.harmonyTrack.pianoEngine !== "soundfont") {
      setHarmonySoundFontError(null);
      return;
    }
    const inst = isPiano
      ? (project.harmonyTrack.pianoSoundfontInstrument ?? "gm-000")
      : project.harmonyTrack.instrument;
    const provider = ensureHarmonySoundFontProvider();
    void provider
      .prepareForInstruments([inst])
      .then(applyHarmonyPreparationResult)
      .catch((error) => {
        setHarmonySoundFontError(error instanceof Error ? error.message : String(error));
      });
  }, [
    applyHarmonyPreparationResult,
    ensureHarmonySoundFontProvider,
    project.harmonyTrack.instrument,
    project.harmonyTrack.pianoEngine,
    project.harmonyTrack.pianoSoundfontInstrument,
  ]);

  useEffect(() => {
    if (!hasMelodyRecipe) {
      setMelodyAudioError(null);
      return;
    }
    const provider = ensureMelodyProvider();
    void provider
      .prepareForInstruments(effectiveMelodyInstruments)
      .then(applyMelodyPreparationResult)
      .catch((error) => {
        setMelodyAudioError(error instanceof Error ? error.message : String(error));
      });
  }, [
    applyMelodyPreparationResult,
    effectiveMelodyInstruments,
    ensureMelodyProvider,
    hasMelodyRecipe,
  ]);

  useEffect(() => {
    const provider = melodyProviderRef.current;
    if (provider) provider.setTrackSettings(project.melodyTrack);
  }, [project.melodyTrack]);

  useEffect(() => {
    playbackControllerRef.current?.stop();
    playbackControllerRef.current = null;
    playbackControllerProviderRef.current = null;
  }, [
    hasMelodyRecipe,
    project.harmonyTrack.instrument,
    project.harmonyTrack.pianoEngine,
    project.harmonyTrack.pianoSoundfontInstrument,
    project.harmonyTrack.guitarEngine,
    project.harmonyTrack.guitarSoundfontInstrument,
  ]);

  useEffect(() => {
    let cancelled = false;
    setProjectReady(false);
    void (async () => {
      try {
        await projectController.initializeSession("CadenceFlow");
        projectController.startAutosave();
        await projectController.flush();
        if (!cancelled) await refreshProjectList();
      } catch (error) {
        if (!cancelled) setProjectError(formatProjectOperationError(error));
      } finally {
        if (!cancelled) setProjectReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectController, refreshProjectList]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = project.presentation.theme;
    document.documentElement.style.colorScheme = project.presentation.theme;
  }, [project.presentation.theme]);

  const activePianoRollChordStep =
    project.presentation.progressionView === "piano-roll" && activePianoRollChordStepId
      ? project.progression.steps.find((step) => step.id === activePianoRollChordStepId)
      : undefined;
  const selectedProgressionStepId =
    activePianoRollChordStep?.id ?? project.progression.selectedStepId;
  const selectedProgressionStep: ProgressionStep | undefined = selectedProgressionStepId
    ? project.progression.steps.find((step) => step.id === selectedProgressionStepId)
    : undefined;
  const selectedChordStep: ChordStep | undefined =
    selectedProgressionStep?.kind === "chord" ? selectedProgressionStep : undefined;
  const selectedStepIndex = selectedProgressionStep
    ? project.progression.steps.findIndex((step) => step.id === selectedProgressionStep.id)
    : -1;

  useEffect(() => {
    const branch = project.temporaryBranch;
    if (!branch) {
      setSelectedBranchStepIds((prev) => (prev.length === 0 ? prev : Object.freeze([])));
      return;
    }
    const next = branch.steps.map((step) => step.id);
    setSelectedBranchStepIds((prev) => {
      const existing = new Set(prev);
      if (next.length === prev.length && next.every((id) => existing.has(id))) {
        return prev;
      }
      return Object.freeze(next);
    });
  }, [project.temporaryBranch]);

  const vocabulary = recommendationVocabulary(project.activeModule);
  const baselineIds = new Set(
    baselineFunctionIdentities(project.activeModule).map((identity) => identity.functionId),
  );
  const pathSteps = project.temporaryBranch
    ? branchRecommendationPath(project.progression, project.temporaryBranch)
    : project.progression.steps;
  const pathFunctionIds = pathSteps
    .filter((step) => step.kind === "chord")
    .map((step) => step.harmonicFunction.functionId);
  const current = project.temporaryBranch
    ? pathFunctionIds.at(-1)
    : (matrixSession.previewFunctionId ?? pathFunctionIds.at(-1));
  const currentTopologyEntry = current
    ? topologyEntryForFunction(project.activeModule, current)
    : undefined;
  const currentTargetId = current
    ? (currentTopologyEntry?.targetId ??
      currentTopologyEntry?.identity.targetId ??
      currentTopologyEntry?.identity.targetFunctionId ??
      semanticTargetForFunction(project.activeModule, current))
    : undefined;
  const recommendationHistory = project.temporaryBranch
    ? pathFunctionIds
    : [
        ...pathFunctionIds,
        ...(matrixSession.previewFunctionId ? [matrixSession.previewFunctionId] : []),
      ];
  const recommendations = current
    ? recommend({
        moduleId: project.activeModule,
        currentFunctionId: current,
        ...(currentTargetId ? { currentTargetId } : {}),
        recentFunctionIds: recommendationHistory,
        visibleFunctionIds: vocabulary.map((identity) => identity.functionId),
        compositionIntent: project.temporaryBranch?.compositionIntent ?? "neutral",
        genreFocus: project.presentation.genreFocus ?? "all",
      })
    : null;

  const routeContext = {
    moduleId: project.activeModule,
    ...(current ? { currentFunctionId: current } : {}),
    ...(currentTargetId ? { currentTargetId } : {}),
  } as const;

  const routeSourceFunctionId = pathFunctionIds.at(-1);
  const routeSourceEntry = routeSourceFunctionId
    ? topologyEntryForFunction(project.activeModule, routeSourceFunctionId)
    : undefined;
  const routeSourceTargetId = routeSourceFunctionId
    ? (routeSourceEntry?.targetId ??
      routeSourceEntry?.identity.targetId ??
      routeSourceEntry?.identity.targetFunctionId ??
      semanticTargetForFunction(project.activeModule, routeSourceFunctionId))
    : undefined;
  const quickChordCandidates = createQuickChordCandidates(project, {
    ...(routeSourceFunctionId ? { currentFunctionId: routeSourceFunctionId } : {}),
    ...(routeSourceTargetId ? { currentTargetId: routeSourceTargetId } : {}),
  });

  const contextualIds = new Set<string>();
  for (const candidate of [
    recommendations?.bestMatch,
    ...(recommendations?.alternatives ?? []),
    ...(recommendations?.blockedCandidates ?? []),
  ]) {
    if (candidate?.functionId.startsWith("vii°7/") && !baselineIds.has(candidate.functionId))
      contextualIds.add(candidate.functionId);
  }
  const lastBranchStep = project.temporaryBranch?.steps.at(-1);
  const activePreviewId = project.temporaryBranch
    ? lastBranchStep?.kind === "chord"
      ? lastBranchStep.harmonicFunction.functionId
      : undefined
    : matrixSession.previewFunctionId;
  if (activePreviewId?.startsWith("vii°7/") && !baselineIds.has(activePreviewId))
    contextualIds.add(activePreviewId);
  const contextualFunctions = vocabulary.filter((identity) =>
    contextualIds.has(identity.functionId),
  );

  const previewIdentity = activePreviewId
    ? (vocabulary.find((identity) => identity.functionId === activePreviewId) ?? null)
    : null;
  const previewChord = previewIdentity ? realizeChord(previewIdentity, project.tonic) : null;
  const selectedMatrixChordName = previewChord
    ? formatChordSymbol(previewChord)
    : (activePreviewId ?? undefined);
  const inspected = recommendations?.bestMatch ?? null;

  const addToProgression = (functionId: string) => {
    const nowIso = new Date().toISOString();
    const command: AddMatrixPreviewCommand = {
      type: "matrix/add-preview",
      payload: { functionId, stepId: crypto.randomUUID(), nowIso },
    };
    store.dispatch(command, addMatrixPreview);
  };
  const addToBranch = (functionId: string) => {
    const command: AddBranchPreviewCommand = {
      type: "branch/add-preview",
      payload: { functionId, stepId: crypto.randomUUID(), nowIso: new Date().toISOString() },
    };
    store.dispatch(command, addBranchPreview);
  };
  const addWithRouteGuard = (functionId: string, branch: boolean): boolean => {
    // A card may already be the active preview when the user explicitly adds it.
    // In that case the real append transition starts at the committed progression
    // endpoint, not at the preview itself; otherwise a blocked X -> Y route could
    // be mistaken for the harmless Y -> Y identity transition.
    const sourceFunctionId = branch ? routeContext.currentFunctionId : pathFunctionIds.at(-1);
    const sourceEntry = sourceFunctionId
      ? topologyEntryForFunction(project.activeModule, sourceFunctionId)
      : undefined;
    const sourceTargetId = sourceFunctionId
      ? (sourceEntry?.targetId ??
        sourceEntry?.identity.targetId ??
        sourceEntry?.identity.targetFunctionId ??
        semanticTargetForFunction(project.activeModule, sourceFunctionId))
      : undefined;
    const targetEntry = topologyEntryForFunction(project.activeModule, functionId);
    const decision = evaluateHarmonicRoute(
      {
        moduleId: project.activeModule,
        ...(sourceFunctionId ? { currentFunctionId: sourceFunctionId } : {}),
        ...(sourceTargetId ? { currentTargetId: sourceTargetId } : {}),
      },
      functionId,
      targetEntry?.targetId ?? targetEntry?.identity.targetId,
    );
    if (decision.status === "requires-confirmation") {
      routeRestoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingRouteWarning({
        functionId,
        decision,
        branch,
        restoreMatrixPreview: branch ? undefined : matrixSession.previewFunctionId,
        clearMatrixPreviewOnCancel: !branch,
      });
      return false;
    }
    if (branch) addToBranch(functionId);
    else addToProgression(functionId);
    return true;
  };
  const auditionMatrixCard = (
    functionId: string,
    previewProject: Project = store.project,
    previousStepId?: string,
  ) => {
    if (sharedAudioContextRef.current && sharedAudioContextRef.current.state === "suspended") {
      void sharedAudioContextRef.current.resume();
    }
    const currentProject = previewProject;
    const isGuitar = currentProject.presentation.globalMatrixCardView === "guitar";
    const previousContext = resolvePreviousHarmonicContext(currentProject, previousStepId);
    const previewRealization = realizeMatrixCardPreview(
      currentProject,
      functionId,
      previousContext,
    );

    if (isGuitar) {
      const guitarRealization = realizeGuitarStepAudioEvents({
        chord: previewRealization.chord,
        step: previewRealization.step,
        tempoBpm: currentProject.globalTiming.tempoBpm,
        instrument: currentProject.harmonyTrack.guitarSoundfontInstrument ?? "gm-025",
      });
      const auditionController = getGuitarPreviewAuditionController();
      auditionController?.audition(guitarRealization.events);
    } else {
      const isSoundFontPiano = currentProject.harmonyTrack.pianoEngine === "soundfont";
      const sfInst = currentProject.harmonyTrack.pianoSoundfontInstrument ?? "gm-000";
      const events = isSoundFontPiano
        ? previewRealization.events.map((e) => ({ ...e, instrument: sfInst }))
        : previewRealization.events;
      const auditionController = getPreviewAuditionController();
      auditionController?.audition(events);
    }
  };

  const stopAlternativesPreview = () => {
    previewAuditionControllerRef.current?.stop();
    guitarPreviewAuditionControllerRef.current?.stop();
  };

  const closeAlternatives = () => {
    const invoker = alternativesSession?.invoker;
    stopAlternativesPreview();
    setAlternativesSession(null);
    if (invoker) {
      const restoreFocus = () => {
        if (document.contains(invoker)) invoker.focus();
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreFocus);
      else restoreFocus();
    }
  };

  const openAlternativesForStep = (originStepId?: string) => {
    const sourceProject = store.project;
    const stepId = originStepId ?? sourceProject.progression.selectedStepId;
    if (!stepId) {
      setAlternativesStatus("Select a chord Step to explore alternatives after it.");
      return;
    }
    const snapshot = createAlternativesTraySnapshot(sourceProject, stepId);
    if (!snapshot) {
      setAlternativesStatus("Alternatives require at least one chord Step as the origin.");
      return;
    }
    setAlternativesStatus(null);
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stopAlternativesPreview();
    setAlternativesSession({
      sourceProject,
      snapshot,
      invoker,
      applyError: null,
    });
  };

  const openAlternativesForRange = (stepIds: readonly string[]) => {
    const originStepId = [...stepIds]
      .reverse()
      .find((stepId) =>
        store.project.progression.steps.some((step) => step.id === stepId && step.kind === "chord"),
      );
    if (!originStepId) {
      setAlternativesStatus("Explore alternatives needs a chord Step in the selected range.");
      return;
    }
    openAlternativesForStep(originStepId);
  };

  const auditionAlternative = (candidate: AlternativesTrayCandidate) => {
    const session = alternativesSession;
    if (!session || !session.snapshot.candidates.some((item) => item.key === candidate.key)) return;
    auditionMatrixCard(candidate.functionId, session.sourceProject, session.snapshot.originStepId);
  };

  const applyAlternative = (candidate: AlternativesTrayCandidate): string | undefined => {
    const session = alternativesSession;
    if (!session) return "The alternatives tray is no longer available.";
    stopAlternativesPreview();

    if (store.project !== session.sourceProject) {
      const message = "This alternative is stale because the Project or target Step changed.";
      setAlternativesSession((current) =>
        current ? { ...current, applyError: message } : current,
      );
      return message;
    }

    const originStep = store.project.progression.steps.find(
      (step) => step.id === session.snapshot.originStepId,
    );
    if (!originStep || originStep.kind !== "chord") {
      const message = "This alternative is stale because the origin Step no longer exists.";
      setAlternativesSession((current) =>
        current ? { ...current, applyError: message } : current,
      );
      return message;
    }

    const candidateIsSnapshotMember = session.snapshot.candidates.some(
      (item) => item.key === candidate.key,
    );
    if (!candidateIsSnapshotMember) {
      const message = "This candidate is not part of the current alternatives snapshot.";
      setAlternativesSession((current) =>
        current ? { ...current, applyError: message } : current,
      );
      return message;
    }

    const sourceTargetId =
      originStep.harmonicFunction.targetId ??
      originStep.harmonicFunction.targetFunctionId ??
      topologyEntryForFunction(project.activeModule, originStep.harmonicFunction.functionId)
        ?.targetId ??
      semanticTargetForFunction(project.activeModule, originStep.harmonicFunction.functionId);
    const targetEntry = topologyEntryForFunction(project.activeModule, candidate.functionId);
    const route = evaluateHarmonicRoute(
      {
        moduleId: project.activeModule,
        currentFunctionId: originStep.harmonicFunction.functionId,
        ...(sourceTargetId ? { currentTargetId: sourceTargetId } : {}),
      },
      candidate.functionId,
      targetEntry?.targetId ?? targetEntry?.identity.targetId,
    );
    if (route.status === "requires-confirmation") {
      const message = `Cannot apply ${candidate.functionId}: ${route.message}`;
      setAlternativesSession((current) =>
        current ? { ...current, applyError: message } : current,
      );
      return message;
    }

    try {
      const newStep = createMatrixChordStep(
        store.project,
        candidate.functionId,
        crypto.randomUUID(),
        session.snapshot.moduleId,
      );
      const command: InsertStepsAfterCommand = {
        type: "progression/insert-steps-after",
        payload: {
          afterStepId: session.snapshot.originStepId,
          steps: [newStep],
          nowIso: new Date().toISOString(),
        },
      };
      store.dispatch(command, insertStepsAfter);
      closeAlternatives();
      return undefined;
    } catch (error) {
      const message =
        error instanceof Error
          ? `Could not apply ${candidate.functionId}: ${error.message}`
          : "Could not apply this alternative. The Project was not changed.";
      setAlternativesSession((current) =>
        current ? { ...current, applyError: message } : current,
      );
      return message;
    }
  };

  const preview = (functionId: string) => {
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    const replacementTarget = pianoRollMatrixReplacementTargetRef.current;
    if (replacementTarget) {
      setPianoRollMatrixReplacement({ stepId: replacementTarget, functionId });
      store.selectMatrixPreview(functionId);
      return;
    }
    if (project.temporaryBranch) {
      if (!addWithRouteGuard(functionId, true)) return;
    } else {
      store.selectMatrixPreview(functionId);
    }
    auditionMatrixCard(functionId);
  };
  const previewQuickChord = (functionId: string) => {
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    store.selectMatrixPreview(functionId);
    auditionMatrixCard(functionId);
  };
  const openQuickChordPalette = () => {
    quickChordPreviewBeforeOpenRef.current = store.matrixSession.previewFunctionId;
    setQuickChordPaletteOpen(true);
  };
  const closeQuickChordPalette = (restorePreview = true) => {
    if (restorePreview && quickChordPaletteOpen) {
      const previous = quickChordPreviewBeforeOpenRef.current;
      if (previous) store.selectMatrixPreview(previous);
      else store.clearMatrixPreview();
    }
    quickChordPreviewBeforeOpenRef.current = undefined;
    setQuickChordPaletteOpen(false);
  };
  const applyQuickChord = (functionId: string): boolean => {
    const applied = addWithRouteGuard(functionId, Boolean(project.temporaryBranch));
    if (applied) {
      store.selectMatrixPreview(functionId);
      closeQuickChordPalette(false);
    }
    return applied;
  };
  const add = (functionId: string) => {
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    if (project.temporaryBranch) addWithRouteGuard(functionId, true);
    else addWithRouteGuard(functionId, false);
  };
  const confirmPendingRoute = () => {
    const pending = pendingRouteWarning;
    if (!pending) return;
    setPendingRouteWarning(null);
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    if (pending.branch) {
      addToBranch(pending.functionId);
      auditionMatrixCard(pending.functionId);
    } else {
      addToProgression(pending.functionId);
      store.selectMatrixPreview(pending.functionId);
    }
    closeQuickChordPalette(false);
  };
  const cancelPendingRoute = () => {
    const pending = pendingRouteWarning;
    setPendingRouteWarning(null);
    if (pending?.restoreMatrixPreview) store.selectMatrixPreview(pending.restoreMatrixPreview);
    else if (pending?.clearMatrixPreviewOnCancel) store.clearMatrixPreview();
  };

  const patchTemplatePerformance = (overrides: StepPerformanceOverrides) => {
    const nowIso = new Date().toISOString();
    if (settingsFunctionId) {
      const command: PatchMatrixTemplateCommand = {
        type: "matrix-template/patch",
        payload: {
          functionId: settingsFunctionId,
          performanceOverrides: overrides,
          nowIso,
        },
      };
      store.dispatch(command, patchMatrixTemplate);
    } else {
      const command: PatchGlobalMatrixTemplateCommand = {
        type: "matrix-template/patch-global",
        payload: {
          performanceOverrides: overrides,
          nowIso,
        },
      };
      store.dispatch(command, patchGlobalMatrixTemplate);
    }
  };

  const patchTemplateDuration = (duration: MusicalDuration) => {
    const nowIso = new Date().toISOString();
    if (settingsFunctionId) {
      const command: PatchMatrixTemplateCommand = {
        type: "matrix-template/patch",
        payload: {
          functionId: settingsFunctionId,
          durationOverride: duration,
          nowIso,
        },
      };
      store.dispatch(command, patchMatrixTemplate);
    } else {
      const command: PatchGlobalMatrixTemplateCommand = {
        type: "matrix-template/patch-global",
        payload: {
          durationOverride: duration,
          nowIso,
        },
      };
      store.dispatch(command, patchGlobalMatrixTemplate);
    }
  };

  const resetTemplate = () => {
    const nowIso = new Date().toISOString();
    if (settingsFunctionId) {
      const command: ResetCardTemplateCommand = {
        type: "matrix-template/reset-card",
        payload: { functionId: settingsFunctionId, nowIso },
      };
      store.dispatch(command, resetCardTemplate);
    } else {
      const command: ResetGlobalMatrixTemplateCommand = {
        type: "matrix-template/reset-global",
        payload: { nowIso },
      };
      store.dispatch(command, resetGlobalMatrixTemplate);
    }
  };
  const changeMatrixStaffOctave = (functionId: string, direction: StaffOctaveDirection) => {
    const currentProject = store.project;
    const step = createMatrixChordStep(currentProject, functionId, `preview-${functionId}`);
    const nowIso = new Date().toISOString();
    let command: PatchMatrixTemplateCommand | null = null;

    if (step.performance.voicingMode === "manual" && step.performance.manualVoicing?.length) {
      const manualPreviewVoicing = shiftPitchesByOctave(step.performance.manualVoicing, direction);
      if (manualPreviewVoicing) {
        command = {
          type: "matrix-template/patch",
          payload: { functionId, manualPreviewVoicing, nowIso },
        };
      }
    } else {
      const register = nextRegisterOffset(step.performance.register, direction);
      if (register !== null) {
        command = {
          type: "matrix-template/patch",
          payload: { functionId, performanceOverrides: { register }, nowIso },
        };
      }
    }

    if (!command) return;
    setSettingsFunctionId(functionId);
    store.dispatch(command, patchMatrixTemplate);
  };
  const resetCard = (functionId: string) => {
    const command: ResetCardTemplateCommand = {
      type: "matrix-template/reset-card",
      payload: { functionId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, resetCardTemplate);
  };
  const resetMatrix = (scope: "current-module" | "all-modules") => {
    const command: ResetMatrixScopeCommand = {
      type: "matrix-template/reset-scope",
      payload: { scope, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, resetMatrixScope);
  };
  const closeProgressionStepEditors = () => {
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
  };
  const setProgressionSelection = (stepId?: string) => {
    closeProgressionStepEditors();
    if (store.project.progression.selectedStepId === stepId) return;
    const command: SelectStepCommand = {
      type: "progression/select-step",
      payload: { ...(stepId ? { stepId } : {}), nowIso: new Date().toISOString() },
    };
    store.dispatch(command, selectStep);
  };
  const focusSelectedStepInspector = () => {
    const focus = () => {
      const inspector = document.querySelector<HTMLElement>('[data-context="selected-step"]');
      if (!inspector) return;
      inspector.scrollIntoView({ behavior: "smooth", block: "nearest" });
      inspector.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
    else focus();
  };
  const clearMatrixSelection = useCallback(() => {
    const previousFunctionId = settingsFunctionId ?? store.matrixSession.previewFunctionId;
    setSettingsFunctionId(null);
    store.clearMatrixPreview();
    if (previousFunctionId) {
      requestAnimationFrame(() => {
        const cardBtn = document.querySelector<HTMLButtonElement>(
          `[data-testid="chord-card-${previousFunctionId}"] .chord-main`,
        );
        cardBtn?.focus();
      });
    }
  }, [settingsFunctionId, store]);
  const auditionProgressionStep = (stepId: string) => {
    clearStepPreviewHighlights();
    const melodyRequestId = ++melodyPreviewRequestRef.current;
    melodyPreviewAuditionControllerRef.current?.stop();
    const currentProject = store.project;
    const step = currentProject.progression.steps.find(
      (candidate): candidate is ChordStep => candidate.id === stepId && candidate.kind === "chord",
    );
    if (!step) return;

    const mode = getHarmonicModule(currentProject.activeModule).mode;
    const realization = realizeStepAudioEvents({
      step,
      tonic: currentProject.tonic,
      context: {
        tonic: currentProject.tonic,
        mode,
        moduleId: currentProject.activeModule,
        spellingContext: { tonic: currentProject.tonic, mode },
      },
      tempoBpm: currentProject.globalTiming.tempoBpm,
    });
    const isGuitar =
      isGuitarProgressionView(currentProject.presentation.progressionView) ||
      currentProject.presentation.globalMatrixCardView === "guitar" ||
      step.cardView === "guitar" ||
      step.cardView === "tablature";
    let chordPlayback: import("../audio/contracts").ScheduledPlayback | null;
    let chordDurationSeconds: number;

    if (isGuitar) {
      const chord = realizeChord(step.harmonicFunction, currentProject.tonic);
      const guitarRealization = realizeGuitarStepAudioEvents({
        chord: {
          ...chord,
          variant: step.harmonicVariant,
        },
        step,
        tempoBpm: currentProject.globalTiming.tempoBpm,
        instrument: currentProject.harmonyTrack.guitarSoundfontInstrument ?? "gm-025",
      });
      chordPlayback =
        getGuitarPreviewAuditionController()?.audition(guitarRealization.events) ?? null;
      chordDurationSeconds = guitarRealization.totalDurationSeconds;
    } else {
      const isSoundFontPiano = currentProject.harmonyTrack.pianoEngine === "soundfont";
      const sfInst = currentProject.harmonyTrack.pianoSoundfontInstrument ?? "gm-000";
      const events = isSoundFontPiano
        ? realization.events.map((e) => ({ ...e, instrument: sfInst }))
        : realization.events;
      chordPlayback = getPreviewAuditionController()?.audition(events) ?? null;
      chordDurationSeconds = realization.events.reduce(
        (latest, event) => Math.max(latest, event.startSeconds + event.durationSeconds),
        0,
      );
    }

    if (chordPlayback) {
      setPreviewPlayingStepId(stepId);
      stepPreviewStopTimerRef.current = setTimeout(
        () => {
          stepPreviewStopTimerRef.current = null;
          setPreviewPlayingStepId((current) => (current === stepId ? null : current));
        },
        Math.max(1, Math.ceil(chordDurationSeconds * 1000)),
      );
    }

    if (!step.melody) return;

    const melodyEvents = realizeMelodyStepAudition(
      {
        steps: currentProject.progression.steps,
        tonic: currentProject.tonic,
        context: {
          tonic: currentProject.tonic,
          mode,
          moduleId: currentProject.activeModule,
          spellingContext: { tonic: currentProject.tonic, mode },
        },
        tempoBpm: currentProject.globalTiming.tempoBpm,
        groove: currentProject.groove,
        melodyTrack: currentProject.melodyTrack,
      },
      stepId,
    );
    if (melodyEvents.length === 0) return;

    const melodyProvider = ensureMelodyProvider();
    const previewInstruments = Object.freeze([
      ...new Set(melodyEvents.map((event) => event.instrument)),
    ]);
    melodyProvider.setPreviewSettings(
      melodyEvents[0]!.instrument,
      currentProject.melodyTrack.volume,
    );
    const playMelody = () => {
      if (melodyPreviewRequestRef.current !== melodyRequestId) return;
      const playback = getMelodyPreviewAuditionController()?.audition(melodyEvents);
      if (!playback) return;
      melodyHighlightTimerRefs.current.forEach((timer) => clearTimeout(timer));
      melodyHighlightTimerRefs.current = melodyEvents.flatMap((event) => [
        setTimeout(
          () => {
            if (melodyPreviewRequestRef.current === melodyRequestId) {
              setPreviewActiveMelodyEventKey(event.eventKey);
            }
          },
          Math.max(0, Math.floor(event.startSeconds * 1000)),
        ),
        setTimeout(
          () => {
            if (melodyPreviewRequestRef.current === melodyRequestId) {
              setPreviewActiveMelodyEventKey((current) =>
                current === event.eventKey ? null : current,
              );
            }
          },
          Math.max(1, Math.ceil((event.startSeconds + event.durationSeconds) * 1000)),
        ),
      ]);
    };
    void melodyProvider
      .prepareForInstruments(previewInstruments)
      .then(playMelody)
      .catch((error) => {
        if (melodyPreviewRequestRef.current === melodyRequestId) {
          setMelodyAudioError(error instanceof Error ? error.message : String(error));
        }
      });
  };
  const selectProgressionStep = (stepId: string) => {
    setProgressionSelection(stepId);
    auditionProgressionStep(stepId);
  };

  const stopAuditionPreset = useCallback(() => {
    if (presetAuditionStopTimerRef.current !== null) {
      clearTimeout(presetAuditionStopTimerRef.current);
      presetAuditionStopTimerRef.current = null;
    }
    getPreviewAuditionController()?.stop();
    setAuditioningPresetId(null);
  }, [getPreviewAuditionController]);

  const auditionPreset = useCallback(
    (preset: FunctionalPreset) => {
      stopAuditionPreset();
      const currentProject = store.project;
      const mode = getHarmonicModule(currentProject.activeModule).mode;
      const context: HarmonicContext = {
        tonic: currentProject.tonic,
        mode,
        moduleId: currentProject.activeModule,
        spellingContext: { tonic: currentProject.tonic, mode },
      };
      const realization = realizePresetSteps(preset, context, currentProject.defaults);
      if (realization.kind !== "success" || realization.steps.length === 0) return;

      const audioEvents = realizeProgressionAudioEvents({
        steps: realization.steps,
        tonic: currentProject.tonic,
        context,
        tempoBpm: currentProject.globalTiming.tempoBpm,
        ...(currentProject.groove ? { groove: currentProject.groove } : {}),
      });

      const controller = getPreviewAuditionController();
      const scheduled = controller?.audition(audioEvents);
      if (scheduled) {
        setAuditioningPresetId(preset.id);
        const totalDurationSeconds = audioEvents.reduce(
          (latest, event) => Math.max(latest, event.startSeconds + event.durationSeconds),
          0,
        );
        presetAuditionStopTimerRef.current = setTimeout(
          () => {
            presetAuditionStopTimerRef.current = null;
            setAuditioningPresetId((current) => (current === preset.id ? null : current));
          },
          Math.max(1, Math.ceil(totalDurationSeconds * 1000)),
        );
      }
    },
    [getPreviewAuditionController, stopAuditionPreset],
  );

  const [auditioningSubId, setAuditioningSubId] = useState<string | null>(null);
  const subAuditionStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAuditioningSubstitution = useCallback(() => {
    if (subAuditionStopTimerRef.current !== null) {
      clearTimeout(subAuditionStopTimerRef.current);
      subAuditionStopTimerRef.current = null;
    }
    getPreviewAuditionController()?.stop();
    setAuditioningSubId(null);
  }, [getPreviewAuditionController]);

  const handleAuditionSubstitution = useCallback(
    (substitution: ChordSubstitution) => {
      if (auditioningSubId === substitution.id) {
        stopAuditioningSubstitution();
        return;
      }
      stopAuditioningSubstitution();

      const currentProject = store.project;
      const targetModule = substitution.targetModuleId ?? currentProject.activeModule;
      const targetStep =
        selectedChordStep ??
        createMatrixChordStep(
          currentProject,
          substitution.targetFunctionId,
          "preview-sub-step",
          targetModule,
        );
      const subStep: ChordStep = Object.freeze({
        ...createMatrixChordStep(
          currentProject,
          substitution.targetFunctionId,
          "preview-sub-step",
          targetModule,
        ),
        cardView: targetStep.cardView,
        duration: targetStep.duration,
        harmonicVariant: substitution.harmonicVariant ?? targetStep.harmonicVariant,
        performance: targetStep.performance,
      });

      const mode = getHarmonicModule(targetModule).mode;
      const context: HarmonicContext = {
        tonic: currentProject.tonic,
        mode,
        moduleId: targetModule,
        spellingContext: { tonic: currentProject.tonic, mode },
      };
      const realization = realizeStepAudioEvents({
        step: subStep,
        tonic: currentProject.tonic,
        context,
        tempoBpm: currentProject.globalTiming.tempoBpm,
      });

      const scheduled = getPreviewAuditionController()?.audition(realization.events);
      if (scheduled) {
        setAuditioningSubId(substitution.id);
        const durationSeconds = realization.events.reduce(
          (latest, event) => Math.max(latest, event.startSeconds + event.durationSeconds),
          0,
        );
        subAuditionStopTimerRef.current = setTimeout(
          () => {
            subAuditionStopTimerRef.current = null;
            setAuditioningSubId((curr) => (curr === substitution.id ? null : curr));
          },
          Math.max(1, Math.ceil(durationSeconds * 1000)),
        );
      }
    },
    [
      auditioningSubId,
      getPreviewAuditionController,
      selectedChordStep,
      stopAuditioningSubstitution,
      store,
    ],
  );

  const editProgressionPerformance = (stepId: string, performance: Partial<StepPerformance>) => {
    const command: EditStepPerformanceCommand = {
      type: "progression/edit-performance",
      payload: { stepId, performance, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, editStepPerformance);
  };
  const changeProgressionView = (view: ProgressionView) => {
    if (view !== "piano-roll") {
      setSelectedPianoNote(null);
      setPianoRollInspectorRequest(null);
    }
    if (view === "guitar" || view === "tablature") {
      void ensureGuitarProvider()
        .prepare()
        .catch(() => {
          // Reflected in provider state
        });
    }
    if (view === project.presentation.progressionView) return;
    const command: SetProgressionViewCommand = {
      type: "presentation/set-progression-view",
      payload: { view, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setProgressionView);
  };
  const replaceProgressionStep = (
    stepId: string,
    functionId: string,
    moduleId?: HarmonicModuleId,
  ) => {
    const command: ReplaceStepCommand = {
      type: "progression/replace-step",
      payload: {
        stepId,
        functionId,
        ...(moduleId ? { moduleId } : {}),
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, replaceStep);
  };
  const replacePianoRollChord = (stepId: string, functionId: string) => {
    const target = project.progression.steps.find((step) => step.id === stepId);
    if (!target) return;
    if (target.kind === "chord") {
      const replacement = createMatrixChordStep(project, functionId, stepId);
      if (
        target.harmonicFunction.moduleId === replacement.harmonicFunction.moduleId &&
        target.harmonicFunction.functionId === replacement.harmonicFunction.functionId &&
        JSON.stringify(target.harmonicVariant) === JSON.stringify(replacement.harmonicVariant) &&
        target.explicitSpellingOverrides === undefined
      )
        return;
    }
    const command: ReplaceSystemChordCommand = {
      type: "piano-roll/replace-chord",
      payload: { stepId, functionId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, replaceSystemChord);
    if (pianoRollMatrixReplacementTargetRef.current === stepId) {
      pianoRollMatrixReplacementTargetRef.current = null;
      setPianoRollMatrixReplacement(null);
      store.clearMatrixPreview();
    }
  };
  const setPianoRollRest = (stepId: string) => {
    const target = project.progression.steps.find((step) => step.id === stepId);
    if (!target || target.kind === "rest") return;
    const command: SetSystemRestCommand = {
      type: "piano-roll/set-rest",
      payload: { stepId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setSystemRest);
  };
  const setPianoRollStepDuration = (stepId: string, duration: MusicalDuration) => {
    const target = project.progression.steps.find((step) => step.id === stepId);
    if (
      !target ||
      (target.duration.beats.numerator === duration.beats.numerator &&
        target.duration.beats.denominator === duration.beats.denominator)
    )
      return;
    const command: SetSystemStepDurationCommand = {
      type: "piano-roll/set-step-duration",
      payload: { stepId, duration, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setSystemStepDuration);
  };
  const resizeProgressionChordDuration = (stepId: string, duration: MusicalDuration) => {
    const command: ResizeSystemChordDurationCommand = {
      type: "progression/resize-chord-duration",
      payload: { stepId, duration, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, resizeSystemChordDuration);
  };
  const splitPianoRollStep = (stepId: string) => {
    const command: SplitSystemChordCommand = {
      type: "piano-roll/split-step",
      payload: { stepId, newStepId: crypto.randomUUID(), nowIso: new Date().toISOString() },
    };
    store.dispatch(command, splitSystemStep);
  };
  const tiePianoRollSteps = (stepIds: readonly string[]) => {
    const command: TieSystemChordsCommand = {
      type: "piano-roll/tie-steps",
      payload: { stepIds, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, tieSystemSteps);
  };
  const transferPianoRollBoundary = (
    leftStepId: string,
    boundary: Rational,
    snapQuantum: Rational,
    draggedStepId?: string,
    draggedEdge?: "left" | "right",
    resizeMode?: "boundary" | "isolated",
  ) => {
    const command: TransferSystemChordBoundaryCommand = {
      type: "piano-roll/transfer-boundary",
      payload: {
        leftStepId,
        boundary,
        snapQuantum,
        ...(draggedStepId ? { draggedStepId } : {}),
        ...(draggedEdge ? { draggedEdge } : {}),
        ...(resizeMode ? { resizeMode } : {}),
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, transferSystemChordBoundary);
  };
  const handleApplySubstitution = (stepId: string, substitution: ChordSubstitution) => {
    const targetStep = project.progression.steps.find((s) => s.id === stepId);
    if (!targetStep || targetStep.kind !== "chord") return;

    if (substitution.operation === "replace") {
      const command: ReplaceStepCommand = {
        type: "progression/replace-step",
        payload: {
          stepId,
          functionId: substitution.targetFunctionId,
          ...(substitution.targetModuleId ? { moduleId: substitution.targetModuleId } : {}),
          ...(substitution.harmonicVariant
            ? { harmonicVariant: substitution.harmonicVariant }
            : {}),
          nowIso: new Date().toISOString(),
        },
      };
      store.dispatch(command, replaceStep);
    } else {
      const targetModule = substitution.targetModuleId ?? project.activeModule;
      const newStepId = `step-sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const baseNewStep = createMatrixChordStep(
        project,
        substitution.targetFunctionId,
        newStepId,
        targetModule,
      );
      const newStep: ChordStep = Object.freeze({
        ...baseNewStep,
        duration: targetStep.duration,
        cardView: targetStep.cardView,
        harmonicVariant: substitution.harmonicVariant ?? baseNewStep.harmonicVariant,
        performance: snapshotStepPerformance(targetStep.performance),
      });
      const command: InsertStepsBeforeCommand = {
        type: "progression/insert-steps-before",
        payload: {
          beforeStepId: stepId,
          steps: [newStep],
          nowIso: new Date().toISOString(),
        },
      };
      store.dispatch(command, insertStepsBefore);
    }
  };

  const [isModulationModalOpen, setIsModulationModalOpen] = useState(false);
  const [auditioningModPathId, setAuditioningModPathId] = useState<string | null>(null);
  const modAuditionStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAuditioningModulation = useCallback(() => {
    if (modAuditionStopTimerRef.current !== null) {
      clearTimeout(modAuditionStopTimerRef.current);
      modAuditionStopTimerRef.current = null;
    }
    getPreviewAuditionController()?.stop();
    setAuditioningModPathId(null);
  }, [getPreviewAuditionController]);

  const handleAuditionModulationPath = useCallback(
    (path: ModulationPath) => {
      if (auditioningModPathId === path.id) {
        stopAuditioningModulation();
        return;
      }
      stopAuditioningModulation();

      const currentProject = store.project;
      const allEvents: import("../audio/contracts").AudioNoteEvent[] = [];
      const tempoBpm = currentProject.globalTiming.tempoBpm;
      const stepDurationSeconds = 1.0;

      for (let i = 0; i < path.bridgeSteps.length; i++) {
        const bridgeStep = path.bridgeSteps[i]!;
        const stepModule = bridgeStep.targetFunction.moduleId;
        const tonic = path.targetTonic;
        const stepId = `mod-audition-step-${i}`;
        const baseStep = createMatrixChordStep(
          currentProject,
          bridgeStep.targetFunction.functionId,
          stepId,
          stepModule,
        );
        const mode = getHarmonicModule(stepModule).mode;
        const context: HarmonicContext = {
          tonic,
          mode,
          moduleId: stepModule,
          spellingContext: { tonic, mode },
        };
        const realization = realizeStepAudioEvents({
          step: baseStep,
          tonic,
          context,
          tempoBpm,
          stepStartSeconds: i * stepDurationSeconds,
        });
        allEvents.push(...realization.events);
      }

      const scheduled = getPreviewAuditionController()?.audition(allEvents);
      if (scheduled) {
        setAuditioningModPathId(path.id);
        const totalDuration = allEvents.reduce(
          (latest, ev) => Math.max(latest, ev.startSeconds + ev.durationSeconds),
          0,
        );
        modAuditionStopTimerRef.current = setTimeout(
          () => {
            modAuditionStopTimerRef.current = null;
            setAuditioningModPathId((curr) => (curr === path.id ? null : curr));
          },
          Math.max(1, Math.ceil(totalDuration * 1000)),
        );
      }
    },
    [auditioningModPathId, getPreviewAuditionController, stopAuditioningModulation, store],
  );

  const handleApplyModulationBridge = useCallback(
    (path: ModulationPath, insertMode: "append" | "insert", switchKey: boolean) => {
      const currentProject = store.project;
      const nowIso = new Date().toISOString();
      const newSteps: ChordStep[] = path.bridgeSteps.map((bridgeStep, idx) => {
        const fnRef = switchKey ? bridgeStep.targetFunction : bridgeStep.sourceFunction;
        const stepId = `step-mod-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
        return createMatrixChordStep(currentProject, fnRef.functionId, stepId, fnRef.moduleId);
      });

      if (
        insertMode === "insert" &&
        currentProject.progression.selectedStepId &&
        currentProject.progression.steps.some(
          (s) => s.id === currentProject.progression.selectedStepId,
        )
      ) {
        const command: InsertStepsAfterCommand = {
          type: "progression/insert-steps-after",
          payload: {
            afterStepId: currentProject.progression.selectedStepId,
            steps: newSteps,
            nowIso,
          },
        };
        store.dispatch(command, insertStepsAfter);
      } else {
        const command: AppendStepsCommand = {
          type: "progression/append-steps",
          payload: {
            steps: newSteps,
            nowIso,
          },
        };
        store.dispatch(command, appendSteps);
      }

      if (switchKey) {
        if (currentProject.tonic !== path.targetTonic) {
          const tonicCommand: SetTonicCommand = {
            type: "harmony/set-tonic",
            payload: { tonic: path.targetTonic, nowIso },
          };
          store.dispatch(tonicCommand, setTonic);
        }
        if (currentProject.activeModule !== path.targetModule) {
          const plan = planModuleSwitch(store.project.progression.steps, path.targetModule);
          const resolutions: Record<string, HarmonicFunctionIdentity | "keep-original"> = {};
          for (const item of plan.resolutions) {
            resolutions[item.stepId] = item.automaticTarget ?? "keep-original";
          }
          const switchModuleCommand: SwitchModuleCommand = {
            type: "harmony/switch-module",
            payload: {
              destinationModule: path.targetModule,
              resolutions,
              nowIso,
            },
          };
          store.dispatch(switchModuleCommand, switchModule);
        }
      }
    },
    [store],
  );

  const [isModesExplorerOpen, setIsModesExplorerOpen] = useState(false);
  const modesAuditionStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAuditioningModes = useCallback(() => {
    if (modesAuditionStopTimerRef.current !== null) {
      clearTimeout(modesAuditionStopTimerRef.current);
      modesAuditionStopTimerRef.current = null;
    }
    getPreviewAuditionController()?.stop();
    getGuitarPreviewAuditionController()?.stop();
  }, [getGuitarPreviewAuditionController, getPreviewAuditionController]);

  const handleAuditionScaleNotes = useCallback(
    (pitches: readonly { midiNumber: number }[], instrument?: "piano" | "guitar") => {
      stopAuditioningModes();
      const isGuitar = instrument === "guitar";
      const isSoundFontPiano = store.project.harmonyTrack.pianoEngine === "soundfont";
      const sfInst = isGuitar
        ? (store.project.harmonyTrack.guitarSoundfontInstrument ?? "gm-025")
        : (store.project.harmonyTrack.pianoSoundfontInstrument ?? "gm-000");
      const noteDuration = 0.24;
      const events: import("../audio/contracts").AudioNoteEvent[] = pitches.map((p, idx) => ({
        pitch: p.midiNumber,
        channelRole: "upper",
        velocity: 82,
        startSeconds: idx * noteDuration,
        durationSeconds: noteDuration * 0.95,
        ...(isGuitar || isSoundFontPiano ? { instrument: sfInst } : {}),
      }));
      const controller =
        instrument === "guitar"
          ? getGuitarPreviewAuditionController()
          : getPreviewAuditionController();
      controller?.audition(events);
      modesAuditionStopTimerRef.current = setTimeout(
        () => {
          modesAuditionStopTimerRef.current = null;
        },
        Math.ceil((pitches.length * noteDuration + 0.5) * 1000),
      );
    },
    [
      getGuitarPreviewAuditionController,
      getPreviewAuditionController,
      stopAuditioningModes,
      store.project.harmonyTrack.guitarSoundfontInstrument,
      store.project.harmonyTrack.pianoEngine,
      store.project.harmonyTrack.pianoSoundfontInstrument,
    ],
  );

  const handleAuditionModalChord = useCallback(
    (pitches: readonly { midiNumber: number }[], instrument?: "piano" | "guitar") => {
      stopAuditioningModes();
      const isGuitar = instrument === "guitar";
      const isSoundFontPiano = store.project.harmonyTrack.pianoEngine === "soundfont";
      const sfInst = isGuitar
        ? (store.project.harmonyTrack.guitarSoundfontInstrument ?? "gm-025")
        : (store.project.harmonyTrack.pianoSoundfontInstrument ?? "gm-000");
      const events: import("../audio/contracts").AudioNoteEvent[] = pitches.map((p, idx) => ({
        pitch: p.midiNumber,
        channelRole: isGuitar && idx === 0 ? "bass" : "upper",
        velocity: 82,
        startSeconds: isGuitar ? guitarStrumOffsetSeconds(idx, pitches.length) : 0,
        durationSeconds: isGuitar
          ? Math.max(0.2, 1.8 - guitarStrumOffsetSeconds(idx, pitches.length))
          : 1.8,
        ...(isGuitar || isSoundFontPiano ? { instrument: sfInst } : {}),
      }));
      const controller = isGuitar
        ? getGuitarPreviewAuditionController()
        : getPreviewAuditionController();
      controller?.audition(events);
    },
    [
      getGuitarPreviewAuditionController,
      getPreviewAuditionController,
      stopAuditioningModes,
      store.project.harmonyTrack.guitarSoundfontInstrument,
      store.project.harmonyTrack.pianoEngine,
      store.project.harmonyTrack.pianoSoundfontInstrument,
    ],
  );

  const handleAuditionModalFormula = useCallback(
    (
      formula: ModalCadenceFormula,
      modalTonic: PitchClassIdentity,
      instrument?: "piano" | "guitar",
    ) => {
      stopAuditioningModes();
      const currentProject = store.project;
      const allEvents: import("../audio/contracts").AudioNoteEvent[] = [];
      const tempoBpm = currentProject.globalTiming.tempoBpm;
      const stepDurationSeconds = 1.0;

      for (let i = 0; i < formula.steps.length; i++) {
        const formulaStep = formula.steps[i]!;
        const { parentTonic, functionId, moduleId } = getModalParentKeyAndFunction(
          modalTonic,
          formula.modeId,
          formulaStep.degree,
        );
        const stepId = `mode-audition-step-${i}`;
        const baseStep = createMatrixChordStep(currentProject, functionId, stepId, moduleId);
        const mode = getHarmonicModule(moduleId).mode;
        const context: HarmonicContext = {
          tonic: parentTonic,
          mode,
          moduleId,
          spellingContext: { tonic: parentTonic, mode },
        };

        if (instrument === "guitar") {
          const chord = realizeChord(baseStep.harmonicFunction, parentTonic);
          const guitarRealization = realizeGuitarStepAudioEvents({
            chord: {
              ...chord,
              variant: baseStep.harmonicVariant,
            },
            step: baseStep,
            tempoBpm,
            stepStartSeconds: i * stepDurationSeconds,
            instrument: currentProject.harmonyTrack.guitarSoundfontInstrument ?? "gm-025",
          });
          allEvents.push(...guitarRealization.events);
        } else {
          const realization = realizeStepAudioEvents({
            step: baseStep,
            tonic: parentTonic,
            context,
            tempoBpm,
            stepStartSeconds: i * stepDurationSeconds,
          });
          allEvents.push(...realization.events);
        }
      }

      const controller =
        instrument === "guitar"
          ? getGuitarPreviewAuditionController()
          : getPreviewAuditionController();
      const scheduled = controller?.audition(allEvents);
      if (scheduled) {
        const totalDuration = allEvents.reduce(
          (latest, ev) => Math.max(latest, ev.startSeconds + ev.durationSeconds),
          0,
        );
        modesAuditionStopTimerRef.current = setTimeout(
          () => {
            modesAuditionStopTimerRef.current = null;
          },
          Math.max(1, Math.ceil(totalDuration * 1000)),
        );
      }
    },
    [getGuitarPreviewAuditionController, getPreviewAuditionController, stopAuditioningModes, store],
  );

  const handleApplyModalFormulaToProgression = useCallback(
    (formula: ModalCadenceFormula, modalTonic: PitchClassIdentity, switchKey: boolean) => {
      const currentProject = store.project;
      const nowIso = new Date().toISOString();
      const { parentTonic } = getModalParentKeyAndFunction(modalTonic, formula.modeId, 1);
      const steps = createModesFormulaSteps(
        currentProject,
        formula,
        modalTonic,
        formula.steps.map(() => `step-mode-${crypto.randomUUID()}`),
      );
      const command: ApplyModesFormulaCommand = {
        type: "modes/apply-formula",
        payload: {
          formulaId: formula.id,
          modeId: formula.modeId,
          modalTonic,
          parentTonic,
          switchKey,
          steps,
          nowIso,
        },
      };
      try {
        store.dispatch(command, applyModesFormula);
        return { success: true as const };
      } catch (error) {
        return {
          success: false as const,
          reason:
            error instanceof Error
              ? error.message
              : "The formula could not be applied. The project was not changed.",
        };
      }
    },
    [store],
  );

  const handleApplyModalKeyToProject = useCallback(
    (tonic: PitchClassIdentity) => {
      if (store.project.tonic === tonic) return;
      const tonicCommand: SetTonicCommand = {
        type: "harmony/set-tonic",
        payload: { tonic, nowIso: new Date().toISOString() },
      };
      store.dispatch(tonicCommand, setTonic);
    },
    [store],
  );

  const resetProgressionStep = (stepId: string) => {
    const command: ResetStepPerformanceCommand = {
      type: "progression/reset-performance",
      payload: { stepId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, resetStepPerformance);
  };
  const batchEditProgressionPerformance = (performance: Partial<StepPerformance>) => {
    const command: BatchEditStepPerformanceCommand = {
      type: "progression/batch-edit-performance",
      payload: { performance, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchEditStepPerformance);
  };
  const batchSetProgressionDuration = (duration: MusicalDuration) => {
    const command: BatchSetStepDurationCommand = {
      type: "progression/batch-set-duration",
      payload: { duration, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchSetStepDuration);
  };
  const resetAllProgressionPerformance = () => {
    const command: ResetAllStepPerformanceCommand = {
      type: "progression/reset-all-performance",
      payload: { nowIso: new Date().toISOString() },
    };
    store.dispatch(command, resetAllStepPerformance);
  };
  const removeProgressionStep = (stepId: string) => {
    const command: RemoveStepCommand = {
      type: "progression/remove-step",
      payload: { stepId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, removeStep);
  };
  const duplicateProgressionStep = (stepId: string) => {
    const sourceStep = project.progression.steps.find((s) => s.id === stepId);
    if (!sourceStep || sourceStep.kind !== "chord") return;
    const newStepId = crypto.randomUUID();
    const clonedStep: ChordStep = Object.freeze({
      ...sourceStep,
      id: newStepId,
      performance: snapshotStepPerformance(sourceStep.performance),
      ...(sourceStep.melody !== undefined
        ? { melody: snapshotChordMelody(sourceStep.melody) }
        : {}),
      ...(sourceStep.explicitSpellingOverrides
        ? { explicitSpellingOverrides: Object.freeze({ ...sourceStep.explicitSpellingOverrides }) }
        : {}),
    });
    const nowIso = new Date().toISOString();
    const command: InsertStepsAfterCommand = {
      type: "progression/insert-steps-after",
      payload: {
        afterStepId: stepId,
        steps: [clonedStep],
        nowIso,
      },
    };
    store.dispatch(command, insertStepsAfter);
    selectProgressionStep(newStepId);
  };
  const insertMatrixChordBefore = (targetStepId: string, functionId: string) => {
    const newStepId = crypto.randomUUID();
    const newStep = createMatrixChordStep(project, functionId, newStepId);
    const nowIso = new Date().toISOString();
    const command: InsertStepsBeforeCommand = {
      type: "progression/insert-steps-before",
      payload: {
        beforeStepId: targetStepId,
        steps: [newStep],
        nowIso,
      },
    };
    store.dispatch(command, insertStepsBefore);
    selectProgressionStep(newStepId);
  };
  const insertMatrixChordAfter = (targetStepId: string, functionId: string) => {
    const newStepId = crypto.randomUUID();
    const newStep = createMatrixChordStep(project, functionId, newStepId);
    const nowIso = new Date().toISOString();
    const command: InsertStepsAfterCommand = {
      type: "progression/insert-steps-after",
      payload: {
        afterStepId: targetStepId,
        steps: [newStep],
        nowIso,
      },
    };
    store.dispatch(command, insertStepsAfter);
    selectProgressionStep(newStepId);
  };
  const setMelodyRecipeForStep = (
    stepId: string,
    recipe: ChordMelodyRecipe,
    instrumentOverride?: MelodyInstrument,
  ) => {
    const command = createSetMelodyRecipeCommand(
      stepId,
      recipe,
      new Date().toISOString(),
      undefined,
      instrumentOverride ?? null,
    );
    store.dispatch(command, applySetMelodyRecipe);
  };
  const setAuthoredMelodyForStep = (
    stepId: string,
    phrase: { readonly notes: readonly import("../domain/melody/types").AuthoredMelodyNote[] },
    sourceRecipe?: ChordMelodyRecipe,
  ) => {
    const command = createSetAuthoredMelodyCommand(
      stepId,
      phrase,
      new Date().toISOString(),
      sourceRecipe,
    );
    store.dispatch(command, applyMelodyCommand);
  };
  const applyPianoRollMelodyEdits = (
    edits: readonly AuthoredMelodyEdit[],
    convertStepIds: readonly string[] = [],
    expectedUpdatedAt?: string,
  ) => {
    try {
      store.dispatch(
        {
          type: "melody/apply-authored-transaction",
          payload: {
            edits,
            convertStepIds,
            expectedUpdatedAt: expectedUpdatedAt ?? store.project.updatedAt,
            nowIso: new Date().toISOString(),
          },
        },
        applyMelodyCommand,
      );
      setDurationResizeStatus(null);
    } catch (error) {
      setDurationResizeStatus(error instanceof Error ? error.message : "Melody edit was rejected.");
    }
  };
  const removeMelodyRecipeForStep = (stepId: string) => {
    const command = createRemoveMelodyRecipeCommand(stepId, new Date().toISOString());
    store.dispatch(command, applyRemoveMelodyRecipe);
  };
  const changeMelodyTrackSettings = (patch: Partial<MelodyTrackSettings>) => {
    const command = createPatchMelodyTrackSettingsCommand(patch, new Date().toISOString());
    store.dispatch(command, applyMelodyTrackSettings);
  };
  const changeHarmonyTrackSettings = (patch: Partial<HarmonyTrackSettings>) => {
    const command = createPatchHarmonyTrackSettingsCommand(patch, new Date().toISOString());
    store.dispatch(command, applyHarmonyTrackSettings);
  };
  const reorderProgressionStep = (stepId: string, targetIndex: number) => {
    const command: ReorderStepCommand = {
      type: "progression/reorder-step",
      payload: { stepId, targetIndex, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, reorderStep);
  };
  const reorderSelectedProgressionStep = (stepId: string, targetIndex: number) => {
    reorderProgressionStep(stepId, targetIndex);
    const restoreFocus = () => {
      const selectedButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-progression-step-select]"),
      ).find((button) => button.dataset.stepId === stepId);
      selectedButton?.focus();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreFocus);
    else restoreFocus();
  };
  const addRest = (duration?: MusicalDuration) => {
    const command: AddRestStepCommand = {
      type: "progression/add-rest",
      payload: {
        stepId: crypto.randomUUID(),
        ...(duration ? { duration } : {}),
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, addRestStep);
  };

  const getProgressionTrailingGap = () =>
    createProgressionMeasureLayout(
      store.project.progression.steps,
      store.project.globalTiming.meter,
    ).measures.at(-1)?.trailingGap;

  const fillProgressionGapWithRest = () => {
    const gap = getProgressionTrailingGap();
    if (gap) addRest(musicalDuration(gap.durationBeats));
  };

  const extendFinalChordToBar = () => {
    const gap = getProgressionTrailingGap();
    const finalStep = store.project.progression.steps.at(-1);
    if (!gap || !finalStep || finalStep.kind !== "chord") return;
    changeStepDuration(
      finalStep.id,
      musicalDuration(addRational(finalStep.duration.beats, gap.durationBeats)),
    );
  };

  const repeatFinalChordToBar = () => {
    const gap = getProgressionTrailingGap();
    const finalStep = store.project.progression.steps.at(-1);
    if (!gap || !finalStep || finalStep.kind !== "chord") return;
    const command: RepeatChordStepCommand = {
      type: "progression/repeat-chord",
      payload: {
        sourceStepId: finalStep.id,
        stepId: crypto.randomUUID(),
        duration: musicalDuration(gap.durationBeats),
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, repeatChordStep);
  };

  const duplicateSystem = (system: ScoreSystem) => {
    const stepIndices = new Set<number>();
    for (const sm of system.measures) {
      for (const frag of sm.measure.fragments) {
        stepIndices.add(frag.stepIndex);
      }
    }
    const stepsToDuplicate = Array.from(stepIndices)
      .sort((a, b) => a - b)
      .map((idx) => project.progression.steps[idx])
      .filter((s): s is ProgressionStep => Boolean(s));
    if (stepsToDuplicate.length === 0) return;
    const command: DuplicateStepsCommand = {
      type: "progression/duplicate-steps",
      payload: { steps: stepsToDuplicate, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, duplicateSteps);
  };

  const deleteSystem = (system: ScoreSystem) => {
    const stepIndices = new Set<number>();
    for (const sm of system.measures) {
      for (const frag of sm.measure.fragments) {
        stepIndices.add(frag.stepIndex);
      }
    }
    const stepIdsToRemove = Array.from(stepIndices)
      .map((idx) => project.progression.steps[idx]?.id)
      .filter((id): id is string => Boolean(id));
    if (stepIdsToRemove.length === 0) return;
    const command: RemoveStepsCommand = {
      type: "progression/remove-steps",
      payload: { stepIds: stepIdsToRemove, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, removeSteps);
  };

  const getSystemStepIds = (system: ScoreSystem): string[] => {
    const stepIndices = new Set<number>();
    for (const sm of system.measures) {
      for (const frag of sm.measure.fragments) {
        stepIndices.add(frag.stepIndex);
      }
    }
    return Array.from(stepIndices)
      .sort((a, b) => a - b)
      .map((idx) => project.progression.steps[idx]?.id)
      .filter((id): id is string => Boolean(id));
  };

  const playFromSystem = (system: ScoreSystem) => {
    const stepIds = getSystemStepIds(system);
    if (stepIds.length === 0) return;
    handlePlayFromHere(stepIds[0]!);
  };

  const toggleLoopSystem = (system: ScoreSystem) => {
    const stepIds = getSystemStepIds(system);
    if (stepIds.length === 0) return;
    const firstId = stepIds[0]!;
    const lastId = stepIds[stepIds.length - 1]!;
    if (
      loopState.enabled &&
      loopState.mode === "range" &&
      loopState.region?.startStepId === firstId &&
      loopState.region?.endStepId === lastId
    ) {
      handleSetLoopMode("disabled");
    } else {
      handleSetLoopRange(firstId, lastId);
    }
  };

  const toggleMuteSystem = (system: ScoreSystem) => {
    setMutedSystemIndices((prev) => {
      const next = new Set(prev);
      if (next.has(system.index)) next.delete(system.index);
      else next.add(system.index);
      return next;
    });
  };

  const toggleSoloSystem = (system: ScoreSystem) => {
    setSoloSystemIndex((prev) => (prev === system.index ? null : system.index));
  };

  const moveSystem = (system: ScoreSystem, direction: -1 | 1) => {
    const targetIndex = system.index + direction;
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );
    const projection = projectScoreSystems(layout, {
      availableWidthPx: 960,
      measuresPerSystem: project.presentation.measuresPerSystem,
    });
    if (targetIndex < 0 || targetIndex >= projection.systems.length) return;

    const currentSystem = projection.systems[system.index]!;
    const targetSystem = projection.systems[targetIndex]!;
    const currentStepIds = new Set(getSystemStepIds(currentSystem));
    const targetStepIds = new Set(getSystemStepIds(targetSystem));

    const currentSteps = project.progression.steps.filter((s) => currentStepIds.has(s.id));
    const targetSteps = project.progression.steps.filter((s) => targetStepIds.has(s.id));

    let newSteps: ProgressionStep[];
    if (direction === -1) {
      const targetFirstIndex = project.progression.steps.findIndex((s) => targetStepIds.has(s.id));
      const before = project.progression.steps
        .slice(0, targetFirstIndex)
        .filter((s) => !currentStepIds.has(s.id));
      const after = project.progression.steps
        .slice(targetFirstIndex)
        .filter((s) => !targetStepIds.has(s.id) && !currentStepIds.has(s.id));
      newSteps = [...before, ...currentSteps, ...targetSteps, ...after];
    } else {
      const currentFirstIndex = project.progression.steps.findIndex((s) =>
        currentStepIds.has(s.id),
      );
      const before = project.progression.steps
        .slice(0, currentFirstIndex)
        .filter((s) => !targetStepIds.has(s.id));
      const after = project.progression.steps
        .slice(currentFirstIndex)
        .filter((s) => !currentStepIds.has(s.id) && !targetStepIds.has(s.id));
      newSteps = [...before, ...targetSteps, ...currentSteps, ...after];
    }

    const command: ReorderStepsCommand = {
      type: "progression/reorder-steps",
      payload: { steps: newSteps, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, reorderSteps);
  };

  const copySystem = (system: ScoreSystem) => {
    const stepIds = new Set(getSystemStepIds(system));
    const stepsToCopy = project.progression.steps
      .filter((s) => stepIds.has(s.id))
      .map((source) => {
        if (source.kind === "rest") return { ...source };
        return {
          ...source,
          performance: snapshotStepPerformance(source.performance),
          ...(source.melody ? { melody: snapshotChordMelody(source.melody) } : {}),
        };
      });
    setCopiedSystemSteps(stepsToCopy);
  };

  const selectedRangeSteps = (stepIds: readonly string[]): ProgressionStep[] => {
    const ids = new Set(stepIds);
    return project.progression.steps.filter((step) => ids.has(step.id));
  };

  const cloneProgressionSteps = (steps: readonly ProgressionStep[]): ProgressionStep[] =>
    steps.map((source) => {
      const id = crypto.randomUUID();
      if (source.kind === "rest") return Object.freeze({ ...source, id });
      return Object.freeze({
        ...source,
        id,
        performance: snapshotStepPerformance(source.performance),
        ...(source.melody ? { melody: snapshotChordMelody(source.melody) } : {}),
        ...(source.explicitSpellingOverrides
          ? { explicitSpellingOverrides: Object.freeze({ ...source.explicitSpellingOverrides }) }
          : {}),
      });
    });

  const copyProgressionRange = (stepIds: readonly string[]) => {
    setCopiedSystemSteps(
      cloneProgressionSteps(selectedRangeSteps(stepIds)).map((step) => ({ ...step })),
    );
  };

  const duplicateProgressionRange = (stepIds: readonly string[]) => {
    const sourceSteps = selectedRangeSteps(stepIds);
    const afterStepId = sourceSteps.at(-1)?.id;
    if (!afterStepId || sourceSteps.length === 0) return;
    const duplicated = cloneProgressionSteps(sourceSteps);
    const command: InsertStepsAfterCommand = {
      type: "progression/insert-steps-after",
      payload: { afterStepId, steps: duplicated, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, insertStepsAfter);
    const lastDuplicatedId = duplicated.at(-1)?.id;
    if (lastDuplicatedId) selectProgressionStep(lastDuplicatedId);
  };

  const deleteProgressionRange = (stepIds: readonly string[]) => {
    const ids = new Set(stepIds);
    const firstIndex = project.progression.steps.findIndex((step) => ids.has(step.id));
    if (firstIndex < 0) return;
    const fallbackStep =
      project.progression.steps.find((step, index) => index > firstIndex && !ids.has(step.id)) ??
      project.progression.steps
        .slice(0, firstIndex)
        .reverse()
        .find((step) => !ids.has(step.id));
    const command: RemoveProgressionRangeCommand = {
      type: "progression/remove-range-harmony",
      payload: { stepIds, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, removeProgressionRange);
    setProgressionSelection(fallbackStep?.id);
  };

  const resetPerformanceProgressionRange = (stepIds: readonly string[]) => {
    const ids = new Set(stepIds);
    const updates = project.progression.steps.flatMap((step) => {
      if (step.kind !== "chord" || !ids.has(step.id)) return [];
      return [
        {
          stepId: step.id,
          patch: {
            performance: {
              articulation: DEFAULT_PIANO_PERFORMANCE.articulation,
              register: DEFAULT_PIANO_PERFORMANCE.register,
              voicingMode: DEFAULT_PIANO_PERFORMANCE.voicingMode,
              bass: DEFAULT_PIANO_PERFORMANCE.bass,
              masterVelocity: DEFAULT_PIANO_PERFORMANCE.masterVelocity,
              perNoteVelocityOverrides: DEFAULT_PIANO_PERFORMANCE.perNoteVelocityOverrides,
            },
          },
        },
      ];
    });
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const playProgressionRange = (stepIds: readonly string[]) => {
    const firstStepId = stepIds[0];
    if (firstStepId) handlePlayFromHere(firstStepId);
  };

  const isLoopingProgressionRange = (stepIds: readonly string[]) =>
    stepIds.length > 0 &&
    loopState.enabled &&
    loopState.mode === "range" &&
    loopState.region?.startStepId === stepIds[0] &&
    loopState.region?.endStepId === stepIds[stepIds.length - 1];

  const toggleProgressionRangeLoop = (stepIds: readonly string[]) => {
    const firstStepId = stepIds[0];
    const lastStepId = stepIds.at(-1);
    if (!firstStepId || !lastStepId) return;
    if (isLoopingProgressionRange(stepIds)) handleSetLoopMode("disabled");
    else handleSetLoopRange(firstStepId, lastStepId);
  };

  const pasteSystemAfter = (system: ScoreSystem) => {
    if (!copiedSystemSteps || copiedSystemSteps.length === 0) return;
    const stepIds = getSystemStepIds(system);
    const afterStepId =
      stepIds[stepIds.length - 1] ??
      project.progression.steps[project.progression.steps.length - 1]?.id;
    if (!afterStepId) return;

    const clonedSteps: ProgressionStep[] = copiedSystemSteps.map((source) => {
      const id = crypto.randomUUID();
      if (source.kind === "rest") {
        return Object.freeze({ ...source, id });
      }
      return Object.freeze({
        ...source,
        id,
        performance: snapshotStepPerformance(source.performance),
        ...(source.melody ? { melody: snapshotChordMelody(source.melody) } : {}),
      });
    });

    const command: InsertStepsAfterCommand = {
      type: "progression/insert-steps-after",
      payload: { afterStepId, steps: clonedSteps, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, insertStepsAfter);
  };

  const insertEmptySystemAfter = (system: ScoreSystem) => {
    const stepIds = getSystemStepIds(system);
    const afterStepId =
      stepIds[stepIds.length - 1] ??
      project.progression.steps[project.progression.steps.length - 1]?.id;
    if (!afterStepId) return;

    const measureCount = Math.max(1, system.measures.length);
    const restDuration = durationBars(1, project.globalTiming.meter);
    const restSteps: RestStep[] = Array.from({ length: measureCount }, () =>
      Object.freeze({
        id: crypto.randomUUID(),
        kind: "rest",
        duration: restDuration,
      }),
    );

    const command: InsertStepsAfterCommand = {
      type: "progression/insert-steps-after",
      payload: { afterStepId, steps: restSteps, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, insertStepsAfter);
  };

  const insertRestAfterSystem = (system: ScoreSystem) => {
    const stepIds = getSystemStepIds(system);
    const afterStepId =
      stepIds[stepIds.length - 1] ??
      project.progression.steps[project.progression.steps.length - 1]?.id;
    if (!afterStepId) {
      addRest();
      return;
    }
    const restStep: RestStep = Object.freeze({
      id: crypto.randomUUID(),
      kind: "rest",
      duration: durationBars(1, project.globalTiming.meter),
    });
    const command: InsertStepsAfterCommand = {
      type: "progression/insert-steps-after",
      payload: { afterStepId, steps: [restStep], nowIso: new Date().toISOString() },
    };
    store.dispatch(command, insertStepsAfter);
  };

  const exploreAlternativeFromSystem = (system: ScoreSystem) => {
    const stepIds = getSystemStepIds(system);
    const lastStepId = stepIds[stepIds.length - 1];
    startExploration(lastStepId);
  };

  const shiftOctaveSystem = (system: ScoreSystem, direction: StaffOctaveDirection) => {
    const stepIds = getSystemStepIds(system);
    const updates: Array<{ stepId: string; patch: StepPatch }> = [];
    for (const id of stepIds) {
      const step = project.progression.steps.find((s) => s.id === id);
      if (step && step.kind === "chord") {
        const patch = performanceOctaveShiftPatch(step.performance, direction);
        if (patch) {
          updates.push({ stepId: id, patch: { performance: patch } });
        }
      }
    }
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const resetPerformanceSystem = (system: ScoreSystem) => {
    const stepIds = getSystemStepIds(system);
    const updates: Array<{ stepId: string; patch: StepPatch }> = [];
    for (const id of stepIds) {
      const step = project.progression.steps.find((s) => s.id === id);
      if (step && step.kind === "chord") {
        updates.push({
          stepId: id,
          patch: {
            performance: {
              articulation: DEFAULT_PIANO_PERFORMANCE.articulation,
              register: DEFAULT_PIANO_PERFORMANCE.register,
              voicingMode: DEFAULT_PIANO_PERFORMANCE.voicingMode,
              bass: DEFAULT_PIANO_PERFORMANCE.bass,
              masterVelocity: DEFAULT_PIANO_PERFORMANCE.masterVelocity,
              perNoteVelocityOverrides: DEFAULT_PIANO_PERFORMANCE.perNoteVelocityOverrides,
            },
          },
        });
      }
    }
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const setArticulationSystem = (system: ScoreSystem, articulation: PianoArticulation) => {
    const stepIds = getSystemStepIds(system);
    const updates = stepIds.flatMap((id) => {
      const step = project.progression.steps.find((s) => s.id === id);
      if (step && step.kind === "chord") {
        return [{ stepId: id, patch: { performance: { articulation } } }];
      }
      return [];
    });
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const applyMelodyContourSystem = (system: ScoreSystem, motion: MelodyPitchMotion) => {
    const stepIds = getSystemStepIds(system);
    const existingStepWithMelody = stepIds
      .map((id) => project.progression.steps.find((s) => s.id === id))
      .find((s): s is ChordStep => Boolean(s && s.kind === "chord" && s.melody !== undefined));
    const fallbackGrid = existingStepWithMelody?.melody
      ? validateChordMelodyRecipe(existingStepWithMelody.melody).grid
      : "eighth";

    const updates = stepIds.flatMap((id) => {
      const step = project.progression.steps.find((s) => s.id === id);
      if (step && step.kind === "chord") {
        const newMelody: ChordMelodyRecipe = step.melody
          ? { ...validateChordMelodyRecipe(step.melody), pitchMotion: motion }
          : {
              pitchMotion: motion,
              rhythm: "even",
              connection: "retrigger",
              grid: fallbackGrid,
              octaveOffset: 0,
            };
        return [{ stepId: id, patch: { melody: newMelody } }];
      }
      return [];
    });
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const setMelodyGridSystem = (system: ScoreSystem, grid: MelodyGrid) => {
    const stepIds = getSystemStepIds(system);
    const updates = stepIds.flatMap((id) => {
      const step = project.progression.steps.find((s) => s.id === id);
      if (step && step.kind === "chord") {
        const newMelody: ChordMelodyRecipe = step.melody
          ? { ...validateChordMelodyRecipe(step.melody), grid }
          : {
              pitchMotion: "up",
              rhythm: "even",
              connection: "retrigger",
              grid,
              octaveOffset: 0,
            };
        return [{ stepId: id, patch: { melody: newMelody } }];
      }
      return [];
    });
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const clearMelodySystem = (system: ScoreSystem) => {
    const stepIds = getSystemStepIds(system);
    const updates = stepIds.flatMap((id) => {
      const step = project.progression.steps.find((s) => s.id === id);
      if (step && step.kind === "chord" && step.melody !== undefined) {
        return [{ stepId: id, patch: { melody: null } }];
      }
      return [];
    });
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const handleProgressionHeadingContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, select, input, textarea, a")) {
      return;
    }
    event.preventDefault();
    setProgressionMenu({
      anchor: event.currentTarget,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  const shiftOctaveAll = (direction: StaffOctaveDirection) => {
    const updates: Array<{ stepId: string; patch: StepPatch }> = [];
    for (const step of project.progression.steps) {
      if (step.kind === "chord") {
        const patch = performanceOctaveShiftPatch(step.performance, direction);
        if (patch) {
          updates.push({ stepId: step.id, patch: { performance: patch } });
        }
      }
    }
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const applyMelodyContourAll = (motion: MelodyPitchMotion) => {
    const existingStepWithMelody = project.progression.steps.find((s): s is ChordStep =>
      Boolean(s && s.kind === "chord" && s.melody !== undefined),
    );
    const fallbackGrid = existingStepWithMelody?.melody
      ? validateChordMelodyRecipe(existingStepWithMelody.melody).grid
      : "eighth";

    const updates = project.progression.steps.flatMap((step) => {
      if (step.kind === "chord") {
        const newMelody: ChordMelodyRecipe = step.melody
          ? { ...validateChordMelodyRecipe(step.melody), pitchMotion: motion }
          : {
              pitchMotion: motion,
              rhythm: "even",
              connection: "retrigger",
              grid: fallbackGrid,
              octaveOffset: 0,
            };
        return [{ stepId: step.id, patch: { melody: newMelody } }];
      }
      return [];
    });

    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const setMelodyGridAll = (grid: MelodyGrid) => {
    const existingStepWithMelody = project.progression.steps.find((s): s is ChordStep =>
      Boolean(s && s.kind === "chord" && s.melody !== undefined),
    );
    const fallbackMotion = existingStepWithMelody?.melody
      ? validateChordMelodyRecipe(existingStepWithMelody.melody).pitchMotion
      : "up";

    const updates = project.progression.steps.flatMap((step) => {
      if (step.kind === "chord") {
        const newMelody: ChordMelodyRecipe = step.melody
          ? { ...validateChordMelodyRecipe(step.melody), grid }
          : {
              pitchMotion: fallbackMotion,
              rhythm: "even",
              connection: "retrigger",
              grid,
              octaveOffset: 0,
            };
        return [{ stepId: step.id, patch: { melody: newMelody } }];
      }
      return [];
    });

    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const clearMelodyAll = () => {
    const updates = project.progression.steps.flatMap((step) => {
      if (step.kind === "chord" && step.melody !== undefined) {
        return [{ stepId: step.id, patch: { melody: null } }];
      }
      return [];
    });
    if (updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const setArticulationAll = (articulation: PianoArticulation) => {
    batchEditProgressionPerformance({ articulation });
  };

  const handleApplyVoiceLeading = (strategy: VoiceLeadingStrategy) => {
    const result = optimizeProgressionVoiceLeading(
      project.progression.steps,
      project.tonic,
      modeForModule(project.activeModule),
      strategy,
    );
    if (result.updates.length === 0) return;
    const command: BatchPatchStepsCommand = {
      type: "progression/batch-patch-steps",
      payload: { updates: result.updates, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, batchPatchSteps);
  };

  const duplicateAllSteps = () => {
    if (project.progression.steps.length === 0) return;
    const command: DuplicateStepsCommand = {
      type: "progression/duplicate-steps",
      payload: {
        steps: project.progression.steps,
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, duplicateSteps);
  };

  const clearAllProgressionSteps = () => {
    if (project.progression.steps.length === 0) return;
    const command: RemoveStepsCommand = {
      type: "progression/remove-steps",
      payload: {
        stepIds: project.progression.steps.map((s) => s.id),
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, removeSteps);
  };

  const unmuteAllSystems = () => {
    setMutedSystemIndices(new Set());
  };

  const clearAllSolos = () => {
    setSoloSystemIndex(null);
  };

  const toggleLoopProgression = () => {
    if (loopState.enabled && loopState.mode === "all") {
      handleSetLoopMode("disabled");
    } else {
      handleSetLoopMode("all");
    }
  };

  const isSystemLooping = (system: ScoreSystem): boolean => {
    if (!loopState.enabled || loopState.mode !== "range" || !loopState.region) return false;
    const stepIds = getSystemStepIds(system);
    if (stepIds.length === 0) return false;
    return (
      loopState.region.startStepId === stepIds[0] &&
      loopState.region.endStepId === stepIds[stepIds.length - 1]
    );
  };

  const isSystemMuted = (system: ScoreSystem): boolean => {
    if (soloSystemIndex !== null) return system.index !== soloSystemIndex;
    return mutedSystemIndices.has(system.index);
  };

  const isSystemSolo = (system: ScoreSystem): boolean => {
    return soloSystemIndex === system.index;
  };

  const globalView = (view: CardViewId) => {
    const command: SetGlobalCardViewCommand = {
      type: "matrix/set-global-card-view",
      payload: { view, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setGlobalCardView);

    if (view === "guitar") {
      void ensureGuitarProvider()
        .prepare()
        .catch(() => {});
      if (
        project.presentation.progressionView === "harmonic" ||
        project.presentation.progressionView === "piano"
      ) {
        changeProgressionView("tablature");
      }
    }
  };
  const changeTheme = (theme: ThemeMode) => {
    if (theme === project.presentation.theme) return;
    const command: SetThemeCommand = {
      type: "presentation/set-theme",
      payload: { theme, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setTheme);
  };
  const changeExpertiseMode = (expertiseMode: PresentationMode) => {
    if (expertiseMode === project.presentation.expertiseMode) return;
    const command: SetExpertiseModeCommand = {
      type: "presentation/set-expertise-mode",
      payload: { expertiseMode, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setExpertiseMode);
  };
  const changeStaffBassVisibility = (visible: boolean) => {
    if (visible === project.presentation.showBassInStaff) return;
    const command: SetStaffBassVisibilityCommand = {
      type: "presentation/set-staff-bass-visibility",
      payload: { visible, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setStaffBassVisibility);
  };
  const changeMeasuresPerSystem = (measuresPerSystem: MeasuresPerSystem) => {
    if (measuresPerSystem === project.presentation.measuresPerSystem) return;
    const command: SetMeasuresPerSystemCommand = {
      type: "presentation/set-measures-per-system",
      payload: { measuresPerSystem, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setMeasuresPerSystem);
  };
  const changeNoteColorMode = (mode: NoteColorMode) => {
    if (mode === project.presentation.noteColorMode) return;
    const command: SetNoteColorModeCommand = {
      type: "presentation/set-note-color-mode",
      payload: { mode, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setNoteColorMode);
  };
  const changeSuzukiColors = (enabled: boolean) =>
    changeNoteColorMode(enabled ? "suzuki" : "standard");
  const changeResolutionArrows = (enabled: boolean) => {
    if (enabled === (project.presentation.resolutionArrows !== false)) return;
    const command: SetResolutionArrowsCommand = {
      type: "presentation/set-resolution-arrows",
      payload: { enabled, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setResolutionArrows);
  };
  const changeGenreFocus = (genre: GenreFocusId) => {
    if (genre === (project.presentation.genreFocus ?? "all")) return;
    const command: SetGenreFocusCommand = {
      type: "presentation/set-genre-focus",
      payload: { genre, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setGenreFocus);
  };
  const changeGuitarChordOrientation = (orientation: "vertical" | "horizontal") => {
    if (orientation === (project.presentation.guitarChordOrientation ?? "vertical")) return;
    const command: SetGuitarChordOrientationCommand = {
      type: "presentation/set-guitar-chord-orientation",
      payload: { orientation, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setGuitarChordOrientation);
  };
  const changeSidePanelMode = (mode: "fixed" | "autohide") => {
    if (mode === (project.presentation.sidePanelMode ?? "fixed")) return;
    const command: SetSidePanelModeCommand = {
      type: "presentation/set-side-panel-mode",
      payload: { mode, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setSidePanelMode);
  };
  const applyModuleSwitch = (
    destinationModule: HarmonicModuleId,
    resolutions: Readonly<Record<string, HarmonicFunctionIdentity | "keep-original">>,
  ) => {
    const command: SwitchModuleCommand = {
      type: "harmony/switch-module",
      payload: { destinationModule, resolutions, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, switchModule);
    store.clearMatrixPreview();
    setPendingSwitch(null);
  };
  const changeTonic = (tonic: number) => {
    const command: SetTonicCommand = {
      type: "harmony/set-tonic",
      payload: { tonic, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setTonic);
  };
  const requestModuleSwitch = (destinationModule: HarmonicModuleId) => {
    if (destinationModule === project.activeModule) return;
    const plan = planModuleSwitch(project.progression.steps, destinationModule);
    if (plan.hasAmbiguities) setPendingSwitch(plan);
    else applyModuleSwitch(destinationModule, Object.freeze({}));
  };
  const startExploration = (originStepId?: string) => {
    const command: StartBranchCommand = {
      type: "branch/start",
      payload: {
        branchId: crypto.randomUUID(),
        ...(originStepId ? { originStepId } : {}),
        compositionIntent: "neutral",
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, startBranch);
    store.clearMatrixPreview();
  };
  const setRejoin = (rejoinStepId?: string) => {
    const command: SetBranchRejoinCommand = {
      type: "branch/set-rejoin",
      payload: { ...(rejoinStepId ? { rejoinStepId } : {}), nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setBranchRejoinCommand);
  };
  const commitWhole = () => {
    const command: CommitBranchCommand = {
      type: "branch/commit",
      payload: { nowIso: new Date().toISOString() },
    };
    store.dispatch(command, commitBranchCommand);
  };
  const commitSelected = () => {
    const command: CommitBranchCommand = {
      type: "branch/commit",
      payload: { selectedBranchStepIds, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, commitBranchCommand);
  };
  const discard = () => {
    const command: DiscardBranchCommand = {
      type: "branch/discard",
      payload: { nowIso: new Date().toISOString() },
    };
    store.dispatch(command, discardBranch);
  };
  const changeIntent = (compositionIntent: CompositionIntent) => {
    const command: SetBranchIntentCommand = {
      type: "branch/set-intent",
      payload: { compositionIntent, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setBranchIntent);
  };

  const getPlaybackController = () => {
    const harmonyProvider = getActiveHarmonyProvider();
    if (!harmonyProvider) return null;
    const melodyProvider = hasMelodyRecipe ? ensureMelodyProvider() : null;
    if (
      playbackControllerRef.current &&
      playbackControllerProviderRef.current !== harmonyProvider &&
      transportStore.getState().status === "stopped"
    ) {
      playbackControllerRef.current.stop();
      playbackControllerRef.current = null;
      playbackControllerProviderRef.current = null;
    }
    if (!playbackControllerRef.current) {
      const clock = harmonyProvider.clock;
      const metronomeContext = audioProviderRef.current?.audioCtx ?? sharedAudioContextRef.current;
      const metronomeProvider = metronomeContext
        ? new MetronomeClickProvider(metronomeContext)
        : undefined;
      playbackControllerRef.current = new PlaybackController({
        clock,
        pianoProvider: harmonyProvider,
        ...(melodyProvider ? { melodyProvider } : {}),
        metronomeProvider,
        onMelodyError: (error) => {
          setMelodyAudioError(error instanceof Error ? error.message : String(error));
        },
        transportStore,
      });
      playbackControllerProviderRef.current = harmonyProvider;
    }
    return playbackControllerRef.current;
  };

  const stopMelodyPreview = useCallback(() => {
    melodyPreviewRequestRef.current += 1;
    melodyPreviewAuditionControllerRef.current?.stop();
    if (melodyPreviewStopTimerRef.current !== null) {
      clearTimeout(melodyPreviewStopTimerRef.current);
      melodyPreviewStopTimerRef.current = null;
    }
    setIsMelodyPreviewPlaying(false);
  }, []);

  const playMelodyPreview = useCallback(
    async (previewProject: Project) => {
      const provider = ensureMelodyProvider();
      const requestId = ++melodyPreviewRequestRef.current;
      const mode = getHarmonicModule(previewProject.activeModule).mode;
      const projection = realizeProgressionMelodyPerformance({
        steps: previewProject.progression.steps,
        tonic: previewProject.tonic,
        context: {
          tonic: previewProject.tonic,
          mode,
          moduleId: previewProject.activeModule,
          spellingContext: { tonic: previewProject.tonic, mode },
        },
        tempoBpm: previewProject.globalTiming.tempoBpm,
        groove: { feel: "straight", swingAmount: 0 },
        melodyTrack: previewProject.melodyTrack,
      });
      if (projection.events.length === 0) {
        setMelodyAudioError(null);
        return;
      }
      const firstStartSeconds = projection.events[0]?.startSeconds ?? 0;
      const previewEvents = projection.events.map((event) =>
        Object.freeze({
          ...event,
          startSeconds: event.startSeconds - firstStartSeconds,
        }),
      );
      const previewInstruments = Object.freeze([
        ...new Set(previewEvents.map((event) => event.instrument)),
      ]);
      let preparation: MelodyPreparationResult;
      try {
        preparation = await provider.prepareForInstruments(previewInstruments);
      } catch (error) {
        if (melodyPreviewRequestRef.current === requestId) {
          setIsMelodyPreviewPlaying(false);
          setMelodyAudioError(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      if (melodyPreviewRequestRef.current !== requestId) return;
      applyMelodyPreparationResult(preparation);
      const readyInstruments = new Set(preparation.ready);
      const playableEvents = previewEvents.filter((event) =>
        readyInstruments.has(event.instrument),
      );
      if (playableEvents.length === 0) {
        setIsMelodyPreviewPlaying(false);
        return;
      }
      provider.setPreviewSettings(playableEvents[0]!.instrument, previewProject.melodyTrack.volume);
      const playback = getMelodyPreviewAuditionController()?.audition(playableEvents);
      if (!playback) return;
      setIsMelodyPreviewPlaying(true);
      if (melodyPreviewStopTimerRef.current !== null) {
        clearTimeout(melodyPreviewStopTimerRef.current);
      }
      const durationSeconds = playableEvents.reduce(
        (latest, event) => Math.max(latest, event.startSeconds + event.durationSeconds),
        0,
      );
      melodyPreviewStopTimerRef.current = setTimeout(
        () => {
          melodyPreviewStopTimerRef.current = null;
          setIsMelodyPreviewPlaying(false);
        },
        Math.max(1, Math.ceil(durationSeconds * 1000)),
      );
    },
    [applyMelodyPreparationResult, ensureMelodyProvider, getMelodyPreviewAuditionController],
  );

  const mutedStepIds = useMemo<ReadonlySet<string>>(() => {
    if (mutedSystemIndices.size === 0 && soloSystemIndex === null) {
      return new Set();
    }
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );
    const projection = projectScoreSystems(layout, {
      availableWidthPx: 960,
      measuresPerSystem: project.presentation.measuresPerSystem,
    });
    const ids = new Set<string>();
    projection.systems.forEach((sys) => {
      const isMuted =
        soloSystemIndex !== null
          ? sys.index !== soloSystemIndex
          : mutedSystemIndices.has(sys.index);
      if (isMuted) {
        for (const sm of sys.measures) {
          for (const frag of sm.measure.fragments) {
            const step = project.progression.steps[frag.stepIndex];
            if (step) ids.add(step.id);
          }
        }
      }
    });
    return ids;
  }, [
    mutedSystemIndices,
    soloSystemIndex,
    project.progression.steps,
    project.globalTiming.meter,
    project.presentation.measuresPerSystem,
  ]);

  const handlePlay = () => {
    clearPianoRollAuditionPlayhead();
    clearStepPreviewHighlights();
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
    closeProgressionStepEditors();
    const controller = getPlaybackController();
    if (!controller) return;
    controller.start({
      steps: project.progression.steps,
      meter: project.globalTiming.meter,
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
      tonic: project.tonic,
      context: {
        tonic: project.tonic,
        mode: getHarmonicModule(project.activeModule).mode,
        moduleId: project.activeModule,
        spellingContext: {
          tonic: project.tonic,
          mode: getHarmonicModule(project.activeModule).mode,
        },
      },
      loopState,
      metronomeEnabled,
      countInEnabled,
      harmonyTrack: project.harmonyTrack,
      melodyTrack: project.melodyTrack,
      mutedStepIds,
    });
  };

  const handlePlayFromHere = (stepId: string) => {
    clearPianoRollAuditionPlayhead();
    clearStepPreviewHighlights();
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
    closeProgressionStepEditors();
    const controller = getPlaybackController();
    if (!controller) return;
    controller.playFromHere(stepId, {
      steps: project.progression.steps,
      meter: project.globalTiming.meter,
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
      tonic: project.tonic,
      context: {
        tonic: project.tonic,
        mode: getHarmonicModule(project.activeModule).mode,
        moduleId: project.activeModule,
        spellingContext: {
          tonic: project.tonic,
          mode: getHarmonicModule(project.activeModule).mode,
        },
      },
      loopState,
      metronomeEnabled,
      countInEnabled,
      harmonyTrack: project.harmonyTrack,
      melodyTrack: project.melodyTrack,
      mutedStepIds,
    });
  };

  const handlePause = () => {
    playbackControllerRef.current?.pause();
  };

  const handleResume = () => {
    closeProgressionStepEditors();
    playbackControllerRef.current?.resume();
  };

  const handleStop = () => {
    clearPianoRollAuditionPlayhead();
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
    playbackControllerRef.current?.stop();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const shortcutProtected = isAppShortcutProtectedTarget(e.target);
      if (
        !shortcutProtected &&
        !e.repeat &&
        !e.altKey &&
        !e.defaultPrevented &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        openQuickChordPalette();
        return;
      }
      if (e.key === "Escape" && !shortcutProtected && !e.repeat && !e.defaultPrevented) {
        if (
          isHelpOpen ||
          isFingeringLegendOpen ||
          voicingEditorOpen ||
          presetsPanelOpen ||
          savePresetDialogOpen ||
          Boolean(pendingSwitch)
        ) {
          return;
        }
        if (
          e.target instanceof Element &&
          e.target
            .closest(".progression-track")
            ?.querySelector('[data-testid="range-selection-toolbar"]')
        ) {
          return;
        }
        if (
          project.progression.selectedStepId &&
          !document.activeElement?.closest(".selected-step-stack")
        ) {
          e.preventDefault();
          setProgressionSelection();
          return;
        }
        if (settingsFunctionId || store.matrixSession.previewFunctionId) {
          e.preventDefault();
          clearMatrixSelection();
          return;
        }
      }

      if (e.key === "F1") {
        e.preventDefault();
        setIsHelpOpen(true);
        setHelpInitialTab("overview");
        return;
      }

      const preservesNativeTextUndo =
        e.target instanceof Element &&
        Boolean(
          e.target.closest(
            'textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], input:not([type="hidden"]):not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])',
          ),
        );
      const undoShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey;
      const redoShortcut =
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y");
      if ((undoShortcut || redoShortcut) && !preservesNativeTextUndo) {
        if (getPianoRollGesture()) setPianoRollGesture(null);
        const canApply = undoShortcut ? store.canUndo : store.canRedo;
        if (canApply) {
          e.preventDefault();
          if (undoShortcut) store.undo();
          else store.redo();
        }
        return;
      }

      if (shortcutProtected) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (getPianoRollGesture()) setPianoRollGesture(null);
        if (store.canUndo) {
          e.preventDefault();
          store.undo();
        }
        return;
      }

      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")
      ) {
        if (getPianoRollGesture()) setPianoRollGesture(null);
        if (store.canRedo) {
          e.preventDefault();
          store.redo();
        }
        return;
      }

      if (
        (e.code !== "Space" && e.key !== " ") ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return;
      }

      // Keep Space available for native control activation and text editing.
      if (
        e.target instanceof Element &&
        e.target.closest(
          'button, input, textarea, select, a, [contenteditable="true"], [role="button"], [role="textbox"]',
        )
      ) {
        return;
      }

      e.preventDefault();
      if (transportState.status === "playing") {
        handlePause();
      } else if (transportState.status === "paused") {
        handleResume();
      } else {
        handlePlay();
      }
    };

    // Capture shortcuts before native controls such as select elements consume
    // Ctrl/Cmd+Z for their own ephemeral value history.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    clearMatrixSelection,
    handlePause,
    handlePlay,
    handleResume,
    openQuickChordPalette,
    pendingSwitch,
    presetsPanelOpen,
    savePresetDialogOpen,
    settingsFunctionId,
    store,
    transportState.status,
    voicingEditorOpen,
  ]);

  const changeTempo = (tempoBpm: number) => {
    const command: SetTempoCommand = {
      type: "timing/set-tempo",
      payload: { tempoBpm, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setTempo);
  };

  const changeMeter = (newMeter: Meter, policy: MeterChangePolicy) => {
    const command: SetMeterCommand = {
      type: "timing/set-meter",
      payload: { meter: newMeter, policy, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setMeter);
  };

  const changeGroove = (groove: GrooveSettings) => {
    const command: SetGrooveCommand = {
      type: "timing/set-groove",
      payload: { groove, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setGroove);
  };

  const changeStepDuration = (stepId: string, duration: MusicalDuration) => {
    const command = createSetStepDurationCommand(stepId, duration, new Date().toISOString());
    store.dispatch(command, setStepDuration);
  };

  const handleSetLoopMode = (mode: LoopMode) => {
    setLoopState((prev) => setLoopMode(prev, mode, project.progression.steps));
  };

  const handleSetLoopRange = (startStepId: string, endStepId: string) => {
    try {
      setLoopState(setLoopRange(startStepId, endStepId, project.progression.steps));
    } catch {
      // Ignore invalid ranges
    }
  };

  const handleSaveCustomPreset = (name: string) => {
    const command: SaveCustomPresetCommand = {
      type: "presets/save-custom",
      payload: { name, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, saveCustomPreset);
  };

  const handleDeleteCustomPreset = (presetId: string) => {
    const command: DeleteCustomPresetCommand = {
      type: "presets/delete-custom",
      payload: { presetId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, deleteCustomPreset);
  };

  const handleApplyPreset = (preset: FunctionalPreset, mode: PresetApplyMode) => {
    stopAuditionPreset();
    const command: ApplyPresetCommand = {
      type: "presets/apply",
      payload: { preset, mode, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, applyPreset);
    setApplyDialogPreset(null);
    setPresetsPanelOpen(false);
  };

  const runProjectAction = async (action: () => Promise<unknown>): Promise<void> => {
    setProjectBusy(true);
    setProjectError(null);
    try {
      await action();
      await refreshProjectList();
    } catch (error) {
      setProjectError(formatProjectOperationError(error));
      throw error;
    } finally {
      setProjectBusy(false);
    }
  };

  const handleNewProject = async (name: string) => {
    openTabsUserChangedRef.current = true;
    await runProjectAction(() => projectController.createNewProject(name));
  };
  const handleOpenProject = async (id: string) => {
    openTabsUserChangedRef.current = true;
    await runProjectAction(() => projectController.openNamedProject(id));
    setOpenProjectIds((current) => (current.includes(id) ? current : [...current, id]));
  };
  const handleRenameProject = (name: string) =>
    runProjectAction(() => projectController.renameActiveProject(name));
  const handleDeleteProject = (id: string) =>
    runProjectAction(() => projectController.deleteProject(id));
  const handleSaveProjectAs = (name: string) =>
    runProjectAction(() => projectController.saveProjectAs(name));
  const handleOpenProjectFile = async (text: string) => {
    openTabsUserChangedRef.current = true;
    await runProjectAction(() => projectController.openPortableProject(text));
  };
  const handleCloseProjectTab = (id: string) => {
    if (openProjectIds.length <= 1) return;
    const index = openProjectIds.indexOf(id);
    if (index < 0) return;
    openTabsUserChangedRef.current = true;
    const nextIds = openProjectIds.filter((tabId) => tabId !== id);
    setOpenProjectIds(nextIds);
    if (id === project.id) {
      const fallbackId = nextIds[Math.min(index, nextIds.length - 1)];
      if (fallbackId) void handleOpenProject(fallbackId);
    }
  };

  const chordStepsAll = project.progression.steps.filter((s): s is ChordStep => s.kind === "chord");
  const canShiftOctaveUpAll = chordStepsAll.some(
    (s) => performanceOctaveShiftPatch(s.performance, 1) !== null,
  );
  const canShiftOctaveDownAll = chordStepsAll.some(
    (s) => performanceOctaveShiftPatch(s.performance, -1) !== null,
  );
  const currentArticulationAll =
    chordStepsAll.length > 0 &&
    chordStepsAll.every(
      (s) => s.performance.articulation === chordStepsAll[0]?.performance.articulation,
    )
      ? chordStepsAll[0]?.performance.articulation
      : undefined;

  const melodyStepsAll = chordStepsAll.filter((s) => s.melody !== undefined);
  const hasMelodyAll = melodyStepsAll.length > 0;
  const currentPitchMotionAll =
    hasMelodyAll &&
    melodyStepsAll.every((s) => {
      const motion = generatedMelodyRecipe(s.melody)?.pitchMotion;
      const firstMotion = generatedMelodyRecipe(melodyStepsAll[0]?.melody)?.pitchMotion;
      return motion === firstMotion;
    })
      ? generatedMelodyRecipe(melodyStepsAll[0]?.melody)?.pitchMotion
      : undefined;

  const currentGridAll =
    hasMelodyAll &&
    melodyStepsAll.every(
      (s) =>
        generatedMelodyRecipe(s.melody)?.grid ===
        generatedMelodyRecipe(melodyStepsAll[0]?.melody)?.grid,
    )
      ? generatedMelodyRecipe(melodyStepsAll[0]?.melody)?.grid
      : undefined;

  const progressionMeasureLayout = createProgressionMeasureLayout(
    project.progression.steps,
    project.globalTiming.meter,
  );
  const progressionMeasureCount = progressionMeasureLayout.measures.length;

  if (!projectReady) {
    return (
      <main className="app-shell">
        <header className="app-header">
          <strong>CadenceFlow</strong>
          <span>Restoring last project…</span>
        </header>
        <section className="bootstrap-panel" aria-live="polite">
          <h1>Opening your studio</h1>
          <p>Checking the last active project and preparing a fresh session history.</p>
        </section>
      </main>
    );
  }

  const currentPlayingStepIndex =
    transportState.currentStepIndex ??
    (previewPlayingStepId
      ? project.progression.steps.findIndex((step) => step.id === previewPlayingStepId)
      : null);
  const currentPlayingStep =
    currentPlayingStepIndex !== null && currentPlayingStepIndex !== undefined
      ? project.progression.steps[currentPlayingStepIndex]
      : null;
  const currentPlayingFunctionId =
    currentPlayingStep?.kind === "chord"
      ? currentPlayingStep.harmonicFunction.functionId
      : undefined;
  const alternativesOriginIndex = alternativesSession
    ? alternativesSession.sourceProject.progression.steps.findIndex(
        (step) => step.id === alternativesSession.snapshot.originStepId,
      )
    : -1;
  const alternativesOriginStep =
    alternativesOriginIndex >= 0
      ? alternativesSession?.sourceProject.progression.steps[alternativesOriginIndex]
      : undefined;
  const alternativesOriginLabel =
    alternativesOriginStep?.kind === "chord"
      ? `${alternativesOriginStep.harmonicFunction.functionId} · Step ${alternativesOriginIndex + 1}`
      : "selected Step";

  const auditionPianoRollRange = (startBeat: number, endBeat: number) => {
    const current = store.project;
    const tempo = current.globalTiming.tempoBpm;
    if (endBeat <= startBeat) return;
    clearPianoRollAuditionPlayhead();
    const requestId = ++pianoRollAuditionRequestRef.current;
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
    let playheadStarted = false;
    const onScheduled = (playback: ScheduledPlayback, clock: AudioClock) => {
      if (pianoRollAuditionRequestRef.current !== requestId || playheadStarted) return;
      playheadStarted = true;
      startPianoRollAuditionPlayhead(requestId, startBeat, endBeat, playback, clock);
    };
    const secondsPerBeat = 60 / tempo;
    const mode = getHarmonicModule(current.activeModule).mode;
    const context = {
      tonic: current.tonic,
      mode,
      moduleId: current.activeModule,
      spellingContext: { tonic: current.tonic, mode },
    };
    const harmonyAllowed =
      !current.harmonyTrack.muted && (!current.melodyTrack.solo || current.harmonyTrack.solo);
    const melodyAllowed =
      !current.melodyTrack.muted && (!current.harmonyTrack.solo || current.melodyTrack.solo);
    const isPianoTrack =
      current.harmonyTrack.instrument === "piano" || current.harmonyTrack.instrument === "gm-000";
    const isSoundFont = !isPianoTrack || current.harmonyTrack.pianoEngine === "soundfont";
    const soundFontInstrument = isPianoTrack
      ? (current.harmonyTrack.pianoSoundfontInstrument ?? "gm-000")
      : current.harmonyTrack.instrument;
    const harmony = harmonyAllowed
      ? realizeProgressionAudioEvents({
          steps: current.progression.steps,
          tonic: current.tonic,
          context,
          tempoBpm: tempo,
          groove: current.groove,
        })
          .filter((event) => {
            const start = event.startSeconds / secondsPerBeat;
            const end = start + event.durationSeconds / secondsPerBeat;
            const step =
              typeof event.stepIndex === "number"
                ? current.progression.steps[event.stepIndex]
                : undefined;
            return start < endBeat && end > startBeat && (!step || !mutedStepIds.has(step.id));
          })
          .map((event) => {
            const start = event.startSeconds / secondsPerBeat;
            const end = start + event.durationSeconds / secondsPerBeat;
            return {
              ...event,
              startSeconds: (Math.max(start, startBeat) - startBeat) * secondsPerBeat,
              durationSeconds:
                (Math.min(end, endBeat) - Math.max(start, startBeat)) * secondsPerBeat,
              ...(isSoundFont ? { instrument: soundFontInstrument } : {}),
            };
          })
      : [];
    if (harmony.length) getPreviewAuditionController()?.audition(harmony, onScheduled);
    if (melodyAllowed) {
      const projection = realizeProgressionMelodyPerformance({
        steps: current.progression.steps,
        tonic: current.tonic,
        context,
        tempoBpm: tempo,
        groove: current.groove,
        melodyTrack: current.melodyTrack,
      });
      const events = projection.events
        .filter((event) => {
          const start = rationalToNumber(event.startBeats);
          const end = start + rationalToNumber(event.durationBeats);
          return start < endBeat && end > startBeat && !mutedStepIds.has(event.sourceStepId);
        })
        .map((event) => {
          const start = rationalToNumber(event.startBeats);
          const end = start + rationalToNumber(event.durationBeats);
          const clippedStart = Math.max(start, startBeat);
          const clippedEnd = Math.min(end, endBeat);
          return {
            ...event,
            startSeconds: (clippedStart - startBeat) * secondsPerBeat,
            durationSeconds: (clippedEnd - clippedStart) * secondsPerBeat,
          };
        });
      if (events.length) {
        const provider = ensureMelodyProvider();
        const instruments = [...new Set(events.map((event) => event.instrument))];
        void provider
          .prepareForInstruments(instruments)
          .then((result) => {
            if (pianoRollAuditionRequestRef.current !== requestId) return;
            if (!result.ready.length) return;
            events
              .filter((event) => result.ready.includes(event.instrument))
              .forEach((event) =>
                provider.setPreviewSettings(event.instrument, current.melodyTrack.volume),
              );
            getMelodyPreviewAuditionController()?.audition(
              events.filter((event) => result.ready.includes(event.instrument)),
              onScheduled,
            );
          })
          .catch(() => undefined);
      }
    }
  };

  const auditionPianoRollMeasure = (
    measure: import("../domain/timing/measureLayout").ProgressionMeasure,
  ) =>
    auditionPianoRollRange(
      rationalToNumber(measure.startBeats),
      rationalToNumber(measure.endBeats),
    );

  const auditionPianoRollChord = (stepId: string) => {
    const current = store.project;
    const audition = realizePianoRollChordAudition(current, stepId);
    if (!audition) {
      clearPianoRollAuditionPlayhead();
      previewAuditionControllerRef.current?.stop();
      melodyPreviewAuditionControllerRef.current?.stop();
      return;
    }
    const { startBeat, endBeat } = audition;
    clearPianoRollAuditionPlayhead();
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
    const requestId = ++pianoRollAuditionRequestRef.current;
    if (
      endBeat <= startBeat ||
      current.harmonyTrack.muted ||
      (current.melodyTrack.solo && !current.harmonyTrack.solo) ||
      mutedStepIds.has(stepId)
    )
      return;
    let playheadStarted = false;
    const onScheduled = (playback: ScheduledPlayback, clock: AudioClock) => {
      if (pianoRollAuditionRequestRef.current !== requestId || playheadStarted) return;
      playheadStarted = true;
      startPianoRollAuditionPlayhead(requestId, startBeat, endBeat, playback, clock);
    };
    const isPianoTrack =
      current.harmonyTrack.instrument === "piano" || current.harmonyTrack.instrument === "gm-000";
    const instrument = isPianoTrack
      ? (current.harmonyTrack.pianoSoundfontInstrument ?? "gm-000")
      : current.harmonyTrack.instrument;
    const events = audition.events.map((event) => ({
      ...event,
      ...(isPianoTrack && current.harmonyTrack.pianoEngine !== "soundfont" ? {} : { instrument }),
    }));
    if (!events.length) return;
    if (
      current.harmonyTrack.instrument === "piano" ||
      current.harmonyTrack.instrument === "gm-000"
    ) {
      if (current.harmonyTrack.pianoEngine === "soundfont") {
        void ensureHarmonySoundFontProvider()
          .prepareForInstruments([instrument])
          .then((result) => {
            if (
              pianoRollAuditionRequestRef.current !== requestId ||
              !result.ready.includes(instrument)
            )
              return;
            getPreviewAuditionController()?.audition(events, onScheduled);
          })
          .catch(() => undefined);
        return;
      }
    }
    getPreviewAuditionController()?.audition(events, onScheduled);
  };

  const auditionPianoRollSystem = (system: ScoreSystem) => {
    const first = system.measures[0]?.measure;
    const last = system.measures.at(-1)?.measure;
    if (!first || !last) return;
    const progressionEnd = project.progression.steps.reduce(
      (total, step) => total + rationalToNumber(step.duration.beats),
      0,
    );
    auditionPianoRollRange(
      rationalToNumber(first.startBeats),
      Math.min(rationalToNumber(last.endBeats), progressionEnd),
    );
  };

  const auditionPianoRollNote = (stepId: string, eventKey: string) => {
    const current = store.project;
    clearPianoRollAuditionPlayhead();
    melodyPreviewAuditionControllerRef.current?.stop();
    if (current.melodyTrack.muted || current.harmonyTrack.solo || mutedStepIds.has(stepId)) return;
    previewAuditionControllerRef.current?.stop();
    const requestId = ++pianoRollAuditionRequestRef.current;
    const mode = getHarmonicModule(current.activeModule).mode;
    const projection = realizeProgressionMelodyPerformance({
      steps: current.progression.steps,
      tonic: current.tonic,
      context: {
        tonic: current.tonic,
        mode,
        moduleId: current.activeModule,
        spellingContext: { tonic: current.tonic, mode },
      },
      tempoBpm: current.globalTiming.tempoBpm,
      groove: current.groove,
      melodyTrack: current.melodyTrack,
    });
    const event = projection.events.find(
      (candidate) => candidate.sourceStepId === stepId && candidate.eventKey === eventKey,
    );
    if (!event) return;
    const startBeat = rationalToNumber(event.startBeats);
    let playheadStarted = false;
    const onScheduled = (playback: ScheduledPlayback, clock: AudioClock) => {
      if (pianoRollAuditionRequestRef.current !== requestId || playheadStarted) return;
      playheadStarted = true;
      startPianoRollAuditionPlayhead(
        requestId,
        startBeat,
        startBeat + rationalToNumber(event.durationBeats),
        playback,
        clock,
      );
    };
    const provider = ensureMelodyProvider();
    void provider
      .prepareForInstruments([event.instrument])
      .then((result) => {
        if (pianoRollAuditionRequestRef.current !== requestId) return;
        if (!result.ready.includes(event.instrument)) return;
        provider.setPreviewSettings(event.instrument, current.melodyTrack.volume);
        getMelodyPreviewAuditionController()?.audition(
          [{ ...event, startSeconds: 0 }],
          onScheduled,
        );
      })
      .catch(() => undefined);
  };

  return (
    <StudioWorkspace
      sidePanelMode={project.presentation.sidePanelMode ?? "fixed"}
      onSidePanelModeChange={changeSidePanelMode}
      header={
        <>
          <div className="app-header-project-area">
            {globalSettingsVisibility.showProjectTabs ? (
              <ProjectTabs
                activeProjectId={project.id}
                activeProjectName={project.name}
                projects={projectList.filter((item) => openProjectIds.includes(item.id))}
                busy={projectBusy}
                onOpenProject={handleOpenProject}
                onCloseProject={handleCloseProjectTab}
              />
            ) : null}
            <div className="app-header-controls" role="group" aria-label="Application controls">
              <AppMenuBar
                projectMenu={
                  <ProjectManager
                    project={project}
                    projects={projectList}
                    busy={projectBusy}
                    error={projectError}
                    onNewProject={handleNewProject}
                    onOpenProject={handleOpenProject}
                    onRenameProject={handleRenameProject}
                    onDeleteProject={handleDeleteProject}
                  >
                    <PortableProjectActions
                      project={project}
                      busy={projectBusy}
                      onSaveProjectAs={handleSaveProjectAs}
                      onOpenProjectFile={handleOpenProjectFile}
                    />
                  </ProjectManager>
                }
                exportMenu={
                  <>
                    <PortableProjectExportAction
                      busy={projectBusy}
                      onExport={() => projectController.exportProject()}
                    />
                    <ExportActions project={project} busy={projectBusy} />
                  </>
                }
                canUndo={store.canUndo}
                onUndo={() => store.undo()}
                canRedo={store.canRedo}
                onRedo={() => store.redo()}
                cardView={project.presentation.globalMatrixCardView}
                onCardViewChange={globalView}
                progressionView={project.presentation.progressionView}
                onProgressionViewChange={changeProgressionView}
                showBassInStaff={project.presentation.showBassInStaff}
                onShowBassInStaffChange={changeStaffBassVisibility}
                suzukiColors={project.presentation.noteColorMode === "suzuki"}
                onSuzukiColorsChange={changeSuzukiColors}
                resolutionArrows={project.presentation.resolutionArrows !== false}
                onResolutionArrowsChange={changeResolutionArrows}
                guitarChordOrientation={project.presentation.guitarChordOrientation ?? "vertical"}
                onGuitarChordOrientationChange={changeGuitarChordOrientation}
                sidePanelMode={project.presentation.sidePanelMode ?? "fixed"}
                onSidePanelModeChange={changeSidePanelMode}
                onOpenModesExplorer={() => setIsModesExplorerOpen(true)}
                onOpenHelp={() => {
                  setIsHelpOpen(true);
                  setHelpInitialTab("overview");
                }}
                onOpenFingeringLegend={() => setIsFingeringLegendOpen(true)}
                onOpenShortcutsHelp={() => {
                  setIsHelpOpen(true);
                  setHelpInitialTab("shortcuts");
                }}
              />
              {globalSettingsVisibility.showThemeControl ? (
                <ThemeControl value={project.presentation.theme} onChange={changeTheme} />
              ) : null}
              {globalSettingsVisibility.showExpertiseControl ? (
                <ExpertiseModeControl
                  value={project.presentation.expertiseMode}
                  onChange={changeExpertiseMode}
                />
              ) : null}
            </div>
          </div>
          {project.temporaryBranch ? (
            <span className="branch-status app-header-status" role="status">
              What-if branch active
            </span>
          ) : null}
          <div className="app-header-actions">
            <GlobalSettingsControl
              value={globalSettingsVisibility}
              onChange={setGlobalSettingsVisibility}
            />
          </div>
        </>
      }
      transport={
        globalSettingsVisibility.showHistoryControls ? (
          <HistoryControls
            onUndo={() => store.undo()}
            canUndo={store.canUndo}
            onRedo={() => store.redo()}
            canRedo={store.canRedo}
          />
        ) : null
      }
      statusBar={
        <>
          {alternativesStatus ? (
            <span
              className="app-status-message"
              role="status"
              aria-live="polite"
              data-testid="alternatives-status"
            >
              {alternativesStatus}
            </span>
          ) : null}
          {durationResizeStatus ? (
            <span
              id="duration-resize-status"
              className="app-status-message"
              role="status"
              aria-live="polite"
              data-testid="duration-resize-status"
            >
              {durationResizeStatus}
            </span>
          ) : null}
          {recommendations &&
          !recommendations.bestMatch &&
          recommendations.alternatives.length === 0 ? (
            <span
              className="app-status-message"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="matrix-recommendation-status"
            >
              {recommendations.blockedCandidates.length > 0
                ? "Strict route requires confirmation. Visible choices remain available."
                : "No strong recommendation for this context. Passive choices remain available."}
            </span>
          ) : null}
          <PianoAudioStatus
            instrument={
              isGuitarProgressionView(project.presentation.progressionView) ||
              project.presentation.globalMatrixCardView === "guitar"
                ? "guitar"
                : "piano"
            }
            engine={
              isGuitarProgressionView(project.presentation.progressionView) ||
              project.presentation.globalMatrixCardView === "guitar"
                ? (project.harmonyTrack.guitarEngine ?? "hq-samples")
                : (project.harmonyTrack.pianoEngine ?? "hq-samples")
            }
            state={
              isGuitarProgressionView(project.presentation.progressionView) ||
              project.presentation.globalMatrixCardView === "guitar"
                ? project.harmonyTrack.guitarEngine === "soundfont"
                  ? guitarSoundFontState
                  : guitarAudioState
                : project.harmonyTrack.instrument === "piano" ||
                    project.harmonyTrack.instrument === "gm-000"
                  ? project.harmonyTrack.pianoEngine === "soundfont"
                    ? harmonySoundFontState
                    : audioState
                  : harmonySoundFontState
            }
            onRetry={retryAudio}
          />
        </>
      }
      printable={<PrintableProgression project={project} />}
      matrix={
        <HarmonicMatrix
          project={project}
          {...(activePreviewId ? { previewFunctionId: activePreviewId } : {})}
          playingFunctionId={currentPlayingFunctionId}
          recommendations={recommendations}
          contextualFunctionIds={contextualFunctions}
          onPreview={preview}
          onAdd={add}
          onGlobalView={globalView}
          onModuleChange={requestModuleSwitch}
          onTonicChange={changeTonic}
          onTemplateOpen={(functionId) => setSettingsFunctionId(functionId)}
          onTemplateReset={resetCard}
          onStaffOctaveChange={changeMatrixStaffOctave}
          onClearSelection={clearMatrixSelection}
          onOpenMatrixMenu={(anchor, pos) => setMatrixMenu({ anchor, position: pos })}
          onGenreFocusChange={changeGenreFocus}
          onOpenPresets={() => setPresetsPanelOpen(true)}
          onOpenModesExplorer={() => setIsModesExplorerOpen(true)}
          onOpenQuickChord={openQuickChordPalette}
          onOpenAlternatives={() => openAlternativesForStep(selectedChordStep?.id)}
          canOpenAlternatives={Boolean(selectedChordStep)}
        />
      }
      inspector={
        <>
          {globalSettingsVisibility.showRecommendationContext ? (
            <RecommendationInspector
              candidate={inspected}
              blockedCandidates={recommendations?.blockedCandidates ?? []}
              mode={project.presentation.expertiseMode}
            />
          ) : null}
          {project.temporaryBranch ? (
            <CompositionIntentControl
              value={project.temporaryBranch.compositionIntent}
              onChange={changeIntent}
            />
          ) : null}
          {globalSettingsVisibility.showPreviewHarmony ? (
            <HarmonyDetails chord={previewChord} />
          ) : null}
          <HarmonicStyleInspector
            value={project.presentation.genreFocus ?? "all"}
            onChange={changeGenreFocus}
          />
          <CardTemplateInspector
            project={project}
            functionId={settingsFunctionId}
            onPerformancePatch={patchTemplatePerformance}
            onDurationChange={patchTemplateDuration}
            onReset={resetTemplate}
          />
          <AudioEnginesInspector
            settings={project.harmonyTrack}
            onChange={changeHarmonyTrackSettings}
            globalMatrixCardView={project.presentation.globalMatrixCardView}
            progressionView={project.presentation.progressionView}
          />
        </>
      }
      selectedStepQuickEdit={
        selectedProgressionStep ? (
          <>
            {selectedChordStep ? (
              <ProgressionQuickEdit
                step={selectedChordStep}
                tonic={project.tonic}
                labelMode={labelHierarchyMode}
                onReplaceChord={replaceProgressionStep}
                onDurationChange={(stepId, duration) => changeStepDuration(stepId, duration)}
                onPerformanceChange={(stepId, performance) =>
                  editProgressionPerformance(stepId, performance)
                }
                onOpenInspector={focusSelectedStepInspector}
              />
            ) : null}
            <SongSectionControls
              stepId={selectedProgressionStep.id}
              stepNumber={selectedStepIndex + 1}
              sections={(project.progression.sections ?? []).filter(
                (section) => section.startStepId === selectedProgressionStep.id,
              )}
              onCreate={(name) => {
                const command: SetSongSectionsCommand = {
                  type: "progression/set-sections",
                  payload: {
                    sections: [
                      ...(project.progression.sections ?? []),
                      {
                        id: crypto.randomUUID(),
                        name,
                        startStepId: selectedProgressionStep.id,
                      },
                    ],
                    nowIso: new Date().toISOString(),
                  },
                };
                store.dispatch(command, setSongSections);
              }}
              onRename={(sectionId, name) => {
                const command: SetSongSectionsCommand = {
                  type: "progression/set-sections",
                  payload: {
                    sections: (project.progression.sections ?? []).map((section) =>
                      section.id === sectionId ? { ...section, name } : section,
                    ),
                    nowIso: new Date().toISOString(),
                  },
                };
                store.dispatch(command, setSongSections);
              }}
              onDelete={(sectionId) => {
                const command: SetSongSectionsCommand = {
                  type: "progression/set-sections",
                  payload: {
                    sections: (project.progression.sections ?? []).filter(
                      (section) => section.id !== sectionId,
                    ),
                    nowIso: new Date().toISOString(),
                  },
                };
                store.dispatch(command, setSongSections);
              }}
            />
          </>
        ) : undefined
      }
      selectedStepInspector={
        selectedChordStep ? (
          <PianoPerformanceInspector
            step={selectedChordStep}
            tonic={project.tonic}
            meter={project.globalTiming.meter}
            context={{
              tonic: project.tonic,
              mode: getHarmonicModule(project.activeModule).mode,
              moduleId: project.activeModule,
              spellingContext: {
                tonic: project.tonic,
                mode: getHarmonicModule(project.activeModule).mode,
              },
            }}
            onPerformanceChange={(perf) => editProgressionPerformance(selectedChordStep.id, perf)}
            onDurationChange={(duration) => changeStepDuration(selectedChordStep.id, duration)}
            canReplace={Boolean(activePreviewId)}
            onReplace={() => {
              if (activePreviewId) replaceProgressionStep(selectedChordStep.id, activePreviewId);
            }}
            onReset={() => resetProgressionStep(selectedChordStep.id)}
            onRemove={() => removeProgressionStep(selectedChordStep.id)}
            onMoveLeft={() =>
              reorderSelectedProgressionStep(
                selectedChordStep.id,
                Math.max(0, selectedStepIndex - 1),
              )
            }
            onMoveRight={() =>
              reorderSelectedProgressionStep(
                selectedChordStep.id,
                Math.min(project.progression.steps.length - 1, selectedStepIndex + 1),
              )
            }
            onOpenVoicingEditor={() => setVoicingEditorOpen(true)}
            melodyTrack={project.melodyTrack}
            onMelodyTrackSettingsChange={changeMelodyTrackSettings}
            melodyAudioState={melodyAudioState}
            melodyAudioError={melodyAudioError}
            onRetryMelodyAudio={retryMelodyAudio}
            hasMelodyRecipe={project.progression.steps.some(
              (step) => step.kind === "chord" && step.melody !== undefined,
            )}
            onSetMeter={changeMeter}
            groove={project.groove}
            onSetGroove={changeGroove}
            loopState={loopState}
            steps={project.progression.steps}
            onSetLoopMode={handleSetLoopMode}
            onSetLoopRange={handleSetLoopRange}
            onApplySubstitution={(sub) => handleApplySubstitution(selectedChordStep.id, sub)}
            onAuditionSubstitution={handleAuditionSubstitution}
            auditioningSubstitutionId={auditioningSubId}
          />
        ) : selectedProgressionStep?.kind === "rest" ? (
          <RestStepInspector
            step={selectedProgressionStep}
            meter={project.globalTiming.meter}
            onDurationChange={(duration) =>
              changeStepDuration(selectedProgressionStep.id, duration)
            }
            onRemove={() => removeProgressionStep(selectedProgressionStep.id)}
            onMoveLeft={() =>
              reorderSelectedProgressionStep(
                selectedProgressionStep.id,
                Math.max(0, selectedStepIndex - 1),
              )
            }
            onMoveRight={() =>
              reorderSelectedProgressionStep(
                selectedProgressionStep.id,
                Math.min(project.progression.steps.length - 1, selectedStepIndex + 1),
              )
            }
            onSetMeter={changeMeter}
            groove={project.groove}
            onSetGroove={changeGroove}
            loopState={loopState}
            steps={project.progression.steps}
            onSetLoopMode={handleSetLoopMode}
            onSetLoopRange={handleSetLoopRange}
          />
        ) : (
          <ProgressionGlobalInspector
            project={project}
            selectedPianoNote={selectedPianoNote}
            onEditSelectedPianoNote={() => {
              if (!selectedPianoNote) return;
              setPianoRollInspectorRequest((current) => ({
                ...selectedPianoNote,
                requestId: (current?.requestId ?? 0) + 1,
              }));
            }}
            onBatchPerformanceChange={batchEditProgressionPerformance}
            onBatchDurationChange={batchSetProgressionDuration}
            onResetAll={resetAllProgressionPerformance}
            onSetProgressionView={changeProgressionView}
            onSetMeasuresPerSystem={changeMeasuresPerSystem}
            onSetMeter={changeMeter}
            onSetGroove={changeGroove}
            onHarmonyTrackSettingsChange={changeHarmonyTrackSettings}
            harmonyAudioState={
              isGuitarProgressionView(project.presentation.progressionView) ||
              project.presentation.globalMatrixCardView === "guitar"
                ? project.harmonyTrack.guitarEngine === "soundfont"
                  ? guitarSoundFontState
                  : guitarAudioState
                : project.harmonyTrack.instrument === "piano" ||
                    project.harmonyTrack.instrument === "gm-000"
                  ? project.harmonyTrack.pianoEngine === "soundfont"
                    ? harmonySoundFontState
                    : audioState
                  : harmonySoundFontState
            }
            harmonyAudioError={
              isGuitarProgressionView(project.presentation.progressionView) ||
              project.presentation.globalMatrixCardView === "guitar"
                ? project.harmonyTrack.guitarEngine === "soundfont"
                  ? harmonySoundFontError
                  : null
                : project.harmonyTrack.instrument === "piano" ||
                    project.harmonyTrack.instrument === "gm-000"
                  ? project.harmonyTrack.pianoEngine === "soundfont"
                    ? harmonySoundFontError
                    : null
                  : harmonySoundFontError
            }
            onRetryHarmonyAudio={() => {
              if (
                isGuitarProgressionView(project.presentation.progressionView) ||
                project.presentation.globalMatrixCardView === "guitar"
              ) {
                if (project.harmonyTrack.guitarEngine === "soundfont") {
                  const inst = project.harmonyTrack.guitarSoundfontInstrument ?? "gm-025";
                  const provider = ensureGuitarSoundFontProvider();
                  void provider
                    .prepareForInstruments([inst])
                    .then(applyHarmonyPreparationResult)
                    .catch((err) => {
                      setHarmonySoundFontError(err instanceof Error ? err.message : String(err));
                    });
                } else {
                  const gProvider = guitarProviderRef.current ?? ensureGuitarProvider();
                  void gProvider.prepare();
                }
              } else if (
                project.harmonyTrack.instrument === "piano" ||
                project.harmonyTrack.instrument === "gm-000"
              ) {
                if (project.harmonyTrack.pianoEngine === "soundfont") {
                  const provider = ensureHarmonySoundFontProvider();
                  void provider
                    .prepareForInstruments([
                      project.harmonyTrack.pianoSoundfontInstrument ?? "gm-000",
                    ])
                    .then(applyHarmonyPreparationResult)
                    .catch((err) => {
                      setHarmonySoundFontError(err instanceof Error ? err.message : String(err));
                    });
                } else {
                  const provider = audioProviderRef.current;
                  if (provider) void provider.prepare();
                }
              } else {
                const provider = ensureHarmonySoundFontProvider();
                void provider
                  .prepareForInstruments([project.harmonyTrack.instrument])
                  .then(applyHarmonyPreparationResult)
                  .catch((err) => {
                    setHarmonySoundFontError(err instanceof Error ? err.message : String(err));
                  });
              }
            }}
            onMelodyTrackSettingsChange={changeMelodyTrackSettings}
            melodyAudioState={melodyAudioState}
            melodyAudioError={melodyAudioError}
            onRetryMelodyAudio={retryMelodyAudio}
            loopState={loopState}
            onSetLoopMode={handleSetLoopMode}
            onSetLoopRange={handleSetLoopRange}
            onOpenPresets={() => setPresetsPanelOpen(true)}
            onSaveAsPreset={() => setSavePresetDialogOpen(true)}
            onSetNoteColorMode={changeNoteColorMode}
          />
        )
      }
      onProgressionBackgroundClick={() => setProgressionSelection()}
      onMatrixBackgroundClick={clearMatrixSelection}
      progression={
        <>
          <div
            className="progression-heading"
            data-testid="progression-heading"
            onContextMenu={handleProgressionHeadingContextMenu}
          >
            <div className="progression-title-group">
              <h2>My Progression</h2>
              <div className="progression-heading-transport-cluster">
                <ProgressionTransportControls
                  selectedStepId={project.progression.selectedStepId}
                  transportState={transportState}
                  onPlay={handlePlay}
                  onPlayFromHere={handlePlayFromHere}
                  onPause={handlePause}
                  onResume={handleResume}
                  onStop={handleStop}
                />
                <nav className="progression-playback-nav" aria-label="Playback Transport">
                  <div className="transport-timing" role="group" aria-label="Timing Controls">
                    <TempoControls
                      tempoBpm={project.globalTiming.tempoBpm}
                      onSetTempo={changeTempo}
                      className="progression-heading-tempo"
                    />
                    <PlaybackSupportControls
                      loopState={loopState}
                      metronomeEnabled={metronomeEnabled}
                      countInEnabled={countInEnabled}
                      onSetLoopMode={handleSetLoopMode}
                      onToggleMetronome={() => setMetronomeEnabled((v) => !v)}
                      onToggleCountIn={() => setCountInEnabled((v) => !v)}
                    />
                  </div>
                </nav>
              </div>
            </div>
            <div className="progression-heading-actions">
              <button
                type="button"
                className="btn-print-progression"
                onClick={() => window.print()}
                title="Open the system print dialog; choose Save as PDF to export"
                data-testid="print-progression"
              >
                <span aria-hidden="true">⎙</span>
                <span>Print / Save as PDF</span>
              </button>
              <button
                type="button"
                className="btn-modulation-trigger"
                onClick={() => setIsModulationModalOpen(true)}
                title="Modulation Master & Key Transitions"
                data-testid="progression-modulate-trigger"
              >
                <span className="btn-modulation-icon" aria-hidden="true">
                  🧭
                </span>
                <span>Modulate</span>
              </button>
              <VoiceLeadingMenu
                onApplyVoiceLeading={handleApplyVoiceLeading}
                disabled={project.progression.steps.length === 0}
              />
              <BranchControls
                project={project}
                selectedBranchStepIds={selectedBranchStepIds}
                onStart={startExploration}
                onRejoin={setRejoin}
                onCommitWhole={commitWhole}
                onCommitSelected={commitSelected}
                onDiscard={discard}
              />
              <ViewModeToggle
                currentView={project.presentation.progressionView}
                onChangeView={changeProgressionView}
                selectAriaLabel="Progression Card View"
                testIdPrefix="progression-view"
                availableViews={["harmonic", "piano", "staff", "guitar", "tablature", "piano-roll"]}
              />
              <LabelHierarchyControl value={labelHierarchyMode} onChange={setLabelHierarchyMode} />
            </div>
          </div>
          <ProgressionTrack
            project={project}
            selectedPianoNote={selectedPianoNote}
            onSelectedPianoNoteChange={setSelectedPianoNote}
            onSelectedPianoChordChange={(stepId) => {
              setActivePianoRollChordStepId(stepId);
              if (pianoRollMatrixReplacementTargetRef.current) {
                pianoRollMatrixReplacementTargetRef.current = null;
                setPianoRollMatrixReplacement(null);
                store.clearMatrixPreview();
              }
            }}
            pianoRollInspectorRequest={pianoRollInspectorRequest}
            pianoRollAuditionPlayhead={pianoRollAuditionPlayhead}
            onPianoRollAuditionFinished={finishPianoRollAuditionPlayhead}
            onAuditionPianoRollMeasure={auditionPianoRollMeasure}
            onAuditionPianoRollChord={auditionPianoRollChord}
            onAuditionPianoRollNote={auditionPianoRollNote}
            onAuditionPianoRollSystem={auditionPianoRollSystem}
            currentPlayingStepIndex={currentPlayingStepIndex}
            activeMelodyEventKey={
              transportState.activeMelodyEventKey ?? previewActiveMelodyEventKey
            }
            activeEventStartedAt={transportState.currentStepStartedAt}
            playbackClockSnapshot={transportState.playbackClockSnapshot}
            transportPlaying={transportState.status === "playing"}
            melodyAudioState={melodyAudioState}
            melodyAudioError={melodyAudioError}
            harmonyAudioState={
              isGuitarProgressionView(project.presentation.progressionView)
                ? project.harmonyTrack.guitarEngine === "soundfont"
                  ? guitarSoundFontState
                  : guitarAudioState
                : project.harmonyTrack.instrument === "piano" ||
                    project.harmonyTrack.instrument === "gm-000"
                  ? project.harmonyTrack.pianoEngine === "soundfont"
                    ? harmonySoundFontState
                    : audioState
                  : harmonySoundFontState
            }
            onRetryHarmonyAudio={() => {
              if (isGuitarProgressionView(project.presentation.progressionView)) {
                if (project.harmonyTrack.guitarEngine === "soundfont") {
                  const inst = project.harmonyTrack.guitarSoundfontInstrument ?? "gm-025";
                  const provider = ensureGuitarSoundFontProvider();
                  void provider
                    .prepareForInstruments([inst])
                    .then(applyHarmonyPreparationResult)
                    .catch((err) => {
                      setHarmonySoundFontError(err instanceof Error ? err.message : String(err));
                    });
                } else {
                  const gProvider = guitarProviderRef.current ?? ensureGuitarProvider();
                  void gProvider.prepare();
                }
              } else if (
                project.harmonyTrack.instrument === "piano" ||
                project.harmonyTrack.instrument === "gm-000"
              ) {
                if (project.harmonyTrack.pianoEngine === "soundfont") {
                  const provider = ensureHarmonySoundFontProvider();
                  void provider
                    .prepareForInstruments([
                      project.harmonyTrack.pianoSoundfontInstrument ?? "gm-000",
                    ])
                    .then(applyHarmonyPreparationResult)
                    .catch((err) => {
                      setHarmonySoundFontError(err instanceof Error ? err.message : String(err));
                    });
                } else {
                  const provider = audioProviderRef.current;
                  if (provider) void provider.prepare();
                }
              } else {
                const provider = ensureHarmonySoundFontProvider();
                void provider
                  .prepareForInstruments([project.harmonyTrack.instrument])
                  .then(applyHarmonyPreparationResult)
                  .catch((err) => {
                    setHarmonySoundFontError(err instanceof Error ? err.message : String(err));
                  });
              }
            }}
            onRetryMelodyAudio={retryMelodyAudio}
            isMelodyPreviewPlaying={isMelodyPreviewPlaying}
            onPlayMelodyPreview={playMelodyPreview}
            onStopMelodyPreview={stopMelodyPreview}
            loopState={loopState}
            onSelectStep={selectProgressionStep}
            onClearSelection={() => setProgressionSelection()}
            onEditPerformance={editProgressionPerformance}
            onSetStepDuration={resizeProgressionChordDuration}
            onDurationResizeStatusChange={setDurationResizeStatus}
            labelMode={labelHierarchyMode}
            onSetProgressionView={changeProgressionView}
            onRemove={removeProgressionStep}
            onDuplicateStep={duplicateProgressionStep}
            onInsertStepBefore={insertMatrixChordBefore}
            onInsertStepAfter={insertMatrixChordAfter}
            activeMatrixFunctionId={activePreviewId}
            matrixReplacementFunctionId={matrixSession.previewFunctionId}
            pianoRollMatrixReplacement={pianoRollMatrixReplacement}
            selectedMatrixChordName={selectedMatrixChordName}
            onReorder={reorderProgressionStep}
            onPlayRange={playProgressionRange}
            onToggleLoopRange={toggleProgressionRangeLoop}
            isLoopRangeActive={isLoopingProgressionRange}
            onCopyRange={copyProgressionRange}
            onDuplicateRange={duplicateProgressionRange}
            onDeleteRange={deleteProgressionRange}
            onResetPerformanceRange={resetPerformanceProgressionRange}
            onExploreRange={openAlternativesForRange}
            onAddRest={addRest}
            onReplacePianoRollChord={replacePianoRollChord}
            onSetPianoRollRest={setPianoRollRest}
            onSetPianoRollStepDuration={setPianoRollStepDuration}
            onSplitPianoRollStep={splitPianoRollStep}
            onTiePianoRollSteps={tiePianoRollSteps}
            onTransferPianoRollBoundary={transferPianoRollBoundary}
            onFocusMatrix={() => {
              const matrix = document.querySelector<HTMLElement>('[aria-label="Harmonic Matrix"]');
              matrix
                ?.querySelector<HTMLButtonElement>('[data-testid^="chord-card-"] button')
                ?.focus();
            }}
            onFocusMatrixChord={(stepId) => {
              pianoRollMatrixReplacementTargetRef.current = stepId;
              setPianoRollMatrixReplacement({ stepId, functionId: null });
              store.clearMatrixPreview();
              const matrix = document.querySelector<HTMLElement>('[aria-label="Harmonic Matrix"]');
              matrix
                ?.querySelector<HTMLButtonElement>('[data-testid^="chord-card-"] button')
                ?.focus();
            }}
            onCancelMatrixChordChoice={() => {
              pianoRollMatrixReplacementTargetRef.current = null;
              setPianoRollMatrixReplacement(null);
              store.clearMatrixPreview();
            }}
            onFocusMatrixKey={() => {
              const matrix = document.querySelector<HTMLElement>('[aria-label="Harmonic Matrix"]');
              matrix?.querySelector<HTMLButtonElement>('[aria-label^="Set key "]')?.focus();
            }}
            onFillGapWithRest={fillProgressionGapWithRest}
            onExtendFinalChord={extendFinalChordToBar}
            onRepeatFinalChord={repeatFinalChordToBar}
            onSetMelodyRecipe={setMelodyRecipeForStep}
            onSetAuthoredMelody={setAuthoredMelodyForStep}
            onApplyPianoRollMelodyEdits={applyPianoRollMelodyEdits}
            onRemoveMelodyRecipe={removeMelodyRecipeForStep}
            onHarmonyTrackSettingsChange={changeHarmonyTrackSettings}
            onMelodyTrackSettingsChange={changeMelodyTrackSettings}
            onSetMeasuresPerSystem={changeMeasuresPerSystem}
            onDuplicateSystem={duplicateSystem}
            onDeleteSystem={deleteSystem}
            isSystemLooping={isSystemLooping}
            isSystemMuted={isSystemMuted}
            isSystemSolo={isSystemSolo}
            canPasteSystem={Boolean(copiedSystemSteps && copiedSystemSteps.length > 0)}
            onPlayFromSystem={playFromSystem}
            onToggleLoopSystem={toggleLoopSystem}
            onToggleMuteSystem={toggleMuteSystem}
            onToggleSoloSystem={toggleSoloSystem}
            onMoveSystemUp={(sys) => moveSystem(sys, -1)}
            onMoveSystemDown={(sys) => moveSystem(sys, 1)}
            onCopySystem={copySystem}
            onPasteSystemAfter={pasteSystemAfter}
            onInsertEmptySystemAfter={insertEmptySystemAfter}
            onInsertRestAfterSystem={insertRestAfterSystem}
            onExploreAlternativeFromSystem={exploreAlternativeFromSystem}
            onOctaveUpSystem={(sys) => shiftOctaveSystem(sys, 1)}
            onOctaveDownSystem={(sys) => shiftOctaveSystem(sys, -1)}
            onResetPerformanceSystem={resetPerformanceSystem}
            onSetArticulationSystem={setArticulationSystem}
            onApplyMelodyContourSystem={applyMelodyContourSystem}
            onSetMelodyGridSystem={setMelodyGridSystem}
            onClearMelodySystem={clearMelodySystem}
            onOpenProgressionMenu={(anchor, pos) => setProgressionMenu({ anchor, position: pos })}
            onToggleSuzukiColors={() =>
              changeSuzukiColors(project.presentation.noteColorMode !== "suzuki")
            }
            onApplyPreset={handleApplyPreset}
            onOpenPresets={() => setPresetsPanelOpen(true)}
            onApplySubstitution={handleApplySubstitution}
            onOpenModulation={() => setIsModulationModalOpen(true)}
          />
          <BranchComparison
            project={project}
            selectedStepIds={selectedBranchStepIds}
            onSelectedStepIdsChange={(ids) => setSelectedBranchStepIds(Object.freeze(ids))}
          />
        </>
      }
      overlays={
        <>
          {alternativesSession ? (
            <AlternativesTray
              snapshot={alternativesSession.snapshot}
              mode={project.presentation.expertiseMode}
              originLabel={alternativesOriginLabel}
              applyError={alternativesSession.applyError}
              onAudition={auditionAlternative}
              onApply={applyAlternative}
              onClose={closeAlternatives}
            />
          ) : null}
          {quickChordPaletteOpen ? (
            <QuickChordPalette
              candidates={quickChordCandidates}
              onPreview={previewQuickChord}
              onApply={applyQuickChord}
              onClose={() => closeQuickChordPalette(true)}
              isTopmost={!pendingRouteWarning}
            />
          ) : null}
          {pendingRouteWarning ? (
            <RouteWarningDialog
              decision={pendingRouteWarning.decision}
              onCancel={cancelPendingRoute}
              onConfirm={confirmPendingRoute}
              restoreFocusRef={routeRestoreFocusRef}
            />
          ) : null}
          {pendingSwitch ? (
            <ModuleSwitchDialog
              plan={pendingSwitch}
              onCancel={() => setPendingSwitch(null)}
              onConfirm={(resolutions) =>
                applyModuleSwitch(pendingSwitch.destinationModule, resolutions)
              }
            />
          ) : null}
          {voicingEditorOpen && selectedChordStep && (
            <PianoVoicingEditor
              isOpen={voicingEditorOpen}
              stepLabel={selectedChordStep.harmonicFunction.functionId}
              initialPitches={
                selectedChordStep.performance.manualVoicing?.length
                  ? selectedChordStep.performance.manualVoicing
                  : realizeProgressionStepPitches(selectedChordStep, project.tonic)
              }
              onClose={() => setVoicingEditorOpen(false)}
              onSave={(pitches) => {
                editProgressionPerformance(selectedChordStep.id, {
                  voicingMode: "manual",
                  manualVoicing: pitches,
                });
              }}
              onResetToAuto={() => {
                editProgressionPerformance(selectedChordStep.id, {
                  voicingMode: "auto",
                });
                setVoicingEditorOpen(false);
              }}
            />
          )}
          <PresetsPanel
            isOpen={presetsPanelOpen}
            isTopmost={!applyDialogPreset && !savePresetDialogOpen}
            project={project}
            onClose={() => {
              stopAuditionPreset();
              setPresetsPanelOpen(false);
            }}
            onOpenApplyDialog={(preset) => {
              stopAuditionPreset();
              setApplyDialogPreset(preset);
            }}
            onOpenSaveDialog={() => {
              stopAuditionPreset();
              setSavePresetDialogOpen(true);
            }}
            onDeleteCustomPreset={handleDeleteCustomPreset}
            onAuditionPreset={auditionPreset}
            onStopAudition={stopAuditionPreset}
            auditioningPresetId={auditioningPresetId}
          />
          <PresetApplyDialog
            isOpen={Boolean(applyDialogPreset)}
            preset={applyDialogPreset}
            project={project}
            onClose={() => setApplyDialogPreset(null)}
            onApply={handleApplyPreset}
          />
          <SavePresetDialog
            isOpen={savePresetDialogOpen}
            project={project}
            onClose={() => setSavePresetDialogOpen(false)}
            onSave={handleSaveCustomPreset}
          />
          <ModulationModal
            isOpen={isModulationModalOpen}
            project={project}
            onClose={() => {
              stopAuditioningModulation();
              setIsModulationModalOpen(false);
            }}
            onAuditionPath={handleAuditionModulationPath}
            onStopAudition={stopAuditioningModulation}
            auditioningPathId={auditioningModPathId}
            onApplyBridge={handleApplyModulationBridge}
            selectedStepId={project.progression.selectedStepId}
          />
          <ModesExplorerModal
            isOpen={isModesExplorerOpen}
            project={project}
            onClose={() => {
              stopAuditioningModes();
              setIsModesExplorerOpen(false);
            }}
            onAuditionScaleNotes={handleAuditionScaleNotes}
            onAuditionChord={handleAuditionModalChord}
            onAuditionFormula={handleAuditionModalFormula}
            onStopAudition={stopAuditioningModes}
            onApplyFormulaToProgression={handleApplyModalFormulaToProgression}
            onApplyKeyToProject={handleApplyModalKeyToProject}
          />
          {progressionMenu ? (
            <ProgressionContextMenu
              position={progressionMenu.position}
              invoker={progressionMenu.anchor}
              measureCount={progressionMeasureCount}
              stepCount={project.progression.steps.length}
              chordStepCount={chordStepsAll.length}
              isLooping={loopState.enabled && loopState.mode === "all"}
              hasMutedSystems={mutedSystemIndices.size > 0}
              hasSoloSystems={soloSystemIndex !== null}
              canShiftOctaveUp={canShiftOctaveUpAll}
              canShiftOctaveDown={canShiftOctaveDownAll}
              currentArticulation={currentArticulationAll}
              currentPitchMotion={currentPitchMotionAll}
              currentGrid={currentGridAll}
              hasMelody={hasMelodyAll}
              measuresPerSystem={project.presentation.measuresPerSystem}
              steps={project.progression.steps}
              onStartBranch={startExploration}
              isBranchActive={Boolean(project.temporaryBranch)}
              onCommitBranch={commitWhole}
              onDiscardBranch={discard}
              onPlayFromBeginning={handlePlay}
              onToggleLoop={toggleLoopProgression}
              onUnmuteAll={unmuteAllSystems}
              onClearSolos={clearAllSolos}
              onOctaveUp={() => shiftOctaveAll(1)}
              onOctaveDown={() => shiftOctaveAll(-1)}
              onResetPerformance={resetAllProgressionPerformance}
              onSetArticulation={setArticulationAll}
              onApplyMelodyContour={applyMelodyContourAll}
              onSetMelodyGrid={setMelodyGridAll}
              onClearMelody={clearMelodyAll}
              onSetMeasuresPerSystem={changeMeasuresPerSystem}
              onDuplicateAllSteps={duplicateAllSteps}
              onAddRest={() => addRest()}
              onOpenPresets={() => setPresetsPanelOpen(true)}
              onSaveAsPreset={() => setSavePresetDialogOpen(true)}
              onClearAllSteps={clearAllProgressionSteps}
              onClose={() => setProgressionMenu(null)}
            />
          ) : null}
          {matrixMenu ? (
            <MatrixContextMenu
              position={matrixMenu.position}
              invoker={matrixMenu.anchor}
              activeModule={project.activeModule}
              tonic={project.tonic}
              globalView={project.presentation.globalMatrixCardView}
              showBassInStaff={project.presentation.showBassInStaff}
              currentArticulation={project.defaults.piano.performance.articulation}
              currentRegister={project.defaults.piano.performance.register}
              hasPreviewSelection={Boolean(activePreviewId)}
              isRecommendationsActive={globalSettingsVisibility.showRecommendationContext}
              onResetCurrentModule={() => resetMatrix("current-module")}
              onResetAllModules={() => resetMatrix("all-modules")}
              onResetTemplateDefaults={() => resetTemplate()}
              onSetModule={requestModuleSwitch}
              onTranspose={(semitones) =>
                changeTonic((((project.tonic + semitones) % 12) + 12) % 12)
              }
              onSetTonic={changeTonic}
              onSetView={globalView}
              onToggleBassInStaff={() =>
                changeStaffBassVisibility(!project.presentation.showBassInStaff)
              }
              suzukiColors={project.presentation.noteColorMode === "suzuki"}
              onToggleSuzukiColors={() =>
                changeSuzukiColors(project.presentation.noteColorMode !== "suzuki")
              }
              resolutionArrows={project.presentation.resolutionArrows !== false}
              onToggleResolutionArrows={() =>
                changeResolutionArrows(!(project.presentation.resolutionArrows !== false))
              }
              onSetArticulation={(articulation) => patchTemplatePerformance({ articulation })}
              onSetRegister={(register) => patchTemplatePerformance({ register })}
              onToggleRecommendations={() =>
                setGlobalSettingsVisibility((prev) => ({
                  ...prev,
                  showRecommendationContext: !prev.showRecommendationContext,
                }))
              }
              onClearSelection={clearMatrixSelection}
              onOpenModesExplorer={() => setIsModesExplorerOpen(true)}
              onClose={() => setMatrixMenu(null)}
            />
          ) : null}
          {isHelpOpen ? (
            <HelpCenterModal
              initialTab={helpInitialTab}
              onClose={() => setIsHelpOpen(false)}
              onOpenFingeringLegend={() => {
                setIsHelpOpen(false);
                setIsFingeringLegendOpen(true);
              }}
            />
          ) : null}
          {isFingeringLegendOpen ? (
            <GuitarHandLegendModal
              fingeringStyle="badge"
              onClose={() => setIsFingeringLegendOpen(false)}
              onSetFingeringStyle={() => {}}
            />
          ) : null}
        </>
      }
    />
  );
}
