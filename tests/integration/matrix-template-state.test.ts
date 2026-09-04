import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../src/domain/project/factory";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import {
  patchMatrixTemplate,
  resetMatrixScope,
} from "../../src/app/commands/matrixTemplateCommands";
import { setTonic, switchModule } from "../../src/app/commands/harmonyContextCommands";

const T = "2026-09-04T12:00:01.000Z";

describe("US3 Matrix template state integration", () => {
  it("keeps overrides attached to harmonic function across tonic changes", () => {
    let project = createDefaultProject("p", "Matrix state", T);
    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: {
        functionId: "V",
        performanceOverrides: { articulation: "arp-up", masterVelocity: 97 },
        nowIso: T,
      },
    }).project;
    const inC = createMatrixChordStep(project, "V", "c-v");
    project = setTonic(project, {
      type: "harmony/set-tonic",
      payload: { tonic: 2, nowIso: T },
    }).project;
    const inD = createMatrixChordStep(project, "V", "d-v");

    expect(inC.harmonicFunction.functionId).toBe("V");
    expect(inD.harmonicFunction.functionId).toBe("V");
    expect(inD.performance.articulation).toBe("arp-up");
    expect(inD.performance.masterVelocity).toBe(97);
    expect(
      project.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance
        ?.masterVelocity,
    ).toBe(97);
  });

  it("keeps Progressions and Dark Harmony template states independent", () => {
    let project = createDefaultProject("p", "Matrix state", T);
    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: { functionId: "V", performanceOverrides: { masterVelocity: 91 }, nowIso: T },
    }).project;

    project = switchModule(project, {
      type: "harmony/switch-module",
      payload: { destinationModule: "dark-harmony", resolutions: {}, nowIso: T },
    }).project;
    project = patchMatrixTemplate(project, {
      type: "matrix-template/patch",
      payload: {
        functionId: "i",
        performanceOverrides: { articulation: "humanized", masterVelocity: 66 },
        nowIso: T,
      },
    }).project;

    expect(
      project.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance
        ?.masterVelocity,
    ).toBe(91);
    expect(
      project.moduleTemplateStates["dark-harmony"].cards.i?.explicitOverrides.performance
        ?.masterVelocity,
    ).toBe(66);

    const resetCurrent = resetMatrixScope(project, {
      type: "matrix-template/reset-scope",
      payload: { scope: "current-module", nowIso: T },
    }).project;
    expect(resetCurrent.moduleTemplateStates["dark-harmony"].cards.i).toBeUndefined();
    expect(
      resetCurrent.moduleTemplateStates.progressions.cards.V?.explicitOverrides.performance
        ?.masterVelocity,
    ).toBe(91);

    const resetAll = resetMatrixScope(project, {
      type: "matrix-template/reset-scope",
      payload: { scope: "all-modules", nowIso: T },
    }).project;
    expect(Object.keys(resetAll.moduleTemplateStates.progressions.cards)).toHaveLength(0);
    expect(Object.keys(resetAll.moduleTemplateStates["dark-harmony"].cards)).toHaveLength(0);
  });
});
