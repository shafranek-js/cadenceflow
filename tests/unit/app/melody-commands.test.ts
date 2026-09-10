import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import { addMatrixPreview } from "../../../src/app/commands/matrixCommands";
import {
  MelodyCommandError,
  removeMelodyRecipe,
  setMelodyRecipe,
  setMelodyTrackSettings,
  type RemoveMelodyRecipeCommand,
  type SetMelodyRecipeCommand,
  type SetMelodyTrackSettingsCommand,
} from "../../../src/app/commands/melodyCommands";
import {
  removeStep,
  addRestStep,
  reorderStep,
  replaceStep,
  repeatChordStep,
  resetStepPerformance,
} from "../../../src/app/commands/progressionCommands";
import { setStepDuration } from "../../../src/app/commands/timingCommands";
import { saveCustomPresetFromProgression } from "../../../src/domain/progression/presets";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { MelodyValidationError } from "../../../src/domain/melody/types";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

const T0 = "2026-09-10T12:00:00.000Z";
const T1 = "2026-09-10T12:01:00.000Z";

const recipe = {
  pattern: "inside-out" as const,
  grid: "eighth-triplet" as const,
  octaveOffset: 1 as const,
};

function createChordProject() {
  return addMatrixPreview(createDefaultProject("melody-command", "Melody Commands", T0), {
    type: "matrix/add-preview",
    payload: { functionId: "I", stepId: "step-1", nowIso: T0 },
  }).project;
}

function selectStep(project: ReturnType<typeof createChordProject>, stepId: string) {
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, selectedStepId: stepId }),
  });
}

function setRecipeCommand(stepId = "step-1", nowIso = T1): SetMelodyRecipeCommand {
  return {
    type: "melody/set-recipe",
    payload: { stepId, recipe, instrument: "violin", nowIso },
  };
}

describe("T169 — undoable melody recipe and Melody Track commands", () => {
  it("creates or edits recipe plus optional instrument as one atomic Undo/Redo entry", () => {
    const initial = selectStep(createChordProject(), "step-1");
    const command = setRecipeCommand();
    const applied = setMelodyRecipe(initial, command);

    expect(applied.project.progression.steps[0]).toHaveProperty("melody", recipe);
    expect(applied.project.melodyTrack.instrument).toBe("violin");
    expect(applied.project.progression.selectedStepId).toBe("step-1");
    expect(applied.project.updatedAt).toBe(T1);
    expect(applied.inverse.type).toBe("melody/restore-state");
    expect(applyInverseCommand(applied.project, applied.inverse)).toEqual(initial);
    expect(applyInverseCommand(initial, applied.forward!)).toEqual(applied.project);

    const store = new AppStore(initial);
    store.dispatch(command, setMelodyRecipe);
    expect(store.history.undoDepth).toBe(1);
    expect(store.project.melodyTrack.instrument).toBe("violin");
    expect(store.undo()).toBe(true);
    expect(store.project).toEqual(initial);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps[0]).toHaveProperty("melody", recipe);
    expect(store.project.melodyTrack.instrument).toBe("violin");
  });

  it("edits and removes recipes without changing the Step or selection, with exact inverse restore", () => {
    const initial = selectStep(createChordProject(), "step-1");
    const created = setMelodyRecipe(initial, setRecipeCommand()).project;
    const edited = setMelodyRecipe(created, {
      type: "melody/set-recipe",
      payload: {
        stepId: "step-1",
        recipe: { pattern: "down", grid: "quarter", octaveOffset: -1 },
        nowIso: "2026-09-10T12:02:00.000Z",
      },
    });
    expect(edited.project.progression.selectedStepId).toBe("step-1");

    const removeCommand: RemoveMelodyRecipeCommand = {
      type: "melody/remove-recipe",
      payload: { stepId: "step-1", nowIso: "2026-09-10T12:03:00.000Z" },
    };
    const removed = removeMelodyRecipe(edited.project, removeCommand);
    expect(removed.project.progression.steps[0]).not.toHaveProperty("melody");
    expect(removed.project.progression.steps[0]?.id).toBe("step-1");
    expect(removed.project.progression.selectedStepId).toBe("step-1");
    expect(applyInverseCommand(removed.project, removed.inverse)).toEqual(edited.project);
  });

  it("validates Melody Track settings, auto-clears the opposing flag, and is undoable", () => {
    const initial = createChordProject();
    const muteCommand: SetMelodyTrackSettingsCommand = {
      type: "melody/set-track-settings",
      payload: { patch: { muted: true }, nowIso: T1 },
    };
    const muted = setMelodyTrackSettings(initial, muteCommand);
    expect(muted.project.melodyTrack).toEqual({
      instrument: "flute",
      muted: true,
      solo: false,
      volume: 100,
    });

    const soloCommand: SetMelodyTrackSettingsCommand = {
      type: "melody/set-track-settings",
      payload: {
        settings: { instrument: "cello", muted: false, solo: true, volume: 64 },
        nowIso: "2026-09-10T12:02:00.000Z",
      },
    };
    const solo = setMelodyTrackSettings(muted.project, soloCommand);
    expect(solo.project.melodyTrack).toEqual({
      instrument: "cello",
      muted: false,
      solo: true,
      volume: 64,
    });
    expect(Object.isFrozen(solo.project.melodyTrack)).toBe(true);
    expect(applyInverseCommand(solo.project, solo.inverse)).toEqual(muted.project);

    const store = new AppStore(initial);
    store.dispatch(soloCommand, setMelodyTrackSettings);
    expect(store.undo()).toBe(true);
    expect(store.project.melodyTrack).toEqual(initial.melodyTrack);
    expect(store.redo()).toBe(true);
    expect(store.project.melodyTrack.solo).toBe(true);
  });

  it("applies mutually exclusive Mute/Solo patches and rejects invalid track patches", () => {
    const initial = createChordProject();
    const muted = setMelodyTrackSettings(initial, {
      type: "melody/set-track-settings",
      payload: { patch: { muted: true }, nowIso: T1 },
    }).project;
    const soloed = setMelodyTrackSettings(muted, {
      type: "melody/set-track-settings",
      payload: { patch: { solo: true }, nowIso: T1 },
    }).project;
    expect(soloed.melodyTrack).toEqual({
      instrument: "flute",
      muted: false,
      solo: true,
      volume: 100,
    });

    const mutedAgain = setMelodyTrackSettings(soloed, {
      type: "melody/set-track-settings",
      payload: { patch: { muted: true }, nowIso: T1 },
    }).project;
    expect(mutedAgain.melodyTrack).toEqual({
      instrument: "flute",
      muted: true,
      solo: false,
      volume: 100,
    });

    for (const patch of [
      { muted: true, solo: true },
      { volume: -1 },
      { volume: 128 },
      { volume: 63.5 },
      { instrument: "piano" },
    ]) {
      expect(() =>
        setMelodyTrackSettings(initial, {
          type: "melody/set-track-settings",
          payload: {
            patch: patch as SetMelodyTrackSettingsCommand["payload"]["patch"],
            nowIso: T1,
          },
        }),
      ).toThrow();
    }

    expect(() =>
      setMelodyTrackSettings(initial, {
        type: "melody/set-track-settings",
        payload: {
          settings: initial.melodyTrack,
          patch: { volume: 90 },
          nowIso: T1,
        },
      }),
    ).toThrow(MelodyCommandError);
  });

  it("rejects unknown/rest steps and malformed settings without mutating the source", () => {
    const initial = createChordProject();
    const before = JSON.stringify(initial);

    expect(() => setMelodyRecipe(initial, setRecipeCommand("missing-step"))).toThrow(RangeError);
    expect(() =>
      setMelodyRecipe(initial, {
        type: "melody/set-recipe",
        payload: {
          stepId: "step-1",
          recipe: { pattern: "random" as never, grid: "quarter", octaveOffset: 0 },
          nowIso: T1,
        },
      }),
    ).toThrow(MelodyValidationError);
    expect(() =>
      setMelodyTrackSettings(initial, {
        type: "melody/set-track-settings",
        payload: {
          settings: { instrument: "flute", muted: true, solo: true, volume: 100 },
          nowIso: T1,
        },
      }),
    ).toThrow(MelodyValidationError);

    const withRest = addRestStep(initial, {
      type: "progression/add-rest",
      payload: { stepId: "rest-1", nowIso: T1 },
    }).project;
    expect(() => setMelodyRecipe(withRest, setRecipeCommand("rest-1"))).toThrow(RangeError);
    expect(() =>
      removeMelodyRecipe(initial, {
        type: "melody/remove-recipe",
        payload: { stepId: "step-1", nowIso: T1 },
      }),
    ).toThrow(MelodyCommandError);
    expect(JSON.stringify(initial)).toBe(before);
  });

  it("preserves recipes through Repeat, Extend/duration, Replace, Reorder, Remove, and Reset Performance", () => {
    const initial = createChordProject();
    const withRecipe = setMelodyRecipe(initial, setRecipeCommand()).project;
    const repeated = repeatChordStep(withRecipe, {
      type: "progression/repeat-chord",
      payload: {
        sourceStepId: "step-1",
        stepId: "step-2",
        duration: musicalDuration(rational(2)),
        nowIso: T1,
      },
    }).project;
    const repeatedRecipe =
      repeated.progression.steps[1]?.kind === "chord"
        ? repeated.progression.steps[1].melody
        : undefined;
    expect(repeatedRecipe).toEqual(recipe);
    expect(repeatedRecipe).not.toBe(withRecipe.progression.steps[0]?.melody);

    const extended = setStepDuration(withRecipe, {
      type: "timing/set-step-duration",
      payload: { stepId: "step-1", duration: musicalDuration(rational(6)), nowIso: T1 },
    }).project;
    expect(extended.progression.steps[0]).toHaveProperty("melody", recipe);

    const replaced = replaceStep(withRecipe, {
      type: "progression/replace-step",
      payload: { stepId: "step-1", functionId: "V", nowIso: T1 },
    }).project;
    expect(replaced.progression.steps[0]).toHaveProperty("melody", recipe);

    const reordered = reorderStep(repeated, {
      type: "progression/reorder-step",
      payload: { stepId: "step-2", targetIndex: 0, nowIso: T1 },
    }).project;
    expect(reordered.progression.steps[0]).toHaveProperty("melody", recipe);

    const removed = removeStep(withRecipe, {
      type: "progression/remove-step",
      payload: { stepId: "step-1", nowIso: T1 },
    });
    expect(removed.project.progression.steps).toHaveLength(0);
    expect(
      applyInverseCommand(removed.project, removed.inverse).progression.steps[0],
    ).toHaveProperty("melody", recipe);

    const reset = resetStepPerformance(withRecipe, {
      type: "progression/reset-performance",
      payload: { stepId: "step-1", nowIso: T1 },
    }).project;
    expect(reset.progression.steps[0]).toHaveProperty("melody", recipe);
  });

  it("keeps generated events out of Custom Presets", () => {
    const withRecipe = setMelodyRecipe(createChordProject(), setRecipeCommand()).project;
    const saved = saveCustomPresetFromProgression("Melody-free preset", withRecipe.progression);

    expect(saved.kind).toBe("success");
    if (saved.kind !== "success") return;
    expect(saved.preset.steps[0]).not.toHaveProperty("melody");
    expect(JSON.stringify(saved.preset)).not.toContain("generated");
  });
});
