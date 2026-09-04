import type { HarmonicFunctionIdentity, HarmonicModuleId } from "./functions";
import {
  DARK_HARMONY_MODULE,
  secondaryDiminishedFunction,
  supportedSecondaryDiminishedTargets,
} from "./modules/darkHarmony";
import { PROGRESSIONS_MODULE } from "./modules/progressions";
import type { HarmonicModuleDefinition } from "./modules/types";

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
