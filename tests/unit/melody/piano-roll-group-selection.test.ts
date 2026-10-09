import { omitFields } from "../../fixtures/assertions";
import { describe, expect, it } from "vitest";
import {
  applyAuthoredMelodyTransaction,
  restoreAuthoredMelodyTransaction,
  type RestoreAuthoredMelodyCommand,
} from "../../../src/app/commands/authoredMelodyTransaction";
import { AppStore } from "../../../src/app/appStore";
import { restoreProgression } from "../../../src/app/commands/progressionCommands";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import {
  snapshotAuthoredMelodyPhrase,
  snapshotChordMelody,
} from "../../../src/domain/melody/types";
import type { RestStep } from "../../../src/domain/progression/step";
import type { Project } from "../../../src/domain/project/project";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { addRational, compareRational, rational } from "../../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import {
  parsePianoRollNoteIdentity,
  pianoRollNoteIdentity,
  pianoRollRectanglesIntersect,
  planPianoRollGroupMoveByDelta,
  planPianoRollPaste,
} from "../../../src/ui/melody/pianoRollGroupSelection";
import { createPianoRollSystemChordFixture } from "../../fixtures/piano-roll-system-chord.fixture";

const T0 = "2026-10-03T12:00:00.000Z";

function withOwnerOffsets(project = createPianoRollSystemChordFixture()): Project {
  const steps = project.progression.steps.map((step) => {
    if (step.id === "chord-a") return { ...step, transpositionSemitones: 2 };
    if (step.id === "chord-b") return { ...step, transpositionSemitones: 5 };
    return step;
  });
  return { ...project, updatedAt: T0, progression: { ...project.progression, steps } };
}

function applyPlan(
  project: Project,
  edits: Parameters<typeof applyAuthoredMelodyTransaction>[1]["payload"]["edits"],
) {
  return applyAuthoredMelodyTransaction(project, {
    type: "melody/apply-authored-transaction",
    payload: { edits, expectedUpdatedAt: project.updatedAt, nowIso: T0 },
  });
}

function withPartialFinalBar(): Project {
  const source = createPianoRollSystemChordFixture();
  const partial: RestStep = Object.freeze<RestStep>({
    id: "partial-final-rest",
    kind: "rest",
    duration: musicalDuration(rational(5, 2)),
    melodyInstrumentOverride: "flute",
  });
  return Object.freeze<Project>({
    ...omitFields(source, "temporaryBranch"),

    progression: Object.freeze({
      steps: Object.freeze([partial]),
      selectedStepId: partial.id,
      loopRegion: Object.freeze({ startStepId: partial.id, endStepId: partial.id }),
      sections: Object.freeze([
        Object.freeze({ id: "ending", name: "Ending", startStepId: partial.id }),
      ]),
    }),
  });
}

describe("Piano Roll global group selection and edits", () => {
  it("uses owner-scoped identity and inclusive rectangle intersection", () => {
    expect(pianoRollNoteIdentity("step", "same-id")).not.toBe(
      pianoRollNoteIdentity("other-step", "same-id"),
    );
    expect(parsePianoRollNoteIdentity(pianoRollNoteIdentity("step", "same-id"))).toEqual({
      sourceStepId: "step",
      eventKey: "same-id",
    });
    expect(parsePianoRollNoteIdentity("not-json")).toBeNull();
    expect(
      pianoRollRectanglesIntersect(
        { left: 0, right: 10, top: 0, bottom: 10 },
        { left: 10, right: 20, top: 10, bottom: 20 },
      ),
    ).toBe(true);
  });

  it("moves a group across owner Steps with one exact Rational delta and resolves note-ID collisions", () => {
    const project = withOwnerOffsets();
    const before = createEffectiveMelodyTimeline(project);
    const selected = before.filter(
      (note) =>
        note.sourceStepId === "chord-a" &&
        ["owner-local-collision", "cross-system-carry"].includes(note.eventKey),
    );
    const plan = planPianoRollGroupMoveByDelta(project, selected, 0, rational(4));
    expect(plan.selection).toEqual([
      { sourceStepId: "chord-b", eventKey: "owner-local-collision~chord-b~1" },
      { sourceStepId: "chord-b", eventKey: "cross-system-carry" },
    ]);
    expect(plan.edits[0]).toMatchObject({
      type: "upsert",
      sourceStepId: "chord-a",
      sourceNoteId: "owner-local-collision",
      note: { id: "owner-local-collision~chord-b~1" },
    });

    const moved = applyPlan(project, plan.edits);
    const after = createEffectiveMelodyTimeline(moved.project).filter((note) =>
      plan.selection.some(
        (identity) =>
          identity.sourceStepId === note.sourceStepId && identity.eventKey === note.eventKey,
      ),
    );
    expect(after).toHaveLength(2);
    for (const [index, note] of after.entries()) {
      expect(note.pitch.midiNumber).toBe(selected[index]?.pitch.midiNumber);
      expect(
        compareRational(note.startBeats, addRational(selected[index]!.startBeats, rational(4))),
      ).toBe(0);
    }
    expect(
      createEffectiveMelodyTimeline(moved.project).some(
        (note) => note.sourceStepId === "chord-a" && note.eventKey === "owner-local-collision",
      ),
    ).toBe(false);

    const undone = restoreAuthoredMelodyTransaction(
      moved.project,
      moved.inverse as RestoreAuthoredMelodyCommand,
    );
    expect(createEffectiveMelodyTimeline(undone.project)).toEqual(before);
    const redone = restoreAuthoredMelodyTransaction(
      undone.project,
      undone.inverse as RestoreAuthoredMelodyCommand,
    );
    expect(createEffectiveMelodyTimeline(redone.project)).toEqual(
      createEffectiveMelodyTimeline(moved.project),
    );
  });

  it("moves repeated owner-scoped IDs together without conflating their sources", () => {
    const project = createPianoRollSystemChordFixture();
    const before = createEffectiveMelodyTimeline(project);
    const selected = before.filter(
      (note) =>
        note.eventKey === "owner-local-collision" &&
        ["chord-a", "chord-b"].includes(note.sourceStepId),
    );
    expect(selected.map((note) => note.sourceStepId)).toEqual(["chord-a", "chord-b"]);

    const plan = planPianoRollGroupMoveByDelta(project, selected, 0, rational(8));
    expect(plan.selection).toEqual([
      { sourceStepId: "chord-c", eventKey: "owner-local-collision" },
      { sourceStepId: "rest-d", eventKey: "owner-local-collision~rest-d~1" },
    ]);
    const moved = applyPlan(project, plan.edits);
    const after = createEffectiveMelodyTimeline(moved.project);
    expect(
      after
        .filter((note) =>
          plan.selection.some(
            (identity) =>
              identity.sourceStepId === note.sourceStepId && identity.eventKey === note.eventKey,
          ),
        )
        .map((note) => [note.sourceStepId, note.startBeats, note.pitch.midiNumber]),
    ).toEqual([
      ["chord-c", rational(8), selected[0]!.pitch.midiNumber],
      ["rest-d", rational(12), selected[1]!.pitch.midiNumber],
    ]);
    expect(
      after.some(
        (note) => note.sourceStepId === "chord-a" && note.eventKey === "owner-local-collision",
      ),
    ).toBe(false);
    expect(
      after.some(
        (note) => note.sourceStepId === "chord-b" && note.eventKey === "owner-local-collision",
      ),
    ).toBe(false);
  });

  it("preserves flat spelling on a pure horizontal group move", () => {
    const project = createPianoRollSystemChordFixture();
    const flat = exactPitch(61, { step: "D", alter: -1 });
    const steps = project.progression.steps.map((step) => {
      if (step.id !== "chord-a" || step.kind !== "chord" || step.melody?.mode !== "authored")
        return step;
      const phrase = snapshotAuthoredMelodyPhrase({
        ...step.melody.phrase,
        notes: step.melody.phrase.notes.map((note, index) =>
          index === 0 ? { ...note, pitch: flat } : note,
        ),
      });
      return {
        ...step,
        melody: snapshotChordMelody({ ...step.melody, phrase }),
      };
    });
    const flatProject = {
      ...project,
      progression: { ...project.progression, steps },
    } as Project;
    const selected = createEffectiveMelodyTimeline(flatProject).filter(
      (note) => note.sourceStepId === "chord-a" && note.eventKey === "owner-local-collision",
    );
    const plan = planPianoRollGroupMoveByDelta(flatProject, selected, 0, rational(1, 3));
    expect(plan.edits[0]).toMatchObject({ type: "upsert", note: { pitch: flat } });
    const moved = applyPlan(flatProject, plan.edits);
    expect(
      createEffectiveMelodyTimeline(moved.project).find(
        (note) => note.sourceStepId === "chord-a" && note.eventKey === "owner-local-collision",
      )?.pitch,
    ).toEqual(flat);
  });

  it("materializes a generated destination when a Rest-owned authored note moves into it", () => {
    const project = createPianoRollSystemChordFixture();
    const note = createEffectiveMelodyTimeline(project).find(
      (candidate) => candidate.sourceStepId === "rest-d" && candidate.eventKey === "rest-polyphony",
    );
    expect(note).toBeDefined();
    const plan = planPianoRollGroupMoveByDelta(project, [note!], 0, rational(4));
    expect(plan.selection[0]?.sourceStepId).toBe("generated-e");
    const applied = applyPlan(project, plan.edits);
    const generatedOwner = applied.project.progression.steps.find(
      (step) => step.id === "generated-e",
    );
    expect(generatedOwner?.kind === "chord" && generatedOwner.melody?.mode).toBe("authored");
    const moved = createEffectiveMelodyTimeline(applied.project).find(
      (candidate) =>
        candidate.sourceStepId === plan.selection[0]?.sourceStepId &&
        candidate.eventKey === plan.selection[0]?.eventKey,
    );
    expect(moved?.pitch.midiNumber).toBe(note!.pitch.midiNumber);
    expect(compareRational(moved!.startBeats, addRational(note!.startBeats, rational(4)))).toBe(0);
    expect(
      createEffectiveMelodyTimeline(applied.project).some(
        (candidate) =>
          candidate.sourceStepId === "rest-d" && candidate.eventKey === "rest-polyphony",
      ),
    ).toBe(false);
  });

  it("pastes exact Rational offsets and chooses an ID that is unique in its owner", () => {
    const project = createPianoRollSystemChordFixture();
    const requestedIds = ["owner-local-collision", "pasted-note"];
    const plan = planPianoRollPaste(
      project,
      [
        {
          pitch: exactPitch(64, { step: "E", alter: 0 }),
          onset: rational(1, 3),
          duration: rational(1, 6),
          instrument: "flute",
        },
      ],
      rational(3, 2),
      () => requestedIds.shift() ?? "fallback-note",
    );
    expect(plan.edits[0]).toMatchObject({
      type: "upsert",
      note: { id: "pasted-note", startBeats: rational(11, 6) },
    });
    const applied = applyPlan(project, plan.edits);
    const pasted = createEffectiveMelodyTimeline(applied.project).find(
      (note) => note.eventKey === plan.selection[0]?.eventKey,
    );
    expect(pasted?.startBeats).toEqual(rational(11, 6));
    expect(pasted?.durationBeats).toEqual(rational(1, 6));
  });

  it("uses existing multi-Measure space without extending the progression", () => {
    const project = createPianoRollSystemChordFixture();
    const plan = planPianoRollPaste(
      project,
      [
        {
          pitch: exactPitch(64, { step: "E", alter: 0 }),
          onset: rational(1, 3),
          duration: rational(1, 6),
          instrument: "flute",
        },
      ],
      rational(20),
      () => "paste-within-existing-space",
      () => "unused-step-id",
    );
    expect(plan.appendedSteps).toBeUndefined();
    expect(plan.edits[0]).toMatchObject({
      type: "upsert",
      note: { startBeats: rational(61, 3), durationBeats: rational(1, 6) },
    });
  });

  it("refuses an extension that would reveal or lengthen Melody outside the old end", () => {
    const partialProject = withPartialFinalBar();
    const partialOwner = partialProject.progression.steps[0];
    if (!partialOwner || partialOwner.kind !== "rest")
      throw new Error("The partial final Rest fixture is unavailable");

    for (const dormantNote of [
      { id: "dormant-tail", onset: rational(3), duration: rational(1) },
      { id: "clipped-tail", onset: rational(2), duration: rational(2) },
    ]) {
      const owner: RestStep = {
        ...partialOwner,
        authoredMelody: snapshotAuthoredMelodyPhrase({
          notes: [
            {
              id: dormantNote.id,
              pitch: exactPitch(60, { step: "C", alter: 0 }),
              onset: dormantNote.onset,
              duration: dormantNote.duration,
            },
          ],
        }),
      };
      const project: Project = {
        ...partialProject,
        progression: { ...partialProject.progression, steps: [owner] },
      };
      const before = createEffectiveMelodyTimeline(project);
      if (dormantNote.id === "dormant-tail") expect(before).toHaveLength(0);
      else
        expect(before.find((note) => note.eventKey === dormantNote.id)?.durationBeats).toEqual(
          rational(1, 2),
        );

      const store = new AppStore(project);
      const portableBefore = encodePortableProject(store.project);
      let extensionIndex = 0;
      expect(() =>
        planPianoRollPaste(
          project,
          [
            {
              pitch: exactPitch(64, { step: "E", alter: 0 }),
              onset: rational(0),
              duration: rational(1),
              instrument: "flute",
            },
          ],
          rational(4),
          () => "rejected-paste-note",
          () => `rejected-extension-step-${++extensionIndex}`,
        ),
      ).toThrow(/reveal or lengthen existing Melody/);
      expect(store.project).toEqual(project);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(false);
      expect(encodePortableProject(store.project)).toBe(portableBefore);
    }
  });

  it("extends a partial final bar through multiple exact bars from the latest group end", () => {
    const project = withPartialFinalBar();
    const plan = planPianoRollPaste(
      project,
      [
        {
          pitch: exactPitch(64, { step: "E", alter: 0 }),
          onset: rational(1, 3),
          duration: rational(1, 6),
          instrument: "flute",
        },
        {
          pitch: exactPitch(67, { step: "G", alter: 0 }),
          onset: rational(15, 2),
          duration: rational(1, 3),
          instrument: "flute",
        },
      ],
      rational(5, 2),
      (() => {
        let index = 0;
        return () => `pasted-group-note-${++index}`;
      })(),
      (() => {
        let index = 0;
        return () => `paste-extension-${++index}`;
      })(),
    );

    expect(plan.edits.map((edit) => edit.type === "upsert" && edit.note)).toEqual([
      expect.objectContaining({ startBeats: rational(17, 6), durationBeats: rational(1, 6) }),
      expect.objectContaining({ startBeats: rational(10), durationBeats: rational(1, 3) }),
    ]);
    expect(plan.appendedSteps?.map((step) => step.duration.beats)).toEqual([
      rational(3, 2),
      rational(4),
      rational(4),
    ]);
    expect(plan.appendedSteps?.map((step) => step.id)).toEqual([
      "paste-extension-1",
      "paste-extension-2",
      "paste-extension-3",
    ]);
    const extendedDuration = plan.appendedSteps!.reduce(
      (sum, step) => addRational(sum, step.duration.beats),
      rational(5, 2),
    );
    expect(extendedDuration).toEqual(rational(12));
  });

  it("commits extension and pasted notes as one undoable progression restore, preserving Rest, generated, sections, loops, and portable state", () => {
    const project = createPianoRollSystemChordFixture();
    const beforeTimeline = createEffectiveMelodyTimeline(project);
    const plan = planPianoRollPaste(
      project,
      [
        {
          pitch: exactPitch(64, { step: "E", alter: 0 }),
          onset: rational(1, 3),
          duration: rational(1, 3),
          instrument: "flute",
        },
      ],
      rational(24),
      () => "extension-pasted-note",
      () => "extension-rest-measure",
    );
    expect(plan.appendedSteps).toHaveLength(1);
    const store = new AppStore(project);
    const candidate: Project = {
      ...store.project,
      progression: {
        ...store.project.progression,
        steps: [...store.project.progression.steps, ...plan.appendedSteps!],
      },
    };
    const applied = applyPlan(candidate, plan.edits);
    store.dispatch(
      {
        type: "progression/restore",
        payload: { progression: applied.project.progression, nowIso: T0 },
      },
      restoreProgression,
    );
    expect(store.canUndo).toBe(true);
    expect(store.history.canUndo).toBe(true);
    expect(store.project.progression.steps).toHaveLength(project.progression.steps.length + 1);
    expect(store.project.progression.selectedStepId).toBe(project.progression.selectedStepId);
    expect(store.project.progression.loopRegion).toEqual(project.progression.loopRegion);
    expect(store.project.progression.sections).toEqual(project.progression.sections);
    const addedStep = store.project.progression.steps.at(-1)!;
    expect(addedStep.kind).toBe("rest");
    expect(addedStep.kind === "rest" && addedStep.authoredMelody?.notes).toHaveLength(1);
    expect(
      createEffectiveMelodyTimeline(store.project).filter((note) =>
        beforeTimeline.some(
          (before) =>
            before.sourceStepId === note.sourceStepId && before.eventKey === note.eventKey,
        ),
      ),
    ).toEqual(beforeTimeline);

    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(project.progression);
    expect(store.canRedo).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(applied.project.progression);

    const portable = decodePortableProject(encodePortableProject(store.project));
    expect(portable.progression.steps.at(-1)).toEqual(addedStep);
    expect(portable.progression.selectedStepId).toBe(store.project.progression.selectedStepId);
    expect(portable.progression.loopRegion).toEqual(store.project.progression.loopRegion);
    expect(portable.progression.sections).toEqual(store.project.progression.sections);
    expect(createEffectiveMelodyTimeline(portable)).toEqual(
      createEffectiveMelodyTimeline(store.project),
    );
  });

  it("rejects pitch overflow, composition overflow, and incompatible destination instruments before edits", () => {
    const project = createPianoRollSystemChordFixture();
    const selected = createEffectiveMelodyTimeline(project).filter(
      (note) => note.sourceStepId === "chord-a" && note.eventKey === "cross-system-carry",
    );
    expect(() => planPianoRollGroupMoveByDelta(project, selected, 80, rational(0))).toThrow(
      /MIDI pitches 0–127/,
    );
    expect(() => planPianoRollGroupMoveByDelta(project, selected, 0, rational(100))).toThrow();

    const incompatible = {
      ...project,
      progression: {
        ...project.progression,
        steps: project.progression.steps.map((step) =>
          step.id === "chord-b" ? { ...step, melodyInstrumentOverride: "piano" } : step,
        ),
      },
    } as Project;
    const first = createEffectiveMelodyTimeline(incompatible).find(
      (note) => note.sourceStepId === "chord-a" && note.eventKey === "owner-local-collision",
    );
    expect(first).toBeDefined();
    expect(() => planPianoRollGroupMoveByDelta(incompatible, [first!], 0, rational(4))).toThrow(
      /different Melody instrument/,
    );
  });

  it("refuses an unrepresentable mixed-instrument bar without producing any extension plan", () => {
    const project = withPartialFinalBar();
    const originalUpdatedAt = project.updatedAt;
    expect(() =>
      planPianoRollPaste(
        project,
        [
          {
            pitch: exactPitch(64, { step: "E", alter: 0 }),
            onset: rational(0),
            duration: rational(1, 3),
            instrument: "flute",
          },
          {
            pitch: exactPitch(67, { step: "G", alter: 0 }),
            onset: rational(1, 3),
            duration: rational(1, 3),
            instrument: "gm-0",
          },
        ],
        rational(3),
      ),
    ).toThrow(/different Melody instruments within one new Measure/);
    expect(project.progression.steps).toHaveLength(1);
    expect(project.updatedAt).toBe(originalUpdatedAt);
  });
});
