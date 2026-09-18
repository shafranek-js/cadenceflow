// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { StudioWorkspace } from "../../../src/ui/studio/StudioWorkspace";

const el = React.createElement;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender(nextElement: React.ReactElement) {
      act(() => root.render(nextElement));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("StudioWorkspace Side Panel Modes & Auto-hide", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders fixed mode without collapse and with pinned button state", () => {
    const onSidePanelModeChange = vi.fn();
    const mounted = mount(
      el(StudioWorkspace, {
        header: el("div", null, "Header"),
        transport: el("div", null, "Transport"),
        matrix: el("div", null, "Matrix"),
        inspector: el("div", null, "Inspector Content"),
        progression: el("div", null, "Progression"),
        sidePanelMode: "fixed",
        onSidePanelModeChange,
      }),
    );

    const grid = mounted.container.querySelector(".studio-grid");
    expect(grid?.classList.contains("is-collapsed")).toBe(false);

    const sensor = mounted.container.querySelector('[data-testid="sidebar-hover-sensor"]');
    expect(sensor).toBeNull();

    const pinBtn = mounted.container.querySelector('[data-testid="toggle-pin-side-panel"]');
    expect(pinBtn).not.toBeNull();
    expect(pinBtn?.classList.contains("is-pinned")).toBe(true);
    expect(pinBtn?.textContent).toContain("Pinned");

    act(() => {
      pinBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSidePanelModeChange).toHaveBeenCalledWith("autohide");

    mounted.unmount();
  });

  it("renders autohide mode with is-collapsed and sensor, expands on hover and collapses on leave", () => {
    const onSidePanelModeChange = vi.fn();
    const mounted = mount(
      el(StudioWorkspace, {
        header: el("div", null, "Header"),
        transport: el("div", null, "Transport"),
        matrix: el("div", null, "Matrix"),
        inspector: el("div", null, "Inspector Content"),
        progression: el("div", null, "Progression"),
        sidePanelMode: "autohide",
        onSidePanelModeChange,
      }),
    );

    const grid = mounted.container.querySelector(".studio-grid");
    expect(grid?.classList.contains("is-collapsed")).toBe(true);

    const sensor = mounted.container.querySelector('[data-testid="sidebar-hover-sensor"]');
    expect(sensor).not.toBeNull();

    const pinBtn = mounted.container.querySelector('[data-testid="toggle-pin-side-panel"]');
    expect(pinBtn?.classList.contains("is-pinned")).toBe(false);
    expect(pinBtn?.textContent).toContain("Auto-hide");

    // Click pin button to toggle to fixed
    act(() => {
      pinBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSidePanelModeChange).toHaveBeenCalledWith("fixed");

    // Hover sensor expands sidebar
    act(() => {
      sensor?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(grid?.classList.contains("is-collapsed")).toBe(false);

    // Mouse leave from inspector schedules leave with debounce
    const inspector = mounted.container.querySelector(".inspector-stack");
    act(() => {
      inspector?.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    // Still not collapsed before timer
    expect(grid?.classList.contains("is-collapsed")).toBe(false);

    // Advance timer past 260ms
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(grid?.classList.contains("is-collapsed")).toBe(true);

    mounted.unmount();
  });

  it("wraps inspector and selected step content inside fixed 316px inner containers", () => {
    const mounted = mount(
      el(StudioWorkspace, {
        header: el("div", null, "Header"),
        transport: el("div", null, "Transport"),
        matrix: el("div", null, "Matrix"),
        inspector: el("div", { className: "card-template-inspector" }, "Card Template"),
        selectedStepInspector: el(
          "div",
          { className: "piano-performance-inspector" },
          "Piano Performance",
        ),
        progression: el("div", null, "Progression"),
        sidePanelMode: "fixed",
      }),
    );

    const inspectorContent = mounted.container.querySelector(".inspector-stack-content");
    expect(inspectorContent).not.toBeNull();
    expect(inspectorContent?.querySelector(".card-template-inspector")).not.toBeNull();

    const selectedStepContent = mounted.container.querySelector(".selected-step-stack-content");
    expect(selectedStepContent).not.toBeNull();
    expect(selectedStepContent?.querySelector(".piano-performance-inspector")).not.toBeNull();

    const dockHeader = mounted.container.querySelector(".inspector-dock-header");
    expect(dockHeader).not.toBeNull();
    expect(dockHeader?.querySelector(".inspector-dock-title")?.textContent).toBe("Inspector");

    mounted.unmount();
  });

  it("expands on right-edge pointermove and preserves open state when focus is inside", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1280,
    });

    const mounted = mount(
      el(StudioWorkspace, {
        header: el("div", null, "Header"),
        transport: el("div", null, "Transport"),
        matrix: el("div", null, "Matrix"),
        inspector: el("input", { "data-testid": "inspector-input" }),
        progression: el("div", null, "Progression"),
        sidePanelMode: "autohide",
      }),
    );

    const grid = mounted.container.querySelector(".studio-grid");
    expect(grid?.classList.contains("is-collapsed")).toBe(true);

    // Pointer move near right edge (within 24px of 1280: clientX = 1270)
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 1270 }));
    });
    expect(grid?.classList.contains("is-collapsed")).toBe(false);

    // Focus input inside inspector
    const input = mounted.container.querySelector<HTMLInputElement>(
      '[data-testid="inspector-input"]',
    );
    input?.focus();

    // Pointer moves far left to main area (clientX = 500)
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 500 }));
      vi.advanceTimersByTime(300);
    });
    // Still expanded because focus is inside!
    expect(grid?.classList.contains("is-collapsed")).toBe(false);

    // Blur input
    input?.blur();

    // Pointer moves far left again
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 500 }));
      vi.advanceTimersByTime(300);
    });
    expect(grid?.classList.contains("is-collapsed")).toBe(true);

    mounted.unmount();
  });
});
