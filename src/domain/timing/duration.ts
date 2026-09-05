import { compareRational, rational, type Rational } from "./rational";
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

export function durationBars(_bars: Rational | number, _meter: Meter): MusicalDuration {
  throw new Error("Not implemented: T101 durationBars");
}

export function durationDotted(_base: MusicalDuration): MusicalDuration {
  throw new Error("Not implemented: T101 durationDotted");
}

export function durationTriplet(_base: MusicalDuration): MusicalDuration {
  throw new Error("Not implemented: T101 durationTriplet");
}

export function barsToBeats(_bars: Rational, _meter: Meter): Rational {
  throw new Error("Not implemented: T101 barsToBeats");
}

export function beatsToBars(_beats: Rational, _meter: Meter): Rational {
  throw new Error("Not implemented: T101 beatsToBars");
}

export function formatMusicalDuration(_duration: MusicalDuration): string {
  throw new Error("Not implemented: T101 formatMusicalDuration");
}

export function parseMusicalDuration(_text: string): MusicalDuration {
  throw new Error("Not implemented: T101 parseMusicalDuration");
}
