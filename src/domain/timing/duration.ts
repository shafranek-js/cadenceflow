import {
  compareRational,
  divideRational,
  multiplyRational,
  rational,
  type Rational,
} from "./rational";
import type { Meter } from "./meter";

export type DurationDisplayHint =
  | { readonly kind: "beats"; readonly label?: string }
  | { readonly kind: "bars"; readonly bars: number }
  | { readonly kind: "dotted"; readonly baseBeats: Rational }
  | { readonly kind: "triplet"; readonly baseBeats: Rational };

export interface MusicalDuration {
  readonly beats: Rational;
  readonly displayHint?: DurationDisplayHint;
}

export function musicalDuration(
  beats: Rational,
  displayHint?: DurationDisplayHint,
): MusicalDuration {
  if (compareRational(beats, rational(0)) <= 0) throw new RangeError("duration must be positive");
  return displayHint ? Object.freeze({ beats, displayHint }) : Object.freeze({ beats });
}

export function barsToBeats(bars: Rational, meter: Meter): Rational {
  const barLengthBeats = rational(meter.numerator * 4, meter.denominator);
  return multiplyRational(bars, barLengthBeats);
}

export function beatsToBars(beats: Rational, meter: Meter): Rational {
  const barLengthBeats = rational(meter.numerator * 4, meter.denominator);
  return divideRational(beats, barLengthBeats);
}

export function durationBars(bars: Rational | number, meter: Meter): MusicalDuration {
  let barsRational: Rational;
  if (typeof bars === "number") {
    if (!Number.isFinite(bars) || !Number.isInteger(bars) || bars <= 0) {
      throw new RangeError("bars must be a positive integer when specified as a number");
    }
    barsRational = rational(bars, 1);
  } else {
    if (compareRational(bars, rational(0, 1)) <= 0) {
      throw new RangeError("bars must be positive");
    }
    barsRational = bars;
  }
  const beats = barsToBeats(barsRational, meter);
  return musicalDuration(beats);
}

export function durationDotted(base: MusicalDuration): MusicalDuration {
  const beats = multiplyRational(base.beats, rational(3, 2));
  return musicalDuration(beats);
}

export function durationTriplet(base: MusicalDuration): MusicalDuration {
  const beats = multiplyRational(base.beats, rational(2, 3));
  return musicalDuration(beats);
}

export function formatMusicalDuration(duration: MusicalDuration): string {
  const { numerator, denominator } = duration.beats;
  return denominator === 1 ? `${numerator}` : `${numerator}/${denominator}`;
}

export function parseMusicalDuration(text: string): MusicalDuration {
  if (typeof text !== "string") {
    throw new TypeError("duration text must be a string");
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new RangeError("duration text cannot be empty");
  }
  const match = /^([+-]?\d+)(?:\/([+-]?\d+))?$/.exec(trimmed);
  if (!match) {
    throw new RangeError(`malformed musical duration text: "${text}"`);
  }
  const numStr = match[1];
  if (!numStr) {
    throw new RangeError(`malformed musical duration text: "${text}"`);
  }
  const num = parseInt(numStr, 10);
  const den = match[2] !== undefined ? parseInt(match[2], 10) : 1;
  if (den === 0) {
    throw new RangeError("denominator cannot be zero");
  }
  if (num <= 0 || den < 0) {
    throw new RangeError("duration must be positive");
  }
  return musicalDuration(rational(num, den));
}
