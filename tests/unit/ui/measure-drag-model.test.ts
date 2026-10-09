import { describe, expect, it } from "vitest";
import {
  isNoOpMeasureDrop,
  measureDropTarget,
  type MeasureDropRect,
} from "../../../src/ui/progression/measureDragModel";

/**
 * Two Systems of two Measures each, laid out like the piano-roll grid:
 *
 *   System 0 (y 0..100):   [m0 0..200] [m1 200..400] [free cell 400..600]
 *   System 1 (y 120..220): [m2 0..200] [m3 200..400] [free cell 400..600]
 */
const rects: readonly MeasureDropRect[] = Object.freeze<readonly MeasureDropRect[]>([
  { measureIndex: 0, systemIndex: 0, left: 0, right: 200, top: 0, bottom: 100 },
  { measureIndex: 1, systemIndex: 0, left: 200, right: 400, top: 0, bottom: 100 },
  { measureIndex: 2, systemIndex: 1, left: 0, right: 200, top: 120, bottom: 220 },
  { measureIndex: 3, systemIndex: 1, left: 200, right: 400, top: 120, bottom: 220 },
]);

describe("measureDropTarget", () => {
  it("returns null when there is nothing to drop onto", () => {
    expect(measureDropTarget([], { x: 0, y: 0 })).toBeNull();
  });

  it("inserts before a Measure when the cursor is in its left half", () => {
    expect(measureDropTarget(rects, { x: 10, y: 50 })).toEqual({ slot: 0, systemIndex: 0 });
    expect(measureDropTarget(rects, { x: 210, y: 50 })).toEqual({ slot: 1, systemIndex: 0 });
  });

  it("inserts before the next Measure when the cursor is in the right half", () => {
    expect(measureDropTarget(rects, { x: 190, y: 50 })?.slot).toBe(1);
    expect(measureDropTarget(rects, { x: 390, y: 50 })?.slot).toBe(2);
  });

  it("reports the row whose free cell is targeted, not the row the slot points into", () => {
    // The trailing free cell of System 0 has the same flat slot as "before System 1's first
    // Measure", so the drop must still be attributed to System 0 — otherwise the insertion
    // indicator would be drawn on the wrong row.
    const target = measureDropTarget(rects, { x: 500, y: 50 });
    expect(target).toEqual({ slot: 2, systemIndex: 0 });
  });

  it("appends when dropping past the very last Measure of the last System", () => {
    expect(measureDropTarget(rects, { x: 500, y: 170 })).toEqual({ slot: 4, systemIndex: 1 });
  });

  it("addresses the second System by its own measures", () => {
    expect(measureDropTarget(rects, { x: 10, y: 170 })?.slot).toBe(2);
    expect(measureDropTarget(rects, { x: 210, y: 170 })?.slot).toBe(3);
    expect(measureDropTarget(rects, { x: 390, y: 170 })?.slot).toBe(4);
  });

  it("falls back to the nearest System when the cursor is between rows", () => {
    // The gap between the two rows (100..120) is nearer to System 0 at y=105 and to System 1 at
    // y=115, so a drag that strays off a row still resolves instead of cancelling.
    expect(measureDropTarget(rects, { x: 10, y: 105 })?.slot).toBe(0);
    expect(measureDropTarget(rects, { x: 10, y: 115 })?.slot).toBe(2);
  });

  it("falls back to the nearest System when the cursor is above or below everything", () => {
    expect(measureDropTarget(rects, { x: 10, y: -500 })?.slot).toBe(0);
    expect(measureDropTarget(rects, { x: 10, y: 5000 })?.slot).toBe(2);
  });

  it("tolerates a Measure rendered out of order in the row", () => {
    const shuffled: readonly MeasureDropRect[] = [
      { measureIndex: 1, systemIndex: 0, left: 200, right: 400, top: 0, bottom: 100 },
      { measureIndex: 0, systemIndex: 0, left: 0, right: 200, top: 0, bottom: 100 },
    ];
    // Slot resolution is by horizontal position, not by array order.
    expect(measureDropTarget(shuffled, { x: 10, y: 50 })?.slot).toBe(0);
    expect(measureDropTarget(shuffled, { x: 390, y: 50 })).toEqual({ slot: 2, systemIndex: 0 });
  });

  it("reports the System the drop would land in", () => {
    expect(measureDropTarget(rects, { x: 10, y: 50 })?.systemIndex).toBe(0);
    expect(measureDropTarget(rects, { x: 10, y: 170 })?.systemIndex).toBe(1);
  });
});

describe("isNoOpMeasureDrop", () => {
  it("treats dropping a Measure onto itself or onto its own left edge as a no-op", () => {
    expect(isNoOpMeasureDrop(2, 2)).toBe(true);
    expect(isNoOpMeasureDrop(2, 3)).toBe(true);
  });

  it("treats genuine moves as moves", () => {
    expect(isNoOpMeasureDrop(2, 0)).toBe(false);
    expect(isNoOpMeasureDrop(0, 2)).toBe(false);
    expect(isNoOpMeasureDrop(2, 4)).toBe(false);
  });
});
