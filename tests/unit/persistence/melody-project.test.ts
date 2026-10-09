import { requireRecord, requireArray } from "../../fixtures/assertions";
import { requireChord } from "../../fixtures/assertions";
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createDefaultMelodyTrackSettings,
  validateChordMelodyRecipe,
  validateMelodyTrackSettings,
} from "../../../src/domain/melody/types";
import { createDefaultHarmonyTrackSettings } from "../../../src/domain/harmony/track";
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
  harmonyTrack?: Record<string, unknown>;
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
  delete payload.harmonyTrack;
  for (const step of payload.progression.steps) delete step.melody;
  for (const step of payload.temporaryBranch?.steps ?? []) delete step.melody;
  return payload;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("T188 — US12 Project schema v6, migration, and persistence", () => {
  it("creates current-schema projects with frozen default Harmony and Melody Track settings", () => {
    const project = createDefaultProject("melody-defaults", "Melody Defaults");

    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBe(11);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(project.harmonyTrack).toEqual(createDefaultHarmonyTrackSettings());
    expect(project.melodyTrack).toEqual({
      instrument: "flute",
      muted: false,
      solo: false,
      volume: 100,
    });
    expect(Object.isFrozen(project)).toBe(true);
    expect(Object.isFrozen(project.melodyTrack)).toBe(true);
    expect(Object.isFrozen(project.harmonyTrack)).toBe(true);
    expect(createDefaultMelodyTrackSettings()).toEqual(project.melodyTrack);
    expect(Object.isFrozen(createDefaultMelodyTrackSettings())).toBe(true);
  });

  it("validates and snapshots only supported recipe/settings values", () => {
    const recipe = validateChordMelodyRecipe({
      pitchMotion: "inside-out",
      grid: "sixteenth-triplet",
      octaveOffset: -2,
      rhythm: "even",
      connection: "retrigger",
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

  it("migrates v1 through v8 without mutating the root, progression, or steps", () => {
    const v1 = createV1Payload();
    const before = clone(v1);
    const migrated = migrateProjectData(v1);

    expect(v1).toEqual(before);
    expect(migrated).not.toBe(v1);
    expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(migrated.harmonyTrack).toEqual(createDefaultHarmonyTrackSettings());
    expect(migrated.melodyTrack).toEqual({
      instrument: "flute",
      muted: false,
      solo: false,
      volume: 100,
    });
    expect(migrated.progression).not.toBe(v1.progression);
    expect(requireArray(requireRecord(migrated.progression).steps)[0]).not.toBe(
      v1.progression.steps[0],
    );
    expect(requireArray(requireRecord(migrated.progression).steps)[0]).not.toHaveProperty("melody");
    expect(migrated.temporaryBranch).not.toBe(v1.temporaryBranch);
    expect(requireArray(requireRecord(migrated.temporaryBranch).steps)[0]).not.toBe(
      v1.temporaryBranch.steps[0],
    );
  });

  it("migrates v3 legacy recipes in both step collections and rejects future versions", () => {
    const v3 = JSON.parse(encodePortableProject(createRichProjectFixture())) as Record<
      string,
      unknown
    >;
    v3.schemaVersion = 3;
    const progression = v3.progression as { steps: Array<Record<string, unknown>> };
    progression.steps[0]!.melody = {
      pitchMotion: "outside-in",
      grid: "eighth-triplet",
      octaveOffset: 1,
      rhythm: "even",
      connection: "retrigger",
    };
    const temporaryBranch = v3.temporaryBranch as { steps: Array<Record<string, unknown>> };
    temporaryBranch.steps[0]!.melody = {
      pitchMotion: "down",
      grid: "quarter",
      octaveOffset: 0,
      rhythm: "even",
      connection: "retrigger",
    };
    const before = clone(v3);
    const migrated = migrateProjectData(v3);

    expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(migrated).not.toBe(v3);
    expect(v3).toEqual(before);
    expect(
      (migrated.progression as { steps: Array<Record<string, unknown>> }).steps[0]!.melody,
    ).toEqual({
      mode: "generated" as const,
      recipe: {
        pitchMotion: "outside-in",
        rhythm: "even",
        connection: "retrigger",
        grid: "eighth-triplet",
        octaveOffset: 1,
      },
    });
    expect(
      (migrated.temporaryBranch as { steps: Array<Record<string, unknown>> }).steps[0]!.melody,
    ).toEqual({
      mode: "generated" as const,
      recipe: {
        pitchMotion: "down",
        rhythm: "even",
        connection: "retrigger",
        grid: "quarter",
        octaveOffset: 0,
      },
    });
    expect(() =>
      migrateProjectData({ ...v3, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION + 1 }),
    ).toThrow(UnsupportedProjectVersionError);
  });

  it("salvages a mixed legacy and canonical recipe during v3 migration instead of failing the file", () => {
    const v3 = JSON.parse(encodePortableProject(createRichProjectFixture())) as Record<
      string,
      unknown
    >;
    v3.schemaVersion = 3;
    const progression = v3.progression as { steps: Array<Record<string, unknown>> };
    progression.steps[0]!.melody = {
      // A genuine mix: `pattern` is the legacy key set and `pitchMotion` the canonical one, so the
      // object matches neither and its recipe cannot be read. (The fixture previously repeated
      // `pitchMotion` twice, which is not a valid object literal and simply read as canonical.)
      pattern: "up",
      pitchMotion: "up",
      rhythm: "even",
      connection: "retrigger",
      grid: "eighth",
      octaveOffset: 0,
    };
    const stepCountBefore = progression.steps.length;

    // Migrations salvage: an unreadable field is dropped and reported, rather than making the whole
    // legacy project unopenable. This used to be asserted as a throw.
    const migrated = migrateProjectData(v3, true);

    expect(migrated.project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(migrated.diagnostics).toHaveLength(1);
    expect(migrated.diagnostics[0]?.field).toBe("melody");
    expect(migrated.diagnostics[0]?.path).toContain("progression.steps[0]");

    const steps = (migrated.project.progression as { steps: Array<Record<string, unknown>> }).steps;
    expect(steps).toHaveLength(stepCountBefore);
    expect(steps[0]?.["melody"]).toBeUndefined();
  });

  it("round-trips generated recipe/settings deterministically without generated event arrays", () => {
    const original = createRichProjectFixture();
    const first = encodePortableProject(original);
    const second = encodePortableProject(original);
    const raw = JSON.parse(first) as MutableProjectPayload;

    expect(first).toBe(second);
    expect(raw.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(raw.harmonyTrack).toEqual({
      instrument: "piano",
      muted: false,
      solo: false,
      volume: 100,
      pianoEngine: "hq-samples",
      guitarEngine: "hq-samples",
      pianoSoundfontInstrument: "gm-000",
      guitarSoundfontInstrument: "gm-025",
    });
    expect(raw.melodyTrack).toEqual({
      instrument: "violin",
      muted: false,
      solo: false,
      volume: 96,
    });
    expect(raw.progression.steps[0]!.melody).toEqual({
      mode: "generated" as const,
      recipe: {
        pitchMotion: "outside-in",
        rhythm: "even",
        connection: "retrigger",
        grid: "eighth-triplet",
        octaveOffset: 1,
      },
    });
    expect(raw.progression.steps[0]!.melody).not.toHaveProperty("events");
    expect(raw.progression.steps[0]!.melody).not.toHaveProperty("generatedNotes");

    const restored = decodePortableProject(first);
    expect(restored.melodyTrack).toEqual(original.melodyTrack);
    expect(restored.progression.steps[0]).toHaveProperty("melody");
    expect(restored.progression.steps[0]).toEqual(original.progression.steps[0]);
    expect(Object.isFrozen(restored.melodyTrack)).toBe(true);
    expect(Object.isFrozen(requireChord(restored.progression.steps[0]!).melody)).toBe(true);
  });

  it("decodes legacy recipes to independent axes and saves them in the new shape", () => {
    const raw = JSON.parse(
      encodePortableProject(createRichProjectFixture()),
    ) as MutableProjectPayload;
    raw.schemaVersion = 3;
    raw.progression.steps[0]!.melody = {
      pitchMotion: "outside-in",
      grid: "eighth-triplet",
      octaveOffset: 1,
      rhythm: "even",
      connection: "retrigger",
    };

    const restored = decodePortableProject(JSON.stringify(raw));
    expect(requireChord(restored.progression.steps[0])?.melody).toEqual({
      mode: "generated" as const,
      recipe: {
        pitchMotion: "outside-in",
        rhythm: "even",
        connection: "retrigger",
        grid: "eighth-triplet",
        octaveOffset: 1,
      },
    });

    const saved = JSON.parse(encodePortableProject(restored)) as MutableProjectPayload;
    expect(saved.progression.steps[0]?.melody).toEqual(
      requireChord(restored.progression.steps[0])?.melody,
    );
  });

  it("rejects a legacy untagged recipe in the v7-to-v10 compatibility path", () => {
    const raw = JSON.parse(
      encodePortableProject(createRichProjectFixture()),
    ) as MutableProjectPayload;
    raw.schemaVersion = 7;
    raw.progression.steps[0]!.melody = {
      pitchMotion: "outside-in",
      grid: "eighth",
      octaveOffset: 0,
      rhythm: "even",
      connection: "retrigger",
    };

    expect(() => decodePortableProject(JSON.stringify(raw))).toThrow(InvalidPortableProjectError);
  });

  it("preserves recipe data in an active Temporary Branch", () => {
    const raw = JSON.parse(
      encodePortableProject(createRichProjectFixture()),
    ) as MutableProjectPayload;
    raw.schemaVersion = 6;
    raw.temporaryBranch.steps[0]!.melody = {
      pitchMotion: "up",
      rhythm: "even",
      connection: "retrigger",
      grid: "quarter",
      octaveOffset: 0,
    };

    const restored = decodePortableProject(JSON.stringify(raw));
    const branchStep = restored.temporaryBranch?.steps[0];
    expect(branchStep).toHaveProperty("melody");
    expect((branchStep as { melody?: unknown }).melody).toEqual({
      mode: "generated" as const,
      recipe: raw.temporaryBranch.steps[0]!.melody,
    });
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
        Reflect.set(requireRecord(raw.progression.steps[0]!.melody), "pattern", "random"),
    ],
    [
      "invalid recipe octave",
      (raw: MutableProjectPayload) =>
        Reflect.set(requireRecord(raw.progression.steps[0]!.melody), "octaveOffset", 3),
    ],
    [
      "recipe on RestStep",
      (raw: MutableProjectPayload) =>
        (raw.progression.steps[2]!.melody = {
          pitchMotion: "up",
          grid: "quarter",
          octaveOffset: 0,
          rhythm: "even",
          connection: "retrigger",
        }),
    ],
    [
      "recipe on a Temporary Branch RestStep",
      (raw: MutableProjectPayload) =>
        raw.temporaryBranch.steps.push({
          id: "branch-rest-with-melody",
          kind: "rest",
          duration: { beats: { numerator: 1, denominator: 1 } },
          melody: {
            pitchMotion: "up",
            grid: "quarter",
            octaveOffset: 0,
            rhythm: "even",
            connection: "retrigger",
          },
        }),
    ],
    [
      "invalid recipe in a Temporary Branch ChordStep",
      (raw: MutableProjectPayload) =>
        (raw.temporaryBranch.steps[0]!.melody = {
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

  it("recovers a v1 autosave as v5 and saves back to one record", async () => {
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
    expect(recovered?.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(recovered?.harmonyTrack).toEqual(createDefaultHarmonyTrackSettings());
    expect(recovered?.melodyTrack).toEqual(createDefaultMelodyTrackSettings());
    expect(recovered?.progression.steps[0]).not.toHaveProperty("melody");

    if (recovered) await repo.saveProject(recovered);
    expect(await db.projects.count()).toBe(1);
    const stored = await db.projects.get(v1.id);
    expect(stored?.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(JSON.parse(stored!.payload).schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);

    autosave.dispose();
    await db.delete();
  });
});
