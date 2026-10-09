import type { MeasuresPerSystem } from "../domain/project/project";
import type { ProgressionMeasure, ProgressionMeasureLayout } from "../domain/timing/measureLayout";
import { rationalToNumber, subtractRational, type Rational } from "../domain/timing/rational";

export const STAFF_QUARTER_BEAT_WIDTH_PX = 84;
export const STAFF_NORMAL_ATTACKS_PER_QUARTER_BEAT = 2;
export const STAFF_DENSE_ATTACK_WIDTH_PX = 44;
export const AUTO_SYSTEM_TARGET_QUARTER_BEATS = 16;
export const AUTO_MIN_MEASURES_PER_SYSTEM = 2;
export const AUTO_MAX_MEASURES_PER_SYSTEM = 6;
/** Fallback grouping when a caller does not supply the meter: four Measures, as in common time. */
export const AUTO_DEFAULT_MEASURES_PER_SYSTEM = 4;

export interface ScoreSystemAttack {
  readonly measureIndex: number;
  readonly startOffsetBeats: Rational;
}

export interface ScoreSystemMeasure {
  readonly measure: ProgressionMeasure;
  readonly measureIndex: number;
  readonly requiredWidthPx: number;
  readonly uniqueAttackCount: number;
}

export interface ScoreSystem {
  readonly index: number;
  readonly measures: readonly ScoreSystemMeasure[];
  readonly requiredWidthPx: number;
  readonly horizontallyScrollable: boolean;
}

export interface ScoreSystemProjection {
  readonly availableWidthPx: number;
  readonly measuresPerSystem: MeasuresPerSystem;
  readonly maximumMeasuresPerSystem: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly measures: readonly ScoreSystemMeasure[];
  readonly systems: readonly ScoreSystem[];
}

export interface ScoreSystemProjectionOptions {
  readonly availableWidthPx: number;
  readonly measuresPerSystem?: MeasuresPerSystem;
  readonly additionalAttacks?: readonly ScoreSystemAttack[];
  /**
   * Whether a Measure that would not fit should start a new System (default) or stay on the
   * current one.
   *
   * The Staff and Tablature projections must break by width: their Measures are notation with a
   * required engraving width and cannot be squeezed. The piano-roll renders Measures as CSS grid
   * cells that shrink down to a minimum and then scroll, so breaking there is wrong — it moved the
   * last Measure of a System onto the next row whenever the side panel narrowed the viewport,
   * instead of letting the row shrink as it did before.
   */
  readonly packMeasuresByWidth?: boolean;
  /**
   * Meter denominator, i.e. the note value that gets the beat. The "auto" grouping holds that many
   * Measures per System (5/4 and 4/4 hold four, 3/2 holds two). Omit it to fall back to the older
   * musical-length rule.
   */
  readonly meterDenominator?: number;
}

export function autoMaximumMeasuresPerSystem(
  measureDurationQuarterBeats: number,
): 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(measureDurationQuarterBeats) || measureDurationQuarterBeats <= 0) {
    return AUTO_MAX_MEASURES_PER_SYSTEM;
  }
  return Math.min(
    AUTO_MAX_MEASURES_PER_SYSTEM,
    Math.max(
      AUTO_MIN_MEASURES_PER_SYSTEM,
      Math.floor(AUTO_SYSTEM_TARGET_QUARTER_BEATS / measureDurationQuarterBeats),
    ),
  ) as 2 | 3 | 4 | 5 | 6;
}

/**
 * How many Measures an "auto" System holds: as many as the meter's denominator says.
 *
 * The meter names the beat unit, and a System reads best when it holds that many Measures — 4/4 holds
 * four, 5/4 holds four, 3/2 holds two. Grouping by musical length instead (`AUTO_SYSTEM_TARGET_*`,
 * which aimed for 16 quarter beats) gave 5/4 only three Measures and pushed the fourth onto a row of
 * its own while the row above still had room for it; grouping by pixels gave the opposite mess,
 * packing eight Measures of 5/4 into one row because they were allowed to shrink.
 */
export function autoMeasuresPerSystemForMeter(
  meterDenominator: number,
): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  if (!Number.isFinite(meterDenominator) || meterDenominator < 1) {
    return AUTO_DEFAULT_MEASURES_PER_SYSTEM;
  }
  return Math.min(8, Math.max(1, Math.floor(meterDenominator))) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

function maximumFor(
  measuresPerSystem: MeasuresPerSystem,
  measureDurationQuarterBeats: number,
  meterDenominator: number | undefined,
): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 {
  if (measuresPerSystem !== "auto") return measuresPerSystem;
  if (meterDenominator === undefined)
    return autoMaximumMeasuresPerSystem(measureDurationQuarterBeats);
  return autoMeasuresPerSystemForMeter(meterDenominator);
}

function rationalKey(value: Rational): string {
  return `${value.numerator}/${value.denominator}`;
}

function attackKey(measureIndex: number, startOffsetBeats: Rational): string {
  return `${measureIndex}:${rationalKey(startOffsetBeats)}`;
}

function harmonicAttackOffsets(measure: ProgressionMeasure): readonly Rational[] {
  return measure.fragments
    .filter((fragment) => fragment.startsHere && fragment.step.kind === "chord")
    .map((fragment) => subtractRational(fragment.startBeats, measure.startBeats));
}

export function countUniqueStaffAttacks(
  measure: ProgressionMeasure,
  additionalAttacks: readonly ScoreSystemAttack[] = [],
): number {
  const keys = new Set(
    harmonicAttackOffsets(measure).map((offset) => attackKey(measure.measureIndex, offset)),
  );
  additionalAttacks.forEach((attack) => {
    if (attack.measureIndex === measure.measureIndex) {
      keys.add(attackKey(attack.measureIndex, attack.startOffsetBeats));
    }
  });
  return keys.size;
}

export function requiredStaffMeasureWidthPx(
  measureDurationQuarterBeats: number,
  uniqueAttackCount: number,
): number {
  const duration = Number.isFinite(measureDurationQuarterBeats)
    ? Math.max(0, measureDurationQuarterBeats)
    : 0;
  const attackCount = Math.max(0, Math.floor(uniqueAttackCount));
  const normalAttackBudget = Math.ceil(duration * STAFF_NORMAL_ATTACKS_PER_QUARTER_BEAT);
  const denseAttacks = Math.max(0, attackCount - normalAttackBudget);
  return (
    Math.round(duration * STAFF_QUARTER_BEAT_WIDTH_PX) + denseAttacks * STAFF_DENSE_ATTACK_WIDTH_PX
  );
}

function normalizeOptions(
  optionsOrWidth: ScoreSystemProjectionOptions | number,
  measuresPerSystem: MeasuresPerSystem = "auto",
  additionalAttacks: readonly ScoreSystemAttack[] = [],
): ScoreSystemProjectionOptions {
  if (typeof optionsOrWidth === "number") {
    return {
      availableWidthPx: optionsOrWidth,
      measuresPerSystem,
      additionalAttacks,
    };
  }
  return optionsOrWidth;
}

/**
 * Groups the existing exact measure layout into responsive score systems.
 * This is deliberately a presentation-only projection: the original layout
 * and its step fragments are returned by reference and never mutated.
 */
export function projectScoreSystems(
  layout: ProgressionMeasureLayout,
  options: ScoreSystemProjectionOptions,
): ScoreSystemProjection;
export function projectScoreSystems(
  layout: ProgressionMeasureLayout,
  availableWidthPx: number,
  measuresPerSystem?: MeasuresPerSystem,
  additionalAttacks?: readonly ScoreSystemAttack[],
): ScoreSystemProjection;
export function projectScoreSystems(
  layout: ProgressionMeasureLayout,
  optionsOrWidth: ScoreSystemProjectionOptions | number,
  requestedMeasuresPerSystem: MeasuresPerSystem = "auto",
  requestedAdditionalAttacks: readonly ScoreSystemAttack[] = [],
): ScoreSystemProjection {
  const options = normalizeOptions(
    optionsOrWidth,
    requestedMeasuresPerSystem,
    requestedAdditionalAttacks,
  );
  const measuresPerSystem = options.measuresPerSystem ?? "auto";
  const availableWidthPx = Number.isFinite(options.availableWidthPx)
    ? Math.max(0, options.availableWidthPx)
    : 0;
  const measureDurationQuarterBeats = rationalToNumber(layout.barLengthBeats);
  const maximumMeasuresPerSystem = maximumFor(
    measuresPerSystem,
    measureDurationQuarterBeats,
    options.meterDenominator,
  );
  const additionalAttacks = options.additionalAttacks ?? [];
  const measures = layout.measures.map((measure) => {
    const uniqueAttackCount = countUniqueStaffAttacks(measure, additionalAttacks);
    return Object.freeze({
      measure,
      measureIndex: measure.measureIndex,
      requiredWidthPx: requiredStaffMeasureWidthPx(measureDurationQuarterBeats, uniqueAttackCount),
      uniqueAttackCount,
    });
  });

  const systems: ScoreSystem[] = [];
  let current: ScoreSystemMeasure[] = [];
  let currentWidth = 0;
  const flush = () => {
    if (current.length === 0) return;
    const systemMeasures = Object.freeze([...current]);
    systems.push(
      Object.freeze({
        index: systems.length,
        measures: systemMeasures,
        requiredWidthPx: currentWidth,
        horizontallyScrollable: systemMeasures.length === 1 && currentWidth > availableWidthPx,
      }),
    );
    current = [];
    currentWidth = 0;
  };

  const packMeasuresByWidth = options.packMeasuresByWidth ?? true;
  measures.forEach((measure) => {
    const wouldExceedWidth =
      packMeasuresByWidth &&
      current.length > 0 &&
      currentWidth + measure.requiredWidthPx > availableWidthPx;
    const wouldExceedMaximum = current.length >= maximumMeasuresPerSystem;
    if (wouldExceedWidth || wouldExceedMaximum) flush();
    current.push(measure);
    currentWidth += measure.requiredWidthPx;
  });
  flush();

  return Object.freeze({
    availableWidthPx,
    measuresPerSystem,
    maximumMeasuresPerSystem,
    measures: Object.freeze(measures),
    systems: Object.freeze(systems),
  });
}

export const createScoreSystemProjection = projectScoreSystems;
export const calculateStaffMeasureWidth = requiredStaffMeasureWidthPx;
