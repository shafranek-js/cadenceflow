import { compareRational, rational, type Rational } from "./rational";

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
