export interface Meter {
  readonly numerator: number;
  readonly denominator: 1 | 2 | 4 | 8 | 16 | 32;
  readonly grouping: readonly number[];
}

export interface GlobalTiming {
  readonly tempoBpm: number;
  readonly meter: Meter;
}

export type MeterChangePolicy = "reflow" | "preserve-beat-lengths";

export function meter(
  numerator: number,
  denominator: Meter["denominator"],
  grouping?: readonly number[],
): Meter {
  if (!Number.isInteger(numerator) || numerator <= 0)
    throw new RangeError("meter numerator must be positive");
  const resolved = grouping ? [...grouping] : [numerator];
  if (resolved.some((value) => !Number.isInteger(value) || value <= 0))
    throw new RangeError("meter grouping values must be positive integers");
  if (resolved.reduce((sum, value) => sum + value, 0) !== numerator)
    throw new RangeError("meter grouping must sum to numerator");
  return Object.freeze({ numerator, denominator, grouping: Object.freeze(resolved) });
}

export function globalTiming(tempoBpm: number, value: Meter): GlobalTiming {
  if (!Number.isFinite(tempoBpm) || tempoBpm <= 0) throw new RangeError("tempo must be positive");
  return Object.freeze({ tempoBpm, meter: value });
}

export type BeatAccentType = "primary" | "secondary" | "subdivision";

export interface MeterAccent {
  readonly pulseIndex: number;
  readonly accent: BeatAccentType;
  readonly weight?: number;
}

export function pulseToBeats(_pulseIndex: number, _meter: Meter): import("./rational").Rational {
  throw new Error("Not implemented: T102 pulseToBeats");
}

export function computeMeterAccents(_meter: Meter): readonly MeterAccent[] {
  throw new Error("Not implemented: T102 computeMeterAccents");
}

export function applyMeterChange(
  _steps: readonly import("../progression/step").ProgressionStep[],
  _oldMeter: Meter,
  _newMeter: Meter,
  _policy: MeterChangePolicy,
): readonly import("../progression/step").ProgressionStep[] {
  throw new Error("Not implemented: T102 applyMeterChange");
}
