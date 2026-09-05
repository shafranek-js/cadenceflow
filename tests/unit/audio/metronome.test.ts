import { describe, expect, it } from "vitest";
import {
  generateCountInEvents,
  generateMetronomeBarEvents,
  getBarDurationSeconds,
  getBarLengthBeats,
  MetronomeClickProvider,
} from "../../../src/audio/metronome";
import { meter } from "../../../src/domain/timing/meter";
import { rational } from "../../../src/domain/timing/rational";

describe("T108 — Metronome and Count-In Audio Events", () => {
  describe("1. Meter-Derived Accents and Clicks", () => {
    it("generates metronome clicks for 4/4 with primary at 0 and secondary at 2", () => {
      const m44 = meter(4, 4, [2, 2]);
      const events = generateMetronomeBarEvents(m44, 120, 0);

      expect(events).toHaveLength(4);
      // All events must have channelRole: 'metronome'
      for (const e of events) {
        expect(e.channelRole).toBe("metronome");
      }

      // Pulse 0: primary accent (pitch 84, velocity 100)
      expect(events[0]!.startSeconds).toBeCloseTo(0.0, 3);
      expect(events[0]!.pitch).toBe(84);
      expect(events[0]!.velocity).toBe(100);

      // Pulse 1: subdivision (pitch 72, velocity 60)
      expect(events[1]!.startSeconds).toBeCloseTo(0.5, 3);
      expect(events[1]!.pitch).toBe(72);
      expect(events[1]!.velocity).toBe(60);

      // Pulse 2: secondary accent (pitch 76, velocity 80)
      expect(events[2]!.startSeconds).toBeCloseTo(1.0, 3);
      expect(events[2]!.pitch).toBe(76);
      expect(events[2]!.velocity).toBe(80);

      // Pulse 3: subdivision
      expect(events[3]!.startSeconds).toBeCloseTo(1.5, 3);
      expect(events[3]!.pitch).toBe(72);
      expect(events[3]!.velocity).toBe(60);
    });

    it("generates metronome clicks for 6/8 [3, 3] with primary at 0 and secondary at 3", () => {
      const m68 = meter(6, 8, [3, 3]);
      // At 120 BPM: 1 canonical quarter beat = 0.5s. 8th pulse = 0.25s.
      const events = generateMetronomeBarEvents(m68, 120, 0);

      expect(events).toHaveLength(6);

      // Pulse 0 (group 1 start) -> primary
      expect(events[0]!.startSeconds).toBeCloseTo(0.0, 3);
      expect(events[0]!.pitch).toBe(84);

      // Pulses 1 and 2 -> subdivision
      expect(events[1]!.pitch).toBe(72);
      expect(events[2]!.pitch).toBe(72);

      // Pulse 3 (group 2 start) -> secondary
      expect(events[3]!.startSeconds).toBeCloseTo(0.75, 3);
      expect(events[3]!.pitch).toBe(76);

      // Pulses 4 and 5 -> subdivision
      expect(events[4]!.pitch).toBe(72);
      expect(events[5]!.pitch).toBe(72);
    });

    it("generates metronome clicks for 7/8 [2, 2, 3] distinguishing pulses 0, 2, and 4", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      // At 120 BPM: 8th pulse = 0.25s.
      const events = generateMetronomeBarEvents(m78, 120, 0);

      expect(events).toHaveLength(7);

      // Pulse 0: primary accent
      expect(events[0]!.startSeconds).toBeCloseTo(0.0, 3);
      expect(events[0]!.pitch).toBe(84);

      // Pulse 1: subdivision
      expect(events[1]!.startSeconds).toBeCloseTo(0.25, 3);
      expect(events[1]!.pitch).toBe(72);

      // Pulse 2: secondary accent (group 2 start)
      expect(events[2]!.startSeconds).toBeCloseTo(0.5, 3);
      expect(events[2]!.pitch).toBe(76);

      // Pulse 3: subdivision
      expect(events[3]!.startSeconds).toBeCloseTo(0.75, 3);
      expect(events[3]!.pitch).toBe(72);

      // Pulse 4: secondary accent (group 3 start)
      expect(events[4]!.startSeconds).toBeCloseTo(1.0, 3);
      expect(events[4]!.pitch).toBe(76);

      // Pulses 5, 6: subdivision
      expect(events[5]!.startSeconds).toBeCloseTo(1.25, 3);
      expect(events[5]!.pitch).toBe(72);
      expect(events[6]!.startSeconds).toBeCloseTo(1.5, 3);
      expect(events[6]!.pitch).toBe(72);
    });
  });

  describe("2. One-Bar Count-In Semantics", () => {
    it("generates exactly one bar of count-in matching current meter and tempo", () => {
      const m44 = meter(4, 4);
      // In 4/4 at 120 BPM: 1 bar = 4 canonical beats = 2.0s
      const countIn = generateCountInEvents(m44, 120, 0);

      expect(countIn.events).toHaveLength(4);
      expect(countIn.durationBeats).toEqual(rational(4, 1));
      expect(countIn.durationSeconds).toBeCloseTo(2.0, 3);

      for (const e of countIn.events) {
        expect(e.channelRole).toBe("metronome");
      }
    });

    it("generates exact count-in duration for 7/8 at 140 BPM", () => {
      const m78 = meter(7, 8, [2, 2, 3]);
      // Bar length = 7 * (4/8) = 7/2 canonical beats
      // At 140 BPM: seconds = (7/2) * (60 / 140) = 3.5 * (3/7) = 1.5 seconds exactly!
      const countIn = generateCountInEvents(m78, 140, 0);

      expect(countIn.durationBeats).toEqual(rational(7, 2));
      expect(countIn.durationSeconds).toBeCloseTo(1.5, 3);
      expect(countIn.events).toHaveLength(7);
    });
  });

  describe("3. MetronomeClickProvider Lifecycle", () => {
    it("implements InstrumentAudioProvider contract safely without throwing", async () => {
      const provider = new MetronomeClickProvider(null);
      expect(provider.id).toBe("metronome-clicks");
      expect(provider.state).toBe("ready");

      await provider.prepare();

      const clock = { now: () => 0 };
      const playback = provider.schedule(
        [
          {
            pitch: 84,
            startSeconds: 0,
            durationSeconds: 0.05,
            velocity: 100,
            channelRole: "metronome",
          },
        ],
        clock,
      );

      expect(playback.id).toMatch(/^metronome-batch-/);
      playback.cancel();

      provider.stop();
      await provider.dispose();
    });
  });
});
