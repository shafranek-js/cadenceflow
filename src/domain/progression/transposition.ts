import type { ChordDefinition } from "../harmony/chord";
import { realizeChord } from "../harmony/realization";
import type { HarmonicFunctionIdentity } from "../harmony/functions";
import {
  exactPitch,
  normalizePitchClass,
  type ExactPitch,
  type PitchClassIdentity,
  type PitchSpelling,
} from "../harmony/pitch";
import { defaultTonicSpelling, spellingToPitchClass } from "../harmony/spelling";
import type { ProgressionStep } from "./step";

export const MIN_STEP_TRANSPOSITION_SEMITONES = -127;
export const MAX_STEP_TRANSPOSITION_SEMITONES = 127;

export function assertStepTranspositionSemitones(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_STEP_TRANSPOSITION_SEMITONES ||
    value > MAX_STEP_TRANSPOSITION_SEMITONES
  ) {
    throw new RangeError("Step transposition must be an integer in -127..127 semitones");
  }
  return value;
}

export function stepTranspositionSemitones(step: ProgressionStep): number {
  return assertStepTranspositionSemitones(step.transpositionSemitones ?? 0);
}

function transposedPitchClass(pitchClass: PitchClassIdentity, semitones: number): number {
  return normalizePitchClass(pitchClass + semitones);
}

export function transposeExactPitch(pitch: ExactPitch, semitones: number): ExactPitch {
  assertStepTranspositionSemitones(semitones);
  const compensation = pitch.transpositionCompensationSemitones ?? 0;
  if (semitones === 0 && compensation === 0) return pitch;
  const midiNumber = pitch.midiNumber + compensation + semitones;
  const pitchClass = normalizePitchClass(midiNumber);
  return exactPitch(midiNumber, defaultTonicSpelling(pitchClass, "major"));
}

export function pitchToSourceFrame(pitch: ExactPitch, step: ProgressionStep): ExactPitch {
  const semitones = stepTranspositionSemitones(step);
  if (semitones === 0) return pitch;
  const sourceMidi = pitch.midiNumber - semitones;
  const anchor = Math.max(0, Math.min(127, sourceMidi));
  const compensation = sourceMidi - anchor;
  const anchorPitch = exactPitch(
    anchor,
    defaultTonicSpelling(normalizePitchClass(anchor), "major"),
  );
  const sourcePitch: ExactPitch = Object.freeze({
    ...anchorPitch,
    ...(compensation === 0 ? {} : { transpositionCompensationSemitones: compensation }),
  });
  const canonicalConcertPitch = transposeExactPitch(sourcePitch, semitones);
  return sameSpelling(canonicalConcertPitch.spelling, pitch.spelling)
    ? sourcePitch
    : Object.freeze({
        ...sourcePitch,
        transpositionSpellingOverride: Object.freeze({ ...pitch.spelling }),
      });
}

export function pitchToConcertFrame(pitch: ExactPitch, step: ProgressionStep): ExactPitch {
  const concertPitch = transposeExactPitch(pitch, stepTranspositionSemitones(step));
  const override = pitch.transpositionSpellingOverride;
  if (
    !override ||
    normalizePitchClass(spellingToPitchClass(override)) !== concertPitch.pitchClassIdentity
  )
    return exactPitch(concertPitch.midiNumber, concertPitch.spelling);
  return exactPitch(concertPitch.midiNumber, override);
}

function sameSpelling(left: PitchSpelling, right: PitchSpelling): boolean {
  return left.step === right.step && left.alter === right.alter;
}

export function clearTranspositionSpellingOverride(pitch: ExactPitch): ExactPitch {
  if (pitch.transpositionSpellingOverride === undefined) return pitch;
  const { transpositionSpellingOverride: _override, ...sourcePitch } = pitch;
  return Object.freeze(sourcePitch);
}

export function transposeChordDefinition(
  chord: ChordDefinition,
  semitones: number,
): ChordDefinition {
  assertStepTranspositionSemitones(semitones);
  if (semitones === 0) return chord;
  const rootPitchClass = transposedPitchClass(chord.rootPitchClass, semitones);
  const bassPitchClass =
    chord.bassPitchClass === undefined
      ? undefined
      : transposedPitchClass(chord.bassPitchClass, semitones);
  return Object.freeze({
    ...chord,
    rootPitchClass,
    spelling: Object.freeze({
      ...chord.spelling,
      root: defaultTonicSpelling(rootPitchClass, "major"),
      ...(chord.spelling.manualEnharmonicOverrides
        ? {
            manualEnharmonicOverrides: Object.freeze(
              Object.fromEntries(
                Object.entries(chord.spelling.manualEnharmonicOverrides).map(([key, spelling]) => {
                  const pitchClass = normalizePitchClass(
                    spellingToPitchClass(spelling) + semitones,
                  );
                  return [key, defaultTonicSpelling(pitchClass, "major")];
                }),
              ),
            ),
          }
        : {}),
    }),
    ...(bassPitchClass === undefined
      ? {}
      : {
          bassPitchClass,
          bassSpelling: defaultTonicSpelling(bassPitchClass, "major"),
        }),
  });
}

export function realizeStepChord(
  identity: HarmonicFunctionIdentity,
  tonic: PitchClassIdentity,
  semitones: number,
): ChordDefinition {
  return transposeChordDefinition(realizeChord(identity, tonic), semitones);
}

export function realizeProgressionStepChord(
  step: Extract<ProgressionStep, { readonly kind: "chord" }>,
  tonic: PitchClassIdentity,
): ChordDefinition {
  return {
    ...realizeStepChord(step.harmonicFunction, tonic, stepTranspositionSemitones(step)),
    variant: step.harmonicVariant,
  };
}
