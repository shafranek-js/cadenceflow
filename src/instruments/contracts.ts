import type { ChordDefinition } from "../domain/harmony/chord";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { ExactPitch } from "../domain/harmony/pitch";
import type { StepPerformance, CardViewId } from "../domain/progression/step";

export interface ValidationResult {
  readonly valid: boolean;
  readonly messages: readonly string[];
}

export interface CardViewDescriptor {
  readonly id: CardViewId | string;
  readonly label: string;
}

export interface ArticulationDescriptor {
  readonly id: string;
  readonly label: string;
}

export interface InstrumentRealizationInput {
  readonly context: HarmonicContext;
  readonly chord: ChordDefinition;
  readonly performance: StepPerformance;
  readonly previousPitches?: readonly ExactPitch[];
  readonly nextPitches?: readonly ExactPitch[];
}

export interface InstrumentRealization {
  readonly pitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch;
}

export interface InstrumentProfile {
  readonly id: string;
  readonly displayName: string;
  realizeChord(input: InstrumentRealizationInput): InstrumentRealization;
  validateManualVoicing(pitches: readonly ExactPitch[]): ValidationResult;
  supportedCardViews(): readonly CardViewDescriptor[];
  supportedArticulations(): readonly ArticulationDescriptor[];
}
