// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { ModulationModal } from "../../../src/ui/modulation/ModulationModal";

const el = React.createElement;

function mountToDom(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    rerender: (next: React.ReactElement) => {
      act(() => {
        root.render(next);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("ModulationModal UI", () => {
  const baseProject = createDefaultProject("test-project");

  it("does not render into DOM when closed", () => {
    const { container, unmount } = mountToDom(
      el(ModulationModal, {
        isOpen: false,
        project: baseProject,
        onClose: vi.fn(),
        onAuditionPath: vi.fn(),
        onStopAudition: vi.fn(),
        onApplyBridge: vi.fn(),
      }),
    );

    expect(container.querySelector(".modulation-modal")).toBeNull();
    unmount();
  });

  it("renders header with current source key and target key selector when open", () => {
    const { container, unmount } = mountToDom(
      el(ModulationModal, {
        isOpen: true,
        project: baseProject,
        onClose: vi.fn(),
        onAuditionPath: vi.fn(),
        onStopAudition: vi.fn(),
        onApplyBridge: vi.fn(),
      }),
    );

    expect(container.textContent).toContain("Modulation Master & Key Transitions");
    expect(container.textContent).toContain("Current Key:");
    expect(container.textContent).toContain("C Major");

    // Check chromatic key pills
    const pills = Array.from(container.querySelectorAll(".key-pill"));
    expect(pills.length).toBe(12);

    const gPill = pills.find((p) => p.textContent === "G");
    expect(gPill).toBeDefined();

    unmount();
  });

  it("filters pathways by category tabs", () => {
    const { container, unmount } = mountToDom(
      el(ModulationModal, {
        isOpen: true,
        project: baseProject,
        onClose: vi.fn(),
        onAuditionPath: vi.fn(),
        onStopAudition: vi.fn(),
        onApplyBridge: vi.fn(),
      }),
    );

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>(".mod-tab-btn"));
    const turnaroundTab = tabs.find((t) => t.textContent?.includes("Jazz Turnaround"));
    expect(turnaroundTab).toBeDefined();

    act(() => {
      turnaroundTab?.click();
    });

    // Only turnaround paths should be present
    const cards = Array.from(container.querySelectorAll<HTMLElement>(".modulation-path-card"));
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards[0]?.getAttribute("data-testid")).toContain("jazz-turnaround");

    unmount();
  });

  it("triggers audition and stop audition on path cards", () => {
    const onAuditionPath = vi.fn();
    const onStopAudition = vi.fn();

    const { container, rerender, unmount } = mountToDom(
      el(ModulationModal, {
        isOpen: true,
        project: baseProject,
        onClose: vi.fn(),
        onAuditionPath,
        onStopAudition,
        onApplyBridge: vi.fn(),
      }),
    );

    const auditionBtn = container.querySelector<HTMLButtonElement>(".mod-audition-btn");
    expect(auditionBtn).not.toBeNull();

    act(() => {
      auditionBtn?.click();
    });

    expect(onAuditionPath).toHaveBeenCalledTimes(1);
    const calledPath = onAuditionPath.mock.calls[0]![0];

    // Rerender with auditioning active
    rerender(
      el(ModulationModal, {
        isOpen: true,
        project: baseProject,
        onClose: vi.fn(),
        onAuditionPath,
        onStopAudition,
        auditioningPathId: calledPath.id,
        onApplyBridge: vi.fn(),
      }),
    );

    const activeAuditionBtn = container.querySelector<HTMLButtonElement>(
      ".mod-audition-btn.is-playing",
    );
    expect(activeAuditionBtn).not.toBeNull();
    expect(activeAuditionBtn?.textContent).toContain("Stop");

    act(() => {
      activeAuditionBtn?.click();
    });

    expect(onStopAudition).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("applies modulation bridge with insertion options", () => {
    const onApplyBridge = vi.fn();
    const onClose = vi.fn();

    const { container, unmount } = mountToDom(
      el(ModulationModal, {
        isOpen: true,
        project: baseProject,
        onClose,
        onAuditionPath: vi.fn(),
        onStopAudition: vi.fn(),
        onApplyBridge,
      }),
    );

    // Toggle switch key checkbox
    const switchKeyInput = container.querySelector<HTMLInputElement>(
      ".switch-key-checkbox-label input[type='checkbox']",
    );
    expect(switchKeyInput).not.toBeNull();

    act(() => {
      switchKeyInput?.click();
    });

    const applyBtn = container.querySelector<HTMLButtonElement>(".mod-apply-btn");
    expect(applyBtn).not.toBeNull();

    act(() => {
      applyBtn?.click();
    });

    expect(onApplyBridge).toHaveBeenCalledTimes(1);
    expect(onApplyBridge.mock.calls[0]![1]).toBe("append"); // default insertMode
    expect(onApplyBridge.mock.calls[0]![2]).toBe(true); // switchKey checked
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
  });
});
