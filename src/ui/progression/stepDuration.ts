import { parseMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { rational, type Rational } from "../../domain/timing/rational";

export interface DurationPreset {
  readonly id: string;
  readonly label: string;
  readonly beats: Rational;
  readonly beatsNumerator: number;
  readonly beatsDenominator: number;
}

export const DURATION_PRESETS: readonly DurationPreset[] = [
  {
    id: "4/1",
    label: "Whole — 4 beats",
    beats: rational(4, 1),
    beatsNumerator: 4,
    beatsDenominator: 1,
  },
  {
    id: "2/1",
    label: "Half — 2 beats",
    beats: rational(2, 1),
    beatsNumerator: 2,
    beatsDenominator: 1,
  },
  {
    id: "1/1",
    label: "Quarter — 1 beat",
    beats: rational(1, 1),
    beatsNumerator: 1,
    beatsDenominator: 1,
  },
  {
    id: "1/2",
    label: "Eighth — 1/2 beat",
    beats: rational(1, 2),
    beatsNumerator: 1,
    beatsDenominator: 2,
  },
  {
    id: "1/4",
    label: "Sixteenth — 1/4 beat",
    beats: rational(1, 4),
    beatsNumerator: 1,
    beatsDenominator: 4,
  },
  {
    id: "3/1",
    label: "Dotted Half — 3 beats",
    beats: rational(3, 1),
    beatsNumerator: 3,
    beatsDenominator: 1,
  },
  {
    id: "3/2",
    label: "Dotted Quarter — 3/2 beats",
    beats: rational(3, 2),
    beatsNumerator: 3,
    beatsDenominator: 2,
  },
  {
    id: "3/4",
    label: "Dotted Eighth — 3/4 beat",
    beats: rational(3, 4),
    beatsNumerator: 3,
    beatsDenominator: 4,
  },
  {
    id: "2/3",
    label: "Quarter Triplet — 2/3 beat",
    beats: rational(2, 3),
    beatsNumerator: 2,
    beatsDenominator: 3,
  },
  {
    id: "1/3",
    label: "Eighth Triplet — 1/3 beat",
    beats: rational(1, 3),
    beatsNumerator: 1,
    beatsDenominator: 3,
  },
];

export function findDurationPreset(duration: MusicalDuration): DurationPreset | undefined {
  const { numerator, denominator } = duration.beats;
  return DURATION_PRESETS.find(
    (preset) => preset.beatsNumerator === numerator && preset.beatsDenominator === denominator,
  );
}

export function parseCustomDuration(text: string): { duration?: MusicalDuration; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { error: "Duration cannot be empty" };
  }
  try {
    const parsed = parseMusicalDuration(trimmed);
    return { duration: parsed };
  } catch (_err) {
    return { error: "Invalid format (e.g. 1, 1/2, 3/4)" };
  }
}
