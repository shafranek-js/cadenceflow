// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { HarmonicStyleInspector } from "../../../src/ui/inspector/HarmonicStyleInspector";

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

describe("HarmonicStyleInspector", () => {
  it("renders with active style badge, genre pills, and description", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(HarmonicStyleInspector, {
        value: "all",
        onChange,
      }),
    );

    const badge = mounted.container.querySelector('[data-testid="style-active-badge"]');
    expect(badge?.textContent).toBe("All Styles");

    const description = mounted.container.querySelector('[data-testid="harmonic-style-description"]');
    expect(description?.textContent).toContain("Full harmonic matrix without genre filtering");

    const allPill = mounted.container.querySelector('[data-testid="genre-focus-all"]');
    expect(allPill?.getAttribute("aria-checked")).toBe("true");
    expect(allPill?.classList.contains("is-active")).toBe(true);

    const cinematicPill = mounted.container.querySelector('[data-testid="genre-focus-cinematic"]');
    expect(cinematicPill?.getAttribute("aria-checked")).toBe("false");

    mounted.unmount();
  });

  it("calls onChange when a style pill is clicked", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(HarmonicStyleInspector, {
        value: "all",
        onChange,
      }),
    );

    const cinematicPill = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="genre-focus-cinematic"]',
    );
    expect(cinematicPill).not.toBeNull();

    act(() => {
      cinematicPill?.click();
    });

    expect(onChange).toHaveBeenCalledWith("cinematic");
    mounted.unmount();
  });

  it("updates badge and description when value changes", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(HarmonicStyleInspector, {
        value: "cinematic",
        onChange,
      }),
    );

    const badge = mounted.container.querySelector('[data-testid="style-active-badge"]');
    expect(badge?.textContent).toBe("Cinematic");

    const description = mounted.container.querySelector('[data-testid="harmonic-style-description"]');
    expect(description?.textContent).toContain("Epic modal interchange");

    mounted.rerender(
      el(HarmonicStyleInspector, {
        value: "neo-soul",
        onChange,
      }),
    );

    expect(badge?.textContent).toBe("Neo-Soul");
    expect(description?.textContent).toContain("Rich extensions");

    mounted.unmount();
  });
});
