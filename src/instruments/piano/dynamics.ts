import type { ExactPitch } from "../../domain/harmony/pitch";
import type { DynamicsPresetId, MusicalDynamicLabel } from "../contracts";

export interface ApplyDynamicsPresetOptions {
  readonly randomSource?: () => number;
}

export function applyDynamicsPreset(
  _presetId: DynamicsPresetId,
  _pitches: readonly ExactPitch[],
  _masterVelocity: number,
  _options?: ApplyDynamicsPresetOptions,
): Readonly<Record<string, number>> {
  // Stub for T087 — dynamics presets will be implemented in Batch B
  throw new Error("applyDynamicsPreset pending implementation in T087");
}

export function musicalDynamicToVelocity(_label: MusicalDynamicLabel): number {
  // Stub for T087 — musical dynamic mapping will be implemented in Batch B
  throw new Error("musicalDynamicToVelocity pending implementation in T087");
}

export function velocityToMusicalDynamic(_velocity: number): MusicalDynamicLabel {
  // Stub for T087 — velocity to musical dynamic will be implemented in Batch B
  throw new Error("velocityToMusicalDynamic pending implementation in T087");
}

export function resolveEffectiveNoteVelocity(
  _masterVelocity: number,
  _noteKey: string,
  _overrides?: Readonly<Record<string, number>>,
): number {
  // Stub for T087 — per-note velocity resolution will be implemented in Batch B
  throw new Error("resolveEffectiveNoteVelocity pending implementation in T087");
}
