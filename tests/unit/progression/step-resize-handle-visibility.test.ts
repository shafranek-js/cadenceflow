// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { ProgressionView } from "../../../src/domain/project/project";
import { ProgressionTrack } from "../../../src/ui/progression/ProgressionTrack";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.();
});

function renderTrack(view: ProgressionView) {
  const base = createDefaultProject("resize-views", "Resize views", "2026-10-06T00:00:00.000Z");
  const steps = ["s0", "s1"].map((id) => createMatrixChordStep(base, "I", id));
  const store = new AppStore({
    ...base,
    presentation: { ...base.presentation, progressionView: view, measuresPerSystem: 2 },
    progression: Object.freeze({ ...base.progression, steps: Object.freeze(steps) }),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(ProgressionTrack, {
        project: store.project,
        onSelectStep: () => undefined,
        onClearSelection: () => undefined,
        onEditPerformance: () => undefined,
        onSetStepDuration: () => undefined,
        onSetProgressionView: () => undefined,
        onRemove: () => undefined,
        onReorder: () => undefined,
      }),
    ),
  );
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

describe("step resize handle visibility", () => {
  it("does not offer a resize handle in the Staff or Tablature views", () => {
    // Step resizing is done in the piano-roll, which drags a boundary on the measure itself. In these
    // two views the handle rendered as a stray control beside every chord.
    for (const view of ["staff", "tablature"] as const) {
      const container = renderTrack(view);
      expect(
        container.querySelectorAll("[data-duration-resize-handle]").length,
        `${view} resize handles`,
      ).toBe(0);
      // The view really did render, so a zero count is not an empty tree. Staff and Tablature draw
      // notation instead of the card grid, so the score system is what proves they rendered.
      expect(
        container.querySelectorAll('[data-testid="progression-score-system"]').length,
        `${view} score system`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps offering it where the piano-roll is not the tool", () => {
    // A card view still has no piano-roll to resize in, so the handle stays available there. This
    // guards against the gate turning into a blanket removal.
    const container = renderTrack("harmonic");
    expect(container.querySelectorAll("[data-duration-resize-handle]").length).toBeGreaterThan(0);
  });
});
