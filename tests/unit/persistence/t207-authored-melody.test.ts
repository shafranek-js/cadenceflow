import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  applyMelodyCommand,
  createSetAuthoredMelodyCommand,
} from "../../../src/app/commands/melodyCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { resolveEffectiveMelodyPhrase } from "../../../src/domain/melody/projection";
import { snapshotChordMelody } from "../../../src/domain/melody/types";
import { migrateProjectData } from "../../../src/domain/project/migrations";
import { rational } from "../../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

const note = {
  id: "n-stable-1",
  pitch: exactPitch(64, { step: "E", alter: 0 }),
  onset: rational(1, 3),
  duration: rational(2, 3),
};

describe("T207 authored ChordMelody", () => {
  it("snapshots stable IDs and exact rational note values immutably", () => {
    const melody = snapshotChordMelody({ mode: "authored" as const, phrase: { notes: [note] } });
    expect(melody.mode).toBe("authored");
    if (melody.mode !== "authored") throw new Error("expected authored melody");
    expect(melody.phrase.notes[0]).toMatchObject({
      id: "n-stable-1",
      onset: { numerator: 1, denominator: 3 },
      duration: { numerator: 2, denominator: 3 },
    });
    expect(Object.isFrozen(melody.phrase.notes[0])).toBe(true);
    expect(() =>
      snapshotChordMelody({ mode: "authored" as const, phrase: { notes: [note, note] } }),
    ).toThrow();
    expect(() =>
      snapshotChordMelody({
        mode: "authored" as const,
        phrase: { notes: [{ ...note, duration: rational(0) }] },
      }),
    ).toThrow();
  });

  it("accepts an authored note at the beginning of the phrase", () => {
    const atStart = { ...note, onset: rational(0) };
    const melody = snapshotChordMelody({ mode: "authored" as const, phrase: { notes: [atStart] } });
    expect(melody.mode === "authored" ? melody.phrase.notes[0]?.onset : undefined).toEqual(
      rational(0),
    );
  });

  it("resolves authored events with stable event keys", () => {
    const melody = snapshotChordMelody({ mode: "authored" as const, phrase: { notes: [note] } });
    const phrase = resolveEffectiveMelodyPhrase({
      sourceStepId: "step-a",
      melody,
      upperPitches: [note.pitch],
      durationBeats: rational(4),
      recipe: {
        pitchMotion: "up",
        rhythm: "even",
        connection: "retrigger",
        grid: "quarter",
        octaveOffset: 0,
      },
    });
    expect(phrase.events[0]).toMatchObject({
      sourceStepId: "step-a",
      eventKey: "n-stable-1",
      pitch: note.pitch,
      startOffsetBeats: note.onset,
      durationBeats: note.duration,
    });
  });

  it("migrates v6 generated recipes without materializing generated notes", () => {
    const recipe = {
      pitchMotion: "up",
      rhythm: "even",
      connection: "retrigger",
      grid: "quarter",
      octaveOffset: 0,
    };
    const result = migrateProjectData({
      schemaVersion: 6,
      progression: { steps: [{ id: "s1", kind: "chord", melody: recipe }] },
    });
    expect(result.schemaVersion).toBe(11);
    expect((result.progression as { steps: Array<{ melody: unknown }> }).steps[0]?.melody).toEqual({
      mode: "generated" as const,
      recipe,
    });
  });

  it("round-trips authored identity and rational values through portable v8", () => {
    const base = createDefaultProject("t207-roundtrip", "T207");
    const step = createMatrixChordStep(base, "I", "step-authored");
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({
        ...base.progression,
        steps: Object.freeze([
          {
            ...step,
            melody: snapshotChordMelody({ mode: "authored" as const, phrase: { notes: [note] } }),
          },
        ]),
      }),
    });
    const decoded = decodePortableProject(encodePortableProject(project));
    const chord = decoded.progression.steps[0];
    expect(decoded.schemaVersion).toBe(11);
    expect(
      chord?.kind === "chord" && chord.melody?.mode === "authored"
        ? chord.melody.phrase.notes[0]
        : undefined,
    ).toEqual(note);
  });

  it("applies the authored phrase as one reversible command", () => {
    const base = createDefaultProject("t207-command", "T207");
    const step = createMatrixChordStep(base, "I", "step-command");
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ ...base.progression, steps: Object.freeze([step]) }),
    });
    const applied = applyMelodyCommand(
      project,
      createSetAuthoredMelodyCommand(step.id, { notes: [note] }, "2026-09-30T00:00:00.000Z"),
    );
    const inverse = applyMelodyCommand(
      applied.project,
      applied.inverse as Parameters<typeof applyMelodyCommand>[1],
    );
    expect(
      applied.project.progression.steps[0]?.kind === "chord" &&
        applied.project.progression.steps[0]!.melody?.mode,
    ).toBe("authored");
    expect(
      inverse.project.progression.steps[0]?.kind === "chord" &&
        inverse.project.progression.steps[0]!.melody,
    ).toBeUndefined();
  });
});
