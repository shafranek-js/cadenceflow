import type { HarmonicFunctionIdentity } from "./functions";
import type { PitchClassIdentity, PitchSpelling } from "./pitch";
import { formatPitchSpelling } from "./spelling";

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
  /** Semantic inversion metadata; absent means root-bass defaults remain valid. */
  readonly bassScaleDegree?: number;
  readonly bassPitchClass?: PitchClassIdentity;
  readonly bassSpelling?: PitchSpelling;
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

export function formatChordSymbol(chord: ChordDefinition): string {
  const rootStr = formatPitchSpelling(chord.spelling.root);
  const suffix =
    chord.bassPitchClass !== undefined &&
    chord.bassPitchClass !== chord.rootPitchClass &&
    chord.bassSpelling
      ? `/${formatPitchSpelling(chord.bassSpelling)}`
      : "";
  let symbol: string;
  if (chord.baseQuality === "minor") {
    symbol = `${rootStr}m`;
  } else if (chord.baseQuality === "diminished") {
    symbol = chord.variant?.seventh === "diminished7" ? `${rootStr}°7` : `${rootStr}°`;
  } else if (chord.baseQuality === "augmented") {
    symbol = `${rootStr}+`;
  } else if (chord.baseQuality === "dominant") {
    symbol = `${rootStr}7`;
  } else {
    symbol = rootStr;
  }
  return `${symbol}${suffix}`;
}
