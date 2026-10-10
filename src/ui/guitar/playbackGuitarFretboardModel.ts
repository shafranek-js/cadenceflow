import { GUITAR_STANDARD_TUNING } from "../../domain/instruments/guitar/tuning";
import { pitchToGuitarTabPosition } from "../../domain/instruments/guitar/tablature";
import type { KeyboardScheduledNote } from "../transport/transportStore";

export type PlaybackGuitarMarkerRole = "chord" | "melody";

export interface PlaybackGuitarNoteSource {
  readonly id: string;
  readonly notes: readonly KeyboardScheduledNote[];
  /** Audio-clock time for this source. Independent preview clocks must not be compared. */
  readonly now: number;
}

export interface PlaybackGuitarMarker {
  readonly key: string;
  readonly stringIndex: number;
  readonly stringNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly fret: number;
  readonly role: PlaybackGuitarMarkerRole;
  readonly pitch: number;
  readonly voiceIds: readonly string[];
  readonly parts: readonly ("upper" | "bass" | "melody")[];
}

export interface PlaybackGuitarOutsideNote {
  readonly key: string;
  readonly pitch: number;
  readonly role: PlaybackGuitarMarkerRole;
  readonly voiceIds: readonly string[];
  readonly parts: readonly ("upper" | "bass" | "melody")[];
}

export interface PlaybackGuitarFretboardSnapshot {
  readonly markers: readonly PlaybackGuitarMarker[];
  readonly outsideRange: readonly PlaybackGuitarOutsideNote[];
}

interface MutableVoiceGroup {
  pitch: number;
  role: PlaybackGuitarMarkerRole;
  voiceIds: Set<string>;
  parts: Set<"upper" | "bass" | "melody">;
}

interface MutableMarkerGroup extends MutableVoiceGroup {
  key: string;
  stringIndex: number;
  stringNumber: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
}

function voiceIdFor(sourceId: string, note: KeyboardScheduledNote, index: number): string {
  return (
    note.voiceId ?? `${sourceId}:${note.part}:${note.pitch}:${note.start}:${note.end}:${index}`
  );
}

function markerRole(part: KeyboardScheduledNote["part"]): PlaybackGuitarMarkerRole {
  return part === "melody" ? "melody" : "chord";
}

interface ExactGuitarPosition {
  readonly stringIndex: number;
  readonly stringNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly fret: number;
}

function exactGuitarPosition(note: KeyboardScheduledNote): ExactGuitarPosition | null {
  const preferred = pitchToGuitarTabPosition(note.pitch, note.part === "bass" ? "bass" : "melody");
  const preferredStringIndex = 6 - preferred.str;
  const preferredTuning = GUITAR_STANDARD_TUNING[preferredStringIndex];
  if (
    preferredTuning &&
    preferred.fret >= 0 &&
    preferred.fret <= 24 &&
    preferredTuning.openMidi + preferred.fret === note.pitch
  ) {
    return {
      stringIndex: preferredStringIndex,
      stringNumber: preferred.str,
      fret: preferred.fret,
    };
  }

  // Preserve the mapper's preferred string when it folded an octave and the exact octave still
  // fits on that string (for example bass MIDI 69: G3 fret 2 folds from 69 to 57; G3 fret 14 is
  // the exact pitch). This is a display-only recovery; the shared TAB mapper remains unchanged.
  if (preferredTuning) {
    const foldedMidi = preferredTuning.openMidi + preferred.fret;
    const octaveDelta = note.pitch - foldedMidi;
    const exactFret = preferred.fret + octaveDelta;
    if (
      octaveDelta !== 0 &&
      octaveDelta % 12 === 0 &&
      exactFret >= 0 &&
      exactFret <= 24 &&
      preferredTuning.openMidi + exactFret === note.pitch
    ) {
      return {
        stringIndex: preferredStringIndex,
        stringNumber: preferred.str,
        fret: exactFret,
      };
    }
  }

  // Some exact notes are playable on another string even when the role-specific mapper folds
  // them. Search raw MIDI against every fret without octave substitution or fret clamping.
  const stringOrder = note.part === "bass" ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
  for (const stringIndex of stringOrder) {
    const tuning = GUITAR_STANDARD_TUNING[stringIndex]!;
    const fret = note.pitch - tuning.openMidi;
    if (fret >= 0 && fret <= 24) {
      return {
        stringIndex,
        stringNumber: (6 - stringIndex) as 1 | 2 | 3 | 4 | 5 | 6,
        fret,
      };
    }
  }
  return null;
}

function finalizeVoiceGroup(group: MutableVoiceGroup, key: string): PlaybackGuitarOutsideNote {
  return {
    key,
    pitch: group.pitch,
    role: group.role,
    voiceIds: [...group.voiceIds].sort(),
    parts: [...group.parts].sort(),
  };
}

/**
 * Projects the exact voices sounding in each source's own audio-clock domain onto standard
 * tuning. Upper and bass voices share the chord color, while Melody remains a separate marker even
 * when it doubles the same fret. The legacy TAB mapper may octave-fold or clamp its result; those
 * positions are accepted only when they reproduce the original MIDI pitch exactly.
 */
export function projectPlaybackGuitarFretboard(
  sources: readonly PlaybackGuitarNoteSource[],
): PlaybackGuitarFretboardSnapshot {
  const markers = new Map<string, MutableMarkerGroup>();
  const outsideRange = new Map<string, MutableVoiceGroup>();

  for (const source of sources) {
    source.notes.forEach((note, index) => {
      if (
        note.part === "metronome" ||
        !Number.isInteger(note.pitch) ||
        note.pitch < 0 ||
        note.pitch > 127 ||
        !Number.isFinite(note.start) ||
        !Number.isFinite(note.end) ||
        !Number.isFinite(source.now) ||
        note.start > source.now ||
        source.now >= note.end
      ) {
        return;
      }

      const role = markerRole(note.part);
      const voiceId = voiceIdFor(source.id, note, index);
      const position = exactGuitarPosition(note);

      if (!position) {
        const key = `${role}:${note.pitch}`;
        const group = outsideRange.get(key) ?? {
          pitch: note.pitch,
          role,
          voiceIds: new Set<string>(),
          parts: new Set<"upper" | "bass" | "melody">(),
        };
        group.voiceIds.add(voiceId);
        group.parts.add(note.part);
        outsideRange.set(key, group);
        return;
      }

      const key = `${position.stringIndex}:${position.fret}:${role}`;
      const group = markers.get(key) ?? {
        key,
        stringIndex: position.stringIndex,
        stringNumber: position.stringNumber,
        fret: position.fret,
        pitch: note.pitch,
        role,
        voiceIds: new Set<string>(),
        parts: new Set<"upper" | "bass" | "melody">(),
      };
      group.voiceIds.add(voiceId);
      group.parts.add(note.part);
      markers.set(key, group);
    });
  }

  return {
    markers: [...markers.values()]
      .map((group) => ({
        key: group.key,
        stringIndex: group.stringIndex,
        stringNumber: group.stringNumber,
        fret: group.fret,
        role: group.role,
        pitch: group.pitch,
        voiceIds: [...group.voiceIds].sort(),
        parts: [...group.parts].sort(),
      }))
      .sort(
        (left, right) =>
          left.stringIndex - right.stringIndex ||
          left.fret - right.fret ||
          left.role.localeCompare(right.role),
      ),
    outsideRange: [...outsideRange.entries()]
      .map(([key, group]) => finalizeVoiceGroup(group, key))
      .sort((left, right) => left.pitch - right.pitch || left.role.localeCompare(right.role)),
  };
}

export type PlaybackGuitarAttackMemory = ReadonlyMap<string, readonly string[]>;

export interface PlaybackGuitarAttackResult {
  /** Marker keys with at least one newly active voice identity at an already-seen position. */
  readonly repeatedMarkerKeys: readonly string[];
  /** Kept per physical position, so memory stays bounded by fretboard cells. */
  readonly memory: PlaybackGuitarAttackMemory;
}

/** Detects new voices at the same role/string/fret, including a reattack after a short release. */
export function detectPlaybackGuitarReattacks(
  markers: readonly PlaybackGuitarMarker[],
  previous: PlaybackGuitarAttackMemory,
): PlaybackGuitarAttackResult {
  const memory = new Map(previous);
  const repeatedMarkerKeys: string[] = [];

  for (const marker of markers) {
    const previousIds = previous.get(marker.key);
    if (previousIds && marker.voiceIds.some((voiceId) => !previousIds.includes(voiceId))) {
      repeatedMarkerKeys.push(marker.key);
    }
    memory.set(marker.key, marker.voiceIds);
  }

  return { repeatedMarkerKeys, memory };
}

export function guitarMidiNoteName(pitch: number): string {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}
