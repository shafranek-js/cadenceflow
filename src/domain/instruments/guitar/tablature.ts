import { formatChordSymbol, type ChordDefinition } from "../../harmony/chord";
import type { ExactPitch, PitchClassIdentity } from "../../harmony/pitch";
import { resolveGuitarChordVoicing, type GuitarChordVoicing } from "./voicings";

export interface GuitarTabPosition {
  /** 1-based guitar string number: 1 (high E) to 6 (low E) */
  readonly str: 1 | 2 | 3 | 4 | 5 | 6;
  /** Fret number: 0 = open, 1..24 = fretted */
  readonly fret: number;
  /** Left-hand finger: 0 = open string, 1 = index, 2 = middle, 3 = ring, 4 = pinky */
  readonly finger?: 0 | 1 | 2 | 3 | 4 | undefined;
}

export { optimizeGuitarMelodyTab, type GuitarMelodyInputNote } from "./fingering";

const GUITAR_OPEN_MIDI_BY_STRING: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, number>> = Object.freeze({
  1: 64, // E4
  2: 59, // B3
  3: 55, // G3
  4: 50, // D3
  5: 45, // A2
  6: 40, // E2
});

/**
 * Maps an exact pitch or MIDI number to a natural, playable guitar string and fret.
 * - For "melody": prefers upper strings (1, 2, 3) in comfortable frets (0..15).
 * - For "bass": prefers lower strings (6, 5, 4) in low frets (0..7).
 */
export function pitchToGuitarTabPosition(
  pitch: ExactPitch | number,
  role: "melody" | "bass" = "melody",
): GuitarTabPosition {
  let midi = typeof pitch === "number" ? pitch : pitch.midiNumber;

  if (role === "bass") {
    while (midi < 40) midi += 12;
    while (midi > 65) midi -= 12;

    const bassStrings: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [6, 5, 4, 3];
    for (const str of bassStrings) {
      const open = GUITAR_OPEN_MIDI_BY_STRING[str];
      const fret = midi - open;
      if (fret >= 0 && fret <= 4) {
        const finger = (fret === 0 ? 0 : Math.max(1, Math.min(4, fret))) as 0 | 1 | 2 | 3 | 4;
        return Object.freeze({ str, fret, finger });
      }
    }
    const fret6 = Math.max(0, Math.min(24, midi - 40));
    const finger6 = (fret6 === 0 ? 0 : Math.max(1, Math.min(4, fret6))) as 0 | 1 | 2 | 3 | 4;
    return Object.freeze({ str: 6, fret: fret6, finger: finger6 });
  }

  // Melody role:
  while (midi < 40) midi += 12;
  while (midi > 88) midi -= 12;

  const melodyStrings: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];
  for (const str of melodyStrings) {
    const open = GUITAR_OPEN_MIDI_BY_STRING[str];
    const fret = midi - open;
    if (fret >= 0 && fret <= 15) {
      const finger = (fret === 0 ? 0 : Math.max(1, Math.min(4, fret))) as 0 | 1 | 2 | 3 | 4;
      return Object.freeze({ str, fret, finger });
    }
  }

  const fret1 = Math.max(0, Math.min(24, midi - 64));
  const finger1 = (fret1 === 0 ? 0 : Math.max(1, Math.min(4, fret1))) as 0 | 1 | 2 | 3 | 4;
  return Object.freeze({ str: 1, fret: fret1, finger: finger1 });
}

export interface GuitarTabStringPosition {
  /** 1-based guitar string number: 1 (highest pitch, high E) to 6 (lowest pitch, low E) */
  readonly stringNumber: 1 | 2 | 3 | 4 | 5 | 6;
  /** 0-based string index in tuning: 0 = low E, 5 = high E */
  readonly stringIndex: number;
  /** Tuning string name standard in tablature */
  readonly stringName: "e" | "B" | "G" | "D" | "A" | "E";
  /** Fret number: -1 = muted/unplayed, 0 = open, 1..24 = fretted */
  readonly fret: number;
  /** Display label for the fret: "x" for muted, or fret number */
  readonly fretLabel: string;
  readonly isMuted: boolean;
  readonly isOpen: boolean;
  readonly finger?: number | undefined;
}

export interface GuitarTabEntry {
  readonly chordSymbol: string;
  readonly baseFret: number;
  readonly positionLabel?: string | undefined;
  /** 6 strings ordered from top (1st string, high e) to bottom (6th string, low E) */
  readonly strings: readonly GuitarTabStringPosition[];
  readonly voicing: GuitarChordVoicing;
  readonly fretSummary: string;
}

const TAB_STRING_ORDER: readonly {
  readonly stringNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly stringIndex: number;
  readonly stringName: "e" | "B" | "G" | "D" | "A" | "E";
}[] = Object.freeze([
  { stringNumber: 1, stringIndex: 5, stringName: "e" },
  { stringNumber: 2, stringIndex: 4, stringName: "B" },
  { stringNumber: 3, stringIndex: 3, stringName: "G" },
  { stringNumber: 4, stringIndex: 2, stringName: "D" },
  { stringNumber: 5, stringIndex: 1, stringName: "A" },
  { stringNumber: 6, stringIndex: 0, stringName: "E" },
]);

/**
 * Resolves a guitar chord definition into a complete 6-string tablature projection.
 */
export function resolveGuitarTabEntry(
  chord: ChordDefinition,
  customChordLabel?: string,
  bassPitchClass?: PitchClassIdentity,
): GuitarTabEntry {
  const isSeventh = chord.baseQuality === "dominant" || chord.variant?.seventh !== undefined;
  const isMajor7 = chord.variant?.seventh === "major7";
  const resolvedBassPitchClass = bassPitchClass ?? chord.bassPitchClass;

  const voicing: GuitarChordVoicing = resolveGuitarChordVoicing({
    rootPitchClass: chord.rootPitchClass,
    baseQuality: chord.baseQuality,
    spelling: chord.spelling,
    isSeventh,
    isMajor7,
    ...(resolvedBassPitchClass !== undefined ? { bassPitchClass: resolvedBassPitchClass } : {}),
  });

  const strings: GuitarTabStringPosition[] = TAB_STRING_ORDER.map((meta) => {
    const fret = voicing.frets[meta.stringIndex] ?? -1;
    const isMuted = fret === -1;
    const isOpen = fret === 0;
    const fretLabel = isMuted ? "x" : String(fret);
    const finger = voicing.fingers ? voicing.fingers[meta.stringIndex] : undefined;

    return Object.freeze({
      stringNumber: meta.stringNumber,
      stringIndex: meta.stringIndex,
      stringName: meta.stringName,
      fret,
      fretLabel,
      isMuted,
      isOpen,
      finger: finger && finger > 0 ? finger : undefined,
    });
  });

  const positionLabel = voicing.baseFret > 1 ? `${voicing.baseFret}fr` : undefined;
  const fretSummary = voicing.frets.map((f) => (f === -1 ? "x" : String(f))).join(" ");

  return Object.freeze({
    chordSymbol: customChordLabel ?? formatChordSymbol(chord),
    baseFret: voicing.baseFret,
    positionLabel,
    strings: Object.freeze(strings),
    voicing,
    fretSummary,
  });
}
