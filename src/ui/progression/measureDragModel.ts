/**
 * Geometry for dragging a Measure in the piano-roll view.
 *
 * Kept pure and free of the DOM so the drop rules can be unit tested directly, and so the pointer
 * handler only has to measure rectangles and call one function.
 *
 * Why the drop target is a flat Measure index rather than a (System, cell) pair: Score Systems are
 * *derived*, not stored. `projectScoreSystems` packs the flat Measure list into Systems according to
 * the global `measuresPerSystem` setting, so the only durable statement a user can make is "this
 * Measure belongs before that one". Dropping into the empty cell at the end of a System is therefore
 * the same flat slot as inserting before the first Measure of the next System — which is exactly
 * what makes a Measure land in the trailing free space of the System above.
 *
 * Slot and System are resolved together on purpose. They cannot be derived independently: for the
 * trailing free cell the slot points at the next System's first Measure, while the indicator has to
 * stay on the *current* row. Resolving the row from the slot alone put the indicator on the wrong
 * System's first Measure.
 */

/** One rendered Measure, in viewport coordinates. */
export interface MeasureDropRect {
  /** Flat index of the Measure in the progression (0-based), i.e. `data-measure-index`. */
  readonly measureIndex: number;
  /** System the Measure is currently rendered in, i.e. `data-system-index`. */
  readonly systemIndex: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface DropPoint {
  readonly x: number;
  readonly y: number;
}

export interface MeasureDropTarget {
  /** Flat Measure index the dragged Measure should be inserted before; `count` appends. */
  readonly slot: number;
  /**
   * System whose row the drop lands in.
   *
   * The caller needs this to place the insertion indicator: for the trailing free cell of System R
   * the slot equals the flat index of System R+1's first Measure, so matching on the slot alone
   * would draw the indicator on the wrong row.
   */
  readonly systemIndex: number;
}

interface SystemBand {
  readonly systemIndex: number;
  readonly top: number;
  readonly bottom: number;
  readonly measures: readonly MeasureDropRect[];
}

function toBands(rects: readonly MeasureDropRect[]): readonly SystemBand[] {
  const bySystem = new Map<number, MeasureDropRect[]>();
  for (const rect of rects) {
    const bucket = bySystem.get(rect.systemIndex);
    if (bucket) bucket.push(rect);
    else bySystem.set(rect.systemIndex, [rect]);
  }
  return [...bySystem.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([systemIndex, measures]) => ({
      systemIndex,
      top: Math.min(...measures.map((measure) => measure.top)),
      bottom: Math.max(...measures.map((measure) => measure.bottom)),
      measures: [...measures].sort((a, b) => a.left - b.left),
    }));
}

function verticalDistance(band: SystemBand, y: number): number {
  if (y < band.top) return band.top - y;
  if (y > band.bottom) return y - band.bottom;
  return 0;
}

function nearestBand(bands: readonly SystemBand[], y: number): SystemBand {
  let best = bands[0]!;
  let bestDistance = verticalDistance(best, y);
  for (const band of bands.slice(1)) {
    const distance = verticalDistance(band, y);
    if (distance < bestDistance) {
      best = band;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Resolves where a Measure dropped at `cursor` would land, or `null` when there is nothing to drop
 * onto.
 *
 * The row is chosen by vertical proximity, so a drag that strays slightly above or below a System
 * still targets the nearest one instead of cancelling. Within the row the cursor is compared against
 * each Measure's horizontal midpoint: left half means "insert before this one"; right of every
 * Measure means the row's trailing free cell, which is the slot after that row's last Measure.
 */
export function measureDropTarget(
  rects: readonly MeasureDropRect[],
  cursor: DropPoint,
): MeasureDropTarget | null {
  if (rects.length === 0) return null;
  const bands = toBands(rects);
  if (bands.length === 0) return null;
  const band = nearestBand(bands, cursor.y);

  for (const measure of band.measures) {
    if (cursor.x < (measure.left + measure.right) / 2) {
      return { slot: measure.measureIndex, systemIndex: band.systemIndex };
    }
  }
  const last = band.measures[band.measures.length - 1];
  if (!last) return null;
  return { slot: last.measureIndex + 1, systemIndex: band.systemIndex };
}

/** True when a drop at `slot` would leave the progression unchanged. */
export function isNoOpMeasureDrop(fromMeasureIndex: number, slot: number): boolean {
  return slot === fromMeasureIndex || slot === fromMeasureIndex + 1;
}
