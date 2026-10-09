import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import { editChordProperties } from "../../../src/app/commands/progressionCommands";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import {
  DEFAULT_PIANO_PERFORMANCE,
  createDefaultProject,
} from "../../../src/domain/project/factory";
import type { ChordStep } from "../../../src/domain/progression/step";
import { rational } from "../../../src/domain/timing/rational";

const T0 = "2026-10-08T08:00:00.000Z";
const T1 = "2026-10-08T08:01:00.000Z";

function projectWithChord(): ReturnType<typeof createDefaultProject> {
  const base = createDefaultProject("t217-command", "T217 command", T0);
  const step: ChordStep = Object.freeze({
    id: "chord-1",
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId: "I",
      category: "core",
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: Object.freeze({ beats: rational(3, 2) }),
    performance: Object.freeze({
      ...DEFAULT_PIANO_PERFORMANCE,
      articulation: "arp-up",
      masterVelocity: 103,
    }),
    cardView: "piano",
    melody: Object.freeze({
      mode: "generated",
      recipe: Object.freeze({
        pitchMotion: "up",
        rhythm: "even",
        connection: "retrigger",
        grid: "quarter",
        octaveOffset: 0,
      }),
    }),
    melodyInstrumentOverride: "violin",
  });
  return Object.freeze({
    ...base,
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([step]),
      selectedStepId: step.id,
    }),
  });
}

describe("T217 selected chord property command", () => {
  it("records one atomic history entry and restores exact properties through undo and redo", () => {
    const initial = projectWithChord();
    const originalStep = initial.progression.steps[0];
    if (!originalStep || originalStep.kind !== "chord") {
      throw new Error("Test fixture must contain one chord Step");
    }
    const store = new AppStore(initial);

    store.dispatch(
      {
        type: "progression/edit-chord-properties",
        payload: {
          projectId: initial.id,
          stepId: "chord-1",
          edit: { type: "type", value: "13" },
          nowIso: T1,
        },
      },
      editChordProperties,
    );

    expect(store.project.progression.steps[0]).toMatchObject({
      id: "chord-1",
      harmonicVariant: { seventh: "major7", extensions: [9, 11, 13] },
      chordPropertiesOrigin: {
        source: {
          harmonicFunction: { functionId: "I" },
          harmonicVariant: EMPTY_HARMONIC_VARIANT,
          bass: { choice: "auto" },
        },
      },
    });
    expect(store.project.progression.steps[0]).toMatchObject({
      duration: originalStep.duration,
      melody: originalStep.melody,
      melodyInstrumentOverride: "violin",
      performance: {
        articulation: "arp-up",
        masterVelocity: 103,
      },
    });
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(initial.progression);
    expect(store.undo()).toBe(false);

    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps[0]).toEqual(
      editChordProperties(initial, {
        type: "progression/edit-chord-properties",
        payload: {
          projectId: initial.id,
          stepId: "chord-1",
          edit: { type: "type", value: "13" },
          nowIso: T1,
        },
      }).project.progression.steps[0],
    );
    expect(store.undo()).toBe(true);
  });

  it("keeps a no-op edit out of project state and undo history", () => {
    const initial = projectWithChord();
    const store = new AppStore(initial);
    store.dispatch(
      {
        type: "progression/edit-chord-properties",
        payload: {
          projectId: initial.id,
          stepId: "chord-1",
          edit: { type: "quality", value: "major" },
          nowIso: T1,
        },
      },
      editChordProperties,
    );

    expect(store.project).toBe(initial);
    expect(store.canUndo).toBe(false);
  });

  it("drops an edit callback captured from a different project session", () => {
    const previousProject = projectWithChord();
    const activeProject = Object.freeze({ ...projectWithChord(), id: "active-project" });
    const applied = editChordProperties(activeProject, {
      type: "progression/edit-chord-properties",
      payload: {
        projectId: previousProject.id,
        stepId: "chord-1",
        edit: { type: "type", value: "13" },
        nowIso: T1,
      },
    });

    expect(applied.project).toBe(activeProject);
    expect(applied.project.progression).toEqual(activeProject.progression);
  });

  it("restores a serialized inverse as one progression snapshot", () => {
    const initial = projectWithChord();
    const applied = editChordProperties(initial, {
      type: "progression/edit-chord-properties",
      payload: {
        projectId: initial.id,
        stepId: "chord-1",
        edit: { type: "borrow", mode: "dorian" },
        nowIso: T1,
      },
    });
    expect(applyInverseCommand(applied.project, applied.inverse).progression).toEqual(
      initial.progression,
    );
  });
});
