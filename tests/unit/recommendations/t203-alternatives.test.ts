import { describe, expect, it } from "vitest";
import { addMatrixPreview, createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createAlternativesTraySnapshot } from "../../../src/domain/recommendations/alternatives";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

function projectWithSteps() {
  const initial = createDefaultProject("t203", "T203", "2026-09-29T00:00:00.000Z");
  const first = addMatrixPreview(initial, {
    type: "matrix/add-preview",
    payload: { functionId: "I", stepId: "step-i", nowIso: initial.updatedAt },
  }).project;
  return addMatrixPreview(first, {
    type: "matrix/add-preview",
    payload: { functionId: "V", stepId: "step-v", nowIso: first.updatedAt },
  }).project;
}

describe("T203 alternatives tray projection", () => {
  it("is deterministic and keeps engine factors as the rationale source", () => {
    const project = projectWithSteps();
    const first = createAlternativesTraySnapshot(project, "step-v");
    const second = createAlternativesTraySnapshot(project, "step-v");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(
      first?.candidates.map(({ key, functionId, score, factors }) => ({
        key,
        functionId,
        score,
        factors,
      })),
    ).toEqual(
      second?.candidates.map(({ key, functionId, score, factors }) => ({
        key,
        functionId,
        score,
        factors,
      })),
    );
    expect(first?.candidates.every((candidate) => candidate.factors.length >= 0)).toBe(true);
    expect(first?.candidates.map((candidate) => candidate.functionId)).toEqual(
      expect.arrayContaining(["I"]),
    );
  });

  it("does not project a Rest as an alternatives origin", () => {
    const initial = createDefaultProject("t203-rest", "T203 Rest", "2026-09-29T00:00:00.000Z");
    const restProject = Object.freeze({
      ...initial,
      progression: Object.freeze({
        ...initial.progression,
        steps: Object.freeze([
          Object.freeze({
            id: "rest",
            kind: "rest" as const,
            duration: musicalDuration(rational(1)),
          }),
        ]),
      }),
    });

    expect(createAlternativesTraySnapshot(restProject, "rest")).toBeNull();
  });

  it("uses the stable origin Step ID rather than a generated preview ID", () => {
    const project = projectWithSteps();
    const snapshot = createAlternativesTraySnapshot(project, "step-v");
    const expected = createMatrixChordStep(project, "V", "step-v");

    expect(snapshot?.originStepId).toBe(expected.id);
    expect(snapshot?.candidates.every((candidate) => candidate.key.includes("step-v:"))).toBe(true);
  });
});
