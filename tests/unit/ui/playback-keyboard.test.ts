import { describe, expect, it, afterEach, vi } from "vitest";
import {
  activeKeyboardKeysAcrossSources,
  activeKeyboardKeys,
  activeKeyboardPitches,
  autoKeyboardRange,
  compositionKeyboardRange,
  detectRearticulations,
  keyboardHandForRole,
  readKeyboardPreferences,
  saveKeyboardPreferences,
  type ActiveKeyboardKey,
} from "../../../src/ui/piano/playbackKeyboardModel";
import { TransportStore } from "../../../src/ui/transport/transportStore";
import { createPianoRollSystemChordFixture } from "../../fixtures/piano-roll-system-chord.fixture";

interface ScheduledNote {
  readonly pitch: number;
  readonly part: "upper" | "bass" | "melody";
  readonly start: number;
  readonly end: number;
}

const memory = (entries: readonly (readonly [number, number])[] = []) => new Map(entries);
const keys = (...entries: readonly (readonly [number, string, number])[]): ActiveKeyboardKey[] =>
  entries.map(([pitch, hand, onsetSeconds]) => ({
    pitch,
    hand: hand as ActiveKeyboardKey["hand"],
    onsetSeconds,
  }));

afterEach(() => vi.unstubAllGlobals());
describe("Playback keyboard range and scheduled voices", () => {
  it("covers empty, narrow, wide and MIDI edge ranges", () => {
    expect(autoKeyboardRange([])).toEqual([48, 71]);
    expect(autoKeyboardRange([61])).toEqual([60, 83]);
    expect(autoKeyboardRange([0, 127])).toEqual([0, 127]);
    expect(autoKeyboardRange([127])).toEqual([96, 127]);
    expect(autoKeyboardRange([35, 85])).toEqual([24, 95]);
  });
  it("covers the effective whole composition, independent of mute settings", () => {
    const project = createPianoRollSystemChordFixture("keyboard-range");
    const range = compositionKeyboardRange(project);
    expect(range[0]).toBeLessThanOrEqual(60);
    expect(range[1]).toBeGreaterThanOrEqual(69);
    expect(
      compositionKeyboardRange({
        ...project,
        melodyTrack: { ...project.melodyTrack, muted: true },
        harmonyTrack: { ...project.harmonyTrack, muted: true },
      }),
    ).toEqual(range);
  });
  it("keeps overlapping voices until their final end and filters melody", () => {
    const notes = [
      { pitch: 60, part: "upper" as const, start: 1, end: 2 },
      { pitch: 60, part: "melody" as const, start: 1.5, end: 3 },
      { pitch: 48, part: "bass" as const, start: 1, end: 4 },
    ];
    expect(activeKeyboardPitches(notes, 0, "all")).toEqual([]);
    expect(activeKeyboardPitches(notes, 2.5, "all")).toEqual([48, 60]);
    expect(activeKeyboardPitches(notes, 2.5, "melody")).toEqual([60]);
    expect(activeKeyboardPitches(notes, 3, "all")).toEqual([48]);
  });
  it("ignores count-in and stale sessions, clears pause/stop, accepts resume continuations", () => {
    let now = 10;
    const clock = { now: () => now };
    const store = new TransportStore();
    store.play({ stepCount: 1 });
    const session = store.getState().sessionId!;
    const event = {
      pitch: 60,
      startSeconds: 0,
      durationSeconds: 2,
      velocity: 80,
      channelRole: "upper" as const,
    };
    store.recordKeyboardNote("stale", event, 10, clock);
    store.recordKeyboardNote(session, { ...event, channelRole: "metronome" }, 10, clock);
    expect(store.getKeyboardNotes()).toEqual([]);
    store.recordKeyboardNote(session, event, 11, clock);
    expect(
      activeKeyboardPitches(store.getKeyboardNotes(), store.getKeyboardAudioTime(), "all"),
    ).toEqual([]);
    now = 11.5;
    expect(
      activeKeyboardPitches(store.getKeyboardNotes(), store.getKeyboardAudioTime(), "all"),
    ).toEqual([60]);
    store.pause();
    expect(store.getKeyboardNotes()).toEqual([]);
    now = 20;
    store.recordKeyboardNote(session, { ...event, durationSeconds: 1.5 }, 20, clock);
    store.resume();
    expect(
      activeKeyboardPitches(store.getKeyboardNotes(), store.getKeyboardAudioTime(), "all"),
    ).toEqual([60]);
    store.stop();
    expect(store.getKeyboardNotes()).toEqual([]);
    store.play({ stepCount: 1 });
    expect(store.getKeyboardNotes()).toEqual([]);
  });
  it("restores validated preferences and tolerates unavailable storage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    saveKeyboardPreferences({ visible: true, range: "88", parts: "melody" });
    expect(readKeyboardPreferences()).toEqual({ visible: true, range: "88", parts: "melody" });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    });
    expect(readKeyboardPreferences()).toEqual({ visible: false, range: "auto", parts: "all" });
    expect(() =>
      saveKeyboardPreferences({ visible: true, range: "auto", parts: "all" }),
    ).not.toThrow();
  });
});

/**
 * Two-colour highlighting: the melody (right hand) and the chord/bass (left hand) must be
 * distinguishable, and a note struck twice must not look like one long held note.
 */
describe("Playback keyboard hand colours and repeated notes", () => {
  it("maps melody to the right hand and chord/bass to the left", () => {
    expect(keyboardHandForRole("melody")).toBe("right");
    expect(keyboardHandForRole("upper")).toBe("left");
    expect(keyboardHandForRole("bass")).toBe("left");
  });

  it("labels each sounding key with its hand and onset, sorted by pitch", () => {
    const notes: ScheduledNote[] = [
      { pitch: 67, part: "upper", start: 1, end: 3 },
      { pitch: 48, part: "bass", start: 1, end: 4 },
      { pitch: 72, part: "melody", start: 1.5, end: 2.5 },
    ];
    expect(activeKeyboardKeys(notes, 2, "all")).toEqual([
      { pitch: 48, hand: "left", onsetSeconds: 1, attackIds: ["bass:48:1"] },
      { pitch: 67, hand: "left", onsetSeconds: 1, attackIds: ["upper:67:1"] },
      { pitch: 72, hand: "right", onsetSeconds: 1.5, attackIds: ["melody:72:1.5"] },
    ]);
  });

  it("gives a pitch shared by both hands the melody colour", () => {
    // A melody note doubling a chord tone must not flicker between the two colours.
    const notes: ScheduledNote[] = [
      { pitch: 64, part: "upper", start: 1, end: 4 },
      { pitch: 64, part: "melody", start: 2, end: 3 },
    ];
    expect(activeKeyboardKeys(notes, 2.5, "all")).toEqual([
      // Onset is the *newest* strike (2, the melody), which is what makes a repeat detectable.
      {
        pitch: 64,
        hand: "right",
        onsetSeconds: 2,
        attackIds: ["upper:64:1", "melody:64:2"],
      },
    ]);
  });

  it("keeps the latest onset when voices overlap on one pitch", () => {
    // The chord sounds first, then the melody re-strikes the same pitch. The newer onset is what
    // makes the repeat detectable while the chord is still sustaining — keeping the earlier one
    // would make the second note look like a continuation of the first.
    const notes: ScheduledNote[] = [
      { pitch: 60, part: "upper", start: 1, end: 5 },
      { pitch: 60, part: "melody", start: 2, end: 3 },
    ];
    expect(activeKeyboardKeys(notes, 2.5, "all")[0]?.onsetSeconds).toBe(2);
  });

  it("treats a melody re-strike over a sustaining chord as a repeat", () => {
    const chordOnly: ScheduledNote[] = [{ pitch: 60, part: "upper", start: 1, end: 5 }];
    const withRestrike: ScheduledNote[] = [
      ...chordOnly,
      { pitch: 60, part: "melody", start: 2, end: 3 },
    ];

    const first = detectRearticulations({
      current: activeKeyboardKeys(chordOnly, 1.5, "all"),
      memory: memory(),
    });
    const second = detectRearticulations({
      current: activeKeyboardKeys(withRestrike, 2.5, "all"),
      memory: first.memory,
    });
    expect(second.pitches).toEqual([60]);
  });

  it("honours the melody-only filter", () => {
    const notes: ScheduledNote[] = [
      { pitch: 48, part: "bass", start: 1, end: 4 },
      { pitch: 72, part: "melody", start: 1, end: 4 },
    ];
    expect(activeKeyboardKeys(notes, 2, "melody").map((key) => key.pitch)).toEqual([72]);
  });

  it("detects same-time voice additions without flashing when the newest voice ends", () => {
    const chord: ScheduledNote[] = [{ pitch: 64, part: "upper", start: 1, end: 5 }];
    const chordAndMelody: ScheduledNote[] = [
      ...chord,
      { pitch: 64, part: "melody", start: 1, end: 3 },
    ];
    const first = detectRearticulations({
      current: activeKeyboardKeys(chord, 2, "all"),
      memory: memory(),
    });
    const sameOnsetAddition = activeKeyboardKeys(chordAndMelody, 2, "all");
    expect(sameOnsetAddition).toEqual([
      {
        pitch: 64,
        hand: "right",
        onsetSeconds: 1,
        attackIds: ["upper:64:1", "melody:64:1"],
      },
    ]);
    const second = detectRearticulations({ current: sameOnsetAddition, memory: first.memory });
    expect(second.pitches).toEqual([64]);

    const chordAfterMelodyEnds = activeKeyboardKeys(chordAndMelody, 3.5, "all");
    expect(chordAfterMelodyEnds).toEqual([
      { pitch: 64, hand: "left", onsetSeconds: 1, attackIds: ["upper:64:1"] },
    ]);
    const third = detectRearticulations({
      current: chordAfterMelodyEnds,
      memory: second.memory,
    });
    expect(third.pitches).toEqual([]);
  });

  it("merges separately clocked sources by voice identity and hand, not clock magnitude", () => {
    const chord = [
      {
        pitch: 64,
        part: "upper" as const,
        start: 99.5,
        end: 104,
        voiceId: "transport-chord",
      },
    ];
    const preview = [
      {
        pitch: 64,
        part: "melody" as const,
        start: 0.5,
        end: 2,
        voiceId: "melody-preview",
      },
    ];
    const both = activeKeyboardKeysAcrossSources(
      [
        { order: 0, notes: chord, now: 100 },
        { order: 1, notes: preview, now: 1 },
      ],
      "all",
    );
    expect(both).toEqual([
      {
        pitch: 64,
        hand: "right",
        onsetSeconds: 0.5,
        attackIds: ["melody-preview", "transport-chord"],
      },
    ]);
    const started = detectRearticulations({ current: both, memory: memory() });
    expect(started.pitches).toEqual([]);

    const melodyEnded = activeKeyboardKeysAcrossSources(
      [{ order: 0, notes: chord, now: 100.5 }],
      "all",
    );
    expect(melodyEnded[0]?.hand).toBe("left");
    expect(melodyEnded[0]?.attackIds).toEqual(["transport-chord"]);
    expect(detectRearticulations({ current: melodyEnded, memory: started.memory }).pitches).toEqual(
      [],
    );
  });

  it("does not report a held note as repeated", () => {
    const current = keys([60, "left", 1]);
    // Same onset across frames: one sustained note.
    const first = detectRearticulations({ current, memory: memory() });
    const second = detectRearticulations({ current, memory: first.memory });
    expect(first.pitches).toEqual([]);
    expect(second.pitches).toEqual([]);
  });

  it("reports a legato repeat: same pitch, new onset, still sounding", () => {
    const first = detectRearticulations({ current: keys([60, "left", 1]), memory: memory() });
    const second = detectRearticulations({
      current: keys([60, "left", 1.5]),
      memory: first.memory,
    });
    expect(second.pitches).toEqual([60]);
  });

  it("reports a staccato repeat: the pitch stops and starts again", () => {
    const first = detectRearticulations({ current: keys([60, "left", 1]), memory: memory() });
    const silence = detectRearticulations({ current: [], memory: first.memory });
    // The key is gone for a frame; its onset is forgotten with it, so the next strike is a new note.
    const struck = detectRearticulations({
      current: keys([60, "left", 2]),
      memory: silence.memory,
    });
    expect(struck.pitches).toEqual([]);
  });

  it("reports only the re-struck pitch, not every sounding key", () => {
    const first = detectRearticulations({
      current: keys([48, "left", 1], [60, "left", 1], [72, "right", 1]),
      memory: memory(),
    });
    const second = detectRearticulations({
      current: keys([48, "left", 1], [60, "left", 2], [72, "right", 1]),
      memory: first.memory,
    });
    expect(second.pitches).toEqual([60]);
  });

  it("detects a repeated melody note in the right hand", () => {
    const first = detectRearticulations({ current: keys([72, "right", 1]), memory: memory() });
    const second = detectRearticulations({
      current: keys([72, "right", 1.25]),
      memory: first.memory,
    });
    expect(second.pitches).toEqual([72]);
  });

  it("does not let memory grow with session length", () => {
    let state = detectRearticulations({ current: keys([60, "left", 1]), memory: memory() });
    expect(state.memory.size).toBe(1);
    // Pitch 60 ends; its entry is dropped.
    state = detectRearticulations({ current: keys([62, "left", 2]), memory: state.memory });
    expect([...state.memory.keys()]).toEqual([62]);
    expect(state.memory.size).toBe(1);
  });

  it("reports each pitch once when several voices repeat together", () => {
    const first = detectRearticulations({
      current: keys([60, "left", 1], [64, "left", 1]),
      memory: memory(),
    });
    const second = detectRearticulations({
      current: keys([60, "left", 2], [64, "left", 2]),
      memory: first.memory,
    });
    expect(second.pitches).toEqual([60, 64]);
  });
});
