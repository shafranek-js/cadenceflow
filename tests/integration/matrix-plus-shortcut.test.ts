// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  addMatrixPreview,
  type AddMatrixPreviewCommand,
} from "../../src/app/commands/matrixCommands";
import {
  addBranchPreview,
  type AddBranchPreviewCommand,
} from "../../src/app/commands/branchCommands";
import { createDefaultProject } from "../../src/domain/project/factory";
import type { Project } from "../../src/domain/project/project";
import { HarmonicMatrix } from "../../src/ui/matrix/HarmonicMatrix";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderMatrix(
  project: Project,
  previewFunctionId?: string,
  addImplementation?: (functionId: string) => void,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onAdd = vi.fn(addImplementation);
  const onPreview = vi.fn();
  act(() => {
    root.render(
      createElement(HarmonicMatrix, {
        project,
        ...(previewFunctionId ? { previewFunctionId } : {}),
        recommendations: null,
        contextualFunctionIds: [],
        onPreview,
        onAdd,
        onGlobalView: vi.fn(),
        onModuleChange: vi.fn(),
        onTonicChange: vi.fn(),
        onTemplateOpen: vi.fn(),
        onTemplateReset: vi.fn(),
        onStaffOctaveChange: vi.fn(),
      }),
    );
  });
  return { container, root, onAdd, onPreview };
}

function press(target: Element, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
    );
  });
}

afterEach(() => document.body.replaceChildren());

describe("Matrix selected-card plus shortcut", () => {
  it("adds the selected visible card once for main-keyboard plus and Numpad Add", () => {
    const { container, root, onAdd, onPreview } = renderMatrix(createDefaultProject(), "V");
    const selectedCard = container.querySelector('[data-testid="chord-card-V"] .chord-main')!;

    press(selectedCard, { key: "+", code: "Equal", shiftKey: true });
    expect(onAdd).toHaveBeenLastCalledWith("V");
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledTimes(1);

    press(selectedCard, { key: "+", code: "NumpadAdd" });
    expect(onAdd).toHaveBeenLastCalledWith("V");
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(selectedCard.getAttribute("aria-label")).toContain("press plus to add");

    act(() => root.unmount());
  });

  it("works in Focus Mode and forwards temporary-branch adds through the same callback", () => {
    const project = createRichProjectFixture();
    const projectBefore = JSON.stringify(project);
    const { container, root, onAdd, onPreview } = renderMatrix(project, "V");
    const focusToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-focus-toggle"]',
    )!;
    act(() => focusToggle.click());

    press(container.querySelector('[data-testid="chord-card-V"] .chord-main')!, {
      key: "+",
      code: "NumpadAdd",
    });
    expect(project.temporaryBranch).toBeDefined();
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onPreview).toHaveBeenCalledWith("V");
    expect(onAdd).not.toHaveBeenCalled();
    expect(JSON.stringify(project)).toBe(projectBefore);

    act(() => root.unmount());
  });

  it("creates one history entry and preserves Undo/Redo through the existing add command", () => {
    const project = createDefaultProject("t211-history", "T211 History");
    const store = new AppStore(project);
    const { container, root, onAdd } = renderMatrix(project, "I", (functionId) => {
      const command: AddMatrixPreviewCommand = {
        type: "matrix/add-preview",
        payload: { functionId, stepId: "t211-step", nowIso: "2026-09-24T00:00:00.000Z" },
      };
      store.dispatch(command, addMatrixPreview);
    });

    press(container.querySelector('[data-testid="chord-card-I"] .chord-main')!, {
      key: "+",
      code: "NumpadAdd",
    });
    expect(onAdd).toHaveBeenCalledOnce();
    expect(store.project.progression.steps).toHaveLength(1);
    expect(store.canUndo).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.project.progression.steps).toHaveLength(0);
    expect(store.canRedo).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps).toHaveLength(1);

    act(() => root.unmount());
  });

  it("keeps the existing temporary-branch add reversible", () => {
    const store = new AppStore(createRichProjectFixture());
    const initialLength = store.project.temporaryBranch!.steps.length;
    const command: AddBranchPreviewCommand = {
      type: "branch/add-preview",
      payload: { functionId: "I", stepId: "t211-branch-step", nowIso: "2026-09-24T00:00:00.000Z" },
    };

    store.dispatch(command, addBranchPreview);
    expect(store.project.temporaryBranch?.steps).toHaveLength(initialLength + 1);
    expect(store.undo()).toBe(true);
    expect(store.project.temporaryBranch?.steps).toHaveLength(initialLength);
    expect(store.redo()).toBe(true);
    expect(store.project.temporaryBranch?.steps).toHaveLength(initialLength + 1);
  });

  it("does nothing without a visible selected card", () => {
    const { container, root, onAdd, onPreview } = renderMatrix(
      createDefaultProject(),
      "not-visible",
    );
    const panel = container.querySelector<HTMLElement>(".matrix-panel")!;
    press(panel, { key: "+", code: "Equal", shiftKey: true });

    expect(onAdd).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("guards editable, dialog, repeated, and modified events with a visible selection", () => {
    const { container, root, onAdd, onPreview } = renderMatrix(createDefaultProject(), "V");
    const panel = container.querySelector<HTMLElement>(".matrix-panel")!;

    const input = document.createElement("input");
    panel.appendChild(input);
    press(input, { key: "+", code: "Equal", shiftKey: true });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogButton = document.createElement("button");
    dialog.appendChild(dialogButton);
    panel.appendChild(dialog);
    press(dialogButton, { key: "+", code: "NumpadAdd" });

    for (const guarded of [
      { key: "+", code: "Equal", shiftKey: true, repeat: true },
      { key: "+", code: "NumpadAdd", ctrlKey: true },
      { key: "+", code: "NumpadAdd", altKey: true },
      { key: "+", code: "NumpadAdd", metaKey: true },
    ] satisfies KeyboardEventInit[]) {
      press(panel, guarded);
    }

    expect(onAdd).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
