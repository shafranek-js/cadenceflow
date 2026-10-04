import { describe, expect, it } from "vitest";
import { applyAuthoredMelodyTransaction } from "../../../src/app/commands/authoredMelodyTransaction";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  planRangeTransposition,
  transposeRange,
  RangeTranspositionError,
} from "../../../src/app/commands/rangeTranspositionCommands";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import {
  snapshotAuthoredMelodyPhrase,
  snapshotChordMelody,
} from "../../../src/domain/melody/types";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";
import { realizeProgressionStepRealization } from "../../../src/instruments/piano/profile";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

const now = "2026-10-03T10:00:00.000Z";

function projectWithChords(): Project {
  const project = createDefaultProject("range-transpose", "Range Transpose", now);
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      steps: Object.freeze([
        createMatrixChordStep(project, "I", "a"),
        createMatrixChordStep(project, "V", "b"),
        createMatrixChordStep(project, "I", "c"),
      ]),
    }),
  });
}

describe("selected-range transposition command", () => {
  it("persists an authored enharmonic respelling when MIDI pitch stays the same", () => {
    const initial = projectWithChords();
    const original = initial.progression.steps[0]!;
    const withMelody = Object.freeze({
      ...initial,
      progression: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            ...original,
            melody: snapshotChordMelody({
              mode: "authored",
              phrase: snapshotAuthoredMelodyPhrase({
                notes: [
                  {
                    id: "respell-me",
                    pitch: exactPitch(61, { step: "C", alter: 1 }),
                    onset: rational(0),
                    duration: rational(1),
                  },
                ],
              }),
            }),
          }),
          ...initial.progression.steps.slice(1),
        ]),
      }),
    });
    const applied = applyAuthoredMelodyTransaction(withMelody, {
      type: "melody/apply-authored-transaction",
      payload: {
        nowIso: now,
        edits: [
          {
            type: "upsert",
            sourceStepId: "a",
            note: {
              id: "respell-me",
              pitch: exactPitch(61, { step: "D", alter: -1 }),
              startBeats: rational(0),
              durationBeats: rational(1),
            },
          },
        ],
      },
    });
    const owner = applied.project.progression.steps[0];
    const stored =
      owner?.kind === "chord" && owner.melody?.mode === "authored"
        ? owner.melody.phrase.notes[0]
        : undefined;
    expect(stored?.pitch.midiNumber).toBe(61);
    expect(stored?.pitch.spelling).toEqual({ step: "D", alter: -1 });
  });

  it("retains an authored concert spelling over a nonzero owner offset and portable round-trip", () => {
    const initial = projectWithChords();
    const original = initial.progression.steps[0]!;
    const withMelody = Object.freeze({
      ...initial,
      progression: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            ...original,
            transpositionSemitones: 2,
            melody: snapshotChordMelody({
              mode: "authored",
              phrase: snapshotAuthoredMelodyPhrase({
                notes: [
                  {
                    id: "nonzero-respell",
                    pitch: exactPitch(61, { step: "D", alter: -1 }),
                    onset: rational(0),
                    duration: rational(1),
                  },
                ],
              }),
            }),
          }),
          ...initial.progression.steps.slice(1),
        ]),
      }),
    });
    const applied = applyAuthoredMelodyTransaction(withMelody, {
      type: "melody/apply-authored-transaction",
      payload: {
        nowIso: now,
        edits: [
          {
            type: "upsert",
            sourceStepId: "a",
            note: {
              id: "nonzero-respell",
              pitch: exactPitch(63, { step: "D", alter: 1 }),
              startBeats: rational(0),
              durationBeats: rational(1),
            },
          },
        ],
      },
    });
    const effectivePitch = (project: Project) =>
      createEffectiveMelodyTimeline(project).find((event) => event.eventKey === "nonzero-respell")
        ?.pitch;
    const owner = applied.project.progression.steps[0];
    const stored =
      owner?.kind === "chord" && owner.melody?.mode === "authored"
        ? owner.melody.phrase.notes[0]
        : undefined;
    expect(stored?.pitch).toMatchObject({
      midiNumber: 61,
      spelling: { step: "D", alter: -1 },
      transpositionSpellingOverride: { step: "D", alter: 1 },
    });
    expect(effectivePitch(applied.project)).toMatchObject({
      midiNumber: 63,
      spelling: { step: "D", alter: 1 },
    });

    const restored = decodePortableProject(encodePortableProject(applied.project));
    expect(effectivePitch(restored)).toMatchObject({
      midiNumber: 63,
      spelling: { step: "D", alter: 1 },
    });
  });

  it("clears a selected owner's concert spelling override when its range is transposed", () => {
    const initial = projectWithChords();
    const original = initial.progression.steps[0]!;
    const withMelody = Object.freeze({
      ...initial,
      progression: Object.freeze({
        steps: Object.freeze([
          Object.freeze({
            ...original,
            transpositionSemitones: 2,
            melody: snapshotChordMelody({
              mode: "authored",
              phrase: snapshotAuthoredMelodyPhrase({
                notes: [
                  {
                    id: "transposed-again",
                    pitch: Object.freeze({
                      ...exactPitch(61, { step: "D", alter: -1 }),
                      transpositionSpellingOverride: { step: "D", alter: 1 },
                    }),
                    onset: rational(0),
                    duration: rational(1),
                  },
                ],
              }),
            }),
          }),
          ...initial.progression.steps.slice(1),
        ]),
      }),
    });
    const plan = planRangeTransposition(withMelody, ["a"], 1);
    const owner = plan.progression.steps[0];
    const stored =
      owner?.kind === "chord" && owner.melody?.mode === "authored"
        ? owner.melody.phrase.notes[0]
        : undefined;
    const projected = Object.freeze({ ...withMelody, progression: plan.progression });
    const effective = createEffectiveMelodyTimeline(projected).find(
      (event) => event.eventKey === "transposed-again",
    );
    expect(stored?.pitch.transpositionSpellingOverride).toBeUndefined();
    expect(effective?.pitch).toMatchObject({ midiNumber: 64, spelling: { step: "E", alter: 0 } });
  });

  it("changes only selected owners and produces one undoable, redoable transaction", () => {
    const initial = projectWithChords();
    const store = new AppStore(initial);
    const unrelatedBefore = initial.progression.steps[2];
    store.dispatch(
      {
        type: "progression/transpose-range",
        payload: { stepIds: ["a", "b"], semitones: 2, nowIso: now },
      },
      transposeRange,
    );

    expect(store.history.undoDepth).toBe(1);
    expect(store.project.progression.steps.map((step) => step.transpositionSemitones)).toEqual([
      2,
      2,
      undefined,
    ]);
    expect(store.project.progression.steps[2]).toBe(unrelatedBefore);
    const transposed = realizeProgressionStepRealization(
      store.project.progression.steps[0] as never,
      store.project.tonic,
    );
    const source = realizeProgressionStepRealization(
      initial.progression.steps[0] as never,
      initial.tonic,
    );
    expect(transposed.pitches.map((pitch) => pitch.midiNumber)).toEqual(
      source.pitches.map((pitch) => pitch.midiNumber + 2),
    );
    expect(store.undo()).toBe(true);
    expect(store.project.progression.steps.map((step) => step.transpositionSemitones)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps.map((step) => step.transpositionSemitones)).toEqual([
      2,
      2,
      undefined,
    ]);
  });

  it("applies positive and negative octave changes additively to selected Chord and Rest Steps", () => {
    const initial = projectWithChords();
    const first = initial.progression.steps[0]!;
    const withAuthoredMelody = Object.freeze({
      ...initial,
      progression: Object.freeze({
        ...initial.progression,
        steps: Object.freeze([
          Object.freeze({
            ...first,
            melody: snapshotChordMelody({
              mode: "authored",
              phrase: snapshotAuthoredMelodyPhrase({
                notes: [
                  {
                    id: "octave-authored",
                    pitch: exactPitch(60, { step: "C", alter: 0 }),
                    onset: rational(0),
                    duration: rational(1),
                  },
                ],
              }),
            }),
          }),
          ...initial.progression.steps.slice(1),
          Object.freeze({
            id: "rest-owner",
            kind: "rest" as const,
            duration: musicalDuration(rational(4)),
            authoredMelody: snapshotAuthoredMelodyPhrase({
              notes: [
                {
                  id: "octave-rest",
                  pitch: exactPitch(55, { step: "G", alter: 0 }),
                  onset: rational(0),
                  duration: rational(1),
                },
              ],
            }),
          }),
        ]),
      }),
    });

    const raised = planRangeTransposition(withAuthoredMelody, ["a", "rest-owner"], 12);
    const raisedProject = Object.freeze({ ...withAuthoredMelody, progression: raised.progression });
    expect(
      createEffectiveMelodyTimeline(raisedProject).map((event) => [
        event.eventKey,
        event.pitch.midiNumber,
      ]),
    ).toContainEqual(["octave-authored", 72]);
    expect(
      createEffectiveMelodyTimeline(raisedProject).map((event) => [
        event.eventKey,
        event.pitch.midiNumber,
      ]),
    ).toContainEqual(["octave-rest", 67]);
    const lowered = planRangeTransposition(raisedProject, ["a", "rest-owner"], -24);
    const loweredProject = Object.freeze({ ...raisedProject, progression: lowered.progression });
    expect(
      loweredProject.progression.steps.find((step) => step.id === "a")?.transpositionSemitones,
    ).toBe(-12);
    expect(
      loweredProject.progression.steps.find((step) => step.id === "rest-owner")
        ?.transpositionSemitones,
    ).toBe(-12);
    expect(
      createEffectiveMelodyTimeline(loweredProject).map((event) => [
        event.eventKey,
        event.pitch.midiNumber,
      ]),
    ).toContainEqual(["octave-authored", 48]);
    expect(
      createEffectiveMelodyTimeline(loweredProject).map((event) => [
        event.eventKey,
        event.pitch.midiNumber,
      ]),
    ).toContainEqual(["octave-rest", 43]);
  });

  it("transposes selected generated phrases in their concert frame while preserving the source recipe", () => {
    const initial = projectWithChords();
    const generated = Object.freeze({
      ...initial.progression.steps[0]!,
      melody: snapshotChordMelody({
        mode: "generated",
        recipe: {
          pitchMotion: "up" as const,
          rhythm: "even" as const,
          connection: "retrigger" as const,
          grid: "quarter" as const,
          octaveOffset: 0,
        },
      }),
    });
    const project = Object.freeze({
      ...initial,
      progression: Object.freeze({
        ...initial.progression,
        steps: Object.freeze([generated, ...initial.progression.steps.slice(1)]),
      }),
    });
    const before = createEffectiveMelodyTimeline(project).filter(
      (event) => event.sourceStepId === "a",
    );
    const plan = planRangeTransposition(project, ["a"], 5);
    const afterProject = Object.freeze({ ...project, progression: plan.progression });
    const after = createEffectiveMelodyTimeline(afterProject).filter(
      (event) => event.sourceStepId === "a",
    );
    expect(after.map((event) => event.pitch.midiNumber)).toEqual(
      before.map((event) => event.pitch.midiNumber + 5),
    );
    const owner = plan.progression.steps[0];
    if (owner?.kind !== "chord") throw new Error("generated chord owner was lost");
    const sourceRecipe =
      owner.melody?.mode === "generated" ? owner.melody.recipe : owner.melody?.sourceRecipe;
    expect(sourceRecipe).toMatchObject({ pitchMotion: "up", grid: "quarter" });
  });

  it("transposes manual voicing and custom bass without rewriting source-frame pitches", () => {
    const initial = projectWithChords();
    const source = initial.progression.steps[0];
    if (source?.kind !== "chord") throw new Error("fixture step must be a chord");
    const manual = Object.freeze({
      ...source,
      performance: Object.freeze({
        ...source.performance,
        voicingMode: "manual" as const,
        manualVoicing: Object.freeze([
          exactPitch(60, { step: "C", alter: 0 }),
          exactPitch(64, { step: "E", alter: 0 }),
          exactPitch(67, { step: "G", alter: 0 }),
        ]),
        bass: Object.freeze({
          ...source.performance.bass,
          choice: "custom" as const,
          customPitch: exactPitch(36, { step: "C", alter: 0 }),
        }),
      }),
    });
    const project = Object.freeze({
      ...initial,
      progression: Object.freeze({
        ...initial.progression,
        steps: Object.freeze([manual, ...initial.progression.steps.slice(1)]),
      }),
    });
    const plan = planRangeTransposition(project, ["a"], 3);
    const owner = plan.progression.steps[0];
    if (owner?.kind !== "chord") throw new Error("transposition removed chord owner");
    expect(owner.transpositionSemitones).toBe(3);
    expect(owner.performance.manualVoicing?.map((pitch) => pitch.midiNumber)).toEqual([60, 64, 67]);
    expect(owner.performance.bass.customPitch?.midiNumber).toBe(36);
    const projected = realizeProgressionStepRealization(owner, project.tonic);
    expect(projected.pitches.map((pitch) => pitch.midiNumber)).toEqual([63, 67, 70]);
    expect(projected.bassPitch?.midiNumber).toBe(39);
  });

  it("rejects an out-of-range selected result atomically", () => {
    const initial = projectWithChords();
    const store = new AppStore(initial);
    expect(() =>
      store.dispatch(
        {
          type: "progression/transpose-range",
          payload: { stepIds: ["a"], semitones: 127, nowIso: now },
        },
        transposeRange,
      ),
    ).toThrow(RangeTranspositionError);
    expect(store.project).toBe(initial);
    expect(store.history.undoDepth).toBe(0);
    expect(store.history.redoDepth).toBe(0);
    expect(
      initial.progression.steps.every((step) => step.transpositionSemitones === undefined),
    ).toBe(true);
  });

  it("treats zero as a valid preview no-op with no history entry", () => {
    const initial = projectWithChords();
    const store = new AppStore(initial);
    expect(planRangeTransposition(initial, ["a"], 0).progression).toBe(initial.progression);
    store.dispatch(
      {
        type: "progression/transpose-range",
        payload: { stepIds: ["a"], semitones: 0, nowIso: now },
      },
      transposeRange,
    );
    expect(store.project).toBe(initial);
    expect(store.history.undoDepth).toBe(0);
  });

  it("keeps an unselected generated phrase stable when its next chord changes target context", () => {
    const initial = projectWithChords();
    const targetOwner = Object.freeze({
      ...initial.progression.steps[0]!,
      melody: snapshotChordMelody({
        mode: "generated",
        recipe: {
          pitchMotion: "up",
          rhythm: "even",
          connection: "retrigger",
          grid: "quarter",
          octaveOffset: 0,
          targetNextPitchClass: 2,
        },
      }),
    });
    const generatedProject = Object.freeze({
      ...initial,
      progression: Object.freeze({
        steps: Object.freeze([targetOwner, ...initial.progression.steps.slice(1)]),
      }),
    });
    const before = createEffectiveMelodyTimeline(generatedProject).filter(
      (event) => event.sourceStepId === "a",
    );
    const plan = planRangeTransposition(generatedProject, ["b"], 1);
    const afterProject = Object.freeze({ ...generatedProject, progression: plan.progression });
    const after = createEffectiveMelodyTimeline(afterProject).filter(
      (event) => event.sourceStepId === "a",
    );

    expect(
      after.map((event) => ({
        eventKey: event.eventKey,
        pitch: event.pitch,
        sourcePitchMidi: event.sourcePitchMidi,
        startBeats: event.startBeats,
        durationBeats: event.durationBeats,
        instrument: event.instrument,
      })),
    ).toEqual(
      before.map((event) => ({
        eventKey: event.eventKey,
        pitch: event.pitch,
        sourcePitchMidi: event.sourcePitchMidi,
        startBeats: event.startBeats,
        durationBeats: event.durationBeats,
        instrument: event.instrument,
      })),
    );
    const ownerAfter = plan.progression.steps[0];
    if (plan.materializedStepIds.includes("a")) {
      expect(
        ownerAfter?.kind === "chord" && ownerAfter.melody?.mode === "authored"
          ? ownerAfter.melody.sourceRecipe
          : undefined,
      ).toMatchObject({ targetNextPitchClass: 2 });
    } else {
      expect(ownerAfter?.kind === "chord" && ownerAfter.melody?.mode).toBe("generated");
    }
  });

  it.each([
    { midi: 0, offset: 12, spelling: { step: "C" as const, alter: 0 } },
    { midi: 127, offset: -12, spelling: { step: "G" as const, alter: 0 } },
  ])(
    "saves concert MIDI $midi under owner offset $offset without clamping",
    ({ midi, offset, spelling }) => {
      const base = createDefaultProject(`edge-${midi}`, "Edge", now);
      const sourceStep = createMatrixChordStep(base, "I", "owner");
      const project = Object.freeze({
        ...base,
        progression: Object.freeze({
          steps: Object.freeze([Object.freeze({ ...sourceStep, transpositionSemitones: offset })]),
        }),
      });
      const applied = applyAuthoredMelodyTransaction(project, {
        type: "melody/apply-authored-transaction",
        payload: {
          nowIso: now,
          edits: [
            {
              type: "upsert",
              note: {
                id: `edge-${midi}`,
                pitch: exactPitch(midi, spelling),
                startBeats: rational(0),
                durationBeats: rational(1),
              },
            },
          ],
        },
      });
      const owner = applied.project.progression.steps[0];
      const stored =
        owner?.kind === "chord" && owner.melody?.mode === "authored"
          ? owner.melody.phrase.notes[0]
          : undefined;
      expect(stored?.pitch.midiNumber).toBe(midi === 0 ? 0 : 127);
      expect(stored?.pitch.transpositionCompensationSemitones).toBe(offset === 12 ? -12 : 12);
      expect(createEffectiveMelodyTimeline(applied.project)[0]?.pitch.midiNumber).toBe(midi);
    },
  );
});
