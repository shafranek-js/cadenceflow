import type { Rational } from "./rational";
import type { Meter } from "./meter";
import type { ProgressionStep } from "../progression/step";

export interface TimelineStepEntry {
  readonly step: ProgressionStep;
  readonly stepIndex: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly durationBeats: Rational;
  readonly startBar: number;
  readonly endBar: number;
}

export interface ProgressionTimeline {
  readonly steps: readonly TimelineStepEntry[];
  readonly totalDurationBeats: Rational;
  readonly totalBars: Rational;
  readonly meter: Meter;
}

export interface LoopRegion {
  readonly startStepId: string;
  readonly endStepId: string;
}

export interface ResolvedLoopRegion {
  readonly startStepIndex: number;
  readonly endStepIndex: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly durationBeats: Rational;
}

export function createProgressionTimeline(
  _steps: readonly ProgressionStep[],
  _meter: Meter,
): ProgressionTimeline {
  throw new Error("Not implemented: T104 createProgressionTimeline");
}

export function lookupStepBoundary(
  _timeline: ProgressionTimeline,
  _boundaryIndex: number,
): Rational {
  throw new Error("Not implemented: T104 lookupStepBoundary");
}

export function validateLoopRegion(
  _region: LoopRegion,
  _steps: readonly ProgressionStep[],
): ResolvedLoopRegion {
  throw new Error("Not implemented: T104 validateLoopRegion");
}

export function resolveHarmonicPredecessor(
  _timeline: ProgressionTimeline,
  _stepIndex: number,
): import("../progression/step").ChordStep | undefined {
  throw new Error("Not implemented: T104 resolveHarmonicPredecessor");
}
