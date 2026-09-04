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
