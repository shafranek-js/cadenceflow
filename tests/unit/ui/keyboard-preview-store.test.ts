import { describe, expect, it } from "vitest";
import type { AudioClock, AudioNoteEvent, ScheduledPlayback } from "../../../src/audio/contracts";
import { KeyboardPreviewStore } from "../../../src/ui/piano/keyboardPreviewStore";

function event(
  pitch: number,
  channelRole: AudioNoteEvent["channelRole"],
  startSeconds: number,
  durationSeconds: number,
): AudioNoteEvent {
  return { pitch, channelRole, startSeconds, durationSeconds, velocity: 90 };
}

function playback(scheduledAt: number): ScheduledPlayback {
  return { id: `preview-${scheduledAt}`, scheduledAt, cancel: () => {} };
}

describe("KeyboardPreviewStore", () => {
  it("retains each preview's scheduled base and independent audio clock", () => {
    const store = new KeyboardPreviewStore();
    let harmonyNow = 20;
    let melodyNow = 4;
    const harmonyClock: AudioClock = { now: () => harmonyNow };
    const melodyClock: AudioClock = { now: () => melodyNow };
    store.setScheduledPreview(
      "harmony",
      [event(60, "upper", 0.25, 1), event(48, "bass", 0, 2)],
      playback(19.5),
      harmonyClock,
    );
    store.setScheduledPreview(
      "melody",
      [event(72, "melody", 0.5, 1.5)],
      playback(3.5),
      melodyClock,
    );

    const [harmony, melody] = store.getSessions();
    expect(harmony?.notes).toEqual([
      {
        pitch: 60,
        part: "upper",
        start: 19.75,
        end: 20.75,
        voiceId: "harmony:1:0",
      },
      {
        pitch: 48,
        part: "bass",
        start: 19.5,
        end: 21.5,
        voiceId: "harmony:1:1",
      },
    ]);
    expect(melody?.notes).toEqual([
      { pitch: 72, part: "melody", start: 4, end: 5.5, voiceId: "melody:2:0" },
    ]);
    expect(harmony?.clock.now()).toBe(20);
    expect(melody?.clock.now()).toBe(4);

    harmonyNow = 21;
    melodyNow = 5.5;
    expect(harmony?.clock.now()).toBe(21);
    expect(melody?.clock.now()).toBe(5.5);
  });

  it("ignores metronome and empty events, and clears only the stopped owner", () => {
    const store = new KeyboardPreviewStore();
    const clock = { now: () => 2 };
    store.setScheduledPreview(
      "harmony",
      [event(60, "upper", 0, 1), event(36, "metronome", 0, 0.1)],
      playback(2),
      clock,
    );
    store.setScheduledPreview("melody", [event(0, "melody", 0, 0)], playback(2), clock);
    expect(store.getSessions().map((session) => session.owner)).toEqual(["harmony"]);
    expect(store.getSessions()[0]?.notes).toEqual([
      {
        pitch: 60,
        part: "upper",
        start: 2,
        end: 3,
        voiceId: "harmony:1:0",
      },
    ]);

    store.setScheduledPreview("guitar", [event(67, "upper", 0, 1)], playback(2), clock);
    store.clearPreview("harmony");
    expect(store.getSessions().map((session) => session.owner)).toEqual(["guitar"]);
    store.clearAll();
    expect(store.getSessions()).toEqual([]);
  });
});
