import { divideRational, multiplyRational, rational, type Rational } from "./rational";
import { musicalDuration } from "./duration";
import type { ProgressionStep } from "../progression/step";

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

const SUPPORTED_DENOMINATORS = new Set<number>([1, 2, 4, 8, 16, 32]);

export function meter(
  numerator: number,
  denominator: Meter["denominator"],
  grouping?: readonly number[],
): Meter {
  if (!Number.isInteger(numerator) || numerator <= 0) {
    throw new RangeError("meter numerator must be positive");
  }
  if (!Number.isInteger(denominator) || !SUPPORTED_DENOMINATORS.has(denominator)) {
    throw new RangeError("unsupported meter denominator");
  }
  if (grouping && grouping.length === 0) {
    throw new RangeError("meter grouping cannot be empty");
  }
  const resolved = grouping ? [...grouping] : [numerator];
  if (resolved.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new RangeError("meter grouping values must be positive integers");
  }
  if (resolved.reduce((sum, value) => sum + value, 0) !== numerator) {
    throw new RangeError("meter grouping must sum to numerator");
  }
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

export function pulseToBeats(pulseIndex: number, meter: Meter): Rational {
  if (!Number.isInteger(pulseIndex) || pulseIndex < 0 || pulseIndex > meter.numerator) {
    throw new RangeError("pulseIndex must be an integer within 0..numerator");
  }
  return rational(pulseIndex * 4, meter.denominator);
}

export function computeMeterAccents(meter: Meter): readonly MeterAccent[] {
  const groupStarts = new Set<number>();
  let currentPulse = 0;
  for (const groupSize of meter.grouping) {
    groupStarts.add(currentPulse);
    currentPulse += groupSize;
  }

  const accents: MeterAccent[] = [];
  for (let pulseIndex = 0; pulseIndex < meter.numerator; pulseIndex++) {
    if (pulseIndex === 0) {
      accents.push(Object.freeze({ pulseIndex, accent: "primary", weight: 1.0 }));
    } else if (groupStarts.has(pulseIndex)) {
      accents.push(Object.freeze({ pulseIndex, accent: "secondary", weight: 0.7 }));
    } else {
      accents.push(Object.freeze({ pulseIndex, accent: "subdivision", weight: 0.3 }));
    }
  }

  return Object.freeze(accents);
}

export function applyMeterChange(
  steps: readonly ProgressionStep[],
  oldMeter: Meter,
  newMeter: Meter,
  policy: MeterChangePolicy,
): readonly ProgressionStep[] {
  if (policy === "preserve-beat-lengths") {
    return Object.freeze(steps.map((step) => Object.freeze({ ...step })));
  }

  // policy === "reflow"
  // Calculate scale factor: (newMeter.barLengthBeats) / (oldMeter.barLengthBeats)
  const oldBarBeats = rational(oldMeter.numerator * 4, oldMeter.denominator);
  const newBarBeats = rational(newMeter.numerator * 4, newMeter.denominator);
  const scaleFactor = divideRational(newBarBeats, oldBarBeats);

  return Object.freeze(
    steps.map((step) => {
      const newBeats = multiplyRational(step.duration.beats, scaleFactor);
      const newDuration = musicalDuration(newBeats, step.duration.displayHint);
      return Object.freeze({
        ...step,
        duration: newDuration,
      });
    }),
  );
}
