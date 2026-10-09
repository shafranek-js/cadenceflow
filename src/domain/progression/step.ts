import type { HarmonicFunctionIdentity } from "../harmony/functions";
import { snapshotHarmonicVariant, type HarmonicVariant } from "../harmony/chord";
import type { ExactPitch, PitchSpelling } from "../harmony/pitch";
import type { MusicalDuration } from "../timing/duration";
import type { AuthoredMelodyPhrase, ChordMelody, MelodyInstrument } from "../melody/types";

export type CardViewId = "harmonic" | "piano" | "staff" | "guitar" | "tablature";
export type PianoArticulation = "block" | "arp-up" | "arp-down" | "broken-chord" | "humanized";
export type RegisterOffset = "auto" | -2 | -1 | 0 | 1 | 2;
export type DynamicsViewPreference = "musical" | "midi";
export type BassChoice =
  | "auto"
  | "root"
  | "second"
  | "third"
  | "fourth"
  | "fifth"
  | "seventh"
  | "ninth"
  | "eleventh"
  | "thirteenth"
  | "custom";
export type BassOctaveOffset = "auto" | -1 | -2;
export type InversionChoice = "auto" | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BassSettings {
  readonly choice: BassChoice;
  readonly octaveOffset: BassOctaveOffset;
  readonly customPitch?: ExactPitch;
}

export interface StepPerformance {
  readonly articulation: PianoArticulation;
  readonly register: RegisterOffset;
  readonly voicingMode: "auto" | "manual";
  readonly inversion?: InversionChoice;
  readonly manualVoicing?: readonly ExactPitch[];
  readonly bass: BassSettings;
  readonly masterVelocity: number;
  readonly perNoteVelocityOverrides: Readonly<Record<string, number>>;
  readonly dynamicsViewPreference: DynamicsViewPreference;
}

export interface ChordPropertiesFunctionState {
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly harmonicVariant: HarmonicVariant;
}

export interface ChordPropertiesSourceState extends ChordPropertiesFunctionState {
  readonly inversion?: InversionChoice;
  readonly bass: BassSettings;
}

/** Reversible source snapshots for Secondary/Borrow controls and the Reset command. */
export interface ChordPropertiesOrigin {
  readonly source: ChordPropertiesSourceState;
  /** Function/variant in effect immediately before Secondary was first enabled. */
  readonly secondaryBase?: ChordPropertiesFunctionState;
  /** Function/variant in effect immediately before Borrow From was first enabled. */
  readonly borrowBase?: ChordPropertiesFunctionState;
}

function snapshotFunctionState(state: ChordPropertiesFunctionState): ChordPropertiesFunctionState {
  return Object.freeze({
    harmonicFunction: Object.freeze({ ...state.harmonicFunction }),
    harmonicVariant: snapshotHarmonicVariant(state.harmonicVariant),
  });
}

export function snapshotChordPropertiesOrigin(
  origin: ChordPropertiesOrigin,
): ChordPropertiesOrigin {
  const source = origin.source;
  return Object.freeze({
    source: Object.freeze({
      ...snapshotFunctionState(source),
      ...(source.inversion !== undefined ? { inversion: source.inversion } : {}),
      bass: Object.freeze({
        ...source.bass,
        ...(source.bass.customPitch
          ? { customPitch: Object.freeze({ ...source.bass.customPitch }) }
          : {}),
      }),
    }),
    ...(origin.secondaryBase ? { secondaryBase: snapshotFunctionState(origin.secondaryBase) } : {}),
    ...(origin.borrowBase ? { borrowBase: snapshotFunctionState(origin.borrowBase) } : {}),
  });
}

export interface ChordStep {
  readonly id: string;
  readonly kind: "chord";
  /** Additive concert-pitch offset; persisted schema v10 defaults this to zero. */
  readonly transpositionSemitones?: number;
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly harmonicVariant: HarmonicVariant;
  readonly chordPropertiesOrigin?: ChordPropertiesOrigin;
  readonly explicitSpellingOverrides?: Readonly<Record<string, PitchSpelling>>;
  readonly duration: MusicalDuration;
  readonly performance: StepPerformance;
  readonly cardView: CardViewId;
  /** Chord-only generated or authored Melody. RestStep stores authored Melody directly. */
  readonly melody?: ChordMelody;
  /** Optional Step-local override; absence inherits Melody Track settings. */
  readonly melodyInstrumentOverride?: MelodyInstrument;
}

export interface RestStep {
  readonly id: string;
  readonly kind: "rest";
  /** Additive concert-pitch offset for authored Melody; persisted schema v10 defaults this to zero. */
  readonly transpositionSemitones?: number;
  readonly duration: MusicalDuration;
  /** Authored Melody is independent of Harmony; a Rest excludes only chord generation. */
  readonly authoredMelody?: AuthoredMelodyPhrase;
  /** Optional Step-local override; absence inherits Melody Track settings. */
  readonly melodyInstrumentOverride?: MelodyInstrument;
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
