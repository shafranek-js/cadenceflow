import { resolveVelocityLayer } from "./velocityLayers";

export interface SampleRegion {
  readonly id: string;
  readonly rootPitch: number; // MIDI pitch 21..108
  readonly keyRange: { readonly min: number; readonly max: number };
  readonly velocityRange: { readonly min: number; readonly max: number };
  readonly velocityLayer: number; // 1..16
  readonly assetPath: string;
  readonly tuningCents?: number;
  readonly gainCorrection?: number;
}

export interface HqPianoManifest {
  readonly schemaVersion: number;
  readonly instrumentId: string;
  readonly displayName: string;
  readonly sampleFormat: string;
  readonly sampleRate: number;
  readonly regions: readonly SampleRegion[];
}

export interface ResolvedSampleRegion {
  readonly region: SampleRegion;
  readonly targetPitch: number;
  readonly playbackRate: number;
  readonly pitchShiftSemitones: number;
}

export const PIANO_MIN_MIDI_PITCH = 21; // A0
export const PIANO_MAX_MIDI_PITCH = 108; // C8

/**
 * Validates that an arbitrary JSON/object structure satisfies the HqPianoManifest contract.
 */
export function validatePianoManifest(data: unknown): HqPianoManifest {
  if (typeof data !== "object" || data === null) {
    throw new TypeError("Manifest must be a non-null object");
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.schemaVersion !== "number" || obj.schemaVersion < 1) {
    throw new TypeError("Manifest schemaVersion must be a positive integer");
  }
  if (typeof obj.instrumentId !== "string" || obj.instrumentId.trim() === "") {
    throw new TypeError("Manifest instrumentId must be a non-empty string");
  }
  if (typeof obj.displayName !== "string" || obj.displayName.trim() === "") {
    throw new TypeError("Manifest displayName must be a non-empty string");
  }
  if (typeof obj.sampleFormat !== "string" || obj.sampleFormat.trim() === "") {
    throw new TypeError("Manifest sampleFormat must be a non-empty string");
  }
  if (typeof obj.sampleRate !== "number" || obj.sampleRate <= 0) {
    throw new TypeError("Manifest sampleRate must be a positive number");
  }
  if (!Array.isArray(obj.regions)) {
    throw new TypeError("Manifest regions must be an array");
  }

  for (let i = 0; i < obj.regions.length; i++) {
    const reg = obj.regions[i] as Record<string, unknown>;
    if (typeof reg !== "object" || reg === null) {
      throw new TypeError(`Region at index ${i} must be an object`);
    }
    if (typeof reg.id !== "string" || reg.id.trim() === "") {
      throw new TypeError(`Region at index ${i} id must be a non-empty string`);
    }
    if (
      typeof reg.rootPitch !== "number" ||
      reg.rootPitch < PIANO_MIN_MIDI_PITCH ||
      reg.rootPitch > PIANO_MAX_MIDI_PITCH
    ) {
      throw new TypeError(
        `Region ${reg.id ?? i} rootPitch must be within piano range ${PIANO_MIN_MIDI_PITCH}..${PIANO_MAX_MIDI_PITCH}`,
      );
    }
    if (typeof reg.velocityLayer !== "number" || reg.velocityLayer < 1 || reg.velocityLayer > 16) {
      throw new TypeError(`Region ${reg.id ?? i} velocityLayer must be 1..16`);
    }
    if (typeof reg.assetPath !== "string" || reg.assetPath.trim() === "") {
      throw new TypeError(`Region ${reg.id ?? i} assetPath must be a non-empty string`);
    }
    if (
      typeof reg.keyRange !== "object" ||
      reg.keyRange === null ||
      typeof (reg.keyRange as Record<string, unknown>).min !== "number" ||
      typeof (reg.keyRange as Record<string, unknown>).max !== "number"
    ) {
      throw new TypeError(`Region ${reg.id ?? i} keyRange must have numeric min and max`);
    }
    if (
      typeof reg.velocityRange !== "object" ||
      reg.velocityRange === null ||
      typeof (reg.velocityRange as Record<string, unknown>).min !== "number" ||
      typeof (reg.velocityRange as Record<string, unknown>).max !== "number"
    ) {
      throw new TypeError(`Region ${reg.id ?? i} velocityRange must have numeric min and max`);
    }
  }

  return data as HqPianoManifest;
}

/**
 * Resolves the optimal sample region, nearest sampled root pitch, and pitch playbackRate
 * for a requested MIDI note and velocity.
 */
export function resolveSampleRegion(
  manifest: HqPianoManifest,
  midiPitch: number,
  velocity: number,
): ResolvedSampleRegion {
  if (midiPitch < PIANO_MIN_MIDI_PITCH || midiPitch > PIANO_MAX_MIDI_PITCH) {
    throw new RangeError(
      `MIDI pitch ${midiPitch} is outside the standard acoustic piano playable range (${PIANO_MIN_MIDI_PITCH}..${PIANO_MAX_MIDI_PITCH})`,
    );
  }

  if (manifest.regions.length === 0) {
    throw new Error(`Manifest '${manifest.instrumentId}' contains no sample regions`);
  }

  const targetVelocity = Math.max(1, Math.min(127, Math.round(velocity)));
  const layerDef = resolveVelocityLayer(targetVelocity);

  // Filter candidate regions matching this velocity layer
  let candidateRegions = manifest.regions.filter(
    (r) =>
      r.velocityLayer === layerDef.layer ||
      (targetVelocity >= r.velocityRange.min && targetVelocity <= r.velocityRange.max),
  );

  // If no regions exist for this exact layer, fall back to all regions
  if (candidateRegions.length === 0) {
    candidateRegions = [...manifest.regions];
  }

  // 1. Prefer region whose keyRange contains target pitch
  let bestRegion: SampleRegion | null = null;
  const keyRangeMatch = candidateRegions.find(
    (r) => midiPitch >= r.keyRange.min && midiPitch <= r.keyRange.max,
  );

  if (keyRangeMatch) {
    bestRegion = keyRangeMatch;
  } else {
    // 2. Otherwise select region with nearest rootPitch
    let minDistance = Infinity;
    for (const region of candidateRegions) {
      const distance = Math.abs(region.rootPitch - midiPitch);
      if (distance < minDistance) {
        minDistance = distance;
        bestRegion = region;
      }
    }
  }

  if (!bestRegion) {
    throw new Error(`No sample region found for pitch ${midiPitch} and velocity ${targetVelocity}`);
  }

  const pitchShiftSemitones = midiPitch - bestRegion.rootPitch;
  const tuningShift = (bestRegion.tuningCents ?? 0) / 100;
  const totalShiftSemitones = pitchShiftSemitones + tuningShift;
  const playbackRate = Math.pow(2, totalShiftSemitones / 12);

  return {
    region: bestRegion,
    targetPitch: midiPitch,
    playbackRate,
    pitchShiftSemitones,
  };
}
