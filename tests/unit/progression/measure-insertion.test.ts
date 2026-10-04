import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { restoreProgression } from "../../../src/app/commands/progressionCommands";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import type { Project } from "../../../src/domain/project/project";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { ProgressionStep, RestStep } from "../../../src/domain/progression/step";
import {
  planMeasureInsertion,
  type MeasureInsertionPlan,
} from "../../../src/domain/progression/measureDeletion";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { globalTiming, meter } from "../../../src/domain/timing/meter";
import {
  addRational,
  compareRational,
  rational,
  subtractRational,
} from "../../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import { startBranch } from "../../../src/app/commands/branchCommands";

const T0 = "2026-10-03T00:00:00.000Z";
const G4 = exactPitch(67, { step: "G", alter: 0 });
const base = createDefaultProject("measure-insert", "Measure insert", T0);

function chord(
  project: Project,
  id: string,
  functionId: string,
  duration: ReturnType<typeof rational>,
  patch: Partial<Extract<ProgressionStep, { kind: "chord" }>> = {},
): Extract<ProgressionStep, { kind: "chord" }> {
  return Object.freeze({
    ...createMatrixChordStep(project, functionId, id),
    duration: musicalDuration(duration),
    ...patch,
  });
}

function rest(
  id: string,
  duration: ReturnType<typeof rational>,
  patch: Partial<RestStep> = {},
): RestStep {
  return Object.freeze({ id, kind: "rest", duration: musicalDuration(duration), ...patch });
}

function projectWith(
  steps: readonly ProgressionStep[],
  progressionPatch: Partial<Project["progression"]> = {},
): Project {
  return Object.freeze({
    ...base,
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([...steps]),
      ...progressionPatch,
    }),
  });
}

function expectPlan(value: ReturnType<typeof planMeasureInsertion>): MeasureInsertionPlan {
  if ("reason" in value) throw new Error(value.reason);
  return value;
}

function timelineShape(project: Project) {
  return createEffectiveMelodyTimeline(project)
    .map((note) => ({
      eventKey: note.eventKey,
      pitch: note.pitch.midiNumber,
      sourcePitchMidi: note.sourcePitchMidi,
      startBeats: note.startBeats,
      durationBeats: note.durationBeats,
      instrument: note.instrument,
    }))
    .sort(
      (a, b) =>
        compareRational(a.startBeats, b.startBeats) ||
        a.pitch - b.pitch ||
        (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0),
    );
}

function expectedAfterInsertion(
  notes: ReturnType<typeof createEffectiveMelodyTimeline>,
  boundary: ReturnType<typeof rational>,
  duration: ReturnType<typeof rational>,
) {
  return notes
    .flatMap((note) => {
      const end = addRational(note.startBeats, note.durationBeats);
      if (compareRational(note.startBeats, boundary) >= 0)
        return [{ ...note, startBeats: addRational(note.startBeats, duration) }];
      const beforeEnd = compareRational(end, boundary) < 0 ? end : boundary;
      const result =
        compareRational(beforeEnd, note.startBeats) > 0
          ? [{ ...note, durationBeats: subtractRational(beforeEnd, note.startBeats) }]
          : [];
      if (compareRational(end, boundary) > 0)
        result.push({
          ...note,
          eventKey: `${note.eventKey}~measure-1-after`,
          startBeats: addRational(boundary, duration),
          durationBeats: subtractRational(end, boundary),
        });
      return result;
    })
    .map((note) => ({
      eventKey: note.eventKey,
      pitch: note.pitch.midiNumber,
      sourcePitchMidi: note.sourcePitchMidi,
      startBeats: note.startBeats,
      durationBeats: note.durationBeats,
      instrument: note.instrument,
    }))
    .sort(
      (a, b) =>
        compareRational(a.startBeats, b.startBeats) ||
        a.pitch - b.pitch ||
        (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0),
    );
}

describe("T216 Measure insertion model", () => {
  it("inserts after the target barline, splits a crossing Step and authored note, and preserves anchors", () => {
    const crossing = chord(base, "crossing", "I", rational(6), {
      transpositionSemitones: 2,
      melody: {
        mode: "authored",
        phrase: {
          notes: [
            {
              id: "held-note",
              pitch: G4,
              sourcePitchMidi: 65,
              onset: rational(3),
              duration: rational(3),
            },
          ],
        },
      },
    });
    const project = projectWith([crossing, chord(base, "following", "V", rational(2))], {
      selectedStepId: "following",
      sections: [{ id: "section", name: "Verse", startStepId: "crossing" }],
      loopRegion: { startStepId: "crossing", endStepId: "crossing" },
    });
    const before = createEffectiveMelodyTimeline(project);
    const plan = expectPlan(planMeasureInsertion(project, 0));
    const after = Object.freeze({ ...project, progression: plan.progression });

    expect(plan.startBeats).toEqual(rational(4));
    expect(plan.insertedDurationBeats).toEqual(rational(4));
    expect(plan.progression.steps.map((step) => [step.id, step.duration.beats])).toEqual([
      ["crossing", rational(4)],
      [expect.stringContaining("measure-1-inserted"), rational(4)],
      ["crossing~measure-1-right", rational(2)],
      ["following", rational(2)],
    ]);
    expect(timelineShape(after)).toEqual(expectedAfterInsertion(before, rational(4), rational(4)));
    expect(
      timelineShape(after).map((note) => [note.eventKey, note.startBeats, note.durationBeats]),
    ).toEqual([
      ["held-note", rational(3), rational(1)],
      ["held-note~measure-1-after", rational(8), rational(2)],
    ]);
    expect(plan.progression.selectedStepId).toBe("following");
    expect(plan.progression.sections).toEqual(project.progression.sections);
    expect(plan.progression.loopRegion).toEqual({
      startStepId: "crossing",
      endStepId: "crossing~measure-1-right",
    });
    expect(plan.loopStartStepIds.get("crossing")).toBe("crossing");
    expect(plan.loopEndStepIds.get("crossing")).toBe("crossing~measure-1-right");
  });

  it("preserves effective generated Melody and leaves the inserted interval silent", () => {
    const generated = chord(base, "generated", "I", rational(8), {
      melody: {
        mode: "generated",
        recipe: {
          pitchMotion: "up",
          rhythm: "even",
          connection: "retrigger",
          grid: "eighth",
          octaveOffset: 0,
        },
      },
    });
    const project = projectWith([generated]);
    const before = createEffectiveMelodyTimeline(project);
    const plan = expectPlan(planMeasureInsertion(project, 0));
    const after = Object.freeze({ ...project, progression: plan.progression });
    const expected = expectedAfterInsertion(before, rational(4), rational(4));

    expect(timelineShape(after)).toEqual(expected);
    expect(
      timelineShape(after).every(
        (note) =>
          compareRational(note.startBeats, rational(4)) < 0 ||
          compareRational(note.startBeats, rational(8)) >= 0,
      ),
    ).toBe(true);
    expect(
      plan.progression.steps.some(
        (step) => step.kind === "rest" && step.duration.beats.numerator === 4,
      ),
    ).toBe(true);
    const generatedSourceRecipe =
      generated.melody?.mode === "generated" ? generated.melody.recipe : undefined;
    for (const piece of plan.progression.steps.filter(
      (step) => step.id === "generated" || step.id.startsWith("generated~measure-"),
    )) {
      if (piece.kind !== "chord") throw new Error("Expected a split chord piece");
      const preservedRecipe =
        piece.melody?.mode === "generated"
          ? piece.melody.recipe
          : piece.melody?.mode === "authored"
            ? (piece.melody.sourceRecipe ?? piece.melody.phrase.sourceRecipe)
            : undefined;
      expect(preservedRecipe).toEqual(generatedSourceRecipe);
    }
  });

  it("inserts after a partial final Measure by materializing its old tail as a RestStep", () => {
    const project = projectWith(
      [chord(base, "full", "I", rational(4)), rest("partial", rational(1, 3))],
      {
        selectedStepId: "partial",
        sections: [{ id: "last", name: "Last", startStepId: "partial" }],
      },
    );
    const plan = expectPlan(planMeasureInsertion(project, 1));
    expect(plan.startBeats).toEqual(rational(8));
    expect(plan.progression.steps.map((step) => [step.id, step.duration.beats])).toEqual([
      ["full", rational(4)],
      ["partial", rational(1, 3)],
      [expect.stringContaining("leading-silence"), rational(11, 3)],
      [expect.stringContaining("inserted"), rational(4)],
    ]);
    expect(plan.progression.selectedStepId).toBe("partial");
    expect(plan.progression.sections).toEqual(project.progression.sections);
  });

  it("uses the exact bar capacity for a non-quarter meter", () => {
    const source = projectWith([chord(base, "seven-eight", "I", rational(7, 2))]);
    const project = Object.freeze({
      ...source,
      globalTiming: globalTiming(100, meter(7, 8, [2, 2, 3])),
    });
    const plan = expectPlan(planMeasureInsertion(project, 0));
    expect(plan.startBeats).toEqual(rational(7, 2));
    expect(plan.insertedDurationBeats).toEqual(rational(7, 2));
    expect(plan.progression.steps.map((step) => step.duration.beats)).toEqual([
      rational(7, 2),
      rational(7, 2),
    ]);
  });

  it("refuses atomically when materializing a final implicit gap would reveal a dormant authored note", () => {
    const project = projectWith([
      chord(base, "full", "I", rational(4)),
      rest("partial", rational(1, 3), {
        authoredMelody: {
          notes: [
            {
              id: "dormant-tail",
              pitch: G4,
              onset: rational(1, 3),
              duration: rational(1),
            },
          ],
        },
      }),
    ]);
    const before = project.progression;
    const result = planMeasureInsertion(project, 1);
    expect("reason" in result && result.reason).toContain(
      "cannot be inserted without changing retained effective Melody",
    );
    expect(project.progression).toBe(before);
  });

  it("round-trips the atomic restore through portable data and one Undo/Redo entry", () => {
    const project = projectWith([
      chord(base, "a", "I", rational(4)),
      chord(base, "b", "V", rational(4)),
    ]);
    const plan = expectPlan(planMeasureInsertion(project, 0));
    const store = new AppStore(project);
    store.dispatch(
      { type: "progression/restore", payload: { progression: plan.progression, nowIso: T0 } },
      restoreProgression,
    );
    expect(decodePortableProject(encodePortableProject(store.project)).progression).toEqual(
      plan.progression,
    );
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(project.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(plan.progression);
  });

  it("refuses an active temporary branch without changing the source Project", () => {
    const project = projectWith([
      chord(base, "a", "I", rational(4)),
      chord(base, "b", "V", rational(4)),
    ]);
    const branch = startBranch(project, {
      type: "branch/start",
      payload: { branchId: "active", originStepId: "a", nowIso: T0 },
    }).project;
    const before = branch.progression;
    const result = planMeasureInsertion(branch, 0);
    expect("reason" in result && result.reason).toContain("active branch");
    expect(branch.progression).toBe(before);
  });
});
