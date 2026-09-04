import type { ExactPitch } from "../../domain/harmony/pitch";
import type { PianoArticulation } from "../../domain/progression/step";

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
 * Articulations supported:
 * - Block: all upper voices sound synchronously at t = 0
 * - Arp Up: pitches ascend in pitch order with staggered onset
 * - Arp Down: pitches descend in pitch order with staggered onset
 * - Broken Chord: notes alternate across the duration
 * - Humanized: subtle, bounded timing micro-deviations (-15ms..+15ms)
 *
 * Testable with an injected deterministic pseudo-random source.
 */
export function resolveArticulationTiming(
  articulation: PianoArticulation,
  upperPitches: readonly ExactPitch[],
  totalDurationSeconds: number,
  bassPitch?: ExactPitch,
  options?: ArticulationOptions,
): readonly NoteTimingIntent[] {
  const intents: NoteTimingIntent[] = [];
  const baseDuration = Math.max(0.05, totalDurationSeconds * 0.95);

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
      // Sort ascending by pitch
      const sorted = [...upperPitches].sort((a, b) => a.midiNumber - b.midiNumber);
      const stepDelay = Math.min(0.045, (totalDurationSeconds * 0.35) / Math.max(1, n));
      for (let i = 0; i < n; i++) {
        const start = i * stepDelay;
        const dur = Math.max(0.1, baseDuration - start);
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
      // Sort descending by pitch
      const sorted = [...upperPitches].sort((a, b) => b.midiNumber - a.midiNumber);
      const stepDelay = Math.min(0.045, (totalDurationSeconds * 0.35) / Math.max(1, n));
      for (let i = 0; i < n; i++) {
        const start = i * stepDelay;
        const dur = Math.max(0.1, baseDuration - start);
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
      // Split into lower half and upper half
      const sorted = [...upperPitches].sort((a, b) => a.midiNumber - b.midiNumber);
      const half = Math.ceil(n / 2);
      const halfDelay = Math.min(0.12, totalDurationSeconds * 0.25);

      for (let i = 0; i < n; i++) {
        const isUpperHalf = i >= half;
        const start = isUpperHalf ? halfDelay : 0;
        const dur = Math.max(0.1, baseDuration - start);
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
      const rng = options?.randomSource ?? Math.random;
      for (const p of upperPitches) {
        // Bounded micro-jitter: -0.015s..+0.015s
        const jitter = (rng() - 0.5) * 0.03;
        const start = Math.max(0, jitter);
        // Slight duration variation: 0.95..1.05
        const durFactor = 0.95 + rng() * 0.1;
        const dur = Math.max(0.1, baseDuration * durFactor);
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
