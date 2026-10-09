import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../../src/domain/project/migrations";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import { createAutosaveEngine } from "../../../src/persistence/autosave";
import { createProjectRepository } from "../../../src/persistence/projectRepository";
import { createCadenceFlowDb } from "../../../src/persistence/db";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import type { ChordStep } from "../../../src/domain/progression/step";

describe("T197 + T192 — schema v6 cutover", () => {
  it("migrates v5 through v6 engine/tone changes to v7 defaults", () => {
    const raw = JSON.parse(encodePortableProject(createDefaultProject("v5-cutover"))) as {
      schemaVersion: number;
      harmonyTrack: Record<string, unknown>;
      presentation: Record<string, unknown>;
    };
    raw.schemaVersion = 5;
    delete raw.harmonyTrack.pianoEngine;
    delete raw.harmonyTrack.guitarEngine;
    delete raw.harmonyTrack.pianoSoundfontInstrument;
    delete raw.harmonyTrack.guitarSoundfontInstrument;
    delete raw.presentation.noteColorMode;
    raw.presentation.suzukiColors = true;

    const migrated = decodePortableProject(JSON.stringify(raw));

    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBe(11);
    expect(migrated.schemaVersion).toBe(11);
    expect(migrated.harmonyTrack).toMatchObject({
      pianoEngine: "hq-samples",
      guitarEngine: "hq-samples",
      pianoSoundfontInstrument: "gm-000",
      guitarSoundfontInstrument: "gm-025",
    });
    expect(migrated.presentation.noteColorMode).toBe("suzuki");
    expect(migrated.presentation).not.toHaveProperty("suzukiColors");
  });

  it("defaults v5 without the legacy Suzuki flag to standard note colors", () => {
    const raw = JSON.parse(encodePortableProject(createDefaultProject("v5-standard"))) as {
      schemaVersion: number;
      presentation: Record<string, unknown>;
    };
    raw.schemaVersion = 5;
    delete raw.presentation.noteColorMode;

    expect(decodePortableProject(JSON.stringify(raw)).presentation.noteColorMode).toBe("standard");
  });

  it("rejects an invalid noteColorMode in the current document", () => {
    const raw = JSON.parse(encodePortableProject(createDefaultProject("v6-invalid-mode"))) as {
      presentation: Record<string, unknown>;
    };
    raw.presentation.noteColorMode = "rainbow";

    expect(() => decodePortableProject(JSON.stringify(raw))).toThrow(/Schema validation failed/);
  });

  it("round-trips all engine, SoundFont tone, and note color settings through portable export", () => {
    const original = createDefaultProject("v6-round-trip");
    const configured = Object.freeze({
      ...original,
      harmonyTrack: Object.freeze({
        ...original.harmonyTrack,
        pianoEngine: "soundfont" as const,
        guitarEngine: "soundfont" as const,
        pianoSoundfontInstrument: "gm-004" as const,
        guitarSoundfontInstrument: "gm-026" as const,
      }),
      presentation: Object.freeze({
        ...original.presentation,
        noteColorMode: "harmonic-role" as const,
      }),
    });

    const restored = decodePortableProject(encodePortableProject(configured));

    expect(restored.schemaVersion).toBe(11);
    expect(restored.harmonyTrack).toEqual(configured.harmonyTrack);
    expect(restored.presentation.noteColorMode).toBe("harmonic-role");
  });

  it("round-trips an authored next-chord target in the melody recipe", () => {
    const project = createRichProjectFixture();
    const step = project.progression.steps[0] as ChordStep;
    const targetedStep = Object.freeze({
      ...step,
      melody: Object.freeze({
        mode: "generated" as const,
        recipe: Object.freeze({
          pitchMotion: "up",
          rhythm: "even",
          connection: "retrigger",
          grid: "quarter",
          octaveOffset: 0,
          targetNextPitchClass: 2,
        }),
      }),
    });
    const targetedProject = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([targetedStep, ...project.progression.steps.slice(1)]),
      }),
    });

    const encoded = encodePortableProject(targetedProject);
    expect(JSON.parse(encoded).progression.steps[0]!.melody).toMatchObject({
      mode: "generated" as const,
      recipe: { targetNextPitchClass: 2 },
    });
    expect(decodePortableProject(encoded).progression.steps[0]).toHaveProperty(
      "melody.recipe.targetNextPitchClass",
      2,
    );
  });

  it("autosaves and recovers v6 engine, tone, and note color settings in IndexedDB", async () => {
    const dbName = `SchemaV6Recovery-${crypto.randomUUID()}`;
    const db = createCadenceFlowDb(dbName);
    const repo = createProjectRepository(db);
    const autosave = createAutosaveEngine({ repo, debounceMs: 0 });
    const base = createDefaultProject("v6-indexeddb");
    const configured = Object.freeze({
      ...base,
      harmonyTrack: Object.freeze({
        ...base.harmonyTrack,
        pianoEngine: "soundfont" as const,
        guitarEngine: "soundfont" as const,
        pianoSoundfontInstrument: "gm-005" as const,
        guitarSoundfontInstrument: "gm-024" as const,
      }),
      presentation: Object.freeze({ ...base.presentation, noteColorMode: "suzuki" as const }),
    });

    try {
      autosave.scheduleAutosave(configured);
      await autosave.flush();
      const recovered = await autosave.loadAutosavedProject();
      expect(recovered?.harmonyTrack).toEqual(configured.harmonyTrack);
      expect(recovered?.presentation.noteColorMode).toBe("suzuki");
    } finally {
      autosave.dispose();
      db.close();
      await db.delete();
    }
  });
});
