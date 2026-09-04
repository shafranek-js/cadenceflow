import type { HarmonicVariant } from "../harmony/chord";
import type { HarmonicModuleId } from "../harmony/functions";
import type { ExactPitch, PitchClassIdentity } from "../harmony/pitch";
import type { TemporaryBranch } from "../progression/branch";
import type { Progression } from "../progression/progression";
import type { CardViewId } from "../progression/step";
import type { GlobalTiming } from "../timing/meter";
import type { GrooveSettings } from "../timing/swing";
import { countStepCreationOverrides, type ProjectDefaults, type StepCreationOverrides } from "./defaults";

export type PresentationMode = "beginner" | "composer" | "expert";
export type ThemeMode = "dark" | "light";

export interface PresentationState {
  readonly expertiseMode: PresentationMode;
  readonly theme: ThemeMode;
  readonly globalMatrixCardView: CardViewId;
}

export interface MatrixCardTemplateState {
  readonly harmonicFunctionId: string;
  readonly explicitOverrides: StepCreationOverrides;
  readonly harmonicVariantOverride?: HarmonicVariant;
  readonly manualPreviewVoicing?: readonly ExactPitch[];
  readonly cardViewOverride?: CardViewId;
}

export interface ModuleTemplateState {
  readonly cards: Readonly<Record<string, MatrixCardTemplateState>>;
}

export interface CustomPresetRef {
  readonly id: string;
  readonly name: string;
}

export interface Project {
  readonly id: string;
  readonly schemaVersion: number;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeModule: HarmonicModuleId;
  readonly tonic: PitchClassIdentity;
  readonly globalTiming: GlobalTiming;
  readonly groove: GrooveSettings;
  readonly presentation: PresentationState;
  readonly defaults: ProjectDefaults;
  readonly moduleTemplateStates: Readonly<Record<HarmonicModuleId, ModuleTemplateState>>;
  readonly progression: Progression;
  readonly temporaryBranch?: TemporaryBranch;
  readonly customPresets: readonly CustomPresetRef[];
}

export function matrixCardOverrideCount(card?: MatrixCardTemplateState): number {
  if (!card) return 0;
  return countStepCreationOverrides(card.explicitOverrides)
    + (card.harmonicVariantOverride ? 1 : 0)
    + (card.manualPreviewVoicing ? 1 : 0)
    + (card.cardViewOverride ? 1 : 0);
}

export function matrixCardOverrideKeys(card?: MatrixCardTemplateState): readonly string[] {
  if (!card) return Object.freeze([]);
  const keys: string[] = [];
  if (card.explicitOverrides.duration) keys.push("duration");
  if (card.explicitOverrides.performance) keys.push(...Object.keys(card.explicitOverrides.performance));
  if (card.harmonicVariantOverride) keys.push("harmonic variant");
  if (card.manualPreviewVoicing) keys.push("manual preview voicing");
  if (card.cardViewOverride) keys.push("card view");
  return Object.freeze(keys);
}
