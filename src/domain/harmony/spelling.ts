import type { DerivedMode } from "./functions";
import { normalizePitchClass, type DiatonicStep, type PitchClassIdentity, type PitchSpelling } from "./pitch";

const STEPS: readonly DiatonicStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PC: Readonly<Record<DiatonicStep, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Canonical tonic spelling chooses the conventional key signature with fewer accidentals.
const MAJOR_TONICS: readonly PitchSpelling[] = [
  { step: "C", alter: 0 }, { step: "D", alter: -1 }, { step: "D", alter: 0 }, { step: "E", alter: -1 },
  { step: "E", alter: 0 }, { step: "F", alter: 0 }, { step: "F", alter: 1 }, { step: "G", alter: 0 },
  { step: "A", alter: -1 }, { step: "A", alter: 0 }, { step: "B", alter: -1 }, { step: "B", alter: 0 },
];

const MINOR_TONICS: readonly PitchSpelling[] = [
  { step: "C", alter: 0 }, { step: "C", alter: 1 }, { step: "D", alter: 0 }, { step: "E", alter: -1 },
  { step: "E", alter: 0 }, { step: "F", alter: 0 }, { step: "F", alter: 1 }, { step: "G", alter: 0 },
  { step: "G", alter: 1 }, { step: "A", alter: 0 }, { step: "B", alter: -1 }, { step: "B", alter: 0 },
];

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const;

export function defaultTonicSpelling(tonic: PitchClassIdentity, mode: DerivedMode): PitchSpelling {
  return (mode === "major" ? MAJOR_TONICS : MINOR_TONICS)[normalizePitchClass(tonic)]!;
}

export function spellingToPitchClass(spelling: PitchSpelling): PitchClassIdentity {
  return normalizePitchClass(NATURAL_PC[spelling.step] + spelling.alter);
}

export function spellScaleDegree(
  tonic: PitchClassIdentity,
  mode: DerivedMode,
  degree: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  chromaticAlter = 0,
): PitchSpelling {
  const tonicSpelling = defaultTonicSpelling(tonic, mode);
  const tonicStepIndex = STEPS.indexOf(tonicSpelling.step);
  const step = STEPS[(tonicStepIndex + degree - 1) % 7]!;
  const intervals = mode === "major" ? MAJOR_INTERVALS : NATURAL_MINOR_INTERVALS;
  const targetPc = normalizePitchClass(tonic + intervals[degree - 1]! + chromaticAlter);
  const naturalPc = NATURAL_PC[step];
  let alter = targetPc - naturalPc;
  while (alter > 6) alter -= 12;
  while (alter < -6) alter += 12;
  return { step, alter };
}

export function spellLeadingTone(targetSpelling: PitchSpelling): PitchSpelling {
  const targetPc = spellingToPitchClass(targetSpelling);
  const stepIndex = STEPS.indexOf(targetSpelling.step);
  const step = STEPS[(stepIndex + 6) % 7]!;
  const targetLeadingTonePc = normalizePitchClass(targetPc - 1);
  const naturalPc = NATURAL_PC[step];
  let alter = targetLeadingTonePc - naturalPc;
  while (alter > 6) alter -= 12;
  while (alter < -6) alter += 12;
  return { step, alter };
}

export function formatPitchSpelling(value: PitchSpelling): string {
  if (value.alter === 0) return value.step;
  const sign = value.alter > 0 ? "#" : "b";
  return `${value.step}${sign.repeat(Math.abs(value.alter))}`;
}

export function applyManualSpellingOverride(defaultSpelling: PitchSpelling, override?: PitchSpelling): PitchSpelling {
  return override ? Object.freeze({ ...override }) : Object.freeze({ ...defaultSpelling });
}
