// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { ModesExplorerModal } from "../../../src/ui/modes/ModesExplorerModal";

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

describe("ModesExplorerModal UI Component", () => {
  const project = createDefaultProject("test-project");

  it("does not render when isOpen is false", () => {
    const onClose = vi.fn();
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: false,
        project,
        onClose,
      }),
    );
    expect(mounted.container.querySelector(".modes-explorer-modal")).toBeNull();
    mounted.unmount();
  });

  it("renders when isOpen is true and shows 2D state machine selectors", () => {
    const onClose = vi.fn();
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: true,
        project,
        onClose,
      }),
    );

    const modal = mounted.container.querySelector(".modes-explorer-modal");
    expect(modal).not.toBeNull();

    // Title
    const title = mounted.container.querySelector("#modes-modal-title");
    expect(title?.textContent).toContain("Scales & Modes Explorer");

    // Tonic selector has 12 pills
    const tonicPills = mounted.container.querySelectorAll(".modes-tonic-pill");
    expect(tonicPills.length).toBe(12);

    // Scale pills exist
    const scalePills = mounted.container.querySelectorAll(".modes-scale-pill");
    expect(scalePills.length).toBeGreaterThanOrEqual(7);

    // Characteristic callout exists for default Dorian (♮6)
    const callout = mounted.container.querySelector(".modes-characteristic-callout");
    expect(callout?.textContent).toContain("♮6");

    mounted.unmount();
  });

  it("switches scale mode and updates characteristic tone when pill is clicked", () => {
    const onClose = vi.fn();
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: true,
        project,
        onClose,
      }),
    );

    // Find Lydian pill
    const pills = Array.from(mounted.container.querySelectorAll(".modes-scale-pill"));
    const lydianPill = pills.find((p) => p.textContent?.includes("Lydian"));
    expect(lydianPill).toBeDefined();

    act(() => {
      lydianPill?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Check banner updated to Lydian with ♯4
    const callout = mounted.container.querySelector(".modes-characteristic-callout");
    expect(callout?.textContent).toContain("♯4");

    const bannerTitle = mounted.container.querySelector(".modes-banner-title");
    expect(bannerTitle?.textContent).toContain("Lydian");

    mounted.unmount();
  });

  it("calls onAuditionScaleNotes when Play Scale is clicked", () => {
    const onClose = vi.fn();
    const onAuditionScaleNotes = vi.fn();
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: true,
        project,
        onClose,
        onAuditionScaleNotes,
      }),
    );

    const playScaleBtn = mounted.container.querySelector(".modes-play-scale-btn");
    expect(playScaleBtn).not.toBeNull();

    act(() => {
      playScaleBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAuditionScaleNotes).toHaveBeenCalledOnce();
    const args = onAuditionScaleNotes.mock.calls[0]?.[0];
    expect(args).toHaveLength(8); // 7 notes + 1 octave return

    mounted.unmount();
  });

  it("calls onApplyFormulaToProgression when Apply to Progression is clicked", () => {
    const onClose = vi.fn();
    const onApplyFormulaToProgression = vi.fn();
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: true,
        project,
        onClose,
        onApplyFormulaToProgression,
      }),
    );

    const applyBtn = mounted.container.querySelector(".formula-apply-btn");
    expect(applyBtn).not.toBeNull();

    act(() => {
      applyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onApplyFormulaToProgression).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    mounted.unmount();
  });

  it("explains an invalid old-key apply and exposes an explicit switch-key retry", () => {
    const onClose = vi.fn();
    const onApplyFormulaToProgression = vi.fn((_formula, _tonic, switchKey) =>
      switchKey
        ? { success: true as const }
        : {
            success: false as const,
            reason:
              "The formula requires Bb major. Switch the project key to preserve its pitches.",
          },
    );
    const mounted = mount(
      el(ModesExplorerModal, {
        isOpen: true,
        project,
        onClose,
        onApplyFormulaToProgression,
      }),
    );

    const keyChoice = mounted.container.querySelector<HTMLInputElement>(
      ".modes-switch-key-label input",
    );
    act(() => keyChoice?.click());
    const applyButton = mounted.container.querySelector<HTMLButtonElement>(".formula-apply-btn");
    act(() => applyButton?.click());

    expect(onApplyFormulaToProgression).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain("B♭ major");

    const retryButton = mounted.container.querySelector<HTMLButtonElement>(
      ".modes-switch-and-apply-button",
    );
    expect(retryButton).not.toBeNull();
    act(() => retryButton?.click());

    expect(onApplyFormulaToProgression.mock.calls[0]?.[2]).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    mounted.unmount();
  });
});
