import type { ProgressionStep } from "../progression/step";
import type { Meter } from "./meter";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  subtractRational,
  ZERO,
  type Rational,
} from "./rational";

/** A step fragment is a visual fragment only; the saved step remains intact. */
export interface ProgressionMeasureFragment {
  readonly kind: "step";
  readonly step: ProgressionStep;
  readonly stepId: string;
  readonly stepIndex: number;
  readonly fragmentIndex: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly offsetInStepBeats: Rational;
  readonly durationBeats: Rational;
  readonly startsHere: boolean;
  readonly continuesFromPrevious: boolean;
  readonly continuesToNext: boolean;
}

/** The only implicit item in a layout: the un-authored tail of the final bar. */
export interface ProgressionMeasureGap {
  readonly kind: "gap";
  readonly measureIndex: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly durationBeats: Rational;
}

export type ProgressionMeasureItem = ProgressionMeasureFragment | ProgressionMeasureGap;

export interface ProgressionMeasure {
  readonly measureIndex: number;
  readonly number: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly capacityBeats: Rational;
  readonly fragments: readonly ProgressionMeasureFragment[];
  readonly items: readonly ProgressionMeasureItem[];
  readonly trailingGap?: ProgressionMeasureGap;
}

export interface ProgressionMeasureLayout {
  readonly meter: Meter;
  readonly barLengthBeats: Rational;
  readonly authoredDurationBeats: Rational;
  readonly playbackDurationBeats: Rational;
  readonly trailingSilenceBeats: Rational;
  readonly measures: readonly ProgressionMeasure[];
}

interface MutableMeasure {
  measureIndex: number;
  number: number;
  startBeats: Rational;
  endBeats: Rational;
  capacityBeats: Rational;
  fragments: ProgressionMeasureFragment[];
  items: ProgressionMeasureItem[];
  trailingGap?: ProgressionMeasureGap;
}

function freezeFragment(fragment: ProgressionMeasureFragment): ProgressionMeasureFragment {
  return Object.freeze(fragment);
}

function freezeGap(gap: ProgressionMeasureGap): ProgressionMeasureGap {
  return Object.freeze(gap);
}

function freezeMeasure(measure: ProgressionMeasure): ProgressionMeasure {
  return Object.freeze({
    ...measure,
    fragments: Object.freeze([...measure.fragments]),
    items: Object.freeze([...measure.items]),
  });
}

function barCountForDuration(duration: Rational, barLength: Rational): number {
  if (compareRational(duration, ZERO) === 0) return 0;
  const numerator = duration.numerator * barLength.denominator;
  const denominator = duration.denominator * barLength.numerator;
  const whole = Math.floor(numerator / denominator);
  return numerator % denominator === 0 ? whole : whole + 1;
}

function barIndexForPosition(position: Rational, barLength: Rational): number {
  const numerator = position.numerator * barLength.denominator;
  const denominator = position.denominator * barLength.numerator;
  return Math.floor(numerator / denominator);
}

/** Returns the exact duration of one bar as canonical quarter-note beats. */
export function measureLengthBeats(meter: Meter): Rational {
  return rational(meter.numerator * 4, meter.denominator);
}

/** Returns one bar as a duration suitable for the duration editor. */
export function fullBarDurationBeats(meter: Meter): Rational {
  return measureLengthBeats(meter);
}

/**
 * Projects a flat progression into measure cards without changing saved semantics.
 * All positions and durations remain exact Rationals. Only an incomplete final bar
 * receives an implicit, interactive gap; internal silence must be a RestStep.
 */
export function createProgressionMeasureLayout(
  steps: readonly ProgressionStep[],
  meter: Meter,
): ProgressionMeasureLayout {
  const barLengthBeats = measureLengthBeats(meter);
  if (steps.length === 0) {
    return Object.freeze({
      meter,
      barLengthBeats,
      authoredDurationBeats: ZERO,
      playbackDurationBeats: ZERO,
      trailingSilenceBeats: ZERO,
      measures: Object.freeze([]),
    });
  }

  const mutableMeasures: MutableMeasure[] = [];

  const getMeasure = (measureIndex: number) => {
    const existing = mutableMeasures[measureIndex];
    if (existing) return existing;
    const startBeats = multiplyRational(barLengthBeats, rational(measureIndex));
    const created: MutableMeasure = {
      measureIndex,
      number: measureIndex + 1,
      startBeats,
      endBeats: addRational(startBeats, barLengthBeats),
      capacityBeats: barLengthBeats,
      fragments: [],
      items: [],
    };
    mutableMeasures[measureIndex] = created;
    return created;
  };

  let cursor = ZERO;
  steps.forEach((step, stepIndex) => {
    const stepStart = cursor;
    const stepEnd = addRational(stepStart, step.duration.beats);
    const fragments: ProgressionMeasureFragment[] = [];
    let fragmentCursor = stepStart;
    while (compareRational(fragmentCursor, stepEnd) < 0) {
      const measure = getMeasure(barIndexForPosition(fragmentCursor, barLengthBeats));
      const boundary = measure.endBeats;
      const fragmentEnd = compareRational(stepEnd, boundary) <= 0 ? stepEnd : boundary;
      const fragment = freezeFragment({
        kind: "step",
        step,
        stepId: step.id,
        stepIndex,
        fragmentIndex: fragments.length,
        startBeats: fragmentCursor,
        endBeats: fragmentEnd,
        offsetInStepBeats: subtractRational(fragmentCursor, stepStart),
        durationBeats: subtractRational(fragmentEnd, fragmentCursor),
        startsHere: compareRational(fragmentCursor, stepStart) === 0,
        continuesFromPrevious: compareRational(fragmentCursor, stepStart) > 0,
        continuesToNext: compareRational(fragmentEnd, stepEnd) < 0,
      });
      fragments.push(fragment);
      measure.fragments.push(fragment);
      measure.items.push(fragment);
      fragmentCursor = fragmentEnd;
    }
    cursor = stepEnd;
  });

  const authoredDurationBeats = cursor;
  const measureCount = barCountForDuration(authoredDurationBeats, barLengthBeats);
  const playbackDurationBeats = multiplyRational(barLengthBeats, rational(measureCount));
  const trailingSilenceBeats = subtractRational(playbackDurationBeats, authoredDurationBeats);

  let measures = mutableMeasures;
  if (compareRational(trailingSilenceBeats, ZERO) > 0) {
    const finalMeasureIndex = measureCount - 1;
    const finalMeasure = getMeasure(finalMeasureIndex);
    const gap = freezeGap({
      kind: "gap",
      measureIndex: finalMeasureIndex,
      startBeats: authoredDurationBeats,
      endBeats: playbackDurationBeats,
      durationBeats: trailingSilenceBeats,
    });
    finalMeasure.items.push(gap);
    finalMeasure.trailingGap = gap;
  }

  measures = measures.slice(0, measureCount);
  const frozenMeasures = measures.map((measure) =>
    freezeMeasure({
      ...measure,
      fragments: measure.fragments,
      items: measure.items,
      ...(measure.trailingGap ? { trailingGap: measure.trailingGap } : {}),
    }),
  );

  return Object.freeze({
    meter,
    barLengthBeats,
    authoredDurationBeats,
    playbackDurationBeats,
    trailingSilenceBeats,
    measures: Object.freeze(frozenMeasures),
  });
}
