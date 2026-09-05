import type { HarmonicFunctionIdentity } from "../harmony/functions";
import type { DurationDisplayHint, MusicalDuration } from "../timing/duration";
import type { Progression } from "./progression";
import type { ChordStep } from "./step";
import type { HarmonicContext } from "../harmony/modules/types";
import type { ProjectDefaults } from "../project/defaults";
import type { ModuleSwitchResolution } from "../harmony/moduleSwitch";

export type PresetSource = "builtIn" | "custom";

export interface PresetStep {
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly duration: MusicalDuration;
}

export interface FunctionalPreset {
  readonly id: string;
  readonly name: string;
  readonly source: PresetSource;
  readonly description?: string;
  readonly steps: readonly PresetStep[];
}

export type PresetApplyMode = "replace" | "append" | "insert";

export interface SerializablePresetStep {
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly duration: {
    readonly beats: { readonly numerator: number; readonly denominator: number };
    readonly displayHint?: DurationDisplayHint;
  };
}

export interface SerializablePreset {
  readonly id: string;
  readonly name: string;
  readonly source: PresetSource;
  readonly description?: string;
  readonly steps: readonly SerializablePresetStep[];
}

export type SaveCustomPresetResult =
  | { readonly kind: "success"; readonly preset: FunctionalPreset }
  | {
      readonly kind: "unsupported-progression";
      readonly reason: "rest-step";
      readonly message: string;
    };

export type PresetRealizationResult =
  | { readonly kind: "success"; readonly steps: readonly ChordStep[] }
  | {
      readonly kind: "incompatible";
      readonly unsupportedFunctions: readonly HarmonicFunctionIdentity[];
    }
  | {
      readonly kind: "ambiguous";
      readonly ambiguousSteps: readonly {
        readonly stepIndex: number;
        readonly resolution: ModuleSwitchResolution;
      }[];
    };

export function createFunctionalPreset(
  _id: string,
  _name: string,
  _source: PresetSource,
  _steps: readonly PresetStep[],
  _description?: string,
): FunctionalPreset {
  throw new Error("Not implemented: T113 createFunctionalPreset");
}

export function serializePreset(_preset: FunctionalPreset): string {
  throw new Error("Not implemented: T113 serializePreset");
}

export function deserializePreset(_json: string): FunctionalPreset {
  throw new Error("Not implemented: T113 deserializePreset");
}

export function saveCustomPresetFromProgression(
  _name: string,
  _progression: Progression,
  _options?: { readonly id?: string; readonly description?: string },
): SaveCustomPresetResult {
  throw new Error("Not implemented: T115 saveCustomPresetFromProgression");
}

export function realizePresetSteps(
  _preset: FunctionalPreset,
  _context: HarmonicContext,
  _defaults?: ProjectDefaults,
): PresetRealizationResult {
  throw new Error("Not implemented: T113 realizePresetSteps");
}

export function applyPresetToProgression(
  _progression: Progression,
  _preset: FunctionalPreset,
  _mode: PresetApplyMode,
  _context: HarmonicContext,
  _defaults?: ProjectDefaults,
): Progression {
  throw new Error("Not implemented: T116 applyPresetToProgression");
}
