import type { ChordDefinition } from "../../domain/harmony/chord";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import {
  exactPitch,
  normalizePitchClass,
  type DiatonicStep,
  type ExactPitch,
  type PitchClassIdentity,
  type PitchSpelling,
} from "../../domain/harmony/pitch";
import type { RegisterOffset, StepPerformance } from "../../domain/progression/step";
import { PIANO_RANGE_MAX_MIDI, PIANO_RANGE_MIN_MIDI, type ValidationResult } from "../contracts";
import { selectBestVoicing, type VoicingCandidate } from "./voiceLeading";

const STEPS: readonly DiatonicStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PC: Readonly<Record<DiatonicStep, number>> = {
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
  const rootIndex = STEPS.indexOf(root.step);
  const letterOffset = (diatonicDegree - 1) % 7;
  const step = STEPS[(rootIndex + letterOffset) % 7]!;
  const targetPc = normalizePitchClass(NATURAL_PC[root.step] + root.alter + semitoneOffset);
  let alter = targetPc - NATURAL_PC[step];
  while (alter > 6) alter -= 12;
  while (alter < -6) alter += 12;
  return { step, alter };
}

export interface ResolvedChordTone {
  readonly diatonicDegree: number;
  readonly semitoneInterval: number;
  readonly pitchClass: PitchClassIdentity;
  readonly spelling: PitchSpelling;
}

/**
 * Resolves all distinct chord tones required by a ChordDefinition and its structured HarmonicVariant.
 */
export function resolveChordTones(chord: ChordDefinition): readonly ResolvedChordTone[] {
  const tones: ResolvedChordTone[] = [];
  const rootSpelling = chord.spelling.root;

  // 1. Root
  tones.push({
    diatonicDegree: 1,
    semitoneInterval: 0,
    pitchClass: chord.rootPitchClass,
    spelling: rootSpelling,
  });

  // 2. Third or Suspension
  const hasSus2 = chord.variant.suspensions?.includes("sus2");
  const hasSus4 = chord.variant.suspensions?.includes("sus4");

  if (hasSus2) {
    tones.push({
      diatonicDegree: 2,
      semitoneInterval: 2,
      pitchClass: normalizePitchClass(chord.rootPitchClass + 2),
      spelling: spellChordTone(rootSpelling, 2, 2),
    });
  } else if (hasSus4) {
    tones.push({
      diatonicDegree: 4,
      semitoneInterval: 5,
      pitchClass: normalizePitchClass(chord.rootPitchClass + 5),
      spelling: spellChordTone(rootSpelling, 5, 4),
    });
  } else {
    let thirdInterval = 4; // Major default
    if (chord.baseQuality === "minor" || chord.baseQuality === "diminished") {
      thirdInterval = 3;
    }
    tones.push({
      diatonicDegree: 3,
      semitoneInterval: thirdInterval,
      pitchClass: normalizePitchClass(chord.rootPitchClass + thirdInterval),
      spelling: spellChordTone(rootSpelling, thirdInterval, 3),
    });
  }

  // 3. Fifth (+ alterations)
  let fifthInterval = 7;
  if (chord.baseQuality === "diminished") fifthInterval = 6;
  if (chord.baseQuality === "augmented") fifthInterval = 8;

  const fifthAlteration = chord.variant.alterations?.find((a) => a.degree === 5);
  if (fifthAlteration) {
    fifthInterval += fifthAlteration.semitones;
  }
  tones.push({
    diatonicDegree: 5,
    semitoneInterval: fifthInterval,
    pitchClass: normalizePitchClass(chord.rootPitchClass + fifthInterval),
    spelling: spellChordTone(rootSpelling, fifthInterval, 5),
  });

  // 4. Seventh
  let seventhInterval: number | null = null;
  if (chord.variant.seventh) {
    switch (chord.variant.seventh) {
      case "minor7":
      case "half-diminished7":
        seventhInterval = 10;
        break;
      case "major7":
        seventhInterval = 11;
        break;
      case "diminished7":
        seventhInterval = 9;
        break;
    }
  } else if (chord.baseQuality === "dominant") {
    seventhInterval = 10;
  }

  if (seventhInterval !== null) {
    tones.push({
      diatonicDegree: 7,
      semitoneInterval: seventhInterval,
      pitchClass: normalizePitchClass(chord.rootPitchClass + seventhInterval),
      spelling: spellChordTone(rootSpelling, seventhInterval, 7),
    });
  }

  // 5. Extensions & Tensions (9, 11, 13, add9)
  const has9 = chord.variant.extensions?.includes(9) || chord.variant.add9;
  if (has9) {
    let ninthInterval = 14;
    const ninthAlteration = chord.variant.alterations?.find((a) => a.degree === 9);
    if (ninthAlteration) ninthInterval += ninthAlteration.semitones;
    tones.push({
      diatonicDegree: 9,
      semitoneInterval: ninthInterval,
      pitchClass: normalizePitchClass(chord.rootPitchClass + ninthInterval),
      spelling: spellChordTone(rootSpelling, ninthInterval, 9),
    });
  }

  const has11 = chord.variant.extensions?.includes(11);
  if (has11) {
    let eleventhInterval = 17;
    const eleventhAlteration = chord.variant.alterations?.find((a) => a.degree === 11);
    if (eleventhAlteration) eleventhInterval += eleventhAlteration.semitones;
    tones.push({
      diatonicDegree: 11,
      semitoneInterval: eleventhInterval,
      pitchClass: normalizePitchClass(chord.rootPitchClass + eleventhInterval),
      spelling: spellChordTone(rootSpelling, eleventhInterval, 11),
    });
  }

  const has13 = chord.variant.extensions?.includes(13);
  if (has13) {
    let thirteenthInterval = 21;
    const thirteenthAlteration = chord.variant.alterations?.find((a) => a.degree === 13);
    if (thirteenthAlteration) thirteenthInterval += thirteenthAlteration.semitones;
    tones.push({
      diatonicDegree: 13,
      semitoneInterval: thirteenthInterval,
      pitchClass: normalizePitchClass(chord.rootPitchClass + thirteenthInterval),
      spelling: spellChordTone(rootSpelling, thirteenthInterval, 13),
    });
  }

  return tones;
}

/**
 * Generates playable piano candidates for a given chord across inversions and octaves.
 */
export function generateVoicingCandidates(chord: ChordDefinition): readonly VoicingCandidate[] {
  const tones = resolveChordTones(chord);
  const n = tones.length;
  const candidates: VoicingCandidate[] = [];

  // Generate candidates across inversions
  for (let inv = 0; inv < n; inv++) {
    const rotatedTones: ResolvedChordTone[] = [];
    for (let i = 0; i < n; i++) {
      rotatedTones.push(tones[(inv + i) % n]!);
    }

    // Try starting the lowest voice in octaves 3, 4, and 5 (MIDI 48, 60, 72)
    const baseOctaves = [3, 4, 5];
    for (const baseOctave of baseOctaves) {
      const pitches: ExactPitch[] = [];
      let lastMidi = -1;
      let valid = true;

      for (let i = 0; i < n; i++) {
        const tone = rotatedTones[i]!;
        let midi: number;

        if (i === 0) {
          midi = baseOctave * 12 + tone.pitchClass;
          // Ensure within reasonable lower boundary for upper voicing
          if (midi < 48) midi += 12;
        } else {
          // Find lowest MIDI with tone.pitchClass strictly > lastMidi
          let candidateMidi = lastMidi + 1;
          while (candidateMidi % 12 !== tone.pitchClass) {
            candidateMidi++;
          }
          midi = candidateMidi;
        }

        if (midi < PIANO_RANGE_MIN_MIDI || midi > PIANO_RANGE_MAX_MIDI) {
          valid = false;
          break;
        }

        pitches.push(exactPitch(midi, tone.spelling));
        lastMidi = midi;
      }

      if (valid && pitches.length === n) {
        candidates.push(Object.freeze({ pitches: Object.freeze(pitches), inversionIndex: inv }));
      }
    }
  }

  return candidates;
}

/**
 * Performs contextual auto-voicing choosing the smoothest voice leading from previous context.
 */
export function contextualAutoVoicing(
  chord: ChordDefinition,
  _performance: StepPerformance,
  _context: HarmonicContext,
  previousPitches?: readonly ExactPitch[],
): readonly ExactPitch[] {
  const candidates = generateVoicingCandidates(chord);
  if (candidates.length === 0) {
    // Fallback: simple root triad
    return [exactPitch(60, chord.spelling.root)];
  }

  const best = selectBestVoicing(candidates, previousPitches);
  return best.pitches;
}

/**
 * Applies a step register offset (Auto / -2 / -1 / 0 / +1 / +2) to automatic upper voicing.
 * Constrains all pitches strictly within acoustic piano range (21..108).
 * Never alters manual exact voicings.
 */
export function applyRegisterOffset(
  pitches: readonly ExactPitch[],
  register: RegisterOffset,
): readonly ExactPitch[] {
  if (register === "auto" || register === 0 || typeof register !== "number") {
    return pitches;
  }

  const semitoneShift = register * 12;
  const shifted: ExactPitch[] = [];

  for (const pitch of pitches) {
    let targetMidi = pitch.midiNumber + semitoneShift;
    // Keep bounded within 21..108 by nearest playable octave
    while (targetMidi < PIANO_RANGE_MIN_MIDI) targetMidi += 12;
    while (targetMidi > PIANO_RANGE_MAX_MIDI) targetMidi -= 12;
    shifted.push(exactPitch(targetMidi, pitch.spelling));
  }

  return Object.freeze(shifted);
}

/**
 * Validates manual exact-pitch voicings according to acoustic piano bounds and constraints.
 */
export function validateManualVoicing(pitches: readonly ExactPitch[]): ValidationResult {
  if (!pitches || pitches.length === 0) {
    return Object.freeze({
      valid: false,
      messages: Object.freeze(["Manual voicing must contain at least one pitch."]),
    });
  }

  const messages: string[] = [];
  for (const pitch of pitches) {
    if (pitch.midiNumber < PIANO_RANGE_MIN_MIDI || pitch.midiNumber > PIANO_RANGE_MAX_MIDI) {
      messages.push(
        `Pitch ${pitch.midiNumber} is outside piano range (${PIANO_RANGE_MIN_MIDI}..${PIANO_RANGE_MAX_MIDI})`,
      );
    }
  }

  return Object.freeze({
    valid: messages.length === 0,
    messages: Object.freeze(messages),
  });
}
