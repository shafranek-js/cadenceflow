import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createDefaultMelodyTrackSettings,
  validateChordMelodyRecipe,
  validateMelodyTrackSettings,
} from "../../../src/domain/melody/types";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  migrateProjectData,
  UnsupportedProjectVersionError,
} from "../../../src/domain/project/migrations";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import {
  decodePortableProject,
  encodePortableProject,
  InvalidPortableProjectError,
} from "../../../src/persistence/portableProject";
import { createCadenceFlowDb } from "../../../src/persistence/db";
import { createAutosaveEngine } from "../../../src/persistence/autosave";
import { createProjectRepository } from "../../../src/persistence/projectRepository";

type MutableMelodyTrackPayload = {
  instrument?: unknown;
  muted?: unknown;
  solo?: unknown;
  volume?: unknown;
};

type MutableProjectPayload = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  melodyTrack?: MutableMelodyTrackPayload;
  progression: { steps: Array<Record<string, unknown>> };
  temporaryBranch: { steps: Array<Record<string, unknown>> };
  [key: string]: unknown;
};

function createV1Payload(): MutableProjectPayload {
  const payload = JSON.parse(
    encodePortableProject(createRichProjectFixture()),
  ) as MutableProjectPayload;
  payload.schemaVersion = 1;
  delete payload.melodyTrack;
  for (const step of payload.progression.steps) delete step.melody;
  for (const step of payload.temporaryBranch?.steps ?? []) delete step.melody;
  return payload;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("T168 — US12 Project schema v2, migration, and persistence", () => {
  it("creates v2 projects with frozen default Melody Track settings", () => {
    const project = createDefaultProject("melody-defaults", "Melody Defaults");

    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBe(2);
    expect(project.schemaVersion).toBe(2);
    expect(project.melodyTrack).toEqual({
      instrument: "flute",
      muted: false,
      solo: false,
      volume: 100,
    });
    expect(Object.isFrozen(project)).toBe(true);
    expect(Object.isFrozen(project.melodyTrack)).toBe(true);
    expect(createDefaultMelodyTrackSettings()).toEqual(project.melodyTrack);
    expect(Object.isFrozen(createDefaultMelodyTrackSettings())).toBe(true);
  });

  it("validates and snapshots only supported recipe/settings values", () => {
    const recipe = validateChordMelodyRecipe({
      pattern: "inside-out",
      grid: "sixteenth-triplet",
      octaveOffset: -2,
    });
    const settings = validateMelodyTrackSettings({
      instrument: "cello",
      muted: false,
      solo: true,
      volume: 127,
    });

    expect(Object.isFrozen(recipe)).toBe(true);
    expect(Object.isFrozen(settings)).toBe(true);
    expect(() => validateChordMelodyRecipe({ ...recipe, generatedEvents: [] })).toThrow();
    expect(() => validateMelodyTrackSettings({ ...settings, muted: true })).toThrow();
    expect(() => validateMelodyTrackSettings({ ...settings, volume: 127.5 })).toThrow();
  });

  it("migrates v1 to v2 without mutating the root, progression, or steps", () => {
    const v1 = createV1Payload();
    const before = clone(v1);
    const migrated = migrateProjectData(v1);

    expect(v1).toEqual(before);
    expect(migrated).not.toBe(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.melodyTrack).toEqual({
      instrument: "flute",
      muted: false,
      solo: false,
      volume: 100,
    });
    expect(migrated.progression).not.toBe(v1.progression);
    expect(migrated.progression.steps[0]).not.toBe(v1.progression.steps[0]);
    expect(migrated.progression.steps[0]).not.toHaveProperty("melody");
    expect(migrated.temporaryBranch).not.toBe(v1.temporaryBranch);
    expect(migrated.temporaryBranch.steps[0]).not.toBe(v1.temporaryBranch.steps[0]);
  });

  it("preserves v2 semantics through an idempotent migration path and rejects future versions", () => {
    const v2 = JSON.parse(encodePortableProject(createRichProjectFixture())) as Record<
      string,
      unknown
    >;
    const before = clone(v2);
    const migrated = migrateProjectData(v2);

    expect(migrated).toEqual(before);
    expect(migrated).not.toBe(v2);
    expect(v2).toEqual(before);
    expect(() => migrateProjectData({ ...v2, schemaVersion: 3 })).toThrow(
      UnsupportedProjectVersionError,
    );
  });

  it("round-trips recipe/settings deterministically without generated event arrays", () => {
    const original = createRichProjectFixture();
    const first = encodePortableProject(original);
    const second = encodePortableProject(original);
    const raw = JSON.parse(first) as MutableProjectPayload;

    expect(first).toBe(second);
    expect(raw.schemaVersion).toBe(2);
    expect(raw.melodyTrack).toEqual({
      instrument: "violin",
      muted: false,
      solo: false,
      volume: 96,
    });
    expect(raw.progression.steps[0].melody).toEqual({
      pattern: "outside-in",
      grid: "eighth-triplet",
      octaveOffset: 1,
    });
    expect(raw.progression.steps[0].melody).not.toHaveProperty("events");
    expect(raw.progression.steps[0].melody).not.toHaveProperty("generatedNotes");

    const restored = decodePortableProject(first);
    expect(restored.melodyTrack).toEqual(original.melodyTrack);
    expect(restored.progression.steps[0]).toHaveProperty("melody");
    expect(restored.progression.steps[0]).toEqual(original.progression.steps[0]);
    expect(Object.isFrozen(restored.melodyTrack)).toBe(true);
    expect(Object.isFrozen(restored.progression.steps[0]!.melody)).toBe(true);
  });

  it("preserves recipe data in an active Temporary Branch", () => {
    const raw = JSON.parse(
      encodePortableProject(createRichProjectFixture()),
    ) as MutableProjectPayload;
    raw.temporaryBranch.steps[0].melody = {
      pattern: "up",
      grid: "quarter",
      octaveOffset: 0,
    };

    const restored = decodePortableProject(JSON.stringify(raw));
    const branchStep = restored.temporaryBranch?.steps[0];
    expect(branchStep).toHaveProperty("melody");
    expect((branchStep as { melody?: unknown }).melody).toEqual(
      raw.temporaryBranch.steps[0].melody,
    );
  });

  it.each([
    ["missing melodyTrack", (raw: MutableProjectPayload) => delete raw.melodyTrack],
    ["invalid instrument", (raw: MutableProjectPayload) => (raw.melodyTrack!.instrument = "piano")],
    ["invalid volume", (raw: MutableProjectPayload) => (raw.melodyTrack!.volume = 128)],
    [
      "mute and solo together",
      (raw: MutableProjectPayload) => {
        raw.melodyTrack!.muted = true;
        raw.melodyTrack!.solo = true;
      },
    ],
    [
      "invalid recipe pattern",
      (raw: MutableProjectPayload) =>
        ((raw.progression.steps[0]!.melody as Record<string, unknown>).pattern = "random"),
    ],
    [
      "invalid recipe octave",
      (raw: MutableProjectPayload) =>
        ((raw.progression.steps[0]!.melody as Record<string, unknown>).octaveOffset = 3),
    ],
    [
      "recipe on RestStep",
      (raw: MutableProjectPayload) =>
        (raw.progression.steps[2].melody = {
          pattern: "up",
          grid: "quarter",
          octaveOffset: 0,
        }),
    ],
    [
      "recipe on a Temporary Branch RestStep",
      (raw: MutableProjectPayload) =>
        raw.temporaryBranch.steps.push({
          id: "branch-rest-with-melody",
          kind: "rest",
          duration: { beats: { numerator: 1, denominator: 1 } },
          melody: { pattern: "up", grid: "quarter", octaveOffset: 0 },
        }),
    ],
    [
      "invalid recipe in a Temporary Branch ChordStep",
      (raw: MutableProjectPayload) =>
        (raw.temporaryBranch.steps[0].melody = {
          pattern: "random",
          grid: "quarter",
          octaveOffset: 0,
        }),
    ],
  ])("rejects %s at the portable schema boundary", (_name, mutate) => {
    const raw = JSON.parse(
      encodePortableProject(createRichProjectFixture()),
    ) as MutableProjectPayload;
    mutate(raw);
    expect(() => decodePortableProject(JSON.stringify(raw))).toThrow(InvalidPortableProjectError);
  });

  it("recovers a v1 autosave as v2 and saves back to one record", async () => {
    const db = createCadenceFlowDb("MelodyV1RecoveryDB");
    const repo = createProjectRepository(db);
    const autosave = createAutosaveEngine({ db, repo });
    const v1 = createV1Payload();
    await db.projects.put({
      id: v1.id,
      name: v1.name,
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt,
      schemaVersion: 1,
      revision: 4,
      payload: JSON.stringify(v1),
    });
    await repo.setLastActiveProjectId(v1.id);

    const recovered = await autosave.loadAutosavedProject();
    expect(recovered?.schemaVersion).toBe(2);
    expect(recovered?.melodyTrack).toEqual(createDefaultMelodyTrackSettings());
    expect(recovered?.progression.steps[0]).not.toHaveProperty("melody");

    if (recovered) await repo.saveProject(recovered);
    expect(await db.projects.count()).toBe(1);
    const stored = await db.projects.get(v1.id);
    expect(stored?.schemaVersion).toBe(2);
    expect(JSON.parse(stored!.payload).schemaVersion).toBe(2);

    autosave.dispose();
    await db.delete();
  });
});
