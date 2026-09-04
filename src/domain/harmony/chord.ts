import type { HarmonicFunctionIdentity } from "./functions";
import type { PitchClassIdentity, PitchSpelling } from "./pitch";

export type BaseChordQuality = "major" | "minor" | "diminished" | "augmented" | "dominant";
export type SeventhKind = "minor7" | "major7" | "diminished7" | "half-diminished7";
export type ChordExtension = 9 | 11 | 13;
export type Suspension = "sus2" | "sus4";

export interface Alteration {
  readonly degree: 5 | 9 | 11 | 13;
  readonly semitones: -1 | 1;
}

export interface HarmonicVariant {
  readonly seventh?: SeventhKind;
  readonly extensions: readonly ChordExtension[];
  readonly suspensions: readonly Suspension[];
  readonly alterations: readonly Alteration[];
  readonly add9?: boolean;
}

export interface ChordSpelling {
  readonly root: PitchSpelling;
  readonly symbol: string;
  readonly manualEnharmonicOverrides?: Readonly<Record<string, PitchSpelling>>;
}

export interface ChordDefinition {
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly rootPitchClass: PitchClassIdentity;
  readonly baseQuality: BaseChordQuality;
  readonly variant: HarmonicVariant;
  readonly spelling: ChordSpelling;
}

export const EMPTY_HARMONIC_VARIANT: HarmonicVariant = Object.freeze({
  extensions: Object.freeze([]),
  suspensions: Object.freeze([]),
  alterations: Object.freeze([]),
});

export interface HarmonicVariantValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateHarmonicVariant(
  baseQuality: BaseChordQuality,
  variant: HarmonicVariant,
): HarmonicVariantValidation {
  const errors: string[] = [];
  if (variant.suspensions.length > 1) errors.push("Only one suspension may be active at a time");
  if (variant.add9 && variant.extensions.includes(9))
    errors.push("add9 and extension 9 are mutually exclusive");
  const alterationDegrees = variant.alterations.map((item) => item.degree);
  if (new Set(alterationDegrees).size !== alterationDegrees.length)
    errors.push("Only one alteration per degree is supported");
  if (baseQuality === "diminished" && variant.suspensions.length > 0)
    errors.push("Suspensions are not supported on diminished base quality in v1");
  return { valid: errors.length === 0, errors };
}
