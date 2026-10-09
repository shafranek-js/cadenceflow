import { describe, expect, it } from "vitest";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../../src/domain/project/migrations";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";
import { migrateProjectData } from "../../../src/domain/project/migrations";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import v1Fixture from "../../../tests/fixtures/progressions/v1-uniform-piano-legacy.cadenceflow.json";
import v2Fixture from "../../../tests/fixtures/progressions/v2-explicit-staff.cadenceflow.json";
import v3Fixture from "../../../tests/fixtures/progressions/v3-mixed-missing-presentation.cadenceflow.json";

const NOW = "2026-09-11T12:00:00.000Z";

function projectWithCardViews(cardViews: readonly ("harmonic" | "piano" | "staff")[]): Project {
  const project = createDefaultProject("legacy-view", "Legacy View", NOW);
  const steps = cardViews.map((cardView, index) =>
    Object.freeze({
      ...createMatrixChordStep(project, index === 1 ? "V" : "I", `step-${index + 1}`),
      cardView,
    }),
  );
  return Object.freeze<Project>({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
  });
}

function legacyPayload(project: Project): Record<string, unknown> {
  const payload = JSON.parse(encodePortableProject(project)) as Record<string, unknown>;
  const presentation = payload.presentation as Record<string, unknown>;
  delete presentation.progressionView;
  delete presentation.measuresPerSystem;
  // The wire format must declare a version that actually lacked these fields. Removing them from a
  // current-version document produced a payload that is invalid by construction — the schema
  // requires both — so every assertion failed on schema validation rather than on the
  // normalisation under test. Version 8 is the last one before the presentation defaults were
  // backfilled, so the migration chain now runs and supplies the values.
  payload.schemaVersion = 8;
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
    const presentation = payload.presentation as Record<string, unknown>;
    presentation.progressionView = "staff";

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
    const presentation = payload.presentation as Record<string, unknown>;
    presentation.measureLayoutColumns = legacy;

    const restored = decodePortableProject(JSON.stringify(payload));
    const saved = JSON.parse(encodePortableProject(restored)) as Record<string, unknown>;
    const savedPresentation = saved.presentation as Record<string, unknown>;

    expect(restored.presentation.measuresPerSystem).toBe(expected);
    expect(savedPresentation.measuresPerSystem).toBe(expected);
    expect(savedPresentation).not.toHaveProperty("measureLayoutColumns");
  });

  it.each([
    ["v1 -> v2 -> v3 -> v4", v1Fixture, "piano", 2, 100],
    ["v2 -> v3 -> v4", v2Fixture, "staff", 3, 100],
    ["v3 -> v4 legacy presentation", v3Fixture, "harmonic", 4, 91],
  ] as const)(
    "migrates durable %s fixture and re-encodes the current schema version",
    (_label, fixture, expectedView, expectedMeasures, expectedHarmonyVolume) => {
      const raw = structuredClone(fixture) as Record<string, unknown>;
      const sourceBeforeMigration = JSON.stringify(raw);
      const migrated = migrateProjectData(raw);

      expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
      expect(JSON.stringify(raw)).toBe(sourceBeforeMigration);

      const restored = decodePortableProject(JSON.stringify(raw));
      expect(restored.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
      expect(restored.presentation.progressionView).toBe(expectedView);
      expect(restored.presentation.measuresPerSystem).toBe(expectedMeasures);
      expect(restored.harmonyTrack.volume).toBe(expectedHarmonyVolume);
      expect(restored.presentation.progressionView).not.toBe("mixed");

      const canonicalJson = encodePortableProject(restored);
      const canonical = JSON.parse(canonicalJson) as Record<string, unknown>;
      const canonicalPresentation = canonical.presentation as Record<string, unknown>;
      expect(canonical.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
      expect(canonical.harmonyTrack).toEqual(
        expect.objectContaining({ instrument: "piano", volume: expectedHarmonyVolume }),
      );
      expect(canonical.melodyTrack).toEqual(
        expect.objectContaining({ instrument: expect.any(String), volume: expect.any(Number) }),
      );
      expect(canonical.presentation).toEqual(
        expect.objectContaining({
          progressionView: expectedView,
          measuresPerSystem: expectedMeasures,
          showBassInStaff: expect.any(Boolean),
        }),
      );
      expect(canonicalPresentation).not.toHaveProperty("measureLayoutColumns");
      expect(decodePortableProject(canonicalJson)).toEqual(restored);
    },
  );

  it("preserves mixed and missing legacy card views as step data while using harmonic fallback", () => {
    const restored = decodePortableProject(JSON.stringify(v3Fixture));
    const chordSteps = restored.progression.steps.filter(
      (step): step is Extract<Project["progression"]["steps"][number], { kind: "chord" }> =>
        step.kind === "chord",
    );

    expect(chordSteps.map((step) => step.cardView)).toEqual(["piano", "harmonic", "staff"]);
    expect(restored.presentation.progressionView).toBe("harmonic");
    expect(restored.presentation.progressionView).not.toBe("mixed");
  });
});
