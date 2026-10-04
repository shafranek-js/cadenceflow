// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { GuitarCardView } from "../../../src/ui/guitar/GuitarCardView";
import { GuitarFretboard } from "../../../src/ui/guitar/GuitarFretboard";
import { resolveGuitarChordVoicing } from "../../../src/domain/instruments/guitar/voicings";
import { GUITAR_FINGER_COLORS } from "../../../src/domain/instruments/guitar/fingerColors";
import { ChordCard } from "../../../src/ui/chord-card/ChordCard";
import type { ChordDefinition } from "../../../src/domain/harmony/chord";

const el = React.createElement;

function rgb(hex: string): string {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16));
  return `rgb(${channels?.join(", ") ?? ""})`;
}

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

  it.each(["vertical", "horizontal"] as const)(
    "marks open root strings with a red-outline class in %s orientation",
    (orientation) => {
      const voicing = resolveGuitarChordVoicing({
        rootPitchClass: 4,
        baseQuality: "major",
        spelling: { symbol: "E", root: { step: "E", alter: 0 } },
      });
      const mounted = mount(el(GuitarFretboard, { voicing, orientation }));
      const openMarkers = Array.from(
        mounted.container.querySelectorAll<SVGCircleElement>(".guitar-string-marker.is-open"),
      );

      expect(openMarkers).toHaveLength(3);
      expect(openMarkers.filter((marker) => marker.classList.contains("is-root"))).toHaveLength(2);
      expect(
        openMarkers.find((marker) =>
          marker.getAttribute("aria-label")?.startsWith("String 6 open, chord root"),
        ),
      ).toBeDefined();
      expect(
        openMarkers
          .find((marker) => marker.getAttribute("aria-label")?.startsWith("String 2 open"))
          ?.classList.contains("is-root"),
      ).toBe(false);

      mounted.unmount();
    },
  );

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

  it.each(["vertical", "horizontal"] as const)(
    "uses each known finger color and keeps its number visible in %s orientation",
    (orientation) => {
      const voicing = resolveGuitarChordVoicing({
        rootPitchClass: 0,
        baseQuality: "dominant",
        spelling: { symbol: "C7", root: { step: "C", alter: 0 } },
        isSeventh: true,
      });
      const originalVoicing = JSON.stringify(voicing);
      const mounted = mount(
        el(GuitarFretboard, {
          voicing,
          orientation,
          colorMode: "fingering",
          showFingerings: false,
        }),
      );
      const svg = mounted.container.querySelector("svg");
      expect(svg?.getAttribute("data-color-mode")).toBe("fingering");
      expect(svg?.getAttribute("aria-label")).toContain(
        "fingers 1 Index, 2 Middle, 3 Ring, and 4 Pinky",
      );
      expect(svg?.getAttribute("aria-label")).toContain("finger 1 (Index)");

      const fingeringMarkers = Array.from(
        mounted.container.querySelectorAll<SVGCircleElement>(".guitar-dot-finger"),
      );
      const fingers = fingeringMarkers
        .map((marker) => marker.getAttribute("data-finger"))
        .filter((finger): finger is string => finger !== null)
        .sort();
      expect(fingers).toEqual(["1", "2", "3", "4"]);
      expect(
        fingeringMarkers
          .map((marker) => ({
            finger: marker.getAttribute("data-finger"),
            color: marker.style.fill,
          }))
          .sort((a, b) => Number(a.finger) - Number(b.finger)),
      ).toEqual(
        ([1, 2, 3, 4] as const).map((finger) => ({
          finger: String(finger),
          color: rgb(GUITAR_FINGER_COLORS[finger]),
        })),
      );
      expect(
        mounted.container.querySelectorAll(".guitar-dot-finger-text.is-fingering-color"),
      ).toHaveLength(4);
      expect(JSON.stringify(voicing)).toBe(originalVoicing);

      mounted.unmount();
    },
  );

  it.each(["vertical", "horizontal"] as const)(
    "shows open roots as neutral in fingering mode and retains the role-mode red outline in %s orientation",
    (orientation) => {
      const voicing = resolveGuitarChordVoicing({
        rootPitchClass: 4,
        baseQuality: "major",
        spelling: { symbol: "E", root: { step: "E", alter: 0 } },
      });
      const mounted = mount(el(GuitarFretboard, { voicing, orientation, colorMode: "fingering" }));
      const openRoots = Array.from(
        mounted.container.querySelectorAll<SVGCircleElement>(".guitar-string-marker.is-open"),
      ).filter((marker) => marker.getAttribute("aria-label")?.includes("chord root"));
      expect(openRoots).toHaveLength(2);
      expect(openRoots.every((marker) => marker.classList.contains("is-neutral"))).toBe(true);
      expect(openRoots.every((marker) => !marker.classList.contains("is-root"))).toBe(true);
      expect(openRoots[0]?.getAttribute("aria-label")).toContain("no fretting finger");
      mounted.unmount();
    },
  );

  it("keeps unsupported or missing fingering neutral without inventing a finger number", () => {
    const voicing = resolveGuitarChordVoicing({
      rootPitchClass: 0,
      baseQuality: "dominant",
      spelling: { symbol: "C7", root: { step: "C", alter: 0 } },
      isSeventh: true,
    });
    let frettedIndex = 0;
    const voicingWithUnknownFinger = {
      ...voicing,
      items: voicing.items.map((item) => {
        if (item.fret <= 0) return item;
        frettedIndex += 1;
        if (frettedIndex === 1) return { ...item, finger: 7 };
        if (frettedIndex === 2) return { ...item, finger: undefined };
        return item;
      }),
    };
    const suppliedVoicingSnapshot = JSON.stringify(voicingWithUnknownFinger);
    const mounted = mount(
      el(GuitarFretboard, {
        voicing: voicingWithUnknownFinger,
        orientation: "horizontal",
        colorMode: "fingering",
      }),
    );
    expect(mounted.container.querySelectorAll(".guitar-dot-finger.is-finger-unknown")).toHaveLength(
      2,
    );
    expect(mounted.container.querySelectorAll(".guitar-dot-finger-text")).toHaveLength(2);
    expect(mounted.container.querySelector("svg")?.getAttribute("aria-label")).toContain(
      "fingering unavailable",
    );
    expect(JSON.stringify(voicingWithUnknownFinger)).toBe(suppliedVoicingSnapshot);
    mounted.unmount();
  });

  it("keeps role colors as the default and renders the compact accessible fingering legend only in fingering mode", () => {
    const roles = mount(el(GuitarCardView, { chord: mockCChord, chordLabel: "C" }));
    const roleCard = roles.container.querySelector<HTMLElement>(".mini-guitar-card-visual");
    const roleSvg = roles.container.querySelector("svg");
    expect(roleSvg?.getAttribute("data-color-mode")).toBe("chord-roles");
    expect(roles.container.querySelector(".guitar-fingering-legend")).toBeNull();
    expect(roles.container.querySelector(".guitar-dot-root")).not.toBeNull();
    roles.unmount();

    const fingering = mount(
      el(GuitarCardView, { chord: mockCChord, chordLabel: "C", colorMode: "fingering" }),
    );
    const fingeringCard = fingering.container.querySelector<HTMLElement>(
      ".mini-guitar-card-visual",
    );
    expect(fingeringCard?.getAttribute("data-frets")).toBe(roleCard?.getAttribute("data-frets"));
    expect(fingeringCard?.getAttribute("data-base-fret")).toBe(
      roleCard?.getAttribute("data-base-fret"),
    );
    const legend = fingering.container.querySelector<HTMLElement>(".guitar-fingering-legend");
    expect(legend?.getAttribute("aria-label")).toBe("Guitar finger color legend");
    expect(legend?.textContent).toContain("Index");
    expect(legend?.textContent).toContain("Pinky");
    fingering.unmount();
  });

  it("renders exact string-aligned fret numbers at bottom under each string in vertical mode", () => {
    const mounted = mount(
      el(GuitarCardView, {
        chord: mockCChord,
        chordLabel: "C",
        orientation: "vertical",
      }),
    );

    const fretNumbers = mounted.container.querySelectorAll(".guitar-fret-number");
    expect(fretNumbers.length).toBe(6);

    // STRING_X for 6 strings: [20, 36, 52, 68, 84, 100]
    const expectedX = ["20", "36", "52", "68", "84", "100"];
    fretNumbers.forEach((el, idx) => {
      expect(el.getAttribute("x")).toBe(expectedX[idx]);
    });

    // C Major open shape: x 3 2 0 1 0
    const texts = Array.from(fretNumbers).map((el) => el.textContent?.trim());
    expect(texts).toEqual(["x", "3", "2", "0", "1", "0"]);

    mounted.unmount();
  });

  it("renders horizontal orientation (90 deg CCW) with High E on top and Low E on bottom", () => {
    const mounted = mount(
      el(GuitarCardView, {
        chord: mockCChord,
        chordLabel: "C",
        orientation: "horizontal",
      }),
    );

    const card = mounted.container.querySelector('[data-testid="mini-guitar-card-visual"]');
    expect(card?.getAttribute("data-orientation")).toBe("horizontal");

    const svg = mounted.container.querySelector('[data-testid="guitar-fretboard-svg"]');
    expect(svg?.classList.contains("is-horizontal")).toBe(true);
    expect(svg?.getAttribute("data-orientation")).toBe("horizontal");

    const fretNumbers = mounted.container.querySelectorAll(".guitar-fret-number");
    expect(fretNumbers.length).toBe(6);

    // In horizontal mode, HORIZ_STRING_Y = [95, 80, 65, 50, 35, 20]
    // String 0 (Low E) is at y=95 (bottom), String 5 (High E) is at y=20 (top)
    const yValues = Array.from(fretNumbers).map((el) => parseFloat(el.getAttribute("y") ?? "0"));
    expect(yValues[0]).toBeGreaterThan(yValues[5]); // string 0 is below string 5

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
