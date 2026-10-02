// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { QuickChordPalette } from "../../../src/ui/matrix/QuickChordPalette";
import type { QuickChordCandidate } from "../../../src/domain/recommendations/quickChord";

const el = React.createElement;

const candidate: QuickChordCandidate = {
  functionId: "V7/V",
  chordLabel: "D7",
  categoryLabel: "Secondary dominant",
  title: "Double dominant",
  explanation: "Directed target: V.",
  routeStatus: "allowed",
  routeReasonCode: "directed-tension-target",
  searchText: "v7/v d7 secondary dominant double dominant directed target v",
};

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onPreview = vi.fn();
  const onApply = vi.fn(() => false);
  const onClose = vi.fn();
  act(() => {
    root.render(
      el(QuickChordPalette, {
        candidates: [candidate],
        onPreview,
        onApply,
        onClose,
      }),
    );
  });
  return {
    container,
    onPreview,
    onApply,
    onClose,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("T204 Quick Chord palette", () => {
  it("keeps pointer preview separate from Apply and sends Enter to the same Apply callback", () => {
    const mounted = mount();
    const result = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="quick-chord-candidate-V7-V"]',
    );
    expect(result).not.toBeNull();

    act(() => result!.click());
    expect(mounted.onPreview).toHaveBeenCalledWith("V7/V");
    expect(mounted.onApply).not.toHaveBeenCalled();

    act(() => {
      result!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(mounted.onApply).toHaveBeenCalledTimes(1);
    expect(mounted.onApply).toHaveBeenCalledWith("V7/V");
    mounted.unmount();
  });

  it("closes on Escape without owning any Project mutation", () => {
    const mounted = mount();
    act(() => {
      mounted.container
        .querySelector('[data-testid="quick-chord-palette"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(mounted.onClose).toHaveBeenCalledTimes(1);
    expect(mounted.onPreview).not.toHaveBeenCalled();
    expect(mounted.onApply).not.toHaveBeenCalled();
    mounted.unmount();
  });
});
