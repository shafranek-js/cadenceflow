// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { selectStep } from "../../../src/app/commands/progressionCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
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
  const rest = Object.freeze({
    id: "step-rest",
    kind: "rest" as const,
    duration: musicalDuration(rational(1, 1)),
  });
  const store = new AppStore({
    ...base,
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([stepA, stepB, rest]),
    }),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function View() {
    const [, force] = useState(0);
    useEffect(() => store.subscribe(() => force((value) => value + 1)), []);
    const select = (stepId: string) => {
      store.dispatch(
        {
          type: "progression/select-step",
          payload: {
            stepId,
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
      onSetProgressionView: () => undefined,
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
  it("selects cards without inline editors and dismisses from the empty background", () => {
    const { container, store, root } = renderHarness();
    const first = stepButton(container, 0);
    const second = stepButton(container, 1);

    act(() => first.click());
    expect(store.project.progression.selectedStepId).toBe("step-a");
    expect(container.querySelectorAll(".step-editor")).toHaveLength(0);

    act(() => first.click());
    expect(store.project.progression.selectedStepId).toBe("step-a");
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

  it("renders visible step numbers in semantic progression order", () => {
    const { container, root } = renderHarness();
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="progression-step"]'),
    );

    expect(
      cards.map(
        (card) => card.querySelector('[data-testid="progression-step-number"]')?.textContent,
      ),
    ).toEqual(["1", "2", "3"]);
    expect(
      cards.map((card) => card.querySelector<HTMLButtonElement>("[data-step-id]")?.dataset.stepId),
    ).toEqual(["step-a", "step-b", "step-rest"]);

    expect(
      cards.map((card) =>
        card
          .querySelector<HTMLButtonElement>("[data-progression-step-select]")
          ?.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Select progression step 1: I",
      "Select progression step 2: V",
      "Select progression step 3: Rest",
    ]);
    expect(
      cards.map((card) =>
        card
          .querySelector<HTMLButtonElement>('[data-testid="progression-step-remove"]')
          ?.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Remove progression step 1: I",
      "Remove progression step 2: V",
      "Remove progression step 3: Rest",
    ]);

    act(() => root.unmount());
  });

  it("dismisses with Escape and omits per-card view controls", () => {
    const { container, store, root } = renderHarness();
    const first = stepButton(container, 0);
    act(() => first.click());

    expect(store.project.progression.selectedStepId).toBe("step-a");
    expect(container.querySelector(".step-editor")).toBeNull();

    act(() => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(store.project.progression.selectedStepId).toBeUndefined();

    act(() => first.click());
    expect(container.querySelector(".card-view-switcher")).toBeNull();
    expect(container.querySelector('[aria-label="Progression Card View"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("restores focus to a Rest step after Escape dismisses selection", () => {
    const { container, root, store } = renderHarness();
    const rest = stepButton(container, 2);

    act(() => rest.click());
    expect(container.querySelectorAll(".step-editor")).toHaveLength(0);
    act(() => rest.focus());
    act(() => {
      rest.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });

    expect(store.project.progression.selectedStepId).toBeUndefined();
    expect(document.activeElement).toBe(rest);
    act(() => root.unmount());
  });

  it("persists selection changes without recording them in session history", () => {
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
    expect(changes).toEqual([true, true]);
    act(() => root.unmount());
  });
});
