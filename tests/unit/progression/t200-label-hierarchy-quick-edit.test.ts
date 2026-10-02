// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { editStepPerformance, replaceStep } from "../../../src/app/commands/progressionCommands";
import { setStepDuration } from "../../../src/app/commands/timingCommands";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { ProgressionQuickEdit } from "../../../src/ui/progression/ProgressionQuickEdit";
import {
  formatProgressionChordLabel,
  type LabelHierarchyMode,
} from "../../../src/ui/progression/labelHierarchy";
import { ProgressionChordLabel } from "../../../src/ui/progression/ProgressionChordLabel";

const el = React.createElement;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const baseProject = createDefaultProject("t200-labels", "T200 Labels", "2026-09-29T00:00:00.000Z");
const chordStep = createMatrixChordStep(baseProject, "I", "stable-step");

describe("T200 label hierarchy", () => {
  it.each([
    ["function-first", "I · C"],
    ["chord-first", "C · I"],
    ["inline", "C (I)"],
  ] as const)("formats %s as an explicit hierarchy", (mode, expected) => {
    expect(formatProgressionChordLabel(mode, "I", "C")).toBe(expected);
    const mounted = mount(
      el(ProgressionChordLabel, {
        mode,
        functionLabel: "I",
        chordLabel: "C",
      }),
    );
    expect(
      mounted.container.querySelector("[data-label-mode]")?.getAttribute("data-label-mode"),
    ).toBe(mode);
    expect(formatProgressionChordLabel(mode, "I", "C")).toBe(expected);
    expect(mounted.container.querySelector(".progression-chord-label-primary")?.textContent).toBe(
      mode === "function-first" ? "I" : "C",
    );
    expect(mounted.container.querySelector(".progression-chord-label-secondary")?.textContent).toBe(
      mode === "inline" ? "(I)" : mode === "function-first" ? "C" : "I",
    );
    mounted.unmount();
  });

  it("keeps the hierarchy mode presentation-only", () => {
    expect(baseProject.schemaVersion).toBe(6);
    expect(baseProject.progression.steps).toHaveLength(0);
  });
});

describe("T200 compact quick edit", () => {
  it("routes label, duration, inversion, dynamics, More, and selection by stable Step ID", () => {
    const onReplaceChord = vi.fn();
    const onDurationChange = vi.fn();
    const onPerformanceChange = vi.fn();
    const onOpenInspector = vi.fn();
    const mounted = mount(
      el(ProgressionQuickEdit, {
        step: chordStep,
        tonic: baseProject.tonic,
        labelMode: "function-first" satisfies LabelHierarchyMode,
        onReplaceChord,
        onDurationChange,
        onPerformanceChange,
        onOpenInspector,
      }),
    );

    const quickEdit = mounted.container.querySelector<HTMLElement>(
      "[data-testid='progression-quick-edit']",
    );
    expect(quickEdit?.dataset.stepId).toBe(chordStep.id);

    const change = (testId: string, value: string) => {
      const select = mounted.container.querySelector<HTMLSelectElement>(
        `[data-testid='${testId}']`,
      );
      expect(select).not.toBeNull();
      act(() => {
        select!.value = value;
        select!.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };

    change("quick-edit-chord-label", "V");
    expect(onReplaceChord).toHaveBeenCalledWith(chordStep.id, "V", "progressions");

    change("quick-edit-duration", "1/2");
    expect(onDurationChange).toHaveBeenCalledWith(chordStep.id, musicalDuration(rational(1, 2)));

    change("quick-edit-inversion", "2");
    expect(onPerformanceChange).toHaveBeenCalledWith(chordStep.id, { inversion: 2 });

    change("quick-edit-dynamics", "ff");
    expect(onPerformanceChange).toHaveBeenCalledWith(chordStep.id, { masterVelocity: 112 });

    act(() =>
      mounted.container
        .querySelector<HTMLButtonElement>("[data-testid='progression-quick-edit-more']")!
        .click(),
    );
    expect(onOpenInspector).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });
});

describe("T200 canonical quick-edit command routes", () => {
  it("replaces a Step in its own module after the active Matrix module changes", () => {
    const project = Object.freeze({
      ...baseProject,
      activeModule: "dark-harmony" as const,
      progression: Object.freeze({
        ...baseProject.progression,
        steps: Object.freeze([chordStep]),
        selectedStepId: chordStep.id,
      }),
    });
    const result = replaceStep(project, {
      type: "progression/replace-step",
      payload: {
        stepId: chordStep.id,
        functionId: "IV",
        moduleId: chordStep.harmonicFunction.moduleId,
        nowIso: "2026-09-29T00:01:00.000Z",
      },
    });
    const replaced = result.project.progression.steps[0];
    expect(result.project.activeModule).toBe("dark-harmony");
    expect(replaced?.id).toBe(chordStep.id);
    expect(replaced?.kind === "chord" && replaced.harmonicFunction.moduleId).toBe("progressions");
    expect(replaced?.kind === "chord" && replaced.harmonicFunction.functionId).toBe("IV");
  });

  it("preserves the selected Step ID through replace, duration, performance, Undo, and Redo", () => {
    const project = Object.freeze({
      ...baseProject,
      progression: Object.freeze({
        ...baseProject.progression,
        steps: Object.freeze([chordStep]),
        selectedStepId: chordStep.id,
      }),
    });
    const store = new AppStore(project);

    store.dispatch(
      {
        type: "progression/replace-step",
        payload: { stepId: chordStep.id, functionId: "V", nowIso: "2026-09-29T00:01:00.000Z" },
      },
      replaceStep,
    );
    expect(store.project.progression.selectedStepId).toBe(chordStep.id);
    expect(store.project.progression.steps[0]?.kind === "chord").toBe(true);
    expect(
      store.project.progression.steps[0]?.kind === "chord" &&
        store.project.progression.steps[0].harmonicFunction.functionId,
    ).toBe("V");
    expect(store.undo()).toBe(true);
    expect(store.project.progression.selectedStepId).toBe(chordStep.id);
    expect(
      store.project.progression.steps[0]?.kind === "chord" &&
        store.project.progression.steps[0].harmonicFunction.functionId,
    ).toBe("I");
    expect(store.redo()).toBe(true);
    expect(store.project.progression.selectedStepId).toBe(chordStep.id);

    store.dispatch(
      {
        type: "timing/set-step-duration",
        payload: {
          stepId: chordStep.id,
          duration: musicalDuration(rational(1, 2)),
          nowIso: "2026-09-29T00:02:00.000Z",
        },
      },
      setStepDuration,
    );
    expect(store.project.progression.steps[0]?.duration.beats).toEqual(rational(1, 2));
    expect(store.undo()).toBe(true);
    expect(store.project.progression.steps[0]?.duration.beats).toEqual(chordStep.duration.beats);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps[0]?.duration.beats).toEqual(rational(1, 2));

    store.dispatch(
      {
        type: "progression/edit-performance",
        payload: {
          stepId: chordStep.id,
          performance: { inversion: 1, masterVelocity: 112 },
          nowIso: "2026-09-29T00:03:00.000Z",
        },
      },
      editStepPerformance,
    );
    const edited = store.project.progression.steps[0];
    expect(edited?.kind === "chord" && edited.performance.inversion).toBe(1);
    expect(edited?.kind === "chord" && edited.performance.masterVelocity).toBe(112);
    expect(store.undo()).toBe(true);
    expect(
      store.project.progression.steps[0]?.kind === "chord" &&
        store.project.progression.steps[0].performance.inversion,
    ).toBe(chordStep.performance.inversion);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.selectedStepId).toBe(chordStep.id);
  });
});
