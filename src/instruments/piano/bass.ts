import type { ChordDefinition } from "../../domain/harmony/chord";
import {
  exactPitch,
  type ExactPitch,
  type PitchClassIdentity,
  type PitchSpelling,
} from "../../domain/harmony/pitch";
import type { BassSettings } from "../../domain/progression/step";
import { PIANO_RANGE_MAX_MIDI, PIANO_RANGE_MIN_MIDI } from "../contracts";
import { resolveChordTones } from "../../domain/harmony/chordTones";

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
  concertTranspositionSemitones = 0,
): ExactPitch {
  const rootPc = chord.rootPitchClass;
  const rootSpelling = chord.spelling.root;

  // 1. Custom Bass
  if (bassSettings.choice === "custom") {
    if (!bassSettings.customPitch) {
      throw new Error("Custom bass pitch is required when bass choice is 'custom'");
    }
    const sourceMidi =
      bassSettings.customPitch.midiNumber +
      (bassSettings.customPitch.transpositionCompensationSemitones ?? 0);
    const concertMidi = sourceMidi + concertTranspositionSemitones;
    if (concertMidi < PIANO_RANGE_MIN_MIDI || concertMidi > PIANO_RANGE_MAX_MIDI) {
      throw new RangeError(
        `Custom bass concert pitch MIDI ${concertMidi} is outside piano range (${PIANO_RANGE_MIN_MIDI}..${PIANO_RANGE_MAX_MIDI})`,
      );
    }
    return bassSettings.customPitch;
  }

  // 2. Resolve explicit chord-member choices through the same interval list as the upper voicing.
  let targetPc: PitchClassIdentity;
  let targetSpelling: PitchSpelling;
  const bassDegree: Readonly<Partial<Record<BassSettings["choice"], number>>> = {
    root: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    seventh: 7,
    ninth: 9,
    eleventh: 11,
    thirteenth: 13,
  };
  const explicitTone = bassDegree[bassSettings.choice]
    ? resolveChordTones(chord).find(
        (tone) => tone.diatonicDegree === bassDegree[bassSettings.choice],
      )
    : undefined;

  if (explicitTone) {
    targetPc = explicitTone.pitchClass;
    targetSpelling = explicitTone.spelling;
  } else {
    // A stale explicit choice from a legacy project is safe: resolve it as Root until the user
    // chooses a chord tone that exists in the current variant.
    // A harmonic definition may provide an explicit semantic inversion (for
    // example N6's IV-degree bass). It is the default only; an authored bass
    // choice still remains authoritative.
    if (
      bassSettings.choice === "auto" &&
      chord.bassPitchClass !== undefined &&
      chord.bassSpelling
    ) {
      targetPc = chord.bassPitchClass;
      targetSpelling = chord.bassSpelling;
    } else {
      // Prefer Root as default.
      // If previous bass exists, consider chord tones (root, 3rd) if an inversion yields a smoother stepwise move
      targetPc = rootPc;
      targetSpelling = rootSpelling;

      const thirdTone = resolveChordTones(chord).find((tone) => tone.diatonicDegree === 3);
      if (previousBassPitch && thirdTone) {
        const thirdPc = thirdTone.pitchClass;

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
          targetSpelling = thirdTone.spelling;
        }
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

  const concertMidi = finalMidi + concertTranspositionSemitones;
  if (concertMidi < PIANO_RANGE_MIN_MIDI || concertMidi > PIANO_RANGE_MAX_MIDI) {
    throw new RangeError(
      `Bass concert pitch MIDI ${concertMidi} is outside piano range (${PIANO_RANGE_MIN_MIDI}..${PIANO_RANGE_MAX_MIDI})`,
    );
  }

  return exactPitch(finalMidi, targetSpelling);
}
