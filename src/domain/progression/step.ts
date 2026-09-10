import type { HarmonicFunctionIdentity } from "../harmony/functions";
import type { HarmonicVariant } from "../harmony/chord";
import type { ExactPitch, PitchSpelling } from "../harmony/pitch";
import type { MusicalDuration } from "../timing/duration";
import type { ChordMelodyRecipe } from "../melody/types";

export type CardViewId = "harmonic" | "piano" | "staff";
export type PianoArticulation = "block" | "arp-up" | "arp-down" | "broken-chord" | "humanized";
export type RegisterOffset = "auto" | -2 | -1 | 0 | 1 | 2;
export type DynamicsViewPreference = "musical" | "midi";
export type BassChoice = "auto" | "root" | "third" | "fifth" | "custom";
export type BassOctaveOffset = "auto" | -1 | -2;

export interface BassSettings {
  readonly choice: BassChoice;
  readonly octaveOffset: BassOctaveOffset;
  readonly customPitch?: ExactPitch;
}

export interface StepPerformance {
  readonly articulation: PianoArticulation;
  readonly register: RegisterOffset;
  readonly voicingMode: "auto" | "manual";
  readonly manualVoicing?: readonly ExactPitch[];
  readonly bass: BassSettings;
  readonly masterVelocity: number;
  readonly perNoteVelocityOverrides: Readonly<Record<string, number>>;
  readonly dynamicsViewPreference: DynamicsViewPreference;
}

export interface ChordStep {
  readonly id: string;
  readonly kind: "chord";
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly harmonicVariant: HarmonicVariant;
  readonly explicitSpellingOverrides?: Readonly<Record<string, PitchSpelling>>;
  readonly duration: MusicalDuration;
  readonly performance: StepPerformance;
  readonly cardView: CardViewId;
  readonly melody?: ChordMelodyRecipe;
}

export interface RestStep {
  readonly id: string;
  readonly kind: "rest";
  readonly duration: MusicalDuration;
}

export type ProgressionStep = ChordStep | RestStep;

export function snapshotStepPerformance(performance: StepPerformance): StepPerformance {
  return Object.freeze({
    ...performance,
    bass: Object.freeze({ ...performance.bass }),
    perNoteVelocityOverrides: Object.freeze({ ...performance.perNoteVelocityOverrides }),
    ...(performance.manualVoicing
      ? { manualVoicing: Object.freeze([...performance.manualVoicing]) }
      : {}),
  });
}

export function assertVelocity(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 127)
    throw new RangeError("velocity must be an integer in 1..127");
  return value;
}
