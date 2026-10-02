import type { EffectiveMelodyNote } from "../../domain/melody/effectiveTimeline";
import type { ProgressionStep } from "../../domain/progression/step";
import type { ProgressionMeasure } from "../../domain/timing/measureLayout";
import { computeScalePitches } from "../../domain/harmony/modes";
import type { HarmonicModuleId } from "../../domain/harmony/functions";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  rationalToNumber,
  subtractRational,
  type Rational,
} from "../../domain/timing/rational";

const SNAP_BEATS: Record<string, Rational> = {
  "1/1": rational(4),
  "1/2": rational(2),
  "1/4": rational(1),
  "1/8": rational(1, 2),
  "1/16": rational(1, 4),
  "1/1 triplet": rational(8, 3),
  "1/2 triplet": rational(4, 3),
  "1/4 triplet": rational(2, 3),
  "1/8 triplet": rational(1, 3),
  "1/16 triplet": rational(1, 6),
};

export function pianoRollSnapBeats(snap: string): Rational {
  return SNAP_BEATS[snap] ?? SNAP_BEATS["1/4"]!;
}

export function pianoRollSnapOffsets(
  barLength: Rational,
  snap: string,
  measureStart: Rational = rational(0),
): readonly Rational[] {
  const increment = pianoRollSnapBeats(snap);
  const offsets: Rational[] = [];
  const end = addRational(measureStart, barLength);
  const scaledNumerator = measureStart.numerator * increment.denominator;
  const scaledDenominator = measureStart.denominator * increment.numerator;
  let index = Math.ceil(scaledNumerator / scaledDenominator);
  let absolute = multiplyRational(increment, rational(index));
  while (compareRational(absolute, end) <= 0 && offsets.length < 256) {
    if (compareRational(absolute, measureStart) >= 0) {
      offsets.push(subtractRational(absolute, measureStart));
    }
    index += 1;
    absolute = multiplyRational(increment, rational(index));
  }
  return offsets;
}

/** Keep vertical-only drags exact and snap intentional horizontal moves from the original pointer offset. */
export function pianoRollMoveStart(
  originalStart: Rational,
  pointerBeats: Rational,
  grabOffset: Rational,
  snapBeats: Rational,
  horizontalIntent: boolean,
): Rational {
  if (!horizontalIntent) return originalStart;
  const candidate = subtractRational(pointerBeats, grabOffset);
  return multiplyRational(
    snapBeats,
    rational(Math.round(rationalToNumber(candidate) / rationalToNumber(snapBeats))),
  );
}

/** Classify a move only after a clear axis wins, so initial pointer jitter cannot latch Snap. */
export function pianoRollGestureIntent(
  horizontalDelta: number,
  verticalDelta: number,
): "horizontal" | "vertical" | null {
  const horizontal = Math.abs(horizontalDelta);
  const vertical = Math.abs(verticalDelta);
  const threshold = 12;
  const dominanceRatio = 1.5;
  if (horizontal >= threshold && horizontal >= vertical * dominanceRatio) return "horizontal";
  if (vertical >= threshold && vertical >= horizontal * dominanceRatio) return "vertical";
  return null;
}

/** Let a clear later trajectory correct an initially misleading diagonal pointer sample. */
export function pianoRollResolvedGestureIntent(
  previous: "horizontal" | "vertical" | null,
  horizontalDelta: number,
  verticalDelta: number,
): "horizontal" | "vertical" | null {
  return pianoRollGestureIntent(horizontalDelta, verticalDelta) ?? previous;
}

const MAJOR_DEGREE_LABELS = ["1", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♭6", "6", "♭7", "7"];
const MINOR_DEGREE_LABELS = ["1", "♭2", "2", "3", "♯3", "4", "♯4", "5", "6", "♯6", "7", "♯7"];

export function pianoRollDegreeLabel(pitchClass: number, tonic: number, minor: boolean): string {
  const relativePitchClass = (((pitchClass - tonic) % 12) + 12) % 12;
  return (minor ? MINOR_DEGREE_LABELS : MAJOR_DEGREE_LABELS)[relativePitchClass]!;
}

/** Returns a scale degree or its adjacent sharp/flat pair for one key-relative pitch class. */
export function pianoRollPaletteDegrees(
  pitchClass: number,
  tonic: number,
  moduleId: HarmonicModuleId,
): readonly number[] {
  const scale = computeScalePitches(tonic, moduleId === "progressions" ? "ionian" : "aeolian");
  const normalized = ((pitchClass % 12) + 12) % 12;
  const candidates = scale.map((pitch) => ({
    degree: pitch.degree,
    pitchClass: pitch.pitchClass,
  }));
  if (moduleId === "dark-harmony") candidates.push({ degree: 7, pitchClass: (tonic + 11) % 12 });
  const matching = [
    ...new Set(
      candidates.filter((pitch) => pitch.pitchClass === normalized).map((pitch) => pitch.degree),
    ),
  ];
  if (matching.length) return Object.freeze([matching[0]!]);

  const sorted = [...candidates].sort((a, b) => a.pitchClass - b.pitchClass);
  const lowerIndex = sorted.findLastIndex((pitch) => pitch.pitchClass < normalized);
  const lower = lowerIndex >= 0 ? sorted[lowerIndex]! : sorted.at(-1)!;
  const upper = sorted[(lowerIndex + 1) % sorted.length]!;
  return Object.freeze([lower.degree, upper.degree]);
}

export function pianoRollPaletteColor(degree: number): string {
  return (
    ["#aa1c24", "#a74d00", "#786500", "#287331", "#007386", "#6d36a5", "#a00083"][degree - 1] ??
    "#667085"
  );
}

export function projectPianoRollChordToneGuide(
  measure: ProgressionMeasure,
  pitchClass: number,
  chordPitchClassesByStep: ReadonlyMap<string, ReadonlySet<number>>,
) {
  const normalizedPitchClass = ((pitchClass % 12) + 12) % 12;
  return Object.freeze(
    measure.items.map((item) => ({
      item,
      chordTone:
        item.kind === "step" &&
        item.step.kind === "chord" &&
        (chordPitchClassesByStep.get(item.stepId)?.has(normalizedPitchClass) ?? false),
    })),
  );
}

export function pianoRollScaleGuideTones(
  rowPitchClass: number,
  chordPitchClasses: ReadonlySet<number>,
): readonly { pitchClass: number; half: "upper" | "lower" | null }[] {
  const rowPc = ((rowPitchClass % 12) + 12) % 12;
  return chordPitchClasses.has(rowPc)
    ? Object.freeze([{ pitchClass: rowPc, half: null }])
    : Object.freeze([]);
}

export function projectPianoRollScaleChordToneGuide(
  measure: ProgressionMeasure,
  rowPitchClass: number,
  chordPitchClassesByStep: ReadonlyMap<string, ReadonlySet<number>>,
) {
  return Object.freeze(
    measure.items.map((item) => {
      const chordPitchClasses =
        item.kind === "step" && item.step.kind === "chord"
          ? (chordPitchClassesByStep.get(item.stepId) ?? new Set<number>())
          : new Set<number>();
      return {
        item,
        neutral: chordPitchClasses.size === 0,
        tones: pianoRollScaleGuideTones(rowPitchClass, chordPitchClasses),
      };
    }),
  );
}

export function isPianoRollNoteAuthored(step: ProgressionStep | undefined): boolean {
  return step?.kind === "rest"
    ? step.authoredMelody !== undefined
    : step?.kind === "chord" && step.melody?.mode === "authored";
}

export interface PianoRollNoteFragment {
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly leftPercent: number;
  readonly widthPercent: number;
  readonly continuesFromPrevious: boolean;
}

/** Current read-only transport line inside one measure; null hides other systems and the clipped tail. */
export function pianoRollPlayheadPercent(
  noteStart: Rational,
  noteDuration: Rational,
  measure: Pick<ProgressionMeasure, "startBeats" | "endBeats">,
  elapsedMs: number,
  tempoBpm: number,
): number | null {
  const beat =
    rationalToNumber(noteStart) + (Math.max(0, elapsedMs) * Math.max(1, tempoBpm)) / 60_000;
  const start = rationalToNumber(measure.startBeats);
  const end = rationalToNumber(measure.endBeats);
  const noteEnd = rationalToNumber(addRational(noteStart, noteDuration));
  if (beat < start || beat > end || beat > noteEnd) return null;
  return Math.max(0, Math.min(100, ((beat - start) / (end - start)) * 100));
}

/** A display-only measure slice; the canonical note interval is never changed. */
export function projectPianoRollNoteFragment(
  note: EffectiveMelodyNote,
  measure: ProgressionMeasure,
  barLengthBeats: Rational,
): PianoRollNoteFragment | null {
  const noteEnd = addRational(note.startBeats, note.durationBeats);
  if (
    compareRational(note.startBeats, measure.endBeats) >= 0 ||
    compareRational(noteEnd, measure.startBeats) <= 0
  )
    return null;
  const startBeats =
    compareRational(note.startBeats, measure.startBeats) < 0 ? measure.startBeats : note.startBeats;
  const endBeats = compareRational(noteEnd, measure.endBeats) > 0 ? measure.endBeats : noteEnd;
  return Object.freeze({
    startBeats,
    durationBeats: subtractRational(endBeats, startBeats),
    leftPercent:
      (rationalToNumber(subtractRational(startBeats, measure.startBeats)) /
        rationalToNumber(barLengthBeats)) *
      100,
    widthPercent:
      (rationalToNumber(subtractRational(endBeats, startBeats)) /
        rationalToNumber(barLengthBeats)) *
      100,
    continuesFromPrevious: compareRational(note.startBeats, measure.startBeats) < 0,
  });
}
