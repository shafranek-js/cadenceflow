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
  deserializePreset,
  realizePresetSteps,
  serializePreset,
  type FunctionalPreset,
} from "../../../src/domain/progression/presets";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { equalRational, rational } from "../../../src/domain/timing/rational";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";
import type { HarmonicContext } from "../../../src/domain/harmony/modules/types";

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

describe("T115 & T116 — Preset Commands & Compatibility Contract (US7)", () => {
  const nowIso = "2026-09-05T12:00:00.000Z";

  // --------------------------------------------------------------------------
  // 1. Save Custom Preset & Validation (T115)
  // --------------------------------------------------------------------------
  describe("1. Save Custom Preset & Validation (T115)", () => {
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

    it("rejects empty and whitespace-only Custom Preset names without mutating project or progression", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const chord1 = createTestChord("c1", "I");
      const projectWithSteps = {
        ...baseProject,
        progression: { steps: [chord1] },
      };

      const invalidNames = ["", "   ", "\t", "\n", " \t \r\n "];

      for (const name of invalidNames) {
        const saveCmd: SaveCustomPresetCommand = {
          type: "presets/save-custom",
          payload: { name, nowIso },
        };

        expect(() => saveCustomPreset(projectWithSteps, saveCmd)).toThrow(TypeError);
        expect(projectWithSteps.customPresets).toHaveLength(0);
        expect(projectWithSteps.progression.steps).toHaveLength(1);
      }
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

    it("Save Undo/Redo restores the exact same preset semantic snapshot and stable ID without calling ID generator again", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const chord1 = createTestChord("c1", "I");
      const chord2 = createTestChord("c2", "IV");
      const projectWithSteps = {
        ...baseProject,
        progression: { steps: [chord1, chord2] },
      };

      // Save without providing an explicit ID — implementation generates one
      const saveCmd: SaveCustomPresetCommand = {
        type: "presets/save-custom",
        payload: { name: "Auto ID Groove", nowIso },
      };

      const initialSave = saveCustomPreset(projectWithSteps, saveCmd);
      const generatedId = initialSave.preset.id;
      expect(generatedId).toMatch(/^custom-/);

      // Undo via dispatcher
      const undone = applyInverseCommand(initialSave.project, initialSave.inverse);
      expect(undone.customPresets).toHaveLength(0);

      // Redo via production forward snapshot: restores the exact snapshot
      const redone = applyInverseCommand(undone, initialSave.forward!);

      expect(redone.customPresets).toHaveLength(1);
      const restoredPreset = redone.customPresets[0]!;
      expect(restoredPreset.id).toBe(generatedId);
      expect(restoredPreset.name).toBe("Auto ID Groove");
      expect(restoredPreset.steps).toHaveLength(2);
      expect(restoredPreset.steps[0]!.harmonicFunction.functionId).toBe("I");
      expect(restoredPreset.steps[1]!.harmonicFunction.functionId).toBe("IV");
      expect(equalRational(restoredPreset.steps[0]!.duration.beats, rational(2, 1))).toBe(true);

      // Zero performance or variant leakage
      expect((restoredPreset.steps[0] as Record<string, unknown>).performance).toBeUndefined();
      expect((restoredPreset.steps[0] as Record<string, unknown>).harmonicVariant).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. Delete Custom Preset (T115)
  // --------------------------------------------------------------------------
  describe("2. Delete Custom Preset (T115)", () => {
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

  // --------------------------------------------------------------------------
  // 3. Apply Preset & Undo/Redo Snapshot Invariants (T116)
  // --------------------------------------------------------------------------
  describe("3. Apply Preset & Undo/Redo Snapshot Invariants (T116)", () => {
    const testPreset = createFunctionalPreset("apply-1", "Major Cadence", "builtIn", [
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

    it("Apply Undo/Redo restores exact snapshots on Insert: same IDs, harmony, durations, and preserves selection", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const stepA = createTestChord("step-a", "I");
      const stepB = createTestChord("step-b", "vi");
      const stepC = createTestChord("step-c", "ii");
      const projectWithSteps = {
        ...baseProject,
        progression: { steps: [stepA, stepB, stepC], selectedStepId: "step-b" },
      };

      // Insert testPreset [X, Y] before selected step B: [A, B, C] -> [A, X, Y, B, C]
      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: testPreset, mode: "insert", nowIso },
      };

      const applied = applyPreset(projectWithSteps, applyCmd);
      expect(applied.project.progression.steps).toHaveLength(5);
      expect(applied.project.progression.steps[0]!.id).toBe("step-a");
      const stepX = applied.project.progression.steps[1] as ChordStep;
      const stepY = applied.project.progression.steps[2] as ChordStep;
      expect(stepX.harmonicFunction.functionId).toBe("IV");
      expect(stepY.harmonicFunction.functionId).toBe("V");
      expect(applied.project.progression.steps[3]!.id).toBe("step-b");
      expect(applied.project.progression.steps[4]!.id).toBe("step-c");
      expect(applied.project.progression.selectedStepId).toBe("step-b");

      const capturedXId = stepX.id;
      const capturedYId = stepY.id;
      const capturedXPerf = stepX.performance;

      // Undo: restores A [B selected] C
      const undone = applyInverseCommand(applied.project, applied.inverse);
      expect(undone.progression.steps).toHaveLength(3);
      expect(undone.progression.steps.map((s) => s.id)).toEqual(["step-a", "step-b", "step-c"]);
      expect(undone.progression.selectedStepId).toBe("step-b");

      // Redo via production forward snapshot: restores A X Y [B selected] C
      const redone = applyInverseCommand(undone, applied.forward!);

      expect(redone.progression.steps).toHaveLength(5);
      expect(redone.progression.steps[1]!.id).toBe(capturedXId);
      expect(redone.progression.steps[2]!.id).toBe(capturedYId);
      expect((redone.progression.steps[1] as ChordStep).performance).toBe(capturedXPerf);
      expect(redone.progression.selectedStepId).toBe("step-b");
    });

    it("captures defaults at application time, NOT Redo time: changing defaults before Redo does not contaminate restored snapshot", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const defaultsA = {
        piano: {
          duration: musicalDuration(rational(1, 1)),
          performance: {
            ...DEFAULT_PIANO_PERFORMANCE,
            articulation: "arp-up" as const,
            register: 1 as const,
            masterVelocity: 85,
            bass: { choice: "custom" as const, octaveOffset: -1 as const },
          },
        },
      };

      const projectA = {
        ...baseProject,
        defaults: defaultsA,
        progression: { steps: [] },
      };

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: testPreset, mode: "replace", nowIso },
      };

      // Applied with Defaults A
      const applied = applyPreset(projectA, applyCmd);
      const step1 = applied.project.progression.steps[0] as ChordStep;
      expect(step1.performance.articulation).toBe("arp-up");
      expect(step1.performance.register).toBe(1);
      expect(step1.performance.masterVelocity).toBe(85);

      // Undo
      const undone = applyInverseCommand(applied.project, applied.inverse);
      expect(undone.progression.steps).toHaveLength(0);

      // Now defaults change to Defaults B
      const defaultsB = {
        piano: {
          duration: musicalDuration(rational(1, 1)),
          performance: {
            ...DEFAULT_PIANO_PERFORMANCE,
            articulation: "block" as const,
            register: -1 as const,
            masterVelocity: 60,
            bass: { choice: "auto" as const, octaveOffset: "auto" as const },
          },
        },
      };

      const projectWithDefaultsB = {
        ...undone,
        defaults: defaultsB,
      };

      // Redo: restores the application snapshot, which still retains Defaults A
      const redone = applyInverseCommand(projectWithDefaultsB, applied.forward!);

      const redoneStep1 = redone.progression.steps[0] as ChordStep;
      expect(redoneStep1.performance.articulation).toBe("arp-up");
      expect(redoneStep1.performance.register).toBe(1);
      expect(redoneStep1.performance.masterVelocity).toBe(85);

      // A brand new separate application on projectWithDefaultsB uses Defaults B
      const separateApply = applyPreset(projectWithDefaultsB, applyCmd);
      const separateStep1 = separateApply.project.progression.steps[0] as ChordStep;
      expect(separateStep1.performance.articulation).toBe("block");
      expect(separateStep1.performance.register).toBe(-1);
      expect(separateStep1.performance.masterVelocity).toBe(60);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Command-Level Incompatible and Ambiguous Atomicity (T113 / T116)
  // --------------------------------------------------------------------------
  describe("4. Command-Level Incompatible and Ambiguous Atomicity (T113 / T116)", () => {
    it("incompatible apply fails atomically without modifying project, progression, or selection", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const step1 = createTestChord("s1", "I");
      const projectWithStep = {
        ...baseProject,
        progression: { steps: [step1], selectedStepId: "s1" },
      };

      // Preset with an unsupported/invalid function
      const incompatiblePreset = createFunctionalPreset("inc-1", "Invalid Fn Preset", "custom", [
        {
          harmonicFunction: {
            moduleId: "progressions",
            functionId: "NON_EXISTENT",
            category: "core",
          },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: incompatiblePreset, mode: "append", nowIso },
      };

      expect(() => applyPreset(projectWithStep, applyCmd)).toThrow(/incompatible/);

      // Verify Project and progression remain 100% untouched
      expect(projectWithStep.progression.steps).toHaveLength(1);
      expect(projectWithStep.progression.steps[0]!.id).toBe("s1");
      expect(projectWithStep.progression.selectedStepId).toBe("s1");
      expect(projectWithStep.customPresets).toHaveLength(0);
    });

    it("ambiguous apply fails atomically using real existing ModuleSwitchResolution fixture without partial insertion", () => {
      const baseProject = createDefaultProject("p1", "Test Project", nowIso);
      const step1 = createTestChord("s1", "I");
      const projectWithStep = {
        ...baseProject,
        progression: { steps: [step1], selectedStepId: "s1" },
      };

      // Real ambiguous fixture: N6 from dark-harmony applied in progressions (Major) module
      const ambiguousPreset = createFunctionalPreset("amb-1", "Neapolitan Preset", "custom", [
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "N6", category: "neapolitan" },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: ambiguousPreset, mode: "append", nowIso },
      };

      expect(() => applyPreset(projectWithStep, applyCmd)).toThrow(/ambiguous/);

      // Verify Project and progression remain 100% untouched: no partial steps committed
      expect(projectWithStep.progression.steps).toHaveLength(1);
      expect(projectWithStep.progression.steps[0]!.id).toBe("s1");
      expect(projectWithStep.progression.selectedStepId).toBe("s1");
      expect(projectWithStep.customPresets).toHaveLength(0);
    });

    it("demonstrates the exact observable ambiguous diagnostic branch from existing moduleSwitch", () => {
      const ambiguousPreset = createFunctionalPreset("amb-real", "Ambiguous Diagnostic", "custom", [
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "N6", category: "neapolitan" },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const majorContext: HarmonicContext = {
        tonic: 0,
        moduleId: "progressions",
        mode: "major",
        spellingContext: { tonic: 0, mode: "major" },
      };

      const result = realizePresetSteps(ambiguousPreset, majorContext);

      expect(result.kind).toBe("ambiguous");
      if (result.kind === "ambiguous") {
        expect(result.ambiguousSteps).toHaveLength(1);
        const amb = result.ambiguousSteps[0]!;
        expect(amb.stepIndex).toBe(0);
        expect(amb.resolution.source.functionId).toBe("N6");
        expect(amb.resolution.automaticTarget).toBeUndefined();
        // Curated alternatives from existing moduleSwitch: bVI and IV
        expect(amb.resolution.alternatives.length).toBeGreaterThanOrEqual(2);
        expect(amb.resolution.alternatives.map((a) => a.functionId)).toContain("bVI");
        expect(amb.resolution.alternatives.map((a) => a.functionId)).toContain("IV");
        expect(amb.resolution.keepOriginalAllowed).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Serialization Rejection Inventory & Exact Rational Round-Trip (T113)
  // --------------------------------------------------------------------------
  describe("5. Serialization Rejection Inventory & Exact Rational Round-Trip (T113)", () => {
    const validStep = {
      harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
      duration: { beats: { numerator: 1, denominator: 1 } },
    };

    it("rejects denominator 0", () => {
      const json = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ ...validStep, duration: { beats: { numerator: 1, denominator: 0 } } }],
      });
      expect(() => deserializePreset(json)).toThrow(TypeError);
    });

    it("rejects non-integer numerator", () => {
      const json = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ ...validStep, duration: { beats: { numerator: 1.5, denominator: 1 } } }],
      });
      expect(() => deserializePreset(json)).toThrow(TypeError);
    });

    it("rejects non-integer denominator", () => {
      const json = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ ...validStep, duration: { beats: { numerator: 1, denominator: 2.5 } } }],
      });
      expect(() => deserializePreset(json)).toThrow(TypeError);
    });

    it("rejects zero duration", () => {
      const json = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ ...validStep, duration: { beats: { numerator: 0, denominator: 1 } } }],
      });
      expect(() => deserializePreset(json)).toThrow(RangeError);
    });

    it("rejects negative duration", () => {
      const json = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ ...validStep, duration: { beats: { numerator: -1, denominator: 1 } } }],
      });
      expect(() => deserializePreset(json)).toThrow(RangeError);
    });

    it("rejects invalid source", () => {
      const json = JSON.stringify({
        id: "p",
        name: "test",
        source: "unknown-source",
        steps: [validStep],
      });
      expect(() => deserializePreset(json)).toThrow(TypeError);
    });

    it("rejects malformed or missing harmonic function", () => {
      const jsonMissingHf = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ duration: validStep.duration }],
      });
      expect(() => deserializePreset(jsonMissingHf)).toThrow(TypeError);

      const jsonInvalidModule = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [
          {
            harmonicFunction: { moduleId: "unsupported", functionId: "I", category: "core" },
            duration: validStep.duration,
          },
        ],
      });
      expect(() => deserializePreset(jsonInvalidModule)).toThrow(TypeError);
    });

    it("rejects malformed steps representation", () => {
      const jsonNonArraySteps = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: "not-an-array",
      });
      expect(() => deserializePreset(jsonNonArraySteps)).toThrow(TypeError);

      const jsonNullStep = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [null],
      });
      expect(() => deserializePreset(jsonNullStep)).toThrow(TypeError);
    });

    it("rejects seconds/milliseconds-only timing representations", () => {
      const jsonWithSeconds = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ harmonicFunction: validStep.harmonicFunction, seconds: 2.0 }],
      });
      expect(() => deserializePreset(jsonWithSeconds)).toThrow(TypeError);

      const jsonWithDurationMs = JSON.stringify({
        id: "p",
        name: "test",
        source: "custom",
        steps: [{ harmonicFunction: validStep.harmonicFunction, durationMs: 2000 }],
      });
      expect(() => deserializePreset(jsonWithDurationMs)).toThrow(TypeError);
    });

    it("preserves exact Rational round-trip for 3/2, 2/3, and 1/3", () => {
      const preset = createFunctionalPreset("p-rats", "Rational Preserves", "custom", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
          duration: musicalDuration(rational(3, 2)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
          duration: musicalDuration(rational(2, 3)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
          duration: musicalDuration(rational(1, 3)),
        },
      ]);

      const serialized = serializePreset(preset);
      const deserialized = deserializePreset(serialized);

      expect(equalRational(deserialized.steps[0]!.duration.beats, rational(3, 2))).toBe(true);
      expect(equalRational(deserialized.steps[1]!.duration.beats, rational(2, 3))).toBe(true);
      expect(equalRational(deserialized.steps[2]!.duration.beats, rational(1, 3))).toBe(true);
    });
  });
});
