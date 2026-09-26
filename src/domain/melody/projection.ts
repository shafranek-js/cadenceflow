import { exactPitch } from "../harmony/pitch";
import type { ExactPitch } from "../harmony/pitch";
import {
  addRational,
  compareRational,
  multiplyRational,
  subtractRational,
  ZERO,
  type Rational,
} from "../timing/rational";
import { melodyGridDuration, melodyRhythmWeights, orderMelodyPitches } from "./patterns";
import {
  MelodyValidationError,
  snapshotChordMelodyRecipe,
  type ChordMelodyRecipe,
  type MelodyRecipeInput,
  type MelodyEvent,
  type MelodyPhrase,
} from "./types";

export type {
  ChordMelodyRecipe,
  MelodyEvent,
  MelodyGrid,
  MelodyOctaveOffset,
  MelodyPattern,
  MelodyPitchMotion,
  MelodyRhythm,
  MelodyConnection,
  MelodyPhrase,
  MelodyValidationReason,
} from "./types";
export { MelodyValidationError } from "./types";

export interface MelodyProjectionInput {
  readonly sourceStepId: string;
  readonly upperPitches: readonly ExactPitch[];
  readonly durationBeats: Rational;
  readonly recipe: MelodyRecipeInput;
  readonly targetPitches?: readonly ExactPitch[];
}

function validateInput(input: MelodyProjectionInput): void {
  if (input.upperPitches.length === 0) {
    throw new MelodyValidationError(
      "melody generation requires at least one upper pitch",
      "empty-pitches",
    );
  }
  if (compareRational(input.durationBeats, ZERO) <= 0) {
    throw new MelodyValidationError(
      "melody generation requires a positive duration",
      "invalid-duration",
    );
  }
  for (const pitch of input.upperPitches) {
    if (!Number.isInteger(pitch.midiNumber) || pitch.midiNumber < 0 || pitch.midiNumber > 127) {
      throw new MelodyValidationError(
        `invalid upper pitch MIDI number: ${String(pitch.midiNumber)}`,
        "invalid-pitch",
      );
    }
  }
}

function offsetPitches(
  pitches: readonly ExactPitch[],
  octaveOffset: ChordMelodyRecipe["octaveOffset"],
): readonly ExactPitch[] {
  const semitoneOffset = octaveOffset * 12;
  return Object.freeze(
    pitches.map((pitch) => {
      const midiNumber = pitch.midiNumber + semitoneOffset;
      if (midiNumber < 0 || midiNumber > 127) {
        throw new MelodyValidationError(
          `melody octave offset produces MIDI ${midiNumber}, outside 0..127`,
          "octave-overflow",
        );
      }
      return exactPitch(midiNumber, { ...pitch.spelling });
    }),
  );
}

export function realizeChordMelody(input: MelodyProjectionInput): MelodyPhrase {
  validateInput(input);

  const recipe = snapshotChordMelodyRecipe(input.recipe);
  const sourcePatternCycle = orderMelodyPitches(input.upperPitches, recipe.pitchMotion);
  const patternCycle = offsetPitches(sourcePatternCycle, recipe.octaveOffset);
  const gridDuration = melodyGridDuration(recipe.grid);
  const rhythmWeights = melodyRhythmWeights(recipe.rhythm);
  const events: MelodyEvent[] = [];
  let startOffsetBeats = ZERO;
  let sourceIndex = 0;

  while (compareRational(startOffsetBeats, input.durationBeats) < 0) {
    const remainingBeats = subtractRational(input.durationBeats, startOffsetBeats);
    const weight = rhythmWeights[sourceIndex % rhythmWeights.length]!;
    const weightedGridDuration = multiplyRational(gridDuration, {
      numerator: weight,
      denominator: 1,
    });
    const durationBeats =
      compareRational(remainingBeats, weightedGridDuration) < 0
        ? remainingBeats
        : weightedGridDuration;
    const pitch = patternCycle[sourceIndex % patternCycle.length]!;
    const sourcePitch = sourcePatternCycle[sourceIndex % sourcePatternCycle.length]!;
    const previous = events.at(-1);
    if (
      recipe.connection === "tie-repeated" &&
      previous !== undefined &&
      previous.pitch.midiNumber === pitch.midiNumber
    ) {
      events[events.length - 1] = Object.freeze({
        ...previous,
        durationBeats: addRational(previous.durationBeats, durationBeats),
      });
    } else {
      events.push(
        Object.freeze({
          sourceStepId: input.sourceStepId,
          index: events.length,
          pitch,
          sourcePitchMidi: sourcePitch.midiNumber,
          startOffsetBeats,
          durationBeats,
        }),
      );
    }
    startOffsetBeats = addRational(startOffsetBeats, durationBeats);
    sourceIndex += 1;
  }

  const requestedTarget = recipe.targetNextPitchClass;
  if (requestedTarget !== undefined && input.targetPitches?.length) {
    const finalEvent = events.at(-1);
    const matchingTargets = input.targetPitches.filter(
      (pitch) => ((pitch.midiNumber % 12) + 12) % 12 === requestedTarget,
    );
    if (finalEvent && matchingTargets.length > 0) {
      const target = matchingTargets.reduce((best, candidate) =>
        Math.abs(candidate.midiNumber - finalEvent.pitch.midiNumber) <
        Math.abs(best.midiNumber - finalEvent.pitch.midiNumber)
          ? candidate
          : best,
      );
      events[events.length - 1] = Object.freeze({
        ...finalEvent,
        pitch: target,
        sourcePitchMidi: target.midiNumber,
      });
    }
  }
  return Object.freeze({ events: Object.freeze(events) });
}
