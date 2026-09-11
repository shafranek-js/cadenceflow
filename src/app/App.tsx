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
import { createDefaultProject } from "../domain/project/factory";
import { recommend } from "../domain/recommendations/engine";
import {
  baselineFunctionIdentities,
  getHarmonicModule,
  recommendationVocabulary,
} from "../domain/harmony/moduleRegistry";
import { planModuleSwitch, type ModuleSwitchPlan } from "../domain/harmony/moduleSwitch";
import type { HarmonicFunctionIdentity, HarmonicModuleId } from "../domain/harmony/functions";
import { realizeChord } from "../domain/harmony/realization";
import { branchRecommendationPath, type CompositionIntent } from "../domain/progression/branch";
import type {
  CardViewId,
  ChordStep,
  ProgressionStep,
  StepPerformance,
} from "../domain/progression/step";
import { HarmonicMatrix } from "../ui/matrix/HarmonicMatrix";
import { ModuleSwitchDialog } from "../ui/matrix/ModuleSwitchDialog";
import { RecommendationInspector } from "../ui/inspector/RecommendationInspector";
import { HarmonyDetails } from "../ui/inspector/HarmonyDetails";
import { CompositionIntentControl } from "../ui/inspector/CompositionIntentControl";
import { BranchComparison } from "../ui/progression/BranchComparison";
import { BranchControls } from "../ui/progression/BranchControls";
import { ProgressionTransportControls } from "../ui/progression/ProgressionTransportControls";
import { ProgressionTrack } from "../ui/progression/ProgressionTrack";
import { CardTemplateInspector } from "../ui/inspector/CardTemplateInspector";
import { PianoPerformanceInspector } from "../ui/inspector/PianoPerformanceInspector";
import { RestStepInspector } from "../ui/inspector/RestStepInspector";
import { PianoVoicingEditor } from "../ui/piano/PianoVoicingEditor";
import { PianoAudioStatus } from "../ui/header/PianoAudioStatus";
import { HqSamplePianoProvider } from "../audio/hq-sample-piano/provider";
import { MelodySoundFontProvider } from "../audio/soundfont/melodyProvider";
import type { AudioProviderState } from "../audio/contracts";
import { realizeStepAudioEvents } from "../audio/eventRealizer";
import { realizeProgressionStepPitches } from "../instruments/piano/profile";
import { PlaybackSupportControls, TempoControls, TransportBar } from "../ui/transport/TransportBar";
import { HistoryControls } from "../ui/transport/HistoryControls";
import { TransportStore, type TransportState } from "../ui/transport/transportStore";
import {
  INITIAL_LOOP_STATE,
  revalidateLoopState,
  setLoopMode,
  type LoopMode,
  type LoopState,
} from "../ui/transport/loopState";
import { PlaybackController } from "../audio/playbackController";
import { PreviewAuditionController } from "../audio/previewAudition";
import {
  realizeMatrixCardPreview,
  resolvePreviousHarmonicContext,
} from "../ui/matrix/previewRealization";
import { MetronomeClickProvider } from "../audio/metronome";
import {
  realizeMelodyStepAudition,
  realizeProgressionMelodyPerformance,
} from "../audio/melodyPerformance";
import type { Meter, MeterChangePolicy } from "../domain/timing/meter";
import type { GrooveSettings } from "../domain/timing/swing";
import { musicalDuration, type MusicalDuration } from "../domain/timing/duration";
import { addRational } from "../domain/timing/rational";
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
  resetCardTemplate,
  resetMatrixScope,
  type PatchMatrixTemplateCommand,
  type ResetCardTemplateCommand,
  type ResetMatrixScopeCommand,
} from "./commands/matrixTemplateCommands";
import {
  addRestStep,
  editStepPerformance,
  removeStep,
  reorderStep,
  replaceStep,
  resetStepPerformance,
  selectStep,
  setAllStepCardView,
  repeatChordStep,
  type AddRestStepCommand,
  type EditStepPerformanceCommand,
  type RemoveStepCommand,
  type ReorderStepCommand,
  type ReplaceStepCommand,
  type ResetStepPerformanceCommand,
  type SelectStepCommand,
  type SetAllStepCardViewCommand,
  type RepeatChordStepCommand,
} from "./commands/progressionCommands";
import {
  saveCustomPreset,
  deleteCustomPreset,
  applyPreset,
  type SaveCustomPresetCommand,
  type DeleteCustomPresetCommand,
  type ApplyPresetCommand,
} from "./commands/presetCommands";
import type { FunctionalPreset, PresetApplyMode } from "../domain/progression/presets";
import { PresetsPanel } from "../ui/progression/PresetsPanel";
import { PresetApplyDialog } from "../ui/progression/PresetApplyDialog";
import { SavePresetDialog } from "../ui/progression/SavePresetDialog";
import type { StepPerformanceOverrides } from "../domain/project/defaults";
import {
  nextRegisterOffset,
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
  type SetThemeCommand,
  type SetExpertiseModeCommand,
  type SetStaffBassVisibilityCommand,
} from "./commands/presentationCommands";
import type { PresentationMode, ThemeMode, Project } from "../domain/project/project";
import type {
  ChordMelodyRecipe,
  MelodyInstrument,
  MelodyTrackSettings,
} from "../domain/melody/types";
import type { HarmonyTrackSettings } from "../domain/harmony/track";
import {
  createPatchMelodyTrackSettingsCommand,
  createRemoveMelodyRecipeCommand,
  createSetMelodyRecipeCommand,
  removeMelodyRecipe as applyRemoveMelodyRecipe,
  setMelodyRecipe as applySetMelodyRecipe,
  setMelodyTrackSettings as applyMelodyTrackSettings,
} from "./commands/melodyCommands";
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
  const [selectedBranchStepIds, setSelectedBranchStepIds] = useState<readonly string[]>(
    Object.freeze([]),
  );
  const [settingsFunctionId, setSettingsFunctionId] = useState<string | null>(null);
  const [voicingEditorOpen, setVoicingEditorOpen] = useState(false);
  const [audioState, setAudioState] = useState<AudioProviderState>("idle");
  const audioProviderRef = useRef<HqSamplePianoProvider | null>(null);
  const sharedAudioContextRef = useRef<AudioContext | null>(null);
  const [melodyAudioState, setMelodyAudioState] = useState<AudioProviderState>("idle");
  const [melodyAudioError, setMelodyAudioError] = useState<string | null>(null);
  const melodyProviderRef = useRef<MelodySoundFontProvider | null>(null);
  const [presetsPanelOpen, setPresetsPanelOpen] = useState(false);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [applyDialogPreset, setApplyDialogPreset] = useState<FunctionalPreset | null>(null);

  const transportStore = useMemo(() => new TransportStore(), []);
  const [transportState, setTransportState] = useState<TransportState>(transportStore.getState());
  const [loopState, setLoopState] = useState<LoopState>(INITIAL_LOOP_STATE);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [countInEnabled, setCountInEnabled] = useState(false);
  const playbackControllerRef = useRef<PlaybackController | null>(null);
  const previewAuditionControllerRef = useRef<PreviewAuditionController | null>(null);
  const melodyPreviewAuditionControllerRef = useRef<PreviewAuditionController | null>(null);
  const melodyPreviewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const melodyPreviewRequestRef = useRef(0);
  const [isMelodyPreviewPlaying, setIsMelodyPreviewPlaying] = useState(false);
  const [previewPlayingStepId, setPreviewPlayingStepId] = useState<string | null>(null);
  const [previewActiveMelodyEventKey, setPreviewActiveMelodyEventKey] = useState<string | null>(
    null,
  );
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
    () => project.progression.steps.some((step) => step.kind === "chord" && step.melody),
    [project.progression.steps],
  );

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
    const provider = ensureMelodyProvider();
    if (!melodyPreviewAuditionControllerRef.current) {
      melodyPreviewAuditionControllerRef.current = new PreviewAuditionController({
        provider,
        clock: provider.clock,
      });
    }
    return melodyPreviewAuditionControllerRef.current;
  }, [ensureMelodyProvider]);

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
    playbackControllerRef.current?.stop();
    previewAuditionControllerRef.current?.stop();
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
  }, [clearStepPreviewHighlights, transportStore]);

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
      if (sharedAudioContextRef.current === sharedAudioContext) {
        sharedAudioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    audioProviderRef.current?.setVolume(project.harmonyTrack.volume);
  }, [project.harmonyTrack.volume]);

  useEffect(() => {
    if (!hasMelodyRecipe) return;
    const provider = ensureMelodyProvider();
    void provider.prepare().catch((error) => {
      setMelodyAudioError(error instanceof Error ? error.message : String(error));
    });
  }, [ensureMelodyProvider, hasMelodyRecipe, project.melodyTrack.instrument]);

  useEffect(() => {
    const provider = melodyProviderRef.current;
    if (provider) provider.setTrackSettings(project.melodyTrack);
  }, [project.melodyTrack]);

  useEffect(() => {
    if (!hasMelodyRecipe) return;
    playbackControllerRef.current?.stop();
    playbackControllerRef.current = null;
  }, [hasMelodyRecipe]);

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

  const selectedProgressionStep: ProgressionStep | undefined = project.progression.selectedStepId
    ? project.progression.steps.find((step) => step.id === project.progression.selectedStepId)
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
        recentFunctionIds: recommendationHistory,
        visibleFunctionIds: vocabulary.map((identity) => identity.functionId),
        compositionIntent: project.temporaryBranch?.compositionIntent ?? "neutral",
      })
    : null;

  const contextualIds = new Set<string>();
  for (const candidate of [recommendations?.bestMatch, ...(recommendations?.alternatives ?? [])]) {
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
  const auditionMatrixCard = (functionId: string) => {
    const currentProject = store.project;
    const previousContext = resolvePreviousHarmonicContext(currentProject);
    const previewRealization = realizeMatrixCardPreview(
      currentProject,
      functionId,
      previousContext,
    );
    const auditionController = getPreviewAuditionController();
    auditionController?.audition(previewRealization.events);
  };

  const preview = (functionId: string) => {
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    if (project.temporaryBranch) {
      addToBranch(functionId);
    } else {
      store.selectMatrixPreview(functionId);
    }
    auditionMatrixCard(functionId);
  };
  const add = (functionId: string) => {
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    if (project.temporaryBranch) addToBranch(functionId);
    else addToProgression(functionId);
  };

  const patchTemplatePerformance = (overrides: StepPerformanceOverrides) => {
    if (!settingsFunctionId) return;
    const command: PatchMatrixTemplateCommand = {
      type: "matrix-template/patch",
      payload: {
        functionId: settingsFunctionId,
        performanceOverrides: overrides,
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, patchMatrixTemplate);
  };

  const patchTemplateDuration = (duration: MusicalDuration) => {
    if (!settingsFunctionId) return;
    const command: PatchMatrixTemplateCommand = {
      type: "matrix-template/patch",
      payload: {
        functionId: settingsFunctionId,
        durationOverride: duration,
        nowIso: new Date().toISOString(),
      },
    };
    store.dispatch(command, patchMatrixTemplate);
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
  const setProgressionSelection = (stepId?: string) => {
    setSettingsFunctionId(null);
    setVoicingEditorOpen(false);
    if (store.project.progression.selectedStepId === stepId) return;
    const command: SelectStepCommand = {
      type: "progression/select-step",
      payload: { ...(stepId ? { stepId } : {}), nowIso: new Date().toISOString() },
    };
    store.dispatch(command, selectStep);
  };
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
    const chordPlayback = getPreviewAuditionController()?.audition(realization.events);
    if (chordPlayback) {
      setPreviewPlayingStepId(stepId);
      const chordDurationSeconds = realization.events.reduce(
        (latest, event) => Math.max(latest, event.startSeconds + event.durationSeconds),
        0,
      );
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
    melodyProvider.setPreviewSettings(
      currentProject.melodyTrack.instrument,
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
    if (melodyProvider.state === "ready" || melodyProvider.state === "fallback") {
      playMelody();
      return;
    }
    void melodyProvider
      .prepare()
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
  const editProgressionPerformance = (stepId: string, performance: Partial<StepPerformance>) => {
    const command: EditStepPerformanceCommand = {
      type: "progression/edit-performance",
      payload: { stepId, performance, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, editStepPerformance);
  };
  const setProgressionViews = (view: CardViewId) => {
    const command: SetAllStepCardViewCommand = {
      type: "progression/set-all-card-view",
      payload: { view, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setAllStepCardView);
  };
  const replaceProgressionStep = (stepId: string, functionId: string) => {
    const command: ReplaceStepCommand = {
      type: "progression/replace-step",
      payload: { stepId, functionId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, replaceStep);
  };
  const resetProgressionStep = (stepId: string) => {
    const command: ResetStepPerformanceCommand = {
      type: "progression/reset-performance",
      payload: { stepId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, resetStepPerformance);
  };
  const removeProgressionStep = (stepId: string) => {
    const command: RemoveStepCommand = {
      type: "progression/remove-step",
      payload: { stepId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, removeStep);
  };
  const setMelodyRecipeForStep = (
    stepId: string,
    recipe: ChordMelodyRecipe,
    instrument: MelodyInstrument,
  ) => {
    const command = createSetMelodyRecipeCommand(
      stepId,
      recipe,
      new Date().toISOString(),
      instrument,
    );
    store.dispatch(command, applySetMelodyRecipe);
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

  const globalView = (view: CardViewId) => {
    const command: SetGlobalCardViewCommand = {
      type: "matrix/set-global-card-view",
      payload: { view, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setGlobalCardView);
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
    if (!audioProviderRef.current) return null;
    const melodyProvider = hasMelodyRecipe ? ensureMelodyProvider() : null;
    if (!playbackControllerRef.current) {
      const clock = audioProviderRef.current.clock;
      const metronomeProvider = new MetronomeClickProvider(audioProviderRef.current.audioCtx);
      playbackControllerRef.current = new PlaybackController({
        clock,
        pianoProvider: audioProviderRef.current,
        ...(melodyProvider ? { melodyProvider } : {}),
        metronomeProvider,
        onMelodyError: (error) => {
          setMelodyAudioError(error instanceof Error ? error.message : String(error));
        },
        transportStore,
      });
    }
    return playbackControllerRef.current;
  };

  const getPreviewAuditionController = () => {
    if (!audioProviderRef.current) return null;
    if (!previewAuditionControllerRef.current) {
      const clock = audioProviderRef.current.clock;
      previewAuditionControllerRef.current = new PreviewAuditionController({
        provider: audioProviderRef.current,
        clock,
      });
    }
    return previewAuditionControllerRef.current;
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
      try {
        await provider.preparePreview(
          previewProject.melodyTrack.instrument,
          previewProject.melodyTrack.volume,
        );
      } catch (error) {
        if (melodyPreviewRequestRef.current === requestId) {
          setMelodyAudioError(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      if (melodyPreviewRequestRef.current !== requestId) return;
      setMelodyAudioError(null);
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
      const firstStartSeconds = projection.events[0]?.startSeconds ?? 0;
      const previewEvents = projection.events.map((event) =>
        Object.freeze({
          ...event,
          startSeconds: event.startSeconds - firstStartSeconds,
        }),
      );
      const playback = getMelodyPreviewAuditionController()?.audition(previewEvents);
      if (!playback) return;
      setIsMelodyPreviewPlaying(true);
      if (melodyPreviewStopTimerRef.current !== null) {
        clearTimeout(melodyPreviewStopTimerRef.current);
      }
      const durationSeconds = previewEvents.reduce(
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
    [ensureMelodyProvider, getMelodyPreviewAuditionController],
  );

  const handlePlay = () => {
    clearStepPreviewHighlights();
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
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
    });
  };

  const handlePlayFromHere = (stepId: string) => {
    clearStepPreviewHighlights();
    previewAuditionControllerRef.current?.stop();
    melodyPreviewAuditionControllerRef.current?.stop();
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
    });
  };

  const handlePause = () => {
    playbackControllerRef.current?.pause();
  };

  const handleResume = () => {
    playbackControllerRef.current?.resume();
  };

  const handleStop = () => {
    playbackControllerRef.current?.stop();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
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

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePause, handlePlay, handleResume, store, transportState.status]);

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

  const progressionChordViews = project.progression.steps
    .filter((step): step is ChordStep => step.kind === "chord")
    .map((step) => step.cardView);
  const progressionCardView: CardViewId | "mixed" =
    progressionChordViews.length > 0 &&
    progressionChordViews.every((view) => view === progressionChordViews[0])
      ? progressionChordViews[0]!
      : "mixed";

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

  return (
    <StudioWorkspace
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
                progressionCardView={progressionCardView}
                onProgressionCardViewChange={setProgressionViews}
                showBassInStaff={project.presentation.showBassInStaff}
                onShowBassInStaffChange={changeStaffBassVisibility}
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
      statusBar={<PianoAudioStatus state={audioState} />}
      matrix={
        <HarmonicMatrix
          project={project}
          {...(activePreviewId ? { previewFunctionId: activePreviewId } : {})}
          recommendations={recommendations}
          contextualFunctionIds={contextualFunctions}
          onPreview={preview}
          onAdd={add}
          onGlobalView={globalView}
          onModuleChange={requestModuleSwitch}
          onTonicChange={changeTonic}
          onTemplateOpen={(functionId) => setSettingsFunctionId(functionId)}
          onTemplateReset={resetCard}
          onResetCurrentModule={() => resetMatrix("current-module")}
          onResetAllModules={() => resetMatrix("all-modules")}
          onStaffOctaveChange={changeMatrixStaffOctave}
        />
      }
      inspector={
        <>
          {globalSettingsVisibility.showRecommendationContext ? (
            <RecommendationInspector
              candidate={inspected}
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
          <CardTemplateInspector
            project={project}
            functionId={settingsFunctionId}
            onPerformancePatch={patchTemplatePerformance}
            onDurationChange={patchTemplateDuration}
            onReset={() => settingsFunctionId && resetCard(settingsFunctionId)}
          />
        </>
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
          />
        ) : null
      }
      onProgressionBackgroundClick={() => setProgressionSelection()}
      progression={
        <>
          <div className="progression-heading">
            <div className="progression-title-group">
              <h2>My Progression</h2>
              <div className="progression-preset-actions">
                <button
                  type="button"
                  className="secondary-btn presets-trigger-btn"
                  onClick={() => setPresetsPanelOpen(true)}
                  data-testid="progression-presets-btn"
                >
                  Presets
                </button>
                <button
                  type="button"
                  className="secondary-btn save-preset-trigger-btn"
                  onClick={() => setSavePresetDialogOpen(true)}
                  data-testid="progression-save-preset-btn"
                >
                  Save as Preset
                </button>
              </div>
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
                <TempoControls
                  tempoBpm={project.globalTiming.tempoBpm}
                  onSetTempo={changeTempo}
                  className="progression-heading-tempo"
                />
              </div>
              <PlaybackSupportControls
                loopState={loopState}
                metronomeEnabled={metronomeEnabled}
                countInEnabled={countInEnabled}
                onSetLoopMode={handleSetLoopMode}
                onToggleMetronome={() => setMetronomeEnabled((v) => !v)}
                onToggleCountIn={() => setCountInEnabled((v) => !v)}
              />
            </div>
            <BranchControls
              project={project}
              selectedBranchStepIds={selectedBranchStepIds}
              onStart={startExploration}
              onRejoin={setRejoin}
              onCommitWhole={commitWhole}
              onCommitSelected={commitSelected}
              onDiscard={discard}
            />
          </div>
          <TransportBar
            project={project}
            onSetMeter={changeMeter}
            onSetGroove={changeGroove}
            onSetStepDuration={changeStepDuration}
          />
          <ProgressionTrack
            project={project}
            currentPlayingStepIndex={
              transportState.currentStepIndex ??
              (previewPlayingStepId
                ? project.progression.steps.findIndex((step) => step.id === previewPlayingStepId)
                : null)
            }
            activeMelodyEventKey={
              transportState.activeMelodyEventKey ?? previewActiveMelodyEventKey
            }
            melodyAudioState={melodyAudioState}
            melodyAudioError={melodyAudioError}
            harmonyAudioState={audioState}
            onRetryHarmonyAudio={() => {
              const provider = audioProviderRef.current;
              if (provider) void provider.prepare();
            }}
            onRetryMelodyAudio={() => {
              const provider = ensureMelodyProvider();
              void provider.prepare().catch((error) => {
                setMelodyAudioError(error instanceof Error ? error.message : String(error));
              });
            }}
            isMelodyPreviewPlaying={isMelodyPreviewPlaying}
            onPlayMelodyPreview={playMelodyPreview}
            onStopMelodyPreview={stopMelodyPreview}
            loopState={loopState}
            onSelectStep={selectProgressionStep}
            onClearSelection={() => setProgressionSelection()}
            onEditPerformance={editProgressionPerformance}
            onSetAllViews={setProgressionViews}
            onRemove={removeProgressionStep}
            onReorder={reorderProgressionStep}
            onAddRest={addRest}
            onFocusMatrix={() => {
              const matrix = document.querySelector<HTMLElement>('[aria-label="Harmonic Matrix"]');
              matrix
                ?.querySelector<HTMLButtonElement>('[data-testid^="chord-card-"] button')
                ?.focus();
            }}
            onFillGapWithRest={fillProgressionGapWithRest}
            onExtendFinalChord={extendFinalChordToBar}
            onRepeatFinalChord={repeatFinalChordToBar}
            onSetMelodyRecipe={setMelodyRecipeForStep}
            onRemoveMelodyRecipe={removeMelodyRecipeForStep}
            onHarmonyTrackSettingsChange={changeHarmonyTrackSettings}
            onMelodyTrackSettingsChange={changeMelodyTrackSettings}
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
            onClose={() => setPresetsPanelOpen(false)}
            onOpenApplyDialog={(preset) => {
              setApplyDialogPreset(preset);
            }}
            onOpenSaveDialog={() => {
              setSavePresetDialogOpen(true);
            }}
            onDeleteCustomPreset={handleDeleteCustomPreset}
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
        </>
      }
    />
  );
}
