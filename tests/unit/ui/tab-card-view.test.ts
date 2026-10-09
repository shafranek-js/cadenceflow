// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { TabCardView } from "../../../src/ui/guitar/TabCardView";
import type { ChordDefinition } from "../../../src/domain/harmony/chord";

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

const mockCChord: ChordDefinition = {
  rootPitchClass: 0,
  baseQuality: "major",
  variant: {
    extensions: [],
    suspensions: [],
    alterations: [],
  },
  spelling: {
    symbol: "C",
    root: { step: "C", alter: 0 },
  },
  harmonicFunction: {
    functionId: "I",
    moduleId: "progressions",
    category: "core",
  },
};

describe("TabCardView", () => {
  it("shows a clear message instead of an empty fingering for unsupported seven-tone chords", () => {
    const chord: ChordDefinition = {
      ...mockCChord,
      variant: {
        seventh: "minor7",
        extensions: [9, 11, 13],
        suspensions: [],
        alterations: [],
      },
    };
    const { container, unmount } = mount(el(TabCardView, { chord, chordLabel: "C7(9,11,13)" }));

    expect(container.querySelector('[role="status"]')?.textContent).toMatch(
      /No matching fingering/i,
    );
    expect(container.querySelector(".guitar-tab-svg")).toBeNull();
    unmount();
  });

  it("renders 6 string lines, TAB clef, chord symbol, and fret badges", () => {
    const { container, unmount } = mount(
      el(TabCardView, {
        chord: mockCChord,
        chordLabel: "C",
        playing: false,
      }),
    );

    const card = container.querySelector(".mini-tab-card-visual");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-testid")).toBe("mini-tab-card-visual");

    const svg = container.querySelector(".guitar-tab-svg");
    expect(svg).not.toBeNull();

    // 6 horizontal string lines
    const stringLines = container.querySelectorAll(".guitar-tab-line");
    expect(stringLines).toHaveLength(6);

    // TAB clef text
    const tabTexts = Array.from(container.querySelectorAll(".guitar-tab-clef-text")).map(
      (t) => t.textContent,
    );
    expect(tabTexts).toEqual(["T", "A", "B"]);

    // Fret numbers for C chord (strings 1 to 6: 0, 1, 0, 2, 3, ×)
    const fretTexts = Array.from(container.querySelectorAll(".guitar-tab-fret-num")).map(
      (t) => t.textContent,
    );
    expect(fretTexts).toEqual(["0", "1", "0", "2", "3", "×"]);

    unmount();
  });

  it("applies is-playing style when active", () => {
    const { container, unmount } = mount(
      el(TabCardView, {
        chord: mockCChord,
        chordLabel: "C",
        playing: true,
      }),
    );

    const card = container.querySelector(".mini-tab-card-visual");
    expect(card?.classList.contains("is-playing")).toBe(true);

    unmount();
  });
});
