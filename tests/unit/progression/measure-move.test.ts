import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import type { ChordMelodyRecipe } from "../../../src/domain/melody/types";
import {
  planMeasureBlockMove,
  planMeasureMove,
  type MeasureMovePlan,
} from "../../../src/domain/progression/measureDeletion";
import type { ProgressionStep, RestStep } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { createProgressionMeasureLayout } from "../../../src/domain/timing/measureLayout";
import { globalTiming, meter } from "../../../src/domain/timing/meter";
import {
  addRational,
  rational,
  subtractRational,
  type Rational,
} from "../../../src/domain/timing/rational";

const T0 = "2026-10-03T00:00:00.000Z";
const G4 = exactPitch(67, { step: "G", alter: 0 });
const E4 = exactPitch(64, { step: "E", alter: 0 });
const GENERATED_RECIPE: ChordMelodyRecipe = {
  pitchMotion: "up",
  rhythm: "even",
  connection: "retrigger",
  grid: "eighth",
  octaveOffset: 0,
};
const base = createDefaultProject("measure-move", "Measure move", T0);

type ChordStep = Extract<ProgressionStep, { kind: "chord" }>;

function chord(
  id: string,
  functionId: string,
  duration: Rational,
  patch: Partial<ChordStep> = {},
): ChordStep {
  return Object.freeze({
    ...createMatrixChordStep(base, functionId, id),
    duration: musicalDuration(duration),
    ...patch,
  }) as ChordStep;
}

function rest(id: string, duration: Rational, patch: Partial<RestStep> = {}): RestStep {
  return Object.freeze<RestStep>({
    id,
    kind: "rest",
    duration: musicalDuration(duration),
    ...patch,
  });
}

function projectWith(
  steps: readonly ProgressionStep[],
  progressionPatch: Partial<Project["progression"]> = {},
): Project {
  return Object.freeze<Project>({
    ...base,
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([...steps]),
      ...progressionPatch,
    }),
  });
}

function expectPlan(value: ReturnType<typeof planMeasureMove>): MeasureMovePlan {
  if ("reason" in value) throw new Error(value.reason);
  return value;
}

function expectBlockPlan(value: ReturnType<typeof planMeasureBlockMove>): MeasureMovePlan {
  if ("reason" in value) throw new Error(value.reason);
  return value;
}

function stepShape(project: Project): readonly (readonly [string, Rational])[] {
  return project.progression.steps.map((step) => [step.id, step.duration.beats] as const);
}

function timelineShape(project: Project) {
  return createEffectiveMelodyTimeline(project)
    .map(
      (note) =>
        [note.eventKey, note.pitch.midiNumber, note.startBeats, note.durationBeats] as const,
    )
    .sort(
      (a, b) =>
        a[2].numerator * b[2].denominator - b[2].numerator * a[2].denominator ||
        a[1] - b[1] ||
        (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    );
}

describe("measure move model", () => {
  it("reorders the steps when a middle Measure moves earlier", () => {
    const project = projectWith([
      chord("a", "I", rational(4)),
      chord("b", "IV", rational(4)),
      chord("c", "V", rational(4)),
    ]);

    const plan = expectPlan(planMeasureMove(project, 1, 0));
    const after = Object.freeze({ ...project, progression: plan.progression });

    expect(plan.sourceMeasureNumber).toBe(2);
    expect(plan.targetMeasureNumber).toBe(1);
    expect(plan.movedStepIds).toEqual(["b"]);
    expect(plan.movedDurationBeats).toEqual(rational(4));
    expect(stepShape(after)).toEqual([
      ["b", rational(4)],
      ["a", rational(4)],
      ["c", rational(4)],
    ]);
    expect(plan.reanchoredStepIds.get("a")).toBe("a");
    expect(plan.reanchoredStepIds.get("b")).toBe("b");
    expect(plan.loopStartStepIds.get("b")).toBe("b");
    expect(plan.loopEndStepIds.get("b")).toBe("b");

    const layout = createProgressionMeasureLayout(
      plan.progression.steps,
      project.globalTiming.meter,
    );
    expect(layout.measures.map((measure) => measure.number)).toEqual([1, 2, 3]);
    expect(
      layout.measures.map((measure) => measure.fragments.map((fragment) => fragment.stepId)),
    ).toEqual([["b"], ["a"], ["c"]]);
  });

  it("reorders the steps when a middle Measure moves later", () => {
    const project = projectWith([
      chord("a", "I", rational(4)),
      chord("b", "IV", rational(4)),
      chord("c", "V", rational(4)),
    ]);

    const plan = expectPlan(planMeasureMove(project, 1, 3));
    const after = Object.freeze({ ...project, progression: plan.progression });

    expect(plan.sourceMeasureNumber).toBe(2);
    expect(plan.targetMeasureNumber).toBe(3);
    expect(plan.movedStepIds).toEqual(["b"]);
    expect(plan.movedDurationBeats).toEqual(rational(4));
    expect(stepShape(after)).toEqual([
      ["a", rational(4)],
      ["c", rational(4)],
      ["b", rational(4)],
    ]);
  });

  it("appends when the target is the free space after the last Measure", () => {
    const project = projectWith([
      chord("a", "I", rational(4)),
      chord("b", "IV", rational(4)),
      chord("c", "V", rational(4)),
    ]);
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );

    const plan = expectPlan(planMeasureMove(project, 0, layout.measures.length));
    const after = Object.freeze({ ...project, progression: plan.progression });

    expect(plan.sourceMeasureNumber).toBe(1);
    expect(plan.targetMeasureNumber).toBe(3);
    expect(plan.movedStepIds).toEqual(["a"]);
    expect(stepShape(after)).toEqual([
      ["b", rational(4)],
      ["c", rational(4)],
      ["a", rational(4)],
    ]);
  });

  it("refuses to move a Measure onto itself or onto the next Measure without touching the project", () => {
    const project = projectWith([
      chord("a", "I", rational(4)),
      chord("b", "IV", rational(4)),
      chord("c", "V", rational(4)),
    ]);
    const before = JSON.stringify(project);

    const ontoItself = planMeasureMove(project, 1, 1);
    const ontoNext = planMeasureMove(project, 1, 2);

    expect("reason" in ontoItself && ontoItself.reason).toContain("already at that position");
    expect("reason" in ontoNext && ontoNext.reason).toContain("already sits immediately before");
    expect(JSON.stringify(project)).toBe(before);
  });

  it("splits a Step that spans the bar boundary and still tiles the timeline exactly", () => {
    const project = projectWith([chord("wide", "I", rational(8), { transpositionSemitones: 2 })]);
    const before = Object.freeze({ ...project, progression: project.progression });
    const originalTotal = project.progression.steps.reduce(
      (total, step) => addRational(total, step.duration.beats),
      rational(0),
    );

    const plan = expectPlan(planMeasureMove(project, 1, 0));
    const after = Object.freeze({ ...project, progression: plan.progression });

    // The two halves swap places but keep their ids: the original id stays on the earliest piece.
    expect(stepShape(after)).toEqual([
      ["wide", rational(4)],
      ["wide~measure-2-right", rational(4)],
    ]);
    expect(plan.movedStepIds).toEqual(["wide"]);

    // Exact tiling: no gaps, no overlaps, and the same total authored duration.
    let cursor = rational(0);
    for (const step of plan.progression.steps) {
      expect(step.duration.beats.numerator).toBeGreaterThan(0);
      cursor = addRational(cursor, step.duration.beats);
    }
    expect(cursor).toEqual(originalTotal);
    const ids = plan.progression.steps.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);

    // The two halves trade places, so the audible timeline content is untouched.
    expect(timelineShape(after)).toEqual(timelineShape(before));
  });

  it("keeps an authored Melody phrase inside the moved Measure", () => {
    const phrase = Object.freeze({
      notes: Object.freeze([
        Object.freeze({ id: "n1", pitch: G4, onset: rational(0), duration: rational(2) }),
        Object.freeze({ id: "n2", pitch: E4, onset: rational(2), duration: rational(2) }),
      ]),
    });
    const project = projectWith([
      chord("a", "I", rational(4)),
      chord("b", "IV", rational(4), { melody: { mode: "authored" as const, phrase } }),
      chord("c", "V", rational(4)),
    ]);
    const before = Object.freeze({ ...project, progression: project.progression });
    const beforeNotes = timelineShape(before);
    expect(beforeNotes.map((note) => [note[0], note[1]])).toEqual([
      ["n1", 67],
      ["n2", 64],
    ]);

    const plan = expectPlan(planMeasureMove(project, 1, 0));
    const after = Object.freeze({ ...project, progression: plan.progression });
    const afterNotes = timelineShape(after);

    // Same notes and durations; the phrase now sits one bar earlier because its Measure leads.
    expect(
      afterNotes
        .map((note) => [note[0], note[1], note[3]])
        .sort(([leftId], [rightId]) => String(leftId).localeCompare(String(rightId))),
    ).toEqual(
      beforeNotes
        .map((note) => [note[0], note[1], note[3]])
        .sort(([leftId], [rightId]) => String(leftId).localeCompare(String(rightId))),
    );
    expect(beforeNotes.map((note) => note[2])).toEqual([rational(4), rational(6)]);
    expect(afterNotes.map((note) => note[2])).toEqual([rational(0), rational(2)]);
    expect(createEffectiveMelodyTimeline(after).map((note) => note.sourceStepId)).toEqual([
      "b",
      "b",
    ]);
  });

  it("keeps a Song Section anchored to the moved Step", () => {
    const project = projectWith(
      [chord("a", "I", rational(4)), chord("b", "IV", rational(4)), chord("c", "V", rational(4))],
      {
        selectedStepId: "b",
        sections: [{ id: "verse", name: "Verse", startStepId: "b" }],
        loopRegion: { startStepId: "b", endStepId: "b" },
      },
    );

    const plan = expectPlan(planMeasureMove(project, 1, 0));

    expect(plan.progression.sections).toEqual([{ id: "verse", name: "Verse", startStepId: "b" }]);
    expect(plan.progression.selectedStepId).toBe("b");
    expect(plan.progression.loopRegion).toEqual({ startStepId: "b", endStepId: "b" });

    const unselected = projectWith(
      [chord("a", "I", rational(4)), chord("b", "IV", rational(4)), chord("c", "V", rational(4))],
      { sections: [{ id: "verse", name: "Verse", startStepId: "b" }] },
    );
    const moved = expectPlan(planMeasureMove(unselected, 1, 3));
    expect(moved.progression.sections).toEqual([{ id: "verse", name: "Verse", startStepId: "b" }]);
    expect(moved.progression.steps.map((step) => step.id)).toEqual(["a", "c", "b"]);
  });

  it("refuses a partial final Measure with a reason", () => {
    const project = projectWith([
      chord("a", "I", rational(4)),
      chord("b", "IV", rational(4)),
      rest("partial", rational(3)),
    ]);
    const before = JSON.stringify(project);
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );
    expect(layout.measures).toHaveLength(3);

    const result = planMeasureMove(project, 2, 0);

    expect("reason" in result && result.reason).toContain("does not cover one exact bar");
    expect(JSON.stringify(project)).toBe(before);
  });

  it("refuses out-of-range indices and an active temporary branch", () => {
    const project = projectWith([chord("a", "I", rational(4)), chord("b", "IV", rational(4))]);

    expect(planMeasureMove(project, -1, 0)).toHaveProperty("reason");
    expect(planMeasureMove(project, 2, 0)).toHaveProperty("reason");
    expect(planMeasureMove(project, 0, 3)).toHaveProperty("reason");
    expect(planMeasureMove(project, 0.5, 1)).toHaveProperty("reason");
    expect(planMeasureMove(project, 0, 1.5)).toHaveProperty("reason");

    const branch = {
      ...project,
      temporaryBranch: { branchId: "active", originStepId: "a" },
    } as unknown as Project;
    const result = planMeasureMove(branch, 0, 2);
    expect("reason" in result && result.reason).toContain("active branch");
  });

  it("is pure", () => {
    const project = projectWith(
      [
        chord("a", "I", rational(4)),
        chord("b", "IV", rational(4), {
          melody: { mode: "generated" as const, recipe: GENERATED_RECIPE },
        }),
        chord("c", "V", rational(4)),
      ],
      { selectedStepId: "c", sections: [{ id: "s", name: "S", startStepId: "b" }] },
    );
    const before = JSON.stringify(project);

    const plan = expectPlan(planMeasureMove(project, 2, 0));

    expect(JSON.stringify(project)).toBe(before);
    expect(plan.progression.steps.map((step) => step.id)).toEqual(["c", "a", "b"]);
  });

  it("uses the exact bar length of a non-quarter meter", () => {
    const bar = rational(7, 2);
    const project: Project = Object.freeze<Project>({
      ...projectWith([chord("a", "I", bar), chord("b", "IV", bar), chord("c", "V", bar)]),
      globalTiming: globalTiming(100, meter(7, 8, [2, 2, 3])),
    });

    const plan = expectPlan(planMeasureMove(project, 0, 3));
    const after = Object.freeze({ ...project, progression: plan.progression });

    expect(plan.movedDurationBeats).toEqual(bar);
    expect(stepShape(after)).toEqual([
      ["b", bar],
      ["c", bar],
      ["a", bar],
    ]);
  });

  it("moves a multi-Measure block across Step boundaries and preserves authored Melody", () => {
    const authoredA = Object.freeze({
      mode: "authored" as const,
      phrase: Object.freeze({
        notes: Object.freeze([
          Object.freeze({ id: "a-before", pitch: G4, onset: rational(1), duration: rational(1) }),
          Object.freeze({ id: "a-in-block", pitch: E4, onset: rational(5), duration: rational(1) }),
        ]),
      }),
    });
    const authoredB = Object.freeze({
      mode: "authored" as const,
      phrase: Object.freeze({
        notes: Object.freeze([
          Object.freeze({ id: "b-in-block", pitch: G4, onset: rational(1), duration: rational(1) }),
        ]),
      }),
    });
    const project = projectWith(
      [
        chord("a", "I", rational(6), { melody: authoredA }),
        chord("b", "IV", rational(7), { melody: authoredB }),
        chord("c", "V", rational(7)),
      ],
      {
        selectedStepId: "b",
        sections: [{ id: "section-b", name: "Section B", startStepId: "b" }],
        loopRegion: { startStepId: "a", endStepId: "b" },
      },
    );
    const before = Object.freeze({ ...project, progression: project.progression });
    const beforeNotes = timelineShape(before);

    const plan = expectBlockPlan(planMeasureBlockMove(project, 1, 2, 0));
    const after = Object.freeze({ ...project, progression: plan.progression });
    const afterNotes = timelineShape(after);

    expect(plan.sourceMeasureNumber).toBe(2);
    expect(plan.targetMeasureNumber).toBe(1);
    expect(plan.movedDurationBeats).toEqual(rational(8));
    expect(plan.progression.steps.map((step) => step.id)).toEqual([
      "a",
      "b",
      expect.stringMatching(/^a~measure-2-right/),
      expect.stringMatching(/^b~measure-2-right/),
      "c",
    ]);
    expect(plan.progression.selectedStepId).toBe("b");
    expect(plan.progression.sections).toEqual([
      { id: "section-b", name: "Section B", startStepId: "b" },
    ]);
    expect(plan.progression.loopRegion).toEqual({
      startStepId: "a",
      endStepId: expect.stringMatching(/^b~measure-2-right/),
    });
    expect(
      afterNotes
        .map((note) => [note[0], note[1], note[3]])
        .sort(([leftId], [rightId]) => String(leftId).localeCompare(String(rightId))),
    ).toEqual(
      beforeNotes
        .map((note) => [note[0], note[1], note[3]])
        .sort(([leftId], [rightId]) => String(leftId).localeCompare(String(rightId))),
    );
    expect(afterNotes.map((note) => [note[1], note[2]])).toEqual([
      [64, rational(1)],
      [67, rational(3)],
      [67, rational(9)],
    ]);
    expect(new Set(plan.progression.steps.map((step) => step.id)).size).toBe(
      plan.progression.steps.length,
    );
  });

  it("pads only System moves that touch or append after a partial final Measure", () => {
    const project = projectWith([
      chord("a", "I", rational(4), {
        melody: {
          mode: "authored" as const,
          phrase: {
            notes: [{ id: "n1", pitch: G4, onset: rational(1), duration: rational(1) }],
          },
        },
      }),
      chord("b", "IV", rational(4)),
      chord("c", "V", rational(2)),
    ]);
    const original = JSON.stringify(project);
    const originalTimeline = timelineShape(project);
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );
    expect(layout.measures.at(-1)?.trailingGap?.durationBeats).toEqual(rational(2));

    const moveFinalEarlier = expectBlockPlan(
      planMeasureBlockMove(project, 2, 1, 0, { padPartialFinalMeasure: true }),
    );
    const earlierRest = moveFinalEarlier.progression.steps.find(
      (step) => step.kind === "rest" && step.id.startsWith("system-move-padding-"),
    );
    expect(earlierRest?.duration.beats).toEqual(rational(2));
    expect(moveFinalEarlier.progression.steps.map((step) => step.id)).toEqual([
      "c",
      earlierRest!.id,
      "a",
      "b",
    ]);
    expect(
      timelineShape(Object.freeze({ ...project, progression: moveFinalEarlier.progression })),
    ).toEqual(
      originalTimeline.map(([id, pitch, start, duration]) => [
        id,
        pitch,
        addRational(start, rational(4)),
        duration,
      ]),
    );

    const appendEarlierBlock = expectBlockPlan(
      planMeasureBlockMove(project, 0, 1, 3, { padPartialFinalMeasure: true }),
    );
    const appendRest = appendEarlierBlock.progression.steps.find(
      (step) => step.kind === "rest" && step.id.startsWith("system-move-padding-"),
    );
    expect(appendEarlierBlock.progression.steps.map((step) => step.id)).toEqual([
      "b",
      "c",
      appendRest!.id,
      "a",
    ]);
    expect(appendEarlierBlock.movedDurationBeats).toEqual(rational(4));
    expect(
      timelineShape(Object.freeze({ ...project, progression: appendEarlierBlock.progression })),
    ).toEqual(
      originalTimeline.map(([id, pitch, start, duration]) => [
        id,
        pitch,
        id === "n1" ? addRational(start, rational(8)) : start,
        duration,
      ]),
    );
    expect(JSON.stringify(project)).toBe(original);
    expect("reason" in planMeasureMove(project, 2, 0)).toBe(true);
  });

  it("does not activate dormant Melody while padding a partial final System", () => {
    const project = projectWith([
      chord("a", "I", rational(4)),
      chord("b", "IV", rational(4)),
      chord("c", "V", rational(2), {
        melody: {
          mode: "authored" as const,
          phrase: {
            notes: [
              { id: "active", pitch: G4, onset: rational(1), duration: rational(1) },
              { id: "dormant", pitch: E4, onset: rational(3), duration: rational(1) },
            ],
          },
        },
      }),
    ]);
    const before = timelineShape(project);
    expect(before.map(([id]) => id)).toEqual(["active"]);

    const plan = expectBlockPlan(
      planMeasureBlockMove(project, 2, 1, 0, { padPartialFinalMeasure: true }),
    );
    const after = timelineShape(Object.freeze({ ...project, progression: plan.progression }));

    expect(after.map(([id]) => id)).toEqual(["active"]);
    expect(after.map(([id, pitch, start, duration]) => [id, pitch, start, duration])).toEqual(
      before.map(([id, pitch, start, duration]) => [
        id,
        pitch,
        subtractRational(start, rational(8)),
        duration,
      ]),
    );
  });
});
