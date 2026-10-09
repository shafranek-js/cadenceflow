// @vitest-environment jsdom
import { act, createElement, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEASURE_DRAG_THRESHOLD_PX,
  useMeasureDrag,
} from "../../../src/ui/progression/useMeasureDrag";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * jsdom does not reliably provide `PointerEvent`, so pointer events are built from `MouseEvent` and
 * given a `pointerId`, which is the only extra field the gesture reads. `clientX`/`clientY` and
 * `button` come from `MouseEvent` itself.
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
  readonly commits: Array<[number, number]>;
  readonly state: () => { dragging: number | null; slot: number | null; system: number | null };
  readonly header: (measureIndex: number) => HTMLElement;
  unmount(): void;
}

/**
 * Three Measures across two Systems, mirroring the piano-roll grid:
 *   System 0: m0 [0,200]  m1 [200,400]  free cell beyond 400
 *   System 1 (y 120..220): m2 [0,200]
 */
function renderHarness(enabled = true): Harness {
  const commits: Array<[number, number]> = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const apiRef: { current: ReturnType<typeof useMeasureDrag> | null } = { current: null };

  function HarnessView() {
    const ref = useRef<HTMLDivElement>(null);
    const drag = useMeasureDrag({
      containerRef: ref,
      enabled,
      onCommit: (from, to) => commits.push([from, to]),
    });
    apiRef.current = drag;

    const measure = (measureIndex: number, systemIndex: number) =>
      createElement("div", {
        className: "piano-roll-measure",
        "data-measure-index": String(measureIndex),
        "data-system-index": String(systemIndex),
        "data-testid": `measure-${measureIndex}`,
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => drag.begin(measureIndex, event),
      });

    return createElement(
      "div",
      { ref },
      measure(0, 0),
      measure(1, 0),
      measure(2, 1),
      createElement("output", {
        "data-testid": "state",
        "data-dragging": drag.draggingMeasureIndex ?? "",
        "data-slot": drag.dropSlot ?? "",
        "data-system": drag.dropSystemIndex ?? "",
      }),
    );
  }

  act(() => root.render(createElement(HarnessView)));

  // jsdom reports zero-sized rects, so give each Measure a real box.
  const rects: Record<string, { left: number; right: number; top: number; bottom: number }> = {
    "measure-0": { left: 0, right: 200, top: 0, bottom: 100 },
    "measure-1": { left: 200, right: 400, top: 0, bottom: 100 },
    "measure-2": { left: 0, right: 200, top: 120, bottom: 220 },
  };
  for (const [testId, rect] of Object.entries(rects)) {
    const node = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
    node.getBoundingClientRect = () =>
      ({
        ...rect,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        toJSON: () => rect,
      }) as DOMRect;
  }

  const stateNode = () => container.querySelector<HTMLElement>('[data-testid="state"]')!;
  return {
    container,
    root,
    commits,
    state: () => ({
      dragging: stateNode().dataset.dragging ? Number(stateNode().dataset.dragging) : null,
      slot: stateNode().dataset.slot ? Number(stateNode().dataset.slot) : null,
      system: stateNode().dataset.system ? Number(stateNode().dataset.system) : null,
    }),
    header: (measureIndex: number) =>
      container.querySelector<HTMLElement>(`[data-testid="measure-${measureIndex}"]`)!,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useMeasureDrag", () => {
  const harnesses: Harness[] = [];
  const mount = (enabled = true) => {
    const harness = renderHarness(enabled);
    harnesses.push(harness);
    return harness;
  };

  afterEach(() => {
    for (const harness of harnesses.splice(0)) harness.unmount();
    document.body.innerHTML = "";
  });

  it("does not start dragging until the pointer passes the threshold", () => {
    const h = mount();
    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    expect(h.state().dragging).toBeNull();

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 10 + MEASURE_DRAG_THRESHOLD_PX - 1,
          clientY: 50,
          pointerId: 1,
        }),
      );
    });
    // Still a click, not a drag: the header's own click behaviour must win.
    expect(h.state().dragging).toBeNull();

    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 10 + MEASURE_DRAG_THRESHOLD_PX,
          clientY: 50,
          pointerId: 1,
        }),
      );
    });
    expect(h.state().dragging).toBe(0);
  });

  it("commits the move on pointerup", () => {
    const h = mount();
    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      // Drag m0 down into System 1, left of m2 -> slot 2.
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    expect(h.state().slot).toBe(2);
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 170, pointerId: 1 }));
    });
    expect(h.commits).toEqual([[0, 2]]);
    expect(h.state().dragging).toBeNull();
    expect(h.state().slot).toBeNull();
  });

  it("reports the trailing free cell as the append slot", () => {
    const h = mount();
    act(() => {
      h.header(2).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 500, clientY: 170, pointerId: 1 }),
      );
    });
    // Slot 3 appends after m2, and the drop is attributed to m2's own System so the insertion
    // indicator is drawn on that row.
    expect(h.state().slot).toBe(3);
    expect(h.state().system).toBe(1);
  });

  it("attributes a drop into System 0's free cell to System 0", () => {
    const h = mount();
    act(() => {
      h.header(2).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 500, clientY: 50, pointerId: 1 }),
      );
    });
    // The trailing free cell of System 0 and "before System 1's first Measure" share slot 2, so the
    // System is what disambiguates where the indicator belongs.
    expect(h.state().slot).toBe(2);
    expect(h.state().system).toBe(0);
  });

  it("does not commit when the drop would not change anything", () => {
    const h = mount();
    act(() => {
      h.header(1).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 210, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 50, pointerId: 1 }));
    });
    expect(h.state().slot).toBe(0);
    // Slot 0 for Measure 1 is a real move, so use Measure 0 dropping onto its own left edge instead.
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 50, pointerId: 1 }));
    });
    expect(h.commits).toEqual([[1, 0]]);

    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 50, pointerId: 1 }));
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 30, clientY: 50, pointerId: 1 }));
    });
    // Slot 0 for Measure 0 means "insert before itself".
    expect(h.commits).toEqual([[1, 0]]);
  });

  it("cancels on Escape without committing", () => {
    const h = mount();
    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    expect(h.state().dragging).toBe(0);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(h.state().dragging).toBeNull();
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 170, pointerId: 1 }));
    });
    expect(h.commits).toEqual([]);
  });

  it("ignores a second pointer taking over an in-flight drag", () => {
    const h = mount();
    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 2 }),
      );
    });
    // Pointer 2 was never pressed on a Measure, so it must not start or steer the drag.
    expect(h.state().dragging).toBeNull();
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 170, pointerId: 2 }));
    });
    expect(h.commits).toEqual([]);
  });

  it("never starts a drag when disabled (non piano-roll views)", () => {
    const h = mount(false);
    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    expect(h.state().dragging).toBeNull();
  });

  it("ignores non-primary buttons", () => {
    const h = mount();
    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1, button: 2 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 10, clientY: 170, pointerId: 1 }),
      );
    });
    expect(h.state().dragging).toBeNull();
  });

  it("does not announce a drop slot before the drag threshold is passed", () => {
    const h = mount();
    const listener = vi.fn();
    window.addEventListener("pointermove", listener);
    act(() => {
      h.header(0).dispatchEvent(
        pointerEvent("pointerdown", { clientX: 10, clientY: 50, pointerId: 1 }),
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 11, clientY: 50, pointerId: 1 }));
    });
    expect(h.state().slot).toBeNull();
    window.removeEventListener("pointermove", listener);
  });
});
