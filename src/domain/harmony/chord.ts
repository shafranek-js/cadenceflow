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
  /** Optional step-local override of the function's base triad quality. */
  readonly baseQualityOverride?: BaseChordQuality;
  readonly seventh?: SeventhKind;
  readonly extensions: readonly ChordExtension[];
  readonly suspensions: readonly Suspension[];
  readonly alterations: readonly Alteration[];
  readonly add9?: boolean;
  readonly add11?: boolean;
  readonly add13?: boolean;
  readonly no3?: boolean;
  readonly no5?: boolean;
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

export function snapshotHarmonicVariant(variant: HarmonicVariant): HarmonicVariant {
  return Object.freeze({
    ...variant,
    extensions: Object.freeze([...variant.extensions]),
    suspensions: Object.freeze([...variant.suspensions]),
    alterations: Object.freeze(variant.alterations.map((item) => Object.freeze({ ...item }))),
  });
}

export function effectiveChordQuality(chord: ChordDefinition): BaseChordQuality {
  return chord.variant.baseQualityOverride ?? chord.baseQuality;
}

export function defaultSeventhForQuality(quality: BaseChordQuality): SeventhKind {
  switch (quality) {
    case "minor":
      return "minor7";
    case "diminished":
      return "half-diminished7";
    case "dominant":
      return "minor7";
    case "major":
    case "augmented":
      return "major7";
  }
}

export function withHarmonicVariant(
  chord: ChordDefinition,
  variant: HarmonicVariant,
): ChordDefinition {
  return Object.freeze({
    ...chord,
    baseQuality: variant.baseQualityOverride ?? chord.baseQuality,
    variant,
  });
}

export interface HarmonicVariantValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateHarmonicVariant(
  baseQuality: BaseChordQuality,
  variant: HarmonicVariant,
): HarmonicVariantValidation {
  const errors: string[] = [];
  const quality = variant.baseQualityOverride ?? baseQuality;
  if (variant.suspensions.length > 1) errors.push("Only one suspension may be active at a time");
  if (
    (variant.add9 && variant.extensions.includes(9)) ||
    (variant.add11 && variant.extensions.includes(11)) ||
    (variant.add13 && variant.extensions.includes(13))
  ) {
    errors.push("Added tones and extensions of the same degree are mutually exclusive");
  }
  const alterationDegrees = variant.alterations.map((item) => item.degree);
  if (new Set(alterationDegrees).size !== alterationDegrees.length)
    errors.push("Only one alteration per degree is supported");
  if (quality === "diminished" && variant.suspensions.length > 0)
    errors.push("Suspensions are not supported on diminished base quality in v1");
  if (variant.no3 && variant.suspensions.length > 0)
    errors.push("A suspension replaces the third, so no3 cannot be combined with sus2 or sus4");
  if (variant.no5 && variant.alterations.some((item) => item.degree === 5))
    errors.push("A fifth alteration cannot be applied when the fifth is omitted");
  return { valid: errors.length === 0, errors };
}

/**
 * Builds the chord-quality suffix (everything after the root).
 *
 * Regression context: this used to inspect only `baseQuality`, with a single special case for
 * `diminished7`. Everything else about the variant was ignored, so the displayed symbol
 * contradicted the chord that actually sounds:
 *
 *   Cmaj7 -> "C"      Cm7 -> "Cm"       Cm(maj7) -> "Cm"
 *   Cm7b5 -> "C°"     C9  -> "C7"       C7b9 -> "C7"      Csus4 -> "C"      Cadd9 -> "C"
 *
 * A dominant seventh keeps its traditional bare "7" (`dominant` already means "major triad plus
 * a minor seventh"), so that case must stay unchanged.
 */
function formatQualitySuffix(chord: ChordDefinition): string {
  const variant = chord.variant;
  const quality = effectiveChordQuality(chord);
  let suffix: string;
  if (variant?.seventh !== undefined) {
    const seventh = variant.seventh;
    const minorSeventh = seventh === "minor7" || seventh === "half-diminished7";
    if (quality === "diminished") {
      suffix = minorSeventh ? "m7b5" : seventh === "major7" ? "\u00b0(maj7)" : "\u00b07";
    } else if (seventh === "diminished7") {
      const triad = quality === "minor" ? "m" : quality === "augmented" ? "+" : "";
      suffix = `${triad}(bb7)`;
    } else if (quality === "minor") {
      suffix = minorSeventh ? "m7" : "m(maj7)";
    } else {
      suffix = `${quality === "augmented" ? "+" : ""}${minorSeventh ? "7" : "maj7"}`;
    }
  } else {
    switch (quality) {
      case "minor":
        suffix = "m";
        break;
      case "diminished":
        suffix = "°";
        break;
      case "augmented":
        suffix = "+";
        break;
      case "dominant":
        // Traditional notation: a dominant seventh is written as a bare "7".
        suffix = "7";
        break;
      default:
        suffix = "";
        break;
    }
  }

  // Suspensions are written before the extensions (7sus4, 13sus4), matching common practice.
  for (const suspension of variant?.suspensions ?? []) {
    if (!suffix.includes(suspension)) suffix += suspension;
  }

  /*
   * Extensions.
   *
   * A single extension replaces the seventh, because an extended chord contains it by definition:
   * a dominant seventh plus a ninth is "C9", not "C79". Several extensions cannot be run together
   * — concatenating 9 and 11 produced "C911", which reads as nine-eleven — so they are grouped:
   * "C7(9,11)". The parentheses also remove the ambiguity that a run-together form creates.
   */
  const extensions = [...new Set(variant?.extensions ?? [])].sort((a, b) => a - b);
  if (extensions.length === 1) {
    const only = extensions[0]!;
    suffix = suffix.endsWith("7")
      ? suffix.slice(0, -1) + String(only)
      : suffix.includes("7")
        ? `${suffix}(${only})`
        : suffix + String(only);
  } else if (extensions.length > 1) {
    suffix += `(${extensions.join(",")})`;
  }

  const addedToneAlterations = new Map<number, Alteration>();
  for (const [degree, enabled] of [
    [9, variant?.add9],
    [11, variant?.add11],
    [13, variant?.add13],
  ] as const) {
    if (!enabled || variant?.extensions.includes(degree)) continue;
    const alteration = variant?.alterations.find((item) => item.degree === degree);
    if (alteration) addedToneAlterations.set(degree, alteration);
    suffix += `add${alteration ? (alteration.semitones === 1 ? "#" : "b") : ""}${degree}`;
  }

  if (variant?.no3) suffix += "no3";
  if (variant?.no5) suffix += "no5";

  // Alterations last: C7b9, Cmaj7#11. Sorted by degree so the symbol is deterministic.
  const alterations = [...(variant?.alterations ?? [])].sort((a, b) => a.degree - b.degree);
  for (const alteration of alterations) {
    if (addedToneAlterations.has(alteration.degree)) continue;
    if (suffix.includes(`alt${alteration.degree}`)) continue;
    suffix += `${alteration.semitones === 1 ? "#" : "b"}${alteration.degree}`;
  }

  return suffix;
}

export function formatChordSymbol(chord: ChordDefinition): string {
  const rootStr = formatPitchSpelling(chord.spelling.root);
  const suffix =
    chord.bassPitchClass !== undefined &&
    chord.bassPitchClass !== chord.rootPitchClass &&
    chord.bassSpelling
      ? `/${formatPitchSpelling(chord.bassSpelling)}`
      : "";
  return `${rootStr}${formatQualitySuffix(chord)}${suffix}`;
}
