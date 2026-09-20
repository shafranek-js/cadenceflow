import type { HarmonicFunctionIdentity, HarmonicModuleId } from "./functions";
import {
  DARK_HARMONY_MODULE,
  secondaryDiminishedFunction,
  supportedSecondaryDiminishedTargets,
} from "./modules/darkHarmony";
import { PROGRESSIONS_MODULE } from "./modules/progressions";
import type { HarmonicModuleDefinition } from "./modules/types";
import {
  canonicalDiminishedFunctionId,
  getDiminishedAliasGroup,
  type MatrixCardTopologyEntry,
} from "./topology";

export function getHarmonicModule(moduleId: HarmonicModuleId): HarmonicModuleDefinition {
  return moduleId === "progressions" ? PROGRESSIONS_MODULE : DARK_HARMONY_MODULE;
}

export function baselineFunctionIdentities(
  moduleId: HarmonicModuleId,
): readonly HarmonicFunctionIdentity[] {
  return Object.freeze(
    getHarmonicModule(moduleId)
      .topology.cards.filter((entry) => entry.baseline)
      .map((entry) => entry.identity),
  );
}

/**
 * Candidate vocabulary for recommendation ranking. The Matrix may expose only a
 * stable baseline; contextual functions are promoted separately without moving
 * baseline cards.
 */
export function recommendationVocabulary(
  moduleId: HarmonicModuleId,
): readonly HarmonicFunctionIdentity[] {
  const baseline = baselineFunctionIdentities(moduleId);
  if (moduleId === "progressions") return baseline;
  const existing = new Set(baseline.map((identity) => identity.functionId));
  const contextual = supportedSecondaryDiminishedTargets()
    .map((target) => secondaryDiminishedFunction(target))
    .filter((identity) => !existing.has(identity.functionId));
  return Object.freeze([...baseline, ...contextual]);
}

/**
 * Resolves the stable semantic Matrix entry for a visible or contextual card.
 * Dynamic secondary-diminished and tritone-substitute cards inherit the target
 * column instead of asking the UI to infer it from a label.
 */
export function topologyEntryForFunction(
  moduleId: HarmonicModuleId,
  functionId: string,
): MatrixCardTopologyEntry | undefined {
  const module = getHarmonicModule(moduleId);
  const canonicalId = canonicalDiminishedFunctionId(functionId);
  const direct = module.topology.cards.find(
    (entry) =>
      entry.identity.functionId === canonicalId || entry.identity.functionId === functionId,
  );
  if (direct) return direct;

  if (moduleId === "dark-harmony" && canonicalId.startsWith("vii°7/")) {
    const targetId = canonicalId.slice("vii°7/".length);
    const target = module.topology.cards.find(
      (entry) => entry.identity.functionId === targetId && entry.layerId === "tonal-minor-core",
    );
    if (!target) return undefined;
    const aliases = getDiminishedAliasGroup(canonicalId)?.aliases;
    return Object.freeze({
      identity: {
        moduleId,
        functionId: canonicalId,
        category: "secondary-diminished" as const,
        targetFunctionId: targetId,
        targetId,
        mixPolicy: "must-resolve" as const,
      },
      layerId: "secondary-diminished",
      position: Object.freeze({ column: target.position.column, row: 0 }),
      baseline: false,
      mixPolicy: "must-resolve",
      targetId,
      ...(aliases ? { aliases } : {}),
    });
  }

  if (moduleId === "progressions" && functionId.startsWith("subV7/")) {
    const targetId = functionId.slice("subV7/".length);
    const target = module.topology.cards.find(
      (entry) => entry.identity.functionId === targetId && entry.layerId === "diatonic-core",
    );
    if (!target) return undefined;
    return Object.freeze({
      identity: {
        moduleId,
        functionId,
        category: "secondary-dominant" as const,
        targetFunctionId: targetId,
        targetId,
        mixPolicy: "must-resolve" as const,
      },
      layerId: "secondary-dominants",
      position: Object.freeze({ column: target.position.column, row: 0 }),
      baseline: false,
      mixPolicy: "must-resolve",
      targetId,
      auxiliary: true,
    });
  }

  return undefined;
}
