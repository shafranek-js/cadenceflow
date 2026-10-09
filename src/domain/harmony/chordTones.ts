import { defaultSeventhForQuality, effectiveChordQuality, type ChordDefinition } from "./chord";
import {
  normalizePitchClass,
  type DiatonicStep,
  type PitchClassIdentity,
  type PitchSpelling,
} from "./pitch";

const DIATONIC_STEPS: readonly DiatonicStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PITCH_CLASS: Readonly<Record<DiatonicStep, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function spellChordTone(
  root: PitchSpelling,
  semitoneOffset: number,
  diatonicDegree: number,
): PitchSpelling {
  const rootIndex = DIATONIC_STEPS.indexOf(root.step);
  const letterOffset = (diatonicDegree - 1) % 7;
  const step = DIATONIC_STEPS[(rootIndex + letterOffset) % 7]!;
  const targetPitchClass = normalizePitchClass(
    NATURAL_PITCH_CLASS[root.step] + root.alter + semitoneOffset,
  );
  let alter = targetPitchClass - NATURAL_PITCH_CLASS[step];
  while (alter > 6) alter -= 12;
  while (alter < -6) alter += 12;
  return Object.freeze({ step, alter });
}

export interface ResolvedChordTone {
  readonly diatonicDegree: number;
  readonly semitoneInterval: number;
  readonly pitchClass: PitchClassIdentity;
  readonly spelling: PitchSpelling;
}

function alteredInterval(
  chord: ChordDefinition,
  degree: 5 | 9 | 11 | 13,
  baseInterval: number,
): number {
  const alteration = chord.variant.alterations.find((item) => item.degree === degree);
  if (!alteration) return baseInterval;
  // b5/#5 name the pitch relative to a perfect fifth. Applying them to the already flattened
  // diminished fifth or raised augmented fifth would make the label and sounding interval drift.
  return degree === 5 ? 7 + alteration.semitones : baseInterval + alteration.semitones;
}

/**
 * Canonical source for the chord pitch set used by piano, bass, guitar, notation, and export.
 * Extension tones imply a seventh when one is not explicitly stored; add tones remain independent.
 */
export function resolveChordTones(chord: ChordDefinition): readonly ResolvedChordTone[] {
  const tones: ResolvedChordTone[] = [];
  const quality = effectiveChordQuality(chord);
  const rootSpelling = chord.spelling.root;

  const pushTone = (degree: number, interval: number): void => {
    tones.push(
      Object.freeze({
        diatonicDegree: degree,
        semitoneInterval: interval,
        pitchClass: normalizePitchClass(chord.rootPitchClass + interval),
        spelling: spellChordTone(rootSpelling, interval, degree),
      }),
    );
  };

  pushTone(1, 0);

  const suspension = chord.variant.suspensions[0];
  if (suspension === "sus2") pushTone(2, 2);
  else if (suspension === "sus4") pushTone(4, 5);
  else if (!chord.variant.no3) pushTone(3, quality === "minor" || quality === "diminished" ? 3 : 4);

  if (!chord.variant.no5) {
    let fifth = quality === "diminished" ? 6 : quality === "augmented" ? 8 : 7;
    fifth = alteredInterval(chord, 5, fifth);
    pushTone(5, fifth);
  }

  const extensionPresent = chord.variant.extensions.length > 0;
  const seventh =
    chord.variant.seventh ??
    (quality === "dominant" || extensionPresent ? defaultSeventhForQuality(quality) : undefined);
  if (seventh) {
    const interval = seventh === "major7" ? 11 : seventh === "diminished7" ? 9 : 10;
    pushTone(7, interval);
  }

  const has9 = chord.variant.extensions.includes(9) || chord.variant.add9 === true;
  const has11 = chord.variant.extensions.includes(11) || chord.variant.add11 === true;
  const has13 = chord.variant.extensions.includes(13) || chord.variant.add13 === true;
  if (has9) pushTone(9, alteredInterval(chord, 9, 14));
  if (has11) pushTone(11, alteredInterval(chord, 11, 17));
  if (has13) pushTone(13, alteredInterval(chord, 13, 21));

  return Object.freeze(tones);
}
