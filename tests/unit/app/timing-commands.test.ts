import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { meter } from "../../../src/domain/timing/meter";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { groove } from "../../../src/domain/timing/swing";
import {
  createSetStepDurationCommand,
  setMeter,
  setTempo,
  setGroove,
  setStepDuration,
  type SetMeterCommand,
  type SetTempoCommand,
  type SetGrooveCommand,
  type SetStepDurationCommand,
  restoreMeterAndSteps,
  type RestoreMeterAndStepsCommand,
} from "../../../src/app/commands/timingCommands";
import type { ChordStep } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";

describe("T102/T109 — Timing Commands Integration & Reflow Invariants", () => {
  const baseTime = "2026-09-05T00:00:00.000Z";

  function createProjectWithThreeSteps() {
    const project = createDefaultProject("test-timing-cmds", "Test Timing", baseTime);
    const m44 = meter(4, 4);

    const step1: ChordStep = {
      id: "step-1",
      kind: "chord",
      harmonicFunction: { functionId: "I", role: "tonic", category: "primary", layer: "core" },
      duration: musicalDuration(rational(4, 1)),
      cardView: "harmonic",
      performance: { articulation: "block", masterVelocity: 80 },
      harmonicContext: {
        tonic: 0,
        mode: "ionian",
        category: "primary",
        degree: "I",
        variant: EMPTY_HARMONIC_VARIANT,
      },
    };

    const step2: ChordStep = {
      id: "step-2",
      kind: "chord",
      harmonicFunction: {
        functionId: "IV",
        role: "subdominant",
        category: "primary",
        layer: "core",
      },
      duration: musicalDuration(rational(2, 1)),
      cardView: "harmonic",
      performance: { articulation: "block", masterVelocity: 80 },
      harmonicContext: {
        tonic: 0,
        mode: "ionian",
        category: "primary",
        degree: "IV",
        variant: EMPTY_HARMONIC_VARIANT,
      },
    };

    const step3: ChordStep = {
      id: "step-3",
      kind: "chord",
      harmonicFunction: { functionId: "V", role: "dominant", category: "primary", layer: "core" },
      duration: musicalDuration(rational(2, 1)),
      cardView: "harmonic",
      performance: { articulation: "block", masterVelocity: 80 },
      harmonicContext: {
        tonic: 0,
        mode: "ionian",
        category: "primary",
        degree: "V",
        variant: EMPTY_HARMONIC_VARIANT,
      },
    };

    return Object.freeze({
      ...project,
      globalTiming: Object.freeze({
        tempoBpm: 120,
        meter: m44,
      }),
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([step1, step2, step3]),
      }),
    });
  }

  describe("1. Meter Change Command (4/4 -> 3/4)", () => {
    it("Reflow: scales [4, 2, 2] to [3, 3/2, 3/2] preserving step count, IDs, order, and kinds without padding", () => {
      const initialProject = createProjectWithThreeSteps();
      const m34 = meter(3, 4);

      const command: SetMeterCommand = {
        type: "timing/set-meter",
        payload: {
          meter: m34,
          policy: "reflow",
          nowIso: "2026-09-05T12:00:00.000Z",
        },
      };

      const applied = setMeter(initialProject, command);
      const newSteps = applied.project.progression.steps;

      // Invariants:
      expect(newSteps).toHaveLength(3);
      expect(newSteps.map((s) => s.id)).toEqual(["step-1", "step-2", "step-3"]);
      expect(newSteps.map((s) => s.kind)).toEqual(["chord", "chord", "chord"]);

      // Durations: 4 * 3/4 = 3, 2 * 3/4 = 3/2, 2 * 3/4 = 3/2
      expect(newSteps[0]!.duration.beats.numerator).toBe(3);
      expect(newSteps[0]!.duration.beats.denominator).toBe(1);

      expect(newSteps[1]!.duration.beats.numerator).toBe(3);
      expect(newSteps[1]!.duration.beats.denominator).toBe(2);

      expect(newSteps[2]!.duration.beats.numerator).toBe(3);
      expect(newSteps[2]!.duration.beats.denominator).toBe(2);

      // Undo verification via inverse command
      const undoApplied = restoreMeterAndSteps(
        applied.project,
        applied.inverse as RestoreMeterAndStepsCommand,
      );
      const restoredSteps = undoApplied.project.progression.steps;
      expect(restoredSteps).toHaveLength(3);
      expect(restoredSteps[0]!.duration.beats.numerator).toBe(4);
      expect(restoredSteps[0]!.duration.beats.denominator).toBe(1);
      expect(restoredSteps[1]!.duration.beats.numerator).toBe(2);
      expect(restoredSteps[1]!.duration.beats.denominator).toBe(1);
    });

    it("Preserve: keeps [4, 2, 2] durations exactly unchanged", () => {
      const initialProject = createProjectWithThreeSteps();
      const m34 = meter(3, 4);

      const command: SetMeterCommand = {
        type: "timing/set-meter",
        payload: {
          meter: m34,
          policy: "preserve-beat-lengths",
          nowIso: "2026-09-05T12:00:00.000Z",
        },
      };

      const applied = setMeter(initialProject, command);
      const newSteps = applied.project.progression.steps;

      expect(newSteps).toHaveLength(3);
      expect(newSteps[0]!.duration.beats.numerator).toBe(4);
      expect(newSteps[0]!.duration.beats.denominator).toBe(1);
      expect(newSteps[1]!.duration.beats.numerator).toBe(2);
      expect(newSteps[1]!.duration.beats.denominator).toBe(1);
      expect(newSteps[2]!.duration.beats.numerator).toBe(2);
      expect(newSteps[2]!.duration.beats.denominator).toBe(1);
    });
  });

  describe("2. Other Timing Commands", () => {
    it("creates the canonical timing/set-step-duration command", () => {
      const duration = musicalDuration(rational(3, 2));
      const command = createSetStepDurationCommand("step-1", duration, "2026-09-05T12:00:00.000Z");

      expect(command).toEqual({
        type: "timing/set-step-duration",
        payload: {
          stepId: "step-1",
          duration,
          nowIso: "2026-09-05T12:00:00.000Z",
        },
      });
    });

    it("setTempo updates tempo and creates accurate inverse", () => {
      const initialProject = createProjectWithThreeSteps();
      const cmd: SetTempoCommand = {
        type: "timing/set-tempo",
        payload: { tempoBpm: 140, nowIso: "2026-09-05T12:00:00.000Z" },
      };

      const applied = setTempo(initialProject, cmd);
      expect(applied.project.globalTiming.tempoBpm).toBe(140);

      const undone = setTempo(applied.project, applied.inverse as SetTempoCommand);
      expect(undone.project.globalTiming.tempoBpm).toBe(120);
    });

    it("setGroove updates feel and swing amount and creates accurate inverse", () => {
      const initialProject = createProjectWithThreeSteps();
      const swingGroove = groove("swing", 0.66);

      const cmd: SetGrooveCommand = {
        type: "timing/set-groove",
        payload: { groove: swingGroove, nowIso: "2026-09-05T12:00:00.000Z" },
      };

      const applied = setGroove(initialProject, cmd);
      expect(applied.project.groove.feel).toBe("swing");
      expect(applied.project.groove.swingAmount).toBe(0.66);

      const undone = setGroove(applied.project, applied.inverse as SetGrooveCommand);
      expect(undone.project.groove.feel).toBe("straight");
      expect(undone.project.groove.swingAmount).toBe(0);
    });

    it("setStepDuration updates selected step duration and creates accurate inverse", () => {
      const initialProject = createProjectWithThreeSteps();
      const newDur = musicalDuration(rational(1, 2));

      const cmd: SetStepDurationCommand = {
        type: "timing/set-step-duration",
        payload: { stepId: "step-1", duration: newDur, nowIso: "2026-09-05T12:00:00.000Z" },
      };

      const applied = setStepDuration(initialProject, cmd);
      expect(applied.project.progression.steps[0]!.duration.beats.numerator).toBe(1);
      expect(applied.project.progression.steps[0]!.duration.beats.denominator).toBe(2);

      const undone = setStepDuration(applied.project, applied.inverse as SetStepDurationCommand);
      expect(undone.project.progression.steps[0]!.duration.beats.numerator).toBe(4);
      expect(undone.project.progression.steps[0]!.duration.beats.denominator).toBe(1);
    });
  });
});
