import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { RestStep } from "../../../src/domain/progression/step";
import { createMelodyTimeline } from "../../../src/notation/melodyStaffProjection";
import {
  applyAuthoredMelodyTransaction,
  restoreAuthoredMelodyTransaction,
  type AuthoredMelodyTransactionCommand,
} from "../../../src/app/commands/authoredMelodyTransaction";
import { AppStore } from "../../../src/app/appStore";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { realizeProgressionMelodyPerformance } from "../../../src/audio/melodyPerformance";
import { projectProjectToMidi } from "../../../src/export/midi/eventProjection";
import { projectProjectToMusicXml } from "../../../src/export/musicxml/projection";
import {
  duplicateSteps,
  removeStep,
  reorderSteps,
} from "../../../src/app/commands/progressionCommands";
import { snapshotChordMelody } from "../../../src/domain/melody/types";

const pitch = exactPitch(64, { step: "E", alter: 0 });
const rest = (id: string, duration = rational(1)): RestStep =>
  Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(duration),
  });
const withSteps = (steps: readonly RestStep[]) => {
  const project = createDefaultProject("batch1-model");
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps }),
  });
};

describe("Piano Roll batch 1 canonical Melody contract", () => {
  it("edits a generated note directly and restores generated ownership on undo", () => {
    const project = createRichProjectFixture();
    const step = project.progression.steps.find(
      (candidate) => candidate.kind === "chord" && candidate.melody?.mode === "generated",
    );
    if (!step || step.kind !== "chord" || step.melody?.mode !== "generated")
      throw new Error("Expected a generated Melody step");
    const before = createEffectiveMelodyTimeline(project).filter((note) => note.sourceStepId === step.id);
    const target = before[0]!;
    const store = new AppStore(project);
    store.dispatch(
      {
        type: "melody/apply-authored-transaction",
        payload: {
          nowIso: "direct-edit",
          edits: [{
            type: "upsert",
            sourceStepId: step.id,
            note: {
              id: target.eventKey,
              pitch: target.pitch,
              startBeats: target.startBeats,
              durationBeats: rational(1, 3),
            },
          }],
        },
      },
      applyAuthoredMelodyTransaction,
    );
    const materialized = store.project.progression.steps.find((candidate) => candidate.id === step.id);
    expect(materialized).toMatchObject({ melody: { mode: "authored", sourceRecipe: step.melody.recipe } });
    const after = createEffectiveMelodyTimeline(store.project).filter((note) => note.sourceStepId === step.id);
    expect(after).toHaveLength(before.length);
    expect(after.find((note) => note.eventKey === target.eventKey)?.durationBeats).toEqual(rational(1, 3));
    expect(after.filter((note) => note.eventKey !== target.eventKey).map((note) => [note.pitch, note.startBeats, note.durationBeats]))
      .toEqual(before.filter((note) => note.eventKey !== target.eventKey).map((note) => [note.pitch, note.startBeats, note.durationBeats]));
    expect(store.undo()).toBe(true);
    expect(store.project.progression.steps.find((candidate) => candidate.id === step.id)).toEqual(step);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps.find((candidate) => candidate.id === step.id)).toEqual(materialized);
  });

  it("preserves the full generated destination when inserting a note there", () => {
    const project = createRichProjectFixture();
    const step = project.progression.steps.find(
      (candidate) => candidate.kind === "chord" && candidate.melody?.mode === "generated",
    );
    if (!step || step.kind !== "chord" || step.melody?.mode !== "generated")
      throw new Error("Expected a generated Melody step");
    const before = createEffectiveMelodyTimeline(project).filter((note) => note.sourceStepId === step.id);
    const inserted = applyAuthoredMelodyTransaction(project, {
      type: "melody/apply-authored-transaction",
      payload: {
        nowIso: "direct-insert",
        edits: [{ type: "upsert", note: {
          id: "inserted-generated-destination",
          pitch,
          startBeats: before[0]!.startBeats,
          durationBeats: rational(1, 4),
        } }],
      },
    });
    const after = createEffectiveMelodyTimeline(inserted.project).filter((note) => note.sourceStepId === step.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((note) => note.eventKey !== "inserted-generated-destination").map((note) => [note.eventKey, note.pitch, note.startBeats, note.durationBeats]))
      .toEqual(before.map((note) => [note.eventKey, note.pitch, note.startBeats, note.durationBeats]));
    const undone = restoreAuthoredMelodyTransaction(inserted.project, inserted.inverse!);
    expect(undone.project.progression.steps).toEqual(project.progression.steps);
  });
  it("converts generated effective notes to authored in one undoable transaction", () => {
    const project = createRichProjectFixture();
    const step = project.progression.steps.find(
      (candidate) => candidate.kind === "chord" && candidate.melody?.mode === "generated",
    );
    expect(step?.kind).toBe("chord");
    if (!step || step.kind !== "chord") return;
    const before = createEffectiveMelodyTimeline(project).filter(
      (note) => note.sourceStepId === step.id,
    );
    expect(before.length).toBeGreaterThan(0);
    const store = new AppStore(project);
    store.dispatch(
      {
        type: "melody/apply-authored-transaction",
        payload: { edits: [], convertStepIds: [step.id], nowIso: "converted" },
      },
      applyAuthoredMelodyTransaction,
    );
    const after = createEffectiveMelodyTimeline(store.project).filter(
      (note) => note.sourceStepId === step.id,
    );
    expect(
      after.map(({ pitch, startBeats, durationBeats }) => ({ pitch, startBeats, durationBeats })),
    ).toEqual(
      before.map(({ pitch, startBeats, durationBeats }) => ({ pitch, startBeats, durationBeats })),
    );
    expect(
      store.project.progression.steps.find((candidate) => candidate.id === step.id),
    ).toMatchObject({ melody: { mode: "authored" } });
    expect(store.undo()).toBe(true);
    expect(
      store.project.progression.steps.find((candidate) => candidate.id === step.id),
    ).toMatchObject({ melody: { mode: "generated" } });
    expect(store.redo()).toBe(true);
  });
  it("projects authored Melody on Rest and clips the tail only in the effective timeline", () => {
    const storedDuration = rational(3, 2);
    const project = withSteps([
      Object.freeze({
        ...rest("rest-a"),
        authoredMelody: Object.freeze({
          notes: Object.freeze([
            { id: "rest-note", pitch, onset: rational(1, 4), duration: storedDuration },
          ]),
        }),
        melodyInstrumentOverride: "cello" as const,
      }),
    ]);
    const [note] = createEffectiveMelodyTimeline(project);
    expect(note).toMatchObject({
      sourceStepId: "rest-a",
      eventKey: "rest-note",
      startBeats: rational(1, 4),
      durationBeats: rational(3, 4),
      instrument: "cello",
    });
    expect(
      project.progression.steps[0]?.kind === "rest" &&
        project.progression.steps[0].authoredMelody?.notes[0]?.duration,
    ).toEqual(storedDuration);
    expect(createMelodyTimeline(project).events).toHaveLength(1);
    const performance = realizeProgressionMelodyPerformance({
      steps: project.progression.steps,
      tonic: project.tonic,
      context: {
        tonic: project.tonic,
        moduleId: project.activeModule,
        mode: "major",
        spellingContext: { tonic: project.tonic, mode: "major" },
      },
      tempoBpm: 120,
      melodyTrack: project.melodyTrack,
    });
    expect(performance.events).toHaveLength(1);
    expect(performance.events[0]?.durationBeats).toEqual(rational(3, 4));
    const midi = projectProjectToMidi(project);
    expect(midi.melodyTracks?.flatMap((track) => track.notes)).toHaveLength(1);
    const musicXml = projectProjectToMusicXml(project);
    expect(JSON.stringify(musicXml)).toContain("rest-note");
  });

  it("moves ownership at an exact Step boundary, preserves pitch/time and resolves destination ID collision atomically", () => {
    const source: RestStep = Object.freeze({
      ...rest("source"),
      authoredMelody: Object.freeze({
        notes: Object.freeze([
          { id: "same-id", pitch, onset: rational(0), duration: rational(1, 4) },
        ]),
      }),
    });
    const target: RestStep = Object.freeze({
      ...rest("target"),
      authoredMelody: Object.freeze({
        notes: Object.freeze([
          { id: "same-id", pitch, onset: rational(1, 2), duration: rational(1, 4) },
        ]),
      }),
    });
    const project = withSteps([source, target]);
    const command: AuthoredMelodyTransactionCommand = {
      type: "melody/apply-authored-transaction",
      payload: {
        expectedUpdatedAt: project.updatedAt,
        nowIso: "2026-09-30T00:00:00.000Z",
        edits: [
          {
            type: "upsert",
            sourceStepId: "source",
            note: { id: "same-id", pitch, startBeats: rational(1), durationBeats: rational(1, 4) },
          },
          {
            type: "upsert",
            note: {
              id: "polyphony",
              pitch,
              startBeats: rational(1),
              durationBeats: rational(1, 4),
            },
          },
        ],
      },
    };
    const store = new AppStore(project);
    store.dispatch(command, applyAuthoredMelodyTransaction);
    const committed = store.project;
    expect(store.canUndo).toBe(true);
    const moved = committed.progression.steps[1];
    expect(moved?.kind).toBe("rest");
    if (moved?.kind !== "rest") throw new Error("expected Rest owner");
    expect(moved.authoredMelody?.notes).toHaveLength(3);
    expect(moved.authoredMelody?.notes[1]).toMatchObject({
      pitch,
      onset: rational(0),
      duration: rational(1, 4),
    });
    expect(moved.authoredMelody?.notes[1]?.id).not.toBe("same-id");
    expect(moved.authoredMelody?.notes[2]).toMatchObject({
      pitch,
      onset: rational(0),
      duration: rational(1, 4),
    });
    expect(store.undo()).toBe(true);
    expect(store.project).toEqual(project);
    expect(store.redo()).toBe(true);
    expect(store.project).toEqual(committed);
  });

  it("materializes generated destinations and still rejects edits beyond the progression", () => {
    const generatedProject = createRichProjectFixture();
    const generatedStep = generatedProject.progression.steps.find(
      (step) => step.kind === "chord" && step.melody?.mode === "generated",
    );
    if (!generatedStep || generatedStep.kind !== "chord") throw new Error("Missing generated step");
    const before = createEffectiveMelodyTimeline(generatedProject).filter(
      (note) => note.sourceStepId === generatedStep.id,
    );
    const inserted = applyAuthoredMelodyTransaction(generatedProject, {
        type: "melody/apply-authored-transaction",
        payload: {
          nowIso: "now",
          edits: [
            {
              type: "upsert",
              note: {
                id: "blocked",
                pitch,
                startBeats: rational(0),
                durationBeats: rational(1, 4),
              },
            },
          ],
        },
      });
    expect(inserted.project.progression.steps.find((step) => step.id === generatedStep.id))
      .toMatchObject({ melody: { mode: "authored" } });
    expect(createEffectiveMelodyTimeline(inserted.project).filter(
      (note) => note.sourceStepId === generatedStep.id,
    )).toHaveLength(before.length + 1);
    expect(() =>
      applyAuthoredMelodyTransaction(withSteps([rest("only")]), {
        type: "melody/apply-authored-transaction",
        payload: {
          nowIso: "now",
          edits: [
            {
              type: "upsert",
              note: { id: "tail", pitch, startBeats: rational(1), durationBeats: rational(1, 4) },
            },
          ],
        },
      }),
    ).toThrow(/within the current progression/);
  });

  it("keeps triplet Rational onset and duration exact through the derived timeline", () => {
    const project = withSteps([
      Object.freeze({
        ...rest("triplet-owner"),
        authoredMelody: Object.freeze({
          notes: Object.freeze([
            { id: "triplet-note", pitch, onset: rational(1, 3), duration: rational(2, 3) },
          ]),
        }),
      }),
    ]);
    expect(createEffectiveMelodyTimeline(project)[0]).toMatchObject({
      startBeats: rational(1, 3),
      durationBeats: rational(2, 3),
    });
  });

  it("duplicates Rest phrases with fresh note IDs while preserving exact note content", () => {
    const source = Object.freeze({
      ...rest("copy-source"),
      authoredMelody: Object.freeze({
        notes: Object.freeze([
          { id: "copy-note", pitch, onset: rational(1, 3), duration: rational(2, 3) },
        ]),
      }),
    });
    const project = withSteps([source]);
    const duplicated = duplicateSteps(project, {
      type: "progression/duplicate-steps",
      payload: { steps: [source], newStepIds: ["copy-target"], nowIso: "2026-09-30T00:00:00.000Z" },
    }).project;
    const target = duplicated.progression.steps[1];
    expect(target?.kind).toBe("rest");
    if (target?.kind !== "rest") throw new Error("expected duplicated Rest");
    expect(target.authoredMelody?.notes[0]).toMatchObject({
      pitch,
      onset: rational(1, 3),
      duration: rational(2, 3),
    });
    expect(target.authoredMelody?.notes[0]?.id).not.toBe("copy-note");
  });

  it("duplicates authored Chord notes with fresh IDs while preserving their exact content", () => {
    const project = createRichProjectFixture();
    const source = project.progression.steps[1];
    if (!source || source.kind !== "chord") throw new Error("expected source chord");
    const authored = Object.freeze({
      ...source,
      melody: snapshotChordMelody({
        mode: "authored",
        phrase: {
          notes: [
            { id: "chord-copy-note", pitch, onset: rational(1, 3), duration: rational(2, 3) },
          ],
        },
      }),
    });
    const duplicated = duplicateSteps(project, {
      type: "progression/duplicate-steps",
      payload: {
        steps: [authored],
        newStepIds: ["chord-copy"],
        nowIso: "2026-09-30T00:00:00.000Z",
      },
    }).project;
    const copy = duplicated.progression.steps.at(-1);
    expect(copy?.kind).toBe("chord");
    if (copy?.kind !== "chord" || copy.melody?.mode !== "authored")
      throw new Error("expected authored duplicate");
    expect(copy.melody.phrase.notes[0]).toMatchObject({
      pitch,
      onset: rational(1, 3),
      duration: rational(2, 3),
    });
    expect(copy.melody.phrase.notes[0]?.id).not.toBe("chord-copy-note");
    expect(authored.melody?.mode === "authored" && authored.melody.phrase.notes[0]?.id).toBe(
      "chord-copy-note",
    );
  });

  it("reorders note owners with their relative Rational timing and duration", () => {
    const owner = Object.freeze({
      ...rest("owner"),
      authoredMelody: Object.freeze({
        notes: Object.freeze([
          { id: "owner-note", pitch, onset: rational(1, 3), duration: rational(2, 3) },
        ]),
      }),
    });
    const other = rest("other");
    const project = withSteps([owner, other]);
    const reordered = reorderSteps(project, {
      type: "progression/reorder-steps",
      payload: { steps: [other, owner], nowIso: "2026-09-30T00:00:00.000Z" },
    }).project;
    expect(createEffectiveMelodyTimeline(reordered)[0]).toMatchObject({
      sourceStepId: "owner",
      eventKey: "owner-note",
      startBeats: rational(4, 3),
      durationBeats: rational(2, 3),
    });
    expect(
      reordered.progression.steps[1]?.kind === "rest" &&
        reordered.progression.steps[1].authoredMelody?.notes[0]?.duration,
    ).toEqual(rational(2, 3));
  });

  it("deletes owner Melody with the Step in one undoable command while other notes continue", () => {
    const project = withSteps([
      Object.freeze({
        ...rest("deleted-owner"),
        authoredMelody: Object.freeze({
          notes: Object.freeze([
            { id: "delete-with-owner", pitch, onset: rational(0), duration: rational(1) },
          ]),
        }),
      }),
      Object.freeze({
        ...rest("remaining-owner"),
        authoredMelody: Object.freeze({
          notes: Object.freeze([
            { id: "continues", pitch, onset: rational(0), duration: rational(1) },
          ]),
        }),
      }),
    ]);
    const store = new AppStore(project);
    store.dispatch(
      {
        type: "progression/remove-step",
        payload: { stepId: "deleted-owner", nowIso: "2026-09-30T00:00:00.000Z" },
      },
      removeStep,
    );
    expect(store.project.progression.steps).toHaveLength(1);
    expect(createEffectiveMelodyTimeline(store.project).map((event) => event.eventKey)).toEqual([
      "continues",
    ]);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(project.progression);
  });
});
