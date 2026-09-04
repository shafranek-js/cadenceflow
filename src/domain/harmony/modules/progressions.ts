import { EMPTY_HARMONIC_VARIANT, type BaseChordQuality, type ChordDefinition } from "../chord";
import type { HarmonicFunctionCategory, HarmonicFunctionIdentity } from "../functions";
import { normalizePitchClass, type PitchClassIdentity } from "../pitch";
import { formatPitchSpelling, spellScaleDegree, spellingToPitchClass } from "../spelling";
import type { HarmonicModuleDefinition } from "./types";

interface FunctionSpec {
  readonly id: string;
  readonly layerId: string;
  readonly category: HarmonicFunctionCategory;
  readonly degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly chromaticAlter?: number;
  readonly quality: BaseChordQuality;
  readonly targetFunctionId?: string;
  readonly position: { readonly column: number; readonly row: number };
}

export const PROGRESSIONS_FUNCTIONS: readonly FunctionSpec[] = [
  // Secondary dominants
  {
    id: "V7/ii",
    layerId: "secondary-dominants",
    category: "secondary-dominant",
    degree: 6,
    quality: "dominant",
    targetFunctionId: "ii",
    position: { column: 1, row: 0 },
  },
  {
    id: "V7/iii",
    layerId: "secondary-dominants",
    category: "secondary-dominant",
    degree: 7,
    quality: "dominant",
    targetFunctionId: "iii",
    position: { column: 2, row: 0 },
  },
  {
    id: "V7/IV",
    layerId: "secondary-dominants",
    category: "secondary-dominant",
    degree: 1,
    quality: "dominant",
    targetFunctionId: "IV",
    position: { column: 3, row: 0 },
  },
  {
    id: "V7/V",
    layerId: "secondary-dominants",
    category: "secondary-dominant",
    degree: 2,
    quality: "dominant",
    targetFunctionId: "V",
    position: { column: 4, row: 0 },
  },
  {
    id: "V7/vi",
    layerId: "secondary-dominants",
    category: "secondary-dominant",
    degree: 3,
    quality: "dominant",
    targetFunctionId: "vi",
    position: { column: 5, row: 0 },
  },
  // Diatonic core; visual order follows the CadenceFlow concept.
  {
    id: "I",
    layerId: "diatonic-core",
    category: "core",
    degree: 1,
    quality: "major",
    position: { column: 0, row: 1 },
  },
  {
    id: "vi",
    layerId: "diatonic-core",
    category: "core",
    degree: 6,
    quality: "minor",
    position: { column: 1, row: 1 },
  },
  {
    id: "IV",
    layerId: "diatonic-core",
    category: "core",
    degree: 4,
    quality: "major",
    position: { column: 2, row: 1 },
  },
  {
    id: "ii",
    layerId: "diatonic-core",
    category: "core",
    degree: 2,
    quality: "minor",
    position: { column: 3, row: 1 },
  },
  {
    id: "V",
    layerId: "diatonic-core",
    category: "core",
    degree: 5,
    quality: "major",
    position: { column: 4, row: 1 },
  },
  {
    id: "iii",
    layerId: "diatonic-core",
    category: "core",
    degree: 3,
    quality: "minor",
    position: { column: 5, row: 1 },
  },
  {
    id: "vii°",
    layerId: "diatonic-core",
    category: "core",
    degree: 7,
    quality: "diminished",
    position: { column: 6, row: 1 },
  },
  // Modal interchange from parallel minor.
  {
    id: "bIII",
    layerId: "modal-interchange",
    category: "modal-interchange",
    degree: 3,
    chromaticAlter: -1,
    quality: "major",
    position: { column: 1, row: 2 },
  },
  {
    id: "bVI",
    layerId: "modal-interchange",
    category: "modal-interchange",
    degree: 6,
    chromaticAlter: -1,
    quality: "major",
    position: { column: 2, row: 2 },
  },
  {
    id: "iv",
    layerId: "modal-interchange",
    category: "modal-interchange",
    degree: 4,
    quality: "minor",
    position: { column: 3, row: 2 },
  },
  {
    id: "bVII",
    layerId: "modal-interchange",
    category: "modal-interchange",
    degree: 7,
    chromaticAlter: -1,
    quality: "major",
    position: { column: 4, row: 2 },
  },
];

function identity(spec: FunctionSpec): HarmonicFunctionIdentity {
  return spec.targetFunctionId
    ? {
        moduleId: "progressions",
        functionId: spec.id,
        category: spec.category,
        targetFunctionId: spec.targetFunctionId,
      }
    : { moduleId: "progressions", functionId: spec.id, category: spec.category };
}

export const PROGRESSIONS_MODULE = {
  id: "progressions",
  mode: "major",
  coreLayerId: "diatonic-core",
  rulesetId: "progressions-v1",
  layers: Object.freeze([
    {
      id: "secondary-dominants",
      label: "Secondary Dominants",
      kind: "functional",
      defaultVisible: true,
    },
    { id: "diatonic-core", label: "Diatonic Core", kind: "core", defaultVisible: true },
    {
      id: "modal-interchange",
      label: "Modal Interchange",
      kind: "functional",
      defaultVisible: true,
    },
  ]),
  topology: Object.freeze({
    cards: Object.freeze(
      PROGRESSIONS_FUNCTIONS.map((spec) => ({
        identity: identity(spec),
        layerId: spec.layerId,
        position: spec.position,
        baseline: true,
      })),
    ),
    routes: Object.freeze([]),
  }),
} satisfies HarmonicModuleDefinition;

export function getProgressionsFunction(functionId: string): FunctionSpec {
  const spec = PROGRESSIONS_FUNCTIONS.find((candidate) => candidate.id === functionId);
  if (!spec) throw new RangeError(`Unsupported Progressions function: ${functionId}`);
  return spec;
}

export function realizeProgressionsChord(
  functionId: string,
  tonic: PitchClassIdentity,
): ChordDefinition {
  const spec = getProgressionsFunction(functionId);
  let rootSpelling;
  if (spec.category === "secondary-dominant") {
    const target = getProgressionsFunction(spec.targetFunctionId!);
    const targetRoot = normalizePitchClass(tonic + [0, 2, 4, 5, 7, 9, 11][target.degree - 1]!);
    rootSpelling = spellScaleDegree(targetRoot, "major", 5);
  } else {
    rootSpelling = spellScaleDegree(tonic, "major", spec.degree, spec.chromaticAlter ?? 0);
  }
  return {
    harmonicFunction: identity(spec),
    rootPitchClass: spellingToPitchClass(rootSpelling),
    baseQuality: spec.quality,
    variant: EMPTY_HARMONIC_VARIANT,
    spelling: { root: rootSpelling, symbol: formatPitchSpelling(rootSpelling) },
  };
}
