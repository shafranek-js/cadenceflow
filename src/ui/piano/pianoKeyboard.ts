import type { ExactPitch } from "../../domain/harmony/pitch";

const WHITE_PITCH_CLASSES = Object.freeze([0, 2, 4, 5, 7, 9, 11]);
const BLACK_PITCH_CLASSES = Object.freeze([1, 3, 6, 8, 10]);
// The printed reference uses a compact seven-white-key keyboard on each card.
const MINIMUM_VISIBLE_WHITE_KEYS = 7;

export interface PianoKeyboardKey {
  readonly midi: number;
  readonly pitchClass: number;
  readonly isBlack: boolean;
  /** Index of the natural key immediately before this key. */
  readonly precedingWhiteIndex: number;
  readonly isActive: boolean;
}

export interface PianoKeyboardLayout {
  readonly startMidi: number;
  readonly endMidiExclusive: number;
  readonly whiteKeys: readonly PianoKeyboardKey[];
  readonly blackKeys: readonly PianoKeyboardKey[];
}

/**
 * The Piano Card contract is chord-only: the caller supplies the exact upper
 * voices and this view only normalizes their display order. Bass and scale
 * tones never enter this component.
 */
export function normalizeChordPitches(chordPitches: readonly ExactPitch[]): readonly ExactPitch[] {
  const uniqueByMidi = new Map<number, ExactPitch>();
  for (const pitch of chordPitches) {
    if (!uniqueByMidi.has(pitch.midiNumber)) uniqueByMidi.set(pitch.midiNumber, pitch);
  }
  return Object.freeze(
    [...uniqueByMidi.values()].sort((left, right) => left.midiNumber - right.midiNumber),
  );
}

export function buildPianoKeyboardLayout(chordPitches: readonly ExactPitch[]): PianoKeyboardLayout {
  const normalizedPitches = normalizeChordPitches(chordPitches);
  const firstMidi = normalizedPitches[0]?.midiNumber ?? 60;
  const lastMidi = normalizedPitches.at(-1)?.midiNumber ?? firstMidi;

  let firstNaturalMidi = firstMidi;
  while (firstNaturalMidi > 0 && !WHITE_PITCH_CLASSES.includes(firstNaturalMidi % 12)) {
    firstNaturalMidi -= 1;
  }

  const startMidi = firstNaturalMidi;

  let minimumEndMidiExclusive = startMidi;
  let visibleWhiteKeyCount = 0;
  while (visibleWhiteKeyCount < MINIMUM_VISIBLE_WHITE_KEYS) {
    if (WHITE_PITCH_CLASSES.includes(minimumEndMidiExclusive % 12)) visibleWhiteKeyCount += 1;
    minimumEndMidiExclusive += 1;
  }

  // Retain seven white keys for normal chords, but never clip a deliberately
  // wide manual voicing.
  const lastPitchNeedsFollowingWhiteKey = BLACK_PITCH_CLASSES.includes(lastMidi % 12);
  const requiredEndMidiExclusive = lastMidi + (lastPitchNeedsFollowingWhiteKey ? 2 : 1);
  const endMidiExclusive = Math.max(minimumEndMidiExclusive, requiredEndMidiExclusive);
  const active = new Set(normalizedPitches.map((pitch) => pitch.midiNumber));
  const whiteKeys: PianoKeyboardKey[] = [];
  const whiteIndexByMidi = new Map<number, number>();

  for (let midi = startMidi; midi < endMidiExclusive; midi += 1) {
    const pitchClass = midi % 12;
    if (!WHITE_PITCH_CLASSES.includes(pitchClass)) continue;
    const precedingWhiteIndex = whiteKeys.length;
    whiteIndexByMidi.set(midi, precedingWhiteIndex);
    whiteKeys.push({
      midi,
      pitchClass,
      isBlack: false,
      precedingWhiteIndex,
      isActive: active.has(midi),
    });
  }

  const blackKeys: PianoKeyboardKey[] = [];
  for (let midi = startMidi; midi < endMidiExclusive; midi += 1) {
    const pitchClass = midi % 12;
    if (!BLACK_PITCH_CLASSES.includes(pitchClass)) continue;
    const precedingWhiteIndex = whiteIndexByMidi.get(midi - 1);
    const followingWhiteIndex = whiteIndexByMidi.get(midi + 1);
    // A real black key always sits between two visible white keys. Omitting an
    // edge key here prevents the frame from showing a clipped half-key.
    if (precedingWhiteIndex === undefined || followingWhiteIndex === undefined) continue;
    blackKeys.push({
      midi,
      pitchClass,
      isBlack: true,
      precedingWhiteIndex,
      isActive: active.has(midi),
    });
  }

  return Object.freeze({
    startMidi,
    endMidiExclusive,
    whiteKeys: Object.freeze(whiteKeys),
    blackKeys: Object.freeze(blackKeys),
  });
}
