import { describe, expect, it } from "vitest";
import { addMatrixPreview } from "../../src/app/commands/matrixCommands";
import { addBranchPreview, applyBranchCommand, commitBranchCommand, setBranchRejoinCommand, startBranch, type BranchCommand } from "../../src/app/commands/branchCommands";
import { createDefaultProject } from "../../src/domain/project/factory";

function add(project: ReturnType<typeof createDefaultProject>, fn: string, id: string) {
  return addMatrixPreview(project, { type: "matrix/add-preview", payload: { functionId: fn, stepId: id, nowIso: `2026-09-04T12:00:0${id.length}.000Z` } }).project;
}

describe("branch commit undo", () => {
  it("inverse restore returns the exact original progression and active branch", () => {
    let project = createDefaultProject("p", "test", "2026-09-04T12:00:00.000Z");
    project = add(add(add(add(project, "I", "s1"), "vi", "s2"), "IV", "s3"), "V", "s4");
    const originalProgression = project.progression;
    project = startBranch(project, { type: "branch/start", payload: { branchId: "b", originStepId: "s2", nowIso: "2026-09-04T12:01:00.000Z" } }).project;
    project = addBranchPreview(project, { type: "branch/add-preview", payload: { functionId: "ii", stepId: "b1", nowIso: "2026-09-04T12:01:01.000Z" } }).project;
    project = setBranchRejoinCommand(project, { type: "branch/set-rejoin", payload: { rejoinStepId: "s4", nowIso: "2026-09-04T12:01:02.000Z" } }).project;
    const branchBeforeCommit = project.temporaryBranch;
    const applied = commitBranchCommand(project, { type: "branch/commit", payload: { nowIso: "2026-09-04T12:01:03.000Z" } });
    expect(applied.project.temporaryBranch).toBeUndefined();
    const restored = applyBranchCommand(applied.project, applied.inverse as BranchCommand).project;
    expect(restored.progression).toBe(originalProgression);
    expect(restored.temporaryBranch).toBe(branchBeforeCommit);
  });
});
