import type { ExactPitch } from "../harmony/pitch";
import type { Rational } from "../timing/rational";

export type MelodyPattern = "up" | "down" | "up-down" | "down-up" | "outside-in" | "inside-out";

export type MelodyGrid =
  "quarter" | "eighth" | "sixteenth" | "eighth-triplet" | "sixteenth-triplet";

export type MelodyOctaveOffset = -2 | -1 | 0 | 1 | 2;

export type MelodyInstrument = "flute" | "violin" | "clarinet" | "oboe" | "cello" | "synth-lead";

export const MELODY_INSTRUMENTS: readonly MelodyInstrument[] = Object.freeze([
  "flute",
  "violin",
  "clarinet",
  "oboe",
  "cello",
  "synth-lead",
]);

export interface ChordMelodyRecipe {
  readonly pattern: MelodyPattern;
  readonly grid: MelodyGrid;
  readonly octaveOffset: MelodyOctaveOffset;
}

export interface MelodyTrackSettings {
  readonly instrument: MelodyInstrument;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly volume: number;
}

export const DEFAULT_MELODY_TRACK_SETTINGS: MelodyTrackSettings = Object.freeze({
  instrument: "flute",
  muted: false,
  solo: false,
  volume: 100,
});

export interface MelodyEvent {
  readonly sourceStepId: string;
  readonly index: number;
  readonly pitch: ExactPitch;
  /** MIDI identity of the contextual upper pitch before octave offset. */
  readonly sourcePitchMidi: number;
  readonly startOffsetBeats: Rational;
  readonly durationBeats: Rational;
}

export interface MelodyPhrase {
  readonly events: readonly MelodyEvent[];
}

export type MelodyValidationReason =
  | "empty-pitches"
  | "invalid-duration"
  | "invalid-pitch"
  | "octave-overflow"
  | "invalid-recipe"
  | "invalid-settings";

export class MelodyValidationError extends Error {
  readonly reason: MelodyValidationReason;

  constructor(message: string, reason: MelodyValidationReason) {
    super(message);
    this.name = "MelodyValidationError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const MELODY_PATTERNS: readonly MelodyPattern[] = Object.freeze([
  "up",
  "down",
  "up-down",
  "down-up",
  "outside-in",
  "inside-out",
]);

const MELODY_GRIDS: readonly MelodyGrid[] = Object.freeze([
  "quarter",
  "eighth",
  "sixteenth",
  "eighth-triplet",
  "sixteenth-triplet",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function snapshotChordMelodyRecipe(recipe: ChordMelodyRecipe): ChordMelodyRecipe {
  return validateChordMelodyRecipe(recipe);
}

export function validateChordMelodyRecipe(value: unknown): ChordMelodyRecipe {
  const pattern = isRecord(value) ? value.pattern : undefined;
  const grid = isRecord(value) ? value.grid : undefined;
  const octaveOffset = isRecord(value) ? value.octaveOffset : undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["pattern", "grid", "octaveOffset"]) ||
    !MELODY_PATTERNS.includes(pattern as MelodyPattern) ||
    !MELODY_GRIDS.includes(grid as MelodyGrid) ||
    !Number.isInteger(octaveOffset) ||
    (octaveOffset as number) < -2 ||
    (octaveOffset as number) > 2
  ) {
    throw new MelodyValidationError(
      "Melody recipe must contain a supported pattern, grid, and octave offset from -2 through +2",
      "invalid-recipe",
    );
  }

  return Object.freeze({
    pattern: pattern as MelodyPattern,
    grid: grid as MelodyGrid,
    octaveOffset: octaveOffset as MelodyOctaveOffset,
  });
}

export function snapshotMelodyTrackSettings(settings: MelodyTrackSettings): MelodyTrackSettings {
  return validateMelodyTrackSettings(settings);
}

export function validateMelodyTrackSettings(value: unknown): MelodyTrackSettings {
  const instrument = isRecord(value) ? value.instrument : undefined;
  const muted = isRecord(value) ? value.muted : undefined;
  const solo = isRecord(value) ? value.solo : undefined;
  const volume = isRecord(value) ? value.volume : undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["instrument", "muted", "solo", "volume"]) ||
    !MELODY_INSTRUMENTS.includes(instrument as MelodyInstrument) ||
    typeof muted !== "boolean" ||
    typeof solo !== "boolean" ||
    (muted === true && solo === true) ||
    !Number.isInteger(volume) ||
    (volume as number) < 0 ||
    (volume as number) > 127
  ) {
    throw new MelodyValidationError(
      "Melody Track settings require a supported instrument, boolean mute/solo flags, and integer volume 0..127",
      "invalid-settings",
    );
  }

  return Object.freeze({
    instrument: instrument as MelodyInstrument,
    muted: muted as boolean,
    solo: solo as boolean,
    volume: volume as number,
  });
}

export function createDefaultMelodyTrackSettings(): MelodyTrackSettings {
  return Object.freeze({ ...DEFAULT_MELODY_TRACK_SETTINGS });
}
