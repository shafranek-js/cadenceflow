// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { ProgressionTrack } from "../../../src/ui/progression/ProgressionTrack";
import { getCadenceFormulaById } from "../../../src/domain/progression/cadenceFormulas";

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
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("Quick Starters in ProgressionTrack Empty State", () => {
  it("renders Quick Starters bar when progression is empty", () => {
    const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
    const applySpy = vi.fn();
    const openPresetsSpy = vi.fn();

    const { container, unmount } = mountToDom(
      el(ProgressionTrack, {
        project,
        onSelectStep: vi.fn(),
        onEditPerformance: vi.fn(),
        onSetProgressionView: vi.fn(),
        onRemove: vi.fn(),
        onReorder: vi.fn(),
        onApplyPreset: applySpy,
        onOpenPresets: openPresetsSpy,
      }),
    );

    const emptyState = container.querySelector('[data-testid="progression-empty-state"]');
    expect(emptyState).not.toBeNull();

    const startersBar = container.querySelector('[data-testid="quick-starters-container"]');
    expect(startersBar).not.toBeNull();
    expect(startersBar?.textContent).toContain("Quick Starters:");

    // In Major mode by default: Gospel Lift and Neo-Soul should be rendered
    const gospelBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="quick-starter-formula-gospel-lift"]',
    );
    expect(gospelBtn).not.toBeNull();
    expect(gospelBtn?.textContent).toContain("Gospel Lift");

    // Clicking Gospel Lift calls onApplyPreset with mode "replace"
    act(() => {
      gospelBtn?.click();
    });

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]?.[0]?.id).toBe("formula-gospel-lift");
    expect(applySpy.mock.calls[0]?.[1]).toBe("replace");

    // "More..." button opens Presets panel
    const moreBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="quick-starter-more-btn"]',
    );
    expect(moreBtn).not.toBeNull();
    act(() => {
      moreBtn?.click();
    });
    expect(openPresetsSpy).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("renders Dark Harmony quick starters when project active module is dark-harmony", () => {
    const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
    const darkProject = {
      ...baseProject,
      activeModule: "dark-harmony" as const,
    };
    const applySpy = vi.fn();

    const { container, unmount } = mountToDom(
      el(ProgressionTrack, {
        project: darkProject,
        onSelectStep: vi.fn(),
        onEditPerformance: vi.fn(),
        onSetProgressionView: vi.fn(),
        onRemove: vi.fn(),
        onReorder: vi.fn(),
        onApplyPreset: applySpy,
      }),
    );

    expect(container.textContent).toContain("Neapolitan Path");
    expect(container.textContent).toContain("Flamenco Descent");

    const neapolitanBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="quick-starter-formula-neapolitan-path"]',
    );
    expect(neapolitanBtn).not.toBeNull();

    act(() => {
      neapolitanBtn?.click();
    });

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy.mock.calls[0]?.[0]?.id).toBe("formula-neapolitan-path");
    expect(applySpy.mock.calls[0]?.[1]).toBe("replace");

    unmount();
  });
});
