export type GrooveFeel = "straight" | "swing";

export interface GrooveSettings {
  readonly feel: GrooveFeel;
  readonly swingAmount: number;
}

export function groove(feel: GrooveFeel = "straight", swingAmount = 0): GrooveSettings {
  if (!Number.isFinite(swingAmount) || swingAmount < 0 || swingAmount > 1) {
    throw new RangeError("swingAmount must be within 0..1");
  }
  return Object.freeze({ feel, swingAmount: feel === "straight" ? 0 : swingAmount });
}

export interface TimedEvent {
  readonly startBeats: import("./rational").Rational;
  readonly durationBeats: import("./rational").Rational;
}

export function projectSwingTiming<T extends TimedEvent>(
  _events: readonly T[],
  _groove: GrooveSettings,
  _subdivisionUnit?: import("./rational").Rational,
): readonly T[] {
  throw new Error("Not implemented: T103 projectSwingTiming");
}
