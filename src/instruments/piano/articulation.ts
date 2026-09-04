import type { ExactPitch } from "../../domain/harmony/pitch";
import type { PianoArticulation } from "../../domain/progression/step";

import { createDeterministicRandomSource } from "./dynamics";

export interface NoteTimingIntent {
  readonly pitch: ExactPitch;
  readonly startOffsetSeconds: number;
  readonly durationSeconds: number;
  readonly role: "upper" | "bass";
}

export interface ArticulationOptions {
  readonly randomSource?: () => number;
}

/**
 * Transforms realized chord and bass pitches into note timing and duration intents
 * according to the requested piano articulation.
 *
 * Invariant:
 * For every generated event:
 * - startOffsetSeconds >= 0
 * - durationSeconds > 0
 * - startOffsetSeconds + durationSeconds <= totalDurationSeconds
 *
 * Articulations supported:
 * - Block: all upper voices sound synchronously at t = 0
 * - Arp Up: pitches ascend in pitch order with staggered onset
 * - Arp Down: pitches descend in pitch order with staggered onset
 * - Broken Chord: notes alternate across the duration
 * - Humanized: subtle, bounded timing micro-deviations with deterministic pseudo-random fallback
 */
export function resolveArticulationTiming(
  articulation: PianoArticulation,
  upperPitches: readonly ExactPitch[],
  totalDurationSeconds: number,
  bassPitch?: ExactPitch,
  options?: ArticulationOptions,
): readonly NoteTimingIntent[] {
  const intents: NoteTimingIntent[] = [];
  const baseDuration = totalDurationSeconds * 0.95;

  // 1. Bass voice (if present): foundation on beat 0
  if (bassPitch) {
    intents.push(
      Object.freeze({
        pitch: bassPitch,
        startOffsetSeconds: 0,
        durationSeconds: baseDuration,
        role: "bass",
      }),
    );
  }

  if (upperPitches.length === 0) {
    return Object.freeze(intents);
  }

  // 2. Upper voices articulation
  const n = upperPitches.length;

  switch (articulation) {
    case "block": {
      for (const p of upperPitches) {
        intents.push(
          Object.freeze({
            pitch: p,
            startOffsetSeconds: 0,
            durationSeconds: baseDuration,
            role: "upper",
          }),
        );
      }
      break;
    }

    case "arp-up": {
      const sorted = [...upperPitches].sort((a, b) => a.midiNumber - b.midiNumber);
      const maxSpread = totalDurationSeconds * 0.4;
      const stepDelay = n > 1 ? Math.min(0.045, maxSpread / (n - 1)) : 0;
      for (let i = 0; i < n; i++) {
        const start = i * stepDelay;
        const dur = (totalDurationSeconds - start) * 0.95;
        intents.push(
          Object.freeze({
            pitch: sorted[i]!,
            startOffsetSeconds: start,
            durationSeconds: dur,
            role: "upper",
          }),
        );
      }
      break;
    }

    case "arp-down": {
      const sorted = [...upperPitches].sort((a, b) => b.midiNumber - a.midiNumber);
      const maxSpread = totalDurationSeconds * 0.4;
      const stepDelay = n > 1 ? Math.min(0.045, maxSpread / (n - 1)) : 0;
      for (let i = 0; i < n; i++) {
        const start = i * stepDelay;
        const dur = (totalDurationSeconds - start) * 0.95;
        intents.push(
          Object.freeze({
            pitch: sorted[i]!,
            startOffsetSeconds: start,
            durationSeconds: dur,
            role: "upper",
          }),
        );
      }
      break;
    }

    case "broken-chord": {
      const sorted = [...upperPitches].sort((a, b) => a.midiNumber - b.midiNumber);
      const half = Math.ceil(n / 2);
      const halfDelay = Math.min(0.08, totalDurationSeconds * 0.25);

      for (let i = 0; i < n; i++) {
        const isUpperHalf = i >= half;
        const start = isUpperHalf ? halfDelay : 0;
        const dur = (totalDurationSeconds - start) * 0.95;
        intents.push(
          Object.freeze({
            pitch: sorted[i]!,
            startOffsetSeconds: start,
            durationSeconds: dur,
            role: "upper",
          }),
        );
      }
      break;
    }

    case "humanized": {
      const rng = options?.randomSource ?? createDeterministicRandomSource(101);
      const maxJitter = Math.min(0.015, totalDurationSeconds * 0.1);
      for (const p of upperPitches) {
        const jitter = (rng() - 0.5) * 2 * maxJitter;
        const start = Math.max(0, jitter);
        const maxDur = totalDurationSeconds - start;
        const durFactor = 0.88 + rng() * 0.08;
        const dur = maxDur * durFactor;
        intents.push(
          Object.freeze({
            pitch: p,
            startOffsetSeconds: start,
            durationSeconds: dur,
            role: "upper",
          }),
        );
      }
      break;
    }
  }

  return Object.freeze(intents);
}
