import { describe, expect, it } from "vitest";
import { exactPitch, type ExactPitch } from "../../../../src/domain/harmony/pitch";
import { resolveArticulationTiming } from "../../../../src/instruments/piano/articulation";

describe("T086 — Piano articulation timing and note order", () => {
  const upperPitches: readonly ExactPitch[] = [
    exactPitch(60, { step: "C", alter: 0 }),
    exactPitch(64, { step: "E", alter: 0 }),
    exactPitch(67, { step: "G", alter: 0 }),
  ];
  const bassPitch: ExactPitch = exactPitch(48, { step: "C", alter: 0 });
  const totalDuration = 2.0;

  it("realizes Block articulation with synchronous start at t=0", () => {
    const intents = resolveArticulationTiming("block", upperPitches, totalDuration, bassPitch);

    // Includes bass note plus 3 upper notes
    expect(intents).toHaveLength(4);

    const bassIntent = intents.find((i) => i.role === "bass");
    expect(bassIntent).toBeDefined();
    expect(bassIntent!.startOffsetSeconds).toBe(0);

    const upperIntents = intents.filter((i) => i.role === "upper");
    expect(upperIntents).toHaveLength(3);
    for (const intent of upperIntents) {
      expect(intent.startOffsetSeconds).toBe(0);
      expect(intent.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("realizes Arp Up articulation with ascending pitch start times", () => {
    const intents = resolveArticulationTiming("arp-up", upperPitches, totalDuration, bassPitch);
    const upperIntents = intents.filter((i) => i.role === "upper");

    expect(upperIntents).toHaveLength(3);
    expect(upperIntents[0]!.pitch.midiNumber).toBe(60);
    expect(upperIntents[1]!.pitch.midiNumber).toBe(64);
    expect(upperIntents[2]!.pitch.midiNumber).toBe(67);

    expect(upperIntents[0]!.startOffsetSeconds).toBeLessThan(upperIntents[1]!.startOffsetSeconds);
    expect(upperIntents[1]!.startOffsetSeconds).toBeLessThan(upperIntents[2]!.startOffsetSeconds);
  });

  it("realizes Arp Down articulation with descending pitch start times", () => {
    const intents = resolveArticulationTiming("arp-down", upperPitches, totalDuration, bassPitch);
    const upperIntents = intents.filter((i) => i.role === "upper");

    expect(upperIntents).toHaveLength(3);
    expect(upperIntents[0]!.pitch.midiNumber).toBe(67);
    expect(upperIntents[1]!.pitch.midiNumber).toBe(64);
    expect(upperIntents[2]!.pitch.midiNumber).toBe(60);

    expect(upperIntents[0]!.startOffsetSeconds).toBeLessThan(upperIntents[1]!.startOffsetSeconds);
    expect(upperIntents[1]!.startOffsetSeconds).toBeLessThan(upperIntents[2]!.startOffsetSeconds);
  });

  it("realizes Broken Chord articulation with alternating onset groups", () => {
    const intents = resolveArticulationTiming(
      "broken-chord",
      upperPitches,
      totalDuration,
      bassPitch,
    );
    const upperIntents = intents.filter((i) => i.role === "upper");

    expect(upperIntents).toHaveLength(3);
    expect(upperIntents[0]!.startOffsetSeconds).toBe(0);
    expect(upperIntents[2]!.startOffsetSeconds).toBeGreaterThan(0);
  });

  it("realizes Humanized articulation bounded and deterministic with an injected source", () => {
    const seq = [0.1, 0.9, 0.4, 0.7];
    let idx = 0;
    const deterministicRandom = () => {
      const val = seq[idx % seq.length]!;
      idx++;
      return val;
    };

    const firstRun = resolveArticulationTiming(
      "humanized",
      upperPitches,
      totalDuration,
      bassPitch,
      {
        randomSource: deterministicRandom,
      },
    );

    idx = 0;
    const secondRun = resolveArticulationTiming(
      "humanized",
      upperPitches,
      totalDuration,
      bassPitch,
      {
        randomSource: deterministicRandom,
      },
    );

    expect(firstRun).toEqual(secondRun);

    for (const intent of firstRun) {
      expect(intent.startOffsetSeconds).toBeGreaterThanOrEqual(0);
      expect(intent.startOffsetSeconds).toBeLessThan(0.05); // Bounded within 50ms
      expect(intent.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("ensures humanized articulation is deterministic even without an injected source", () => {
    const run1 = resolveArticulationTiming("humanized", upperPitches, totalDuration, bassPitch);
    const run2 = resolveArticulationTiming("humanized", upperPitches, totalDuration, bassPitch);
    expect(run1).toEqual(run2);
  });

  it("guarantees every event stays strictly inside step boundary even for very short steps/high BPM", () => {
    const articulations = ["block", "arp-up", "arp-down", "broken-chord", "humanized"] as const;
    // Deliberately short musical durations: 0.05s (e.g. 16th note at 300 BPM) and 0.02s (e.g. 32nd note at 375 BPM)
    const shortDurations = [0.1, 0.05, 0.02];

    for (const art of articulations) {
      for (const dur of shortDurations) {
        const intents = resolveArticulationTiming(art, upperPitches, dur, bassPitch);

        expect(intents.length).toBeGreaterThan(0);
        for (const intent of intents) {
          expect(intent.startOffsetSeconds).toBeGreaterThanOrEqual(0);
          expect(intent.durationSeconds).toBeGreaterThan(0);
          // Required Invariant: startOffset + duration <= stepDuration
          expect(intent.startOffsetSeconds + intent.durationSeconds).toBeLessThanOrEqual(
            dur + 1e-6, // tolerance for floating point rounding
          );
        }
      }
    }
  });
});
