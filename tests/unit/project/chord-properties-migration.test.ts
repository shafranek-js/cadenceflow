import { describe, expect, it } from "vitest";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../../src/domain/project/migrations";
import {
  decodePortableProject,
  encodePortableProject,
  InvalidPortableProjectError,
} from "../../../src/persistence/portableProject";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";

interface MutablePayload {
  schemaVersion: number;
  independentBassEnabled?: boolean;
  progression: { steps: Array<Record<string, unknown>> };
  temporaryBranch?: Record<string, unknown>;
}

function v10Payload(): MutablePayload {
  const payload = JSON.parse(encodePortableProject(createRichProjectFixture())) as MutablePayload;
  payload.schemaVersion = 10;
  delete payload.independentBassEnabled;
  const chords = payload.progression.steps.filter((step) => step["kind"] === "chord");
  const chord = chords[0];
  const secondaryChord = chords[1];
  if (!chord || !secondaryChord) throw new Error("The rich Project must contain two chord Steps");
  chord["harmonicFunction"] = {
    ...(chord["harmonicFunction"] as Record<string, unknown>),
    category: "tonic",
  };
  chord["harmonicVariant"] = { extensions: [9], seventh: "major7" };
  secondaryChord["harmonicFunction"] = {
    moduleId: "progressions",
    functionId: "V7/ii",
    category: "dominant",
    targetFunctionId: "ii",
    targetId: "ii",
  };
  secondaryChord["harmonicVariant"] = { extensions: [], seventh: "minor7" };
  if (!payload.temporaryBranch) throw new Error("The rich Project must contain a temporary Branch");
  payload.temporaryBranch["steps"] = [
    { ...chord, id: "branch-tonic" },
    { ...secondaryChord, id: "branch-secondary" },
  ];
  return payload;
}

describe("T217 schema v11 migration", () => {
  it("canonicalizes old categories and fills neutral variant arrays in both Step collections", () => {
    const payload = v10Payload();
    const before = JSON.stringify(payload);
    const project = decodePortableProject(JSON.stringify(payload));
    const chord = project.progression.steps.find((step) => step.kind === "chord");
    const branchSteps =
      project.temporaryBranch?.steps.filter((step) => step.kind === "chord") ?? [];
    const branchChord = branchSteps[0];
    const branchSecondary = branchSteps[1];
    const secondary = project.progression.steps[1];

    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(project.independentBassEnabled).toBe(false);
    expect(chord).toMatchObject({
      kind: "chord",
      harmonicFunction: {
        functionId: "I",
        category: "core",
      },
      harmonicVariant: {
        extensions: [9],
        suspensions: [],
        alterations: [],
        seventh: "major7",
      },
    });
    expect(branchChord).toMatchObject({
      kind: "chord",
      harmonicFunction: { category: "core" },
      harmonicVariant: { extensions: [9], suspensions: [], alterations: [] },
    });
    expect(secondary).toMatchObject({
      kind: "chord",
      harmonicFunction: {
        functionId: "V7/ii",
        category: "secondary-dominant",
        targetFunctionId: "ii",
        targetId: "ii",
      },
      harmonicVariant: { extensions: [], suspensions: [], alterations: [], seventh: "minor7" },
    });
    expect(branchSecondary).toMatchObject({
      kind: "chord",
      harmonicFunction: { functionId: "V7/ii", category: "secondary-dominant" },
    });
    expect(JSON.stringify(payload)).toBe(before);
  });

  it("preserves an explicitly enabled independent bass voice while migrating v10", () => {
    const payload = v10Payload();
    payload.independentBassEnabled = true;

    expect(decodePortableProject(JSON.stringify(payload)).independentBassEnabled).toBe(true);
  });

  it("defaults a pre-setting v11 payload to independent bass off", () => {
    const payload = JSON.parse(encodePortableProject(createRichProjectFixture())) as MutablePayload;
    delete payload.independentBassEnabled;

    expect(decodePortableProject(JSON.stringify(payload)).independentBassEnabled).toBe(false);
  });

  it("round-trips the independent bass setting through the current portable codec", () => {
    const project = { ...createRichProjectFixture(), independentBassEnabled: false };

    expect(decodePortableProject(encodePortableProject(project)).independentBassEnabled).toBe(
      false,
    );
  });

  it("keeps strict schema validation for malformed current-v11 function categories", () => {
    const payload = JSON.parse(encodePortableProject(createRichProjectFixture())) as MutablePayload;
    const chord = payload.progression.steps.find((step) => step["kind"] === "chord");
    if (!chord) throw new Error("The default Project must contain a chord Step");
    chord["harmonicFunction"] = {
      ...(chord["harmonicFunction"] as Record<string, unknown>),
      category: "tonic",
    };

    expect(() => decodePortableProject(JSON.stringify(payload))).toThrow(
      InvalidPortableProjectError,
    );
  });
});
