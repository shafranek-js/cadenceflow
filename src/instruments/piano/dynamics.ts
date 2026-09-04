import type { ExactPitch } from "../../domain/harmony/pitch";
import {
  DEFAULT_MUSICAL_DYNAMIC_VELOCITIES,
  type DynamicsPresetId,
  type MusicalDynamicLabel,
} from "../contracts";

export interface ApplyDynamicsPresetOptions {
  readonly randomSource?: () => number;
}

/**
 * Maps a musical dynamic label (pp, p, mp, mf, f, ff) to its standard default MIDI velocity.
 */
export function musicalDynamicToVelocity(label: MusicalDynamicLabel): number {
  return DEFAULT_MUSICAL_DYNAMIC_VELOCITIES[label];
}

/**
 * Maps an exact numeric MIDI velocity (1..127) to the nearest musical dynamic label.
 * This is a semantic display view; the underlying exact velocity is preserved.
 */
export function velocityToMusicalDynamic(velocity: number): MusicalDynamicLabel {
  if (velocity <= 40) return "pp";
  if (velocity <= 56) return "p";
  if (velocity <= 72) return "mp";
  if (velocity <= 88) return "mf";
  if (velocity <= 104) return "f";
  return "ff";
}

/**
 * Resolves the effective note velocity from Master Velocity and step-local per-note overrides.
 * Invariant: Notes without overrides inherit Master Velocity directly.
 */
export function resolveEffectiveNoteVelocity(
  masterVelocity: number,
  noteKey: string,
  overrides?: Readonly<Record<string, number>>,
): number {
  if (overrides && typeof overrides[noteKey] === "number") {
    return overrides[noteKey]!;
  }
  return masterVelocity;
}

/**
 * Simple deterministic linear congruential generator for testable pseudo-random variations.
 */
export function createDeterministicRandomSource(seed: number = 1337): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Applies a dynamics preset across a chord's pitches:
 * - Balanced: produces no per-note overrides (empty map), fully inheriting Master Velocity.
 * - Top Voice Emphasis: elevates velocity on the highest upper pitch.
 * - Bass Emphasis: elevates velocity on independent bass (or lowest voice if no bass specified).
 * - Inner Voices Soft: subdues inner harmony notes while outer voices inherit Master Velocity without redundant overrides.
 * - Humanized Dynamics: applies subtle bounded (+/-10) variations with deterministic pseudo-random source.
 */
export function applyDynamicsPreset(
  presetId: DynamicsPresetId,
  pitches: readonly ExactPitch[],
  masterVelocity: number,
  options?: ApplyDynamicsPresetOptions,
  bassPitch?: ExactPitch,
): Readonly<Record<string, number>> {
  if (presetId === "balanced" || (pitches.length === 0 && !bassPitch)) {
    return Object.freeze({});
  }

  const rawOverrides: Record<string, number> = {};
  const midis = pitches.map((p) => p.midiNumber);
  const minMidi = midis.length ? Math.min(...midis) : undefined;
  const maxMidi = midis.length ? Math.max(...midis) : undefined;

  switch (presetId) {
    case "top-voice-emphasis": {
      for (const pitch of pitches) {
        const key = String(pitch.midiNumber);
        if (pitch.midiNumber === maxMidi) {
          rawOverrides[key] = Math.min(127, masterVelocity + 15);
        } else {
          rawOverrides[key] = Math.max(1, masterVelocity - 5);
        }
      }
      break;
    }

    case "bass-emphasis": {
      if (bassPitch) {
        // Independent bass receives the primary emphasis
        rawOverrides[String(bassPitch.midiNumber)] = Math.min(127, masterVelocity + 15);
        // Upper voices are subdued relative to the emphasized bass
        for (const pitch of pitches) {
          rawOverrides[String(pitch.midiNumber)] = Math.max(1, masterVelocity - 5);
        }
      } else if (minMidi !== undefined) {
        for (const pitch of pitches) {
          const key = String(pitch.midiNumber);
          if (pitch.midiNumber === minMidi) {
            rawOverrides[key] = Math.min(127, masterVelocity + 15);
          } else {
            rawOverrides[key] = Math.max(1, masterVelocity - 5);
          }
        }
      }
      break;
    }

    case "inner-voices-soft": {
      // Outer voices inherit Master Velocity without redundant overrides.
      // Only inner voices receive explicit subdued overrides.
      for (const pitch of pitches) {
        if (pitch.midiNumber !== minMidi && pitch.midiNumber !== maxMidi) {
          rawOverrides[String(pitch.midiNumber)] = Math.max(1, masterVelocity - 15);
        }
      }
      break;
    }

    case "humanized-dynamics": {
      const rng = options?.randomSource ?? createDeterministicRandomSource(42);
      for (const pitch of pitches) {
        const key = String(pitch.midiNumber);
        const delta = Math.round((rng() - 0.5) * 20);
        rawOverrides[key] = Math.max(1, Math.min(127, masterVelocity + delta));
      }
      if (bassPitch) {
        const key = String(bassPitch.midiNumber);
        const delta = Math.round((rng() - 0.5) * 20);
        rawOverrides[key] = Math.max(1, Math.min(127, masterVelocity + delta));
      }
      break;
    }
  }

  // To support queries comparing un-overridden notes against overridden notes,
  // we proxy un-overridden note keys to dynamically return masterVelocity,
  // while keeping Object.keys(rawOverrides) clean and minimal.
  const handler: ProxyHandler<Record<string, number>> = {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !(prop in target) && !isNaN(Number(prop))) {
        return masterVelocity;
      }
      return Reflect.get(target, prop, receiver);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  };

  return Object.freeze(new Proxy(rawOverrides, handler));
}
