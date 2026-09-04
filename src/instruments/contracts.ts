import type { ChordDefinition } from "../domain/harmony/chord";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { ExactPitch } from "../domain/harmony/pitch";
import type { StepPerformance, CardViewId } from "../domain/progression/step";

export const PIANO_RANGE_MIN_MIDI = 21; // A0
export const PIANO_RANGE_MAX_MIDI = 108; // C8

export type MusicalDynamicLabel = "pp" | "p" | "mp" | "mf" | "f" | "ff";

export const DEFAULT_MUSICAL_DYNAMIC_VELOCITIES: Readonly<Record<MusicalDynamicLabel, number>> =
  Object.freeze({
    pp: 32,
    p: 48,
    mp: 64,
    mf: 80,
    f: 96,
    ff: 112,
  });

export type DynamicsPresetId =
  "balanced" | "top-voice-emphasis" | "bass-emphasis" | "inner-voices-soft" | "humanized-dynamics";

export interface DynamicsPresetDescriptor {
  readonly id: DynamicsPresetId;
  readonly label: string;
  readonly description: string;
}

export const PIANO_DYNAMICS_PRESETS: readonly DynamicsPresetDescriptor[] = Object.freeze([
  Object.freeze({
    id: "balanced",
    label: "Balanced",
    description: "Even velocity across all voices inheriting Master Velocity",
  }),
  Object.freeze({
    id: "top-voice-emphasis",
    label: "Top Voice Emphasis",
    description: "Brings out the melody/highest voice with elevated velocity",
  }),
  Object.freeze({
    id: "bass-emphasis",
    label: "Bass Emphasis",
    description: "Accentuates the lowest/bass voice for harmonic foundation",
  }),
  Object.freeze({
    id: "inner-voices-soft",
    label: "Inner Voices Soft",
    description: "Subdues inner harmony notes to clarify outer soprano and bass voices",
  }),
  Object.freeze({
    id: "humanized-dynamics",
    label: "Humanized Dynamics",
    description: "Applies subtle, bounded pseudo-random velocity variations across voices",
  }),
]);

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
