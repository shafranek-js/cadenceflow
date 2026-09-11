import { describe, expect, it } from "vitest";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";
import type { ChordStep, ProgressionStep } from "../../../src/domain/progression/step";
import { createProgressionMeasureLayout } from "../../../src/domain/timing/measureLayout";
import { meter } from "../../../src/domain/timing/meter";
import { rational } from "../../../src/domain/timing/rational";
import {
  autoMaximumMeasuresPerSystem,
  countUniqueStaffAttacks,
  projectScoreSystems,
  requiredStaffMeasureWidthPx,
} from "../../../src/notation/scoreSystemProjection";

function chordStep(id: string, beats: number, denominator = 1): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId: "I" },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: { beats: rational(beats, denominator) },
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "harmonic",
  };
}

function layoutFor(steps: readonly ProgressionStep[], value = meter(4, 4)) {
  return createProgressionMeasureLayout(steps, value);
}

describe("ScoreSystemProjection", () => {
  it("uses meter duration for the Auto maximum", () => {
    const cases = [
      [2, 4, 6],
      [3, 4, 5],
      [4, 4, 4],
      [5, 4, 3],
      [6, 8, 5],
      [7, 8, 4],
      [9, 8, 3],
      [12, 8, 2],
    ] as const;

    cases.forEach(([numerator, denominator, expected]) => {
      const value = meter(numerator, denominator);
      const layout = layoutFor(
        [chordStep(`${numerator}/${denominator}`, numerator * 4, denominator)],
        value,
      );
      const projection = projectScoreSystems(layout, {
        availableWidthPx: 10_000,
        measuresPerSystem: "auto",
      });

      expect(projection.maximumMeasuresPerSystem).toBe(expected);
      expect(autoMaximumMeasuresPerSystem((numerator * 4) / denominator)).toBe(expected);
    });
  });

  it("keeps manual values as hard maximums from one through four", () => {
    const layout = layoutFor(
      Array.from({ length: 6 }, (_, index) => chordStep(`step-${index}`, 4)),
    );

    expect(
      [1, 2, 3, 4].map(
        (measuresPerSystem) =>
          projectScoreSystems(layout, {
            availableWidthPx: 10_000,
            measuresPerSystem: measuresPerSystem as 1 | 2 | 3 | 4,
          }).maximumMeasuresPerSystem,
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  it("uses time-proportional widths and adds space only for dense attacks", () => {
    expect(requiredStaffMeasureWidthPx(4, 0)).toBe(336);
    expect(requiredStaffMeasureWidthPx(3, 6)).toBe(252);
    expect(requiredStaffMeasureWidthPx(2, 4)).toBe(168);
    expect(requiredStaffMeasureWidthPx(3, 6)).toBe(252); // 6/8
    expect(requiredStaffMeasureWidthPx(3.5, 7)).toBe(294); // 7/8
    expect(requiredStaffMeasureWidthPx(4, 8)).toBe(336);
    expect(requiredStaffMeasureWidthPx(4, 16)).toBe(688);
  });

  it("does not count rests or trailing gaps as attacks", () => {
    const layout = layoutFor([
      chordStep("chord", 2),
      { id: "rest", kind: "rest", duration: { beats: rational(1) } },
    ]);
    const measure = layout.measures[0]!;

    expect(countUniqueStaffAttacks(measure)).toBe(1);
    expect(measure.trailingGap?.durationBeats).toEqual(rational(1));
    expect(projectScoreSystems(layout, 200, 1).systems[0]).toMatchObject({
      requiredWidthPx: 336,
      horizontallyScrollable: true,
    });
  });

  it("retains cross-bar continuation fragments for tied notation", () => {
    const layout = layoutFor([chordStep("cross-bar", 5), chordStep("next", 3)]);
    const fragments = layout.measures.flatMap((measure) =>
      measure.fragments.filter((fragment) => fragment.stepId === "cross-bar"),
    );

    expect(fragments).toHaveLength(2);
    expect(fragments[0]).toMatchObject({
      startsHere: true,
      continuesToNext: true,
      durationBeats: rational(4),
    });
    expect(fragments[1]).toMatchObject({
      startsHere: false,
      continuesFromPrevious: true,
      continuesToNext: false,
      durationBeats: rational(1),
    });
  });

  it("reduces grouping when density or available width makes the next measure too wide", () => {
    const layout = layoutFor([
      chordStep("dense", 4),
      chordStep("normal-1", 4),
      chordStep("normal-2", 4),
    ]);
    const additionalAttacks = Array.from({ length: 16 }, (_, index) => ({
      measureIndex: 0,
      startOffsetBeats: rational(index, 4),
    }));
    const projection = projectScoreSystems(layout, {
      availableWidthPx: 1_000,
      measuresPerSystem: "auto",
      additionalAttacks,
    });

    expect(projection.measures[0]?.requiredWidthPx).toBe(688);
    expect(projection.systems.map((system) => system.measures.length)).toEqual([1, 2]);
    expect(projection.systems[0]?.horizontallyScrollable).toBe(false);
  });

  it("marks only a single over-wide measure as locally scrollable, never as page overflow", () => {
    const layout = layoutFor([chordStep("dense", 4)]);
    const additionalAttacks = Array.from({ length: 16 }, (_, index) => ({
      measureIndex: 0,
      startOffsetBeats: rational(index, 4),
    }));
    const projection = projectScoreSystems(layout, {
      availableWidthPx: 600,
      measuresPerSystem: 4,
      additionalAttacks,
    });

    expect(projection.measures[0]?.uniqueAttackCount).toBe(16);
    expect(projection.systems).toHaveLength(1);
    expect(projection.systems[0]).toMatchObject({
      requiredWidthPx: 688,
      horizontallyScrollable: true,
    });
    expect(projection.systems[0]?.measures).toHaveLength(1);
  });

  it("fits four normally dense 4/4 measures in a 1344 px desktop rail", () => {
    const layout = layoutFor(
      Array.from({ length: 4 }, (_, index) => chordStep(`measure-${index}`, 4)),
    );
    const additionalAttacks = layout.measures.flatMap((measure) =>
      Array.from({ length: 8 }, (_, index) => ({
        measureIndex: measure.measureIndex,
        startOffsetBeats: rational(index, 2),
      })),
    );

    const projection = projectScoreSystems(layout, {
      availableWidthPx: 1_344,
      measuresPerSystem: "auto",
      additionalAttacks,
    });

    expect(projection.measures.map((measure) => measure.requiredWidthPx)).toEqual([
      336, 336, 336, 336,
    ]);
    expect(projection.systems.map((system) => system.measures.length)).toEqual([4]);
  });

  it("supports triplet onset density without changing exact progression timing", () => {
    const layout = layoutFor([
      ...Array.from({ length: 12 }, (_, index) => chordStep(`triplet-${index + 1}`, 1, 3)),
      chordStep("following", 1),
    ]);
    const projection = projectScoreSystems(layout, 900, 1);

    expect(layout.authoredDurationBeats).toEqual(rational(5));
    expect(projection.measures[0]?.uniqueAttackCount).toBe(12);
    expect(projection.systems[0]?.measures.length).toBe(1);
    expect(projection.systems[1]?.measures.length).toBe(1);
  });

  it("does not mutate the canonical layout while projecting", () => {
    const layout = layoutFor([chordStep("one", 4), chordStep("two", 4)]);
    const before = JSON.stringify(layout);

    projectScoreSystems(layout, { availableWidthPx: 900, measuresPerSystem: "auto" });

    expect(JSON.stringify(layout)).toBe(before);
  });
});
