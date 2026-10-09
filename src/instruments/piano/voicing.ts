import type { ChordDefinition } from "../../domain/harmony/chord";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import { exactPitch, type ExactPitch } from "../../domain/harmony/pitch";
import { resolveChordTones, type ResolvedChordTone } from "../../domain/harmony/chordTones";
import type { RegisterOffset, StepPerformance } from "../../domain/progression/step";
import { PIANO_RANGE_MAX_MIDI, PIANO_RANGE_MIN_MIDI, type ValidationResult } from "../contracts";
import { selectBestVoicing, type VoicingCandidate } from "./voiceLeading";
export { resolveChordTones, spellChordTone } from "../../domain/harmony/chordTones";
export type { ResolvedChordTone } from "../../domain/harmony/chordTones";

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
  performance: StepPerformance,
  _context: HarmonicContext,
  previousPitches?: readonly ExactPitch[],
): readonly ExactPitch[] {
  const candidates = generateVoicingCandidates(chord);
  if (candidates.length === 0) {
    // Fallback: simple root triad
    return [exactPitch(60, chord.spelling.root)];
  }

  let filteredCandidates = candidates;
  if (performance.inversion !== undefined && performance.inversion !== "auto") {
    const matching = candidates.filter((c) => c.inversionIndex === performance.inversion);
    if (matching.length > 0) {
      filteredCandidates = matching;
    }
  }

  const best = selectBestVoicing(filteredCandidates, previousPitches);
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
