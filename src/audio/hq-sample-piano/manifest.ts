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

export interface HqPianoProvenanceMetadata {
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly sourceInstrument: string;
  readonly sourceLicense: string;
  readonly encoding: string;
  readonly generatedAt?: string | undefined;
}

export interface HqPianoManifest {
  readonly schemaVersion: number;
  readonly instrumentId: string;
  readonly displayName: string;
  readonly sampleFormat: string;
  readonly sampleRate: number;
  readonly metadata?: HqPianoProvenanceMetadata | undefined;
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

export interface SalamanderKeyRegionDefinition {
  readonly rootName: string;
  readonly rootPitch: number;
  readonly keyMin: number;
  readonly keyMax: number;
}

/**
 * Authoritative 30 key regions defined in upstream Salamander Grand Piano V3 `Data/region.txt`.
 * Every key from 21 (A0) to 108 (C8) belongs to exactly one root without gaps or overlaps.
 */
export const SALAMANDER_KEY_REGIONS: readonly SalamanderKeyRegionDefinition[] = [
  { rootName: "A0", rootPitch: 21, keyMin: 21, keyMax: 22 },
  { rootName: "C1", rootPitch: 24, keyMin: 23, keyMax: 25 },
  { rootName: "Ds1", rootPitch: 27, keyMin: 26, keyMax: 28 },
  { rootName: "Fs1", rootPitch: 30, keyMin: 29, keyMax: 31 },
  { rootName: "A1", rootPitch: 33, keyMin: 32, keyMax: 34 },
  { rootName: "C2", rootPitch: 36, keyMin: 35, keyMax: 37 },
  { rootName: "Ds2", rootPitch: 39, keyMin: 38, keyMax: 40 },
  { rootName: "Fs2", rootPitch: 42, keyMin: 41, keyMax: 43 },
  { rootName: "A2", rootPitch: 45, keyMin: 44, keyMax: 46 },
  { rootName: "C3", rootPitch: 48, keyMin: 47, keyMax: 49 },
  { rootName: "Ds3", rootPitch: 51, keyMin: 50, keyMax: 52 },
  { rootName: "Fs3", rootPitch: 54, keyMin: 53, keyMax: 55 },
  { rootName: "A3", rootPitch: 57, keyMin: 56, keyMax: 58 },
  { rootName: "C4", rootPitch: 60, keyMin: 59, keyMax: 61 },
  { rootName: "Ds4", rootPitch: 63, keyMin: 62, keyMax: 64 },
  { rootName: "Fs4", rootPitch: 66, keyMin: 65, keyMax: 67 },
  { rootName: "A4", rootPitch: 69, keyMin: 68, keyMax: 70 },
  { rootName: "C5", rootPitch: 72, keyMin: 71, keyMax: 73 },
  { rootName: "Ds5", rootPitch: 75, keyMin: 74, keyMax: 76 },
  { rootName: "Fs5", rootPitch: 78, keyMin: 77, keyMax: 79 },
  { rootName: "A5", rootPitch: 81, keyMin: 80, keyMax: 82 },
  { rootName: "C6", rootPitch: 84, keyMin: 83, keyMax: 85 },
  { rootName: "Ds6", rootPitch: 87, keyMin: 86, keyMax: 88 },
  { rootName: "Fs6", rootPitch: 90, keyMin: 89, keyMax: 91 },
  { rootName: "A6", rootPitch: 93, keyMin: 92, keyMax: 94 },
  { rootName: "C7", rootPitch: 96, keyMin: 95, keyMax: 97 },
  { rootName: "Ds7", rootPitch: 99, keyMin: 98, keyMax: 100 },
  { rootName: "Fs7", rootPitch: 102, keyMin: 101, keyMax: 103 },
  { rootName: "A7", rootPitch: 105, keyMin: 104, keyMax: 106 },
  { rootName: "C8", rootPitch: 108, keyMin: 107, keyMax: 108 },
] as const;

/**
 * Validates that a piano manifest satisfies full 88-key acoustic coverage (21..108)
 * for the specified velocity layer (default 1). Every key must belong to exactly one region
 * and match the authoritative Salamander keycenter.
 */
export function validate88KeyCoverage(manifest: HqPianoManifest, velocityLayer = 1): void {
  const layerRegions = manifest.regions.filter((r) => r.velocityLayer === velocityLayer);
  if (layerRegions.length === 0) {
    throw new Error(`Manifest contains no regions for velocity layer ${velocityLayer}`);
  }

  for (let key = PIANO_MIN_MIDI_PITCH; key <= PIANO_MAX_MIDI_PITCH; key++) {
    const matching = layerRegions.filter((r) => key >= r.keyRange.min && key <= r.keyRange.max);
    if (matching.length === 0) {
      throw new Error(
        `Coverage gap: MIDI key ${key} is not covered in velocity layer ${velocityLayer}`,
      );
    }
    if (matching.length > 1) {
      throw new Error(
        `Coverage conflict: MIDI key ${key} is covered by multiple regions (${matching.map((m) => m.id).join(", ")}) in velocity layer ${velocityLayer}`,
      );
    }

    const region = matching[0]!;
    const expectedKeyDef = SALAMANDER_KEY_REGIONS.find(
      (def) => key >= def.keyMin && key <= def.keyMax,
    );
    if (expectedKeyDef && region.rootPitch !== expectedKeyDef.rootPitch) {
      throw new Error(
        `Keycenter mismatch for key ${key}: region ${region.id} has root ${region.rootPitch}, expected authoritative root ${expectedKeyDef.rootPitch}`,
      );
    }
  }
}

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
