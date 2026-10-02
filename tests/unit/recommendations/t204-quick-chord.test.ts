import { describe, expect, it } from "vitest";
import { addMatrixPreview } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createQuickChordCandidates } from "../../../src/domain/recommendations/quickChord";

function projectWithCommittedSource(functionId: string) {
  const initial = createDefaultProject("t204", "T204", "2026-09-30T00:00:00.000Z");
  return addMatrixPreview(initial, {
    type: "matrix/add-preview",
    payload: { functionId, stepId: "committed-source", nowIso: initial.updatedAt },
  }).project;
}

describe("T204 Quick Chord candidates", () => {
  it("is deterministic and exposes a short rationale for every result", () => {
    const project = createDefaultProject("t204-empty", "T204 Empty");
    const first = createQuickChordCandidates(project);
    const second = createQuickChordCandidates(project);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((candidate) => candidate.explanation.length > 0)).toBe(true);
    expect(first.map((candidate) => candidate.functionId)).toEqual(
      expect.arrayContaining(["I", "V", "V7/V"]),
    );
  });

  it("uses the committed endpoint for strict routing even when a different result is previewed", () => {
    const project = projectWithCommittedSource("V7/vi");
    const candidates = createQuickChordCandidates(project, {
      currentFunctionId: "V7/vi",
      currentTargetId: "vi",
    });
    const blocked = candidates.find((candidate) => candidate.functionId === "V7/V");

    expect(blocked?.routeStatus).toBe("requires-confirmation");
    expect(blocked?.routeMessage).toContain("vi");
  });

  it("keeps no-source discovery permissive until the canonical Apply path evaluates a route", () => {
    const project = createDefaultProject("t204-no-source", "T204 No Source");
    const candidate = createQuickChordCandidates(project).find(
      (item) => item.functionId === "V7/V",
    );

    expect(candidate?.routeStatus).toBe("allowed");
  });
});
