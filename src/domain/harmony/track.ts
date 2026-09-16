import {
  validateMelodyInstrumentId,
  type MelodyInstrumentId,
} from "../melody/instrumentCatalog";

export type HarmonyInstrument = "piano" | MelodyInstrumentId;

export type AudioEngineType = "hq-samples" | "soundfont";

export interface HarmonyTrackSettings {
  readonly instrument: HarmonyInstrument;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly volume: number;
  readonly pianoEngine?: AudioEngineType;
  readonly guitarEngine?: AudioEngineType;
  readonly guitarSoundfontInstrument?: MelodyInstrumentId;
}

export const DEFAULT_HARMONY_TRACK_SETTINGS: HarmonyTrackSettings = Object.freeze({
  instrument: "piano",
  muted: false,
  solo: false,
  volume: 100,
});

export type HarmonyTrackValidationReason = "invalid-settings";

export class HarmonyTrackValidationError extends Error {
  readonly reason: HarmonyTrackValidationReason;

  constructor(message: string, reason: HarmonyTrackValidationReason) {
    super(message);
    this.name = "HarmonyTrackValidationError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

const ALLOWED_HARMONY_TRACK_KEYS = Object.freeze([
  "instrument",
  "muted",
  "solo",
  "volume",
  "pianoEngine",
  "guitarEngine",
  "guitarSoundfontInstrument",
]);

export function validateHarmonyTrackSettings(value: unknown): HarmonyTrackSettings {
  const instrument = isRecord(value) ? value.instrument : undefined;
  const muted = isRecord(value) ? value.muted : undefined;
  const solo = isRecord(value) ? value.solo : undefined;
  const volume = isRecord(value) ? value.volume : undefined;
  const pianoEngine = isRecord(value) ? value.pianoEngine : undefined;
  const guitarEngine = isRecord(value) ? value.guitarEngine : undefined;
  const guitarSoundfontInstrument = isRecord(value) ? value.guitarSoundfontInstrument : undefined;

  let validatedInstrument: HarmonyInstrument;
  if (instrument === "piano") {
    validatedInstrument = "piano";
  } else {
    try {
      validatedInstrument = validateMelodyInstrumentId(instrument);
    } catch {
      throw new HarmonyTrackValidationError(
        "Harmony Track settings require a supported instrument, boolean mute/solo flags, and integer volume 0..127",
        "invalid-settings",
      );
    }
  }

  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ALLOWED_HARMONY_TRACK_KEYS) ||
    typeof muted !== "boolean" ||
    typeof solo !== "boolean" ||
    (muted === true && solo === true) ||
    !Number.isInteger(volume) ||
    (volume as number) < 0 ||
    (volume as number) > 127
  ) {
    throw new HarmonyTrackValidationError(
      "Harmony Track settings require a supported instrument, boolean mute/solo flags, and integer volume 0..127",
      "invalid-settings",
    );
  }

  let validatedPianoEngine: AudioEngineType | undefined;
  if (pianoEngine !== undefined) {
    if (pianoEngine !== "hq-samples" && pianoEngine !== "soundfont") {
      throw new HarmonyTrackValidationError(
        "Harmony Track pianoEngine must be 'hq-samples' or 'soundfont'",
        "invalid-settings",
      );
    }
    validatedPianoEngine = pianoEngine;
  }

  let validatedGuitarEngine: AudioEngineType | undefined;
  if (guitarEngine !== undefined) {
    if (guitarEngine !== "hq-samples" && guitarEngine !== "soundfont") {
      throw new HarmonyTrackValidationError(
        "Harmony Track guitarEngine must be 'hq-samples' or 'soundfont'",
        "invalid-settings",
      );
    }
    validatedGuitarEngine = guitarEngine;
  }

  let validatedGuitarSoundfontInstrument: MelodyInstrumentId | undefined;
  if (guitarSoundfontInstrument !== undefined) {
    try {
      validatedGuitarSoundfontInstrument = validateMelodyInstrumentId(guitarSoundfontInstrument);
    } catch {
      throw new HarmonyTrackValidationError(
        "Harmony Track guitarSoundfontInstrument must be a valid GM instrument id",
        "invalid-settings",
      );
    }
  }

  return Object.freeze({
    instrument: validatedInstrument,
    muted: muted as boolean,
    solo: solo as boolean,
    volume: volume as number,
    ...(validatedPianoEngine ? { pianoEngine: validatedPianoEngine } : {}),
    ...(validatedGuitarEngine ? { guitarEngine: validatedGuitarEngine } : {}),
    ...(validatedGuitarSoundfontInstrument
      ? { guitarSoundfontInstrument: validatedGuitarSoundfontInstrument }
      : {}),
  });
}

export function snapshotHarmonyTrackSettings(settings: HarmonyTrackSettings): HarmonyTrackSettings {
  return validateHarmonyTrackSettings(settings);
}

export function createDefaultHarmonyTrackSettings(): HarmonyTrackSettings {
  return Object.freeze({ ...DEFAULT_HARMONY_TRACK_SETTINGS });
}
