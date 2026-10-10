// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { ProgressionTrack } from "../../../src/ui/progression/ProgressionTrack";
import { TransportStore } from "../../../src/ui/transport/transportStore";

const el = React.createElement;

function renderTrack(overrides: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const project = createDefaultProject("t205", "T205", "2026-09-30T00:00:00.000Z");

  act(() => {
    root.render(
      el(ProgressionTrack, {
        project,
        transportStore: new TransportStore(),
        onSelectStep: vi.fn(),
        onEditPerformance: vi.fn(),
        onSetStepDuration: vi.fn(),
        onDurationResizeStatusChange: vi.fn(),
        onSetProgressionView: vi.fn(),
        onRemove: vi.fn(),
        onReorder: vi.fn(),
        ...overrides,
      }),
    );
  });

  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("T205 Guided Start", () => {
  it("offers blank, guided, quick starter, and example entry paths", () => {
    const applyPreset = vi.fn();
    const onOpenPresets = vi.fn();
    const onFocusMatrixKey = vi.fn();
    const { container, unmount } = renderTrack({
      onApplyPreset: applyPreset,
      onOpenPresets,
      onFocusMatrixKey,
    });

    expect(container.querySelector('[data-testid="guided-start"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="guided-start-path-blank"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="guided-start-path-guided"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="guided-start-path-quick-starter"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="guided-start-path-example"]')).not.toBeNull();

    const guided = container.querySelector<HTMLButtonElement>(
      '[data-testid="guided-start-guided"]',
    );
    act(() => guided?.click());
    expect(container.querySelector('[data-testid="guided-start-flow"]')).not.toBeNull();
    expect(applyPreset).not.toHaveBeenCalled();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="guided-start-focus-key"]')?.click(),
    );
    expect(onFocusMatrixKey).toHaveBeenCalledTimes(1);

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="guided-start-guided-back"]')
        ?.click(),
    );
    expect(container.querySelector('[data-testid="guided-start-paths"]')).not.toBeNull();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="guided-start-blank"]')?.click(),
    );
    expect(applyPreset).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="guided-start"]')).toBeNull();
    expect(container.querySelector('[data-testid="progression-empty-dismissed"]')).not.toBeNull();
    expect(onOpenPresets).not.toHaveBeenCalled();
    unmount();
  });

  it("routes quick starter and example through one preset apply callback each", () => {
    const applyPreset = vi.fn();
    const { container, unmount } = renderTrack({ onApplyPreset: applyPreset });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-guided-start-quick-starter="true"]')
        ?.click();
    });
    expect(applyPreset).toHaveBeenCalledTimes(1);
    expect(applyPreset.mock.calls[0]?.[0]?.source).toBe("builtIn");
    expect(applyPreset.mock.calls[0]?.[1]).toBe("replace");

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="guided-start-example"]')?.click(),
    );
    expect(applyPreset).toHaveBeenCalledTimes(2);
    expect(applyPreset.mock.calls[1]?.[0]?.id).toBe("builtin-major-i-vi-iv-v");
    expect(applyPreset.mock.calls[1]?.[1]).toBe("replace");
    unmount();
  });
});
