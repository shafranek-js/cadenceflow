/**
 * Harmonic Matrix Functional Zoning and Directed Tendency / Resolution Mapping.
 *
 * Implements CadenceFlow's functional-harmony tendency principles:
 * 1. Directed Tension Zone ("Don't Mix" ⊘): Secondary dominants, secondary diminished,
 *    and Neapolitan chords represent directed tension that must resolve to target degrees.
 * 2. Diatonic Core Zone ("Mix Chords" ∞): Foundational diatonic chords that can be freely
 *    mixed and sequenced.
 * 3. Modal Color Zone ("Modal Color" ≈): Borrowed modal interchange and chromatic chords
 *    providing tonal variety.
 */

export type MatrixZoneId = "tension" | "core" | "color";

export interface MatrixZoneInfo {
  readonly id: MatrixZoneId;
  readonly badge: string;
  readonly symbol: string;
  readonly tooltip: string;
  readonly rule: string;
}

export const MATRIX_ZONES: Readonly<Record<MatrixZoneId, MatrixZoneInfo>> = Object.freeze({
  tension: Object.freeze({
    id: "tension",
    badge: "Don't Mix",
    symbol: "⊘",
    tooltip: "Tension chords must not be chained together — follow the resolution arrow to the target chord.",
    rule: "Follow arrow to target chord",
  }),
  core: Object.freeze({
    id: "core",
    badge: "Mix Chords",
    symbol: "∞",
    tooltip: "Diatonic core chords provide the harmonic foundation and can be freely mixed and sequenced.",
    rule: "Freely mixable harmonic core",
  }),
  color: Object.freeze({
    id: "color",
    badge: "Modal Color",
    symbol: "≈",
    tooltip: "Modal interchange and chromatic chords expand harmonic color; resolve toward I, IV, or V.",
    rule: "Chromatic color / borrowed chords",
  }),
});

/**
 * Returns functional zone metadata for a matrix layer ID.
 */
export function getZoneForLayer(layerId: string): MatrixZoneInfo {
  switch (layerId) {
    case "secondary-dominants":
    case "secondary-diminished":
      return MATRIX_ZONES.tension;
    case "diatonic-core":
    case "tonal-minor-core":
    case "core":
      return MATRIX_ZONES.core;
    case "modal-interchange":
    case "chromatic-colors":
    default:
      return MATRIX_ZONES.color;
  }
}

/**
 * Canonical dictionary of resolution targets for tension / secondary chords.
 */
const CANONICAL_RESOLUTION_TARGETS: Readonly<Record<string, string>> = Object.freeze({
  "V7": "I",
  "V7/I": "I",
  "V7/ii": "ii",
  "V7/iii": "iii",
  "V7/IV": "IV",
  "V7/V": "V",
  "V7/vi": "vi",
  "N6": "V",
});

/**
 * Resolves the target function ID for a given source chord function ID.
 * Returns undefined if the chord is not a directed tension chord.
 */
export function getResolutionTarget(functionId: string, _moduleId?: string): string | undefined {
  if (CANONICAL_RESOLUTION_TARGETS[functionId]) {
    return CANONICAL_RESOLUTION_TARGETS[functionId];
  }

  // Handle secondary diminished format "vii°7/X", "vii°/X", "viio7/X", "viio/X"
  const dimMatch = functionId.match(/^(?:vii°7|vii°|viio7|viio)\/(.+)$/);
  if (dimMatch && dimMatch[1]) {
    return dimMatch[1];
  }

  // Handle tritone substitutes format "subV7/X" or "SubV7/X"
  const subMatch = functionId.match(/^(?:subV7|SubV7)\/(.+)$/);
  if (subMatch && subMatch[1]) {
    return subMatch[1];
  }

  return undefined;
}
