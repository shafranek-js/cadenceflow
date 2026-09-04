import type {
  HarmonicFunctionCategory,
  HarmonicFunctionIdentity,
  HarmonicModuleId,
} from "./functions";
import type { ProgressionStep } from "../progression/step";

const MAJOR_TO_MINOR: Readonly<Record<string, string>> = {
  I: "i",
  ii: "ii°",
  iii: "III",
  IV: "iv",
  V: "V",
  vi: "VI",
  "vii°": "vii°",
};
const MINOR_TO_MAJOR: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MAJOR_TO_MINOR).map(([major, minor]) => [minor, major]),
);

function categoryFor(functionId: string, moduleId: HarmonicModuleId): HarmonicFunctionCategory {
  if (moduleId === "progressions") {
    if (functionId.startsWith("V7/")) return "secondary-dominant";
    if (["bIII", "bVI", "iv", "bVII"].includes(functionId)) return "modal-interchange";
    return "core";
  }
  if (functionId.startsWith("vii°7/")) return "secondary-diminished";
  if (functionId === "N6") return "neapolitan";
  if (["CT°7", "Pass°7", "ChrMed+M3", "ChrMed-m3↓"].includes(functionId)) return "chromatic-color";
  return "core";
}

function identity(
  moduleId: HarmonicModuleId,
  functionId: string,
  targetFunctionId?: string,
): HarmonicFunctionIdentity {
  const category = categoryFor(functionId, moduleId);
  return targetFunctionId
    ? { moduleId, functionId, category, targetFunctionId }
    : { moduleId, functionId, category };
}

function curatedAlternatives(
  source: HarmonicFunctionIdentity,
  destinationModule: HarmonicModuleId,
): readonly HarmonicFunctionIdentity[] {
  if (destinationModule === "dark-harmony") {
    if (source.functionId.startsWith("V7/")) {
      const target = source.targetFunctionId;
      const mappedTarget = target ? MAJOR_TO_MINOR[target] : undefined;
      const options: HarmonicFunctionIdentity[] = [identity("dark-harmony", "V")];
      if (mappedTarget)
        options.push(identity("dark-harmony", `vii°7/${mappedTarget}`, mappedTarget));
      return Object.freeze(options);
    }
    const bySource: Readonly<Record<string, readonly string[]>> = {
      bIII: ["III", "ChrMed+M3"],
      bVI: ["VI", "N6"],
      iv: ["iv", "VI"],
      bVII: ["VII", "VI"],
    };
    return Object.freeze(
      (bySource[source.functionId] ?? ["i", "iv", "V"]).map((id) => identity("dark-harmony", id)),
    );
  }

  const bySource: Readonly<Record<string, readonly string[]>> = {
    N6: ["bVI", "IV"],
    "CT°7": ["I", "iv"],
    "Pass°7": ["V", "ii"],
    "ChrMed+M3": ["bIII", "vi"],
    "ChrMed-m3↓": ["bVI", "IV"],
  };
  if (source.functionId.startsWith("vii°7/")) {
    const target = source.targetFunctionId;
    const mappedTarget = target ? MINOR_TO_MAJOR[target] : undefined;
    return Object.freeze(
      mappedTarget
        ? [
            identity("progressions", `V7/${mappedTarget}`, mappedTarget),
            identity("progressions", mappedTarget),
          ]
        : [identity("progressions", "V"), identity("progressions", "ii")],
    );
  }
  return Object.freeze(
    (bySource[source.functionId] ?? ["I", "IV", "V"]).map((id) => identity("progressions", id)),
  );
}

export interface ModuleSwitchResolution {
  readonly stepId: string;
  readonly source: HarmonicFunctionIdentity;
  readonly automaticTarget?: HarmonicFunctionIdentity;
  readonly alternatives: readonly HarmonicFunctionIdentity[];
  readonly keepOriginalAllowed: true;
}

export interface ModuleSwitchPlan {
  readonly destinationModule: HarmonicModuleId;
  readonly resolutions: readonly ModuleSwitchResolution[];
  readonly hasAmbiguities: boolean;
}

export function mapFunctionAcrossModules(
  source: HarmonicFunctionIdentity,
  destinationModule: HarmonicModuleId,
): HarmonicFunctionIdentity | null {
  if (source.moduleId === destinationModule) return source;
  const map = destinationModule === "dark-harmony" ? MAJOR_TO_MINOR : MINOR_TO_MAJOR;
  const targetId = map[source.functionId];
  if (!targetId) return null;
  return identity(destinationModule, targetId);
}

export function planModuleSwitch(
  steps: readonly ProgressionStep[],
  destinationModule: HarmonicModuleId,
): ModuleSwitchPlan {
  const resolutions = steps.flatMap((step): ModuleSwitchResolution[] => {
    if (step.kind === "rest") return [];
    const target = mapFunctionAcrossModules(step.harmonicFunction, destinationModule);
    return [
      {
        stepId: step.id,
        source: step.harmonicFunction,
        ...(target
          ? { automaticTarget: target, alternatives: Object.freeze([target]) }
          : { alternatives: curatedAlternatives(step.harmonicFunction, destinationModule) }),
        keepOriginalAllowed: true,
      },
    ];
  });
  return {
    destinationModule,
    resolutions: Object.freeze(resolutions),
    hasAmbiguities: resolutions.some((item) => !item.automaticTarget),
  };
}
