import {
  exactPitch,
  normalizePitchClass,
  type ExactPitch,
  type PitchClassIdentity,
  type PitchSpelling,
} from "../../harmony/pitch";
import { formatPitchSpelling } from "../../harmony/spelling";

export interface GuitarStringInfo {
  /** 1-based guitar string number: 6 (lowest pitch, low E) to 1 (highest pitch, high E) */
  readonly stringNumber: number;
  /** 0-based string index: 0 = low E, 5 = high E */
  readonly stringIndex: number;
  readonly openPitch: ExactPitch;
  readonly openMidi: number;
  readonly openPitchClass: PitchClassIdentity;
  readonly name: string;
}

const STANDARD_OPEN_STRINGS: readonly {
  readonly stringNumber: number;
  readonly stringIndex: number;
  readonly midi: number;
  readonly spelling: PitchSpelling;
  readonly name: string;
}[] = Object.freeze([
  { stringNumber: 6, stringIndex: 0, midi: 40, spelling: { step: "E", alter: 0 }, name: "E2" },
  { stringNumber: 5, stringIndex: 1, midi: 45, spelling: { step: "A", alter: 0 }, name: "A2" },
  { stringNumber: 4, stringIndex: 2, midi: 50, spelling: { step: "D", alter: 0 }, name: "D3" },
  { stringNumber: 3, stringIndex: 3, midi: 55, spelling: { step: "G", alter: 0 }, name: "G3" },
  { stringNumber: 2, stringIndex: 4, midi: 59, spelling: { step: "B", alter: 0 }, name: "B3" },
  { stringNumber: 1, stringIndex: 5, midi: 64, spelling: { step: "E", alter: 0 }, name: "E4" },
]);

export const GUITAR_STANDARD_TUNING: readonly GuitarStringInfo[] = Object.freeze(
  STANDARD_OPEN_STRINGS.map((str) =>
    Object.freeze({
      stringNumber: str.stringNumber,
      stringIndex: str.stringIndex,
      openMidi: str.midi,
      openPitch: exactPitch(str.midi, str.spelling),
      openPitchClass: normalizePitchClass(str.midi),
      name: str.name,
    }),
  ),
);

// Diatonic note spellings for chromatic fret chromaticism (natural / sharp preference by default)
const CHROMATIC_SPELLINGS: readonly PitchSpelling[] = Object.freeze([
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
]);

export function getGuitarPitch(
  stringIndex: number,
  fret: number,
  spellingOverride?: PitchSpelling,
): ExactPitch {
  const stringInfo = GUITAR_STANDARD_TUNING[stringIndex];
  if (!stringInfo) {
    throw new RangeError(`Invalid guitar string index: ${stringIndex}. Expected 0..5.`);
  }
  if (fret < 0 || fret > 24) {
    throw new RangeError(`Invalid guitar fret: ${fret}. Expected 0..24.`);
  }

  const midi = stringInfo.openMidi + fret;
  const pc = normalizePitchClass(midi);
  const spelling = spellingOverride ?? CHROMATIC_SPELLINGS[pc]!;
  return exactPitch(midi, spelling);
}

export function getFretPitchClass(stringIndex: number, fret: number): PitchClassIdentity {
  const stringInfo = GUITAR_STANDARD_TUNING[stringIndex];
  if (!stringInfo) {
    throw new RangeError(`Invalid guitar string index: ${stringIndex}. Expected 0..5.`);
  }
  return normalizePitchClass(stringInfo.openMidi + fret);
}

export function formatGuitarStringLabel(stringInfo: GuitarStringInfo): string {
  return `${stringInfo.stringNumber} (${formatPitchSpelling(stringInfo.openPitch.spelling)})`;
}
