import { divideRational, multiplyRational, rational, type Rational } from "./rational";
import { musicalDuration } from "./duration";
import type { ProgressionStep } from "../progression/step";
import { snapshotAuthoredMelodyPhrase, type AuthoredMelodyPhrase } from "../melody/types";

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

/**
 * Whether a position inside a Measure falls on a pulse of its meter.
 *
 * A pulse is one unit of the meter's denominator — a quarter in 5/4, an eighth in 6/8 — so 6/8 has six
 * of them. The piano-roll draws a stronger line on every pulse: classifying instead by whole quarter
 * beats showed only three in 6/8, because it counted the bar's length in quarters rather than the
 * meter's own pulses.
 */
export function isMeterPulse(offsetBeats: Rational, meter: Meter): boolean {
  if (offsetBeats.numerator === 0) return true;
  // offset = k * 4 / denominator  <=>  offset.numerator * denominator is a multiple of 4 * offset.denominator
  return (offsetBeats.numerator * meter.denominator) % (4 * offsetBeats.denominator) === 0;
}

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

/**
 * Reflows a progression to a new meter using proportional bar scaling:
 *   newDuration = oldDuration * newBarLength / oldBarLength
 *
 * Invariants:
 * - Exact 1-to-1 mapping: step count, IDs, kinds, and order remain identical.
 * - No splitting, clipping, duplication, or padding RestSteps.
 * - Incomplete final bars are valid and preserved without padding.
 * - All harmonic and performance state (chord, voicing, bass, velocities) is preserved.
 * - Only duration.beats is scaled using exact Rational arithmetic.
 */
export function reflowProgression(
  steps: readonly ProgressionStep[],
  oldMeter: Meter,
  newMeter: Meter,
): readonly ProgressionStep[] {
  return applyMeterChange(steps, oldMeter, newMeter, "reflow");
}

/**
 * Scales an authored melody phrase by the same factor applied to its Step duration.
 *
 * A phrase's `onset` and `duration` are expressed in beats *local to their Step*, so the
 * proportional scaling applied to the Step duration is exactly the right transform for them too.
 *
 * Regression context: `applyMeterChange` scaled only `step.duration` and left the notes alone.
 * After 4/4 -> 3/4 a Step lasted three beats while its melody still occupied four, so notes
 * spilled past the end of their own chord and sounded over the next one — and the notation drew
 * them outside the bar. `preserve-beat-lengths` is unaffected because it does not scale at all.
 */
function scaleAuthoredPhrase(
  phrase: AuthoredMelodyPhrase,
  scaleFactor: Rational,
): AuthoredMelodyPhrase {
  return snapshotAuthoredMelodyPhrase({
    notes: phrase.notes.map((note) => ({
      ...note,
      onset: multiplyRational(note.onset, scaleFactor),
      duration: multiplyRational(note.duration, scaleFactor),
    })),
    ...(phrase.sourceRecipe !== undefined ? { sourceRecipe: phrase.sourceRecipe } : {}),
  });
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
  // Proportional bar scaling: newDuration = oldDuration * newBarLength / oldBarLength
  const oldBarBeats = rational(oldMeter.numerator * 4, oldMeter.denominator);
  const newBarBeats = rational(newMeter.numerator * 4, newMeter.denominator);
  const scaleFactor = divideRational(newBarBeats, oldBarBeats);

  return Object.freeze(
    steps.map((step) => {
      const newBeats = multiplyRational(step.duration.beats, scaleFactor);
      const newDuration = musicalDuration(newBeats, step.duration.displayHint);

      // Melody travels with its Step so notes cannot outlive the chord that owns them.
      // Chord steps carry `melody`; rest steps carry `authoredMelody` directly.
      if (step.kind === "chord" && step.melody?.mode === "authored") {
        return Object.freeze({
          ...step,
          duration: newDuration,
          melody: Object.freeze({
            ...step.melody,
            phrase: scaleAuthoredPhrase(step.melody.phrase, scaleFactor),
          }),
        });
      }
      if (step.kind === "rest" && step.authoredMelody !== undefined) {
        return Object.freeze({
          ...step,
          duration: newDuration,
          authoredMelody: scaleAuthoredPhrase(step.authoredMelody, scaleFactor),
        });
      }
      return Object.freeze({
        ...step,
        duration: newDuration,
      });
    }),
  );
}
