// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { VexFlow } from "vexflow";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { musicalDuration, type MusicalDuration } from "../../../src/domain/timing/duration";
import { meter } from "../../../src/domain/timing/meter";
import { addRational, rational } from "../../../src/domain/timing/rational";
import { projectPitchesToStaff } from "../../../src/notation/staffProjection";
import {
  renderStaffProjection,
  renderStaffSystem,
  renderStaffSequence,
  staffRhythmForDuration,
  type StaffSystemMeasureInput,
  type StaffSequenceChordEntry,
  type StaffSystemPosition,
  type StaffSequenceEntry,
  type StaffSequencePosition,
} from "../../../src/notation/vexflowAdapter";
import { projectWrittenRhythm } from "../../../src/notation/writtenRhythmProjection";

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
    expect(dottedQuarter.querySelectorAll(".vf-stavenote text").length).toBeGreaterThan(
      quarter.querySelectorAll(".vf-stavenote text").length,
    );
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

  it("decomposes long, dotted, triplet, and custom rhythms without changing their exact sum", () => {
    const cases = [
      [rational(5, 2), [rational(2), rational(1, 2)]],
      [rational(9, 2), [rational(4), rational(1, 2)]],
      [rational(3, 2), [rational(3, 2)]],
      [rational(2, 3), [rational(2, 3)]],
      [rational(3, 7), [rational(3, 7)]],
    ] as const;

    for (const [duration, expected] of cases) {
      const parts = projectWrittenRhythm(duration);
      expect(parts.map((part) => part.beats)).toEqual(expected);
      expect(parts.reduce((sum, part) => addRational(sum, part.beats), rational(0))).toEqual(
        duration,
      );
      expect(parts.map((part) => part.offsetBeats)).toEqual(
        expected.reduce<ReturnType<typeof rational>[]>((offsets) => {
          offsets.push(
            offsets.length === 0
              ? rational(0)
              : addRational(offsets.at(-1)!, expected[offsets.length - 1]!),
          );
          return offsets;
        }, []),
      );
    }

    expect(
      projectWrittenRhythm(rational(5, 2), rational(0), meter(5, 8, [3, 2])).map(
        (part) => part.beats,
      ),
    ).toEqual([rational(3, 2), rational(1)]);

    expect(projectWrittenRhythm(rational(5, 2)).map((part) => part.notation)).toEqual([
      "half",
      "eighth",
    ]);
    expect(projectWrittenRhythm(rational(3, 2))[0]?.dots).toBe(1);
    expect(projectWrittenRhythm(rational(2, 3))[0]?.tuplet).toEqual({
      numNotes: 3,
      notesOccupied: 2,
    });
    expect(projectWrittenRhythm(rational(3, 7))[0]?.tuplet).toEqual({
      numNotes: 7,
      notesOccupied: 6,
    });
  });

  it("colors noteheads with Suzuki palette when suzukiColors option is enabled", () => {
    const pitches = [
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ];
    const containerWithColors = document.createElement("div");
    renderStaffProjection(
      containerWithColors,
      projectionFor(pitches),
      musicalDuration(rational(4)),
      {
        suzukiColors: true,
      },
    );
    const svgWithColors = containerWithColors.querySelector("svg");
    expect(svgWithColors).not.toBeNull();
    const htmlWithColors = svgWithColors!.outerHTML;
    expect(htmlWithColors).toContain("#fc0200"); // C = Red
    expect(htmlWithColors).toContain("#fbf405"); // E = Yellow
    expect(htmlWithColors).toContain("#29e1fe"); // G = Cyan

    const containerDefault = document.createElement("div");
    renderStaffProjection(containerDefault, projectionFor(pitches), musicalDuration(rational(4)));
    const svgDefault = containerDefault.querySelector("svg");
    expect(svgDefault).not.toBeNull();
    const htmlDefault = svgDefault!.outerHTML;
    expect(htmlDefault).not.toContain("#fc0200");
    expect(htmlDefault).not.toContain("#fbf405");
    expect(htmlDefault).not.toContain("#29e1fe");
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
      Pick<StaffSequenceChordEntry, "continuesFromPrevious" | "continuesToNext">
    > = {},
  ): StaffSequenceChordEntry {
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

  it("keeps the first and last rendered note anchors inside compact staff edges", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { configurable: true, value: 320 });
    const entries = [chord("first", 0, 1, 1, 2), chord("last", 7, 2, 1, 2)];
    let positions: readonly StaffSequencePosition[] = [];

    renderStaffSequence(container, entries, meter(4, 4), (next) => {
      positions = next;
    });

    expect(positions).toHaveLength(2);
    expect(positions[0]!.x).toBeGreaterThan(18);
    expect(positions[1]!.x).toBeLessThan(320 - 18);
    expect(positions[1]!.x).toBeGreaterThan(positions[0]!.x);
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
        sourceEventKeys: ["continued-event"],
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(4)),
        continuesFromPrevious: true,
        continuesToNext: true,
      },
    ];
    const { svg } = renderSequence(entries);
    const [, , width, height] = viewBox(svg);

    const ties = Array.from(svg.querySelectorAll<SVGGElement>(".vf-stavetie"));
    expect(ties).toHaveLength(2);
    expect(ties.map((tie) => tie.getAttribute("data-tie-kind")).sort()).toEqual([
      "system-edge-left",
      "system-edge-right",
    ]);
    for (const [x, y] of pathPoints(svg)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(height);
    }
  });

  it("renders partial ties for multi-note chord fragments without mismatched indexes", () => {
    const projection = projectionFor([
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ]);

    expect(() =>
      renderSequence([
        {
          key: "continued-chord",
          kind: "chord",
          projection,
          startOffsetBeats: rational(0),
          duration: musicalDuration(rational(4)),
          continuesFromPrevious: true,
          continuesToNext: true,
        },
      ]),
    ).not.toThrow();
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
    expect(positions).toHaveLength(6);
    expect(positions[1]!.x).toBeGreaterThan(positions[0]!.x);
  });

  it("groups consecutive triplet notes under one tuplet bracket", () => {
    const triplets: readonly StaffSequenceEntry[] = [
      chord("triplet-1", 0, 1, 1, 3),
      chord("triplet-2", 1, 3, 1, 3),
      chord("triplet-3", 2, 3, 1, 3),
      chord("triplet-4", 1, 1, 1, 3),
      chord("triplet-5", 4, 3, 1, 3),
      chord("triplet-6", 5, 3, 1, 3),
      {
        key: "remaining-half",
        kind: "rest",
        startOffsetBeats: rational(2),
        duration: musicalDuration(rational(2)),
      },
    ];

    const { svg } = renderSequence(triplets);

    expect(svg.dataset.staffTupletGroups).toBe("2");
    expect(svg.querySelectorAll(".vf-tuplet")).toHaveLength(2);
  });
});

describe("renderStaffSystem", () => {
  const cMajor = projectionFor([
    exactPitch(60, { step: "C", alter: 0 }),
    exactPitch(64, { step: "E", alter: 0 }),
    exactPitch(67, { step: "G", alter: 0 }),
  ]);
  const bassProjection = projectionFor([exactPitch(36, { step: "C", alter: 0 })]);

  function systemMeasure(
    measureIndex: number,
    harmonyEntries: readonly StaffSequenceEntry[],
    melodyEntries?: readonly StaffSequenceEntry[],
    widthPx = 280,
  ): StaffSystemMeasureInput {
    return {
      measureIndex,
      widthPx,
      harmonyEntries,
      ...(melodyEntries ? { melodyEntries } : {}),
    };
  }

  it("renders exact durations from direct resize without overfilling a 4/4 voice", () => {
    const container = document.createElement("div");
    const entries: StaffSequenceEntry[] = [
      {
        key: "resized-short",
        kind: "chord",
        projection: cMajor,
        sourceEventKeys: ["tie-event"],
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(1, 24)),
      },
      {
        key: "resized-long",
        kind: "chord",
        projection: cMajor,
        startOffsetBeats: rational(1, 24),
        duration: musicalDuration(rational(95, 24)),
      },
    ];

    expect(() =>
      renderStaffSystem(container, [systemMeasure(0, entries)], meter(4, 4)),
    ).not.toThrow();
  });

  it("renders a triplet-length rest followed by a chord without overfilling the voice", () => {
    const container = document.createElement("div");
    const entries: StaffSequenceEntry[] = [
      {
        key: "triplet-rest",
        kind: "rest",
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(1, 3)),
      },
      {
        key: "remaining-chord",
        kind: "chord",
        projection: cMajor,
        startOffsetBeats: rational(1, 3),
        duration: musicalDuration(rational(11, 3)),
      },
    ];

    expect(() =>
      renderStaffSystem(container, [systemMeasure(0, entries)], meter(4, 4)),
    ).not.toThrow();
  });

  it("renders exact rhythmic rests and tuplets in tablature", () => {
    const container = document.createElement("div");
    const entries: StaffSequenceEntry[] = [
      {
        key: "tab-rest",
        kind: "rest",
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(1, 3)),
      },
      {
        key: "tab-chord",
        kind: "chord",
        projection: cMajor,
        tabPositions: [{ str: 5, fret: 3 }],
        startOffsetBeats: rational(1, 3),
        duration: musicalDuration(rational(11, 3)),
      },
    ];

    expect(() =>
      renderStaffSystem(container, [systemMeasure(0, entries)], meter(4, 4), undefined, {
        isTablature: true,
      }),
    ).not.toThrow();
    expect(container.querySelectorAll('.vf-stavenote[data-staff-entry="tab-rest"]')).toHaveLength(
      1,
    );
    expect(container.querySelectorAll(".vf-tuplet")).toHaveLength(2);
  });

  it("does not generate non-finite beam paths for exact resized durations", () => {
    const container = document.createElement("div");
    const lengths = [
      rational(1, 4),
      rational(7, 24),
      rational(1, 4),
      rational(1, 4),
      rational(71, 24),
    ];
    let offset = rational(0);
    const entries: StaffSequenceEntry[] = lengths.map((duration, index) => {
      const entry: StaffSequenceEntry = {
        key: `resized-${index}`,
        kind: "chord",
        projection: cMajor,
        startOffsetBeats: offset,
        duration: musicalDuration(duration),
      };
      offset = addRational(offset, duration);
      return entry;
    });

    renderStaffSystem(container, [systemMeasure(0, entries)], meter(4, 4));

    expect(container.querySelectorAll('svg path[d*="NaN"]')).toHaveLength(0);
    expect(container.querySelectorAll("svg .vf-beam").length).toBeGreaterThan(0);
  });

  it("keeps triplet rests exact on Melody and Bass staves in 7/8", () => {
    const container = document.createElement("div");
    const rest: StaffSequenceEntry = {
      key: "short-rest",
      kind: "rest",
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(1, 6)),
    };
    const harmony: StaffSequenceEntry = {
      key: "harmony",
      kind: "chord",
      projection: cMajor,
      bassProjection,
      startOffsetBeats: rational(1, 6),
      duration: musicalDuration(rational(10, 3)),
    };
    const melody: StaffSequenceEntry = {
      key: "melody",
      kind: "note",
      projection: projectionFor([exactPitch(72, { step: "C", alter: 0 })]),
      startOffsetBeats: rational(1, 6),
      duration: musicalDuration(rational(10, 3)),
    };

    expect(() =>
      renderStaffSystem(
        container,
        [systemMeasure(0, [rest, harmony], [rest, melody])],
        meter(7, 8, [2, 2, 3]),
        undefined,
        { showBass: true },
      ),
    ).not.toThrow();
  });

  it("renders two consecutive measures as one SVG with shared Melody/Harmony attacks", () => {
    const harmony = (key: string, bass = false): StaffSequenceEntry => ({
      key,
      kind: "chord",
      projection: cMajor,
      ...(bass ? { bassProjection } : {}),
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    });
    const melody = (key: string): StaffSequenceEntry => ({
      key,
      kind: "note",
      projection: projectionFor([exactPitch(72, { step: "C", alter: 0 })]),
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    });
    const container = document.createElement("div");
    let positions: readonly StaffSystemPosition[] = [];

    renderStaffSystem(
      container,
      [
        systemMeasure(0, [harmony("harmony-1", true)], [melody("melody-1")]),
        systemMeasure(1, [harmony("harmony-2", true)], [melody("melody-2")]),
      ],
      meter(4, 4),
      (next) => {
        positions = next;
      },
      { showBass: true, showTimeSignature: true },
    );

    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Score system SVG was not rendered");
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(svg.dataset.staffSystemMeasureCount).toBe("2");
    expect(svg.dataset.staffTimeSignature).toBe("true");
    expect(svg.querySelectorAll(".vf-clef")).toHaveLength(3);
    expect(svg.querySelectorAll(".vf-timesignature")).toHaveLength(3);

    const harmonyPositions = positions.filter((position) => position.staff === "harmony");
    const melodyPositions = positions.filter((position) => position.staff === "melody");
    expect(harmonyPositions.map((position) => position.x)).toEqual(
      melodyPositions.map((position) => position.x),
    );
    expect(harmonyPositions[1]!.x).toBeGreaterThan(harmonyPositions[0]!.x);
    expect(svg.dataset.staffBassEntries).toBe("harmony-1,harmony-2");
  });

  it("keeps a tied note at the barline ahead of a later Rest in another rhythmic voice", () => {
    const g4 = projectionFor([exactPitch(67, { step: "G", alter: 0 })]);
    const container = document.createElement("div");
    let positions: readonly StaffSystemPosition[] = [];
    const tieStart: StaffSequenceEntry = {
      key: "long-g4-start",
      kind: "note",
      projection: g4,
      sourceEventKeys: ["long-g4"],
      rhythmicVoice: "melody:voice0",
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
      continuesToNext: true,
    };
    const continuation: StaffSequenceEntry = {
      key: "long-g4-continuation",
      kind: "note",
      projection: g4,
      sourceEventKeys: ["long-g4"],
      rhythmicVoice: "melody:voice0",
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(2)),
      continuesFromPrevious: true,
    };
    const laterRest: StaffSequenceEntry = {
      key: "later-rest",
      kind: "rest",
      rhythmicVoice: "rest:voice0",
      startOffsetBeats: rational(2),
      duration: musicalDuration(rational(2)),
    };

    renderStaffSystem(
      container,
      [systemMeasure(6, [], [tieStart]), systemMeasure(7, [], [continuation, laterRest])],
      meter(4, 4),
      (next) => {
        positions = next;
      },
      { showTimeSignature: false },
    );

    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Score system SVG was not rendered");
    const notePosition = positions.find(
      (position) => position.key === "long-g4-continuation" && position.measureIndex === 7,
    );
    const restPosition = positions.find(
      (position) => position.key === "later-rest" && position.measureIndex === 7,
    );
    expect(notePosition).toBeDefined();
    expect(restPosition).toBeDefined();
    expect(restPosition!.x - notePosition!.x).toBeGreaterThan(40);
    expect(
      svg.querySelector(
        '.vf-stavetie[data-tie-owner-key="long-g4"][data-tie-last-entry="long-g4-continuation"]',
      ),
    ).not.toBeNull();
  });

  it("renders one aligned staff row for each active Melody lane", () => {
    const note = (key: string, pitch: number): StaffSequenceEntry => ({
      key,
      kind: "note",
      projection: projectionFor([exactPitch(pitch, { step: "C", alter: 0 })]),
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    });
    const container = document.createElement("div");
    let positions: readonly StaffSystemPosition[] = [];

    renderStaffSystem(
      container,
      [
        {
          measureIndex: 0,
          widthPx: 280,
          harmonyEntries: [
            {
              key: "harmony",
              kind: "chord",
              projection: cMajor,
              startOffsetBeats: rational(0),
              duration: musicalDuration(rational(4)),
            },
          ],
          melodyLanes: [
            { id: "cello", clef: "bass", entries: [note("cello-note", 48)] },
            { id: "violin", clef: "treble", entries: [note("violin-note", 72)] },
          ],
        },
      ],
      meter(4, 4),
      (next) => {
        positions = next;
      },
    );

    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Score system SVG was not rendered");
    expect(svg.dataset.staffSystemClefs).toBe("bass,treble,treble");
    expect(svg.querySelectorAll(".vf-clef")).toHaveLength(3);
    const cello = positions.find((position) => position.staff === "melody:cello");
    const violin = positions.find((position) => position.staff === "melody:violin");
    const harmony = positions.find((position) => position.staff === "harmony");
    expect(cello?.x).toBe(violin?.x);
    expect(violin?.x).toBe(harmony?.x);
  });

  it("uses the available width for a complete system without adding a page-wide minimum", () => {
    const container = document.createElement("div");

    renderStaffSystem(
      container,
      [
        systemMeasure(
          0,
          [
            {
              key: "short-1",
              kind: "chord",
              projection: cMajor,
              startOffsetBeats: rational(0),
              duration: musicalDuration(rational(2)),
            },
          ],
          undefined,
          168,
        ),
        systemMeasure(
          1,
          [
            {
              key: "short-2",
              kind: "chord",
              projection: cMajor,
              startOffsetBeats: rational(0),
              duration: musicalDuration(rational(2)),
            },
          ],
          undefined,
          168,
        ),
      ],
      meter(2, 4),
      undefined,
      { widthPx: 600 },
    );

    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Score system SVG was not rendered");
    expect(svg.getAttribute("width")).toBe("600");
    expect(svg.dataset.staffSystemMeasureCount).toBe("2");
  });

  it("beams short notes according to the meter grouping", () => {
    const eighthNotes = Array.from({ length: 8 }, (_, index): StaffSequenceEntry => ({
      key: `eighth-${index + 1}`,
      kind: "note",
      projection: projectionFor([exactPitch(72 + (index % 3), { step: "C", alter: 0 })]),
      startOffsetBeats: rational(index, 2),
      duration: musicalDuration(rational(1, 2)),
    }));
    const container = document.createElement("div");

    renderStaffSystem(
      container,
      [
        systemMeasure(
          0,
          [
            {
              key: "harmony",
              kind: "chord",
              projection: cMajor,
              startOffsetBeats: rational(0),
              duration: musicalDuration(rational(4)),
            },
          ],
          eighthNotes,
        ),
      ],
      meter(4, 4),
      undefined,
      { showTimeSignature: true },
    );

    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Score system SVG was not rendered");
    expect(svg.dataset.staffBeamGroups).toBe("2");
    expect(svg.querySelectorAll(".vf-beam")).toHaveLength(2);
  });

  it("keeps cross-measure ties and tuplets in the single system surface", () => {
    const tieStart: readonly StaffSequenceEntry[] = [
      {
        key: "tie-start",
        kind: "chord",
        projection: cMajor,
        sourceEventKeys: ["tie-event"],
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(4)),
        continuesToNext: true,
      },
    ];
    const tieEnd: readonly StaffSequenceEntry[] = [
      {
        key: "tie-end",
        kind: "chord",
        projection: cMajor,
        sourceEventKeys: ["tie-event"],
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(4)),
        continuesFromPrevious: true,
      },
    ];
    const triplets: readonly StaffSequenceEntry[] = [
      {
        key: "triplet-1",
        kind: "chord",
        projection: cMajor,
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(1, 3)),
      },
      {
        key: "triplet-2",
        kind: "chord",
        projection: cMajor,
        startOffsetBeats: rational(1, 3),
        duration: musicalDuration(rational(1, 3)),
      },
      {
        key: "triplet-3",
        kind: "chord",
        projection: cMajor,
        startOffsetBeats: rational(2, 3),
        duration: musicalDuration(rational(1, 3)),
      },
      {
        key: "remaining",
        kind: "rest",
        startOffsetBeats: rational(1),
        duration: musicalDuration(rational(3)),
      },
    ];
    const tieContainer = document.createElement("div");

    renderStaffSystem(
      tieContainer,
      [systemMeasure(0, tieStart), systemMeasure(1, tieEnd)],
      meter(4, 4),
      undefined,
      { showTimeSignature: false },
    );

    const tupletsContainer = document.createElement("div");
    renderStaffSystem(tupletsContainer, [systemMeasure(0, triplets)], meter(4, 4), undefined, {
      showTimeSignature: false,
    });

    const tieSvg = tieContainer.querySelector("svg");
    const tupletSvg = tupletsContainer.querySelector("svg");
    if (!tieSvg || !tupletSvg) throw new Error("Score system SVG was not rendered");
    expect(tieSvg.dataset.staffTimeSignature).toBe("false");
    const tieGroups = Array.from(tieSvg.querySelectorAll<SVGGElement>(".vf-stavetie"));
    expect(tieGroups).toHaveLength(3);
    tieGroups.forEach((group) => {
      expect(group.getAttribute("data-tie-kind")).toBe("complete");
      expect(group.getAttribute("data-tie-owner-key")).toBe("tie-event");
      expect(group.getAttribute("data-tie-first-entry")).toBe("tie-start");
      expect(group.getAttribute("data-tie-last-entry")).toBe("tie-end");
      expect(group.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
    });
    expect(tupletSvg.dataset.staffTupletGroups).toBe("1");
    expect(tupletSvg.querySelectorAll(".vf-tuplet")).toHaveLength(1);
  });

  it("draws real augmentation dots for Staff, rests, and rhythmic TAB", () => {
    const restContainer = document.createElement("div");
    renderStaffSequence(
      restContainer,
      [
        {
          key: "dotted-rest",
          kind: "rest",
          startOffsetBeats: rational(0),
          duration: musicalDuration(rational(3, 2)),
        },
      ],
      meter(4, 4),
    );
    const restSvg = restContainer.querySelector("svg");
    const plainRestContainer = document.createElement("div");
    renderStaffSequence(
      plainRestContainer,
      [
        {
          key: "plain-rest",
          kind: "rest",
          startOffsetBeats: rational(0),
          duration: musicalDuration(rational(1)),
        },
      ],
      meter(4, 4),
    );
    const plainRestSvg = plainRestContainer.querySelector("svg");

    const tabContainer = document.createElement("div");
    renderStaffSystem(
      tabContainer,
      [
        systemMeasure(0, [
          {
            key: "dotted-tab-chord",
            kind: "chord",
            projection: cMajor,
            tabPositions: [
              { str: 5, fret: 3 },
              { str: 4, fret: 2 },
              { str: 3, fret: 0 },
            ],
            startOffsetBeats: rational(0),
            duration: musicalDuration(rational(3, 2)),
          },
          {
            key: "tab-rest",
            kind: "rest",
            startOffsetBeats: rational(3, 2),
            duration: musicalDuration(rational(5, 2)),
          },
        ]),
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showTimeSignature: false },
    );
    const tabSvg = tabContainer.querySelector("svg");
    const plainTabContainer = document.createElement("div");
    renderStaffSystem(
      plainTabContainer,
      [
        systemMeasure(0, [
          {
            key: "plain-tab-chord",
            kind: "chord",
            projection: cMajor,
            tabPositions: [
              { str: 5, fret: 3 },
              { str: 4, fret: 2 },
              { str: 3, fret: 0 },
            ],
            startOffsetBeats: rational(0),
            duration: musicalDuration(rational(1)),
          },
          {
            key: "plain-tab-rest",
            kind: "rest",
            startOffsetBeats: rational(1),
            duration: musicalDuration(rational(3)),
          },
        ]),
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showTimeSignature: false },
    );
    const plainTabSvg = plainTabContainer.querySelector("svg");

    expect(
      restSvg?.querySelector('.vf-stavenote[data-staff-entry="dotted-rest"]')?.textContent,
    ).toContain(VexFlow.Glyphs.augmentationDot);
    expect(
      plainRestSvg?.querySelector('.vf-stavenote[data-staff-entry="plain-rest"]')?.textContent,
    ).not.toContain(VexFlow.Glyphs.augmentationDot);
    expect(
      tabSvg?.querySelector('.vf-tabnote[data-staff-entry="dotted-tab-chord"]')?.textContent,
    ).toContain(VexFlow.Glyphs.augmentationDot);
    expect(
      plainTabSvg?.querySelector('.vf-tabnote[data-staff-entry="plain-tab-chord"]')?.textContent,
    ).not.toContain(VexFlow.Glyphs.augmentationDot);
  });

  it("ties adjacent written fragments by source owner and never through a Rest", () => {
    const container = document.createElement("div");
    renderStaffSystem(
      container,
      [
        systemMeasure(0, [
          {
            key: "long-event",
            kind: "chord",
            projection: cMajor,
            sourceEventKeys: ["same-source"],
            startOffsetBeats: rational(0),
            duration: musicalDuration(rational(5, 2)),
          },
          {
            key: "intervening-rest",
            kind: "rest",
            startOffsetBeats: rational(5, 2),
            duration: musicalDuration(rational(3, 2)),
          },
        ]),
        systemMeasure(1, [
          {
            key: "same-pitch-after-rest",
            kind: "chord",
            projection: cMajor,
            sourceEventKeys: ["same-source"],
            startOffsetBeats: rational(0),
            duration: musicalDuration(rational(1)),
            continuesFromPrevious: true,
          },
          {
            key: "different-owner-repeat",
            kind: "chord",
            projection: cMajor,
            sourceEventKeys: ["new-attack"],
            startOffsetBeats: rational(1),
            duration: musicalDuration(rational(1)),
            continuesFromPrevious: true,
          },
        ]),
      ],
      meter(4, 4),
      undefined,
      { showTimeSignature: false },
    );
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("Score system SVG was not rendered");
    const completeTies = Array.from(
      svg.querySelectorAll<SVGGElement>(".vf-stavetie[data-tie-kind='complete']"),
    );

    expect(completeTies).toHaveLength(3);
    expect(svg.querySelectorAll(".vf-stavetie")).toHaveLength(3);
    expect(
      completeTies.every((tie) => tie.getAttribute("data-tie-owner-key") === "same-source"),
    ).toBe(true);
    expect(
      completeTies.every(
        (tie) => tie.getAttribute("data-tie-first-entry") === "long-event:written-0",
      ),
    ).toBe(true);
    expect(
      completeTies.every(
        (tie) => tie.getAttribute("data-tie-last-entry") === "long-event:written-1",
      ),
    ).toBe(true);
  });

  it("keeps rhythmic TAB ties between matching source, string, and fret positions", () => {
    const tabPosition = [{ str: 6, fret: 3 }];
    const container = document.createElement("div");
    renderStaffSystem(
      container,
      [
        systemMeasure(0, [
          {
            key: "tab-tie-start",
            kind: "note",
            projection: projectionFor([exactPitch(55, { step: "G", alter: 0 })]),
            sourceEventKeys: ["tab-event"],
            tabPositions: tabPosition,
            startOffsetBeats: rational(0),
            duration: musicalDuration(rational(4)),
            continuesToNext: true,
          },
        ]),
        systemMeasure(1, [
          {
            key: "tab-tie-end",
            kind: "note",
            projection: projectionFor([exactPitch(55, { step: "G", alter: 0 })]),
            sourceEventKeys: ["tab-event"],
            tabPositions: tabPosition,
            startOffsetBeats: rational(0),
            duration: musicalDuration(rational(4)),
            continuesFromPrevious: true,
          },
        ]),
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showTimeSignature: false },
    );
    const svg = container.querySelector("svg");
    if (!svg) throw new Error("TAB system SVG was not rendered");
    const tie = svg.querySelector<SVGGElement>(".vf-stavetie");

    expect(tie?.getAttribute("data-tie-kind")).toBe("complete");
    expect(tie?.getAttribute("data-tie-staff")).toBe("harmony");
    expect(tie?.getAttribute("data-tie-owner-key")).toBe("tab-event");
    expect(tie?.getAttribute("data-tie-member-key")).toContain("tab:6:3");
    expect(tie?.querySelector("path")?.getAttribute("d")).toMatch(/^M/);
  });

  it("renders multi-measure tablature systems with TabStave and TabNotes", () => {
    const cMajorTab: StaffSequenceEntry = {
      key: "m1-c",
      kind: "chord",
      projection: projectionFor([
        exactPitch(60, { step: "C", alter: 0 }),
        exactPitch(64, { step: "E", alter: 0 }),
        exactPitch(67, { step: "G", alter: 0 }),
      ]),
      tabPositions: [
        { str: 5, fret: 3 },
        { str: 4, fret: 2 },
        { str: 3, fret: 0 },
        { str: 2, fret: 1 },
        { str: 1, fret: 0 },
      ],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    };
    const gTab: StaffSequenceEntry = {
      key: "m2-g",
      kind: "chord",
      projection: projectionFor([
        exactPitch(55, { step: "G", alter: 0 }),
        exactPitch(59, { step: "B", alter: 0 }),
        exactPitch(62, { step: "D", alter: 0 }),
      ]),
      tabPositions: [
        { str: 6, fret: 3 },
        { str: 5, fret: 2 },
        { str: 4, fret: 0 },
        { str: 3, fret: 0 },
        { str: 2, fret: 0 },
        { str: 1, fret: 3 },
      ],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    };
    const container = document.createElement("div");
    const cleanup = renderStaffSystem(
      container,
      [systemMeasure(0, [cMajorTab]), systemMeasure(1, [gTab])],
      meter(4, 4),
      undefined,
      { isTablature: true, showTimeSignature: true },
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const textContents = Array.from(svg!.querySelectorAll("text")).map((t) => t.textContent);
    // VexFlow 5 renders TAB clef via SMuFL glyph and frets as text
    expect(textContents).toContain("3");
    expect(textContents).toContain("2");
    expect(textContents).toContain("0");
    expect(textContents).toContain("1");
    expect(svg!.querySelectorAll(".vf-tabnote").length).toBe(2);
    cleanup();
  });

  it("renders polyphonic tablature with both melody notes and chord accompaniment on TabStave", () => {
    const cMajorTab: StaffSequenceEntry = {
      key: "m1-c",
      kind: "chord",
      projection: projectionFor([
        exactPitch(60, { step: "C", alter: 0 }),
        exactPitch(64, { step: "E", alter: 0 }),
        exactPitch(67, { step: "G", alter: 0 }),
      ]),
      tabPositions: [
        { str: 5, fret: 3 },
        { str: 4, fret: 2 },
        { str: 3, fret: 0 },
        { str: 2, fret: 1 },
      ],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    };

    const melodyQuarterNotes: StaffSequenceEntry[] = [
      {
        key: "mel-0",
        kind: "note",
        projection: projectionFor([exactPitch(60, { step: "C", alter: 0 })]),
        tabPositions: [{ str: 2, fret: 1 }],
        startOffsetBeats: rational(0),
        duration: musicalDuration(rational(1)),
      },
      {
        key: "mel-1",
        kind: "note",
        projection: projectionFor([exactPitch(64, { step: "E", alter: 0 })]),
        tabPositions: [{ str: 1, fret: 0 }],
        startOffsetBeats: rational(1),
        duration: musicalDuration(rational(1)),
      },
      {
        key: "mel-2",
        kind: "note",
        projection: projectionFor([exactPitch(67, { step: "G", alter: 0 })]),
        tabPositions: [{ str: 1, fret: 3 }],
        startOffsetBeats: rational(2),
        duration: musicalDuration(rational(1)),
      },
      {
        key: "mel-3",
        kind: "note",
        projection: projectionFor([exactPitch(72, { step: "C", alter: 0 })]),
        tabPositions: [{ str: 1, fret: 8 }],
        startOffsetBeats: rational(3),
        duration: musicalDuration(rational(1)),
      },
    ];

    const container = document.createElement("div");
    let reportedPositions: readonly StaffSystemPosition[] = [];
    const cleanup = renderStaffSystem(
      container,
      [
        {
          measureIndex: 0,
          widthPx: 400,
          harmonyEntries: [cMajorTab],
          melodyEntries: melodyQuarterNotes,
        },
      ],
      meter(4, 4),
      (positions) => {
        reportedPositions = positions;
      },
      { isTablature: true },
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // 4 melody TabNotes + 1 accompaniment chord TabNote = 5 TabNotes on the stave
    const tabNotes = svg!.querySelectorAll(".vf-tabnote");
    expect(tabNotes.length).toBe(5);
    expect(svg!.querySelectorAll(".vf-stavenote")).toHaveLength(0);

    const textContents = Array.from(svg!.querySelectorAll("text")).map((t) => t.textContent);
    // Frets: 8 (melody C5), 3 (melody G4 and bass C3), 0 (melody E4 and harmony G3), 1 (melody C4), 2 (harmony E3)
    expect(textContents).toContain("8");
    expect(textContents).toContain("3");
    expect(textContents).toContain("1");
    expect(textContents).toContain("2");
    expect(textContents).toContain("0");

    // Both melody keys and chord keys should be in reported positions
    const reportedKeys = reportedPositions.map((p) => p.key);
    expect(reportedKeys).toContain("mel-0");
    expect(reportedKeys).toContain("mel-1");
    expect(reportedKeys).toContain("mel-2");
    expect(reportedKeys).toContain("mel-3");
    expect(reportedKeys).toContain("m1-c");

    cleanup();
  });

  it("synchronizes playback highlight attributes and enhances badge pills for active tablature and staff notes", () => {
    const cMajorTab: StaffSequenceEntry = {
      key: "m1-c-playing",
      kind: "chord",
      projection: projectionFor([
        exactPitch(60, { step: "C", alter: 0 }),
        exactPitch(64, { step: "E", alter: 0 }),
      ]),
      tabPositions: [
        { str: 5, fret: 3 },
        { str: 4, fret: 2 },
      ],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
      highlighted: true,
    };

    const melodyQuarterNote: StaffSequenceEntry = {
      key: "mel-playing",
      kind: "note",
      projection: projectionFor([exactPitch(60, { step: "C", alter: 0 })]),
      tabPositions: [{ str: 2, fret: 1 }],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
      highlighted: true,
    };

    const container = document.createElement("div");
    const cleanup = renderStaffSystem(
      container,
      [
        {
          measureIndex: 0,
          widthPx: 400,
          harmonyEntries: [cMajorTab],
          melodyEntries: [melodyQuarterNote],
        },
      ],
      meter(4, 4),
      undefined,
      { isTablature: true },
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    // Check playing TabNotes have data-staff-playing and data-staff-entry
    const playingTabNotes = svg!.querySelectorAll('.vf-tabnote[data-staff-playing="true"]');
    expect(playingTabNotes.length).toBeGreaterThanOrEqual(1);

    const chordTab = svg!.querySelector('.vf-tabnote[data-staff-entry="m1-c-playing"]');
    expect(chordTab).not.toBeNull();
    expect(chordTab!.getAttribute("data-staff-playing")).toBe("true");

    // Check expanded rect attributes
    const rects = chordTab!.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(0);
    rects.forEach((rect) => {
      expect(rect.getAttribute("rx")).toBe("3");
      expect(rect.getAttribute("ry")).toBe("3");
      const height = parseFloat(rect.getAttribute("height") || "0");
      expect(height).toBeGreaterThanOrEqual(8);
    });

    cleanup();
  });

  it("renders left-hand finger badges on tablature notes when showFingering is enabled", () => {
    const melodyEntry: StaffSequenceEntry = {
      key: "m1-note",
      kind: "note",
      projection: projectionFor([exactPitch(60, { step: "C", alter: 0 })]),
      tabPositions: [{ str: 2, fret: 1, finger: 1 }],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    };

    const containerWithFingering = document.createElement("div");
    const cleanup1 = renderStaffSystem(
      containerWithFingering,
      [
        {
          measureIndex: 0,
          widthPx: 400,
          harmonyEntries: [melodyEntry],
        },
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showFingering: true },
    );

    const svg1 = containerWithFingering.querySelector("svg");
    expect(svg1).not.toBeNull();
    // Default style: badge under fret number
    const fretBadge = svg1!.querySelector(".vf-tab-fret-badge");
    expect(fretBadge).not.toBeNull();
    expect(fretBadge!.getAttribute("data-tab-finger")).toBe("1");
    const fretText = svg1!.querySelector(".vf-tab-fret-text-with-badge");
    expect(fretText).not.toBeNull();
    expect(fretText!.getAttribute("data-tab-finger")).toBe("1");
    cleanup1();

    // Style: numbers (circle with finger number)
    const containerNumbers = document.createElement("div");
    const cleanupNumbers = renderStaffSystem(
      containerNumbers,
      [
        {
          measureIndex: 0,
          widthPx: 400,
          harmonyEntries: [melodyEntry],
        },
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showFingering: true, fingeringStyle: "numbers" },
    );
    const svgNumbers = containerNumbers.querySelector("svg");
    expect(svgNumbers).not.toBeNull();
    const fingerBadges = svgNumbers!.querySelectorAll(".vf-tab-finger");
    expect(fingerBadges.length).toBe(1);
    expect(fingerBadges[0]!.getAttribute("data-tab-finger")).toBe("1");
    expect(fingerBadges[0]!.textContent).toBe("1");
    cleanupNumbers();

    // Style: dots (pure color dots)
    const containerDots = document.createElement("div");
    const cleanupDots = renderStaffSystem(
      containerDots,
      [
        {
          measureIndex: 0,
          widthPx: 400,
          harmonyEntries: [melodyEntry],
        },
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showFingering: true, fingeringStyle: "dots" },
    );
    const svgDots = containerDots.querySelector("svg");
    expect(svgDots).not.toBeNull();
    const dotBadge = svgDots!.querySelector(".vf-tab-finger-dot");
    expect(dotBadge).not.toBeNull();
    expect(dotBadge!.getAttribute("data-tab-finger")).toBe("1");
    cleanupDots();

    const containerWithoutFingering = document.createElement("div");
    const cleanup2 = renderStaffSystem(
      containerWithoutFingering,
      [
        {
          measureIndex: 0,
          widthPx: 400,
          harmonyEntries: [melodyEntry],
        },
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showFingering: false },
    );

    const svg2 = containerWithoutFingering.querySelector("svg");
    expect(svg2).not.toBeNull();
    expect(svg2!.querySelectorAll("[data-tab-finger]").length).toBe(0);
    cleanup2();
  });

  it("renders correct finger badges on chord tablature notes", () => {
    const chordEntry: StaffSequenceEntry = {
      key: "c-chord",
      kind: "chord",
      projection: projectionFor([
        exactPitch(48, { step: "C", alter: 0 }),
        exactPitch(52, { step: "E", alter: 0 }),
        exactPitch(55, { step: "G", alter: 0 }),
        exactPitch(60, { step: "C", alter: 0 }),
        exactPitch(64, { step: "E", alter: 0 }),
      ]),
      tabPositions: [
        { str: 1, fret: 0 },
        { str: 2, fret: 1, finger: 1 },
        { str: 3, fret: 0 },
        { str: 4, fret: 2, finger: 2 },
        { str: 5, fret: 3, finger: 3 },
      ],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    };

    const container = document.createElement("div");
    renderStaffSystem(
      container,
      [{ measureIndex: 0, widthPx: 400, harmonyEntries: [chordEntry] }],
      meter(4, 4),
      undefined,
      { isTablature: true, showFingering: true, fingeringStyle: "dots" },
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const tabNote = svg!.querySelector(".vf-tabnote");
    expect(tabNote).not.toBeNull();
    const texts = Array.from(tabNote!.querySelectorAll("text:not(.vf-tab-finger)"));
    expect(texts).toHaveLength(5);
    const badges = Array.from(tabNote!.querySelectorAll(".vf-tab-finger-badge"));
    expect(badges).toHaveLength(3);
    expect(badges.map((b) => b.getAttribute("data-tab-finger"))).toEqual(["1", "2", "3"]);
  });

  it("renders correct finger badges in polyphonic tab when melody note occupies a string", () => {
    const melodyEntry: StaffSequenceEntry = {
      key: "m1-note",
      kind: "note",
      projection: projectionFor([exactPitch(64, { step: "E", alter: 0 })]),
      tabPositions: [{ str: 1, fret: 0 }],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(1)),
    };
    const chordEntry: StaffSequenceEntry = {
      key: "c-chord",
      kind: "chord",
      projection: projectionFor([
        exactPitch(48, { step: "C", alter: 0 }),
        exactPitch(52, { step: "E", alter: 0 }),
        exactPitch(55, { step: "G", alter: 0 }),
        exactPitch(60, { step: "C", alter: 0 }),
        exactPitch(64, { step: "E", alter: 0 }),
      ]),
      tabPositions: [
        { str: 1, fret: 0 },
        { str: 2, fret: 1, finger: 1 },
        { str: 3, fret: 0 },
        { str: 4, fret: 2, finger: 2 },
        { str: 5, fret: 3, finger: 3 },
      ],
      startOffsetBeats: rational(0),
      duration: musicalDuration(rational(4)),
    };

    const container = document.createElement("div");
    renderStaffSystem(
      container,
      [
        {
          measureIndex: 0,
          widthPx: 400,
          melodyLanes: [{ id: "lead", clef: "treble", entries: [melodyEntry] }],
          harmonyEntries: [chordEntry],
        },
      ],
      meter(4, 4),
      undefined,
      { isTablature: true, showFingering: true, fingeringStyle: "dots" },
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const chordTabNote = svg!.querySelector('.vf-tabnote[data-staff-entry="c-chord"]');
    expect(chordTabNote).not.toBeNull();

    // The chord keeps all five frets and marks the overlapping string explicitly.
    const texts = Array.from(chordTabNote!.querySelectorAll("text:not(.vf-tab-finger)"));
    expect(texts).toHaveLength(5);
    expect(chordTabNote?.getAttribute("data-tab-position-conflict")).toBe("true");

    // Badges must be attached to:
    // str 2: finger 1
    // str 4: finger 2
    // str 5: finger 3
    // str 3 (fret 0) must NOT have any badge
    const badges = Array.from(chordTabNote!.querySelectorAll(".vf-tab-finger-badge"));
    expect(badges).toHaveLength(3);
    expect(badges.map((b) => b.getAttribute("data-tab-finger"))).toEqual(["1", "2", "3"]);

    const textYMap = texts.map((t) => parseFloat(t.getAttribute("y") || "0"));
    const badgeCyMap = badges.map((b) =>
      parseFloat(b.querySelector("circle")?.getAttribute("cy") || "0"),
    );

    // Verify each badge matches the exact Y of its fret text; the fifth label
    // is the retained, overlapping low-string position.
    expect(badgeCyMap[0]).toBeCloseTo(textYMap[1]!, 1); // finger 1 on fret 1 (str 2)
    expect(badgeCyMap[1]).toBeCloseTo(textYMap[3]!, 1); // finger 2 on fret 2 (str 4)
    expect(badgeCyMap[2]).toBeCloseTo(textYMap[4]!, 1); // finger 3 on fret 3 (str 5)
  });

  it("renders ledger lines with 1px stroke-width and crispEdges shape-rendering in staff projection", () => {
    const container = document.createElement("div");
    // Middle C (C4) sits on the first ledger line below the treble staff
    const c4Projection = projectionFor([exactPitch(60, { step: "C", alter: 0 })]);
    const cleanup = renderStaffProjection(container, c4Projection, musicalDuration(rational(4)));

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    // Ledger lines are direct child path elements of .vf-stavenote
    const ledgerLines = Array.from(svg!.querySelectorAll(".vf-stavenote > path"));
    expect(ledgerLines.length).toBeGreaterThan(0);
    ledgerLines.forEach((line) => {
      expect(line.getAttribute("stroke-width")).toBe("1");
      expect(line.getAttribute("shape-rendering")).toBe("crispEdges");
    });

    cleanup();
  });

  it("renders ledger lines with 1px stroke-width and crispEdges in score systems", () => {
    const container = document.createElement("div");
    const measure: StaffSystemMeasureInput = {
      measureIndex: 0,
      widthPx: 300,
      harmonyEntries: [
        {
          kind: "chord",
          key: "c4-chord",
          projection: projectionFor([exactPitch(60, { step: "C", alter: 0 })]),
          duration: musicalDuration(rational(4)),
          startOffsetBeats: rational(0),
          highlighted: false,
        },
      ],
      melodyEntries: [],
    };

    const cleanup = renderStaffSystem(container, [measure], meter(4, 4));

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    const ledgerLines = Array.from(svg!.querySelectorAll(".vf-stavenote > path"));
    expect(ledgerLines.length).toBeGreaterThan(0);
    ledgerLines.forEach((line) => {
      expect(line.getAttribute("stroke-width")).toBe("1");
      expect(line.getAttribute("shape-rendering")).toBe("crispEdges");
    });

    cleanup();
  });
});
