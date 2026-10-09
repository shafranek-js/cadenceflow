import { requireValue, requireChord } from "../../fixtures/assertions";
// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { snapshotChordMelody } from "../../../src/domain/melody/types";
import { createProgressionMeasureLayout } from "../../../src/domain/timing/measureLayout";
import { createMelodyTimeline } from "../../../src/notation/melodyStaffProjection";
import { InlineMelodyLane } from "../../../src/ui/melody/InlineMelodyLane";

const el = React.createElement;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("T206 InlineMelodyLane", () => {
  it("uses exact measure segments, preserves ownership, and exposes roles without color", () => {
    const base = createRichProjectFixture();
    const first = requireChord(base.progression.steps[0]);
    const second = requireChord(base.progression.steps[1]);
    const project = Object.freeze({
      ...base,
      presentation: Object.freeze({ ...base.presentation, noteColorMode: "standard" as const }),
      progression: Object.freeze({
        ...base.progression,
        steps: Object.freeze([
          Object.freeze({ ...first, melodyInstrumentOverride: "cello" as const }),
          Object.freeze({
            ...second,
            melody: snapshotChordMelody({
              pitchMotion: "up",
              grid: "quarter",
              octaveOffset: 0,
              rhythm: "even",
              connection: "retrigger",
            }),
            melodyInstrumentOverride: "violin" as const,
          }),
        ]),
      }),
    });
    const timeline = createMelodyTimeline(project);
    const measure = requireValue(
      createProgressionMeasureLayout(project.progression.steps, project.globalTiming.meter)
        .measures[0],
    )!;
    const select = vi.fn();
    const openEditor = vi.fn();
    const before = JSON.stringify(project);
    const mounted = mount(
      el(InlineMelodyLane, {
        project,
        timeline,
        measure,
        onSelectStep: select,
        onOpenMelodyEditor: openEditor,
      }),
    );

    expect(mounted.container.querySelectorAll('[data-testid="melody-lane-row"]')).toHaveLength(2);
    const notes = Array.from(
      mounted.container.querySelectorAll<HTMLButtonElement>('[data-testid="melody-lane-note"]'),
    );
    expect(notes.length).toBeGreaterThan(0);
    expect(new Set(notes.map((note) => note.dataset.sourceStepId)).size).toBe(1);
    expect(notes.every((note) => note.dataset.sourceStepId === "step-1")).toBe(true);
    expect(
      notes.every((note) => {
        const label = note.getAttribute("aria-label") ?? "";
        return (
          /pitch /.test(label) && /primary role /.test(label) && /target-next: (yes|no)/.test(label)
        );
      }),
    ).toBe(true);
    expect(notes[0]?.textContent).toMatch(/root|chord|scale|altered/);

    const laneTracks = Array.from(
      mounted.container.querySelectorAll<HTMLElement>('[data-testid="melody-lane-track"]'),
    );
    for (const track of laneTracks) {
      const total = Array.from(
        track.querySelectorAll<HTMLElement>(":scope > .inline-melody-lane-column"),
      )
        .map((segment) => {
          const [numerator, denominator] = (segment.dataset.durationBeats ?? "0/1")
            .split("/")
            .map(Number);
          return requireValue(numerator) / requireValue(denominator);
        })
        .reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(3.5, 8);
      expect(track.dataset.axisStartBeats).toBe("0/1");
      expect(track.dataset.axisEndBeats).toBe("7/2");
    }

    const note = notes[0]!;
    act(() => note.click());
    expect(select).toHaveBeenCalledWith("step-1");
    act(() => {
      note.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    expect(openEditor).toHaveBeenCalledWith("step-1", note);
    expect(JSON.stringify(project)).toBe(before);

    mounted.unmount();
  });
});
