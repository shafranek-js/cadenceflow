import {
  addRational,
  compareRational,
  divideRational,
  subtractRational,
  ZERO,
  type Rational,
} from "../domain/timing/rational";

export interface WrittenRhythmValue {
  readonly beats: Rational;
  readonly vexDuration: string;
  readonly dots: number;
  readonly tuplet?: { readonly numNotes: number; readonly notesOccupied: number };
  readonly notation: string;
}

export interface WrittenRhythmPart extends WrittenRhythmValue {
  readonly offsetBeats: Rational;
  readonly index: number;
  readonly count: number;
}

const ordinaryValues: readonly WrittenRhythmValue[] = [
  { beats: { numerator: 4, denominator: 1 }, vexDuration: "w", dots: 0, notation: "whole" },
  {
    beats: { numerator: 3, denominator: 1 },
    vexDuration: "h",
    dots: 1,
    notation: "dotted-half",
  },
  { beats: { numerator: 2, denominator: 1 }, vexDuration: "h", dots: 0, notation: "half" },
  {
    beats: { numerator: 3, denominator: 2 },
    vexDuration: "q",
    dots: 1,
    notation: "dotted-quarter",
  },
  { beats: { numerator: 1, denominator: 1 }, vexDuration: "q", dots: 0, notation: "quarter" },
  {
    beats: { numerator: 3, denominator: 4 },
    vexDuration: "8",
    dots: 1,
    notation: "dotted-eighth",
  },
  { beats: { numerator: 1, denominator: 2 }, vexDuration: "8", dots: 0, notation: "eighth" },
  {
    beats: { numerator: 3, denominator: 8 },
    vexDuration: "16",
    dots: 1,
    notation: "dotted-sixteenth",
  },
  { beats: { numerator: 1, denominator: 4 }, vexDuration: "16", dots: 0, notation: "sixteenth" },
  {
    beats: { numerator: 3, denominator: 16 },
    vexDuration: "32",
    dots: 1,
    notation: "dotted-thirty-second",
  },
  {
    beats: { numerator: 1, denominator: 8 },
    vexDuration: "32",
    dots: 0,
    notation: "thirty-second",
  },
  {
    beats: { numerator: 1, denominator: 16 },
    vexDuration: "64",
    dots: 0,
    notation: "sixty-fourth",
  },
];

const tripletValues: readonly WrittenRhythmValue[] = [
  {
    beats: { numerator: 2, denominator: 3 },
    vexDuration: "q",
    dots: 0,
    tuplet: { numNotes: 3, notesOccupied: 2 },
    notation: "quarter-triplet",
  },
  {
    beats: { numerator: 1, denominator: 3 },
    vexDuration: "8",
    dots: 0,
    tuplet: { numNotes: 3, notesOccupied: 2 },
    notation: "eighth-triplet",
  },
  {
    beats: { numerator: 1, denominator: 6 },
    vexDuration: "16",
    dots: 0,
    tuplet: { numNotes: 3, notesOccupied: 2 },
    notation: "sixteenth-triplet",
  },
];

const standardBeatDenominators = new Set([1, 2, 3, 4, 6, 8, 16]);

function customValue(beats: Rational): WrittenRhythmValue {
  const base = ordinaryValues
    .filter((candidate) => compareRational(candidate.beats, beats) >= 0)
    .sort((a, b) => compareRational(a.beats, b.beats))[0];
  const chosen = base ?? ordinaryValues.at(-1)!;
  const ratio = divideRational(chosen.beats, beats);
  return Object.freeze({
    beats,
    vexDuration: chosen.vexDuration,
    dots: chosen.dots,
    tuplet: { numNotes: ratio.numerator, notesOccupied: ratio.denominator },
    notation: `tuplet-${ratio.numerator}-${ratio.denominator}`,
  });
}

/** Decomposes an exact beat duration into standard written values and exact ratios. */
export function projectWrittenRhythm(duration: Rational): readonly WrittenRhythmPart[] {
  if (compareRational(duration, ZERO) <= 0) throw new RangeError("duration must be positive");
  const candidates = [...ordinaryValues, ...tripletValues].sort((a, b) =>
    compareRational(b.beats, a.beats),
  );
  if (!standardBeatDenominators.has(duration.denominator)) {
    const custom = customValue(duration);
    return Object.freeze([Object.freeze({ ...custom, offsetBeats: ZERO, index: 0, count: 1 })]);
  }
  const parts: { value: WrittenRhythmValue; offsetBeats: Rational }[] = [];
  let remaining = duration;
  let offsetBeats = ZERO;
  while (compareRational(remaining, ZERO) > 0) {
    const value = candidates.find((candidate) => compareRational(candidate.beats, remaining) <= 0);
    const selected = value ?? customValue(remaining);
    parts.push({ value: selected, offsetBeats });
    remaining = subtractRational(remaining, selected.beats);
    offsetBeats = addRational(offsetBeats, selected.beats);
  }
  return Object.freeze(
    parts.map(({ value, offsetBeats: startOffset }, index) =>
      Object.freeze({ ...value, offsetBeats: startOffset, index, count: parts.length }),
    ),
  );
}

/** Chooses one exact glyph/ratio when a whole duration must stay one symbol. */
export function projectSingleWrittenRhythm(duration: Rational): WrittenRhythmValue {
  if (compareRational(duration, ZERO) <= 0) throw new RangeError("duration must be positive");
  return (
    [...ordinaryValues, ...tripletValues].find(
      (candidate) => compareRational(candidate.beats, duration) === 0,
    ) ?? customValue(duration)
  );
}
