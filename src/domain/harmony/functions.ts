export type HarmonicModuleId = "progressions" | "dark-harmony";
export type DerivedMode = "major" | "tonal-minor";

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
}

export function modeForModule(moduleId: HarmonicModuleId): DerivedMode {
  return moduleId === "progressions" ? "major" : "tonal-minor";
}

export function harmonicFunctionKey(identity: HarmonicFunctionIdentity): string {
  return `${identity.moduleId}:${identity.functionId}${identity.targetFunctionId ? `>${identity.targetFunctionId}` : ""}`;
}
