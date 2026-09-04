import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { patchMatrixTemplate, resetCardTemplate, resetMatrixScope } from "../../../src/app/commands/matrixTemplateCommands";
import { editStepPerformance, reorderStep, replaceStep, resetStepPerformance } from "../../../src/app/commands/progressionCommands";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { Project } from "../../../src/domain/project/project";
import type { ChordStep } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";

const T0 = "2026-09-04T12:00:00.000Z";
const T1 = "2026-09-04T12:00:01.000Z";

function withSteps(project: Project, steps: readonly ChordStep[]): Project {
  return Object.freeze({ ...project, progression: Object.freeze({ ...project.progression, steps: Object.freeze([...steps]) }) });
}

describe("US3 progression-step independence", () => {
  it("snapshots repeated chords independently and preserves explicit template settings after Add", () => {
    let project = createDefaultProject("p", "US3", T0);
    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: { functionId: "I", performanceOverrides: { articulation: "arp-up", masterVelocity: 92 }, nowIso: T1 },
    }).project;

    const first = createMatrixChordStep(project, "I", "step-1");
    const second = createMatrixChordStep(project, "I", "step-2");
    expect(first.performance.articulation).toBe("arp-up");
    expect(second.performance.masterVelocity).toBe(92);
    expect(first.performance).not.toBe(second.performance);
    expect(first.performance.bass).not.toBe(second.performance.bass);

    let populated = withSteps(project, [first, second]);
    populated = editStepPerformance(populated, {
      type: "progression/edit-performance",
      payload: { stepId: "step-1", performance: { masterVelocity: 55, articulation: "humanized" }, nowIso: T1 },
    }).project;

    const editedFirst = populated.progression.steps[0] as ChordStep;
    const untouchedSecond = populated.progression.steps[1] as ChordStep;
    expect(editedFirst.performance.masterVelocity).toBe(55);
    expect(editedFirst.performance.articulation).toBe("humanized");
    expect(untouchedSecond.performance.masterVelocity).toBe(92);
    expect(untouchedSecond.performance.articulation).toBe("arp-up");
    expect(populated.moduleTemplateStates.progressions.cards.I?.explicitOverrides.performance?.masterVelocity).toBe(92);
  });

  it("inherits defaults per parameter without retroactively changing existing steps", () => {
    let project = createDefaultProject("p", "US3", T0);
    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: { functionId: "I", performanceOverrides: { articulation: "arp-down" }, nowIso: T1 },
    }).project;
    const beforeDefaultsChange = createMatrixChordStep(project, "I", "before");
    expect(beforeDefaultsChange.performance.masterVelocity).toBe(80);
    expect(beforeDefaultsChange.performance.articulation).toBe("arp-down");

    const changedDefaults: Project = Object.freeze({
      ...project,
      defaults: Object.freeze({
        piano: Object.freeze({
          ...project.defaults.piano,
          performance: Object.freeze({ ...project.defaults.piano.performance, masterVelocity: 68, articulation: "humanized" }),
        }),
      }),
      progression: Object.freeze({ ...project.progression, steps: Object.freeze([beforeDefaultsChange]) }),
    });
    const afterDefaultsChange = createMatrixChordStep(changedDefaults, "I", "after");

    expect(beforeDefaultsChange.performance.masterVelocity).toBe(80);
    expect(beforeDefaultsChange.performance.articulation).toBe("arp-down");
    expect(afterDefaultsChange.performance.masterVelocity).toBe(68);
    expect(afterDefaultsChange.performance.articulation).toBe("arp-down");
  });

  it("resets Matrix templates without touching existing My Progression snapshots", () => {
    let project = createDefaultProject("p", "US3", T0);
    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: { functionId: "I", performanceOverrides: { masterVelocity: 103 }, nowIso: T1 },
    }).project;
    const added = createMatrixChordStep(project, "I", "step-1");
    project = withSteps(project, [added]);

    const afterCardReset = resetCardTemplate(project, { type: "matrix-template/reset-card", payload: { functionId: "I", nowIso: T1 } }).project;
    expect(afterCardReset.moduleTemplateStates.progressions.cards.I).toBeUndefined();
    expect((afterCardReset.progression.steps[0] as ChordStep).performance.masterVelocity).toBe(103);

    const afterAllReset = resetMatrixScope(afterCardReset, { type: "matrix-template/reset-scope", payload: { scope: "all-modules", nowIso: T1 } }).project;
    expect((afterAllReset.progression.steps[0] as ChordStep).performance.masterVelocity).toBe(103);
  });

  it("reorders the whole immutable step object with all local settings intact", () => {
    let project = createDefaultProject("p", "US3", T0);
    const first = createMatrixChordStep(project, "I", "first");
    const secondBase = createMatrixChordStep(project, "V", "second");
    const second: ChordStep = Object.freeze({ ...secondBase, performance: Object.freeze({ ...secondBase.performance, masterVelocity: 117, articulation: "broken-chord" }) });
    project = withSteps(project, [first, second]);

    const reordered = reorderStep(project, { type: "progression/reorder-step", payload: { stepId: "second", targetIndex: 0, nowIso: T1 } }).project;
    const moved = reordered.progression.steps[0] as ChordStep;
    expect(moved.id).toBe("second");
    expect(moved.performance.masterVelocity).toBe(117);
    expect(moved.performance.articulation).toBe("broken-chord");
  });

  it("Replace Step changes harmonic content only and Reset Step Performance preserves variant and duration", () => {
    let project = createDefaultProject("p", "US3", T0);
    const variant = Object.freeze({ ...EMPTY_HARMONIC_VARIANT, extensions: Object.freeze([9 as const]) });
    const customDuration = musicalDuration(rational(2), { kind: "beats", label: "2 beats" });
    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: { functionId: "I", durationOverride: customDuration, harmonicVariantOverride: variant, performanceOverrides: { masterVelocity: 111, articulation: "humanized" }, nowIso: T1 },
    }).project;
    const original = createMatrixChordStep(project, "I", "step-1");
    project = withSteps(project, [original]);

    const replacedProject = replaceStep(project, { type: "progression/replace-step", payload: { stepId: "step-1", functionId: "V", nowIso: T1 } }).project;
    const replaced = replacedProject.progression.steps[0] as ChordStep;
    expect(replaced.harmonicFunction.functionId).toBe("V");
    expect(replaced.performance.masterVelocity).toBe(111);
    expect(replaced.duration).toEqual(customDuration);

    const resetProject = resetStepPerformance(project, { type: "progression/reset-performance", payload: { stepId: "step-1", nowIso: T1 } }).project;
    const reset = resetProject.progression.steps[0] as ChordStep;
    expect(reset.harmonicFunction).toEqual(original.harmonicFunction);
    expect(reset.harmonicVariant).toEqual(variant);
    expect(reset.duration).toEqual(customDuration);
    expect(reset.performance.masterVelocity).toBe(project.defaults.piano.performance.masterVelocity);
    expect(reset.performance.articulation).toBe(project.defaults.piano.performance.articulation);
  });
});
