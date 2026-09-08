// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { selectStep } from "../../../src/app/commands/progressionCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { ProgressionTrack } from "../../../src/ui/progression/ProgressionTrack";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly store: AppStore;
}

function renderHarness(): Harness {
  const base = createDefaultProject("selection-dismissal", "Selection Dismissal");
  const stepA = createMatrixChordStep(base, "I", "step-a");
  const stepB = createMatrixChordStep(base, "V", "step-b");
  const store = new AppStore({
    ...base,
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([stepA, stepB]),
    }),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function View() {
    const [, force] = useState(0);
    useEffect(() => store.subscribe(() => force((value) => value + 1)), []);
    const select = (stepId: string) => {
      const nextStepId = store.project.progression.selectedStepId === stepId ? undefined : stepId;
      store.dispatch(
        {
          type: "progression/select-step",
          payload: {
            ...(nextStepId ? { stepId: nextStepId } : {}),
            nowIso: "2026-09-08T00:00:00.000Z",
          },
        },
        selectStep,
      );
    };
    return createElement(ProgressionTrack, {
      project: store.project,
      onSelectStep: select,
      onClearSelection: () => {
        store.dispatch(
          {
            type: "progression/select-step",
            payload: { nowIso: "2026-09-08T00:00:00.000Z" },
          },
          selectStep,
        );
      },
      onEditPerformance: () => undefined,
      onDurationChange: () => undefined,
      onSetStepView: () => undefined,
      onSetAllViews: () => undefined,
      onReplace: () => undefined,
      onReset: () => undefined,
      onRemove: () => undefined,
      onReorder: () => undefined,
    });
  }

  act(() => root.render(createElement(View)));
  return { container, root, store };
}

function clearSelection(store: AppStore): void {
  store.dispatch(
    {
      type: "progression/select-step",
      payload: { nowIso: "2026-09-08T00:00:00.000Z" },
    },
    selectStep,
  );
}

const stepButton = (container: HTMLDivElement, index: number) =>
  container.querySelectorAll<HTMLButtonElement>("[data-progression-step-select]")[index]!;

afterEach(() => {
  document.body.replaceChildren();
});

describe("Progression step selection dismissal", () => {
  it("toggles the selected card, switches cards, and dismisses from the empty background", () => {
    const { container, store, root } = renderHarness();
    const first = stepButton(container, 0);
    const second = stepButton(container, 1);

    act(() => first.click());
    expect(store.project.progression.selectedStepId).toBe("step-a");
    expect(container.querySelectorAll(".step-editor")).toHaveLength(1);

    act(() => first.click());
    expect(store.project.progression.selectedStepId).toBeUndefined();
    expect(container.querySelectorAll(".step-editor")).toHaveLength(0);

    act(() => first.click());
    act(() => second.click());
    expect(store.project.progression.selectedStepId).toBe("step-b");
    expect(
      container.querySelector('[data-testid="progression-step"][data-selected="true"]'),
    ).not.toBeNull();

    act(() => {
      container.querySelector<HTMLDivElement>(".progression-step-cards")!.click();
    });
    expect(store.project.progression.selectedStepId).toBeUndefined();
    act(() => root.unmount());
  });

  it("dismisses with Escape from editor and view controls", () => {
    const { container, store, root } = renderHarness();
    const first = stepButton(container, 0);
    act(() => first.click());

    const editor = container.querySelector<HTMLDivElement>(".step-editor")!;
    const articulation = editor.querySelector<HTMLSelectElement>("select")!;
    act(() => {
      articulation.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(store.project.progression.selectedStepId).toBe("step-a");

    act(() => {
      articulation.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(store.project.progression.selectedStepId).toBeUndefined();
    expect(container.querySelector(".step-editor")).toBeNull();

    act(() => first.click());
    const viewControls = container.querySelector<HTMLDivElement>(".card-view-switcher")!;
    act(() => {
      viewControls.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(store.project.progression.selectedStepId).toBeUndefined();
    expect(container.querySelector(".step-editor")).toBeNull();
    act(() => root.unmount());
  });

  it("keeps selection transient: no history entry, no persistence change, and no step mutation", () => {
    const { store, root } = renderHarness();
    const changes: boolean[] = [];
    store.subscribe((change) => changes.push(change.persist));
    const stepsBefore = store.project.progression.steps;

    act(() => {
      store.dispatch(
        {
          type: "progression/select-step",
          payload: { stepId: "step-a", nowIso: "2026-09-08T00:00:00.000Z" },
        },
        selectStep,
      );
      clearSelection(store);
    });

    expect(store.history.canUndo).toBe(false);
    expect(store.history.canRedo).toBe(false);
    expect(store.project.progression.steps).toBe(stepsBefore);
    expect(changes).toEqual([false, false]);
    act(() => root.unmount());
  });
});
