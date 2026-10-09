import { describe, expect, it } from "vitest";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  InvalidProjectDataError,
  migrateProjectData,
} from "../../../src/domain/project/migrations";

/**
 * Migrations salvage unreadable fields instead of refusing the whole project.
 *
 * Regression context: v6→v7, v3→v4 and v4→v5 threw `InvalidProjectDataError` for a single
 * malformed melody recipe or instrument override. A legacy project with one corrupt Step was
 * therefore entirely unopenable — the user lost every other Step, section and setting it
 * contained. The offending field is now dropped and reported through
 * `migrateProjectData(data, true)`; the Step and the rest of the project survive.
 */

const validStep = {
  id: "good",
  kind: "chord",
  duration: { beats: { numerator: 4, denominator: 1 } },
  harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
  harmonicVariant: { extensions: [], suspensions: [], alterations: [] },
  performance: {},
};

const corruptMelodyStep = {
  ...validStep,
  id: "corrupt",
  // v6 stored a bare recipe; these values cannot be validated.
  melody: {
    pitchMotion: "NOT_A_MOTION",
    rhythm: "bogus",
    connection: "x",
    grid: "y",
    octaveOffset: 0,
  },
};

function legacyDoc(version: number, steps: readonly unknown[]): Record<string, unknown> {
  return {
    schemaVersion: version,
    id: "legacy",
    name: "Legacy",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    progression: { steps },
  };
}

describe("migration salvage", () => {
  it("advances v10 payloads through the atomic Chord Properties schema migration", () => {
    const source = {
      schemaVersion: 10,
      progression: { steps: [{ id: "v10-step", kind: "chord", transpositionSemitones: 0 }] },
      temporaryBranch: {
        steps: [{ id: "v10-branch-step", kind: "rest", transpositionSemitones: 0 }],
      },
    };
    const migrated = migrateProjectData(source) as {
      schemaVersion: number;
      progression: { steps: Record<string, unknown>[] };
      temporaryBranch: { steps: Record<string, unknown>[] };
    };

    expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(migrated.progression.steps[0]).toEqual({
      ...source.progression.steps[0],
      harmonicVariant: { extensions: [], suspensions: [], alterations: [] },
    });
    expect(migrated.temporaryBranch.steps[0]).toEqual(source.temporaryBranch.steps[0]);
  });

  it("opens a v6 project with one corrupt melody, keeping every step", () => {
    const result = migrateProjectData(legacyDoc(6, [validStep, corruptMelodyStep]), true);

    const steps = result.project["progression"] as { steps: Record<string, unknown>[] };
    expect(steps.steps).toHaveLength(2);
    expect(steps.steps.map((step) => step["id"])).toEqual(["good", "corrupt"]);

    // The unreadable field is dropped...
    const corrupt = steps.steps.find((step) => step["id"] === "corrupt")!;
    expect(corrupt["melody"]).toBeUndefined();
    // ...and reported, so nothing disappears silently.
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.field).toBe("melody");
    expect(result.diagnostics[0]?.path).toContain("progression.steps[1]");
  });

  it("reports nothing for a clean legacy project", () => {
    const result = migrateProjectData(legacyDoc(6, [validStep]), true);
    expect(result.diagnostics).toEqual([]);
    expect(result.project["schemaVersion"]).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });

  it("drops an unrecognized melody instrument override during v4→v5", () => {
    const result = migrateProjectData(
      legacyDoc(4, [{ ...validStep, melodyInstrumentOverride: "not-a-real-instrument" }]),
      true,
    );

    const steps = result.project["progression"] as { steps: Record<string, unknown>[] };
    expect(steps.steps[0]?.["melodyInstrumentOverride"]).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.field)).toContain(
      "melodyInstrumentOverride",
    );
  });

  it("keeps the single-argument form returning the bare record", () => {
    // ~20 call sites rely on this shape; it must not change.
    const migrated = migrateProjectData(legacyDoc(6, [validStep]));
    expect("project" in migrated).toBe(false);
    expect(migrated["schemaVersion"]).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });

  it("still rejects payloads that cannot be a project at all", () => {
    for (const bad of [null, undefined, "hello", 42, [], {}]) {
      expect(() => migrateProjectData(bad), `input ${JSON.stringify(bad)}`).toThrow(
        InvalidProjectDataError,
      );
    }
  });

  it("recovers a v1 project through the whole chain", () => {
    const result = migrateProjectData(legacyDoc(1, [validStep]), true);
    expect(result.project["schemaVersion"]).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(result.diagnostics).toEqual([]);
  });
});
