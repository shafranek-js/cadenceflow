import { describe, expect, it } from "vitest";
import { addMatrixPreview } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { getHarmonicModule } from "../../../src/domain/harmony/moduleRegistry";
import { realizeStepAudioEvents } from "../../../src/audio/eventRealizer";
import { resolvePreviousHarmonicContext } from "../../../src/ui/matrix/previewRealization";

function projectWithMiddleOrigin() {
  const initial = createDefaultProject("t203-audio", "T203 Audio", "2026-09-29T00:00:00.000Z");
  const withFirst = addMatrixPreview(initial, {
    type: "matrix/add-preview",
    payload: { functionId: "I", stepId: "first", nowIso: initial.updatedAt },
  }).project;
  const withOrigin = addMatrixPreview(withFirst, {
    type: "matrix/add-preview",
    payload: { functionId: "IV", stepId: "origin", nowIso: withFirst.updatedAt },
  }).project;
  return addMatrixPreview(withOrigin, {
    type: "matrix/add-preview",
    payload: { functionId: "V", stepId: "last", nowIso: withOrigin.updatedAt },
  }).project;
}

describe("T203 continuation audition context", () => {
  it("uses the exact middle origin instead of the progression's last chord", () => {
    const project = projectWithMiddleOrigin();
    const origin = project.progression.steps.find((step) => step.id === "origin");
    if (!origin || origin.kind !== "chord") throw new Error("origin fixture must be a chord");

    const exactOriginContext = resolvePreviousHarmonicContext(project, "origin");
    const latestContext = resolvePreviousHarmonicContext(project);
    const mode = getHarmonicModule(project.activeModule).mode;
    const expectedOrigin = realizeStepAudioEvents({
      step: origin,
      tonic: project.tonic,
      context: {
        tonic: project.tonic,
        mode,
        moduleId: project.activeModule,
        spellingContext: { tonic: project.tonic, mode },
      },
      tempoBpm: project.globalTiming.tempoBpm,
    });

    expect(exactOriginContext?.previousPitches).toEqual(expectedOrigin.upperPitches);
    expect(exactOriginContext?.previousPitches).not.toEqual(latestContext?.previousPitches);
  });
});
