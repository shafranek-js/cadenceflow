import {
  durationDotted,
  durationTriplet,
  formatMusicalDuration,
  parseMusicalDuration,
  type MusicalDuration,
} from "../../domain/timing/duration";
import { rational, type Rational } from "../../domain/timing/rational";

export interface DurationPreset {
  readonly id: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly beats: Rational;
  readonly beatsNumerator: number;
  readonly beatsDenominator: number;
  readonly isQuickButton?: boolean;
  readonly testId?: string;
}

export const DURATION_PRESETS: readonly DurationPreset[] = [
  {
    id: "4/1",
    label: "Whole — 4 beats",
    shortLabel: "Whole",
    beats: rational(4, 1),
    beatsNumerator: 4,
    beatsDenominator: 1,
    isQuickButton: true,
    testId: "duration-preset-whole",
  },
  {
    id: "2/1",
    label: "Half — 2 beats",
    shortLabel: "Half",
    beats: rational(2, 1),
    beatsNumerator: 2,
    beatsDenominator: 1,
    isQuickButton: true,
    testId: "duration-preset-half",
  },
  {
    id: "1/1",
    label: "Quarter — 1 beat",
    shortLabel: "Quarter",
    beats: rational(1, 1),
    beatsNumerator: 1,
    beatsDenominator: 1,
    isQuickButton: true,
    testId: "duration-preset-quarter",
  },
  {
    id: "1/2",
    label: "Eighth — 1/2 beat",
    shortLabel: "Eighth",
    beats: rational(1, 2),
    beatsNumerator: 1,
    beatsDenominator: 2,
    isQuickButton: true,
    testId: "duration-preset-eighth",
  },
  {
    id: "1/4",
    label: "Sixteenth — 1/4 beat",
    shortLabel: "Sixteenth",
    beats: rational(1, 4),
    beatsNumerator: 1,
    beatsDenominator: 4,
    isQuickButton: true,
    testId: "duration-preset-sixteenth",
  },
  {
    id: "3/1",
    label: "Dotted Half — 3 beats",
    shortLabel: "Dotted Half",
    beats: rational(3, 1),
    beatsNumerator: 3,
    beatsDenominator: 1,
  },
  {
    id: "3/2",
    label: "Dotted Quarter — 3/2 beats",
    shortLabel: "Dotted Quarter",
    beats: rational(3, 2),
    beatsNumerator: 3,
    beatsDenominator: 2,
  },
  {
    id: "3/4",
    label: "Dotted Eighth — 3/4 beat",
    shortLabel: "Dotted Eighth",
    beats: rational(3, 4),
    beatsNumerator: 3,
    beatsDenominator: 4,
  },
  {
    id: "2/3",
    label: "Quarter Triplet — 2/3 beat",
    shortLabel: "Quarter Triplet",
    beats: rational(2, 3),
    beatsNumerator: 2,
    beatsDenominator: 3,
  },
  {
    id: "1/3",
    label: "Eighth Triplet — 1/3 beat",
    shortLabel: "Eighth Triplet",
    beats: rational(1, 3),
    beatsNumerator: 1,
    beatsDenominator: 3,
  },
];

export const QUICK_DURATION_BUTTON_PRESETS: readonly DurationPreset[] = DURATION_PRESETS.filter(
  (preset) => preset.isQuickButton,
);

export function findDurationPreset(duration: MusicalDuration): DurationPreset | undefined {
  const { numerator, denominator } = duration.beats;
  return DURATION_PRESETS.find(
    (preset) => preset.beatsNumerator === numerator && preset.beatsDenominator === denominator,
  );
}

export function formatDurationBeats(duration: MusicalDuration): string {
  const { numerator, denominator } = duration.beats;
  if (numerator === 1 && denominator === 1) {
    return "1 beat";
  }
  return `${formatMusicalDuration(duration)} beats`;
}

export function formatDurationDisplayName(duration: MusicalDuration): string {
  const preset = findDurationPreset(duration);
  return preset ? preset.label : formatDurationBeats(duration);
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

export { durationDotted, durationTriplet };
