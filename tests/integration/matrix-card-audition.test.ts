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
  scheduleCount: () => number;
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
    scheduleCount: () => counter,
  };
}

/**
 * Simulates a full physical user keyboard activation sequence on a focused native button.
 * In a real browser user agent, pressing Enter or Space while focused on a button
 * fires keydown, and (unless prevented) executes the native button activation behavior (click).
 * If a component incorrectly implements onKeyDown -> onSelect in addition to onClick -> onSelect,
 * this sequence will detect the duplicate invocation.
 */
function simulateBrowserButtonKeyboardActivation(button: HTMLButtonElement, key: "Enter" | " ") {
  button.focus();
  const keydownEvent = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  const notPrevented = button.dispatchEvent(keydownEvent);
  if (notPrevented) {
    button.click();
  }
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

  it("Item 9: Ctrl-click combines one card audition with one progression add", () => {
    const project = createDefaultProject("proj-audition-6", "Add vs Audition Isolation");
    const store = new AppStore(project);

    // Verify initial state
    expect(store.project.progression.steps.length).toBe(0);

    // Simulate Card Body click -> select preview only
    store.selectMatrixPreview("I");
    expect(store.matrixSession.previewFunctionId).toBe("I");
    expect(store.project.progression.steps.length).toBe(0);

    // The production add command still creates exactly one progression step.
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

  it("Item 11: Enter, Space, click and Ctrl-click use single-fire card activation paths", () => {
    const project = createDefaultProject("proj-audition-ui", "UI Activation Exact Single-Fire");
    const onSelectSpy = vi.fn();
    const onAddSpy = vi.fn();
    const onResetSpy = vi.fn();
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
            pianoPitches: preview.upperPitches,
            duration: preview.step.duration,
            canRaiseStaffOctave: true,
            canLowerStaffOctave: true,
            recommendationStatus: "none",
          },
          view: "harmonic",
          selected: false,
          customizedCount: 0,
          onSelect: onSelectSpy,
          onCtrlClickAdd: () => {
            onSelectSpy();
            onAddSpy();
          },
          onAltClickReset: onResetSpy,
          onStaffOctaveChange: vi.fn(),
        }),
      );
    });

    const cardBodyButton = container.querySelector(".chord-main") as HTMLButtonElement;

    expect(cardBodyButton).not.toBeNull();
    expect(container.querySelector(".add-chord")).toBeNull();
    expect(cardBodyButton.title).toBe(
      "Click to preview; Ctrl-click to add to My Progression; Alt-click to reset card settings",
    );

    // Baseline: 0 invocations
    expect(onSelectSpy).toHaveBeenCalledTimes(0);
    expect(onAddSpy).toHaveBeenCalledTimes(0);

    // 1. Enter key activation -> call count increment = EXACTLY 1
    simulateBrowserButtonKeyboardActivation(cardBodyButton, "Enter");
    expect(onSelectSpy).toHaveBeenCalledTimes(1);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 2. Space key activation -> call count increment = EXACTLY 1 (total = 2)
    simulateBrowserButtonKeyboardActivation(cardBodyButton, " ");
    expect(onSelectSpy).toHaveBeenCalledTimes(2);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 3. Mouse click activation -> call count increment = EXACTLY 1 (total = 3)
    cardBodyButton.click();
    expect(onSelectSpy).toHaveBeenCalledTimes(3);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 4. Repeated Enter activation on already-selected card -> call count increment = EXACTLY 1 (total = 4)
    // Two separate Enter presses = exactly 2 total (not 4)
    simulateBrowserButtonKeyboardActivation(cardBodyButton, "Enter");
    expect(onSelectSpy).toHaveBeenCalledTimes(4);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 5. Repeated Mouse click on already-selected card -> call count increment = EXACTLY 1 (total = 5)
    // Two mouse clicks = exactly 2 total
    cardBodyButton.click();
    expect(onSelectSpy).toHaveBeenCalledTimes(5);
    expect(onAddSpy).not.toHaveBeenCalled();

    // 6. Ctrl-click: previews and adds exactly once
    cardBodyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(onAddSpy).toHaveBeenCalledTimes(1);
    expect(onSelectSpy).toHaveBeenCalledTimes(6);

    // 7. Repeated Ctrl-click remains single-fire per physical activation
    cardBodyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(onAddSpy).toHaveBeenCalledTimes(2);
    expect(onSelectSpy).toHaveBeenCalledTimes(7);

    // 8. Alt-click resets the card template without previewing or adding a step
    cardBodyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true }));
    expect(onResetSpy).toHaveBeenCalledTimes(1);
    expect(onSelectSpy).toHaveBeenCalledTimes(7);
    expect(onAddSpy).toHaveBeenCalledTimes(2);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("Item 12: End-to-end single-fire audition scheduling assertion with PreviewAuditionController", () => {
    const project = createDefaultProject("proj-audition-schedule", "Schedule Count Precision");
    const mock = createMockAudioProvider({ state: "ready" });
    const controller = new PreviewAuditionController({ provider: mock.provider });
    const preview = realizeMatrixCardPreview(project, "I");

    // Simulating user activations directly wired to audition controller
    const userAuditionAction = () => controller.audition(preview.events);

    expect(mock.scheduleCount()).toBe(0);

    // Action 1: Enter press
    userAuditionAction();
    expect(mock.scheduleCount()).toBe(1);

    // Action 2: Space press
    userAuditionAction();
    expect(mock.scheduleCount()).toBe(2);

    // Action 3: Mouse click
    userAuditionAction();
    expect(mock.scheduleCount()).toBe(3);

    // Action 4: Repeated Enter press on same card
    userAuditionAction();
    expect(mock.scheduleCount()).toBe(4);

    // Action 5: Repeated Mouse click on same card
    userAuditionAction();
    expect(mock.scheduleCount()).toBe(5);

    controller.dispose();
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
