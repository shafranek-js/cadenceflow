export type HarmonyInstrument = "piano";

export interface HarmonyTrackSettings {
  readonly instrument: HarmonyInstrument;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly volume: number;
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

export function validateHarmonyTrackSettings(value: unknown): HarmonyTrackSettings {
  const instrument = isRecord(value) ? value.instrument : undefined;
  const muted = isRecord(value) ? value.muted : undefined;
  const solo = isRecord(value) ? value.solo : undefined;
  const volume = isRecord(value) ? value.volume : undefined;

  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["instrument", "muted", "solo", "volume"]) ||
    instrument !== "piano" ||
    typeof muted !== "boolean" ||
    typeof solo !== "boolean" ||
    (muted === true && solo === true) ||
    !Number.isInteger(volume) ||
    (volume as number) < 0 ||
    (volume as number) > 127
  ) {
    throw new HarmonyTrackValidationError(
      "Harmony Track settings require Piano, boolean mute/solo flags, and integer volume 0..127",
      "invalid-settings",
    );
  }

  return Object.freeze({
    instrument: "piano",
    muted: muted as boolean,
    solo: solo as boolean,
    volume: volume as number,
  });
}

export function snapshotHarmonyTrackSettings(settings: HarmonyTrackSettings): HarmonyTrackSettings {
  return validateHarmonyTrackSettings(settings);
}

export function createDefaultHarmonyTrackSettings(): HarmonyTrackSettings {
  return Object.freeze({ ...DEFAULT_HARMONY_TRACK_SETTINGS });
}
