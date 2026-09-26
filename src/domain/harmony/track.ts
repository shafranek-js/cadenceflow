import { validateMelodyInstrumentId, type MelodyInstrumentId } from "../melody/instrumentCatalog";

export type HarmonyInstrument = "piano" | MelodyInstrumentId;

export type AudioEngineType = "hq-samples" | "soundfont";

export interface HarmonyTrackSettings {
  readonly instrument: HarmonyInstrument;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly volume: number;
  readonly pianoEngine: AudioEngineType;
  readonly guitarEngine: AudioEngineType;
  readonly guitarSoundfontInstrument: MelodyInstrumentId;
  readonly pianoSoundfontInstrument: MelodyInstrumentId;
}

export const DEFAULT_HARMONY_TRACK_SETTINGS: HarmonyTrackSettings = Object.freeze({
  instrument: "piano",
  muted: false,
  solo: false,
  volume: 100,
  pianoEngine: "hq-samples",
  guitarEngine: "hq-samples",
  guitarSoundfontInstrument: "gm-025",
  pianoSoundfontInstrument: "gm-000",
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
  "pianoSoundfontInstrument",
]);

export function validateHarmonyTrackSettings(value: unknown): HarmonyTrackSettings {
  const instrument = isRecord(value) ? value.instrument : undefined;
  const muted = isRecord(value) ? value.muted : undefined;
  const solo = isRecord(value) ? value.solo : undefined;
  const volume = isRecord(value) ? value.volume : undefined;
  const pianoEngine = isRecord(value) ? value.pianoEngine : undefined;
  const guitarEngine = isRecord(value) ? value.guitarEngine : undefined;
  const guitarSoundfontInstrument = isRecord(value) ? value.guitarSoundfontInstrument : undefined;
  const pianoSoundfontInstrument = isRecord(value) ? value.pianoSoundfontInstrument : undefined;

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
    (volume as number) > 127 ||
    (pianoEngine !== "hq-samples" && pianoEngine !== "soundfont") ||
    (guitarEngine !== "hq-samples" && guitarEngine !== "soundfont")
  ) {
    throw new HarmonyTrackValidationError(
      "Harmony Track settings require a supported instrument, boolean mute/solo flags, and integer volume 0..127",
      "invalid-settings",
    );
  }

  let validatedGuitarSoundfontInstrument: MelodyInstrumentId;
  try {
    validatedGuitarSoundfontInstrument = validateMelodyInstrumentId(guitarSoundfontInstrument);
  } catch {
    throw new HarmonyTrackValidationError(
      "Harmony Track guitarSoundfontInstrument must be a valid GM instrument id",
      "invalid-settings",
    );
  }

  let validatedPianoSoundfontInstrument: MelodyInstrumentId;
  try {
    validatedPianoSoundfontInstrument = validateMelodyInstrumentId(pianoSoundfontInstrument);
  } catch {
    throw new HarmonyTrackValidationError(
      "Harmony Track pianoSoundfontInstrument must be a valid GM instrument id",
      "invalid-settings",
    );
  }

  return Object.freeze({
    instrument: validatedInstrument,
    muted: muted as boolean,
    solo: solo as boolean,
    volume: volume as number,
    pianoEngine: pianoEngine as AudioEngineType,
    guitarEngine: guitarEngine as AudioEngineType,
    guitarSoundfontInstrument: validatedGuitarSoundfontInstrument,
    pianoSoundfontInstrument: validatedPianoSoundfontInstrument,
  });
}

export function snapshotHarmonyTrackSettings(settings: HarmonyTrackSettings): HarmonyTrackSettings {
  return validateHarmonyTrackSettings(settings);
}

export function createDefaultHarmonyTrackSettings(): HarmonyTrackSettings {
  return Object.freeze({ ...DEFAULT_HARMONY_TRACK_SETTINGS });
}
