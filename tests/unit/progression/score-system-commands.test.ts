import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  reorderSteps,
  insertStepsAfter,
  insertStepsBefore,
  batchPatchSteps,
  restoreProgression,
  type ReorderStepsCommand,
  type InsertStepsAfterCommand,
  type InsertStepsBeforeCommand,
  type BatchPatchStepsCommand,
  type RestoreProgressionCommand,
  type StepPatch,
} from "../../../src/app/commands/progressionCommands";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { meter } from "../../../src/domain/timing/meter";
import { groove } from "../../../src/domain/timing/swing";
import { PlaybackController } from "../../../src/audio/playbackController";
import { TransportStore } from "../../../src/ui/transport/transportStore";
import type { AudioClock, AudioNoteEvent, AudioProvider, ScheduledPlayback } from "../../../src/audio/contracts";
import type { Project } from "../../../src/domain/project/project";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";

const T0 = "2026-09-13T12:00:00.000Z";
const T1 = "2026-09-13T12:00:01.000Z";

function withSteps(project: Project, steps: readonly (ChordStep | RestStep)[]): Project {
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze([...steps]) }),
  });
}

class FakeAudioClock implements AudioClock {
  currentTime: number;
  constructor(initial = 0) {
    this.currentTime = initial;
  }
  now(): number {
    return this.currentTime;
  }
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

class MockAudioProvider implements AudioProvider {
  state = "ready" as const;
  scheduledBatches: Array<{
    id: string;
    events: AudioNoteEvent[];
  }> = [];

  async prepare(): Promise<void> {}

  schedule(events: readonly AudioNoteEvent[]): ScheduledPlayback {
    const id = `batch-${this.scheduledBatches.length + 1}`;
    this.scheduledBatches.push({ id, events: [...events] });
    return {
      id,
      cancel: () => {},
    };
  }

  stop(): void {}
  async dispose(): Promise<void> {}
}

describe("Score System Commands & Playback", () => {
  describe("reorderSteps", () => {
    it("reorders steps and supports inverse undo/redo", () => {
      const base = createDefaultProject("p-reorder", "Test Reorder", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const s2 = createMatrixChordStep(base, "IV", "step-2");
      const s3 = createMatrixChordStep(base, "V", "step-3");
      const initial = withSteps(base, [s1, s2, s3]);

      // Move system down: swap [s1] and [s2, s3] -> [s2, s3, s1]
      const command: ReorderStepsCommand = {
        type: "progression/reorder-steps",
        payload: { steps: [s2, s3, s1], nowIso: T1 },
      };

      const result = reorderSteps(initial, command);
      expect(result.project.progression.steps.map((s) => s.id)).toEqual(["step-2", "step-3", "step-1"]);
      expect(result.inverse.type).toBe("progression/restore");

      // Undo
      const restored = restoreProgression(result.project, result.inverse as RestoreProgressionCommand).project;
      expect(restored.progression.steps.map((s) => s.id)).toEqual(["step-1", "step-2", "step-3"]);
    });

    it("throws if reordered steps do not match the existing step set", () => {
      const base = createDefaultProject("p-reorder-invalid", "Test Reorder Invalid", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const s2 = createMatrixChordStep(base, "IV", "step-2");
      const initial = withSteps(base, [s1, s2]);

      const invalidCommand: ReorderStepsCommand = {
        type: "progression/reorder-steps",
        payload: { steps: [s1], nowIso: T1 },
      };
      expect(() => reorderSteps(initial, invalidCommand)).toThrow(/must match/);
    });
  });

  describe("insertStepsAfter", () => {
    it("inserts empty rests or copied steps after a given step with undo", () => {
      const base = createDefaultProject("p-insert", "Test Insert", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const s2 = createMatrixChordStep(base, "V", "step-2");
      const initial = withSteps(base, [s1, s2]);

      const restStep: RestStep = Object.freeze({
        id: "rest-1",
        kind: "rest",
        duration: musicalDuration(rational(4, 1)),
      });

      const command: InsertStepsAfterCommand = {
        type: "progression/insert-steps-after",
        payload: { afterStepId: "step-1", steps: [restStep], nowIso: T1 },
      };

      const result = insertStepsAfter(initial, command);
      expect(result.project.progression.steps.map((s) => s.id)).toEqual(["step-1", "rest-1", "step-2"]);
      expect(result.inverse.type).toBe("progression/restore");

      // Undo
      const restored = restoreProgression(result.project, result.inverse as RestoreProgressionCommand).project;
      expect(restored.progression.steps.map((s) => s.id)).toEqual(["step-1", "step-2"]);
    });

    it("throws if afterStepId is not found", () => {
      const base = createDefaultProject("p-insert-err", "Test Insert Err", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const initial = withSteps(base, [s1]);

      const command: InsertStepsAfterCommand = {
        type: "progression/insert-steps-after",
        payload: { afterStepId: "nonexistent", steps: [], nowIso: T1 },
      };
      expect(() => insertStepsAfter(initial, command)).toThrow(/not found/);
    });
  });

  describe("insertStepsBefore", () => {
    it("inserts steps before a given step with undo", () => {
      const base = createDefaultProject("p-insert-before", "Test Insert Before", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const s2 = createMatrixChordStep(base, "V", "step-2");
      const initial = withSteps(base, [s1, s2]);

      const restStep: RestStep = Object.freeze({
        id: "rest-0",
        kind: "rest",
        duration: musicalDuration(rational(4, 1)),
      });

      const command: InsertStepsBeforeCommand = {
        type: "progression/insert-steps-before",
        payload: { beforeStepId: "step-2", steps: [restStep], nowIso: T1 },
      };

      const result = insertStepsBefore(initial, command);
      expect(result.project.progression.steps.map((s) => s.id)).toEqual(["step-1", "rest-0", "step-2"]);
      expect(result.inverse.type).toBe("progression/restore");

      // Undo
      const restored = restoreProgression(result.project, result.inverse as RestoreProgressionCommand).project;
      expect(restored.progression.steps.map((s) => s.id)).toEqual(["step-1", "step-2"]);
    });

    it("throws if beforeStepId is not found", () => {
      const base = createDefaultProject("p-insert-err2", "Test Insert Err 2", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const initial = withSteps(base, [s1]);

      const command: InsertStepsBeforeCommand = {
        type: "progression/insert-steps-before",
        payload: { beforeStepId: "nonexistent", steps: [], nowIso: T1 },
      };
      expect(() => insertStepsBefore(initial, command)).toThrow(/not found/);
    });
  });

  describe("batchPatchSteps", () => {
    it("patches performance (octave, articulation) across specific steps with undo", () => {
      const base = createDefaultProject("p-patch", "Test Patch", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const s2 = createMatrixChordStep(base, "IV", "step-2");
      const s3 = createMatrixChordStep(base, "V", "step-3");
      const initial = withSteps(base, [s1, s2, s3]);

      const updates: Array<{ stepId: string; patch: StepPatch }> = [
        { stepId: "step-1", patch: { performance: { articulation: "arp-up", register: 1 } } },
        { stepId: "step-2", patch: { performance: { articulation: "arp-up", register: 1 } } },
      ];

      const command: BatchPatchStepsCommand = {
        type: "progression/batch-patch-steps",
        payload: { updates, nowIso: T1 },
      };

      const result = batchPatchSteps(initial, command);
      const patched = result.project.progression.steps as readonly ChordStep[];
      expect(patched[0]!.performance.articulation).toBe("arp-up");
      expect(patched[0]!.performance.register).toBe(1);
      expect(patched[1]!.performance.articulation).toBe("arp-up");
      expect(patched[1]!.performance.register).toBe(1);
      expect(patched[2]!.performance.articulation).toBe("humanized"); // unchanged

      // Undo
      const restored = restoreProgression(result.project, result.inverse as RestoreProgressionCommand).project;
      const reverted = restored.progression.steps as readonly ChordStep[];
      expect(reverted[0]!.performance.articulation).toBe(s1.performance.articulation);
      expect(reverted[0]!.performance.register).toBe(s1.performance.register);
    });

    it("resets performance to default values", () => {
      const base = createDefaultProject("p-reset-perf", "Test Reset Perf", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const modifiedS1: ChordStep = {
        ...s1,
        performance: { ...s1.performance, articulation: "broken-chord", register: 2, masterVelocity: 110 },
      };
      const initial = withSteps(base, [modifiedS1]);

      const command: BatchPatchStepsCommand = {
        type: "progression/batch-patch-steps",
        payload: {
          updates: [
            {
              stepId: "step-1",
              patch: {
                performance: {
                  articulation: DEFAULT_PIANO_PERFORMANCE.articulation,
                  register: DEFAULT_PIANO_PERFORMANCE.register,
                  voicingMode: DEFAULT_PIANO_PERFORMANCE.voicingMode,
                  bass: DEFAULT_PIANO_PERFORMANCE.bass,
                  masterVelocity: DEFAULT_PIANO_PERFORMANCE.masterVelocity,
                },
              },
            },
          ],
          nowIso: T1,
        },
      };

      const result = batchPatchSteps(initial, command);
      const step = result.project.progression.steps[0] as ChordStep;
      expect(step.performance.articulation).toBe("humanized");
      expect(step.performance.register).toBe("auto");
      expect(step.performance.masterVelocity).toBe(80);
    });

    it("applies and clears melody recipes across steps", () => {
      const base = createDefaultProject("p-melody", "Test Melody", T0);
      const s1 = createMatrixChordStep(base, "I", "step-1");
      const s2 = createMatrixChordStep(base, "V", "step-2");
      const initial = withSteps(base, [s1, s2]);

      // Apply melody contour
      const applyCmd: BatchPatchStepsCommand = {
        type: "progression/batch-patch-steps",
        payload: {
          updates: [
            {
              stepId: "step-1",
              patch: {
                melody: {
                  pitchMotion: "up",
                  rhythm: "even",
                  connection: "retrigger",
                  grid: "eighth",
                  octaveOffset: 0,
                },
              },
            },
            {
              stepId: "step-2",
              patch: {
                melody: {
                  pitchMotion: "up",
                  rhythm: "even",
                  connection: "retrigger",
                  grid: "eighth",
                  octaveOffset: 0,
                },
              },
            },
          ],
          nowIso: T1,
        },
      };
      const withMelody = batchPatchSteps(initial, applyCmd);
      const step1 = withMelody.project.progression.steps[0] as ChordStep;
      expect(step1.melody).toEqual({
        pitchMotion: "up",
        rhythm: "even",
        connection: "retrigger",
        grid: "eighth",
        octaveOffset: 0,
      });

      // Clear melody contour
      const clearCmd: BatchPatchStepsCommand = {
        type: "progression/batch-patch-steps",
        payload: {
          updates: [
            { stepId: "step-1", patch: { melody: null } },
            { stepId: "step-2", patch: { melody: null } },
          ],
          nowIso: "2026-09-13T12:00:02.000Z",
        },
      };
      const cleared = batchPatchSteps(withMelody.project, clearCmd);
      const clearedStep1 = cleared.project.progression.steps[0] as ChordStep;
      expect(clearedStep1.melody).toBeUndefined();
    });
  });

  describe("PlaybackController with mutedStepIds", () => {
    it("filters out audio events for muted step IDs while unmuted steps play", () => {
      const clock = new FakeAudioClock(0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();
      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10,
        tickIntervalMs: 25,
      });

      const base = createDefaultProject("p-play-mute", "Test Play Mute", T0);
      const s1 = createMatrixChordStep(base, "I", "step-mute-1");
      const s2 = createMatrixChordStep(base, "V", "step-play-2");

      controller.start({
        steps: [s1, s2],
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        mutedStepIds: new Set(["step-mute-1"]),
      });

      expect(provider.scheduledBatches.length).toBeGreaterThan(0);
      const allEvents = provider.scheduledBatches.flatMap((b) => b.events);

      // Verify that no event belongs to step-mute-1
      const mutedEvents = allEvents.filter(
        (e) => e.sourceStepId === "step-mute-1" || e.stepIndex === 0,
      );
      expect(mutedEvents).toHaveLength(0);

      // Verify that step-play-2 has events scheduled
      const unmutedEvents = allEvents.filter(
        (e) => e.sourceStepId === "step-play-2" || e.stepIndex === 1,
      );
      expect(unmutedEvents.length).toBeGreaterThan(0);

      controller.stop();
    });
  });
});
