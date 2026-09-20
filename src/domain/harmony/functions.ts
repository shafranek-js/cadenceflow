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
 * This is descriptive in T190. The strict recommendation blocking rules are
 * deliberately deferred to T191.
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
