import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import {
  saveCustomPreset,
  deleteCustomPreset,
  applyPreset,
  type SaveCustomPresetCommand,
  type DeleteCustomPresetCommand,
  type ApplyPresetCommand,
} from "../../../src/app/commands/presetCommands";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import {
  createFunctionalPreset,
  type FunctionalPreset,
} from "../../../src/domain/progression/presets";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";

function createTestChord(
  id: string,
  functionId: string,
  moduleId: "progressions" | "dark-harmony" = "progressions",
): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: { moduleId, functionId, category: "core" },
    harmonicVariant: {
      seventh: "major7",
      extensions: [9],
      suspensions: [],
      alterations: [],
    },
    duration: musicalDuration(rational(2, 1)),
    performance: {
      ...DEFAULT_PIANO_PERFORMANCE,
      articulation: "arp-up",
      masterVelocity: 99,
    },
    cardView: "piano",
  };
}

describe("T115 & T116 — Preset Commands (US7)", () => {
  const nowIso = "2026-09-05T12:00:00.000Z";

  describe("saveCustomPreset command (T115)", () => {
    it("saves custom preset to project.customPresets stripping performance and harmonic variants", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const chord1 = createTestChord("c1", "I");
      const chord2 = createTestChord("c2", "V");
      const projectWithSteps = {
        ...baseProject,
        progression: { steps: [chord1, chord2], selectedStepId: "c1" },
      };

      const saveCmd: SaveCustomPresetCommand = {
        type: "presets/save-custom",
        payload: {
          name: "My Groove",
          description: "A lovely cadence",
          id: "custom-g1",
          nowIso,
        },
      };

      const result = saveCustomPreset(projectWithSteps, saveCmd);

      expect(result.preset.id).toBe("custom-g1");
      expect(result.preset.name).toBe("My Groove");
      expect(result.preset.source).toBe("custom");
      expect(result.preset.steps).toHaveLength(2);
      expect(result.preset.steps[0]!.harmonicFunction.functionId).toBe("I");
      expect(result.preset.steps[1]!.harmonicFunction.functionId).toBe("V");

      // Verify no performance or variant leakage on preset
      expect((result.preset.steps[0] as Record<string, unknown>).performance).toBeUndefined();
      expect((result.preset.steps[0] as Record<string, unknown>).harmonicVariant).toBeUndefined();

      // Verify project state updated
      expect(result.project.customPresets).toHaveLength(1);
      expect(result.project.customPresets[0]!.id).toBe("custom-g1");

      // Verify undo via dispatcher restores previous customPresets
      const undone = applyInverseCommand(result.project, result.inverse);
      expect(undone.customPresets).toHaveLength(0);

      // Verify redo (re-applying inverse of undo)
      const redone = saveCustomPreset(undone, saveCmd);
      expect(redone.project.customPresets).toHaveLength(1);
    });

    it("rejects saving custom preset if progression contains a RestStep without mutating project", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const chord1 = createTestChord("c1", "I");
      const restStep: RestStep = {
        id: "r1",
        kind: "rest",
        duration: musicalDuration(rational(2, 1)),
      };
      const projectWithRest = {
        ...baseProject,
        progression: { steps: [chord1, restStep] },
      };

      const saveCmd: SaveCustomPresetCommand = {
        type: "presets/save-custom",
        payload: {
          name: "Rest Preset",
          nowIso,
        },
      };

      expect(() => saveCustomPreset(projectWithRest, saveCmd)).toThrow(/Rest/);
      expect(projectWithRest.customPresets).toHaveLength(0);
    });
  });

  describe("deleteCustomPreset command (T115)", () => {
    it("deletes a custom preset and allows undo to restore it", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const preset: FunctionalPreset = createFunctionalPreset("del-1", "To Delete", "custom", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
          duration: musicalDuration(rational(4, 1)),
        },
      ]);
      const projectWithPreset = {
        ...baseProject,
        customPresets: [preset],
      };

      const deleteCmd: DeleteCustomPresetCommand = {
        type: "presets/delete-custom",
        payload: { presetId: "del-1", nowIso },
      };

      const result = deleteCustomPreset(projectWithPreset, deleteCmd);
      expect(result.project.customPresets).toHaveLength(0);

      // Undo restores it
      const undone = applyInverseCommand(result.project, result.inverse);
      expect(undone.customPresets).toHaveLength(1);
      expect(undone.customPresets[0]!.id).toBe("del-1");
    });

    it("throws RangeError if custom preset ID is not found", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const deleteCmd: DeleteCustomPresetCommand = {
        type: "presets/delete-custom",
        payload: { presetId: "unknown-id", nowIso },
      };

      expect(() => deleteCustomPreset(baseProject, deleteCmd)).toThrow(RangeError);
    });
  });

  describe("applyPreset command (T116)", () => {
    const testPreset = createFunctionalPreset("apply-1", "Cadence", "builtIn", [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
        duration: musicalDuration(rational(2, 1)),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        duration: musicalDuration(rational(2, 1)),
      },
    ]);

    it("applies preset with 'replace' mode, clears selectedStepId, and supports undo", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const existing = createTestChord("old-1", "I");
      const projectWithStep = {
        ...baseProject,
        progression: { steps: [existing], selectedStepId: "old-1" },
      };

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: testPreset, mode: "replace", nowIso },
      };

      const result = applyPreset(projectWithStep, applyCmd);
      expect(result.project.progression.steps).toHaveLength(2);
      expect(result.project.progression.steps[0]!.harmonicFunction.functionId).toBe("IV");
      expect(result.project.progression.steps[1]!.harmonicFunction.functionId).toBe("V");
      expect(result.project.progression.selectedStepId).toBeUndefined();

      // Undo via dispatcher restores original progression and selection
      const undone = applyInverseCommand(result.project, result.inverse);
      expect(undone.progression.steps).toHaveLength(1);
      expect(undone.progression.steps[0]!.id).toBe("old-1");
      expect(undone.progression.selectedStepId).toBe("old-1");
    });

    it("applies preset with 'append' mode, preserving selectedStepId and supporting undo", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const existing = createTestChord("old-1", "I");
      const projectWithStep = {
        ...baseProject,
        progression: { steps: [existing], selectedStepId: "old-1" },
      };

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: testPreset, mode: "append", nowIso },
      };

      const result = applyPreset(projectWithStep, applyCmd);
      expect(result.project.progression.steps).toHaveLength(3);
      expect(result.project.progression.steps[0]!.id).toBe("old-1");
      expect(result.project.progression.steps[1]!.harmonicFunction.functionId).toBe("IV");
      expect(result.project.progression.steps[2]!.harmonicFunction.functionId).toBe("V");
      expect(result.project.progression.selectedStepId).toBe("old-1");

      const undone = applyInverseCommand(result.project, result.inverse);
      expect(undone.progression.steps).toHaveLength(1);
      expect(undone.progression.steps[0]!.id).toBe("old-1");
    });

    it("applies preset with 'insert' mode before selected step", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const stepA = createTestChord("step-a", "I");
      const stepB = createTestChord("step-b", "vi");
      const projectWithSteps = {
        ...baseProject,
        progression: { steps: [stepA, stepB], selectedStepId: "step-b" },
      };

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: testPreset, mode: "insert", nowIso },
      };

      const result = applyPreset(projectWithSteps, applyCmd);
      expect(result.project.progression.steps).toHaveLength(4);
      expect(result.project.progression.steps[0]!.id).toBe("step-a");
      expect(result.project.progression.steps[1]!.harmonicFunction.functionId).toBe("IV");
      expect(result.project.progression.steps[2]!.harmonicFunction.functionId).toBe("V");
      expect(result.project.progression.steps[3]!.id).toBe("step-b");
      expect(result.project.progression.selectedStepId).toBe("step-b");
    });

    it("atomically fails when applying an incompatible preset without modifying project", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const incompatiblePreset = createFunctionalPreset("inc-1", "Neapolitan In Major", "custom", [
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "N6", category: "neapolitan" },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: incompatiblePreset, mode: "replace", nowIso },
      };

      expect(() => applyPreset(baseProject, applyCmd)).toThrow(/incompatible/);
      expect(baseProject.progression.steps).toHaveLength(0);
    });
  });
});
