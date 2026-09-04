import type { ChordDefinition } from "../../domain/harmony/chord";
import {
  exactPitch,
  normalizePitchClass,
  type ExactPitch,
  type PitchClassIdentity,
  type PitchSpelling,
} from "../../domain/harmony/pitch";
import type { BassSettings } from "../../domain/progression/step";
import { PIANO_RANGE_MAX_MIDI, PIANO_RANGE_MIN_MIDI } from "../contracts";
import { spellChordTone } from "./voicing";

/**
 * Resolves the independent bass pitch for a chord step.
 *
 * Requirements:
 * - Bass is an independent lower voice below the upper voicing.
 * - Changing bass never restructures the upper voicing.
 * - Root / 3rd / 5th resolve accurately from the chord and structured variant.
 * - Custom preserves exact selected pitch, octave, and spelling.
 * - Auto bass prefers chord Root as default, considering an inversion only when
 *   it produces clearly smoother bass voice leading from previous bass context.
 * - Resulting pitch is strictly bounded within acoustic piano range (21..108).
 */
export function resolveBassPitch(
  chord: ChordDefinition,
  bassSettings: BassSettings,
  upperPitches?: readonly ExactPitch[],
  previousBassPitch?: ExactPitch,
): ExactPitch {
  const rootPc = chord.rootPitchClass;
  const rootSpelling = chord.spelling.root;

  // 1. Custom Bass
  if (bassSettings.choice === "custom" && bassSettings.customPitch) {
    return bassSettings.customPitch;
  }

  // 2. Determine target pitch class and spelling based on choice
  let targetPc: PitchClassIdentity;
  let targetSpelling: PitchSpelling;

  if (bassSettings.choice === "third") {
    let thirdInterval = 4;
    if (chord.baseQuality === "minor" || chord.baseQuality === "diminished") {
      thirdInterval = 3;
    }
    targetPc = normalizePitchClass(rootPc + thirdInterval);
    targetSpelling = spellChordTone(rootSpelling, thirdInterval, 3);
  } else if (bassSettings.choice === "fifth") {
    let fifthInterval = 7;
    if (chord.baseQuality === "diminished") fifthInterval = 6;
    if (chord.baseQuality === "augmented") fifthInterval = 8;
    const fifthAlteration = chord.variant.alterations?.find((a) => a.degree === 5);
    if (fifthAlteration) fifthInterval += fifthAlteration.semitones;

    targetPc = normalizePitchClass(rootPc + fifthInterval);
    targetSpelling = spellChordTone(rootSpelling, fifthInterval, 5);
  } else if (bassSettings.choice === "root") {
    targetPc = rootPc;
    targetSpelling = rootSpelling;
  } else {
    // choice === "auto"
    // Prefer Root as default.
    // If previous bass exists, consider chord tones (root, 3rd) if an inversion yields a smoother stepwise move
    targetPc = rootPc;
    targetSpelling = rootSpelling;

    if (previousBassPitch) {
      let thirdInterval = 4;
      if (chord.baseQuality === "minor" || chord.baseQuality === "diminished") {
        thirdInterval = 3;
      }
      const thirdPc = normalizePitchClass(rootPc + thirdInterval);

      // Distance from previous bass
      const rootDist = Math.min(
        Math.abs((rootPc - previousBassPitch.pitchClassIdentity + 12) % 12),
        Math.abs((previousBassPitch.pitchClassIdentity - rootPc + 12) % 12),
      );
      const thirdDist = Math.min(
        Math.abs((thirdPc - previousBassPitch.pitchClassIdentity + 12) % 12),
        Math.abs((previousBassPitch.pitchClassIdentity - thirdPc + 12) % 12),
      );

      // If third is clearly stepwise (1 or 2 semitones away) while root is a large leap (> 4 semitones)
      if (thirdDist <= 2 && rootDist > 4) {
        targetPc = thirdPc;
        targetSpelling = spellChordTone(rootSpelling, thirdInterval, 3);
      }
    }
  }

  // 3. Determine base MIDI pitch in comfortable piano bass octave (octave 3: 48..59)
  // This ensures base - 24 stays >= 21 (since 48 - 24 = 24 >= 21)
  const baseMidi = 48 + ((targetPc - 0 + 12) % 12);

  // 4. Apply octave offset
  let octaveOffsetSemitones = 0;
  if (bassSettings.octaveOffset === -1) {
    octaveOffsetSemitones = -12;
  } else if (bassSettings.octaveOffset === -2) {
    octaveOffsetSemitones = -24;
  }

  let finalMidi = baseMidi + octaveOffsetSemitones;

  // 5. Constrain within acoustic piano bounds (21..108)
  while (finalMidi < PIANO_RANGE_MIN_MIDI) finalMidi += 12;
  while (finalMidi > PIANO_RANGE_MAX_MIDI) finalMidi -= 12;

  return exactPitch(finalMidi, targetSpelling);
}
