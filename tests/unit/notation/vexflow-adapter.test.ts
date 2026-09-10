// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { musicalDuration, type MusicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { projectPitchesToStaff } from "../../../src/notation/staffProjection";
import {
  renderStaffProjection,
  staffRhythmForDuration,
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
