import { describe, expect, it } from "vitest";
import {
  GUITAR_STANDARD_TUNING,
  getGuitarPitch,
} from "../../../src/domain/instruments/guitar/tuning";
import {
  detectPlaybackGuitarReattacks,
  projectPlaybackGuitarFretboard,
  type PlaybackGuitarNoteSource,
} from "../../../src/ui/guitar/playbackGuitarFretboardModel";

function source(
  id: string,
  now: number,
  notes: PlaybackGuitarNoteSource["notes"],
): PlaybackGuitarNoteSource {
  return { id, now, notes };
}

describe("playback guitar fretboard model", () => {
  it("keeps standard tuning and projects concurrent chord and Melody voices by exact MIDI", () => {
    expect(GUITAR_STANDARD_TUNING.map((string) => string.openMidi)).toEqual([
      40, 45, 50, 55, 59, 64,
    ]);
    expect(getGuitarPitch(0, 0).midiNumber).toBe(40);
    const snapshot = projectPlaybackGuitarFretboard([
      source("transport", 12, [
        { pitch: 60, part: "upper", start: 11.5, end: 12.5, voiceId: "chord-c4" },
        { pitch: 60, part: "upper", start: 11.5, end: 12.5, voiceId: "doubling-c4" },
        { pitch: 40, part: "bass", start: 11.5, end: 12.5, voiceId: "bass-e2" },
      ]),
      source("preview", 1002, [
        { pitch: 60, part: "melody", start: 1001.5, end: 1002.5, voiceId: "melody-c4" },
      ]),
    ]);

    expect(snapshot.outsideRange).toEqual([]);
    expect(snapshot.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "chord",
          pitch: 60,
          stringNumber: 2,
          fret: 1,
          voiceIds: ["chord-c4", "doubling-c4"],
        }),
        expect.objectContaining({
          role: "melody",
          pitch: 60,
          stringNumber: 2,
          fret: 1,
          voiceIds: ["melody-c4"],
        }),
        expect.objectContaining({ role: "chord", pitch: 40, stringNumber: 6, fret: 0 }),
      ]),
    );
    expect(new Set(snapshot.markers.map((marker) => marker.role))).toEqual(
      new Set(["chord", "melody"]),
    );
  });

  it("uses each preview source's clock and treats note end as released", () => {
    const snapshot = projectPlaybackGuitarFretboard([
      source("transport", 2, [
        { pitch: 64, part: "upper", start: 1, end: 2, voiceId: "ended-at-boundary" },
      ]),
      source("preview", 100, [
        { pitch: 64, part: "melody", start: 99, end: 101, voiceId: "preview-e4" },
      ]),
    ]);

    expect(snapshot.markers).toHaveLength(1);
    expect(snapshot.markers[0]).toMatchObject({ role: "melody", pitch: 64, fret: 0 });
  });

  it("marks repeated voice identities at one fret, including after a release", () => {
    const makeMarker = (voiceId: string) =>
      projectPlaybackGuitarFretboard([
        source("transport", 1, [{ pitch: 60, part: "melody", start: 0, end: 2, voiceId }]),
      ]).markers;
    const first = makeMarker("melody-1");
    const initial = detectPlaybackGuitarReattacks(first, new Map());
    expect(initial.repeatedMarkerKeys).toEqual([]);

    const repeatedWhileHeld = detectPlaybackGuitarReattacks(makeMarker("melody-2"), initial.memory);
    expect(repeatedWhileHeld.repeatedMarkerKeys).toEqual([first[0]!.key]);

    const afterRelease = detectPlaybackGuitarReattacks([], repeatedWhileHeld.memory);
    const repeatedAfterRelease = detectPlaybackGuitarReattacks(
      makeMarker("melody-3"),
      afterRelease.memory,
    );
    expect(repeatedAfterRelease.repeatedMarkerKeys).toEqual([first[0]!.key]);
  });

  it("shows octave-folded mapper results as outside range without changing their pitch", () => {
    const snapshot = projectPlaybackGuitarFretboard([
      source("transport", 1, [
        { pitch: 36, part: "bass", start: 0, end: 2, voiceId: "low-c2" },
        { pitch: 96, part: "melody", start: 0, end: 2, voiceId: "high-c7" },
      ]),
    ]);

    expect(snapshot.markers).toEqual([]);
    expect(snapshot.outsideRange).toEqual([
      expect.objectContaining({ pitch: 36, role: "chord", voiceIds: ["low-c2"] }),
      expect.objectContaining({ pitch: 96, role: "melody", voiceIds: ["high-c7"] }),
    ]);
  });

  it("recovers exact playable bass pitches when the legacy mapper folds an octave", () => {
    const snapshot = projectPlaybackGuitarFretboard([
      source("transport", 1, [{ pitch: 69, part: "bass", start: 0, end: 2, voiceId: "bass-a4" }]),
    ]);

    expect(snapshot.outsideRange).toEqual([]);
    expect(snapshot.markers).toEqual([
      expect.objectContaining({ role: "chord", pitch: 69, stringNumber: 3, fret: 14 }),
    ]);
  });
});
