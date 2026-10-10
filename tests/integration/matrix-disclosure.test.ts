// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultProject } from "../../src/domain/project/factory";
import { HarmonicMatrix } from "../../src/ui/matrix/HarmonicMatrix";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DISCLOSURE_STORAGE_KEY = "cadenceflow.harmonicMatrix.open";

function renderMatrix() {
  const project = createDefaultProject("matrix-disclosure", "Matrix Disclosure");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(HarmonicMatrix, {
        project,
        previewFunctionId: "I",
        recommendations: null,
        contextualFunctionIds: [],
        onPreview: () => undefined,
        onAdd: () => undefined,
        onGlobalView: () => undefined,
        onModuleChange: () => undefined,
        onTonicChange: () => undefined,
        onTemplateOpen: () => undefined,
        onTemplateReset: () => undefined,
        onStaffOctaveChange: () => undefined,
      }),
    );
  });
  return { container, project, root };
}

afterEach(() => {
  window.localStorage.removeItem(DISCLOSURE_STORAGE_KEY);
  document.body.replaceChildren();
});

describe("Harmonic Matrix disclosure", () => {
  it("defaults open, then hides the complete matrix while preserving its rendered state", () => {
    const { container, project, root } = renderMatrix();
    const content = container.querySelector<HTMLElement>("[id^='harmonic-matrix-content-']");
    const card = container.querySelector<HTMLElement>('[data-testid="chord-card-I"]');
    const collapse = container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-collapse-toggle"]',
    );

    expect(content).not.toBeNull();
    expect(collapse?.getAttribute("aria-expanded")).toBe("true");
    expect(collapse?.getAttribute("aria-controls")).toBe(content?.id);
    expect(content?.hidden).toBe(false);
    expect(card?.classList.contains("is-selected")).toBe(true);

    act(() => collapse!.click());

    const expand = container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-expand-toggle"]',
    );
    expect(expand?.getAttribute("aria-expanded")).toBe("false");
    expect(expand?.getAttribute("aria-controls")).toBe(content?.id);
    expect(content?.hidden).toBe(true);
    expect(container.querySelector(".matrix-collapsed-header h2")?.textContent).toBe(
      "Harmonic Matrix",
    );
    expect(card?.isConnected).toBe(true);
    expect(card?.classList.contains("is-selected")).toBe(true);
    expect(project.activeModule).toBe("progressions");
    expect(window.localStorage.getItem(DISCLOSURE_STORAGE_KEY)).toBe("false");

    act(() => expand!.click());
    expect(content?.hidden).toBe(false);
    expect(container.querySelector('[data-testid="chord-card-I"]')).toBe(card);
    expect(window.localStorage.getItem(DISCLOSURE_STORAGE_KEY)).toBe("true");
    act(() => root.unmount());
  });

  it("restores a collapsed preference and exits Matrix Focus Mode accessibly", () => {
    window.localStorage.setItem(DISCLOSURE_STORAGE_KEY, "false");
    const { container, root } = renderMatrix();
    const content = container.querySelector<HTMLElement>("[id^='harmonic-matrix-content-']");

    expect(content?.hidden).toBe(true);
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="matrix-expand-toggle"]')!.click(),
    );

    const focusToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-focus-toggle"]',
    );
    const collapse = container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-collapse-toggle"]',
    );
    act(() => focusToggle!.click());
    expect(container.querySelector(".matrix-panel")?.getAttribute("data-focus-mode")).toBe("true");

    act(() => collapse!.click());
    expect(container.querySelector(".matrix-panel")?.hasAttribute("data-focus-mode")).toBe(false);
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="matrix-expand-toggle"]'),
    );

    const expand = container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-expand-toggle"]',
    );
    act(() => expand!.click());
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="matrix-collapse-toggle"]'),
    );
    act(() => root.unmount());
  });
});
