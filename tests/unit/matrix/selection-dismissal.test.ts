// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { HarmonicMatrix } from "../../../src/ui/matrix/HarmonicMatrix";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly store: AppStore;
}

function renderHarness(): Harness {
  const base = createDefaultProject("matrix-selection-dismissal", "Matrix Selection Dismissal");
  const store = new AppStore(base);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function View() {
    const [, force] = useState(0);
    useEffect(() => store.subscribe(() => force((value) => value + 1)), []);

    return createElement(HarmonicMatrix, {
      project: store.project,
      previewFunctionId: store.matrixSession.previewFunctionId,
      recommendations: null,
      contextualFunctionIds: [],
      onPreview: (functionId: string) => {
        store.selectMatrixPreview(functionId);
      },
      onAdd: () => undefined,
      onGlobalView: () => undefined,
      onModuleChange: () => undefined,
      onTonicChange: () => undefined,
      onTemplateOpen: () => undefined,
      onTemplateReset: () => undefined,
      onResetCurrentModule: () => undefined,
      onResetAllModules: () => undefined,
      onStaffOctaveChange: () => undefined,
      onClearSelection: () => {
        store.clearMatrixPreview();
      },
    });
  }

  act(() => root.render(createElement(View)));
  return { container, root, store };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Harmonic Matrix selection dismissal", () => {
  it("selects a chord card and dismisses selection with Escape key", () => {
    const { container, store, root } = renderHarness();
    const cardI = container.querySelector<HTMLElement>('[data-testid="chord-card-I"]');
    const buttonI = cardI?.querySelector<HTMLButtonElement>(".chord-main");
    expect(buttonI).not.toBeNull();

    // 1. Initially unselected
    expect(store.matrixSession.previewFunctionId).toBeUndefined();
    expect(cardI?.classList.contains("is-selected")).toBe(false);

    // 2. Select card I
    act(() => buttonI!.click());
    expect(store.matrixSession.previewFunctionId).toBe("I");
    expect(cardI?.classList.contains("is-selected")).toBe(true);

    // 3. Press Escape on the card
    act(() => {
      buttonI!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });

    // 4. Selection is dismissed
    expect(store.matrixSession.previewFunctionId).toBeUndefined();
    expect(cardI?.classList.contains("is-selected")).toBe(false);

    act(() => root.unmount());
  });

  it("selects a chord card and dismisses selection by clicking on empty matrix background", () => {
    const { container, store, root } = renderHarness();
    const cardI = container.querySelector<HTMLElement>('[data-testid="chord-card-I"]');
    const buttonI = cardI?.querySelector<HTMLButtonElement>(".chord-main");
    const workbench = container.querySelector<HTMLElement>(".matrix-workbench");
    expect(workbench).not.toBeNull();

    // 1. Select card I
    act(() => buttonI!.click());
    expect(store.matrixSession.previewFunctionId).toBe("I");
    expect(cardI?.classList.contains("is-selected")).toBe(true);

    // 2. Click on empty workbench background
    act(() => {
      workbench!.click();
    });

    // 3. Selection is dismissed
    expect(store.matrixSession.previewFunctionId).toBeUndefined();
    expect(cardI?.classList.contains("is-selected")).toBe(false);

    act(() => root.unmount());
  });

  it("does not dismiss selection when clicking interactive elements in the toolbar", () => {
    const { container, store, root } = renderHarness();
    const cardI = container.querySelector<HTMLElement>('[data-testid="chord-card-I"]');
    const buttonI = cardI?.querySelector<HTMLButtonElement>(".chord-main");
    const selectView = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Global Card View"]',
    );
    expect(selectView).not.toBeNull();

    // 1. Select card I
    act(() => buttonI!.click());
    expect(store.matrixSession.previewFunctionId).toBe("I");
    expect(cardI?.classList.contains("is-selected")).toBe(true);

    // 2. Click on select in toolbar
    act(() => {
      selectView!.click();
    });

    // 3. Selection is preserved
    expect(store.matrixSession.previewFunctionId).toBe("I");
    expect(cardI?.classList.contains("is-selected")).toBe(true);

    act(() => root.unmount());
  });
});
