import type { ExactPitch } from "../harmony/pitch";
import type { Rational } from "../timing/rational";

export type MelodyPattern = "up" | "down" | "up-down" | "down-up" | "outside-in" | "inside-out";

export type MelodyGrid =
  "quarter" | "eighth" | "sixteenth" | "eighth-triplet" | "sixteenth-triplet";

export type MelodyOctaveOffset = -2 | -1 | 0 | 1 | 2;

export interface ChordMelodyRecipe {
  readonly pattern: MelodyPattern;
  readonly grid: MelodyGrid;
  readonly octaveOffset: MelodyOctaveOffset;
}

export interface MelodyEvent {
  readonly sourceStepId: string;
  readonly index: number;
  readonly pitch: ExactPitch;
  readonly startOffsetBeats: Rational;
  readonly durationBeats: Rational;
}

export interface MelodyPhrase {
  readonly events: readonly MelodyEvent[];
}

export type MelodyValidationReason =
  "empty-pitches" | "invalid-duration" | "invalid-pitch" | "octave-overflow" | "invalid-recipe";

export class MelodyValidationError extends Error {
  readonly reason: MelodyValidationReason;

  constructor(message: string, reason: MelodyValidationReason) {
    super(message);
    this.name = "MelodyValidationError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
