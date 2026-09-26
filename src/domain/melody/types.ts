import type { ExactPitch } from "../harmony/pitch";
import type { Rational } from "../timing/rational";
import {
  MELODY_INSTRUMENT_CATALOG,
  validateMelodyInstrumentId,
  type MelodyInstrumentId,
} from "./instrumentCatalog";

export type MelodyPattern = "up" | "down" | "up-down" | "down-up" | "outside-in" | "inside-out";

export type MelodyPitchMotion =
  MelodyPattern | "repeat-root" | "repeat-top" | "alternate-root-up" | "alternate-top-down";

export type MelodyRhythm = "even" | "dotted" | "reverse-dotted" | "tresillo";

export type MelodyConnection = "retrigger" | "tie-repeated";

export type MelodyGrid =
  "quarter" | "eighth" | "sixteenth" | "eighth-triplet" | "sixteenth-triplet";

export type MelodyOctaveOffset = -2 | -1 | 0 | 1 | 2;

export type MelodyInstrument = MelodyInstrumentId;

/** Backward-compatible export; the canonical source is the immutable catalog. */
export { MELODY_INSTRUMENT_CATALOG };
export const MELODY_INSTRUMENTS: readonly MelodyInstrument[] = Object.freeze(
  MELODY_INSTRUMENT_CATALOG.map((entry) => entry.id),
);

export interface ChordMelodyRecipe {
  readonly pitchMotion: MelodyPitchMotion;
  readonly rhythm: MelodyRhythm;
  readonly connection: MelodyConnection;
  readonly grid: MelodyGrid;
  readonly octaveOffset: MelodyOctaveOffset;
  /** Optional target pitch class applied to the final generated note when it fits the next chord. */
  readonly targetNextPitchClass?: number;
}

/** Pre-T186 wire shape retained only as a load/command compatibility input. */
export interface LegacyChordMelodyRecipe {
  readonly pattern: MelodyPattern;
  readonly grid: MelodyGrid;
  readonly octaveOffset: MelodyOctaveOffset;
}

export type MelodyRecipeInput = ChordMelodyRecipe | LegacyChordMelodyRecipe;

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

const LEGACY_MELODY_PATTERNS: readonly MelodyPattern[] = Object.freeze([
  "up",
  "down",
  "up-down",
  "down-up",
  "outside-in",
  "inside-out",
]);

export const MELODY_PITCH_MOTIONS: readonly MelodyPitchMotion[] = Object.freeze([
  ...LEGACY_MELODY_PATTERNS,
  "repeat-root",
  "repeat-top",
  "alternate-root-up",
  "alternate-top-down",
]);

export const MELODY_RHYTHMS: readonly MelodyRhythm[] = Object.freeze([
  "even",
  "dotted",
  "reverse-dotted",
  "tresillo",
]);

export const MELODY_CONNECTIONS: readonly MelodyConnection[] = Object.freeze([
  "retrigger",
  "tie-repeated",
]);

export const MELODY_GRIDS: readonly MelodyGrid[] = Object.freeze([
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

export function snapshotChordMelodyRecipe(recipe: MelodyRecipeInput): ChordMelodyRecipe {
  return validateChordMelodyRecipe(recipe);
}

export function validateChordMelodyRecipe(value: unknown): ChordMelodyRecipe {
  const pitchMotion = isRecord(value) ? value.pitchMotion : undefined;
  const rhythm = isRecord(value) ? value.rhythm : undefined;
  const connection = isRecord(value) ? value.connection : undefined;
  const pattern = isRecord(value) ? value.pattern : undefined;
  const grid = isRecord(value) ? value.grid : undefined;
  const octaveOffset = isRecord(value) ? value.octaveOffset : undefined;
  const targetNextPitchClass = isRecord(value) ? value.targetNextPitchClass : undefined;

  const canonical =
    isRecord(value) &&
    hasOnlyKeys(value, [
      "pitchMotion",
      "rhythm",
      "connection",
      "grid",
      "octaveOffset",
      "targetNextPitchClass",
    ]);
  const legacy = isRecord(value) && hasOnlyKeys(value, ["pattern", "grid", "octaveOffset"]);
  const validCommon =
    MELODY_GRIDS.includes(grid as MelodyGrid) &&
    Number.isInteger(octaveOffset) &&
    (octaveOffset as number) >= -2 &&
    (octaveOffset as number) <= 2 &&
    (targetNextPitchClass === undefined ||
      (Number.isInteger(targetNextPitchClass) &&
        (targetNextPitchClass as number) >= 0 &&
        (targetNextPitchClass as number) <= 11));

  if (
    !isRecord(value) ||
    !validCommon ||
    (canonical &&
      (!MELODY_PITCH_MOTIONS.includes(pitchMotion as MelodyPitchMotion) ||
        !MELODY_RHYTHMS.includes(rhythm as MelodyRhythm) ||
        !MELODY_CONNECTIONS.includes(connection as MelodyConnection))) ||
    (legacy && !LEGACY_MELODY_PATTERNS.includes(pattern as MelodyPattern)) ||
    (!canonical && !legacy)
  ) {
    throw new MelodyValidationError(
      "Melody recipe must contain a supported pitch motion, rhythm, connection, grid, and octave offset from -2 through +2",
      "invalid-recipe",
    );
  }

  return Object.freeze({
    pitchMotion: (canonical ? pitchMotion : pattern) as MelodyPitchMotion,
    rhythm: (canonical ? rhythm : "even") as MelodyRhythm,
    connection: (canonical ? connection : "retrigger") as MelodyConnection,
    grid: grid as MelodyGrid,
    octaveOffset: octaveOffset as MelodyOctaveOffset,
    ...(targetNextPitchClass !== undefined
      ? { targetNextPitchClass: targetNextPitchClass as number }
      : {}),
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
    (() => {
      try {
        validateMelodyInstrumentId(instrument);
        return false;
      } catch {
        return true;
      }
    })() ||
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
