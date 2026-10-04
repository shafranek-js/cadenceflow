import type { ExactPitch } from "../harmony/pitch";
import { exactPitch } from "../harmony/pitch";
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

export interface AuthoredMelodyNote {
  readonly id: string;
  readonly pitch: ExactPitch;
  /** Optional pre-recipe source pitch retained when generated notes are materialized. */
  readonly sourcePitchMidi?: number;
  readonly onset: Rational;
  readonly duration: Rational;
}
export interface AuthoredMelodyPhrase {
  readonly notes: readonly AuthoredMelodyNote[];
  /** Generator settings retained for explicit regeneration; never affect authored timing. */
  readonly sourceRecipe?: ChordMelodyRecipe;
}
export type ChordMelody =
  | { readonly mode: "generated"; readonly recipe: ChordMelodyRecipe }
  | {
      readonly mode: "authored";
      readonly phrase: AuthoredMelodyPhrase;
      readonly sourceRecipe?: ChordMelodyRecipe;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPitchSpelling(
  value: unknown,
): value is { readonly step: ExactPitch["spelling"]["step"]; readonly alter: number } {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => ["step", "alter"].includes(key)) &&
    ["C", "D", "E", "F", "G", "A", "B"].includes(String(value.step)) &&
    Number.isInteger(value.alter)
  );
}
export function snapshotAuthoredMelodyPhrase(value: unknown): AuthoredMelodyPhrase {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["notes", "sourceRecipe"].includes(key)) ||
    !Array.isArray(value.notes)
  )
    throw new MelodyValidationError("Authored phrase requires notes", "invalid-recipe");
  const ids = new Set<string>();
  const notes = value.notes.map((raw) => {
    if (
      !isRecord(raw) ||
      Object.keys(raw).some(
        (key) => !["id", "pitch", "sourcePitchMidi", "onset", "duration"].includes(key),
      ) ||
      typeof raw.id !== "string" ||
      raw.id.trim() === "" ||
      ids.has(raw.id) ||
      (raw.sourcePitchMidi !== undefined &&
        (!Number.isInteger(raw.sourcePitchMidi) ||
          (raw.sourcePitchMidi as number) < 0 ||
          (raw.sourcePitchMidi as number) > 127)) ||
      !isRecord(raw.pitch) ||
      Object.keys(raw.pitch).some(
        (key) =>
          ![
            "midiNumber",
            "pitchClassIdentity",
            "octave",
            "spelling",
            "transpositionCompensationSemitones",
            "transpositionSpellingOverride",
          ].includes(key),
      ) ||
      !Number.isInteger(raw.pitch.midiNumber) ||
      (raw.pitch.midiNumber as number) < 0 ||
      (raw.pitch.midiNumber as number) > 127 ||
      !Number.isInteger(raw.pitch.pitchClassIdentity) ||
      !Number.isInteger(raw.pitch.octave) ||
      (raw.pitch.transpositionCompensationSemitones !== undefined &&
        (!Number.isInteger(raw.pitch.transpositionCompensationSemitones) ||
          (raw.pitch.transpositionCompensationSemitones as number) < -127 ||
          (raw.pitch.transpositionCompensationSemitones as number) > 127)) ||
      !isPitchSpelling(raw.pitch.spelling) ||
      (raw.pitch.transpositionSpellingOverride !== undefined &&
        !isPitchSpelling(raw.pitch.transpositionSpellingOverride)) ||
      !isRecord(raw.onset) ||
      Object.keys(raw.onset).some((key) => !["numerator", "denominator"].includes(key)) ||
      !Number.isInteger(raw.onset.numerator) ||
      (raw.onset.numerator as number) < 0 ||
      !Number.isInteger(raw.onset.denominator) ||
      (raw.onset.denominator as number) <= 0 ||
      !isRecord(raw.duration) ||
      Object.keys(raw.duration).some((key) => !["numerator", "denominator"].includes(key)) ||
      !Number.isInteger(raw.duration.numerator) ||
      (raw.duration.numerator as number) <= 0 ||
      !Number.isInteger(raw.duration.denominator) ||
      (raw.duration.denominator as number) <= 0
    )
      throw new MelodyValidationError("Invalid authored Melody note", "invalid-recipe");
    ids.add(raw.id);
    const anchorPitch = exactPitch(raw.pitch.midiNumber as number, {
      step: raw.pitch.spelling.step as ExactPitch["spelling"]["step"],
      alter: raw.pitch.spelling.alter as number,
    });
    if (
      raw.pitch.pitchClassIdentity !== anchorPitch.pitchClassIdentity ||
      raw.pitch.octave !== anchorPitch.octave
    )
      throw new MelodyValidationError(
        "Authored pitch identity does not match MIDI pitch",
        "invalid-pitch",
      );
    const pitch: ExactPitch = Object.freeze({
      ...anchorPitch,
      ...(raw.pitch.transpositionCompensationSemitones === undefined
        ? {}
        : {
            transpositionCompensationSemitones: raw.pitch
              .transpositionCompensationSemitones as number,
          }),
      ...(raw.pitch.transpositionSpellingOverride === undefined
        ? {}
        : {
            transpositionSpellingOverride: Object.freeze({
              step: (raw.pitch.transpositionSpellingOverride as ExactPitch["spelling"]).step,
              alter: (raw.pitch.transpositionSpellingOverride as ExactPitch["spelling"]).alter,
            }),
          }),
    });
    return Object.freeze({
      id: raw.id,
      pitch,
      ...(raw.sourcePitchMidi !== undefined
        ? { sourcePitchMidi: raw.sourcePitchMidi as number }
        : {}),
      onset: Object.freeze({
        numerator: raw.onset.numerator as number,
        denominator: raw.onset.denominator as number,
      }),
      duration: Object.freeze({
        numerator: raw.duration.numerator as number,
        denominator: raw.duration.denominator as number,
      }),
    });
  });
  return Object.freeze({
    notes: Object.freeze(notes),
    ...(value.sourceRecipe !== undefined
      ? { sourceRecipe: validateChordMelodyRecipe(value.sourceRecipe) }
      : {}),
  });
}
export function snapshotChordMelody(value: unknown): ChordMelody {
  if (!isRecord(value)) throw new MelodyValidationError("Invalid ChordMelody", "invalid-recipe");
  // In-memory callers may still construct a pre-v7 Step; persisted input is migrated first.
  if (value.mode === undefined)
    return Object.freeze({ mode: "generated", recipe: validateChordMelodyRecipe(value) });
  if (
    value.mode === "generated" &&
    Object.keys(value).every((key) => ["mode", "recipe"].includes(key))
  )
    return Object.freeze({ mode: "generated", recipe: validateChordMelodyRecipe(value.recipe) });
  if (
    value.mode === "authored" &&
    Object.keys(value).every((key) => ["mode", "phrase", "sourceRecipe"].includes(key))
  )
    return Object.freeze({
      mode: "authored",
      phrase: snapshotAuthoredMelodyPhrase(value.phrase),
      ...(value.sourceRecipe !== undefined
        ? { sourceRecipe: validateChordMelodyRecipe(value.sourceRecipe) }
        : {}),
    });
  throw new MelodyValidationError(
    "ChordMelody mode must be generated or authored",
    "invalid-recipe",
  );
}
export function generatedMelodyRecipe(
  value: ChordMelody | undefined,
): ChordMelodyRecipe | undefined {
  return value?.mode === "generated" ? value.recipe : undefined;
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
  readonly eventKey: string;
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

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

export function snapshotChordMelodyRecipe(
  recipe: MelodyRecipeInput | ChordMelody,
): ChordMelodyRecipe {
  if ("mode" in recipe) {
    if (recipe.mode !== "generated")
      throw new MelodyValidationError("Authored Melody has no generated recipe", "invalid-recipe");
    return validateChordMelodyRecipe(recipe.recipe);
  }
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
