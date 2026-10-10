import { describe, expect, it } from "vitest";
import { rational } from "../../../src/domain/timing/rational";
import {
  pianoRollIntervalIsSounding,
  pianoRollSoundingBeat,
  pianoRollSystemHorizontalOffsetRatio,
} from "../../../src/ui/melody/pianoRollPlayback";
import type { PlaybackClockSnapshot } from "../../../src/ui/transport/transportStore";

const snapshot: PlaybackClockSnapshot = {
  sessionId: "test",
  state: "playing",
  audioClockAnchorSeconds: 1,
  performanceClockAnchorMs: 1000,
  musicalPositionAnchorBeats: 0,
  startBeats: rational(0),
  endBeats: rational(8),
  tempoBpm: 60,
  schedulerStartOffsetSeconds: 0,
};

describe("Piano Roll sounding intervals", () => {
  it("includes onset, excludes note release and handles polyphony and silent gaps", () => {
    const intervals = [
      [0, 0.5],
      [1, 2],
      [1.5, 3],
    ];
    const active = (beat: number | null) =>
      intervals.map(([start, end]) => pianoRollIntervalIsSounding(beat, start!, end!));
    expect(active(0)).toEqual([true, false, false]);
    expect(active(0.5)).toEqual([false, false, false]);
    expect(active(1.5)).toEqual([false, true, true]);
    expect(active(2)).toEqual([false, false, true]);
    expect(active(null)).toEqual([false, false, false]);
  });
  it("hides future anchors, paused state and exact progression end", () => {
    expect(pianoRollSoundingBeat(snapshot, 999)).toBeNull();
    expect(pianoRollSoundingBeat(snapshot, 1000)).toBe(0);
    expect(pianoRollSoundingBeat(snapshot, 9000)).toBeNull();
    expect(pianoRollSoundingBeat({ ...snapshot, state: "paused" }, 1500)).toBeNull();
  });
  it("projects resume/from-here anchors and wraps to notes preceding the original start", () => {
    const later = {
      ...snapshot,
      startBeats: rational(6),
      musicalPositionAnchorBeats: 6,
      loopStartBeats: rational(2),
      loopEndBeats: rational(8),
    };
    expect(pianoRollSoundingBeat(later, 1000)).toBe(6);
    expect(pianoRollSoundingBeat(later, 3000)).toBe(2);
    expect(pianoRollSoundingBeat(later, 3500)).toBe(2.5);
    expect(pianoRollSoundingBeat(later, 9000)).toBe(2);
  });
  it("highlights only the continuation fragment containing the current beat", () => {
    expect(pianoRollIntervalIsSounding(4, 3.5, 4)).toBe(false);
    expect(pianoRollIntervalIsSounding(4, 4, 5)).toBe(true);
  });
  it("maps a partial final system to its fixed-width measure slots", () => {
    expect(pianoRollSystemHorizontalOffsetRatio(1, 1, 4)).toBe(0.5);
  });
});
