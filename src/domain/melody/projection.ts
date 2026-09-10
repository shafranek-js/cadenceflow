import { exactPitch } from "../harmony/pitch";
import type { ExactPitch } from "../harmony/pitch";
import {
  addRational,
  compareRational,
  subtractRational,
  ZERO,
  type Rational,
} from "../timing/rational";
import { melodyGridDuration, orderMelodyPitches } from "./patterns";
import {
  MelodyValidationError,
  type ChordMelodyRecipe,
  type MelodyEvent,
  type MelodyPhrase,
} from "./types";

export type {
  ChordMelodyRecipe,
  MelodyEvent,
  MelodyGrid,
  MelodyOctaveOffset,
  MelodyPattern,
  MelodyPhrase,
  MelodyValidationReason,
} from "./types";
export { MelodyValidationError } from "./types";

export interface MelodyProjectionInput {
  readonly sourceStepId: string;
  readonly upperPitches: readonly ExactPitch[];
  readonly durationBeats: Rational;
  readonly recipe: ChordMelodyRecipe;
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
  if (
    !Number.isInteger(input.recipe.octaveOffset) ||
    input.recipe.octaveOffset < -2 ||
    input.recipe.octaveOffset > 2
  ) {
    throw new MelodyValidationError(
      `unsupported melody octave offset: ${String(input.recipe.octaveOffset)}`,
      "invalid-recipe",
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

  const patternCycle = offsetPitches(
    orderMelodyPitches(input.upperPitches, input.recipe.pattern),
    input.recipe.octaveOffset,
  );
  const gridDuration = melodyGridDuration(input.recipe.grid);
  const events: MelodyEvent[] = [];
  let startOffsetBeats = ZERO;
  let index = 0;

  while (compareRational(startOffsetBeats, input.durationBeats) < 0) {
    const remainingBeats = subtractRational(input.durationBeats, startOffsetBeats);
    const durationBeats =
      compareRational(remainingBeats, gridDuration) < 0 ? remainingBeats : gridDuration;
    const pitch = patternCycle[index % patternCycle.length]!;
    events.push(
      Object.freeze({
        sourceStepId: input.sourceStepId,
        index,
        pitch,
        startOffsetBeats,
        durationBeats,
      }),
    );
    startOffsetBeats = addRational(startOffsetBeats, durationBeats);
    index += 1;
  }

  return Object.freeze({ events: Object.freeze(events) });
}
