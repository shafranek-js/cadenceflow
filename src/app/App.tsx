import { useEffect, useMemo, useRef, useState } from "react";
import { AppStore } from "./appStore";
import { addMatrixPreview, type AddMatrixPreviewCommand } from "./commands/matrixCommands";
import {
  setCardViewOverride,
  setGlobalCardView,
  type SetCardViewOverrideCommand,
  type SetGlobalCardViewCommand,
} from "./commands/matrixViewCommands";
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
import type { CardViewId, StepPerformance } from "../domain/progression/step";
import { HarmonicMatrix } from "../ui/matrix/HarmonicMatrix";
import { ModuleSwitchDialog } from "../ui/matrix/ModuleSwitchDialog";
import { RecommendationInspector } from "../ui/inspector/RecommendationInspector";
import { HarmonyDetails } from "../ui/inspector/HarmonyDetails";
import { CompositionIntentControl } from "../ui/inspector/CompositionIntentControl";
import { BranchComparison } from "../ui/progression/BranchComparison";
import { BranchControls } from "../ui/progression/BranchControls";
import { ProgressionTrack } from "../ui/progression/ProgressionTrack";
import { CardTemplateInspector } from "../ui/inspector/CardTemplateInspector";
import { PianoPerformanceInspector } from "../ui/inspector/PianoPerformanceInspector";
import { PianoVoicingEditor } from "../ui/piano/PianoVoicingEditor";
import { PianoAudioStatus } from "../ui/header/PianoAudioStatus";
import { HqSamplePianoProvider } from "../audio/hq-sample-piano/provider";
import type { AudioProviderState } from "../audio/contracts";
import { realizeProgressionStepPitches } from "../instruments/piano/profile";
import type { ChordStep } from "../domain/progression/step";
import { TransportBar } from "../ui/transport/TransportBar";
import { TransportStore, type TransportState } from "../ui/transport/transportStore";
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
import { MetronomeClickProvider } from "../audio/metronome";
import type { Meter, MeterChangePolicy } from "../domain/timing/meter";
import type { GrooveSettings } from "../domain/timing/swing";
import type { MusicalDuration } from "../domain/timing/duration";
import {
  setTempo,
  setMeter,
  setGroove,
  setStepDuration,
  type SetTempoCommand,
  type SetMeterCommand,
  type SetGrooveCommand,
  type SetStepDurationCommand,
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
  setStepCardView,
  type AddRestStepCommand,
  type EditStepPerformanceCommand,
  type RemoveStepCommand,
  type ReorderStepCommand,
  type ReplaceStepCommand,
  type ResetStepPerformanceCommand,
  type SelectStepCommand,
  type SetAllStepCardViewCommand,
  type SetStepCardViewCommand,
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
    };
  }, []);

  useEffect(() => {
    const provider = new HqSamplePianoProvider({
      onStateChange: (s) => setAudioState(s),
    });
    audioProviderRef.current = provider;
    setAudioState("loading");
    provider.prepare().catch(() => {
      // Handled and reflected in provider state
    });
  }, []);

  const selectedProgressionStep = project.progression.selectedStepId
    ? project.progression.steps.find(
        (s): s is ChordStep => s.id === project.progression.selectedStepId && s.kind === "chord",
      )
    : undefined;

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
    if (project.temporaryBranch) {
      addToBranch(functionId);
    } else {
      store.selectMatrixPreview(functionId);
    }
    auditionMatrixCard(functionId);
  };
  const add = (functionId: string) =>
    project.temporaryBranch ? addToBranch(functionId) : addToProgression(functionId);

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
  const selectProgressionStep = (stepId: string) => {
    const command: SelectStepCommand = {
      type: "progression/select-step",
      payload: { stepId, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, selectStep);
  };
  const editProgressionPerformance = (stepId: string, performance: Partial<StepPerformance>) => {
    const command: EditStepPerformanceCommand = {
      type: "progression/edit-performance",
      payload: { stepId, performance, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, editStepPerformance);
  };
  const setProgressionStepView = (stepId: string, view: CardViewId) => {
    const command: SetStepCardViewCommand = {
      type: "progression/set-card-view",
      payload: { stepId, view, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setStepCardView);
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
  const reorderProgressionStep = (stepId: string, targetIndex: number) => {
    const command: ReorderStepCommand = {
      type: "progression/reorder-step",
      payload: { stepId, targetIndex, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, reorderStep);
  };
  const addRest = () => {
    const command: AddRestStepCommand = {
      type: "progression/add-rest",
      payload: { stepId: crypto.randomUUID(), nowIso: new Date().toISOString() },
    };
    store.dispatch(command, addRestStep);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (store.canUndo) {
          e.preventDefault();
          store.undo();
        }
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")
      ) {
        if (store.canRedo) {
          e.preventDefault();
          store.redo();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);

  const globalView = (view: CardViewId) => {
    const command: SetGlobalCardViewCommand = {
      type: "matrix/set-global-card-view",
      payload: { view, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setGlobalCardView);
  };
  const cardView = (functionId: string, view: CardViewId) => {
    const command: SetCardViewOverrideCommand = {
      type: "matrix/set-card-view-override",
      payload: { functionId, view, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setCardViewOverride);
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
    if (!playbackControllerRef.current) {
      const clock = audioProviderRef.current.clock;
      const metronomeProvider = new MetronomeClickProvider(audioProviderRef.current.audioCtx);
      playbackControllerRef.current = new PlaybackController({
        clock,
        pianoProvider: audioProviderRef.current,
        metronomeProvider,
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

  const handlePlay = () => {
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
    });
  };

  const handlePlayFromHere = (stepId: string) => {
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
    const command: SetStepDurationCommand = {
      type: "timing/set-step-duration",
      payload: { stepId, duration, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, setStepDuration);
  };

  const handleSetLoopMode = (mode: LoopMode) => {
    setLoopState((prev) => setLoopMode(prev, mode, project.progression.steps));
  };

  const handleSetLoopRange = (startStepId: string, endStepId: string) => {
    try {
      setLoopState(setLoopRange(startStepId, endStepId, project.progression.steps));
    } catch {
      // Ignore invalid range
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
    const command: ApplyPresetCommand = {
      type: "presets/apply",
      payload: { preset, mode, nowIso: new Date().toISOString() },
    };
    store.dispatch(command, applyPreset);
    setApplyDialogPreset(null);
    setPresetsPanelOpen(false);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <strong>CadenceFlow</strong>
        <span>
          {project.activeModule === "progressions"
            ? "Progressions · Major"
            : "Dark Harmony · Tonal Minor"}
        </span>
        {project.temporaryBranch ? (
          <span className="branch-status">What-if branch active</span>
        ) : null}
        <PianoAudioStatus state={audioState} />
      </header>
      <TransportBar
        project={project}
        transportState={transportState}
        loopState={loopState}
        metronomeEnabled={metronomeEnabled}
        countInEnabled={countInEnabled}
        onPlay={handlePlay}
        onPlayFromHere={handlePlayFromHere}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onSetTempo={changeTempo}
        onSetMeter={changeMeter}
        onSetGroove={changeGroove}
        onSetStepDuration={changeStepDuration}
        onSetLoopMode={handleSetLoopMode}
        onSetLoopRange={handleSetLoopRange}
        onToggleMetronome={() => setMetronomeEnabled((v) => !v)}
        onToggleCountIn={() => setCountInEnabled((v) => !v)}
        onUndo={() => store.undo()}
        canUndo={store.canUndo}
        onRedo={() => store.redo()}
        canRedo={store.canRedo}
      />
      <div className="studio-grid">
        <HarmonicMatrix
          project={project}
          {...(activePreviewId ? { previewFunctionId: activePreviewId } : {})}
          recommendations={recommendations}
          contextualFunctionIds={contextualFunctions}
          onPreview={preview}
          onAdd={add}
          onCardView={cardView}
          onGlobalView={globalView}
          onModuleChange={requestModuleSwitch}
          onTonicChange={changeTonic}
          onSettingsOpen={(functionId) => setSettingsFunctionId(functionId)}
          onResetCard={resetCard}
          onResetCurrentModule={() => resetMatrix("current-module")}
          onResetAllModules={() => resetMatrix("all-modules")}
        />
        <aside className="inspector-stack">
          <RecommendationInspector
            candidate={inspected}
            mode={project.presentation.expertiseMode}
          />
          <CompositionIntentControl
            value={project.temporaryBranch?.compositionIntent ?? "neutral"}
            disabled={!project.temporaryBranch}
            onChange={changeIntent}
          />
          <CardTemplateInspector
            project={project}
            functionId={settingsFunctionId}
            onPerformancePatch={patchTemplatePerformance}
            onReset={() => settingsFunctionId && resetCard(settingsFunctionId)}
          />
          {selectedProgressionStep && (
            <PianoPerformanceInspector
              step={selectedProgressionStep}
              tonic={project.tonic}
              context={{
                tonic: project.tonic,
                mode: getHarmonicModule(project.activeModule).mode,
                moduleId: project.activeModule,
                spellingContext: {
                  tonic: project.tonic,
                  mode: getHarmonicModule(project.activeModule).mode,
                },
              }}
              onPerformanceChange={(perf) =>
                editProgressionPerformance(selectedProgressionStep.id, perf)
              }
              onOpenVoicingEditor={() => setVoicingEditorOpen(true)}
            />
          )}
          <HarmonyDetails chord={previewChord} />
        </aside>
      </div>
      <section className="progression-strip" aria-label="My Progression">
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
        <ProgressionTrack
          project={project}
          currentPlayingStepIndex={transportState.currentStepIndex}
          loopState={loopState}
          {...(matrixSession.previewFunctionId
            ? { previewFunctionId: matrixSession.previewFunctionId }
            : {})}
          onSelectStep={selectProgressionStep}
          onEditPerformance={editProgressionPerformance}
          onSetStepView={setProgressionStepView}
          onSetAllViews={setProgressionViews}
          onReplace={replaceProgressionStep}
          onReset={resetProgressionStep}
          onRemove={removeProgressionStep}
          onReorder={reorderProgressionStep}
          onAddRest={addRest}
        />
        <BranchComparison
          project={project}
          selectedStepIds={selectedBranchStepIds}
          onSelectedStepIdsChange={(ids) => setSelectedBranchStepIds(Object.freeze(ids))}
        />
      </section>
      {pendingSwitch ? (
        <ModuleSwitchDialog
          plan={pendingSwitch}
          onCancel={() => setPendingSwitch(null)}
          onConfirm={(resolutions) =>
            applyModuleSwitch(pendingSwitch.destinationModule, resolutions)
          }
        />
      ) : null}
      {voicingEditorOpen && selectedProgressionStep && (
        <PianoVoicingEditor
          isOpen={voicingEditorOpen}
          stepLabel={selectedProgressionStep.harmonicFunction.functionId}
          initialPitches={
            selectedProgressionStep.performance.manualVoicing?.length
              ? selectedProgressionStep.performance.manualVoicing
              : realizeProgressionStepPitches(selectedProgressionStep, project.tonic)
          }
          onClose={() => setVoicingEditorOpen(false)}
          onSave={(pitches) => {
            editProgressionPerformance(selectedProgressionStep.id, {
              voicingMode: "manual",
              manualVoicing: pitches,
            });
          }}
          onResetToAuto={() => {
            editProgressionPerformance(selectedProgressionStep.id, {
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
    </main>
  );
}
