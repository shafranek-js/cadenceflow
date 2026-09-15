// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { GuitarCardView } from "../../../src/ui/guitar/GuitarCardView";
import { GuitarFretboard } from "../../../src/ui/guitar/GuitarFretboard";
import { resolveGuitarChordVoicing } from "../../../src/domain/instruments/guitar/voicings";
import { ChordCard } from "../../../src/ui/chord-card/ChordCard";
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
    category: "tonic",
    degree: "I",
  },
};

const mockFChord: ChordDefinition = {
  rootPitchClass: 5,
  baseQuality: "major",
  variant: {
    extensions: [],
    suspensions: [],
    alterations: [],
  },
  spelling: {
    symbol: "F",
    root: { step: "F", alter: 0 },
  },
  harmonicFunction: {
    functionId: "IV",
    moduleId: "progressions",
    category: "subdominant",
    degree: "IV",
  },
};

describe("GuitarCardView & GuitarFretboard", () => {
  it("renders open C major chord with nut, mute on 6th string, and root dot", () => {
    const mounted = mount(
      el(GuitarCardView, {
        chord: mockCChord,
        chordLabel: "C",
      }),
    );

    const card = mounted.container.querySelector('[data-testid="mini-guitar-card-visual"]');
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-chord-symbol")).toBe("C");
    expect(card?.getAttribute("data-base-fret")).toBe("1");

    const svg = mounted.container.querySelector('[data-testid="guitar-fretboard-svg"]');
    expect(svg).not.toBeNull();

    // Nut is present for base fret 1
    const nut = mounted.container.querySelector(".guitar-nut");
    expect(nut).not.toBeNull();

    // Muted Low E string (index 0)
    const mutedMarker = mounted.container.querySelector(".guitar-string-marker.is-muted");
    expect(mutedMarker).not.toBeNull();

    // Open G & high E strings
    const openMarkers = mounted.container.querySelectorAll(".guitar-string-marker.is-open");
    expect(openMarkers.length).toBeGreaterThanOrEqual(1);

    // Root dot
    const rootDot = mounted.container.querySelector(".guitar-dot-root");
    expect(rootDot).not.toBeNull();

    mounted.unmount();
  });

  it("renders F major barre chord with barre bar", () => {
    const mounted = mount(
      el(GuitarCardView, {
        chord: mockFChord,
        chordLabel: "F",
      }),
    );

    const barre = mounted.container.querySelector(".guitar-barre");
    expect(barre).not.toBeNull();
    expect(barre?.getAttribute("aria-label")).toContain("Barre fret 1");

    mounted.unmount();
  });

  it("renders scale tones when showScaleTones is true", () => {
    const mounted = mount(
      el(GuitarCardView, {
        chord: mockCChord,
        chordLabel: "C",
        scalePitchClasses: [0, 2, 4, 5, 7, 9, 11], // C Major
        showScaleTones: true,
      }),
    );

    const scaleDots = mounted.container.querySelectorAll(".guitar-dot-scale-tone");
    expect(scaleDots.length).toBeGreaterThan(0);

    mounted.unmount();
  });

  it("integrates seamlessly inside ChordCard when view='guitar'", () => {
    const mounted = mount(
      el(ChordCard, {
        model: {
          chord: mockCChord,
          pianoPitches: [],
          realizedPitches: [],
          duration: { beats: { numerator: 4, denominator: 1 } },
          canRaiseStaffOctave: false,
          canLowerStaffOctave: false,
          recommendationStatus: "none",
        },
        view: "guitar",
        selected: false,
        customizedCount: 0,
        onSelect: () => {},
        onAltClickReset: () => {},
        onCtrlClickAdd: () => {},
        onStaffOctaveChange: () => {},
      }),
    );

    const guitarCard = mounted.container.querySelector('[data-testid="mini-guitar-card-visual"]');
    expect(guitarCard).not.toBeNull();

    mounted.unmount();
  });
});
