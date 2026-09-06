// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../src/domain/project/factory";
import { AppStore } from "../../src/app/appStore";
import {
  realizeMatrixCardPreview,
  resolvePreviousHarmonicContext,
} from "../../src/ui/matrix/previewRealization";
import { projectPitchesToStaff } from "../../src/notation/staffProjection";
import { PreviewAuditionController } from "../../src/audio/previewAudition";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  ScheduledPlayback,
} from "../../src/audio/contracts";
import { patchMatrixTemplate } from "../../src/app/commands/matrixTemplateCommands";
import { addMatrixPreview } from "../../src/app/commands/matrixCommands";
import { ChordCard } from "../../src/ui/chord-card/ChordCard";

interface MockProviderOptions {
  state?: "idle" | "loading" | "ready" | "fallback" | "error";
  throwOnSchedule?: boolean;
}

function createMockAudioProvider(options: MockProviderOptions = {}): {
  provider: InstrumentAudioProvider;
  scheduledPlaybacks: ScheduledPlayback[];
  cancelSpies: Array<ReturnType<typeof vi.fn>>;
  lastScheduledEvents: AudioNoteEvent[] | null;
} {
  const scheduledPlaybacks: ScheduledPlayback[] = [];
  const cancelSpies: Array<ReturnType<typeof vi.fn>> = [];
  let lastScheduledEvents: AudioNoteEvent[] | null = null;
  let counter = 0;

  const provider: InstrumentAudioProvider = {
    id: "mock-piano-provider",
    state: options.state ?? "ready",
    async prepare() {},
    schedule(events: readonly AudioNoteEvent[], _clock: AudioClock): ScheduledPlayback {
      if (options.throwOnSchedule) {
        throw new Error("Simulated WebAudio scheduling failure");
      }
      lastScheduledEvents = [...events];
      counter++;
      const cancelSpy = vi.fn();
      cancelSpies.push(cancelSpy);
      const playback: ScheduledPlayback = {
        id: `playback-${counter}`,
        cancel: cancelSpy,
        ready: Promise.resolve(),
      };
      scheduledPlaybacks.push(playback);
      return playback;
    },
    stop() {
      for (const p of scheduledPlaybacks) {
        p.cancel();
      }
    },
    async dispose() {},
  };

  return {
    provider,
    scheduledPlaybacks,
    cancelSpies,
    get lastScheduledEvents() {
      return lastScheduledEvents;
    },
  };
}

describe("Matrix Card Audition Integration Suite (FR-016 / US1 Corrective Acceptance)", () => {
  it("Item 1 & 2 & 3: Matrix card activation schedules audible note events, leaves Progression and History unchanged", () => {
    const project = createDefaultProject("proj-audition-1", "Audition Test Project");
    const store = new AppStore(project);
    const mock = createMockAudioProvider({ state: "ready" });
    const controller = new PreviewAuditionController({ provider: mock.provider });

    const functionId = "I";
    // 1. Establish preview context & realization
    store.selectMatrixPreview(functionId);
    const previous = resolvePreviousHarmonicContext(store.project);
    const preview = realizeMatrixCardPreview(store.project, functionId, previous);

    // Audition the card
    const playback = controller.audition(preview.events);

    // 1. Assert audible note events scheduled
    expect(playback).not.toBeNull();
    expect(mock.lastScheduledEvents).not.toBeNull();
    expect(mock.lastScheduledEvents!.length).toBeGreaterThan(0);
    for (const evt of mock.lastScheduledEvents!) {
      expect(evt.pitch).toBeGreaterThanOrEqual(21);
      expect(evt.pitch).toBeLessThanOrEqual(108);
      expect(evt.startSeconds).toBeGreaterThanOrEqual(0);
      expect(evt.durationSeconds).toBeGreaterThan(0);
      expect(evt.velocity).toBeGreaterThan(0);
    }

    // 2. Progression remains completely unchanged (0 steps)
    expect(store.project.progression.steps.length).toBe(0);

    // 3. History remains completely unchanged (no undo/redo entries)
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);

    controller.dispose();
  });

  it("Item 4 & 5: Exact scheduled pitches match preview Piano Card View and Staff projection DTOs", () => {
    const project = createDefaultProject("proj-audition-2", "Pitch Equivalence Test");
    const previous = resolvePreviousHarmonicContext(project);

    // Test across several harmonic functions: I, IV, V, vi
    const testFunctions = ["I", "IV", "V", "vi"];
    for (const functionId of testFunctions) {
      const preview = realizeMatrixCardPreview(project, functionId, previous);

      // Piano Card View pitches
      const pianoViewMidi = preview.pitches.map((p) => p.midiNumber);

      // Staff Card View projection pitches
      const staffProjection = projectPitchesToStaff(preview.pitches);
      const staffViewMidi = staffProjection.notes.map((n) => n.midiNumber);

      // Audition AudioNoteEvent pitches
      const audioEventMidi = preview.events.map((e) => e.pitch);

      // INVARIANT: All three projections share the identical unique sorted set of MIDI pitches
      const sortedPiano = [...new Set(pianoViewMidi)].sort((a, b) => a - b);
      const sortedStaff = [...new Set(staffViewMidi)].sort((a, b) => a - b);
      const sortedAudio = [...new Set(audioEventMidi)].sort((a, b) => a - b);

      expect(sortedPiano).toEqual(sortedAudio);
      expect(sortedStaff).toEqual(sortedAudio);
    }
  });

  it("Item 6: Master and per-note velocity follow resolved preview performance template", () => {
    let project = createDefaultProject("proj-audition-3", "Velocity Performance Test");

    // Patch template for "I" with custom masterVelocity = 112 and perNoteVelocityOverrides
    const patched = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: {
        functionId: "I",
        performanceOverrides: {
          masterVelocity: 112,
          perNoteVelocityOverrides: {
            "60": 125, // Accent C4
          },
        },
        nowIso: new Date().toISOString(),
      },
    });
    project = patched.project;

    const preview = realizeMatrixCardPreview(project, "I");

    // Check that velocity in events matches the template overrides
    const c4Event = preview.events.find((e) => e.pitch === 60);
    expect(c4Event).toBeDefined();
    expect(c4Event!.velocity).toBe(125);

    const otherEvents = preview.events.filter((e) => e.pitch !== 60);
    expect(otherEvents.length).toBeGreaterThan(0);
    for (const evt of otherEvents) {
      expect(evt.velocity).toBe(112);
    }
  });

  it("Item 7: Quick second card click replaces/cancels previous preview scope appropriately", () => {
    const project = createDefaultProject("proj-audition-4", "Scope Cancellation Test");
    const mock = createMockAudioProvider({ state: "ready" });
    const controller = new PreviewAuditionController({ provider: mock.provider });

    // First click: Chord I
    const previewI = realizeMatrixCardPreview(project, "I");
    const playback1 = controller.audition(previewI.events);
    expect(playback1).not.toBeNull();
    expect(mock.cancelSpies[0]).not.toHaveBeenCalled();

    // Quick second click: Chord IV
    const previewIV = realizeMatrixCardPreview(project, "IV");
    const playback2 = controller.audition(previewIV.events);
    expect(playback2).not.toBeNull();

    // Assert playback1 was cancelled immediately
    expect(mock.cancelSpies[0]).toHaveBeenCalledTimes(1);

    // Active playback is now playback2
    expect(controller.currentPlayback?.id).toBe(playback2?.id);
    expect(mock.cancelSpies[1]).not.toHaveBeenCalled();

    controller.dispose();
  });

  it("Item 8: Same-card repeated click schedules a fresh attack and cancels the previous playback", () => {
    const project = createDefaultProject("proj-audition-5", "Repeated Click Test");
    const mock = createMockAudioProvider({ state: "ready" });
    const controller = new PreviewAuditionController({ provider: mock.provider });

    const preview = realizeMatrixCardPreview(project, "I");

    // Click 1: Chord I
    const playback1 = controller.audition(preview.events);
    expect(playback1).not.toBeNull();
    expect(mock.cancelSpies[0]).not.toHaveBeenCalled();

    // Click 2: Chord I again (same card remains selected, but re-triggers fresh audition)
    const playback2 = controller.audition(preview.events);
    expect(playback2).not.toBeNull();
    expect(playback2?.id).not.toBe(playback1?.id);

    // Prior attack was cancelled
    expect(mock.cancelSpies[0]).toHaveBeenCalledTimes(1);

    // New playback is active
    expect(controller.currentPlayback?.id).toBe(playback2?.id);

    controller.dispose();
  });

  it("Item 9: Explicit Add does not trigger duplicate audition; Card Body does not Add to Progression", () => {
    const project = createDefaultProject("proj-audition-6", "Add vs Audition Isolation");
    const store = new AppStore(project);

    // Verify initial state
    expect(store.project.progression.steps.length).toBe(0);

    // Simulate Card Body click -> select preview only
    store.selectMatrixPreview("I");
    expect(store.matrixSession.previewFunctionId).toBe("I");
    expect(store.project.progression.steps.length).toBe(0);

    // Simulate explicit Add button click -> adds step to progression
    store.dispatch(
      {
        type: "matrix/add-preview",
        payload: { functionId: "I", stepId: "step-1", nowIso: new Date().toISOString() },
      },
      addMatrixPreview,
    );

    expect(store.project.progression.steps.length).toBe(1);
    expect(store.project.progression.steps[0]?.harmonicFunction.functionId).toBe("I");
  });

  it("Item 10: Provider failure fails gracefully without mutating Project or throwing unhandled errors", () => {
    const project = createDefaultProject("proj-audition-7", "Provider Error Resilience");
    const store = new AppStore(project);

    // Mock provider with throwing schedule
    const mockThrow = createMockAudioProvider({ state: "ready", throwOnSchedule: true });
    const controllerThrow = new PreviewAuditionController({ provider: mockThrow.provider });

    const preview = realizeMatrixCardPreview(project, "I");

    // Audition must not throw uncaught error
    let result: ScheduledPlayback | null = null;
    expect(() => {
      result = controllerThrow.audition(preview.events);
    }).not.toThrow();

    expect(result).toBeNull();
    expect(store.project.progression.steps.length).toBe(0);

    // Mock provider with error state
    const mockError = createMockAudioProvider({ state: "error" });
    const controllerError = new PreviewAuditionController({ provider: mockError.provider });

    expect(() => {
      result = controllerError.audition(preview.events);
    }).not.toThrow();

    expect(result).toBeNull();
    expect(store.project.progression.steps.length).toBe(0);

    controllerThrow.dispose();
    controllerError.dispose();
  });

  it("Item 11: ChordCard UI event boundaries and accessible keyboard activation (Enter & Space)", () => {
    const project = createDefaultProject("proj-audition-ui", "UI Interaction Test");
    const onSelectSpy = vi.fn();
    const onAddSpy = vi.fn();
    const preview = realizeMatrixCardPreview(project, "I");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        React.createElement(ChordCard, {
          model: {
            chord: preview.chord,
            realizedPitches: preview.pitches,
            recommendationStatus: "none",
          },
          view: "harmonic",
          selected: false,
          customizedCount: 0,
          onSelect: onSelectSpy,
          onAdd: onAddSpy,
          onViewChange: () => {},
          onSettingsOpen: () => {},
          onReset: () => {},
        }),
      );
    });

    const cardBodyButton = container.querySelector(".chord-main") as HTMLButtonElement;
    const addButton = container.querySelector(".add-chord") as HTMLButtonElement;

    expect(cardBodyButton).not.toBeNull();
    expect(addButton).not.toBeNull();

    // 1. Mouse Click on card body triggers onSelect (audition/preview), does NOT trigger onAdd
    cardBodyButton.click();
    expect(onSelectSpy).toHaveBeenCalledTimes(1);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 2. Keyboard Enter on card body triggers onSelect (audition/preview), does NOT trigger onAdd
    cardBodyButton.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    expect(onSelectSpy).toHaveBeenCalledTimes(2);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 3. Keyboard Space on card body triggers onSelect (audition/preview), does NOT trigger onAdd
    cardBodyButton.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
    );
    expect(onSelectSpy).toHaveBeenCalledTimes(3);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 4. Click on explicit '+' button triggers onAdd, does NOT trigger onSelect (no duplicate audition)
    addButton.click();
    expect(onAddSpy).toHaveBeenCalledTimes(1);
    expect(onSelectSpy).toHaveBeenCalledTimes(3); // unchanged

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("Continuous voice leading: Preview after progression step uses contextual voice leading", () => {
    let project = createDefaultProject("proj-audition-8", "Voice Leading Context");

    // Add step I (C major)
    const added = addMatrixPreview(project, {
      type: "matrix/add-preview",
      payload: { functionId: "I", stepId: "step-1", nowIso: new Date().toISOString() },
    });
    project = added.project;

    // Resolve context from progression: previous should contain step I pitches
    const previous = resolvePreviousHarmonicContext(project);
    expect(previous).toBeDefined();
    expect(previous!.previousPitches).toBeDefined();
    expect(previous!.previousPitches!.length).toBeGreaterThan(0);

    // Realize preview for IV (F major) with previous context
    const previewWithContext = realizeMatrixCardPreview(project, "IV", previous);
    expect(previewWithContext.events.length).toBeGreaterThan(0);

    // Verify pitch consistency remains strictly valid under voice leading
    const sortedPiano = [...new Set(previewWithContext.pitches.map((p) => p.midiNumber))].sort(
      (a, b) => a - b,
    );
    const sortedAudio = [...new Set(previewWithContext.events.map((e) => e.pitch))].sort(
      (a, b) => a - b,
    );
    expect(sortedPiano).toEqual(sortedAudio);
  });
});
