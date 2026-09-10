import { describe, expect, it } from "vitest";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { meter } from "../../../src/domain/timing/meter";
import {
  createProgressionMeasureLayout,
  fullBarDurationBeats,
  measureLengthBeats,
} from "../../../src/domain/timing/measureLayout";
import { rational } from "../../../src/domain/timing/rational";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import type { ChordStep, RestStep, StepPerformance } from "../../../src/domain/progression/step";

const PERFORMANCE: StepPerformance = Object.freeze({
  articulation: "block",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

function chord(
  id: string,
  beats: number | ReturnType<typeof rational>,
  functionId = "I",
): ChordStep {
  const beatValue = typeof beats === "number" ? rational(beats) : beats;
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(beatValue),
    performance: PERFORMANCE,
    cardView: "piano",
  });
}

function rest(id: string, beats: number | ReturnType<typeof rational>): RestStep {
  return {
    id,
    kind: "rest",
    duration: musicalDuration(typeof beats === "number" ? rational(beats) : beats),
  };
}

describe("progression measure layout", () => {
  it("groups two Half steps into one 4/4 measure and pads one Half with a gap", () => {
    const layout = createProgressionMeasureLayout([chord("a", 2), chord("b", 2)], meter(4, 4));
    expect(layout.measures).toHaveLength(1);
    expect(layout.measures[0]!.fragments).toHaveLength(2);
    expect(layout.trailingSilenceBeats).toEqual(rational(0));

    const partial = createProgressionMeasureLayout([chord("a", 2)], meter(4, 4));
    expect(partial.authoredDurationBeats).toEqual(rational(2));
    expect(partial.playbackDurationBeats).toEqual(rational(4));
    expect(partial.measures[0]!.trailingGap?.durationBeats).toEqual(rational(2));
  });

  it("keeps an onset intact while splitting a step at a barline", () => {
    const layout = createProgressionMeasureLayout([chord("a", 6)], meter(4, 4));
    expect(layout.measures).toHaveLength(2);
    expect(layout.measures[0]!.fragments[0]!.startsHere).toBe(true);
    expect(layout.measures[0]!.fragments[0]!.continuesToNext).toBe(true);
    expect(layout.measures[1]!.fragments[0]!.continuesFromPrevious).toBe(true);
    expect(layout.measures[1]!.fragments[0]!.startsHere).toBe(false);
  });

  it("supports fractional meters and explicit rests without implicit internal gaps", () => {
    const layout = createProgressionMeasureLayout(
      [chord("a", 1), rest("r", 1), chord("b", rational(3, 2))],
      meter(7, 8, [2, 2, 3]),
    );
    expect(fullBarDurationBeats(meter(7, 8, [2, 2, 3]))).toEqual(rational(7, 2));
    expect(layout.measures).toHaveLength(1);
    expect(layout.measures[0]!.items.filter((item) => item.kind === "gap")).toHaveLength(0);
    expect(layout.measures[0]!.trailingGap).toBeUndefined();
  });

  it("derives Full bar from 3/4 and additive 7/8 meters", () => {
    const threeFour = meter(3, 4, [3]);
    const sevenEight = meter(7, 8, [2, 2, 3]);
    expect(measureLengthBeats(threeFour)).toEqual(rational(3));
    expect(fullBarDurationBeats(threeFour)).toEqual(rational(3));
    expect(measureLengthBeats(sevenEight)).toEqual(rational(7, 2));
    expect(fullBarDurationBeats(sevenEight)).toEqual(rational(7, 2));

    const layout = createProgressionMeasureLayout(
      [chord("dotted", rational(3, 2)), chord("triplet", rational(2, 3))],
      threeFour,
    );
    expect(layout.authoredDurationBeats).toEqual(rational(13, 6));
    expect(layout.trailingSilenceBeats).toEqual(rational(5, 6));
    expect(layout.measures[0]!.fragments.map((fragment) => fragment.durationBeats)).toEqual([
      rational(3, 2),
      rational(2, 3),
    ]);
  });

  it("keeps explicit RestStep distinct from the final virtual gap", () => {
    const layout = createProgressionMeasureLayout(
      [chord("a", rational(1)), rest("r", rational(1))],
      meter(4, 4),
    );
    expect(layout.measures[0]!.fragments.map((fragment) => fragment.step.kind)).toEqual([
      "chord",
      "rest",
    ]);
    expect(layout.measures[0]!.trailingGap?.durationBeats).toEqual(rational(2));
    expect(layout.measures[0]!.items.at(-1)?.kind).toBe("gap");
  });

  it("handles a step crossing multiple barlines with exact offsets", () => {
    const layout = createProgressionMeasureLayout([chord("long", rational(25, 2))], meter(3, 4));
    expect(layout.measures).toHaveLength(5);
    expect(layout.measures.map((measure) => measure.fragments[0]!.durationBeats)).toEqual([
      rational(3),
      rational(3),
      rational(3),
      rational(3),
      rational(1, 2),
    ]);
    expect(layout.measures[4]!.trailingGap?.durationBeats).toEqual(rational(5, 2));
  });

  it("returns a frozen deterministic projection", () => {
    const layout = createProgressionMeasureLayout([chord("a", 2)], meter(4, 4));
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.measures)).toBe(true);
    expect(createProgressionMeasureLayout([chord("a", 2)], meter(4, 4))).toEqual(layout);
  });
});
