import { EMPTY_HARMONIC_VARIANT, type BaseChordQuality, type ChordDefinition, type HarmonicVariant } from "../chord";
import type { HarmonicFunctionCategory, HarmonicFunctionIdentity } from "../functions";
import { normalizePitchClass, type PitchClassIdentity, type PitchSpelling } from "../pitch";
import { defaultTonicSpelling, formatPitchSpelling, spellScaleDegree, spellingToPitchClass } from "../spelling";
import type { HarmonicModuleDefinition } from "./types";

interface DarkFunctionSpec {
  readonly id: string;
  readonly layerId: "secondary-diminished" | "tonal-minor-core" | "chromatic-colors";
  readonly category: HarmonicFunctionCategory;
  readonly degree?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly chromaticAlter?: number;
  readonly absoluteOffset?: number;
  readonly quality: BaseChordQuality;
  readonly variant?: HarmonicVariant;
  readonly position: { readonly column: number; readonly row: number };
  readonly baseline?: boolean;
}

const DIM7: HarmonicVariant = Object.freeze({ seventh: "diminished7", extensions: Object.freeze([]), suspensions: Object.freeze([]), alterations: Object.freeze([]) });

export const DARK_HARMONY_CORE_FUNCTIONS: readonly DarkFunctionSpec[] = [
  { id: "i", layerId: "tonal-minor-core", category: "core", degree: 1, quality: "minor", position: { column: 0, row: 1 }, baseline: true },
  { id: "ii°", layerId: "tonal-minor-core", category: "core", degree: 2, quality: "diminished", position: { column: 1, row: 1 }, baseline: true },
  { id: "III", layerId: "tonal-minor-core", category: "core", degree: 3, quality: "major", position: { column: 2, row: 1 }, baseline: true },
  { id: "iv", layerId: "tonal-minor-core", category: "core", degree: 4, quality: "minor", position: { column: 3, row: 1 }, baseline: true },
  { id: "V", layerId: "tonal-minor-core", category: "core", degree: 5, quality: "major", position: { column: 4, row: 1 }, baseline: true },
  { id: "VI", layerId: "tonal-minor-core", category: "core", degree: 6, quality: "major", position: { column: 5, row: 1 }, baseline: true },
  { id: "vii°", layerId: "tonal-minor-core", category: "core", degree: 7, chromaticAlter: 1, quality: "diminished", position: { column: 6, row: 1 }, baseline: true },
];

export const DARK_HARMONY_NATURAL_VARIANTS: readonly DarkFunctionSpec[] = [
  { id: "v", layerId: "tonal-minor-core", category: "core", degree: 5, quality: "minor", position: { column: 4, row: 1 } },
  { id: "VII", layerId: "tonal-minor-core", category: "core", degree: 7, quality: "major", position: { column: 6, row: 1 } },
];

export const DARK_HARMONY_COLOR_FUNCTIONS: readonly DarkFunctionSpec[] = [
  { id: "N6", layerId: "chromatic-colors", category: "neapolitan", degree: 2, chromaticAlter: -1, quality: "major", position: { column: 1, row: 2 }, baseline: true },
  { id: "CT°7", layerId: "chromatic-colors", category: "chromatic-color", degree: 1, quality: "diminished", variant: DIM7, position: { column: 2, row: 2 }, baseline: true },
  { id: "Pass°7", layerId: "chromatic-colors", category: "chromatic-color", degree: 4, chromaticAlter: 1, quality: "diminished", variant: DIM7, position: { column: 3, row: 2 }, baseline: true },
  { id: "ChrMed+M3", layerId: "chromatic-colors", category: "chromatic-color", absoluteOffset: 4, quality: "major", position: { column: 4, row: 2 }, baseline: true },
  { id: "ChrMed-m3↓", layerId: "chromatic-colors", category: "chromatic-color", absoluteOffset: -3, quality: "major", position: { column: 5, row: 2 }, baseline: true },
];

const BASELINE_SECONDARY_TARGETS = ["V", "iv", "VI"] as const;

function identity(id: string, category: HarmonicFunctionCategory, targetFunctionId?: string): HarmonicFunctionIdentity {
  return targetFunctionId
    ? { moduleId: "dark-harmony", functionId: id, category, targetFunctionId }
    : { moduleId: "dark-harmony", functionId: id, category };
}

function targetRoot(functionId: string, tonic: PitchClassIdentity): { readonly pc: number; readonly spelling: PitchSpelling } {
  const spec = [...DARK_HARMONY_CORE_FUNCTIONS, ...DARK_HARMONY_NATURAL_VARIANTS].find((item) => item.id === functionId);
  if (!spec?.degree) throw new RangeError(`Unsupported Dark Harmony target: ${functionId}`);
  const spelling = spellScaleDegree(tonic, "tonal-minor", spec.degree, spec.chromaticAlter ?? 0);
  return { pc: spellingToPitchClass(spelling), spelling };
}

export function secondaryDiminishedFunction(targetFunctionId: string): HarmonicFunctionIdentity {
  return identity(`vii°7/${targetFunctionId}`, "secondary-diminished", targetFunctionId);
}

export function supportedSecondaryDiminishedTargets(): readonly string[] {
  return Object.freeze(DARK_HARMONY_CORE_FUNCTIONS.map((item) => item.id));
}

export function baselineSecondaryDiminishedFunctions(): readonly HarmonicFunctionIdentity[] {
  return Object.freeze(BASELINE_SECONDARY_TARGETS.map((target) => secondaryDiminishedFunction(target)));
}

export const DARK_HARMONY_MODULE = {
  id: "dark-harmony",
  mode: "tonal-minor",
  coreLayerId: "tonal-minor-core",
  rulesetId: "dark-harmony-v1",
  layers: Object.freeze([
    { id: "secondary-diminished", label: "Secondary Diminished", kind: "functional" as const, defaultVisible: true },
    { id: "tonal-minor-core", label: "Tonal Minor Core", kind: "core" as const, defaultVisible: true },
    { id: "chromatic-colors", label: "Neapolitan / Chromatic Colors", kind: "functional" as const, defaultVisible: true },
  ]),
  topology: Object.freeze({
    cards: Object.freeze([
      ...baselineSecondaryDiminishedFunctions().map((item, index) => ({ identity: item, layerId: "secondary-diminished", position: { column: index + 2, row: 0 }, baseline: true })),
      ...DARK_HARMONY_CORE_FUNCTIONS.map((spec) => ({ identity: identity(spec.id, spec.category), layerId: spec.layerId, position: spec.position, baseline: true })),
      ...DARK_HARMONY_COLOR_FUNCTIONS.map((spec) => ({ identity: identity(spec.id, spec.category), layerId: spec.layerId, position: spec.position, baseline: true })),
    ]),
    routes: Object.freeze([]),
  }),
} satisfies HarmonicModuleDefinition;

function getDarkSpec(functionId: string): DarkFunctionSpec | undefined {
  return [...DARK_HARMONY_CORE_FUNCTIONS, ...DARK_HARMONY_NATURAL_VARIANTS, ...DARK_HARMONY_COLOR_FUNCTIONS].find((item) => item.id === functionId);
}

export function realizeDarkHarmonyChord(functionId: string, tonic: PitchClassIdentity): ChordDefinition {
  if (functionId.startsWith("vii°7/")) {
    const target = functionId.slice("vii°7/".length);
    const root = normalizePitchClass(targetRoot(target, tonic).pc - 1);
    const rootSpelling = defaultTonicSpelling(root, "tonal-minor");
    return { harmonicFunction: secondaryDiminishedFunction(target), rootPitchClass: root, baseQuality: "diminished", variant: DIM7, spelling: { root: rootSpelling, symbol: `${formatPitchSpelling(rootSpelling)}°7` } };
  }
  const spec = getDarkSpec(functionId);
  if (!spec) throw new RangeError(`Unsupported Dark Harmony function: ${functionId}`);
  let rootSpelling: PitchSpelling;
  if (spec.absoluteOffset !== undefined) {
    rootSpelling = defaultTonicSpelling(normalizePitchClass(tonic + spec.absoluteOffset), "tonal-minor");
  } else {
    rootSpelling = spellScaleDegree(tonic, "tonal-minor", spec.degree!, spec.chromaticAlter ?? 0);
  }
  const suffix = spec.id === "N6" ? "" : spec.variant?.seventh === "diminished7" ? "°7" : "";
  return {
    harmonicFunction: identity(spec.id, spec.category),
    rootPitchClass: spellingToPitchClass(rootSpelling),
    baseQuality: spec.quality,
    variant: spec.variant ?? EMPTY_HARMONIC_VARIANT,
    spelling: { root: rootSpelling, symbol: `${formatPitchSpelling(rootSpelling)}${suffix}` },
  };
}
