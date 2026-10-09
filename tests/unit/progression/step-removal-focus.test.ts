// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { removeStep } from "../../../src/app/commands/progressionCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { ProgressionTrack } from "../../../src/ui/progression/ProgressionTrack";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Removing a Step must not drop keyboard focus onto `document.body`.
 *
 * Regression context: `removeStepAndRestoreFocus` recorded the id of the step being acted on and
 * the layout effect that restores focus refuses to focus a step that is no longer present — so the
 * restore could bail out and leave focus on `<body>`, forcing a keyboard user to tab back into the
 * progression from the top. It also returned early for rest steps, even though their cards expose
 * the same focus target.
 *
 * What the remove button actually does: `removeStep` turns a chord Step into a rest **in place**
 * (delegating to `setSystemRest`), keeping the id, the position and the step count; a rest Step is
 * left as-is. These tests assert that observable behaviour together with where focus ends up,
 * because the focus logic depends on which Steps survive.
 */

const NOW = "2026-01-01T00:00:00.000Z";

interface Harness {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly store: AppStore;
  unmount(): void;
}

function renderHarness(): Harness {
  const base = createDefaultProject("focus-restore", "Focus Restore");
  const stepA = createMatrixChordStep(base, "I", "step-a");
  const stepB = createMatrixChordStep(base, "V", "step-b");
  const rest = Object.freeze({
    id: "step-rest",
    kind: "rest" as const,
    duration: musicalDuration(rational(1, 1)),
  });
  const stepD = createMatrixChordStep(base, "IV", "step-d");

  const store = new AppStore({
    ...base,
    // Card view, because that is where the per-step remove button lives; the piano-roll view (the
    // project default) has no removal control.
    presentation: { ...base.presentation, progressionView: "harmonic" },
    progression: Object.freeze({
      ...base.progression,
      steps: Object.freeze([stepA, stepB, rest, stepD]),
    }),
  });

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const remove = (stepId: string) => {
    store.dispatch(
      { type: "progression/remove-step", payload: { stepId, nowIso: NOW } },
      removeStep,
    );
  };

  function View() {
    const [, force] = useState(0);
    useEffect(() => store.subscribe(() => force((value) => value + 1)), []);
    return createElement(ProgressionTrack, {
      project: store.project,
      onSelectStep: () => undefined,
      onClearSelection: () => undefined,
      onEditPerformance: () => undefined,
      onSetStepDuration: () => undefined,
      onSetProgressionView: () => undefined,
      onRemove: remove,
      onReorder: () => undefined,
    });
  }

  act(() => {
    root.render(createElement(View));
  });

  return {
    container,
    root,
    store,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function stepKinds(store: AppStore): string[] {
  return store.project.progression.steps.map((step) => `${step.id}:${step.kind}`);
}

/** The remove button of the step card at `index` (0-based). */
function removeButtonAt(container: HTMLElement, index: number): HTMLButtonElement {
  const cards = Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="progression-step"]'),
  );
  const card = cards[index];
  if (!card) throw new Error(`no step card at index ${index} (found ${cards.length})`);
  const button = card.querySelector<HTMLButtonElement>('[data-testid="progression-step-remove"]');
  if (!button) throw new Error(`no remove button in card ${index}`);
  return button;
}

function focusedStepId(container: HTMLElement): string | null {
  const active = document.activeElement as HTMLElement | null;
  if (!active || !container.contains(active)) return null;
  return active.closest<HTMLElement>("[data-step-id]")?.dataset.stepId ?? null;
}

function click(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/**
 * Lets the focus transfer settle.
 *
 * Focus is applied on the animation frame after the command, so that the re-render which replaces
 * the acted-on card cannot drop focus back to `<body>`. `requestAnimationFrame` is asynchronous
 * even under jsdom, so the assertion has to wait a frame.
 */
async function settleFocus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

describe("focus restoration after removing a progression step", () => {
  const harnesses: Harness[] = [];

  afterEach(() => {
    for (const harness of harnesses.splice(0)) harness.unmount();
    document.body.innerHTML = "";
  });

  it("turns the chord step into a rest in place, keeping every step", () => {
    const harness = renderHarness();
    harnesses.push(harness);
    expect(stepKinds(harness.store)).toEqual([
      "step-a:chord",
      "step-b:chord",
      "step-rest:rest",
      "step-d:chord",
    ]);

    click(removeButtonAt(harness.container, 1)); // "step-b"

    // In place: same ids, same order, same count — only the kind changes.
    expect(stepKinds(harness.store)).toEqual([
      "step-a:chord",
      "step-b:rest",
      "step-rest:rest",
      "step-d:chord",
    ]);
  });

  it("moves focus to the step after the one that was cleared", async () => {
    const harness = renderHarness();
    harnesses.push(harness);

    click(removeButtonAt(harness.container, 1)); // "step-b"
    await settleFocus();

    expect(focusedStepId(harness.container)).toBe("step-rest");
  });

  it("moves focus backwards when the last step is cleared", async () => {
    const harness = renderHarness();
    harnesses.push(harness);

    click(removeButtonAt(harness.container, 3)); // "step-d", the final step
    await settleFocus();

    expect(stepKinds(harness.store)[3]).toBe("step-d:rest");
    // No following step exists, so the preceding one takes focus.
    expect(focusedStepId(harness.container)).toBe("step-rest");
  });

  it("keeps focus inside the progression when a rest step is acted on", async () => {
    const harness = renderHarness();
    harnesses.push(harness);

    click(removeButtonAt(harness.container, 2)); // "step-rest" — already a rest
    await settleFocus();

    // A rest is left unchanged, but focus must still land on a surviving step rather than <body>.
    expect(stepKinds(harness.store)[2]).toBe("step-rest:rest");
    expect(document.activeElement).not.toBe(document.body);
    // The following step takes focus.
    expect(focusedStepId(harness.container)).toBe("step-d");
  });

  it("never leaves focus on the document body", async () => {
    const harness = renderHarness();
    harnesses.push(harness);

    click(removeButtonAt(harness.container, 0)); // first step
    await settleFocus();

    expect(document.activeElement).not.toBe(document.body);
    expect(focusedStepId(harness.container)).toBe("step-b");
  });
});
