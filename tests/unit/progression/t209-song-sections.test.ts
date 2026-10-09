import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  duplicateSteps,
  removeStep,
  removeSteps,
  reorderSteps,
  resetAllStepPerformance,
} from "../../../src/app/commands/progressionCommands";
import { setSongSections } from "../../../src/app/commands/sectionCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { snapshotChordMelody } from "../../../src/domain/melody/types";
import { rational } from "../../../src/domain/timing/rational";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { createProgressionMeasureLayout } from "../../../src/domain/timing/measureLayout";
import {
  addBranchPreview,
  commitBranchCommand,
  setBranchRejoinCommand,
  startBranch,
} from "../../../src/app/commands/branchCommands";
import { applyPreset } from "../../../src/app/commands/presetCommands";
import { createFunctionalPreset } from "../../../src/domain/progression/presets";
import type { Project } from "../../../src/domain/project/project";
import {
  InvalidPortableProjectError,
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

const now = "2026-09-30T10:00:00.000Z";
function fixture(): Project {
  const project = createDefaultProject("t209", "T209", now);
  return Object.freeze<Project>({
    ...project,
    progression: Object.freeze({
      steps: Object.freeze(
        ["a", "b", "c", "d"].map((id, index) =>
          createMatrixChordStep(project, ["I", "IV", "V", "I"][index]!, id),
        ),
      ),
      sections: Object.freeze([
        Object.freeze({ id: "section-b", name: "Chorus", startStepId: "b" }),
        Object.freeze({ id: "section-a", name: "Verse", startStepId: "b" }),
        Object.freeze({ id: "section-c", name: "Bridge", startStepId: "c" }),
      ]),
    }),
  });
}

describe("T209 Song Sections", () => {
  it("round-trips IDs and canonically orders shared boundaries by ID", () => {
    const project = fixture();
    const restored = decodePortableProject(encodePortableProject(project));
    expect(restored.progression.sections).toEqual([
      { id: "section-a", name: "Verse", startStepId: "b" },
      { id: "section-b", name: "Chorus", startStepId: "b" },
      { id: "section-c", name: "Bridge", startStepId: "c" },
    ]);
  });

  it("migrates v7 to empty sections while preserving authored Melody and project data", () => {
    const source = fixture();
    const authored = snapshotChordMelody({
      mode: "authored" as const,
      phrase: {
        notes: [
          {
            id: "note-1",
            pitch: exactPitch(60, { step: "C", alter: 0 }),
            onset: rational(0),
            duration: rational(1),
          },
        ],
      },
    });
    const authoredSource = Object.freeze({
      ...source,
      progression: Object.freeze({
        ...source.progression,
        steps: Object.freeze(
          source.progression.steps.map((step, index) =>
            index === 0 && step.kind === "chord"
              ? Object.freeze({ ...step, melody: authored })
              : step,
          ),
        ),
      }),
    });
    const raw = JSON.parse(encodePortableProject(authoredSource));
    const v7 = {
      ...raw,
      schemaVersion: 7,
      progression: { ...raw.progression, sections: undefined },
      temporaryBranch: {
        id: "branch",
        originStepId: "a",
        originAtEnd: false,
        compositionIntent: "neutral",
        steps: [],
      },
    };
    const restored = decodePortableProject(JSON.stringify(v7));
    expect(restored.schemaVersion).toBe(11);
    expect(restored.progression.sections).toEqual([]);
    expect(restored.progression.steps[0]).toMatchObject({ kind: "chord", melody: authored });
    expect(restored.temporaryBranch?.id).toBe("branch");
    expect(restored.harmonyTrack.pianoSoundfontInstrument).toBe(
      source.harmonyTrack.pianoSoundfontInstrument,
    );
  });

  it("rejects duplicate IDs and dangling step references in v8", () => {
    const raw = JSON.parse(encodePortableProject(fixture())) as {
      progression: { sections: unknown[] };
    };
    raw.progression.sections = [
      { id: "same", name: "A", startStepId: "a" },
      { id: "same", name: "B", startStepId: "b" },
    ];
    expect(() => decodePortableProject(JSON.stringify(raw))).toThrow(InvalidPortableProjectError);
    raw.progression.sections = [{ id: "bad", name: "Bad", startStepId: "missing" }];
    expect(() => decodePortableProject(JSON.stringify(raw))).toThrow(/references missing Step/);
  });

  it("transfers multiple deleted boundaries forward once; undo/redo restores the transaction", () => {
    const initial = fixture();
    const store = new AppStore(initial);
    store.dispatch(
      { type: "progression/remove-steps", payload: { stepIds: ["b", "c"], nowIso: now } },
      removeSteps,
    );
    expect(store.project.progression.sections).toEqual([
      { id: "section-a", name: "Verse", startStepId: "d" },
      { id: "section-b", name: "Chorus", startStepId: "d" },
      { id: "section-c", name: "Bridge", startStepId: "d" },
    ]);
    expect(store.undo()).toBe(true);
    expect(store.project.progression.sections).toEqual(initial.progression.sections);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.sections?.every((s) => s.startStepId === "d")).toBe(true);
  });

  it("keeps single-Step removal boundaries on the Rest identity and removes them only for a deleted range", () => {
    const base = fixture();
    const initial = Object.freeze({
      ...base,
      progression: Object.freeze({
        ...base.progression,
        sections: Object.freeze([
          ...base.progression.sections!,
          Object.freeze({ id: "section-d", name: "Coda", startStepId: "d" }),
        ]),
      }),
    });
    const last = removeStep(initial, {
      type: "progression/remove-step",
      payload: { stepId: "d", nowIso: now },
    });
    expect(last.project.progression.steps.map((step) => step.id)).toEqual(["a", "b", "c", "d"]);
    expect(last.project.progression.steps.at(-1)?.kind).toBe("rest");
    expect(
      last.project.progression.sections?.find((section) => section.id === "section-d")?.startStepId,
    ).toBe("d");
    const tailRange = removeSteps(initial, {
      type: "progression/remove-steps",
      payload: { stepIds: ["c", "d"], nowIso: now },
    });
    expect(
      tailRange.project.progression.sections
        ?.filter((section) => section.id === "section-c" || section.id === "section-d")
        .map((section) => section.startStepId),
    ).toEqual(["b", "b"]);
    const only = Object.freeze({
      ...initial,
      progression: Object.freeze({
        ...initial.progression,
        steps: [initial.progression.steps[1]!],
      }),
    });
    const empty = removeStep(only, {
      type: "progression/remove-step",
      payload: { stepId: "b", nowIso: now },
    });
    expect(empty.project.progression.steps).toHaveLength(1);
    expect(empty.project.progression.steps[0]?.kind).toBe("rest");
    expect(empty.project.progression.sections?.map((section) => section.startStepId)).toEqual([
      "b",
      "b",
      "c",
      "d",
    ]);
    const reordered = reorderSteps(initial, {
      type: "progression/reorder-steps",
      payload: { steps: [...initial.progression.steps].reverse(), nowIso: now },
    });
    expect(
      reordered.project.progression.sections?.map((section) => [section.id, section.startStepId]),
    ).toEqual([
      ["section-d", "d"],
      ["section-c", "c"],
      ["section-a", "b"],
      ["section-b", "b"],
    ]);
    const store = new AppStore(initial);
    const renamed = setSongSections(initial, {
      type: "progression/set-sections",
      payload: {
        sections: initial.progression.sections!.map((s) =>
          s.id === "section-b" ? { ...s, name: "Hook" } : s,
        ),
        nowIso: now,
      },
    });
    store.dispatch(
      {
        type: "progression/set-sections",
        payload: { sections: renamed.project.progression.sections!, nowIso: now },
      },
      setSongSections,
    );
    expect(store.undo()).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.sections?.find((s) => s.id === "section-b")?.name).toBe(
      "Hook",
    );
  });

  it("does not clone section IDs or retarget boundaries when duplicating Steps", () => {
    const initial = fixture();
    const result = duplicateSteps(initial, {
      type: "progression/duplicate-steps",
      payload: { steps: [initial.progression.steps[1]!], newStepIds: ["step-b-copy"], nowIso: now },
    });
    expect(result.project.progression.steps.map((step) => step.id)).toContain("step-b-copy");
    expect(result.project.progression.sections?.map((section) => section.id)).toEqual([
      "section-a",
      "section-b",
      "section-c",
    ]);
    expect(new Set(result.project.progression.sections?.map((section) => section.id)).size).toBe(3);
  });

  it("keeps section identities through the progression performance reset", () => {
    const initial = fixture();
    const reset = resetAllStepPerformance(initial, {
      type: "progression/reset-all-performance",
      payload: { nowIso: now },
    });
    expect(reset.project.progression.sections?.map((section) => section.id)).toEqual([
      "section-a",
      "section-b",
      "section-c",
    ]);
    const stepIds = new Set(reset.project.progression.steps.map((step) => step.id));
    expect(
      reset.project.progression.sections?.every((section) => stepIds.has(section.startStepId)),
    ).toBe(true);
  });

  it("marks a Step only at its true start, never at its continuation fragment", () => {
    const initial = fixture();
    const longFirst = Object.freeze({
      ...initial.progression.steps[0]!,
      duration: musicalDuration(rational(8)),
    });
    const layout = createProgressionMeasureLayout(
      [longFirst, ...initial.progression.steps.slice(1)],
      initial.globalTiming.meter,
    );
    const firstStepFragments = layout.measures.flatMap((measure) =>
      measure.fragments.filter((fragment) => fragment.stepId === longFirst.id),
    );
    expect(firstStepFragments.map((fragment) => fragment.startsHere)).toEqual([true, false]);
  });

  it("cleans replaced Step references after preset and branch commits", () => {
    const initial = fixture();
    const firstChord = initial.progression.steps[0]!;
    if (firstChord.kind !== "chord") throw new Error("expected chord fixture");
    const preset = createFunctionalPreset("t209-preset", "T209 Preset", "builtIn", [
      { harmonicFunction: firstChord.harmonicFunction, duration: firstChord.duration },
    ]);
    const presetResult = applyPreset(initial, {
      type: "presets/apply",
      payload: { preset, mode: "replace", nowIso: now },
    });
    const assertNoDangling = (project: Project) => {
      const stepIds = new Set(project.progression.steps.map((step) => step.id));
      expect(
        project.progression.sections?.every((section) => stepIds.has(section.startStepId)),
      ).toBe(true);
    };
    assertNoDangling(presetResult.project);

    const branchStart = startBranch(initial, {
      type: "branch/start",
      payload: { branchId: "branch-t209", originStepId: "b", nowIso: now },
    });
    const branchStep = createMatrixChordStep(initial, "I", "branch-step");
    const branchAdd = addBranchPreview(branchStart.project, {
      type: "branch/add-preview",
      payload: { functionId: "I", stepId: branchStep.id, nowIso: now },
    });
    const branchRejoin = setBranchRejoinCommand(branchAdd.project, {
      type: "branch/set-rejoin",
      payload: { rejoinStepId: "d", nowIso: now },
    });
    const committed = commitBranchCommand(branchRejoin.project, {
      type: "branch/commit",
      payload: { nowIso: now },
    });
    assertNoDangling(committed.project);
    expect(committed.project.progression.sections?.map((section) => section.id)).toEqual([
      "section-a",
      "section-b",
    ]);
  });
});
