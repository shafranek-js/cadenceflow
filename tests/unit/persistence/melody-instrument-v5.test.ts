import { describe, expect, it } from "vitest";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../../src/domain/project/migrations";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import { migrateProjectData } from "../../../src/domain/project/migrations";
import type { ChordStep } from "../../../src/domain/progression/step";

describe("T188 Melody instrument persistence through schema v6", () => {
  it("round-trips an explicit Step override and leaves inheriting Steps absent", () => {
    const project = createRichProjectFixture();
    const first = project.progression.steps[0] as ChordStep;
    const second = project.progression.steps[1] as ChordStep;
    const withOverride = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([
          Object.freeze({ ...first, melodyInstrumentOverride: "gm-081" as const }),
          second,
          ...project.progression.steps.slice(2),
        ]),
      }),
    });
    const encoded = encodePortableProject(withOverride);
    const raw = JSON.parse(encoded) as { schemaVersion: number; progression: { steps: unknown[] } };
    expect(raw.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(raw.progression.steps[0]).toHaveProperty("melodyInstrumentOverride", "gm-081");
    expect(raw.progression.steps[1]).not.toHaveProperty("melodyInstrumentOverride");
    expect(decodePortableProject(encoded).progression.steps[0]).toHaveProperty(
      "melodyInstrumentOverride",
      "gm-081",
    );
  });

  it("migrates v4 to v6 without copying the global track instrument into Steps", () => {
    const project = createRichProjectFixture();
    const v4 = JSON.parse(encodePortableProject(project)) as Record<string, unknown>;
    v4.schemaVersion = 4;
    const migrated = migrateProjectData(v4);
    expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    const steps = (migrated.progression as { steps: Record<string, unknown>[] }).steps;
    expect(
      steps.every(
        (step) => !Object.prototype.hasOwnProperty.call(step, "melodyInstrumentOverride"),
      ),
    ).toBe(true);
  });
});
