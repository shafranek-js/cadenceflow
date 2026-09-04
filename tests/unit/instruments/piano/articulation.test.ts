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
});
