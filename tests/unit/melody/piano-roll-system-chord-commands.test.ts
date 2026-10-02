import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  replaceSystemChord,
  setSystemRest,
  setSystemStepDuration,
  splitSystemStep,
  systemTieDisabledReason,
  tieSystemSteps,
  transferSystemChordBoundary,
} from "../../../src/app/commands/systemChordCommands";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";
import type { ChordStep, ProgressionStep, RestStep } from "../../../src/domain/progression/step";
import { setBranchRejoin, startTemporaryBranch } from "../../../src/domain/progression/branch";
import { musicalDuration } from "../../../src/domain/timing/duration";
import {
  addRational,
  compareRational,
  divideRational,
  rational,
} from "../../../src/domain/timing/rational";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { createPianoRollSystemChordFixture } from "../../fixtures/piano-roll-system-chord.fixture";

const T0 = "2026-10-02T10:00:00.000Z";
const T1 = "2026-10-02T10:00:01.000Z";
const C4 = exactPitch(60, { step: "C", alter: 0 });
const E4 = exactPitch(64, { step: "E", alter: 0 });
const G4 = exactPitch(67, { step: "G", alter: 0 });

function withSteps(
  project: Project,
  steps: readonly ProgressionStep[],
  selectedStepId?: string,
): Project {
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([...steps]),
      ...(selectedStepId ? { selectedStepId } : {}),
    }),
  });
}

function chord(
  project: Project,
  id: string,
  functionId: string,
  duration = rational(1),
): ChordStep {
  const base = createMatrixChordStep(project, functionId, id);
  return Object.freeze({ ...base, duration: musicalDuration(duration) });
}

function withNotes(
  step: ChordStep,
  notes: ChordStep["melody"] extends infer _T
    ? readonly {
        readonly id: string;
        readonly pitch: typeof C4;
        readonly onset: ReturnType<typeof rational>;
        readonly duration: ReturnType<typeof rational>;
      }[]
    : never,
): ChordStep {
  return Object.freeze({
    ...step,
    melody: {
      mode: "authored",
      phrase: Object.freeze({ notes: Object.freeze([...notes]) }),
    },
  });
}

function absoluteNotes(project: Project) {
  return createEffectiveMelodyTimeline(project).map((note) => ({
    sourceStepId: note.sourceStepId,
    id: note.eventKey,
    midi: note.pitch.midiNumber,
    start: note.startBeats,
    duration: note.durationBeats,
  }));
}

describe("Piano Roll System chord commands", () => {
  it("replaces chords and Rest while preserving Step identity, duration, performance and authored Melody", () => {
    const project = createDefaultProject("system-chords", "System chords", T0);
    const original = withNotes(chord(project, "source", "I", rational(5, 2)), [
      { id: "melody-id", pitch: E4, onset: rational(1, 4), duration: rational(3, 2) },
    ]);
    const spelt = Object.freeze({
      ...original,
      explicitSpellingOverrides: Object.freeze({ "upper:64": { step: "F" as const, alter: -1 } }),
      melodyInstrumentOverride: "violin" as const,
    });
    const source = withSteps(project, [spelt], "source");
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/replace-chord",
        payload: { stepId: "source", functionId: "V", nowIso: T1 },
      },
      replaceSystemChord,
    );
    const replaced = store.project.progression.steps[0] as ChordStep;
    expect(replaced.id).toBe("source");
    expect(replaced.harmonicFunction.functionId).toBe("V");
    expect(replaced.duration).toEqual(spelt.duration);
    expect(replaced.performance).toEqual(spelt.performance);
    expect(replaced.melody).toEqual(spelt.melody);
    expect(replaced.melodyInstrumentOverride).toBe("violin");
    expect(replaced.explicitSpellingOverrides).toBeUndefined();
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps[0]).toEqual(replaced);

    const alreadyI = withSteps(project, [chord(project, "already-i", "I")]);
    const noopStore = new AppStore(alreadyI);
    let changeCount = 0;
    noopStore.subscribe(() => {
      changeCount += 1;
    });
    noopStore.dispatch(
      {
        type: "piano-roll/replace-chord",
        payload: { stepId: "already-i", functionId: "I", nowIso: T1 },
      },
      replaceSystemChord,
    );
    expect(noopStore.project).toBe(alreadyI);
    expect(noopStore.history.undoDepth).toBe(0);
    expect(changeCount).toBe(0);

    const rest: RestStep = Object.freeze({
      id: "rest-owner",
      kind: "rest",
      duration: musicalDuration(rational(3, 2)),
      authoredMelody: Object.freeze({
        notes: Object.freeze([
          { id: "rest-note", pitch: C4, onset: rational(1, 3), duration: rational(1, 2) },
        ]),
      }),
      melodyInstrumentOverride: "flute",
    });
    const fromRest = replaceSystemChord(withSteps(project, [rest]), {
      type: "piano-roll/replace-chord",
      payload: { stepId: rest.id, functionId: "ii", nowIso: T1 },
    }).project.progression.steps[0] as ChordStep;
    expect(fromRest.id).toBe(rest.id);
    expect(fromRest.duration).toEqual(rest.duration);
    expect(fromRest.melody?.mode).toBe("authored");
    if (fromRest.melody?.mode === "authored")
      expect(fromRest.melody.phrase).toEqual(rest.authoredMelody);
    expect(fromRest.melodyInstrumentOverride).toBe("flute");
  });

  it("materializes generated Melody as Rest in one undoable transaction and restores exact recipe", () => {
    const source = createRichProjectFixture();
    const generated = source.progression.steps.find(
      (step): step is ChordStep => step.kind === "chord" && step.melody?.mode === "generated",
    );
    if (!generated || generated.melody?.mode !== "generated")
      throw new Error("Missing generated fixture Step.");
    const originalEvents = absoluteNotes(source).filter(
      (note) => note.sourceStepId === generated.id,
    );
    const store = new AppStore(source);
    store.dispatch(
      { type: "piano-roll/set-rest", payload: { stepId: generated.id, nowIso: T1 } },
      setSystemRest,
    );
    const converted = store.project.progression.steps.find((step) => step.id === generated.id);
    expect(converted?.kind).toBe("rest");
    if (converted?.kind !== "rest") throw new Error("Expected a Rest Step.");
    expect(converted.duration).toEqual(generated.duration);
    expect(converted.authoredMelody?.sourceRecipe).toEqual(generated.melody.recipe);
    expect(
      absoluteNotes(store.project).filter((note) => note.sourceStepId === generated.id),
    ).toEqual(originalEvents);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps.find((step) => step.id === generated.id)).toEqual(
      converted,
    );
  });

  it("ripples exact Rational durations and reanchors absolute note onsets to the Step on the right", () => {
    const project = createDefaultProject("duration-ripple", "Duration ripple", T0);
    const first = withNotes(chord(project, "first", "I"), [
      { id: "boundary-note", pitch: E4, onset: rational(1, 2), duration: rational(2) },
    ]);
    const second = withNotes(chord(project, "second", "V"), [
      { id: "second-note", pitch: C4, onset: rational(0), duration: rational(1, 2) },
    ]);
    const third = withNotes(chord(project, "third", "vi"), [
      { id: "third-note", pitch: G4, onset: rational(0), duration: rational(1, 3) },
    ]);
    const source = withSteps(project, [first, second, third]);
    const original = absoluteNotes(source);
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/set-step-duration",
        payload: { stepId: first.id, duration: musicalDuration(rational(1, 2)), nowIso: T1 },
      },
      setSystemStepDuration,
    );
    const updated = store.project;
    const movedFirst = updated.progression.steps[0] as ChordStep;
    const movedSecond = updated.progression.steps[1] as ChordStep;
    const movedThird = updated.progression.steps[2] as ChordStep;
    expect(movedFirst.duration.beats).toEqual(rational(1, 2));
    expect(movedSecond.id).toBe(second.id);
    expect(movedThird.id).toBe(third.id);
    expect(movedSecond.melody?.mode).toBe("authored");
    if (movedSecond.melody?.mode === "authored") {
      expect(
        movedSecond.melody.phrase.notes.find((note) => note.id === "boundary-note")?.onset,
      ).toEqual(rational(0));
      expect(
        movedSecond.melody.phrase.notes.find((note) => note.id === "second-note")?.onset,
      ).toEqual(rational(0));
    }
    const after = absoluteNotes(updated);
    expect(after.map((note) => note.id).sort()).toEqual(original.map((note) => note.id).sort());
    const thirdOnset = after.find((note) => note.id === "third-note")?.start;
    expect(thirdOnset).toEqual(rational(3, 2));
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(updated.progression);
  });

  it("transfers a shared boundary within its pair, retaining crossing notes and exact total duration", () => {
    const project = createDefaultProject("boundary-transfer", "Boundary transfer", T0);
    const left = withNotes(chord(project, "left", "I", rational(4)), [
      { id: "crossing", pitch: E4, onset: rational(7, 2), duration: rational(2) },
    ]);
    const right = withNotes(chord(project, "right", "V", rational(4)), [
      { id: "right-boundary", pitch: C4, onset: rational(1), duration: rational(1, 2) },
    ]);
    const afterPair = chord(project, "after", "vi", rational(2));
    const source = withSteps(project, [left, right, afterPair]);
    const original = absoluteNotes(source);
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/transfer-boundary",
        payload: {
          leftStepId: left.id,
          boundary: rational(5),
          snapQuantum: rational(1, 2),
          nowIso: T1,
        },
      },
      transferSystemChordBoundary,
    );
    const updated = store.project;
    expect((updated.progression.steps[0] as ChordStep).duration.beats).toEqual(rational(5));
    expect((updated.progression.steps[1] as ChordStep).duration.beats).toEqual(rational(3));
    expect(updated.progression.steps[2]?.id).toBe(afterPair.id);
    expect(
      addRational(
        updated.progression.steps[0]!.duration.beats,
        updated.progression.steps[1]!.duration.beats,
      ),
    ).toEqual(rational(8));
    const after = absoluteNotes(updated);
    expect(after).toHaveLength(original.length);
    expect(after.find((note) => note.id === "crossing")).toEqual(
      original.find((note) => note.id === "crossing"),
    );
    expect(after.find((note) => note.id === "right-boundary")?.start).toEqual(rational(5));
    expect(after.find((note) => note.id === "right-boundary")?.sourceStepId).toBe(right.id);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(updated.progression);
    expect(compareRational(rational(1, 4), rational(1, 2))).toBeLessThan(0);
  });

  it("materializes generated Melody when a transferred boundary changes owners and keeps destination instruments", () => {
    const fixture = createPianoRollSystemChordFixture();
    const source = withSteps(
      fixture,
      fixture.progression.steps.map((step) =>
        step.id === "chord-f"
          ? Object.freeze({ ...step, melodyInstrumentOverride: "violin" as const })
          : step,
      ),
    );
    const generated = source.progression.steps.find(
      (step): step is ChordStep => step.id === "generated-e" && step.kind === "chord",
    );
    if (!generated || generated.melody?.mode !== "generated")
      throw new Error("Fixture is missing the generated Step");
    const originalEvents = createEffectiveMelodyTimeline(source)
      .map(({ pitch, startBeats, durationBeats }) => ({ pitch, startBeats, durationBeats }))
      .sort(
        (left, right) =>
          compareRational(left.startBeats, right.startBeats) ||
          left.pitch.midiNumber - right.pitch.midiNumber ||
          compareRational(left.durationBeats, right.durationBeats),
      );
    const originalMovedNote = createEffectiveMelodyTimeline(source).find(
      (note) => note.eventKey === "following-note",
    );
    expect(originalMovedNote?.sourceStepId).toBe("chord-f");
    expect(originalMovedNote?.startBeats).toEqual(rational(41, 2));
    expect(originalMovedNote?.instrument).toBe("violin");

    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/transfer-boundary",
        payload: {
          leftStepId: generated.id,
          boundary: rational(21),
          snapQuantum: rational(1, 2),
          nowIso: T1,
        },
      },
      transferSystemChordBoundary,
    );

    const updated = store.project;
    const updatedGenerated = updated.progression.steps.find((step) => step.id === generated.id);
    const updatedRight = updated.progression.steps.find((step) => step.id === "chord-f");
    expect(updatedGenerated?.kind).toBe("chord");
    expect(updatedRight?.kind).toBe("chord");
    if (
      updatedGenerated?.kind !== "chord" ||
      updatedGenerated.melody?.mode !== "authored" ||
      updatedRight?.kind !== "chord"
    )
      throw new Error("Generated boundary owner was not materialized");
    expect(updatedGenerated.melody.sourceRecipe).toEqual(generated.melody.recipe);
    expect(updatedGenerated.melodyInstrumentOverride).toBe(generated.melodyInstrumentOverride);
    expect(updatedRight.melodyInstrumentOverride).toBe("violin");
    expect(updatedGenerated.duration.beats).toEqual(rational(5));
    expect(updatedRight.duration.beats).toEqual(rational(3));

    const afterEvents = createEffectiveMelodyTimeline(updated);
    const afterSignature = afterEvents
      .map(({ pitch, startBeats, durationBeats }) => ({ pitch, startBeats, durationBeats }))
      .sort(
        (left, right) =>
          compareRational(left.startBeats, right.startBeats) ||
          left.pitch.midiNumber - right.pitch.midiNumber ||
          compareRational(left.durationBeats, right.durationBeats),
      );
    expect(afterSignature).toEqual(originalEvents);
    const movedNote = afterEvents.find((note) => note.eventKey === "following-note");
    expect(movedNote?.sourceStepId).toBe("generated-e");
    expect(movedNote?.startBeats).toEqual(rational(41, 2));
    expect(movedNote?.instrument).toBe("flute");

    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(updated.progression);
  });

  it("retains stored Melody tails while the effective timeline clips at the changed progression end", () => {
    const project = createDefaultProject("stored-tail", "Stored Melody tail", T0);
    const final = withNotes(chord(project, "tail", "I", rational(4)), [
      { id: "stored-tail", pitch: E4, onset: rational(3, 2), duration: rational(4) },
    ]);
    const source = withSteps(project, [final]);
    const beforeStoredNote =
      final.melody?.mode === "authored" ? final.melody.phrase.notes[0] : undefined;
    expect(beforeStoredNote?.duration).toEqual(rational(4));
    expect(createEffectiveMelodyTimeline(source)[0]?.durationBeats).toEqual(rational(5, 2));

    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/set-step-duration",
        payload: {
          stepId: final.id,
          duration: musicalDuration(rational(2)),
          nowIso: T1,
        },
      },
      setSystemStepDuration,
    );
    const updated = store.project;
    const updatedFinal = updated.progression.steps[0];
    if (updatedFinal?.kind !== "chord" || updatedFinal.melody?.mode !== "authored")
      throw new Error("Stored authored tail was lost during duration change");
    expect(updatedFinal.melody.phrase.notes[0]?.onset).toEqual(rational(3, 2));
    expect(updatedFinal.melody.phrase.notes[0]?.duration).toEqual(rational(4));
    expect(createEffectiveMelodyTimeline(updated)[0]?.durationBeats).toEqual(rational(1, 2));

    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(createEffectiveMelodyTimeline(store.project)[0]?.durationBeats).toEqual(rational(5, 2));
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(updated.progression);
    expect(createEffectiveMelodyTimeline(store.project)[0]?.durationBeats).toEqual(rational(1, 2));
  });

  it("snaps a shared boundary to an exact triplet quantum and rejects a short neighbor", () => {
    const project = createDefaultProject("triplet-boundary", "Triplet boundary", T0);
    const left = chord(project, "left", "I", rational(4));
    const right = chord(project, "right", "V", rational(4));
    const source = withSteps(project, [left, right]);
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/transfer-boundary",
        payload: {
          leftStepId: left.id,
          boundary: rational(14, 3),
          snapQuantum: rational(2, 3),
          nowIso: T1,
        },
      },
      transferSystemChordBoundary,
    );
    expect(store.project.progression.steps.map((step) => step.duration.beats)).toEqual([
      rational(14, 3),
      rational(10, 3),
    ]);
    expect(
      addRational(
        store.project.progression.steps[0]!.duration.beats,
        store.project.progression.steps[1]!.duration.beats,
      ),
    ).toEqual(rational(8));
    expect(divideRational(rational(14, 3), rational(2, 3))).toEqual(rational(7));
    expect(() =>
      transferSystemChordBoundary(source, {
        type: "piano-roll/transfer-boundary",
        payload: {
          leftStepId: left.id,
          boundary: rational(1, 3),
          snapQuantum: rational(2, 3),
          nowIso: T1,
        },
      }),
    ).toThrow("at least one Snap unit");
  });

  it("splits exactly in half, assigns an exact-boundary event to the new Step, and preserves crossing notes", () => {
    const project = createDefaultProject("split", "Split", T0);
    const sourceStep = withNotes(chord(project, "source", "I", rational(5)), [
      { id: "crossing", pitch: E4, onset: rational(2), duration: rational(2) },
      { id: "at-split", pitch: C4, onset: rational(5, 2), duration: rational(1, 2) },
    ]);
    const following = chord(project, "following", "V", rational(2));
    const source = withSteps(project, [sourceStep, following]);
    const original = absoluteNotes(source);
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/split-step",
        payload: { stepId: sourceStep.id, newStepId: "split-second", nowIso: T1 },
      },
      splitSystemStep,
    );
    const updated = store.project;
    expect(updated.progression.steps.map((step) => step.id)).toEqual([
      "source",
      "split-second",
      "following",
    ]);
    expect(updated.progression.steps.slice(0, 2).map((step) => step.duration.beats)).toEqual([
      rational(5, 2),
      rational(5, 2),
    ]);
    const after = absoluteNotes(updated);
    expect(after).toHaveLength(original.length);
    expect(after.find((note) => note.id === "crossing")?.sourceStepId).toBe("source");
    expect(after.find((note) => note.id === "crossing")?.start).toEqual(rational(2));
    expect(after.find((note) => note.id === "at-split")?.sourceStepId).toBe("split-second");
    expect(after.find((note) => note.id === "at-split")?.start).toEqual(rational(5, 2));
    expect(after.find((note) => note.id === "at-split")?.duration).toEqual(rational(1, 2));
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(updated.progression);
  });

  it("splits generated Melody without changing its effective absolute events and restores its recipe", () => {
    const source = createRichProjectFixture();
    const generated = source.progression.steps.find(
      (step): step is ChordStep => step.kind === "chord" && step.melody?.mode === "generated",
    );
    if (!generated || generated.melody?.mode !== "generated")
      throw new Error("Missing generated fixture Step.");
    const summarize = (project: Project, stepIds: ReadonlySet<string>) =>
      createEffectiveMelodyTimeline(project)
        .filter((note) => stepIds.has(note.sourceStepId))
        .map(({ pitch, startBeats, durationBeats, eventKey }) => ({
          pitch,
          startBeats,
          durationBeats,
          eventKey,
        }));
    const originalEvents = summarize(source, new Set([generated.id]));
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/split-step",
        payload: { stepId: generated.id, newStepId: "generated-split", nowIso: T1 },
      },
      splitSystemStep,
    );
    const updated = store.project;
    const splitIds = new Set([generated.id, "generated-split"]);
    const splitSteps = updated.progression.steps.filter((step) => splitIds.has(step.id));
    const half = divideRational(generated.duration.beats, rational(2));
    expect(splitSteps.map((step) => step.duration.beats)).toEqual([half, half]);
    expect(
      splitSteps.every((step) => step.kind === "chord" && step.melody?.mode === "authored"),
    ).toBe(true);
    expect(summarize(updated, splitIds)).toEqual(originalEvents);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression).toEqual(updated.progression);
  });

  it("ties matching contiguous chords, collision-safely merges owner-local IDs, and rejects invalid groups", () => {
    const project = createDefaultProject("tie", "Tie", T0);
    const first = withNotes(chord(project, "first", "I", rational(1)), [
      { id: "local-id", pitch: E4, onset: rational(1, 4), duration: rational(1, 2) },
    ]);
    const second = withNotes(chord(project, "second", "I", rational(3, 2)), [
      { id: "local-id", pitch: G4, onset: rational(1, 3), duration: rational(1, 4) },
    ]);
    const third = chord(project, "third", "V", rational(2));
    const source = withSteps(project, [first, second, third], second.id);
    expect(systemTieDisabledReason(source, [first.id, second.id])).toBeNull();
    expect(systemTieDisabledReason(source, [first.id, third.id])).toContain("contiguous");
    expect(systemTieDisabledReason(source, [first.id, "missing"])).toContain("no longer exists");
    expect(
      systemTieDisabledReason(
        withSteps(project, [
          first,
          { ...second, performance: { ...second.performance, articulation: "arp-up" } },
          third,
        ]),
        [first.id, second.id],
      ),
    ).toContain("matching harmony");
    expect(
      systemTieDisabledReason(
        withSteps(project, [first, { ...second, melodyInstrumentOverride: "flute" }, third]),
        [first.id, second.id],
      ),
    ).toContain("melody instrument");

    const store = new AppStore(source);
    store.dispatch(
      { type: "piano-roll/tie-steps", payload: { stepIds: [first.id, second.id], nowIso: T1 } },
      tieSystemSteps,
    );
    const merged = store.project.progression.steps[0] as ChordStep;
    expect(store.project.progression.steps.map((step) => step.id)).toEqual(["first", "third"]);
    expect(merged.duration.beats).toEqual(rational(5, 2));
    expect(store.project.progression.selectedStepId).toBe(first.id);
    expect(merged.melody?.mode).toBe("authored");
    if (merged.melody?.mode === "authored") {
      expect(merged.melody.phrase.notes).toHaveLength(2);
      expect(new Set(merged.melody.phrase.notes.map((note) => note.id)).size).toBe(2);
    }
    expect(
      absoluteNotes(store.project).map((note) => ({
        midi: note.midi,
        start: note.start,
        duration: note.duration,
      })),
    ).toEqual(
      absoluteNotes(source).map((note) => ({
        midi: note.midi,
        start: note.start,
        duration: note.duration,
      })),
    );
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(source.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps[0]).toEqual(merged);

    const branch = setBranchRejoin(
      source.progression,
      startTemporaryBranch(source.progression, "tie-branch", first.id),
      second.id,
    );
    const branchSource = Object.freeze({ ...source, temporaryBranch: branch });
    const branchStore = new AppStore(branchSource);
    branchStore.dispatch(
      { type: "piano-roll/tie-steps", payload: { stepIds: [first.id, second.id], nowIso: T1 } },
      tieSystemSteps,
    );
    expect(branchStore.project.temporaryBranch).toEqual({
      ...branch,
      rejoinStepId: third.id,
    });
    expect(branchStore.undo()).toBe(true);
    expect(branchStore.project).toEqual(branchSource);
    expect(branchStore.redo()).toBe(true);
    expect(branchStore.project.temporaryBranch).toEqual({
      ...branch,
      rejoinStepId: third.id,
    });

    const sectioned = withSteps(
      Object.freeze({
        ...source,
        progression: Object.freeze({
          ...source.progression,
          sections: Object.freeze([{ id: "section", name: "B", startStepId: second.id }]),
        }),
      }),
      [first, second, third],
    );
    expect(systemTieDisabledReason(sectioned, [first.id, second.id])).toContain("Song Section");
  });
});
