import { describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  addMatrixPreview,
  type AddMatrixPreviewCommand,
} from "../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../src/domain/project/factory";

describe("Matrix Preview/Add", () => {
  it("ordinary preview selection does not mutate My Progression", () => {
    const store = new AppStore(
      createDefaultProject("project-1", "Preview test", "2026-09-04T12:00:00.000Z"),
    );
    const before = store.project;
    store.selectMatrixPreview("I");
    expect(store.matrixSession.previewFunctionId).toBe("I");
    expect(store.project).toBe(before);
    expect(store.project.progression.steps).toHaveLength(0);
  });

  it("explicit Add creates an independent progression step", () => {
    const store = new AppStore(
      createDefaultProject("project-1", "Add test", "2026-09-04T12:00:00.000Z"),
    );
    store.selectMatrixPreview("I");
    const command: AddMatrixPreviewCommand = {
      type: "matrix/add-preview",
      payload: { functionId: "I", stepId: "step-1", nowIso: "2026-09-04T12:00:01.000Z" },
    };
    store.dispatch(command, addMatrixPreview);
    expect(store.project.progression.steps).toHaveLength(1);
    expect(store.project.progression.steps[0]?.id).toBe("step-1");
    expect(store.matrixSession.previewFunctionId).toBe("I");
  });
});
