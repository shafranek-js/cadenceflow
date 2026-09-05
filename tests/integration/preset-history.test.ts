import { describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  saveCustomPreset,
  applyPreset,
  type SaveCustomPresetCommand,
  type ApplyPresetCommand,
} from "../../src/app/commands/presetCommands";
import { createDefaultProject, DEFAULT_PIANO_PERFORMANCE } from "../../src/domain/project/factory";
import { createFunctionalPreset } from "../../src/domain/progression/presets";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational, equalRational } from "../../src/domain/timing/rational";
import type { ChordStep, RestStep } from "../../src/domain/progression/progression";

const nowIso = "2026-09-05T12:00:00.000Z";

function createTestChord(id: string, functionId: string, moduleId = "progressions"): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: {
      moduleId,
      functionId,
      category: "core",
    },
    harmonicVariant: {},
    duration: musicalDuration(rational(1, 1)),
    performance: { ...DEFAULT_PIANO_PERFORMANCE },
    cardView: "harmonic",
  };
}

describe("Preset History & Real Dispatch Integration (T115 & T116)", () => {
  // --------------------------------------------------------------------------
  // 1. T115 — Successful Save through the REAL history pipeline
  // --------------------------------------------------------------------------
  describe("T115 — Successful Save through the REAL history pipeline", () => {
    it("exercises Save, Undo, and Redo entirely through real AppStore dispatch and history", () => {
      const initialProject = createDefaultProject("proj-save-1", "Save History Test", nowIso);
      const chordA = createTestChord("s1", "I");
      const chordB = createTestChord("s2", "IV");
      const chordC = createTestChord("s3", "V");

      const store = new AppStore({
        ...initialProject,
        progression: { steps: [chordA, chordB, chordC] },
      });

      // Initial state checks
      expect(store.project.customPresets).toHaveLength(0);
      expect(store.history.undoDepth).toBe(0);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);

      const initialProgression = store.project.progression;

      // Execute normal Save Custom Preset through real dispatch/history
      const saveCmd: SaveCustomPresetCommand = {
        type: "presets/save-custom",
        payload: {
          name: "My Functional Cadence",
          nowIso: "2026-09-05T12:01:00.000Z",
        },
      };

      store.dispatch(saveCmd, saveCustomPreset);

      // After Save requirements:
      // 1. Exactly one Custom Preset added
      expect(store.project.customPresets).toHaveLength(1);
      const savedPreset = store.project.customPresets[0]!;
      expect(savedPreset.name).toBe("My Functional Cadence");
      expect(savedPreset.source).toBe("custom");
      expect(savedPreset.steps).toHaveLength(3);

      // 2. Exactly one logical history entry added
      expect(store.history.undoDepth).toBe(1);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);

      // 3. Progression unchanged
      expect(store.project.progression).toBe(initialProgression);

      // 4. Preset ID captured
      const capturedPresetId = savedPreset.id;
      expect(capturedPresetId).toBeTruthy();

      // 5. Semantic snapshot captured
      expect(savedPreset.steps[0]!.harmonicFunction.functionId).toBe("I");
      expect(savedPreset.steps[1]!.harmonicFunction.functionId).toBe("IV");
      expect(savedPreset.steps[2]!.harmonicFunction.functionId).toBe("V");
      expect(equalRational(savedPreset.steps[0]!.duration.beats, rational(1, 1))).toBe(true);

      // Undo through real history API
      const undoSuccess = store.undo();
      expect(undoSuccess).toBe(true);

      // After Undo requirements:
      // 1. Custom Preset removed
      expect(store.project.customPresets).toHaveLength(0);
      // 2. Progression unchanged
      expect(store.project.progression).toBe(initialProgression);
      // 3. History cursor/state changes normally
      expect(store.history.undoDepth).toBe(0);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);

      // Redo through real history API (production mechanism must perform it)
      const redoSuccess = store.redo();
      expect(redoSuccess).toBe(true);

      // After Redo requirements:
      // 1. Exactly one Custom Preset restored
      expect(store.project.customPresets).toHaveLength(1);
      const redonePreset = store.project.customPresets[0]!;
      // 2. Same preset ID restored (no new UUID generated)
      expect(redonePreset.id).toBe(capturedPresetId);
      // 3. Same name
      expect(redonePreset.name).toBe("My Functional Cadence");
      // 4. Same ordered HarmonicFunctionIdentity values
      expect(redonePreset.steps.map((s) => s.harmonicFunction.functionId)).toEqual([
        "I",
        "IV",
        "V",
      ]);
      // 5. Same exact Rational durations
      expect(equalRational(redonePreset.steps[0]!.duration.beats, rational(1, 1))).toBe(true);
      expect(equalRational(redonePreset.steps[1]!.duration.beats, rational(1, 1))).toBe(true);
      expect(equalRational(redonePreset.steps[2]!.duration.beats, rational(1, 1))).toBe(true);
      // 6. No performance/variant leakage
      for (const step of redonePreset.steps) {
        expect((step as Record<string, unknown>).harmonicVariant).toBeUndefined();
        expect((step as Record<string, unknown>).performance).toBeUndefined();
      }
      // 7. History state normal
      expect(store.history.undoDepth).toBe(1);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. T115 — Failed Save must create NO history entry
  // --------------------------------------------------------------------------
  describe("T115 — Failed Save must create NO history entry", () => {
    it("rejects empty and whitespace-only names without modifying project or history", () => {
      const store = new AppStore({
        ...createDefaultProject("proj-fail-1", "Fail Save Test", nowIso),
        progression: { steps: [createTestChord("s1", "I")] },
      });

      const initialProject = store.project;
      const initialProgression = store.project.progression;
      const invalidNames = ["", "   ", "\t"];

      for (const name of invalidNames) {
        const cmd: SaveCustomPresetCommand = {
          type: "presets/save-custom",
          payload: { name, nowIso },
        };

        expect(() => store.dispatch(cmd, saveCustomPreset)).toThrow(TypeError);

        // Required assertions:
        expect(store.project).toBe(initialProject);
        expect(store.project.progression).toBe(initialProgression);
        expect(store.project.customPresets).toHaveLength(0);
        expect(store.history.undoDepth).toBe(0);
        expect(store.canUndo).toBe(false);
      }
    });

    it("rejects Rest-containing progression without modifying project or history", () => {
      const chord1 = createTestChord("c1", "I");
      const restStep: RestStep = {
        id: "r1",
        kind: "rest",
        duration: musicalDuration(rational(2, 1)),
      };
      const chord2 = createTestChord("c2", "V");

      const store = new AppStore({
        ...createDefaultProject("proj-fail-rest", "Fail Rest Test", nowIso),
        progression: { steps: [chord1, restStep, chord2] },
      });

      const initialProject = store.project;
      const initialProgression = store.project.progression;

      const cmd: SaveCustomPresetCommand = {
        type: "presets/save-custom",
        payload: { name: "Rest Progression Preset", nowIso },
      };

      expect(() => store.dispatch(cmd, saveCustomPreset)).toThrow(/Rest/);

      // Required assertions:
      expect(store.project).toBe(initialProject);
      expect(store.project.progression).toBe(initialProgression);
      expect(store.project.customPresets).toHaveLength(0);
      expect(store.history.undoDepth).toBe(0);
      expect(store.canUndo).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. T116 — Successful Apply must be ONE history action & Exact Undo/Redo
  // --------------------------------------------------------------------------
  describe("T116 — Successful Apply must be ONE history action & Exact Undo/Redo", () => {
    it("applies preset before selected step as a single history entry, preserving exact snapshot on Undo/Redo", () => {
      // Non-trivial fixture: A [B selected] C
      const stepA = createTestChord("step-a", "I");
      const stepB = createTestChord("step-b", "vi");
      const stepC = createTestChord("step-c", "ii");

      const store = new AppStore({
        ...createDefaultProject("proj-insert-1", "Insert History Test", nowIso),
        progression: { steps: [stepA, stepB, stepC], selectedStepId: "step-b" },
      });

      const presetXY = createFunctionalPreset("preset-xy", "Preset XY", "custom", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
      ]);

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: presetXY, mode: "insert", nowIso },
      };

      // Normal command execution through real dispatcher/history
      store.dispatch(applyCmd, applyPreset);

      // Requirements after Apply:
      // 1. Progression is A X Y [B selected] C
      expect(store.project.progression.steps).toHaveLength(5);
      expect(store.project.progression.steps[0]!.id).toBe("step-a");
      const stepX = store.project.progression.steps[1] as ChordStep;
      const stepY = store.project.progression.steps[2] as ChordStep;
      expect(stepX.harmonicFunction.functionId).toBe("IV");
      expect(stepY.harmonicFunction.functionId).toBe("V");
      expect(store.project.progression.steps[3]!.id).toBe("step-b");
      expect(store.project.progression.steps[4]!.id).toBe("step-c");

      // 2. Exactly one logical history entry (not one per X/Y Step)
      expect(store.history.undoDepth).toBe(1);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);

      // 3. B remains selected
      expect(store.project.progression.selectedStepId).toBe("step-b");

      // 4. Capture X/Y IDs, durations, harmony, performance
      const capturedXId = stepX.id;
      const capturedYId = stepY.id;
      const capturedXPerf = stepX.performance;
      const capturedYPerf = stepY.performance;

      // Undo through real history mechanism
      const undoSuccess = store.undo();
      expect(undoSuccess).toBe(true);

      // Undo requirements:
      // Restores exactly: A [B selected] C
      expect(store.project.progression.steps).toHaveLength(3);
      expect(store.project.progression.steps[0]!.id).toBe("step-a");
      expect(store.project.progression.steps[1]!.id).toBe("step-b");
      expect(store.project.progression.steps[2]!.id).toBe("step-c");
      expect(store.project.progression.selectedStepId).toBe("step-b");
      expect(store.history.undoDepth).toBe(0);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);

      // Redo through real history mechanism
      const redoSuccess = store.redo();
      expect(redoSuccess).toBe(true);

      // Redo requirements:
      // Restores exactly the first committed result: A X Y [B selected] C
      expect(store.project.progression.steps).toHaveLength(5);
      expect(store.project.progression.steps[0]!.id).toBe("step-a");
      expect(store.project.progression.steps[1]!.id).toBe(capturedXId);
      expect(store.project.progression.steps[2]!.id).toBe(capturedYId);
      expect(store.project.progression.steps[3]!.id).toBe("step-b");
      expect(store.project.progression.steps[4]!.id).toBe("step-c");

      const redoneX = store.project.progression.steps[1] as ChordStep;
      const redoneY = store.project.progression.steps[2] as ChordStep;

      // Exact same realized harmony
      expect(redoneX.harmonicFunction.functionId).toBe("IV");
      expect(redoneY.harmonicFunction.functionId).toBe("V");

      // Exact same durations
      expect(equalRational(redoneX.duration.beats, rational(2, 1))).toBe(true);
      expect(equalRational(redoneY.duration.beats, rational(1, 1))).toBe(true);

      // Exact same performance snapshots
      expect(redoneX.performance).toEqual(capturedXPerf);
      expect(redoneY.performance).toEqual(capturedYPerf);

      // selectedStepId still B
      expect(store.project.progression.selectedStepId).toBe("step-b");

      // No new UUID generated, history state normal
      expect(store.history.undoDepth).toBe(1);
      expect(store.canUndo).toBe(true);
      expect(store.canRedo).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Defaults must not affect Redo (T116)
  // --------------------------------------------------------------------------
  describe("Defaults must not affect Redo (T116)", () => {
    it("proves Apply uses current defaults while Redo restores historical snapshot", () => {
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

      // 1. Defaults A active
      const store = new AppStore({
        ...createDefaultProject("proj-defaults", "Defaults History Test", nowIso),
        defaults: defaultsA,
        progression: { steps: [] },
      });

      const preset = createFunctionalPreset("p-single", "Single Step", "custom", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
      ]);

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset, mode: "replace", nowIso },
      };

      // 2. Apply Preset
      store.dispatch(applyCmd, applyPreset);

      // 3. Capture instantiated Step IDs/performance
      const stepAfterApply = store.project.progression.steps[0] as ChordStep;
      const capturedStepId = stepAfterApply.id;
      expect(stepAfterApply.performance.articulation).toBe("arp-up");
      expect(stepAfterApply.performance.register).toBe(1);
      expect(stepAfterApply.performance.masterVelocity).toBe(85);

      // 4. Undo through real history
      store.undo();
      expect(store.project.progression.steps).toHaveLength(0);

      // 5. Change Project defaults to Defaults B
      store.setProjectDefaults(defaultsB);
      expect(store.project.defaults.piano.performance.articulation).toBe("block");

      // 6. Redo through real history
      store.redo();

      // Expected: Redo restores the original committed Steps using Defaults A
      expect(store.project.progression.steps).toHaveLength(1);
      const stepAfterRedo = store.project.progression.steps[0] as ChordStep;
      expect(stepAfterRedo.id).toBe(capturedStepId);
      expect(stepAfterRedo.performance.articulation).toBe("arp-up");
      expect(stepAfterRedo.performance.register).toBe(1);
      expect(stepAfterRedo.performance.masterVelocity).toBe(85);

      // Then perform a NEW separate Apply under Defaults B
      const separateApplyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset, mode: "replace", nowIso: "2026-09-05T12:05:00.000Z" },
      };
      store.dispatch(separateApplyCmd, applyPreset);

      // Expected: new application uses Defaults B
      expect(store.project.progression.steps).toHaveLength(1);
      const newStep = store.project.progression.steps[0] as ChordStep;
      expect(newStep.performance.articulation).toBe("block");
      expect(newStep.performance.register).toBe(-1);
      expect(newStep.performance.masterVelocity).toBe(60);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Ambiguous & Incompatible Apply — No History Mutation (T113 / T116)
  // --------------------------------------------------------------------------
  describe("Ambiguous & Incompatible Apply — No History Mutation (T113 / T116)", () => {
    it("ambiguous apply fails through real dispatch without modifying project, progression, selection, or history", () => {
      const chordA = createTestChord("s1", "I");
      const store = new AppStore({
        ...createDefaultProject("proj-amb", "Ambiguous History Test", nowIso),
        progression: { steps: [chordA], selectedStepId: "s1" },
      });

      const initialProject = store.project;
      const initialProgression = store.project.progression;

      // Real ambiguous fixture: N6 from dark-harmony applied in progressions (Major) module
      const ambiguousPreset = createFunctionalPreset("amb-preset", "Ambiguous N6", "custom", [
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "N6", category: "neapolitan" },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: ambiguousPreset, mode: "append", nowIso },
      };

      // Execute through real dispatcher/history
      expect(() => store.dispatch(applyCmd, applyPreset)).toThrow(/ambiguous/);

      // Require:
      // 1. Project bit-for-bit unchanged
      expect(store.project).toBe(initialProject);
      // 2. Progression unchanged
      expect(store.project.progression).toBe(initialProgression);
      // 3. selectedStepId unchanged
      expect(store.project.progression.selectedStepId).toBe("s1");
      // 4. history length/cursor unchanged
      expect(store.history.undoDepth).toBe(0);
      expect(store.canUndo).toBe(false);
      // 5. no partial steps committed
      expect(store.project.progression.steps).toHaveLength(1);
    });

    it("incompatible apply fails through real dispatch without modifying project, progression, selection, or history", () => {
      const chordA = createTestChord("s1", "I");
      const store = new AppStore({
        ...createDefaultProject("proj-inc", "Incompatible History Test", nowIso),
        progression: { steps: [chordA], selectedStepId: "s1" },
      });

      const initialProject = store.project;
      const initialProgression = store.project.progression;

      const incompatiblePreset = createFunctionalPreset("inc-preset", "Incompatible Fn", "custom", [
        {
          harmonicFunction: {
            moduleId: "progressions",
            functionId: "NON_EXISTENT_FUNCTION",
            category: "core",
          },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const applyCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset: incompatiblePreset, mode: "append", nowIso },
      };

      expect(() => store.dispatch(applyCmd, applyPreset)).toThrow(/incompatible/);

      // Require:
      // 1. zero Project mutation
      expect(store.project).toBe(initialProject);
      // 2. zero Progression mutation
      expect(store.project.progression).toBe(initialProgression);
      // 3. zero selection mutation
      expect(store.project.progression.selectedStepId).toBe("s1");
      // 4. zero history mutation
      expect(store.history.undoDepth).toBe(0);
      expect(store.canUndo).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Replace and Append History Smoke (T116)
  // --------------------------------------------------------------------------
  describe("Replace and Append History Smoke (T116)", () => {
    it("Replace mode: one history entry, Undo restores prior progression, Redo restores replacement snapshot", () => {
      const initialChord = createTestChord("old-chord-1", "I");
      const store = new AppStore({
        ...createDefaultProject("proj-rep", "Replace History Test", nowIso),
        progression: { steps: [initialChord], selectedStepId: "old-chord-1" },
      });

      const preset = createFunctionalPreset("p-rep", "Replace Preset", "custom", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const replaceCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset, mode: "replace", nowIso },
      };

      // 1 command = 1 history entry
      store.dispatch(replaceCmd, applyPreset);
      expect(store.history.undoDepth).toBe(1);
      expect(store.project.progression.steps).toHaveLength(2);
      expect(store.project.progression.selectedStepId).toBeUndefined();

      const repXId = store.project.progression.steps[0]!.id;
      const repYId = store.project.progression.steps[1]!.id;

      // Undo restores prior progression and selection
      store.undo();
      expect(store.project.progression.steps).toHaveLength(1);
      expect(store.project.progression.steps[0]!.id).toBe("old-chord-1");
      expect(store.project.progression.selectedStepId).toBe("old-chord-1");

      // Redo restores replacement snapshot
      store.redo();
      expect(store.project.progression.steps).toHaveLength(2);
      expect(store.project.progression.steps[0]!.id).toBe(repXId);
      expect(store.project.progression.steps[1]!.id).toBe(repYId);
      expect(store.project.progression.selectedStepId).toBeUndefined();
    });

    it("Append mode: one history entry, Undo removes appended steps, Redo restores same appended step IDs", () => {
      const initialChord = createTestChord("base-chord-1", "I");
      const store = new AppStore({
        ...createDefaultProject("proj-app", "Append History Test", nowIso),
        progression: { steps: [initialChord], selectedStepId: "base-chord-1" },
      });

      const preset = createFunctionalPreset("p-app", "Append Preset", "custom", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "ii", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
      ]);

      const appendCmd: ApplyPresetCommand = {
        type: "presets/apply",
        payload: { preset, mode: "append", nowIso },
      };

      // 1 command = 1 history entry
      store.dispatch(appendCmd, applyPreset);
      expect(store.history.undoDepth).toBe(1);
      expect(store.project.progression.steps).toHaveLength(3);
      expect(store.project.progression.steps[0]!.id).toBe("base-chord-1");
      expect(store.project.progression.selectedStepId).toBe("base-chord-1");

      const appended1Id = store.project.progression.steps[1]!.id;
      const appended2Id = store.project.progression.steps[2]!.id;

      // Undo removes appended Steps
      store.undo();
      expect(store.project.progression.steps).toHaveLength(1);
      expect(store.project.progression.steps[0]!.id).toBe("base-chord-1");
      expect(store.project.progression.selectedStepId).toBe("base-chord-1");

      // Redo restores same appended Step IDs
      store.redo();
      expect(store.project.progression.steps).toHaveLength(3);
      expect(store.project.progression.steps[0]!.id).toBe("base-chord-1");
      expect(store.project.progression.steps[1]!.id).toBe(appended1Id);
      expect(store.project.progression.steps[2]!.id).toBe(appended2Id);
      expect(store.project.progression.selectedStepId).toBe("base-chord-1");
    });
  });
});
