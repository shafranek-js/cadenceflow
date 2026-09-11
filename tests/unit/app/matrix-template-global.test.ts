import { describe, expect, it } from "vitest";
import { createDefaultProject, DEFAULT_PIANO_DEFAULTS } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  patchMatrixTemplate,
  patchGlobalMatrixTemplate,
  resetGlobalMatrixTemplate,
  restoreGlobalMatrixTemplate,
  type PatchGlobalMatrixTemplateCommand,
  type ResetGlobalMatrixTemplateCommand,
  type RestoreGlobalMatrixTemplateCommand,
} from "../../../src/app/commands/matrixTemplateCommands";

describe("Global Matrix Template Commands", () => {
  const nowIso = "2026-09-11T12:00:00.000Z";

  it("updates project.defaults.piano duration globally and reflects on all matrix cards", () => {
    let project = createDefaultProject("test-p", "Test Project", nowIso);

    expect(project.defaults.piano.duration.beats).toEqual(rational(4));
    const stepI1 = createMatrixChordStep(project, "I", "step-i-1");
    expect(stepI1.duration.beats).toEqual(rational(4));

    const command: PatchGlobalMatrixTemplateCommand = {
      type: "matrix-template/patch-global",
      payload: {
        durationOverride: musicalDuration(rational(2)),
        nowIso,
      },
    };
    const result = patchGlobalMatrixTemplate(project, command);
    project = result.project;

    expect(project.defaults.piano.duration.beats).toEqual(rational(2));
    const stepI2 = createMatrixChordStep(project, "I", "step-i-2");
    const stepV2 = createMatrixChordStep(project, "V", "step-v-2");
    expect(stepI2.duration.beats).toEqual(rational(2));
    expect(stepV2.duration.beats).toEqual(rational(2));
  });

  it("clears individual card overrides for the globally modified property so all cards adopt it", () => {
    let project = createDefaultProject("test-p", "Test Project", nowIso);

    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: {
        functionId: "I",
        durationOverride: musicalDuration(rational(1)),
        nowIso,
      },
    }).project;

    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: {
        functionId: "V",
        performanceOverrides: { register: 1, articulation: "staccato" },
        nowIso,
      },
    }).project;

    expect(project.moduleTemplateStates.progressions.cards.I?.explicitOverrides.duration?.beats).toEqual(
      rational(1),
    );
    expect(project.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance?.register).toBe(
      1,
    );

    project = patchGlobalMatrixTemplate(project, {
      type: "matrix-template/patch-global",
      payload: {
        durationOverride: musicalDuration(rational(3)),
        nowIso,
      },
    }).project;

    expect(project.moduleTemplateStates.progressions.cards.I?.explicitOverrides.duration).toBeUndefined();
    const stepI = createMatrixChordStep(project, "I", "step-i");
    expect(stepI.duration.beats).toEqual(rational(3));

    expect(project.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance?.register).toBe(
      1,
    );
    expect(
      project.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance?.articulation,
    ).toBe("staccato");

    project = patchGlobalMatrixTemplate(project, {
      type: "matrix-template/patch-global",
      payload: {
        performanceOverrides: { register: -1 },
        nowIso,
      },
    }).project;

    expect(
      project.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance?.register,
    ).toBeUndefined();
    expect(
      project.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance?.articulation,
    ).toBe("staccato");
    const stepV = createMatrixChordStep(project, "V", "step-v");
    expect(stepV.performance.register).toBe(-1);
    expect(stepV.performance.articulation).toBe("staccato");
  });

  it("supports undo and redo via restoreGlobalMatrixTemplate", () => {
    const original = createDefaultProject("test-p", "Test Project", nowIso);
    const patched = patchGlobalMatrixTemplate(original, {
      type: "matrix-template/patch-global",
      payload: {
        durationOverride: musicalDuration(rational(2)),
        performanceOverrides: { masterVelocity: 110, articulation: "legato" },
        nowIso,
      },
    });

    expect(patched.project.defaults.piano.duration.beats).toEqual(rational(2));
    expect(patched.project.defaults.piano.performance.masterVelocity).toBe(110);
    expect(patched.project.defaults.piano.performance.articulation).toBe("legato");

    const restored = restoreGlobalMatrixTemplate(
      patched.project,
      patched.inverse as RestoreGlobalMatrixTemplateCommand,
    );

    expect(restored.project.defaults.piano.duration.beats).toEqual(rational(4));
    expect(restored.project.defaults.piano.performance.masterVelocity).toBe(80);
    expect(restored.project.defaults.piano.performance.articulation).toBe("humanized");
  });

  it("resets global matrix template to factory defaults", () => {
    let project = createDefaultProject("test-p", "Test Project", nowIso);
    project = patchGlobalMatrixTemplate(project, {
      type: "matrix-template/patch-global",
      payload: {
        durationOverride: musicalDuration(rational(1)),
        performanceOverrides: { register: 2, masterVelocity: 120 },
        nowIso,
      },
    }).project;

    const command: ResetGlobalMatrixTemplateCommand = {
      type: "matrix-template/reset-global",
      payload: { nowIso },
    };
    const reset = resetGlobalMatrixTemplate(project, command);

    expect(reset.project.defaults.piano.duration).toEqual(DEFAULT_PIANO_DEFAULTS.duration);
    expect(reset.project.defaults.piano.performance).toEqual(DEFAULT_PIANO_DEFAULTS.performance);
    expect(Object.keys(reset.project.moduleTemplateStates.progressions.cards)).toHaveLength(0);
  });
});
