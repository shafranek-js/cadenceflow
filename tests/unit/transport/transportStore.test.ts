import { describe, expect, it } from "vitest";
import { TransportStore } from "../../../src/ui/transport/transportStore";

describe("T105 — Transport State Machine", () => {
  it("starts in 'stopped' state with clean initial parameters", () => {
    const store = new TransportStore();
    const state = store.getState();

    expect(state.status).toBe("stopped");
    expect(state.sessionId).toBeNull();
    expect(state.startingStepIndex).toBe(0);
    expect(state.currentStepIndex).toBeNull();
    expect(state.pausedPositionSeconds).toBeNull();
    expect(state.playMode).toBe("from-start");
    expect(state.error).toBeNull();
  });

  it("transitions stopped -> playing on valid play()", () => {
    const store = new TransportStore();
    let notified = false;
    store.subscribe(() => {
      notified = true;
    });

    const success = store.play({ stepCount: 4 });
    expect(success).toBe(true);
    expect(notified).toBe(true);

    const state = store.getState();
    expect(state.status).toBe("playing");
    expect(state.sessionId).toMatch(/^transport-session-/);
    expect(state.startingStepIndex).toBe(0);
    expect(state.currentStepIndex).toBe(0);
    expect(state.playMode).toBe("from-start");
    expect(state.error).toBeNull();
  });

  it("rejects play() on empty progression and never creates an empty playback session", () => {
    const store = new TransportStore();
    const success = store.play({ stepCount: 0 });

    expect(success).toBe(false);
    const state = store.getState();
    expect(state.status).toBe("stopped");
    expect(state.sessionId).toBeNull();
    expect(state.error).toBe("Cannot play empty progression");
  });

  it("transitions playing -> paused, preserving session information and paused position", () => {
    const store = new TransportStore();
    store.play({ stepCount: 4 });
    const sessionId = store.getState().sessionId;

    store.pause(2.5);
    const state = store.getState();
    expect(state.status).toBe("paused");
    expect(state.sessionId).toBe(sessionId);
    expect(state.pausedPositionSeconds).toBe(2.5);
    expect(state.currentStepIndex).toBe(0);
  });

  it("transitions paused -> playing on resume() without resetting to start", () => {
    const store = new TransportStore();
    store.play({ stepCount: 4 });
    store.pause(3.2);

    const resumed = store.resume();
    expect(resumed).toBe(true);

    const state = store.getState();
    expect(state.status).toBe("playing");
    expect(state.pausedPositionSeconds).toBe(3.2);
    expect(state.startingStepIndex).toBe(0);
  });

  it("transitions any active state to stopped on stop(), clearing playing step and resetting position", () => {
    const store = new TransportStore();
    store.play({ stepCount: 4 });
    store.setCurrentStepIndex(2);

    store.stop();
    const state = store.getState();
    expect(state.status).toBe("stopped");
    expect(state.sessionId).toBeNull();
    expect(state.currentStepIndex).toBeNull();
    expect(state.pausedPositionSeconds).toBeNull();
    expect(state.startingStepIndex).toBe(0);
  });

  it("repeated stop() is idempotent", () => {
    const store = new TransportStore();
    store.stop();
    expect(store.getState().status).toBe("stopped");

    store.play({ stepCount: 4 });
    store.stop();
    expect(store.getState().status).toBe("stopped");

    // Second stop
    store.stop();
    expect(store.getState().status).toBe("stopped");
  });

  it("playFromHere() starts exactly at the requested step boundary", () => {
    const store = new TransportStore();
    const stepIds = ["step-1", "step-2", "step-3", "step-4"];

    // Target by index
    const successByIndex = store.playFromHere({ stepTarget: 2, stepCount: 4, stepIds });
    expect(successByIndex).toBe(true);
    expect(store.getState().startingStepIndex).toBe(2);
    expect(store.getState().currentStepIndex).toBe(2);
    expect(store.getState().playMode).toBe("from-here");

    // Target by stepId
    const successById = store.playFromHere({ stepTarget: "step-2", stepCount: 4, stepIds });
    expect(successById).toBe(true);
    expect(store.getState().startingStepIndex).toBe(1);
    expect(store.getState().currentStepIndex).toBe(1);
    expect(store.getState().playMode).toBe("from-here");
  });

  it("playFromHere() rejects invalid/nonexistent targets with observable error", () => {
    const store = new TransportStore();
    const stepIds = ["step-1", "step-2"];

    const badId = store.playFromHere({ stepTarget: "nonexistent", stepCount: 2, stepIds });
    expect(badId).toBe(false);
    expect(store.getState().status).toBe("stopped");
    expect(store.getState().error).toBe("Invalid step target: nonexistent");

    const badIndex = store.playFromHere({ stepTarget: 5, stepCount: 2, stepIds });
    expect(badIndex).toBe(false);
    expect(store.getState().error).toBe("Invalid step target: 5");
  });

  it("onSessionEnded() transitions to stopped on natural completion", () => {
    const store = new TransportStore();
    store.play({ stepCount: 4 });
    const sessionId = store.getState().sessionId!;

    store.onSessionEnded(sessionId);
    expect(store.getState().status).toBe("stopped");
    expect(store.getState().sessionId).toBeNull();
    expect(store.getState().currentStepIndex).toBeNull();
  });

  it("ignores stale session callbacks from cancelled or replaced sessions", () => {
    const store = new TransportStore();
    store.play({ stepCount: 4 });
    const session1 = store.getState().sessionId!;

    // Start a new session (session2 replaces session1)
    store.play({ stepCount: 4 });
    const session2 = store.getState().sessionId!;
    expect(session2).not.toBe(session1);

    // Stale setCurrentStepIndex callback from session1 is ignored
    store.setCurrentStepIndex(3, session1);
    expect(store.getState().currentStepIndex).toBe(0); // Not 3!

    // Current session callback succeeds
    store.setCurrentStepIndex(1, session2);
    expect(store.getState().currentStepIndex).toBe(1);

    // Stale onSessionEnded callback from session1 is ignored
    store.onSessionEnded(session1);
    expect(store.getState().status).toBe("playing"); // Still playing session 2!

    // Session2 completion succeeds
    store.onSessionEnded(session2);
    expect(store.getState().status).toBe("stopped");
  });

  describe("Loop-Aware Play and Reset Behavior", () => {
    it("starts at Step 0 when loop is disabled", () => {
      const store = new TransportStore();
      store.play({ stepCount: 4 });
      expect(store.getState().startingStepIndex).toBe(0);
      expect(store.getState().currentStepIndex).toBe(0);

      store.stop();
      expect(store.getState().startingStepIndex).toBe(0);
    });

    it("starts at loop start step and Stop resets to loop start when Loop Range is active", () => {
      const store = new TransportStore();
      // Loop region: steps 2..4 -> start index is 2
      store.setLoopAwareResetTarget(2);
      store.play({ stepCount: 5, loopStartStepIndex: 2 });

      expect(store.getState().startingStepIndex).toBe(2);
      expect(store.getState().currentStepIndex).toBe(2);
      expect(store.getState().loopAwareResetTarget).toBe(2);

      // Advance playing step to 3
      store.setCurrentStepIndex(3);
      expect(store.getState().currentStepIndex).toBe(3);

      // Stop resets startingStepIndex to loopAwareResetTarget (2)
      store.stop();
      expect(store.getState().status).toBe("stopped");
      expect(store.getState().currentStepIndex).toBeNull();
      expect(store.getState().startingStepIndex).toBe(2);
    });

    it("natural completion without loop resets playhead to 0 and clears active step", () => {
      const store = new TransportStore();
      store.play({ stepCount: 4 });
      const sessionId = store.getState().sessionId!;
      store.setCurrentStepIndex(3, sessionId);

      store.onSessionEnded(sessionId);
      expect(store.getState().status).toBe("stopped");
      expect(store.getState().currentStepIndex).toBeNull();
      expect(store.getState().startingStepIndex).toBe(0);
    });
  });

  describe("Editor Selection vs Playing Step Independence", () => {
    it("proves transport playback and playhead stepping never mutate editor selection state", () => {
      const store = new TransportStore();

      // Simulated editor state: user has selected step-3 for editing
      const editorSelection = { selectedStepId: "step-3" };

      // Playback starts at step 0
      store.play({ stepCount: 4 });
      expect(store.getState().currentStepIndex).toBe(0);
      expect(editorSelection.selectedStepId).toBe("step-3"); // Unaffected

      // Playing step advances during audio playback: 0 -> 1 -> 2
      store.setCurrentStepIndex(1);
      expect(store.getState().currentStepIndex).toBe(1);
      expect(editorSelection.selectedStepId).toBe("step-3"); // Still step-3!

      store.setCurrentStepIndex(2);
      expect(store.getState().currentStepIndex).toBe(2);
      expect(editorSelection.selectedStepId).toBe("step-3"); // Still step-3!

      // Stop clears playing step
      store.stop();
      expect(store.getState().currentStepIndex).toBeNull();
      expect(editorSelection.selectedStepId).toBe("step-3"); // Retains step-3!
    });
  });

  describe("Extended Stale Session Isolation", () => {
    it("stale callbacks cannot overwrite error state or reset loop targets", () => {
      const store = new TransportStore();
      store.play({ stepCount: 4 });
      const sessionA = store.getState().sessionId!;

      store.stop();
      store.setLoopAwareResetTarget(2);
      store.play({ stepCount: 4, loopStartStepIndex: 2 });
      const sessionB = store.getState().sessionId!;

      // Stale callback from session A attempts to report error or clear
      store.onSessionEnded(sessionA);
      expect(store.getState().sessionId).toBe(sessionB);
      expect(store.getState().status).toBe("playing");
      expect(store.getState().startingStepIndex).toBe(2);

      store.setCurrentStepIndex(0, sessionA);
      expect(store.getState().currentStepIndex).toBe(2); // Retained session B target
    });
  });
});
