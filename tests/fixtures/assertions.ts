import type { ChordStep, ProgressionStep } from "../../src/domain/progression/step";

/** Fail at the fixture boundary instead of concealing absent or wrong-kind test data. */
export function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected fixture value to exist");
  return value;
}

export function requireChord(step: ProgressionStep | undefined): ChordStep {
  if (!step || step.kind !== "chord") throw new Error("Expected a chord fixture step");
  return step;
}

export function omitFields<T extends object, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  const result = { ...value };
  for (const key of keys) delete result[key];
  return result;
}

export function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected fixture object");
  return value as Record<string, unknown>;
}

export function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected fixture array");
  return value;
}
