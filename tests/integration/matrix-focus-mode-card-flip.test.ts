// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../src/domain/project/factory";
import type { Project } from "../../src/domain/project/project";
import { HarmonicMatrix } from "../../src/ui/matrix/HarmonicMatrix";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderMatrix(project: Project) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onPreview = vi.fn();
  const onGlobalView = vi.fn();

  act(() => {
    root.render(
      createElement(HarmonicMatrix, {
        project,
        recommendations: null,
        contextualFunctionIds: [],
        onPreview,
        onAdd: vi.fn(),
        onGlobalView,
        onModuleChange: vi.fn(),
        onTonicChange: vi.fn(),
        onTemplateOpen: vi.fn(),
        onTemplateReset: vi.fn(),
        onStaffOctaveChange: vi.fn(),
      }),
    );
  });

  return { container, root, onPreview, onGlobalView };
}

afterEach(() => {
  document.body.replaceChildren();
});
describe("Matrix Focus Mode and Card Flip", () => {
  it("keeps Focus Mode and guitar backs ephemeral while preserving matrix routing", () => {
    const project = createDefaultProject("t194-focus", "T194 Focus Mode");
    const projectBefore = JSON.stringify(project);
    const { container, root, onPreview, onGlobalView } = renderMatrix(project);
    const focusToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-focus-toggle"]',
    );

    expect(focusToggle).not.toBeNull();
    act(() => focusToggle!.click());

    const panel = container.querySelector<HTMLElement>(".matrix-panel");
    const card = container.querySelector<HTMLElement>('[data-testid="chord-card-I"]');
    const cardMain = card?.querySelector<HTMLButtonElement>(".chord-main");
    const flip = container.querySelector<HTMLButtonElement>('[data-testid="matrix-card-flip-I"]');
    expect(panel?.dataset.focusMode).toBe("true");
    expect(focusToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(card?.querySelector('[data-testid="matrix-card-focus-details"]')?.textContent).toContain(
      "Tendency:",
    );
    expect(flip).not.toBeNull();

    act(() => cardMain!.click());
    expect(onPreview).toHaveBeenCalledWith("I");

    act(() => flip!.click());
    expect(flip?.getAttribute("aria-expanded")).toBe("true");
    const guitar = card?.querySelector<HTMLElement>('[data-testid="mini-guitar-card-visual"]');
    expect(guitar).not.toBeNull();
    expect(guitar?.dataset.frets?.trim().split(/\s+/)).toHaveLength(6);
    expect(guitar?.dataset.baseFret).toBeTruthy();
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onGlobalView).not.toHaveBeenCalled();
    expect(JSON.stringify(project)).toBe(projectBefore);

    act(() => {
      flip!.focus();
      flip!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });

    expect(panel?.dataset.focusMode).toBeUndefined();
    expect(document.activeElement).toBe(focusToggle);
    expect(container.querySelector('[data-testid="matrix-card-flip-I"]')).toBeNull();
    expect(JSON.stringify(project)).toBe(projectBefore);

    act(() => root.unmount());
  });

  it("does not offer a guitar flip when the active card view is not harmonic", () => {
    const base = createDefaultProject("t194-capability", "T194 Capability");
    const project: Project = {
      ...base,
      presentation: { ...base.presentation, globalMatrixCardView: "piano" },
    };
    const projectBefore = JSON.stringify(project);
    const { container, root, onGlobalView } = renderMatrix(project);

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="matrix-focus-toggle"]')!.click(),
    );

    expect(container.querySelector('[data-testid^="matrix-card-flip-"]')).toBeNull();
    expect(container.querySelector(".mini-piano-card-visual")).not.toBeNull();
    expect(onGlobalView).not.toHaveBeenCalled();
    expect(JSON.stringify(project)).toBe(projectBefore);

    act(() => root.unmount());
  });
});
