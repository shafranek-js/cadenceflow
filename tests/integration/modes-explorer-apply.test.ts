// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  createModesFormulaSteps,
  applyModesFormula,
} from "../../src/app/commands/modesExplorerCommands";
import {
  CANONICAL_MODAL_FORMULAS,
  getModalParentKeyAndFunction,
} from "../../src/domain/harmony/modes";
import { createDefaultProject } from "../../src/domain/project/factory";
import { ModesExplorerModal } from "../../src/ui/modes/ModesExplorerModal";

const el = React.createElement;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Modes Explorer mutation boundary", () => {
  it("keeps selection, preview, audition, and cancel outside Project/history", () => {
    const project = createDefaultProject("modes-explorer-nonmutating-test");
    const store = new AppStore(project);
    const onAuditionFormula = vi.fn();
    const onClose = vi.fn();
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: true,
        project: store.project,
        onClose,
        onAuditionFormula,
      }),
    );

    const tonicPill = mounted.container.querySelectorAll<HTMLButtonElement>(".modes-tonic-pill")[2];
    act(() => tonicPill?.click());
    const auditionButton =
      mounted.container.querySelector<HTMLButtonElement>(".formula-audition-btn");
    act(() => auditionButton?.click());
    const doneButton = Array.from(
      mounted.container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.trim() === "Done");
    act(() => doneButton?.click());

    expect(onAuditionFormula).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(store.project).toBe(project);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
    mounted.unmount();
  });

  it("routes Apply through one command and offers an explicit switch-key retry after rejection", () => {
    const project = createDefaultProject("modes-explorer-apply-ui-test");
    const store = new AppStore(project);
    const onClose = vi.fn();
    const formula = CANONICAL_MODAL_FORMULAS.find((item) => item.id === "dorian-funk-vamp")!;
    const parentTonic = getModalParentKeyAndFunction(0, formula.modeId, 1).parentTonic;
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: true,
        project: store.project,
        onClose,
        onApplyFormulaToProgression: (selectedFormula, modalTonic, switchKey) => {
          const selectedParent = getModalParentKeyAndFunction(
            modalTonic,
            selectedFormula.modeId,
            1,
          ).parentTonic;
          if (!switchKey && project.tonic !== selectedParent) {
            return {
              success: false,
              reason: "Switch the project key to Bb major to preserve this formula.",
            };
          }
          const steps = createModesFormulaSteps(
            store.project,
            selectedFormula,
            modalTonic,
            selectedFormula.steps.map((_, index) => `apply-${index}`),
          );
          store.dispatch(
            {
              type: "modes/apply-formula",
              payload: {
                formulaId: selectedFormula.id,
                modeId: selectedFormula.modeId,
                modalTonic,
                parentTonic: selectedParent,
                switchKey,
                steps,
                nowIso: "2026-09-23T00:00:00.000Z",
              },
            },
            applyModesFormula,
          );
          return { success: true };
        },
      }),
    );

    const keyChoice = mounted.container.querySelector<HTMLInputElement>(
      ".modes-switch-key-label input",
    );
    act(() => keyChoice?.click());
    const applyButton = mounted.container.querySelector<HTMLButtonElement>(".formula-apply-btn");
    act(() => applyButton?.click());

    expect(store.project).toBe(project);
    expect(store.canUndo).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain(
      "Switch the project key to B♭",
    );

    const retryButton = mounted.container.querySelector<HTMLButtonElement>(
      ".modes-switch-and-apply-button",
    );
    expect(retryButton).not.toBeNull();
    act(() => retryButton?.click());

    expect(store.project.tonic).toBe(parentTonic);
    expect(store.project.progression.steps.map((step) => step.id)).toEqual([
      "apply-0",
      "apply-1",
      "apply-2",
    ]);
    expect(store.canUndo).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    mounted.unmount();
  });
});
