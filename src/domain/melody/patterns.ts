import type { ExactPitch } from "../harmony/pitch";
import { rational, type Rational } from "../timing/rational";
import { MelodyValidationError, type MelodyGrid, type MelodyPattern } from "./types";

export const MELODY_GRID_DURATIONS: Readonly<Record<MelodyGrid, Rational>> = Object.freeze({
  quarter: rational(1),
  eighth: rational(1, 2),
  sixteenth: rational(1, 4),
  "eighth-triplet": rational(1, 3),
  "sixteenth-triplet": rational(1, 6),
});

export function melodyGridDuration(grid: MelodyGrid): Rational {
  const duration = MELODY_GRID_DURATIONS[grid];
  if (!duration) {
    throw new MelodyValidationError(`unsupported melody grid: ${String(grid)}`, "invalid-recipe");
  }
  return duration;
}

function ascendingIndexes(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function descendingIndexes(count: number): number[] {
  return ascendingIndexes(count).reverse();
}

function patternIndexes(count: number, pattern: MelodyPattern): readonly number[] {
  const ascending = ascendingIndexes(count);
  const descending = [...ascending].reverse();

  switch (pattern) {
    case "up":
      return ascending;
    case "down":
      return descending;
    case "up-down":
      return count < 2 ? ascending : [...ascending, ...ascending.slice(1, -1).reverse()];
    case "down-up":
      return count < 2 ? descending : [...descending, ...descending.slice(1, -1).reverse()];
    case "outside-in": {
      const indexes: number[] = [];
      for (let index = 0; index < Math.ceil(count / 2); index++) {
        indexes.push(index);
        const outside = count - 1 - index;
        if (outside !== index) indexes.push(outside);
      }
      return indexes;
    }
    case "inside-out": {
      const indexes: number[] = [];
      if (count % 2 === 1) {
        const middle = Math.floor(count / 2);
        indexes.push(middle);
        for (let distance = 1; distance <= middle; distance++) {
          indexes.push(middle - distance);
          const upper = middle + distance;
          if (upper < count) indexes.push(upper);
        }
      } else {
        const lowerMiddle = count / 2 - 1;
        const upperMiddle = count / 2;
        indexes.push(lowerMiddle, upperMiddle);
        for (
          let distance = 1;
          lowerMiddle - distance >= 0 || upperMiddle + distance < count;
          distance++
        ) {
          const lower = lowerMiddle - distance;
          if (lower >= 0) indexes.push(lower);
          const upper = upperMiddle + distance;
          if (upper < count) indexes.push(upper);
        }
      }
      return indexes;
    }
    default:
      throw new MelodyValidationError(
        `unsupported melody pattern: ${String(pattern)}`,
        "invalid-recipe",
      );
  }
}

/** Returns a stable MIDI-sorted pitch sequence for one pattern cycle. */
export function orderMelodyPitches(
  pitches: readonly ExactPitch[],
  pattern: MelodyPattern,
): readonly ExactPitch[] {
  const sorted = [...pitches].sort((left, right) => left.midiNumber - right.midiNumber);
  const indexes = patternIndexes(sorted.length, pattern);
  return Object.freeze(indexes.map((index) => sorted[index]!));
}
