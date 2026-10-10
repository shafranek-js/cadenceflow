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
import { TransportStore } from "../../../src/ui/transport/transportStore";

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
    // Card view: these assertions are about the per-step cards and their visible step numbers,
    // which only the card layouts render. The project default is the piano-roll view.
    presentation: { ...base.presentation, progressionView: "harmonic" },
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
      transportStore: new TransportStore(),
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
      onSetStepDuration: () => undefined,
      onSetProgressionView: () => undefined,
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

/** Focus restoration is applied on the animation frame after the command. */
async function settleFocus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

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

  it("omits per-card view controls once a step is selected", () => {
    const { container, store, root } = renderHarness();
    act(() => stepButton(container, 0).click());

    expect(store.project.progression.selectedStepId).toBe("step-a");
    // A selected card must not sprout a per-card view switcher: the view is a global presentation
    // setting, so offering it per card would let one card disagree with the rest.
    expect(container.querySelector(".card-view-switcher")).toBeNull();
    expect(container.querySelector(".progression-track")).not.toBeNull();
    act(() => root.unmount());
  });

  it("moves focus to a live step when the selection is dismissed from a focused card", async () => {
    const { container, root, store } = renderHarness();

    act(() => stepButton(container, 2).click());
    expect(container.querySelectorAll(".step-editor")).toHaveLength(0);
    const rest = stepButton(container, 2);
    act(() => rest.focus());

    // Dismissal is driven through the component's own callback rather than a synthetic Escape.
    //
    // Escape cannot be exercised here: in this jsdom the root's React keyboard handlers are never
    // invoked for a `keydown` dispatched on a card button. That was measured, not assumed — the
    // event does reach the track element (a plain DOM listener there fires, and dispatching on the
    // track itself runs `handleKeyDown` and clears the selection), the card's fiber carries
    // `onKeyDown` up the chain, and clicks from the same node reach React normally, yet neither
    // `onKeyDown` nor `onKeyDownCapture` on the track runs for a keydown from the button. The
    // handler itself is what this guards: it must read the selection from the Project rather than
    // from the piano-roll-only local state, and must put focus on a step that survives. The Escape
    // binding is covered in the browser suite.
    act(() => clearSelection(store));
    await settleFocus();

    expect(store.project.progression.selectedStepId).toBeUndefined();
    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
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
