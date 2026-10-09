import type { Project } from "../../domain/project/project";
import { getHarmonicModule } from "../../domain/harmony/moduleRegistry";
import { realizeProgressionAudioEvents } from "../../audio/eventRealizer";
import { createEffectiveMelodyTimeline } from "../../domain/melody/effectiveTimeline";
import type { KeyboardScheduledNote } from "../transport/transportStore";

export interface KeyboardPreferences {
  readonly visible: boolean;
  readonly range: "auto" | "88";
  readonly parts: "all" | "melody";
}
export const KEYBOARD_STORAGE_KEY = "cadenceflow.playbackKeyboard";
export const DEFAULT_KEYBOARD_PREFERENCES: KeyboardPreferences = {
  visible: false,
  range: "auto",
  parts: "all",
};
export function readKeyboardPreferences(): KeyboardPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEYBOARD_STORAGE_KEY) ?? "null");
    return {
      visible: value?.visible === true,
      range: value?.range === "88" ? "88" : "auto",
      parts: value?.parts === "melody" ? "melody" : "all",
    };
  } catch {
    return DEFAULT_KEYBOARD_PREFERENCES;
  }
}
export function saveKeyboardPreferences(value: KeyboardPreferences): void {
  try {
    localStorage.setItem(KEYBOARD_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
export function autoKeyboardRange(pitches: readonly number[]): readonly [number, number] {
  if (!pitches.length) return [48, 71];
  let start = Math.max(0, Math.floor(Math.min(...pitches) / 12) * 12);
  let end = Math.min(127, Math.floor(Math.max(...pitches) / 12) * 12 + 11);
  if (end - start < 23) {
    end = Math.min(127, start + 23);
    start = Math.max(0, Math.floor(Math.min(start, end - 23) / 12) * 12);
  }
  return [start, end];
}
export function compositionKeyboardRange(project: Project): readonly [number, number] {
  const mode = getHarmonicModule(project.activeModule).mode;
  const harmony = realizeProgressionAudioEvents({
    steps: project.progression.steps,
    tonic: project.tonic,
    context: {
      tonic: project.tonic,
      mode,
      moduleId: project.activeModule,
      spellingContext: { tonic: project.tonic, mode },
    },
    tempoBpm: project.globalTiming.tempoBpm,
    groove: project.groove,
    independentBassEnabled: project.independentBassEnabled,
  });
  return autoKeyboardRange([
    ...harmony.map((note) => note.pitch),
    ...createEffectiveMelodyTimeline(project).map((note) => note.pitch.midiNumber),
  ]);
}
export function activeKeyboardPitches(
  notes: readonly KeyboardScheduledNote[],
  now: number,
  parts: KeyboardPreferences["parts"],
): readonly number[] {
  return [
    ...new Set(
      notes
        .filter(
          (note) =>
            note.start <= now && now < note.end && (parts === "all" || note.part === "melody"),
        )
        .map((note) => note.pitch),
    ),
  ].sort((a, b) => a - b);
}

/** Which hand a sounding voice belongs to. */
export type KeyboardHand = "left" | "right";

/**
 * Maps a scheduled voice to the hand that plays it.
 *
 * Melody is the right hand; the chord's upper voices and its bass line are the left. Any other
 * role is treated as left hand, which is the safer default on a piano keyboard.
 */
export function keyboardHandForRole(role: KeyboardScheduledNote["part"]): KeyboardHand {
  return role === "melody" ? "right" : "left";
}

/** A key that is sounding right now, with the hand playing it and the note's onset. */
export interface ActiveKeyboardKey {
  readonly pitch: number;
  readonly hand: KeyboardHand;
  /**
   * Onset of the most recent strike of this pitch, in audio-clock seconds.
   *
   * This is the *latest* onset among the voices sharing the pitch, not the earliest. When a melody
   * re-strikes a pitch the chord is already sustaining, only the newer onset reveals that a second
   * note began — keeping the earlier one would make the repeat indistinguishable from a hold.
   */
  readonly onsetSeconds: number;
  /** Stable identities of the voices currently holding this key down. */
  readonly attackIds?: readonly string[];
}

/** Active voice identities per pitch, carried across animation frames. */
export type KeyboardStrikeMemory = ReadonlyMap<number, number | readonly string[]>;

/**
 * Sounding keys, one entry per pitch.
 *
 * A pitch can sound in several voices at once (a melody note doubling a chord tone). Melody wins
 * the colour in that case, so the right hand stays identifiable instead of flickering between
 * hands for a pitch both hands happen to share.
 */
export function activeKeyboardKeys(
  notes: readonly KeyboardScheduledNote[],
  now: number,
  parts: KeyboardPreferences["parts"],
): readonly ActiveKeyboardKey[] {
  const byPitch = new Map<number, ActiveKeyboardKey>();

  for (const note of notes) {
    if (note.start > now || now >= note.end) continue;
    if (parts === "melody" && note.part !== "melody") continue;

    const hand = keyboardHandForRole(note.part);
    const existing = byPitch.get(note.pitch);
    if (!existing) {
      byPitch.set(note.pitch, {
        pitch: note.pitch,
        hand,
        onsetSeconds: note.start,
        attackIds: [note.voiceId ?? `${note.part}:${note.pitch}:${note.start}`],
      });
      continue;
    }
    byPitch.set(note.pitch, {
      pitch: note.pitch,
      // Melody wins so that a shared pitch reads as the right hand.
      hand: existing.hand === "right" || hand === "right" ? "right" : "left",
      // The newest strike is what a repeat is measured against (see `onsetSeconds`).
      onsetSeconds: Math.max(existing.onsetSeconds, note.start),
      attackIds: [
        ...new Set([
          ...(existing.attackIds ?? []),
          note.voiceId ?? `${note.part}:${note.pitch}:${note.start}`,
        ]),
      ],
    });
  }

  return [...byPitch.values()].sort((a, b) => a.pitch - b.pitch);
}

export interface KeyboardNoteSource {
  readonly order: number;
  readonly notes: readonly KeyboardScheduledNote[];
  readonly now: number;
}

/** Merges independently clocked transport and preview sources without comparing their clock times. */
export function activeKeyboardKeysAcrossSources(
  sources: readonly KeyboardNoteSource[],
  parts: KeyboardPreferences["parts"],
): readonly ActiveKeyboardKey[] {
  const byPitch = new Map<number, { readonly key: ActiveKeyboardKey; readonly order: number }>();
  for (const source of sources) {
    for (const note of activeKeyboardKeys(source.notes, source.now, parts)) {
      const existing = byPitch.get(note.pitch);
      const mostRecent = !existing || source.order >= existing.order ? note : existing.key;
      byPitch.set(note.pitch, {
        key: {
          pitch: note.pitch,
          hand: existing?.key.hand === "right" || note.hand === "right" ? "right" : "left",
          onsetSeconds: mostRecent.onsetSeconds,
          attackIds: [
            ...new Set([...(existing?.key.attackIds ?? []), ...(note.attackIds ?? [])]),
          ].sort(),
        },
        order: Math.max(existing?.order ?? 0, source.order),
      });
    }
  }
  return [...byPitch.values()].map(({ key }) => key).sort((a, b) => a.pitch - b.pitch);
}

export interface RearticulationInput {
  readonly current: readonly ActiveKeyboardKey[];
  /** Onset of the last strike seen per pitch, from the previous frame. */
  readonly memory: KeyboardStrikeMemory;
}

export interface RearticulationResult {
  /** Pitches to show as a fresh strike rather than a continuation. */
  readonly pitches: readonly number[];
  /** Memory to pass to the next frame. */
  readonly memory: KeyboardStrikeMemory;
}

/**
 * Detects notes that are struck again while the keyboard still shows them as sounding.
 *
 * A key that simply stays held looks like one long note, so two identical notes played back to back
 * are indistinguishable without this. A pitch with a newly active voice identity is a genuine
 * repeat; ending a newer overlapping voice does not retrigger the key while an older voice remains.
 *
 * Strikes are compared by active voice identity rather than by tracking playhead position, so a
 * repeat is still reported when notes are re-scheduled or a frame skips over a voice's onset. Memory is
 * returned rather than kept in module state, so the function stays pure and the caller owns the
 * lifetime — two keyboards on screen cannot interfere with each other.
 */
export function detectRearticulations(input: RearticulationInput): RearticulationResult {
  const memory = new Map(input.memory);
  const pitches: number[] = [];

  for (const key of input.current) {
    const currentAttacks = key.attackIds ?? [`${key.pitch}:${key.onsetSeconds}`];
    const previousAttacks = memory.get(key.pitch);
    if (Array.isArray(previousAttacks)) {
      if (currentAttacks.some((attackId) => !previousAttacks.includes(attackId))) {
        pitches.push(key.pitch);
      }
    } else if (previousAttacks !== undefined && previousAttacks !== key.onsetSeconds) {
      // Preserve compatibility with callers that seed the memory with the prior numeric model.
      pitches.push(key.pitch);
    }
    memory.set(key.pitch, currentAttacks);
  }

  // Drop pitches that are no longer sounding, so memory cannot grow with session length.
  const live = new Set(input.current.map((key) => key.pitch));
  for (const pitch of [...memory.keys()]) {
    if (!live.has(pitch)) memory.delete(pitch);
  }

  return { pitches: pitches.sort((a, b) => a - b), memory };
}

export function keyboardNoteName(midi: number): string {
  return `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
}
