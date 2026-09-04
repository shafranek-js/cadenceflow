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
 * Applies a dynamics preset across a chord's pitches:
 * - Balanced: produces no per-note overrides (empty map), fully inheriting Master Velocity.
 * - Top Voice Emphasis: elevates velocity on the highest pitch.
 * - Bass Emphasis: elevates velocity on the lowest pitch.
 * - Inner Voices Soft: subdues inner harmony notes relative to outer soprano/bass voices.
 * - Humanized Dynamics: applies subtle bounded (+/-10) variations with deterministic randomSource support.
 */
export function applyDynamicsPreset(
  presetId: DynamicsPresetId,
  pitches: readonly ExactPitch[],
  masterVelocity: number,
  options?: ApplyDynamicsPresetOptions,
): Readonly<Record<string, number>> {
  if (presetId === "balanced" || pitches.length === 0) {
    return Object.freeze({});
  }

  const overrides: Record<string, number> = {};
  const midis = pitches.map((p) => p.midiNumber);
  const minMidi = Math.min(...midis);
  const maxMidi = Math.max(...midis);

  switch (presetId) {
    case "top-voice-emphasis": {
      for (const pitch of pitches) {
        const key = String(pitch.midiNumber);
        if (pitch.midiNumber === maxMidi) {
          overrides[key] = Math.min(127, masterVelocity + 15);
        } else {
          overrides[key] = Math.max(1, masterVelocity - 5);
        }
      }
      break;
    }

    case "bass-emphasis": {
      for (const pitch of pitches) {
        const key = String(pitch.midiNumber);
        if (pitch.midiNumber === minMidi) {
          overrides[key] = Math.min(127, masterVelocity + 15);
        } else {
          overrides[key] = Math.max(1, masterVelocity - 5);
        }
      }
      break;
    }

    case "inner-voices-soft": {
      for (const pitch of pitches) {
        const key = String(pitch.midiNumber);
        if (pitch.midiNumber === minMidi || pitch.midiNumber === maxMidi) {
          overrides[key] = masterVelocity;
        } else {
          overrides[key] = Math.max(1, masterVelocity - 15);
        }
      }
      break;
    }

    case "humanized-dynamics": {
      const rng = options?.randomSource ?? Math.random;
      for (const pitch of pitches) {
        const key = String(pitch.midiNumber);
        // Bounded variation of +/-10
        const delta = Math.round((rng() - 0.5) * 20);
        overrides[key] = Math.max(1, Math.min(127, masterVelocity + delta));
      }
      break;
    }
  }

  return Object.freeze(overrides);
}
