export type HarmonicModuleId = "progressions" | "dark-harmony";
export type DerivedMode = "major" | "tonal-minor";

export type HarmonicFunctionCategory =
  | "core"
  | "secondary-dominant"
  | "modal-interchange"
  | "secondary-diminished"
  | "neapolitan"
  | "chromatic-color";

export interface HarmonicFunctionIdentity {
  readonly moduleId: HarmonicModuleId;
  readonly functionId: string;
  readonly category: HarmonicFunctionCategory;
  readonly targetFunctionId?: string;
}

export function modeForModule(moduleId: HarmonicModuleId): DerivedMode {
  return moduleId === "progressions" ? "major" : "tonal-minor";
}

export function harmonicFunctionKey(identity: HarmonicFunctionIdentity): string {
  return `${identity.moduleId}:${identity.functionId}${identity.targetFunctionId ? `>${identity.targetFunctionId}` : ""}`;
}
