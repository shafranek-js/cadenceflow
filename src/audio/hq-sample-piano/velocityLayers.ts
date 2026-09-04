/**
 * Salamander Grand Piano V3 velocity layer definitions.
 * 16 discrete velocity layers covering the full MIDI velocity range (1..127).
 */

export interface VelocityLayerDefinition {
  readonly layer: number; // 1..16
  readonly name: string; // "v1" .. "v16"
  readonly velocityMin: number;
  readonly velocityMax: number;
}

export const SALAMANDER_VELOCITY_LAYERS: readonly VelocityLayerDefinition[] = [
  { layer: 1, name: "v1", velocityMin: 1, velocityMax: 26 },
  { layer: 2, name: "v2", velocityMin: 27, velocityMax: 34 },
  { layer: 3, name: "v3", velocityMin: 35, velocityMax: 36 },
  { layer: 4, name: "v4", velocityMin: 37, velocityMax: 43 },
  { layer: 5, name: "v5", velocityMin: 44, velocityMax: 46 },
  { layer: 6, name: "v6", velocityMin: 47, velocityMax: 50 },
  { layer: 7, name: "v7", velocityMin: 51, velocityMax: 56 },
  { layer: 8, name: "v8", velocityMin: 57, velocityMax: 64 },
  { layer: 9, name: "v9", velocityMin: 65, velocityMax: 72 },
  { layer: 10, name: "v10", velocityMin: 73, velocityMax: 80 },
  { layer: 11, name: "v11", velocityMin: 81, velocityMax: 88 },
  { layer: 12, name: "v12", velocityMin: 89, velocityMax: 96 },
  { layer: 13, name: "v13", velocityMin: 97, velocityMax: 104 },
  { layer: 14, name: "v14", velocityMin: 105, velocityMax: 112 },
  { layer: 15, name: "v15", velocityMin: 113, velocityMax: 120 },
  { layer: 16, name: "v16", velocityMin: 121, velocityMax: 127 },
] as const;

/**
 * Resolve an exact MIDI velocity (1..127) to its corresponding Salamander velocity layer.
 */
export function resolveVelocityLayer(velocity: number): VelocityLayerDefinition {
  const clamped = Math.max(1, Math.min(127, Math.round(velocity)));
  const layer = SALAMANDER_VELOCITY_LAYERS.find(
    (l) => clamped >= l.velocityMin && clamped <= l.velocityMax,
  );
  if (!layer) {
    return SALAMANDER_VELOCITY_LAYERS[SALAMANDER_VELOCITY_LAYERS.length - 1]!;
  }
  return layer;
}
