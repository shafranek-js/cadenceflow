// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { musicalDuration, type MusicalDuration } from "../../../src/domain/timing/duration";
import { meter } from "../../../src/domain/timing/meter";
import { rational } from "../../../src/domain/timing/rational";
import { projectPitchesToStaff } from "../../../src/notation/staffProjection";
import {
  renderStaffProjection,
  renderStaffSequence,
  staffRhythmForDuration,
  type StaffSequenceEntry,
  type StaffSequencePosition,
} from "../../../src/notation/vexflowAdapter";

function projectionFor(
  pitches: readonly ReturnType<typeof exactPitch>[],
): ReturnType<typeof projectPitchesToStaff> {
  return projectPitchesToStaff(pitches);
}

function svgFor(
  projection: ReturnType<typeof projectPitchesToStaff>,
  duration: MusicalDuration = musicalDuration(rational(4)),
): {
  readonly container: HTMLDivElement;
  readonly svg: SVGSVGElement;
} {
  const container = document.createElement("div");
  const cleanup = renderStaffProjection(container, projection, duration);
  const svg = container.querySelector("svg");
  if (!svg) {
    cleanup();
    throw new Error("Staff SVG was not rendered");
  }
  return { container, svg };
}

function viewBox(svg: SVGSVGElement): readonly [number, number, number, number] {
  const values = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Staff SVG viewBox is missing or invalid");
  }
  return values as [number, number, number, number];
}

function pathPoints(svg: SVGSVGElement): readonly (readonly [number, number])[] {
  return [...svg.querySelectorAll("path[d]")].flatMap((path) => {
    const values = path
      .getAttribute("d")!
      .match(/-?\d+(?:\.\d+)?/g)
      ?.map(Number);
    if (!values || values.length % 2 !== 0) return [];
    return Array.from(
      { length: values.length / 2 },
      (_, index) => [values[index * 2]!, values[index * 2 + 1]!] as const,
    );
  });
}

describe("renderStaffProjection", () => {
  it("renders a centered five-line, clef-free staff with exact pitches and accidentals", () => {
    const pitches = [
      exactPitch(42, { step: "F", alter: 1 }),
      exactPitch(48, { step: "C", alter: 0 }),
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
      exactPitch(81, { step: "A", alter: 0 }),
      exactPitch(84, { step: "C", alter: 0 }),
    ];
    const sourceBeforeRender = JSON.stringify(pitches);
    const { svg } = svgFor(projectionFor(pitches));

    expect(svg.querySelectorAll(".vf-clef")).toHaveLength(0);
    expect(svg.querySelectorAll(".vf-stave path")).toHaveLength(5);
    expect(svg.querySelectorAll(".vf-notehead")).toHaveLength(pitches.length);
    expect(svg.querySelectorAll(".vf-notehead text")).toHaveLength(pitches.length + 1);
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.dataset.staffPitches).toBe("42,48,60,64,67,81,84");
    expect(JSON.stringify(pitches)).toBe(sourceBeforeRender);

    const [, , width, height] = viewBox(svg);
    for (const [x, y] of pathPoints(svg)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
    }
  });

  it("allocates ledger lines for both low and high treble pitches without clipping", () => {
    const low = svgFor(projectionFor([exactPitch(42, { step: "F", alter: 1 })])).svg;
    const high = svgFor(projectionFor([exactPitch(84, { step: "C", alter: 0 })])).svg;

    expect(low.querySelectorAll(".vf-stavenote path").length).toBeGreaterThan(0);
    expect(high.querySelectorAll(".vf-stavenote path").length).toBeGreaterThan(0);
    for (const svg of [low, high]) {
      const [, , width, height] = viewBox(svg);
      for (const [x, y] of pathPoints(svg)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height);
      }
    }
  });

  it("clears the previous SVG on repeated renders", () => {
    const container = document.createElement("div");
    renderStaffProjection(
      container,
      projectionFor([exactPitch(60, { step: "C", alter: 0 })]),
      musicalDuration(rational(4)),
    );
    const firstSvg = container.querySelector("svg");
    expect(firstSvg).not.toBeNull();

    renderStaffProjection(
      container,
      projectionFor([exactPitch(84, { step: "C", alter: 0 })]),
      musicalDuration(rational(4)),
    );
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(firstSvg?.isConnected).toBe(false);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 200 80");
  });

  it("maps canonical, dotted and triplet step durations to distinct notation", () => {
    const projection = projectionFor([exactPitch(60, { step: "C", alter: 0 })]);
    const quarter = svgFor(projection, musicalDuration(rational(1))).svg;
    const dottedQuarter = svgFor(projection, musicalDuration(rational(3, 2))).svg;
    const quarterTriplet = svgFor(projection, musicalDuration(rational(2, 3))).svg;

    expect(quarter.dataset.staffDuration).toBe("1/1");
    expect(quarter.dataset.staffRhythm).toBe("quarter");
    expect(dottedQuarter.dataset.staffDuration).toBe("3/2");
    expect(dottedQuarter.dataset.staffRhythm).toBe("dotted-quarter");
    expect(staffRhythmForDuration(musicalDuration(rational(3, 2))).dots).toBe(1);
    expect(quarterTriplet.dataset.staffDuration).toBe("2/3");
    expect(quarterTriplet.dataset.staffRhythm).toBe("quarter-triplet");
    expect(staffRhythmForDuration(musicalDuration(rational(2, 3))).tuplet).toEqual({
      numNotes: 3,
      notesOccupied: 2,
    });
  });

  it("exposes stable rhythm mappings for every duration preset", () => {
    const cases = [
      [4, 1, "whole"],
      [2, 1, "half"],
      [1, 1, "quarter"],
      [1, 2, "eighth"],
      [1, 4, "sixteenth"],
      [3, 1, "dotted-half"],
      [3, 2, "dotted-quarter"],
      [3, 4, "dotted-eighth"],
      [2, 3, "quarter-triplet"],
      [1, 3, "eighth-triplet"],
    ] as const;

    for (const [numerator, denominator, notation] of cases) {
      expect(
        staffRhythmForDuration(musicalDuration(rational(numerator, denominator))).notation,
      ).toBe(notation);
    }
  });
});

describe("renderStaffSequence", () => {
  const cMajor = projectionFor([
    exactPitch(60, { step: "C", alter: 0 }),
    exactPitch(64, { step: "E", alter: 0 }),
    exactPitch(67, { step: "G", alter: 0 }),
  ]);

  function chord(
    key: string,
    startNumerator: number,
    startDenominator: number,
    durationNumerator: number,
    durationDenominator: number,
    continuation: Partial<
      Pick<StaffSequenceEntry, "continuesFromPrevious" | "continuesToNext">
    > = {},
  ): StaffSequenceEntry {
    return {
      key,
      kind: "chord",
      projection: cMajor,
      startOffsetBeats: rational(startNumerator, startDenominator),
      duration: musicalDuration(rational(durationNumerator, durationDenominator)),
      ...continuation,
    };
  }

  function renderSequence(entries: readonly StaffSequenceEntry[]): {
    readonly svg: SVGSVGElement;
    readonly positions: readonly StaffSequencePosition[];
  } {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { configurable: true, value: 800 });
    let positions: readonly StaffSequencePosition[] = [];
    renderStaffSequence(container, entries, meter(4, 4), (next) => {
      positions = next;
    });
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Measure staff SVG was not rendered");
    return { svg, positions };
  }

  it("places six attacks on the exact Rational measure timeline", () => {
    const entries = [
      chord("c-1", 0, 1, 1, 2),
      chord("c-2", 1, 2, 1, 2),
      chord("c-3", 1, 1, 1, 2),
      chord("c-4", 3, 2, 1, 2),
      chord("em-1", 2, 1, 1, 1),
      chord("em-2", 3, 1, 1, 1),
    ];
    const { positions, svg } = renderSequence(entries);
    const x = positions.map((position) => position.x);

    expect(x).toHaveLength(6);
    expect(x.every((value, index) => index === 0 || value > x[index - 1]!)).toBe(true);
    const halfBeatGap = x[1]! - x[0]!;
    expect(x[5]! - x[4]!).toBeCloseTo(halfBeatGap * 2, 5);
    expect(svg.querySelectorAll(".vf-stavenote")).toHaveLength(6);
    expect(svg.dataset.staffSequencePositions).toContain("c-1:");
    expect(svg.dataset.staffClef).toBe("treble");
    expect(svg.dataset.staffMeter).toBe("4/4");
    expect(svg.dataset.staffSystem).toBe("treble");
    expect(svg.querySelectorAll(".vf-clef")).toHaveLength(1);
    expect(svg.querySelectorAll(".vf-timesignature")).toHaveLength(1);
  });

  it("renders a time-aligned bass staff and highlights only the playing chord", () => {
    const bassProjection = projectionFor([exactPitch(36, { step: "C", alter: 0 })]);
    const entries: readonly StaffSequenceEntry[] = [
      {
        ...chord("playing", 0, 1, 2, 1),
        bassProjection,
        highlighted: true,
      },
      {
        ...chord("idle", 2, 1, 2, 1),
        bassProjection,
      },
    ];
    const { positions, svg } = renderSequence(entries);

    expect(svg.dataset.staffSystem).toBe("grand");
    expect(svg.dataset.staffPlayingEntries).toBe("playing");
    expect(svg.querySelectorAll(".vf-clef")).toHaveLength(2);
    expect(svg.querySelectorAll(".vf-timesignature")).toHaveLength(2);
    expect(svg.dataset.staffBassEntries).toBe("playing,idle");
    expect(svg.dataset.staffBassSequencePositions).toBe(svg.dataset.staffSequencePositions);
    expect(svg.innerHTML).toContain("#8a5732");
    expect(positions[1]!.x).toBeGreaterThan(positions[0]!.x);
  });

  it("keeps a trailing virtual gap silent while reserving the rest of the bar", () => {
    const entries: readonly StaffSequenceEntry[] = [
      chord("half", 0, 1, 2, 1),
      {
        key: "gap",
        kind: "gap",
        startOffsetBeats: rational(2),
        duration: musicalDuration(rational(2)),
      },
    ];
    const { positions, svg } = renderSequence(entries);

    expect(positions.map((position) => position.key)).toEqual(["half"]);
    expect(svg.querySelectorAll(".vf-stavenote")).toHaveLength(1);
    expect(svg.dataset.staffSequenceLength).toBe("2");
  });

  it("renders continuation ties and keeps ledger-line ink inside the viewBox", () => {
    const lowProjection = projectionFor([exactPitch(24, { step: "C", alter: 0 })]);
    const entries: readonly StaffSequenceEntry[] = [
      {
        key: "continued",
        kind: "chord",
        projection: lowProjection,
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(4)),
        continuesFromPrevious: true,
        continuesToNext: true,
      },
    ];
    const { svg } = renderSequence(entries);
    const [, , width, height] = viewBox(svg);

    expect(svg.querySelectorAll(".vf-stavetie").length).toBeGreaterThan(0);
    for (const [x, y] of pathPoints(svg)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
    }
  });

  it("accepts additive meter timing and exact custom Rational durations", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { configurable: true, value: 800 });
    const entries: readonly StaffSequenceEntry[] = [
      chord("custom-a", 0, 1, 5, 6),
      chord("custom-b", 5, 6, 8, 3),
    ];
    let positions: readonly StaffSequencePosition[] = [];

    expect(() =>
      renderStaffSequence(container, entries, meter(7, 8, [2, 2, 3]), (next) => {
        positions = next;
      }),
    ).not.toThrow();
    expect(positions).toHaveLength(2);
    expect(positions[1]!.x).toBeGreaterThan(positions[0]!.x);
  });
});
