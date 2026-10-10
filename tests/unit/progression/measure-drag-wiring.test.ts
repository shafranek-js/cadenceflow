// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { ProgressionTrack } from "../../../src/ui/progression/ProgressionTrack";
import { TransportStore } from "../../../src/ui/transport/transportStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * jsdom has no `PointerEvent` in every configuration, so pointer events are built from `MouseEvent`
 * plus a `pointerId` — the only extra field the gesture reads. `clientX`/`clientY`/`button` come
 * from `MouseEvent`.
 */
function pointerEvent(
  type: string,
  init: { clientX: number; clientY: number; pointerId: number; button?: number },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX,
    clientY: init.clientY,
    button: init.button ?? 0,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId, configurable: true });
  return event;
}

interface Harness {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly moves: Array<[number, number]>;
  readonly measures: () => HTMLElement[];
  unmount(): void;
}

/**
 * Renders the real `ProgressionTrack` in the piano-roll view with four Measures, so the grid packs
 * them into two Systems of two and each System has a trailing free cell.
 *
 * jsdom reports zero-sized rectangles, so every Measure is given a box before the drag starts;
 * without that the drop resolution would be meaningless.
 */
function renderHarness(refusal?: string): Harness {
  const base = createDefaultProject("measure-drag", "Measure drag", "2026-10-06T00:00:00.000Z");
  const steps = ["s0", "s1", "s2", "s3"].map((id) => createMatrixChordStep(base, "I", id));
  const store = new AppStore({
    ...base,
    presentation: { ...base.presentation, progressionView: "piano-roll", measuresPerSystem: 2 },
    progression: Object.freeze({ ...base.progression, steps: Object.freeze(steps) }),
  });
  const moves: Array<[number, number]> = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function View() {
    const [, force] = useState(0);
    useEffect(() => store.subscribe(() => force((value) => value + 1)), []);
    return createElement(ProgressionTrack, {
      project: store.project,
      transportStore: new TransportStore(),
      onSelectStep: () => undefined,
      onClearSelection: () => undefined,
      onEditPerformance: () => undefined,
      onSetStepDuration: () => undefined,
      onSetProgressionView: () => undefined,
      onRemove: () => undefined,
      onReorder: () => undefined,
      onMoveMeasure: (from: number, to: number) => {
        moves.push([from, to]);
        return refusal;
      },
    });
  }

  act(() => root.render(createElement(View)));

  const measures = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-testid="piano-roll-measure"]')).sort(
      (a, b) => Number(a.dataset.measureIndex) - Number(b.dataset.measureIndex),
    );

  // Two Measures per System in a 2-column grid: System 0 is the top row, System 1 below it.
  measures().forEach((node, index) => {
    const systemIndex = Math.floor(index / 2);
    const column = index % 2;
    const left = column * 200;
    const top = systemIndex * 120;
    const rect = { left, right: left + 200, top, bottom: top + 100 };
    node.getBoundingClientRect = () =>
      ({
        ...rect,
        x: rect.left,
        y: rect.top,
        width: 200,
        height: 100,
        toJSON: () => rect,
      }) as DOMRect;
  });

  return {
    container,
    root,
    moves,
    measures,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Presses a Measure header, drags to `to` and releases, as one gesture. */
function dragTo(
  harness: Harness,
  fromMeasureIndex: number,
  to: { clientX: number; clientY: number },
): void {
  act(() => {
    header(harness, fromMeasureIndex).dispatchEvent(
      pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
    );
  });
  act(() => {
    window.dispatchEvent(pointerEvent("pointermove", { ...to, pointerId: 1 }));
  });
  act(() => {
    window.dispatchEvent(pointerEvent("pointerup", { ...to, pointerId: 1 }));
  });
}

function header(harness: Harness, measureIndex: number): HTMLElement {
  const node = harness
    .measures()
    .find((measure) => Number(measure.dataset.measureIndex) === measureIndex);
  const target = node?.querySelector<HTMLElement>(".piano-roll-measure-header");
  if (!target) throw new Error(`no header for measure ${measureIndex}`);
  return target;
}

describe("piano-roll Measure drag wiring", () => {
  const harnesses: Harness[] = [];
  const mount = (refusal?: string) => {
    const harness = renderHarness(refusal);
    harnesses.push(harness);
    return harness;
  };

  afterEach(() => {
    for (const harness of harnesses.splice(0)) harness.unmount();
    document.body.replaceChildren();
  });

  it("renders measures that the gesture can measure", () => {
    const h = mount();
    expect(h.measures()).toHaveLength(4);
    expect(header(h, 0)).toBeTruthy();
  });

  it("marks the dragged measure and shows where it would land", () => {
    const h = mount();
    act(() => {
      header(h, 0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    expect(h.moves).toEqual([]);

    act(() => {
      // Into System 1, left of its first Measure -> slot 2.
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });

    const dragged = h.measures()[0]!;
    expect(dragged.className).toContain("is-measure-dragging");
    const indicator = h.container.querySelector(".is-measure-drop-before, .is-measure-drop-after");
    expect(indicator).not.toBeNull();
  });

  it("commits the move through onMoveMeasure on pointerup", () => {
    const h = mount();
    act(() => {
      header(h, 0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 170, pointerId: 1 }));
    });

    expect(h.moves).toEqual([[0, 2]]);
    expect(h.container.querySelector(".is-measure-dragging")).toBeNull();
    expect(h.container.querySelector(".is-measure-drop-before")).toBeNull();
  });

  it("moves a preview with the pointer while dragging", () => {
    const h = mount();
    const preview = () =>
      h.container.querySelector<HTMLElement>('[data-testid="progression-measure-drag-preview"]');

    act(() => {
      header(h, 0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    // Nothing follows the pointer until the gesture is actually a drag.
    expect(preview()).toBeNull();

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 40, clientY: 170, pointerId: 1 }),
      );
    });
    expect(preview()?.textContent).toContain("Measure 1");
    expect(preview()?.style.left).toBe("40px");
    expect(preview()?.style.top).toBe("170px");

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 120, clientY: 60, pointerId: 1 }),
      );
    });
    expect(preview()?.style.left).toBe("120px");
    expect(preview()?.style.top).toBe("60px");

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 120, clientY: 60, pointerId: 1 }));
    });
    expect(preview()).toBeNull();
  });

  it("does not commit a drop that would not change the order", () => {
    const h = mount();
    act(() => {
      header(h, 1).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 210, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      // Slot 2 for Measure 1 is "immediately before where it already is".
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 390, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 390, clientY: 50, pointerId: 1 }));
    });
    expect(h.moves).toEqual([]);
  });

  it("cancels the drag on Escape without committing", () => {
    const h = mount();
    act(() => {
      header(h, 0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    expect(h.container.querySelector(".is-measure-dragging")).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(h.container.querySelector(".is-measure-dragging")).toBeNull();

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 170, pointerId: 1 }));
    });
    expect(h.moves).toEqual([]);
  });

  it("leaves a plain click on the header alone", () => {
    const h = mount();
    act(() => {
      header(h, 0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      // Movement under the threshold is a click, not a drag.
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 12, clientY: 50, pointerId: 1 }));
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 12, clientY: 50, pointerId: 1 }));
    });
    expect(h.moves).toEqual([]);
    expect(h.container.querySelector(".is-measure-dragging")).toBeNull();
  });

  it("stays silent when the move is accepted", () => {
    const h = mount();
    dragTo(h, 0, { clientX: 10, clientY: 170 });
    expect(
      h.container.querySelector('[data-testid="progression-measure-move-message"]'),
    ).toBeNull();
  });

  it("surfaces the refusal returned by onMoveMeasure instead of staying silent", () => {
    const reason = "This Measure cannot be moved safely: it does not cover one exact bar.";
    const h = mount(reason);

    dragTo(h, 0, { clientX: 10, clientY: 170 });

    const message = h.container.querySelector<HTMLElement>(
      '[data-testid="progression-measure-move-message"]',
    );
    expect(message?.textContent).toBe(reason);
    // The refusal is announced, not merely drawn.
    expect(message?.getAttribute("role")).toBe("status");
    // And it is a refusal to act, so the project was not asked to change twice.
    expect(h.moves).toEqual([[0, 2]]);
  });
});
