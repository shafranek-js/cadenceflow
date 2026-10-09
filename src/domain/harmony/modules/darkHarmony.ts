import {
  EMPTY_HARMONIC_VARIANT,
  type BaseChordQuality,
  type ChordDefinition,
  type HarmonicVariant,
} from "../chord";
import type {
  HarmonicFunctionCategory,
  HarmonicFunctionIdentity,
  MatrixMixPolicy,
} from "../functions";
import { normalizePitchClass, type PitchClassIdentity, type PitchSpelling } from "../pitch";
import {
  defaultTonicSpelling,
  formatPitchSpelling,
  spellLeadingTone,
  spellScaleDegree,
  spellingToPitchClass,
} from "../spelling";
import type { MatrixPole } from "../topology";
import { getDiminishedAliasGroup } from "../topology";
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
  readonly targetId?: string;
  readonly mixPolicy?: MatrixMixPolicy;
  readonly bassScaleDegree?: number;
  readonly pole?: MatrixPole;
  readonly position: { readonly column: number; readonly row: number };
  readonly baseline?: boolean;
  readonly auxiliary?: boolean;
}

const DIM7: HarmonicVariant = Object.freeze({
  seventh: "diminished7",
  extensions: Object.freeze([]),
  suspensions: Object.freeze([]),
  alterations: Object.freeze([]),
});

export const DARK_HARMONY_CORE_FUNCTIONS: readonly DarkFunctionSpec[] = [
  {
    id: "i",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 1,
    quality: "minor",
    position: { column: 0, row: 1 },
    baseline: true,
  },
  {
    id: "ii°",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 2,
    quality: "diminished",
    position: { column: 1, row: 1 },
    baseline: true,
  },
  {
    id: "III",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 3,
    quality: "major",
    position: { column: 2, row: 1 },
    baseline: true,
  },
  {
    id: "iv",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 4,
    quality: "minor",
    position: { column: 3, row: 1 },
    baseline: true,
  },
  {
    id: "V",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 5,
    quality: "major",
    position: { column: 4, row: 1 },
    baseline: true,
  },
  {
    id: "VI",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 6,
    quality: "major",
    position: { column: 5, row: 1 },
    baseline: true,
  },
  {
    id: "vii°",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 7,
    chromaticAlter: 1,
    quality: "diminished",
    targetId: "i",
    mixPolicy: "must-resolve",
    position: { column: 6, row: 1 },
    baseline: true,
  },
];

export const DARK_HARMONY_NATURAL_VARIANTS: readonly DarkFunctionSpec[] = [
  {
    id: "v",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 5,
    quality: "minor",
    position: { column: 4, row: 1 },
  },
  {
    id: "VII",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 7,
    quality: "major",
    position: { column: 6, row: 1 },
  },
  // Minor-mode degrees whose quality differs from natural minor. These are not placed in
  // the Matrix topology: they exist so the Modes Explorer can materialize and audibly
  // match the chords it previews. `computeModalChords` derives minor-variant chords from
  // the scale intervals, while Apply goes through a functional identity, so without these
  // entries the two disagreed: harmonic-minor degree 5 previewed as E7 (raised leading
  // tone) but applied as Em7, losing the dominant seventh that defines the mode.
  {
    id: "III+",
    layerId: "tonal-minor-core",
    category: "core",
    // Degree 3 of natural minor IS the mode's major third above the tonic, and the
    // `tonal-minor` spelling reference already flattens degree 3 to it. An absolute offset
    // is used instead of `chromaticAlter: 1` because that would raise the already-flattened
    // degree and spell the root a semitone too high (C# rather than C in A minor).
    absoluteOffset: 3,
    quality: "augmented",
    auxiliary: true,
    position: { column: 2, row: 1 },
  },
  {
    id: "IV",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 4,
    quality: "major",
    auxiliary: true,
    position: { column: 3, row: 1 },
  },
  {
    id: "vi°",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 6,
    chromaticAlter: 1,
    quality: "diminished",
    targetId: "V",
    mixPolicy: "must-resolve",
    auxiliary: true,
    position: { column: 5, row: 1 },
  },
  // Melodic minor raises the 6th as well, so its ii becomes a plain minor triad and its IV
  // a major triad with a major seventh. Both live on the free row-2 column slots.
  {
    id: "ii",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 2,
    quality: "minor",
    auxiliary: true,
    position: { column: 1, row: 2 },
  },
  {
    id: "IV7",
    layerId: "tonal-minor-core",
    category: "core",
    degree: 4,
    quality: "major",
    variant: Object.freeze({
      seventh: "major7" as const,
      extensions: Object.freeze([]),
      suspensions: Object.freeze([]),
      alterations: Object.freeze([]),
    }),
    auxiliary: true,
    position: { column: 3, row: 2 },
  },
];

export const DARK_HARMONY_COLOR_FUNCTIONS: readonly DarkFunctionSpec[] = [
  {
    id: "N6",
    layerId: "chromatic-colors",
    category: "neapolitan",
    degree: 2,
    chromaticAlter: -1,
    quality: "major",
    targetId: "V",
    mixPolicy: "must-resolve",
    bassScaleDegree: 4,
    pole: "dominant",
    position: { column: 4, row: 2 },
    baseline: true,
  },
  {
    id: "CT°7",
    layerId: "chromatic-colors",
    category: "chromatic-color",
    degree: 1,
    quality: "diminished",
    variant: DIM7,
    targetId: "i",
    mixPolicy: "must-resolve",
    pole: "dominant",
    position: { column: 0, row: 2 },
    baseline: true,
  },
  {
    id: "Pass°7",
    layerId: "chromatic-colors",
    category: "chromatic-color",
    degree: 4,
    chromaticAlter: 1,
    quality: "diminished",
    variant: DIM7,
    targetId: "V",
    mixPolicy: "must-resolve",
    pole: "dominant",
    position: { column: 3, row: 2 },
    baseline: true,
  },
  {
    id: "ChrMed+M3",
    layerId: "chromatic-colors",
    category: "chromatic-color",
    absoluteOffset: 4,
    quality: "major",
    position: { column: 2, row: 2 },
    baseline: true,
  },
  {
    id: "ChrMed-m3↓",
    layerId: "chromatic-colors",
    category: "chromatic-color",
    absoluteOffset: -3,
    quality: "major",
    position: { column: 5, row: 2 },
    baseline: true,
  },
];

const BASELINE_SECONDARY_TARGETS = ["V", "iv", "VI"] as const;

function identity(
  id: string,
  category: HarmonicFunctionCategory,
  targetFunctionId?: string,
  semantic?: Pick<DarkFunctionSpec, "mixPolicy" | "targetId" | "bassScaleDegree">,
): HarmonicFunctionIdentity {
  const targetId = semantic?.targetId ?? targetFunctionId;
  return {
    moduleId: "dark-harmony",
    functionId: id,
    category,
    ...(targetId ? { targetFunctionId: targetId, targetId } : {}),
    mixPolicy: semantic?.mixPolicy ?? (targetId ? "must-resolve" : "mix-freely"),
    ...(semantic?.bassScaleDegree !== undefined
      ? { bassScaleDegree: semantic.bassScaleDegree }
      : {}),
  };
}

function targetRoot(
  functionId: string,
  tonic: PitchClassIdentity,
): { readonly pc: number; readonly spelling: PitchSpelling } {
  const spec = [...DARK_HARMONY_CORE_FUNCTIONS, ...DARK_HARMONY_NATURAL_VARIANTS].find(
    (item) => item.id === functionId,
  );
  if (!spec?.degree) throw new RangeError(`Unsupported Dark Harmony target: ${functionId}`);
  const spelling = spellScaleDegree(tonic, "tonal-minor", spec.degree, spec.chromaticAlter ?? 0);
  return { pc: spellingToPitchClass(spelling), spelling };
}

export function secondaryDiminishedFunction(targetFunctionId: string): HarmonicFunctionIdentity {
  return identity(`vii°7/${targetFunctionId}`, "secondary-diminished", targetFunctionId, {
    mixPolicy: "must-resolve",
  });
}

export function supportedSecondaryDiminishedTargets(): readonly string[] {
  return Object.freeze(DARK_HARMONY_CORE_FUNCTIONS.map((item) => item.id));
}

export function baselineSecondaryDiminishedFunctions(): readonly HarmonicFunctionIdentity[] {
  return Object.freeze(
    BASELINE_SECONDARY_TARGETS.map((target) => secondaryDiminishedFunction(target)),
  );
}

export const DARK_HARMONY_MODULE = {
  id: "dark-harmony",
  mode: "tonal-minor",
  coreLayerId: "tonal-minor-core",
  rulesetId: "dark-harmony-v1",
  layers: Object.freeze([
    {
      id: "secondary-diminished",
      label: "Secondary Diminished",
      kind: "functional" as const,
      defaultVisible: true,
    },
    {
      id: "tonal-minor-core",
      label: "Tonal Minor Core",
      zoneLabel: "Main Chords",
      kind: "core" as const,
      defaultVisible: true,
    },
    {
      id: "chromatic-colors",
      label: "Neapolitan / Chromatic Colors",
      kind: "functional" as const,
      defaultVisible: true,
    },
  ]),
  topology: Object.freeze({
    columnCount: 6,
    columnLabels: Object.freeze(["i", "ii°", "III", "iv", "V", "VI"]),
    cards: Object.freeze([
      ...baselineSecondaryDiminishedFunctions().map((item) => {
        const target = item.targetId ?? item.targetFunctionId;
        const targetSpec = DARK_HARMONY_CORE_FUNCTIONS.find((spec) => spec.id === target);
        if (!target || !targetSpec) {
          throw new RangeError(`Missing stable Dark Harmony target for ${item.functionId}`);
        }
        const aliases = getDiminishedAliasGroup(item.functionId)?.aliases;
        return {
          identity: item,
          layerId: "secondary-diminished",
          position: { column: targetSpec.position.column, row: 0 },
          baseline: true,
          mixPolicy: "must-resolve" as const,
          targetId: target,
          ...(target === "V" || target === "iv" || target === "VI"
            ? { pole: target === "V" ? ("dominant" as const) : ("subdominant" as const) }
            : {}),
          ...(aliases ? { aliases } : {}),
        };
      }),
      ...DARK_HARMONY_CORE_FUNCTIONS.map((spec) => ({
        identity: identity(spec.id, spec.category, undefined, spec),
        layerId: spec.layerId,
        position: spec.position,
        baseline: spec.baseline ?? true,
        mixPolicy: spec.mixPolicy ?? "mix-freely",
        ...(spec.auxiliary ? { auxiliary: true } : {}),
        ...(spec.pole ? { pole: spec.pole } : {}),
      })),
      ...DARK_HARMONY_COLOR_FUNCTIONS.map((spec) => {
        const aliases = getDiminishedAliasGroup(spec.id)?.aliases;
        return {
          identity: identity(spec.id, spec.category, undefined, spec),
          layerId: spec.layerId,
          position: spec.position,
          baseline: true,
          mixPolicy: spec.mixPolicy ?? "mix-freely",
          ...(spec.targetId ? { targetId: spec.targetId } : {}),
          ...(spec.bassScaleDegree !== undefined ? { bassScaleDegree: spec.bassScaleDegree } : {}),
          ...(spec.pole ? { pole: spec.pole } : {}),
          ...(aliases ? { aliases } : {}),
        };
      }),
    ]),
    routes: Object.freeze([]),
  }),
} satisfies HarmonicModuleDefinition;

function getDarkSpec(functionId: string): DarkFunctionSpec | undefined {
  return [
    ...DARK_HARMONY_CORE_FUNCTIONS,
    ...DARK_HARMONY_NATURAL_VARIANTS,
    ...DARK_HARMONY_COLOR_FUNCTIONS,
  ].find((item) => item.id === functionId);
}

export function realizeDarkHarmonyChord(
  functionId: string,
  tonic: PitchClassIdentity,
): ChordDefinition {
  const canonicalFunctionId = getDiminishedAliasGroup(functionId)?.canonicalId ?? functionId;
  if (canonicalFunctionId.startsWith("vii°7/")) {
    const target = canonicalFunctionId.slice("vii°7/".length);
    const targetInfo = targetRoot(target, tonic);
    const rootSpelling = spellLeadingTone(targetInfo.spelling);
    const root = spellingToPitchClass(rootSpelling);
    return {
      harmonicFunction: secondaryDiminishedFunction(target),
      rootPitchClass: root,
      baseQuality: "diminished",
      variant: DIM7,
      spelling: { root: rootSpelling, symbol: `${formatPitchSpelling(rootSpelling)}°7` },
    };
  }
  const spec = getDarkSpec(canonicalFunctionId);
  if (!spec) throw new RangeError(`Unsupported Dark Harmony function: ${functionId}`);
  let rootSpelling: PitchSpelling;
  if (spec.absoluteOffset !== undefined) {
    rootSpelling = defaultTonicSpelling(
      normalizePitchClass(tonic + spec.absoluteOffset),
      "tonal-minor",
    );
  } else {
    rootSpelling = spellScaleDegree(tonic, "tonal-minor", spec.degree!, spec.chromaticAlter ?? 0);
  }
  const suffix = spec.id === "N6" ? "" : spec.variant?.seventh === "diminished7" ? "°7" : "";
  return {
    harmonicFunction: identity(spec.id, spec.category, undefined, spec),
    rootPitchClass: spellingToPitchClass(rootSpelling),
    baseQuality: spec.quality,
    variant: spec.variant ?? EMPTY_HARMONIC_VARIANT,
    spelling: { root: rootSpelling, symbol: `${formatPitchSpelling(rootSpelling)}${suffix}` },
    ...(spec.bassScaleDegree === 4
      ? (() => {
          const bassSpelling = spellScaleDegree(tonic, "tonal-minor", 4);
          return {
            bassScaleDegree: 4,
            bassPitchClass: spellingToPitchClass(bassSpelling),
            bassSpelling,
          };
        })()
      : {}),
  };
}
