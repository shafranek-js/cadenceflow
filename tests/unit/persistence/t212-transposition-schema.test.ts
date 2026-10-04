import { describe, expect, it } from "vitest";
import { migrateProjectData } from "../../../src/domain/project/migrations";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { snapshotAuthoredMelodyPhrase } from "../../../src/domain/melody/types";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

const now = "2026-10-03T10:00:00.000Z";

describe("T212 schema v10", () => {
  it("migrates saved and branch Steps from identity behavior without mutating v9 data", () => {
    const v9 = {
      schemaVersion: 9,
      progression: { steps: [{ id: "saved", kind: "chord" }] },
      temporaryBranch: { steps: [{ id: "branch", kind: "rest" }] },
    };

    const migrated = migrateProjectData(v9);

    expect(v9).toMatchObject({ schemaVersion: 9 });
    expect(migrated).toMatchObject({
      schemaVersion: 10,
      progression: { steps: [{ id: "saved", transpositionSemitones: 0 }] },
      temporaryBranch: { steps: [{ id: "branch", transpositionSemitones: 0 }] },
    });
    expect(migrated.progression).not.toBe(v9.progression);
  });

  it("round-trips Step offsets, boundary compensation, and materialized source pitch", () => {
    const base = createDefaultProject("portable-t212", "Portable T212", now);
    const chord = createMatrixChordStep(base, "I", "chord");
    const transposed = Object.freeze({
      ...chord,
      transpositionSemitones: 12,
      melody: Object.freeze({
        mode: "authored" as const,
        phrase: snapshotAuthoredMelodyPhrase({
          notes: [
            {
              id: "materialized-boundary",
              pitch: Object.freeze({
                ...exactPitch(0, { step: "C", alter: 0 }),
                transpositionCompensationSemitones: -12,
              }),
              sourcePitchMidi: 64,
              onset: rational(0),
              duration: rational(1),
            },
          ],
        }),
      }),
    });
    const rest = Object.freeze({
      id: "rest",
      kind: "rest" as const,
      transpositionSemitones: -3,
      duration: musicalDuration(rational(4), { kind: "bars", bars: 1 }),
    });
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ steps: Object.freeze([transposed, rest]) }),
    });

    const restored = decodePortableProject(encodePortableProject(project));
    const savedChord = restored.progression.steps[0];
    const savedNote =
      savedChord?.kind === "chord" && savedChord.melody?.mode === "authored"
        ? savedChord.melody.phrase.notes[0]
        : undefined;
    expect(savedChord?.transpositionSemitones).toBe(12);
    expect(savedNote).toMatchObject({
      pitch: { midiNumber: 0, transpositionCompensationSemitones: -12 },
      sourcePitchMidi: 64,
    });
    expect(restored.progression.steps[1]?.transpositionSemitones).toBe(-3);
  });
});
