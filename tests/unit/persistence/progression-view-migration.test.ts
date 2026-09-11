import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

const NOW = "2026-09-11T12:00:00.000Z";

function projectWithCardViews(cardViews: readonly ("harmonic" | "piano" | "staff")[]): Project {
  const project = createDefaultProject("legacy-view", "Legacy View", NOW);
  const steps = cardViews.map((cardView, index) =>
    Object.freeze({
      ...createMatrixChordStep(project, index === 1 ? "V" : "I", `step-${index + 1}`),
      cardView,
    }),
  );
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
  });
}

function legacyPayload(project: Project): Record<string, any> {
  const payload = JSON.parse(encodePortableProject(project)) as Record<string, any>;
  delete payload.presentation.progressionView;
  delete payload.presentation.measuresPerSystem;
  return payload;
}

describe("US13 progression presentation persistence", () => {
  it("normalizes a uniform legacy cardView set to the global view", () => {
    const payload = legacyPayload(projectWithCardViews(["piano", "piano"]));

    const restored = decodePortableProject(JSON.stringify(payload));

    expect(restored.presentation.progressionView).toBe("piano");
    expect(restored.presentation.measuresPerSystem).toBe("auto");
  });

  it.each([
    ["mixed", ["piano", "staff"]],
    ["empty", []],
  ] as const)("normalizes %s legacy values to harmonic", (_label, cardViews) => {
    const payload = legacyPayload(projectWithCardViews(cardViews));

    const restored = decodePortableProject(JSON.stringify(payload));

    expect(restored.presentation.progressionView).toBe("harmonic");
  });

  it("gives an explicit progressionView priority over legacy cardView values", () => {
    const payload = legacyPayload(projectWithCardViews(["piano", "piano"]));
    payload.presentation.progressionView = "staff";

    const restored = decodePortableProject(JSON.stringify(payload));

    expect(restored.presentation.progressionView).toBe("staff");
  });

  it.each([
    ["auto", "auto"],
    ["1", 1],
    ["2", 2],
    ["3", 3],
    ["4", 4],
  ] as const)("accepts the old measureLayoutColumns alias %s", (legacy, expected) => {
    const payload = legacyPayload(projectWithCardViews(["harmonic"]));
    payload.presentation.measureLayoutColumns = legacy;

    const restored = decodePortableProject(JSON.stringify(payload));
    const saved = JSON.parse(encodePortableProject(restored)) as Record<string, any>;

    expect(restored.presentation.measuresPerSystem).toBe(expected);
    expect(saved.presentation.measuresPerSystem).toBe(expected);
    expect(saved.presentation).not.toHaveProperty("measureLayoutColumns");
  });
});
