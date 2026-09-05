import { addRational, divideRational, rational, type Rational } from "./rational";
import type { Meter } from "./meter";
import type { ChordStep, ProgressionStep } from "../progression/step";

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
  steps: readonly ProgressionStep[],
  meter: Meter,
): ProgressionTimeline {
  const barLengthBeats = rational(meter.numerator * 4, meter.denominator);

  if (steps.length === 0) {
    return Object.freeze({
      steps: Object.freeze([]),
      totalDurationBeats: rational(0, 1),
      totalBars: rational(0, 1),
      meter,
    });
  }

  let currentBeats = rational(0, 1);
  const entries: TimelineStepEntry[] = [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    if (!step) {
      continue;
    }
    const startBeats = currentBeats;
    const durationBeats = step.duration.beats;
    const endBeats = addRational(startBeats, durationBeats);
    currentBeats = endBeats;

    const startBarRat = divideRational(startBeats, barLengthBeats);
    const startBar = Math.floor(startBarRat.numerator / startBarRat.denominator);
    const endBarRat = divideRational(endBeats, barLengthBeats);
    const endBar = Math.floor(endBarRat.numerator / endBarRat.denominator);

    entries.push(
      Object.freeze({
        step,
        stepIndex,
        startBeats,
        endBeats,
        durationBeats,
        startBar,
        endBar,
      }),
    );
  }

  const totalDurationBeats = currentBeats;
  const totalBars = divideRational(totalDurationBeats, barLengthBeats);

  return Object.freeze({
    steps: Object.freeze(entries),
    totalDurationBeats,
    totalBars,
    meter,
  });
}

export function lookupStepBoundary(timeline: ProgressionTimeline, boundaryIndex: number): Rational {
  if (
    !Number.isInteger(boundaryIndex) ||
    boundaryIndex < 0 ||
    boundaryIndex > timeline.steps.length
  ) {
    throw new RangeError(`boundaryIndex must be an integer between 0 and ${timeline.steps.length}`);
  }

  if (boundaryIndex === 0) {
    return rational(0, 1);
  }
  if (boundaryIndex === timeline.steps.length) {
    return timeline.totalDurationBeats;
  }
  const entry = timeline.steps[boundaryIndex];
  if (!entry) {
    throw new RangeError(`invalid boundaryIndex: ${boundaryIndex}`);
  }
  return entry.startBeats;
}

export function validateLoopRegion(
  region: LoopRegion,
  steps: readonly ProgressionStep[],
): ResolvedLoopRegion {
  if (!steps || steps.length === 0) {
    throw new RangeError("cannot validate loop region on an empty progression");
  }

  const startStepIndex = steps.findIndex((s) => s.id === region.startStepId);
  const endStepIndex = steps.findIndex((s) => s.id === region.endStepId);

  if (startStepIndex === -1) {
    throw new RangeError(`startStepId not found: "${region.startStepId}"`);
  }
  if (endStepIndex === -1) {
    throw new RangeError(`endStepId not found: "${region.endStepId}"`);
  }
  if (startStepIndex > endStepIndex) {
    throw new RangeError(
      `startStepId cannot appear after endStepId: start index ${startStepIndex} > end index ${endStepIndex}`,
    );
  }

  let startBeats = rational(0, 1);
  for (let i = 0; i < startStepIndex; i++) {
    const step = steps[i];
    if (step) {
      startBeats = addRational(startBeats, step.duration.beats);
    }
  }

  let durationBeats = rational(0, 1);
  for (let i = startStepIndex; i <= endStepIndex; i++) {
    const step = steps[i];
    if (step) {
      durationBeats = addRational(durationBeats, step.duration.beats);
    }
  }

  const endBeats = addRational(startBeats, durationBeats);

  return Object.freeze({
    startStepIndex,
    endStepIndex,
    startBeats,
    endBeats,
    durationBeats,
  });
}

export function resolveHarmonicPredecessor(
  timeline: ProgressionTimeline,
  stepIndex: number,
): ChordStep | undefined {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= timeline.steps.length) {
    return undefined;
  }

  for (let i = stepIndex - 1; i >= 0; i--) {
    const entry = timeline.steps[i];
    if (entry && entry.step.kind === "chord") {
      return entry.step;
    }
  }

  return undefined;
}
