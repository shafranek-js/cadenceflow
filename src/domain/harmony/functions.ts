import { computeModalChords } from "./modes";

export type HarmonicModuleId = "progressions" | "dark-harmony";
export type DerivedMode = "major" | "tonal-minor";
export type BorrowedModeId =
  "ionian" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "aeolian" | "locrian";

export type HarmonicFunctionCategory =
  | "core"
  | "secondary-dominant"
  | "modal-interchange"
  | "secondary-diminished"
  | "neapolitan"
  | "chromatic-color";

/**
 * Semantic mixing contract for a harmonic function.
 *
 * This carries the semantic contract used by strict T191 routing. Legacy
 * project identities without targetId remain valid through compatibility
 * fallbacks in the routing layer.
 */
export type MatrixMixPolicy = "mix-freely" | "must-resolve";

export interface HarmonicFunctionIdentity {
  readonly moduleId: HarmonicModuleId;
  readonly functionId: string;
  readonly category: HarmonicFunctionCategory;
  readonly targetFunctionId?: string;
  /** Canonical semantic target; targetFunctionId remains the v1 compatibility field. */
  readonly targetId?: string;
  readonly mixPolicy?: MatrixMixPolicy;
  /** Scale degree used by a semantic inversion such as Neapolitan sixth. */
  readonly bassScaleDegree?: number;
  /** Explicit source mode for a Chord Properties modal borrow. */
  readonly borrowedFromMode?: BorrowedModeId;
  /** One-based source scale degree for a Chord Properties modal borrow. */
  readonly borrowedDegree?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function modeForModule(moduleId: HarmonicModuleId): DerivedMode {
  return moduleId === "progressions" ? "major" : "tonal-minor";
}

export function harmonicFunctionKey(identity: HarmonicFunctionIdentity): string {
  return `${identity.moduleId}:${identity.functionId}${identity.targetFunctionId ? `>${identity.targetFunctionId}` : ""}`;
}

const BORROWED_MODE_LABELS: Readonly<Record<BorrowedModeId, string>> = Object.freeze({
  ionian: "Ionian",
  dorian: "Dorian",
  phrygian: "Phrygian",
  lydian: "Lydian",
  mixolydian: "Mixolydian",
  aeolian: "Aeolian",
  locrian: "Locrian",
});

const borrowedModeRomanNumerals = (mode: BorrowedModeId): ReadonlyMap<number, string> =>
  new Map(computeModalChords(0, mode).map((chord) => [chord.degree, chord.romanNumeral]));

const BORROWED_MODE_ROMAN_NUMERALS = Object.freeze({
  ionian: borrowedModeRomanNumerals("ionian"),
  dorian: borrowedModeRomanNumerals("dorian"),
  phrygian: borrowedModeRomanNumerals("phrygian"),
  lydian: borrowedModeRomanNumerals("lydian"),
  mixolydian: borrowedModeRomanNumerals("mixolydian"),
  aeolian: borrowedModeRomanNumerals("aeolian"),
  locrian: borrowedModeRomanNumerals("locrian"),
} satisfies Record<BorrowedModeId, ReadonlyMap<number, string>>);

export function harmonicFunctionLabel(identity: HarmonicFunctionIdentity): string {
  const encoded = identity.functionId.match(
    /^mode-(ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian)-([1-7])$/,
  );
  const borrowedMode = identity.borrowedFromMode ?? (encoded?.[1] as BorrowedModeId | undefined);
  const borrowedDegree = identity.borrowedDegree ?? (encoded ? Number(encoded[2]) : undefined);
  if (borrowedMode && borrowedDegree !== undefined) {
    const romanNumeral = BORROWED_MODE_ROMAN_NUMERALS[borrowedMode].get(borrowedDegree);
    return `${romanNumeral ?? `Degree ${borrowedDegree}`} (borrowed from ${BORROWED_MODE_LABELS[borrowedMode]})`;
  }
  return identity.functionId;
}
