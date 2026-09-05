import {
  addRational,
  divideRational,
  equalRational,
  multiplyRational,
  rational,
  subtractRational,
  type Rational,
} from "./rational";

export type GrooveFeel = "straight" | "swing";

export interface GrooveSettings {
  readonly feel: GrooveFeel;
  readonly swingAmount: number;
}

export function groove(feel: GrooveFeel = "straight", swingAmount = 0): GrooveSettings {
  if (!Number.isFinite(swingAmount) || swingAmount < 0 || swingAmount > 1) {
    throw new RangeError("swingAmount must be within 0..1");
  }
  return Object.freeze({ feel, swingAmount });
}

export interface TimedEvent {
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
}

/**
 * Projects playback timing for a list of timed events according to groove settings.
 * Pure projection: original event objects are not mutated.
 *
 * Swing mapping:
 * - Default subdivision unit U is 1/2 beat (eighth notes).
 * - Only events with duration === U on the 2m * U / (2m + 1) * U grid are eligible.
 * - Eligible on-beat event at 2m * U is paired with off-beat event at (2m + 1) * U.
 * - Swing displacement Delta = (swingAmount / 3) * U in exact Rational.
 * - On-beat: duration = U + Delta.
 * - Off-beat: start = originalStart + Delta, duration = U - Delta.
 * - Pair sum is strictly invariant: (U + Delta) + (U - Delta) = 2U.
 * - At amount = 1.0, second subdivision duration is strictly positive (2/3 * U > 0).
 */
export function projectSwingTiming<T extends TimedEvent>(
  events: readonly T[],
  grooveSettings: GrooveSettings,
  subdivisionUnit?: Rational,
): readonly T[] {
  if (grooveSettings.feel === "straight" || grooveSettings.swingAmount === 0) {
    return Object.freeze(events.map((e) => Object.freeze({ ...e })));
  }

  const U = subdivisionUnit ?? rational(1, 2);

  // Identify which grid indices have events with duration equal to U
  const slotsWithEligibleEvents = new Set<number>();
  for (const event of events) {
    if (equalRational(event.durationBeats, U)) {
      const k = divideRational(event.startBeats, U);
      if (k.denominator === 1) {
        slotsWithEligibleEvents.add(k.numerator);
      }
    }
  }

  // Convert swing amount to exact rational displacement:
  // Delta = U * (swingAmount / 3)
  const amountRational = rational(Math.round(grooveSettings.swingAmount * 10000), 10000);
  const maxSwingFactor = rational(1, 3);
  const delta = multiplyRational(U, multiplyRational(amountRational, maxSwingFactor));

  return Object.freeze(
    events.map((event) => {
      if (!equalRational(event.durationBeats, U)) {
        return Object.freeze({ ...event });
      }

      const k = divideRational(event.startBeats, U);
      if (k.denominator !== 1) {
        return Object.freeze({ ...event });
      }

      const gridIndex = k.numerator;
      const isEven = gridIndex % 2 === 0;

      if (isEven) {
        // On-beat event: check if paired off-beat event exists at gridIndex + 1
        if (slotsWithEligibleEvents.has(gridIndex + 1)) {
          return Object.freeze({
            ...event,
            durationBeats: addRational(U, delta),
          });
        }
      } else {
        // Off-beat event: check if paired on-beat event exists at gridIndex - 1
        if (slotsWithEligibleEvents.has(gridIndex - 1)) {
          return Object.freeze({
            ...event,
            startBeats: addRational(event.startBeats, delta),
            durationBeats: subtractRational(U, delta),
          });
        }
      }

      return Object.freeze({ ...event });
    }),
  );
}
