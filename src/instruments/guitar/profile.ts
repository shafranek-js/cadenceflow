import type { ExactPitch } from "../../domain/harmony/pitch";
import type {
  ArticulationDescriptor,
  CardViewDescriptor,
  InstrumentProfile,
  InstrumentRealization,
  InstrumentRealizationInput,
  ValidationResult,
} from "../contracts";
import { resolveGuitarChordVoicing } from "../../domain/instruments/guitar/voicings";

export const GUITAR_CARD_VIEWS: readonly CardViewDescriptor[] = Object.freeze([
  Object.freeze({ id: "guitar", label: "Guitar" }),
  Object.freeze({ id: "harmonic", label: "Harmonic" }),
  Object.freeze({ id: "piano", label: "Piano" }),
  Object.freeze({ id: "staff", label: "Staff" }),
]);

export const GUITAR_ARTICULATIONS: readonly ArticulationDescriptor[] = Object.freeze([
  Object.freeze({ id: "block", label: "Strum" }),
  Object.freeze({ id: "arp-up", label: "Arp Up" }),
  Object.freeze({ id: "arp-down", label: "Arp Down" }),
  Object.freeze({ id: "humanized", label: "Fingerstyle" }),
]);

export const GUITAR_RANGE_MIN_MIDI = 40; // E2
export const GUITAR_RANGE_MAX_MIDI = 88; // E6 (24th fret high E)

export function validateGuitarVoicing(pitches: readonly ExactPitch[]): ValidationResult {
  if (!pitches.length) {
    return { valid: false, messages: ["Guitar voicing must contain at least 1 pitch."] };
  }
  if (pitches.length > 6) {
    return { valid: false, messages: ["Guitar cannot voice more than 6 notes simultaneously."] };
  }

  const outOfRange = pitches.filter(
    (p) => p.midiNumber < GUITAR_RANGE_MIN_MIDI || p.midiNumber > GUITAR_RANGE_MAX_MIDI,
  );
  if (outOfRange.length > 0) {
    return {
      valid: false,
      messages: [
        `Pitch out of standard 6-string guitar range (${GUITAR_RANGE_MIN_MIDI}..${GUITAR_RANGE_MAX_MIDI}).`,
      ],
    };
  }

  return { valid: true, messages: [] };
}

export const guitarProfile: InstrumentProfile = Object.freeze({
  id: "guitar",
  displayName: "Acoustic Guitar",
  supportedCardViews(): readonly CardViewDescriptor[] {
    return GUITAR_CARD_VIEWS;
  },
  supportedArticulations(): readonly ArticulationDescriptor[] {
    return GUITAR_ARTICULATIONS;
  },
  validateManualVoicing(pitches: readonly ExactPitch[]): ValidationResult {
    return validateGuitarVoicing(pitches);
  },
  realizeChord(input: InstrumentRealizationInput): InstrumentRealization {
    const isSeventh =
      input.chord.baseQuality === "dominant" || input.chord.variant?.seventh !== undefined;
    const isMajor7 = input.chord.variant?.seventh === "major7";
    const voicing = resolveGuitarChordVoicing({
      rootPitchClass: input.chord.rootPitchClass,
      baseQuality: input.chord.baseQuality,
      spelling: input.chord.spelling,
      isSeventh,
      isMajor7,
    });

    const pitches = voicing.pitches;
    const bassPitch = pitches[0];

    return Object.freeze({
      pitches,
      ...(bassPitch ? { bassPitch } : {}),
    });
  },
});
