// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { useReorderableSections, type UseReorderableSectionsResult } from "../../../src/ui/inspector/useReorderableSections";

const TEST_KEY = "test.sections.order";
const DEFAULT_ORDER = ["meter", "groove", "tracks", "register", "dynamics"] as const;
type SectionId = (typeof DEFAULT_ORDER)[number];

function TestComponent({
  onHookResult,
}: {
  readonly onHookResult: (res: UseReorderableSectionsResult<SectionId>) => void;
}) {
  const result = useReorderableSections<SectionId>({
    storageKey: TEST_KEY,
    defaultOrder: DEFAULT_ORDER,
  });
  onHookResult(result);
  return null;
}

describe("useReorderableSections", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function mountHook() {
    let currentResult!: UseReorderableSectionsResult<SectionId>;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        React.createElement(TestComponent, {
          onHookResult: (res) => {
            currentResult = res;
          },
        }),
      );
    });

    return {
      getResult: () => currentResult,
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  }

  it("initializes with default order when storage is empty", () => {
    const { getResult, unmount } = mountHook();
    expect(getResult().order).toEqual(["meter", "groove", "tracks", "register", "dynamics"]);
    expect(getResult().isCustomOrder).toBe(false);
    unmount();
  });

  it("initializes with saved order from localStorage and sanitizes missing/invalid keys", () => {
    window.localStorage.setItem(
      TEST_KEY,
      JSON.stringify(["dynamics", "meter", "unknown_key", "tracks"]),
    );
    const { getResult, unmount } = mountHook();
    // "unknown_key" is filtered out, "groove" and "register" are appended
    expect(getResult().order).toEqual(["dynamics", "meter", "tracks", "groove", "register"]);
    expect(getResult().isCustomOrder).toBe(true);
    unmount();
  });

  it("moves sections up and down and persists to localStorage", () => {
    const { getResult, unmount } = mountHook();

    // Move 'tracks' up
    act(() => {
      getResult().moveSection("tracks", "up");
    });

    expect(getResult().order).toEqual(["meter", "tracks", "groove", "register", "dynamics"]);
    expect(getResult().isCustomOrder).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(TEST_KEY)!)).toEqual([
      "meter",
      "tracks",
      "groove",
      "register",
      "dynamics",
    ]);

    // Move 'meter' up (already at top, should do nothing)
    act(() => {
      getResult().moveSection("meter", "up");
    });
    expect(getResult().order).toEqual(["meter", "tracks", "groove", "register", "dynamics"]);

    // Move 'tracks' down
    act(() => {
      getResult().moveSection("tracks", "down");
    });
    expect(getResult().order).toEqual(["meter", "groove", "tracks", "register", "dynamics"]);
    expect(getResult().isCustomOrder).toBe(false);

    unmount();
  });

  it("resets order to default and clears storage", () => {
    const { getResult, unmount } = mountHook();

    act(() => {
      getResult().moveSection("dynamics", "up");
    });
    expect(getResult().isCustomOrder).toBe(true);

    act(() => {
      getResult().resetOrder();
    });
    expect(getResult().order).toEqual(DEFAULT_ORDER);
    expect(getResult().isCustomOrder).toBe(false);
    expect(window.localStorage.getItem(TEST_KEY)).toBeNull();

    unmount();
  });

  it("handles drag and drop reordering", () => {
    const { getResult, unmount } = mountHook();
    const propsDynamics = getResult().getSectionItemProps("dynamics");
    const propsMeter = getResult().getSectionItemProps("meter");

    // Simulate drag start on dynamics
    const dataStore: Record<string, string> = {};
    const mockDragEvent = (type: string, target?: HTMLElement) => ({
      preventDefault: () => {},
      currentTarget: {
        getBoundingClientRect: () => ({ top: 0, height: 100 }),
        contains: () => false,
      },
      clientY: 10, // top half -> 'before'
      target: target ?? document.createElement("div"),
      dataTransfer: {
        effectAllowed: "none",
        dropEffect: "none",
        setData: (k: string, v: string) => {
          dataStore[k] = v;
        },
        getData: (k: string) => dataStore[k] ?? "",
      },
    });

    act(() => {
      propsDynamics.onDragStart(mockDragEvent("dragstart") as any);
    });
    expect(getResult().draggingId).toBe("dynamics");

    act(() => {
      propsMeter.onDragOver(mockDragEvent("dragover") as any);
    });
    expect(getResult().dropIndicator).toEqual({ targetId: "meter", position: "before" });

    // Drop dynamics before meter
    act(() => {
      propsMeter.onDrop(mockDragEvent("drop") as any);
    });

    expect(getResult().order).toEqual(["dynamics", "meter", "groove", "tracks", "register"]);
    expect(getResult().draggingId).toBeNull();
    expect(getResult().dropIndicator).toBeNull();

    unmount();
  });

  it("exports valid default sections for Selected Step Inspector", async () => {
    const { DEFAULT_SELECTED_STEP_SECTIONS, SELECTED_STEP_SECTION_ORDER_STORAGE_KEY } = await import(
      "../../../src/ui/inspector/PianoPerformanceInspector"
    );
    expect(SELECTED_STEP_SECTION_ORDER_STORAGE_KEY).toBe(
      "cadenceflow:inspector:selected_step:sections_order",
    );
    expect(DEFAULT_SELECTED_STEP_SECTIONS).toEqual([
      "register",
      "articulation",
      "duration",
      "voicing",
      "bass",
      "dynamics",
      "progression",
    ]);
  });
});
