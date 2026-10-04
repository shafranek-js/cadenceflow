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
  planMeasureDeletion,
  type MeasureDeletionPlan,
} from "../../../src/domain/progression/measureDeletion";
import { musicalDuration } from "../../../src/domain/timing/duration";
import {
  createProgressionMeasureLayout,
  resolveExactMeasureStepRange,
} from "../../../src/domain/timing/measureLayout";
import {
  addRational,
  compareRational,
  subtractRational,
  rational,
  ZERO,
} from "../../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import { startBranch } from "../../../src/app/commands/branchCommands";

const T0 = "2026-10-02T00:00:00.000Z";
const E4 = exactPitch(64, { step: "E", alter: 0 });
const C4 = exactPitch(60, { step: "C", alter: 0 });
const G4 = exactPitch(67, { step: "G", alter: 0 });
const base = createDefaultProject("measure-delete", "Measure delete", T0);

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
  projectPatch: Partial<Project> = {},
): Project {
  return Object.freeze({
    ...base,
    ...projectPatch,
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([...steps]),
      ...progressionPatch,
    }),
  });
}

function expectPlan(value: ReturnType<typeof planMeasureDeletion>): MeasureDeletionPlan {
  if ("reason" in value) throw new Error(value.reason);
  return value;
}

function expectedTimelineAfterDeletion(
  before: ReturnType<typeof createEffectiveMelodyTimeline>,
  plan: MeasureDeletionPlan,
): readonly unknown[] {
  const deleteEnd = addRational(plan.startBeats, plan.removedDurationBeats);
  const progressionEnd = plan.progression.steps.reduce(
    (cursor, step) => addRational(cursor, step.duration.beats),
    ZERO,
  );
  const starts = new Map<string, ReturnType<typeof rational>>();
  let cursor = ZERO;
  for (const step of plan.progression.steps) {
    starts.set(step.id, cursor);
    cursor = addRational(cursor, step.duration.beats);
  }
  const out: {
    sourceStepId: string;
    eventKey: string;
    pitch: (typeof before)[number]["pitch"];
    startBeats: ReturnType<typeof rational>;
    durationBeats: ReturnType<typeof rational>;
    instrument: (typeof before)[number]["instrument"];
  }[] = [];
  for (const note of before) {
    const end = addRational(note.startBeats, note.durationBeats);
    const segments: {
      start: ReturnType<typeof rational>;
      end: ReturnType<typeof rational>;
      suffix: boolean;
    }[] = [];
    const beforeEnd = compareRational(end, plan.startBeats) < 0 ? end : plan.startBeats;
    if (
      compareRational(note.startBeats, plan.startBeats) < 0 &&
      compareRational(beforeEnd, note.startBeats) > 0
    )
      segments.push({ start: note.startBeats, end: beforeEnd, suffix: false });
    const afterStart =
      compareRational(note.startBeats, deleteEnd) > 0 ? note.startBeats : deleteEnd;
    if (compareRational(end, deleteEnd) > 0 && compareRational(end, afterStart) > 0)
      segments.push({
        start: subtractRational(afterStart, plan.removedDurationBeats),
        end: subtractRational(end, plan.removedDurationBeats),
        suffix: segments.length > 0,
      });
    for (const segment of segments) {
      if (compareRational(segment.start, progressionEnd) >= 0) continue;
      const owner = plan.progression.steps.find((step) => {
        const ownerStart = starts.get(step.id)!;
        const ownerEnd = addRational(ownerStart, step.duration.beats);
        return (
          compareRational(segment.start, ownerStart) >= 0 &&
          compareRational(segment.start, ownerEnd) < 0
        );
      });
      if (!owner)
        throw new Error(
          `No owner for expected note at ${segment.start.numerator}/${segment.start.denominator}`,
        );
      const visibleEnd =
        compareRational(segment.end, progressionEnd) > 0 ? progressionEnd : segment.end;
      out.push({
        sourceStepId: owner.id,
        eventKey: segment.suffix
          ? `${note.eventKey}~measure-${plan.measureNumber}-after`
          : note.eventKey,
        pitch: note.pitch,
        startBeats: segment.start,
        durationBeats: subtractRational(visibleEnd, segment.start),
        instrument: note.instrument,
      });
    }
  }
  return out.sort(
    (a, b) =>
      compareRational(a.startBeats, b.startBeats) ||
      a.pitch.midiNumber - b.pitch.midiNumber ||
      (a.sourceStepId < b.sourceStepId ? -1 : a.sourceStepId > b.sourceStepId ? 1 : 0) ||
      (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0),
  );
}

function actualTimeline(project: Project): readonly unknown[] {
  return createEffectiveMelodyTimeline(project)
    .map((note) => ({
      sourceStepId: note.sourceStepId,
      eventKey: note.eventKey,
      pitch: note.pitch,
      startBeats: note.startBeats,
      durationBeats: note.durationBeats,
      instrument: note.instrument,
    }))
    .sort(
      (a, b) =>
        compareRational(a.startBeats, b.startBeats) ||
        a.pitch.midiNumber - b.pitch.midiNumber ||
        (a.sourceStepId < b.sourceStepId ? -1 : a.sourceStepId > b.sourceStepId ? 1 : 0) ||
        (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0),
    );
}

describe("T215 measure deletion model", () => {
  it("moves a crossing authored note between differently transposed owners in concert pitch", () => {
    const source = chord(base, "source", "I", rational(4), {
      transpositionSemitones: 2,
      melody: {
        mode: "authored",
        phrase: {
          notes: [{ id: "crossing-shifted", pitch: G4, sourcePitchMidi: 65, onset: rational(1), duration: rational(6) }],
        },
      },
    });
    const destination = chord(base, "destination", "V", rational(4), {
      transpositionSemitones: -2,
    });
    const project = projectWith([source, destination]);
    const before = createEffectiveMelodyTimeline(project);
    const plan = expectPlan(planMeasureDeletion(project, 0));
    const after = Object.freeze({ ...project, progression: plan.progression });

    expect(actualTimeline(after)).toEqual(expectedTimelineAfterDeletion(before, plan));
    const owner = plan.progression.steps.find((step) => step.id === "destination");
    expect(owner?.kind).toBe("chord");
    if (owner?.kind !== "chord" || owner.melody?.mode !== "authored") throw new Error("Expected a materialized destination chord");
    const transferred = owner.melody.phrase.notes.find((note) => note.id === "crossing-shifted");
    expect(transferred).toMatchObject({ pitch: { midiNumber: 71 }, sourcePitchMidi: 65 });
    expect(createEffectiveMelodyTimeline(after)[0]?.pitch.midiNumber).toBe(69);
  });

  it("removes one exact middle bar across several Steps and restores progression, sections and loop by one Undo", () => {
    const project = projectWith(
      [
        chord(base, "a", "I", rational(3)),
        chord(base, "b", "IV", rational(3)),
        chord(base, "c", "V", rational(3)),
        chord(base, "d", "I", rational(2)),
      ],
      {
        selectedStepId: "c",
        sections: [
          { id: "b-boundary", name: "Verse", startStepId: "b" },
          { id: "c-boundary", name: "Chorus", startStepId: "c" },
        ],
        loopRegion: { startStepId: "b", endStepId: "d" },
      },
    );
    const plan = expectPlan(planMeasureDeletion(project, 1));
    expect(plan.startBeats).toEqual(rational(4));
    expect(plan.removedDurationBeats).toEqual(rational(4));
    expect(plan.progression.steps.map((step) => [step.id, step.duration.beats])).toEqual([
      ["a", rational(3)],
      ["b", rational(1)],
      ["c", rational(1)],
      ["d", rational(2)],
    ]);
    expect(plan.progression.selectedStepId).toBe("c");
    expect(plan.progression.sections).toEqual([
      { id: "b-boundary", name: "Verse", startStepId: "b" },
      { id: "c-boundary", name: "Chorus", startStepId: "c" },
    ]);
    expect(plan.progression.loopRegion).toEqual({ startStepId: "b", endStepId: "d" });
    expect(
      plan.progression.steps.reduce((sum, step) => addRational(sum, step.duration.beats), ZERO),
    ).toEqual(rational(7));

    const store = new AppStore(project);
    store.dispatch(
      {
        type: "progression/restore",
        payload: { progression: plan.progression, nowIso: T0 },
      },
      restoreProgression,
    );
    expect(store.history.undoDepth).toBe(1);
    expect(store.project.progression).toEqual(plan.progression);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(project.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(plan.progression);
  });

  it("splits authored crossing notes, reassigns each suffix by onset, scopes duplicate IDs by owner and preserves stored tails", () => {
    const a = chord(base, "a", "I", rational(4), {
      melodyInstrumentOverride: "flute",
      melody: {
        mode: "authored",
        phrase: {
          notes: [
            { id: "same", pitch: E4, onset: rational(3), duration: rational(7) },
            { id: "long-tail", pitch: G4, onset: rational(1), duration: rational(20) },
          ],
        },
      },
    });
    const b = rest("b", rational(4), {
      melodyInstrumentOverride: "flute",
      authoredMelody: {
        notes: [{ id: "rest-tail", pitch: C4, onset: rational(1), duration: rational(4) }],
      },
    });
    const c = chord(base, "c", "V", rational(4), {
      melody: {
        mode: "authored",
        phrase: {
          notes: [
            { id: "same", pitch: C4, onset: rational(1), duration: rational(1) },
            { id: "untouched-tail", pitch: G4, onset: rational(2), duration: rational(20) },
          ],
        },
      },
    });
    const project = projectWith([a, b, c]);
    const before = createEffectiveMelodyTimeline(project);
    const plan = expectPlan(planMeasureDeletion(project, 1));
    const afterProject = Object.freeze({ ...project, progression: plan.progression });
    expect(actualTimeline(afterProject)).toEqual(expectedTimelineAfterDeletion(before, plan));

    const nextA = plan.progression.steps.find((step) => step.id === "a");
    const nextC = plan.progression.steps.find((step) => step.id === "c");
    expect(nextA?.kind).toBe("chord");
    expect(nextC?.kind).toBe("chord");
    if (nextA?.kind !== "chord" || nextC?.kind !== "chord")
      throw new Error("Expected chord owners");
    expect(nextA.melody?.mode).toBe("authored");
    expect(nextA.melody?.mode === "authored" ? nextA.melody.phrase.notes : []).toContainEqual({
      id: "long-tail",
      pitch: G4,
      onset: rational(1),
      duration: rational(3),
    });
    expect(nextC.melody?.mode).toBe("authored");
    const cNotes = nextC.melody?.mode === "authored" ? nextC.melody.phrase.notes : [];
    expect(cNotes).toContainEqual({
      id: "long-tail~measure-2-after",
      pitch: G4,
      onset: rational(0),
      duration: rational(13),
    });
    expect(cNotes).toContainEqual({
      id: "untouched-tail",
      pitch: G4,
      onset: rational(2),
      duration: rational(20),
    });
    expect(cNotes.some((note) => note.id === "same")).toBe(true);
    expect(cNotes.some((note) => note.id === "same~measure-2-after")).toBe(true);

    const store = new AppStore(project);
    store.dispatch(
      { type: "progression/restore", payload: { progression: plan.progression, nowIso: T0 } },
      restoreProgression,
    );
    const decoded = decodePortableProject(encodePortableProject(store.project));
    const decodedC = decoded.progression.steps.find((step) => step.id === "c");
    expect(decodedC).toEqual(nextC);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(project.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(plan.progression);
  });

  it("materializes a generated owner when deleting its next chord changes target context while keeping later unaffected generation", () => {
    const targetRecipe = {
      pitchMotion: "up" as const,
      rhythm: "even" as const,
      connection: "retrigger" as const,
      grid: "quarter" as const,
      octaveOffset: 0 as const,
      targetNextPitchClass: 2,
    };
    const stableRecipe = { ...targetRecipe, targetNextPitchClass: undefined };
    const a = chord(base, "a", "I", rational(4), {
      melody: { mode: "generated", recipe: targetRecipe },
    });
    const b = chord(base, "b", "V", rational(4));
    const c = chord(base, "c", "I", rational(4), {
      melody: { mode: "generated", recipe: stableRecipe },
    });
    const d = chord(base, "d", "IV", rational(4));
    const project = projectWith([a, b, c, d]);
    const before = createEffectiveMelodyTimeline(project);
    const plan = expectPlan(planMeasureDeletion(project, 1));
    const after = Object.freeze({ ...project, progression: plan.progression });
    expect(actualTimeline(after)).toEqual(expectedTimelineAfterDeletion(before, plan));

    const nextA = plan.progression.steps.find((step) => step.id === "a");
    const nextC = plan.progression.steps.find((step) => step.id === "c");
    expect(nextA?.kind).toBe("chord");
    expect(nextC?.kind).toBe("chord");
    if (nextA?.kind !== "chord" || nextC?.kind !== "chord")
      throw new Error("Expected chord owners");
    expect(nextA.melody?.mode).toBe("authored");
    expect(nextA.melody?.mode === "authored" ? nextA.melody.sourceRecipe : undefined).toEqual(
      targetRecipe,
    );
    expect(nextC.melody?.mode).toBe("generated");
    const oldC = before.filter((note) => note.sourceStepId === "c");
    const newC = createEffectiveMelodyTimeline(after).filter((note) => note.sourceStepId === "c");
    expect(newC).toHaveLength(oldC.length);
    expect(
      newC.map((note) => [note.eventKey, note.pitch, note.startBeats, note.durationBeats]),
    ).toEqual(
      oldC.map((note) => [
        note.eventKey,
        note.pitch,
        subtractRational(note.startBeats, rational(4)),
        note.durationBeats,
      ]),
    );
  });

  it("reanchors boundaries and selection after a deleted owner and keeps an ordered single-Step loop", () => {
    const project = projectWith(
      [
        chord(base, "a", "I", rational(4)),
        chord(base, "b", "V", rational(4)),
        chord(base, "c", "I", rational(4)),
      ],
      {
        selectedStepId: "b",
        sections: [{ id: "boundary", name: "Bridge", startStepId: "b" }],
        loopRegion: { startStepId: "b", endStepId: "c" },
      },
    );
    const plan = expectPlan(planMeasureDeletion(project, 1));
    expect(plan.progression.steps.map((step) => step.id)).toEqual(["a", "c"]);
    expect(plan.progression.selectedStepId).toBe("c");
    expect(plan.progression.sections).toEqual([
      { id: "boundary", name: "Bridge", startStepId: "c" },
    ]);
    expect(plan.progression.loopRegion).toEqual({ startStepId: "c", endStepId: "c" });
  });

  it("deletes only the authored length of a partial final Measure and permits an empty progression", () => {
    const partial = projectWith(
      [chord(base, "full", "I", rational(4)), rest("partial", rational(1, 3))],
      {
        selectedStepId: "partial",
        sections: [{ id: "last", name: "Last", startStepId: "partial" }],
      },
    );
    const partialPlan = expectPlan(planMeasureDeletion(partial, 1));
    expect(partialPlan.removedDurationBeats).toEqual(rational(1, 3));
    expect(partialPlan.progression.steps.map((step) => [step.id, step.duration.beats])).toEqual([
      ["full", rational(4)],
    ]);
    expect(partialPlan.progression.selectedStepId).toBe("full");
    expect(partialPlan.progression.sections).toEqual([
      { id: "last", name: "Last", startStepId: "full" },
    ]);

    const onlyMeasure = projectWith([chord(base, "only", "I", rational(4))], {
      selectedStepId: "only",
      sections: [{ id: "only-section", name: "Only", startStepId: "only" }],
      loopRegion: { startStepId: "only", endStepId: "only" },
    });
    const emptyPlan = expectPlan(planMeasureDeletion(onlyMeasure, 0));
    expect(emptyPlan.progression.steps).toEqual([]);
    expect(emptyPlan.progression.selectedStepId).toBeUndefined();
    expect(emptyPlan.progression.sections).toEqual([]);
    expect(emptyPlan.progression.loopRegion).toBeUndefined();
    expect(
      createProgressionMeasureLayout(emptyPlan.progression.steps, onlyMeasure.globalTiming.meter)
        .measures,
    ).toEqual([]);
  });

  it("only exposes Step-scoped loops when both exact Measure boundaries align", () => {
    const aligned = [chord(base, "a", "I", rational(4)), chord(base, "b", "V", rational(4))];
    expect(resolveExactMeasureStepRange(aligned, base.globalTiming.meter, 0)).toEqual({
      startStepId: "a",
      endStepId: "a",
    });
    expect(resolveExactMeasureStepRange(aligned, base.globalTiming.meter, 1)).toEqual({
      startStepId: "b",
      endStepId: "b",
    });

    const crossing = [
      chord(base, "crossing", "I", rational(8)),
      chord(base, "after", "V", rational(4)),
    ];
    expect(resolveExactMeasureStepRange(crossing, base.globalTiming.meter, 0)).toBeNull();
    expect(resolveExactMeasureStepRange(crossing, base.globalTiming.meter, 1)).toBeNull();
    expect(resolveExactMeasureStepRange(crossing, base.globalTiming.meter, 2)).toEqual({
      startStepId: "after",
      endStepId: "after",
    });
  });

  it("refuses only a demonstrated mixed-instrument merge and explains active branch anchors", () => {
    const violin = chord(base, "a", "I", rational(4), {
      melodyInstrumentOverride: "violin",
      melody: {
        mode: "authored",
        phrase: {
          notes: [{ id: "violin-tail", pitch: E4, onset: rational(3), duration: rational(6) }],
        },
      },
    });
    const flute = rest("b", rational(4), {
      melodyInstrumentOverride: "flute",
      authoredMelody: {
        notes: [{ id: "flute-tail", pitch: C4, onset: rational(1), duration: rational(4) }],
      },
    });
    const destination = chord(base, "c", "V", rational(4));
    const conflicting = projectWith([violin, flute, destination]);
    const refused = planMeasureDeletion(conflicting, 1);
    expect("reason" in refused && refused.reason).toContain("one Step");
    expect(conflicting.progression.steps).toEqual([violin, flute, destination]);

    const branchProject = projectWith([
      chord(base, "a", "I", rational(4)),
      chord(base, "b", "V", rational(4)),
      chord(base, "c", "I", rational(4)),
    ]);
    const branch = startBranch(branchProject, {
      type: "branch/start",
      payload: { branchId: "active", originStepId: "a", nowIso: T0 },
    }).project;
    const branchRefusal = planMeasureDeletion(branch, 1);
    expect("reason" in branchRefusal && branchRefusal.reason).toContain("active branch");
  });
});
