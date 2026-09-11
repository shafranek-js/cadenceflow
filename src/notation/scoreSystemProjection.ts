import type { MeasuresPerSystem } from "../domain/project/project";
import type { ProgressionMeasure, ProgressionMeasureLayout } from "../domain/timing/measureLayout";
import { rationalToNumber, subtractRational, type Rational } from "../domain/timing/rational";

export const STAFF_QUARTER_BEAT_WIDTH_PX = 84;
export const STAFF_NORMAL_ATTACKS_PER_QUARTER_BEAT = 2;
export const STAFF_DENSE_ATTACK_WIDTH_PX = 44;
export const AUTO_SYSTEM_TARGET_QUARTER_BEATS = 16;
export const AUTO_MIN_MEASURES_PER_SYSTEM = 2;
export const AUTO_MAX_MEASURES_PER_SYSTEM = 6;

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
  readonly maximumMeasuresPerSystem: 1 | 2 | 3 | 4 | 5 | 6;
  readonly measures: readonly ScoreSystemMeasure[];
  readonly systems: readonly ScoreSystem[];
}

export interface ScoreSystemProjectionOptions {
  readonly availableWidthPx: number;
  readonly measuresPerSystem?: MeasuresPerSystem;
  readonly additionalAttacks?: readonly ScoreSystemAttack[];
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

function maximumFor(
  measuresPerSystem: MeasuresPerSystem,
  measureDurationQuarterBeats: number,
): 1 | 2 | 3 | 4 | 5 | 6 {
  return measuresPerSystem === "auto"
    ? autoMaximumMeasuresPerSystem(measureDurationQuarterBeats)
    : measuresPerSystem;
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
  const maximumMeasuresPerSystem = maximumFor(measuresPerSystem, measureDurationQuarterBeats);
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

  measures.forEach((measure) => {
    const wouldExceedWidth =
      current.length > 0 && currentWidth + measure.requiredWidthPx > availableWidthPx;
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
