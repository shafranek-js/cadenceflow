import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { restoreProgression } from "../../../src/app/commands/progressionCommands";
import { startBranch } from "../../../src/app/commands/branchCommands";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import type { Project } from "../../../src/domain/project/project";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { ProgressionStep, RestStep } from "../../../src/domain/progression/step";
import {
  planMeasureDuplication,
  type MeasureDuplicationPlan,
} from "../../../src/domain/progression/measureDeletion";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { addRational, rational } from "../../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

const T0 = "2026-10-04T00:00:00.000Z";
const G4 = exactPitch(67, { step: "G", alter: 0 });
const E4 = exactPitch(64, { step: "E", alter: 0 });
const base = createDefaultProject("duplicate-measure", "Duplicate Measure", T0);

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

function expectPlan(value: ReturnType<typeof planMeasureDuplication>): MeasureDuplicationPlan {
  if ("reason" in value) throw new Error(value.reason);
  return value;
}

function phraseNotes(step: ProgressionStep) {
  return step.kind === "rest"
    ? (step.authoredMelody?.notes ?? [])
    : step.melody?.mode === "authored"
      ? step.melody.phrase.notes
      : [];
}

describe("T217 Duplicate Measure model", () => {
  it("copies a middle Measure's chord and Rest Melody to the end with exact timing and one history entry", () => {
    const before = chord(base, "before", "I", rational(4));
    const sourceChord = chord(base, "source-chord", "V", rational(2), {
      transpositionSemitones: 2,
      melodyInstrumentOverride: "flute",
      melody: {
        mode: "authored",
        phrase: {
          notes: [
            {
              id: "cross-bar-note",
              pitch: G4,
              sourcePitchMidi: 65,
              onset: rational(1),
              duration: rational(3),
            },
          ],
        },
      },
    });
    const sourceRest = rest("source-rest", rational(2), {
      authoredMelody: {
        notes: [{ id: "rest-note", pitch: E4, onset: rational(1, 2), duration: rational(1, 2) }],
      },
    });
    const last = chord(base, "last", "I", rational(4));
    const project = projectWith([before, sourceChord, sourceRest, last], {
      selectedStepId: last.id,
      sections: Object.freeze([{ id: "verse", name: "Verse", startStepId: sourceChord.id }]),
      loopRegion: Object.freeze({ startStepId: before.id, endStepId: last.id }),
    });
    const originalTimeline = createEffectiveMelodyTimeline(project);
    const plan = expectPlan(planMeasureDuplication(project, 1));

    expect(plan.sourceMeasureNumber).toBe(2);
    expect(plan.duplicateMeasureNumber).toBe(4);
    expect(plan.startBeats).toEqual(rational(12));
    expect(plan.duplicatedDurationBeats).toEqual(rational(4));
    expect(plan.duplicatedStepIds).toHaveLength(2);
    expect(plan.progression.steps.slice(0, 4)).toEqual(project.progression.steps);
    expect(
      plan.progression.steps
        .slice(0, 4)
        .every((step, index) => step === project.progression.steps[index]),
    ).toBe(true);
    expect(plan.progression.selectedStepId).toBe(plan.duplicatedStepIds[0]);
    expect(plan.progression.sections).toEqual(project.progression.sections);
    expect(plan.progression.loopRegion).toEqual(project.progression.loopRegion);

    const [copiedChord, copiedRest] = plan.progression.steps.slice(-2);
    expect(copiedChord?.kind).toBe("chord");
    expect(copiedRest?.kind).toBe("rest");
    if (copiedChord?.kind !== "chord" || copiedRest?.kind !== "rest")
      throw new Error("The middle Measure did not preserve its chord and Rest fragments");
    expect(copiedChord.transpositionSemitones).toBe(2);
    expect(copiedChord.melodyInstrumentOverride).toBe("flute");
    expect(copiedChord.performance).toEqual(sourceChord.performance);
    expect(phraseNotes(copiedChord)).toHaveLength(1);
    expect(phraseNotes(copiedChord)[0]?.id).not.toBe("cross-bar-note");
    expect(phraseNotes(copiedChord)[0]?.pitch).toEqual(G4);
    expect(phraseNotes(copiedChord)[0]?.sourcePitchMidi).toBe(65);
    expect(phraseNotes(copiedChord)[0]?.onset).toEqual(rational(1));
    expect(phraseNotes(copiedChord)[0]?.duration).toEqual(rational(3));
    expect(phraseNotes(copiedRest)).toHaveLength(1);

    const copiedTimeline = createEffectiveMelodyTimeline({
      ...project,
      progression: plan.progression,
    }).filter((note) => plan.duplicatedStepIds.includes(note.sourceStepId));
    expect(
      copiedTimeline.map((note) => [
        note.sourceStepId,
        note.pitch.midiNumber,
        note.startBeats,
        note.durationBeats,
        note.instrument,
      ]),
    ).toEqual([
      [copiedChord.id, G4.midiNumber + 2, rational(13), rational(3), "flute"],
      [copiedRest.id, E4.midiNumber, rational(29, 2), rational(1, 2), base.melodyTrack.instrument],
    ]);
    expect(copiedTimeline[0]?.pitch).toEqual(
      originalTimeline.find((note) => note.sourceStepId === sourceChord.id)?.pitch,
    );
    expect(createEffectiveMelodyTimeline(project)).toEqual(originalTimeline);

    const store = new AppStore(project);
    store.dispatch(
      { type: "progression/restore", payload: { progression: plan.progression, nowIso: T0 } },
      restoreProgression,
    );
    const portable = decodePortableProject(encodePortableProject(store.project));
    expect(portable.progression).toEqual(plan.progression);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(project.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(plan.progression);

    const second = expectPlan(
      planMeasureDuplication({ ...project, progression: plan.progression }, 3),
    );
    const allSteps = second.progression.steps;
    const allStepIds = allSteps.map((step) => step.id);
    expect(new Set(allStepIds).size).toBe(allStepIds.length);
    const allNoteIds = allSteps.flatMap(phraseNotes).map((note) => note.id);
    expect(new Set(allNoteIds).size).toBe(allNoteIds.length);
  });

  it("pads both the old partial tail and a partial source Measure with explicit Rest Steps", () => {
    const source = rest("partial-source", rational(2), {
      authoredMelody: {
        notes: [{ id: "partial-note", pitch: E4, onset: rational(0), duration: rational(2) }],
      },
    });
    const project = projectWith([chord(base, "full", "I", rational(4)), source]);
    const plan = expectPlan(planMeasureDuplication(project, 1));

    expect(plan.duplicateMeasureNumber).toBe(3);
    expect(plan.startBeats).toEqual(rational(8));
    expect(plan.progression.steps.map((step) => step.duration.beats)).toEqual([
      rational(4),
      rational(2),
      rational(2),
      rational(2),
      rational(2),
    ]);
    expect(plan.progression.steps[2]?.kind).toBe("rest");
    expect(plan.progression.steps[3]?.kind).toBe("rest");
    expect(plan.progression.steps[4]?.kind).toBe("rest");
    const duplicatedNote = createEffectiveMelodyTimeline({
      ...project,
      progression: plan.progression,
    }).find((note) => note.sourceStepId === plan.duplicatedStepIds[0]);
    expect(duplicatedNote?.startBeats).toEqual(rational(8));
    expect(duplicatedNote?.durationBeats).toEqual(rational(2));
  });

  it("refuses to activate dormant Melody when padding a partial final bar", () => {
    const dormant = rest("partial-source", rational(2), {
      authoredMelody: {
        notes: [{ id: "dormant", pitch: E4, onset: rational(2), duration: rational(1) }],
      },
    });
    const project = projectWith([chord(base, "full", "I", rational(4)), dormant]);
    const progressionBefore = project.progression;
    const result = planMeasureDuplication(project, 0);
    expect("reason" in result && result.reason).toContain("dormant notes");
    expect(project.progression).toBe(progressionBefore);
  });

  it("refuses copied Melody that cannot retain its source instrument in one Step", () => {
    const flute = chord(base, "flute-owner", "I", rational(4), {
      melodyInstrumentOverride: "flute",
      melody: {
        mode: "authored",
        phrase: {
          notes: [{ id: "held", pitch: G4, onset: rational(3), duration: rational(2) }],
        },
      },
    });
    const violin = rest("violin-owner", rational(4), { melodyInstrumentOverride: "violin" });
    const project = projectWith([flute, violin]);
    const result = planMeasureDuplication(project, 1);
    expect("reason" in result && result.reason).toContain(
      "v9 stores one Melody instrument per Step",
    );
    expect(project.progression.steps).toEqual([flute, violin]);
  });

  it("refuses active temporary branches without changing the source Project", () => {
    const project = projectWith([
      chord(base, "a", "I", rational(4)),
      chord(base, "b", "V", rational(4)),
    ]);
    const branch = startBranch(project, {
      type: "branch/start",
      payload: { branchId: "active", originStepId: "a", nowIso: T0 },
    }).project;
    const progressionBefore = branch.progression;
    const result = planMeasureDuplication(branch, 0);
    expect("reason" in result && result.reason).toContain("active branch");
    expect(branch.progression).toBe(progressionBefore);
  });

  it("materializes an appended generated phrase when its new ending context changes the output", () => {
    const recipe = {
      pitchMotion: "up" as const,
      rhythm: "even" as const,
      connection: "retrigger" as const,
      grid: "quarter" as const,
      octaveOffset: 0 as const,
      targetNextPitchClass: 2,
    };
    const project = projectWith([
      chord(base, "first", "V", rational(4)),
      chord(base, "generated", "I", rational(4), {
        melody: { mode: "generated", recipe },
      }),
      chord(base, "next", "V", rational(4)),
    ]);
    const plan = expectPlan(planMeasureDuplication(project, 1));
    const copied = plan.progression.steps.find((step) => step.id === plan.duplicatedStepIds[0]);
    expect(copied?.kind).toBe("chord");
    if (copied?.kind !== "chord") throw new Error("Generated chord was not copied");
    expect(copied.melody?.mode).toBe("authored");
    if (copied.melody?.mode === "authored") {
      expect(copied.melody.sourceRecipe ?? copied.melody.phrase.sourceRecipe).toEqual(recipe);
    }
    const original = createEffectiveMelodyTimeline(project).filter(
      (note) => note.sourceStepId === "generated",
    );
    const copy = createEffectiveMelodyTimeline({
      ...project,
      progression: plan.progression,
    }).filter((note) => note.sourceStepId === copied.id);
    expect(
      copy.map((note) => [note.pitch.midiNumber, note.startBeats, note.durationBeats]),
    ).toEqual(
      original.map((note) => [
        note.pitch.midiNumber,
        addRational(note.startBeats, rational(8)),
        note.durationBeats,
      ]),
    );
  });
});
