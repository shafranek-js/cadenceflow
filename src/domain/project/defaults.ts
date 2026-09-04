import type { BassSettings, StepPerformance } from "../progression/step";
import type { MusicalDuration } from "../timing/duration";

export interface StepCreationDefaults {
  readonly duration: MusicalDuration;
  readonly performance: StepPerformance;
}

export interface StepPerformanceOverrides extends Partial<Omit<StepPerformance, "bass">> {
  readonly bass?: Partial<BassSettings>;
}

export interface StepCreationOverrides {
  readonly duration?: MusicalDuration;
  readonly performance?: StepPerformanceOverrides;
}

export interface ProjectDefaults {
  readonly piano: StepCreationDefaults;
}

export function resolveStepPerformance(defaults: StepPerformance, overrides?: StepPerformanceOverrides): StepPerformance {
  if (!overrides) return defaults;
  const bass = overrides.bass ? Object.freeze({ ...defaults.bass, ...overrides.bass }) : defaults.bass;
  return Object.freeze({ ...defaults, ...overrides, bass });
}

export function resolveStepCreationDefaults(defaults: StepCreationDefaults, overrides?: StepCreationOverrides): StepCreationDefaults {
  if (!overrides) return defaults;
  return Object.freeze({
    duration: overrides.duration ?? defaults.duration,
    performance: resolveStepPerformance(defaults.performance, overrides.performance),
  });
}

export function countStepCreationOverrides(overrides: StepCreationOverrides): number {
  let count = overrides.duration ? 1 : 0;
  if (overrides.performance) count += Object.keys(overrides.performance).length;
  return count;
}
