import { describe, expect, it } from "vitest";
import {
  type HqPianoManifest,
  SALAMANDER_KEY_REGIONS,
  resolveSampleRegion,
  validate88KeyCoverage,
  validatePianoManifest,
} from "../../../../src/audio/hq-sample-piano/manifest";
import { buildManifest } from "../../../../scripts/prepare-piano-bank";

function createMockManifest(): HqPianoManifest {
  return {
    schemaVersion: 1,
    instrumentId: "salamander-grand-v3",
    displayName: "Salamander Grand Piano V3",
    sampleFormat: "ogg",
    sampleRate: 48000,
    regions: [
      // Layer 2 (low - authoritative Salamander 27..34)
      {
        id: "C4v2",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 27, max: 34 },
        velocityLayer: 2,
        assetPath: "samples/C4v2.ogg",
      },
      {
        id: "Ds4v2",
        rootPitch: 63,
        keyRange: { min: 62, max: 64 },
        velocityRange: { min: 27, max: 34 },
        velocityLayer: 2,
        assetPath: "samples/Ds4v2.ogg",
      },
      // Layer 10 (medium - authoritative Salamander 73..80)
      {
        id: "C4v10",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 73, max: 80 },
        velocityLayer: 10,
        assetPath: "samples/C4v10.ogg",
      },
      {
        id: "Ds4v10",
        rootPitch: 63,
        keyRange: { min: 62, max: 64 },
        velocityRange: { min: 73, max: 80 },
        velocityLayer: 10,
        assetPath: "samples/Ds4v10.ogg",
      },
      // Layer 14 (high - authoritative Salamander 105..112)
      {
        id: "C4v14",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 105, max: 112 },
        velocityLayer: 14,
        assetPath: "samples/C4v14.ogg",
      },
      {
        id: "Ds4v14",
        rootPitch: 63,
        keyRange: { min: 62, max: 64 },
        velocityRange: { min: 105, max: 112 },
        velocityLayer: 14,
        assetPath: "samples/Ds4v14.ogg",
      },
    ],
  };
}

describe("T091 — HQ Piano Manifest & Pitch/Velocity Resolution", () => {
  it("validates a conforming manifest and rejects invalid structures", () => {
    const valid = createMockManifest();
    expect(validatePianoManifest(valid)).toBe(valid);

    expect(() => validatePianoManifest(null)).toThrow(TypeError);
    expect(() => validatePianoManifest({})).toThrow(TypeError);
    expect(() => validatePianoManifest({ ...valid, regions: "not-an-array" })).toThrow(TypeError);
    expect(() =>
      validatePianoManifest({
        ...valid,
        regions: [{ id: "bad", rootPitch: 10, velocityLayer: 1 }],
      }),
    ).toThrow(TypeError);
  });

  it("selects nearest sampled root and computes exact pitch playbackRate", () => {
    const manifest = createMockManifest();

    // Pitch 60 with velocity 78 => C4v10, root 60, playbackRate 1.0
    const res60 = resolveSampleRegion(manifest, 60, 78);
    expect(res60.region.id).toBe("C4v10");
    expect(res60.playbackRate).toBe(1.0);
    expect(res60.pitchShiftSemitones).toBe(0);

    // Pitch 61 (C#4) with velocity 78 => C4v10, root 60, playbackRate 2^(1/12)
    const res61 = resolveSampleRegion(manifest, 61, 78);
    expect(res61.region.id).toBe("C4v10");
    expect(res61.pitchShiftSemitones).toBe(1);
    expect(res61.playbackRate).toBeCloseTo(Math.pow(2, 1 / 12), 5);

    // Pitch 62 (D4) with velocity 78 => Ds4v10, root 63, playbackRate 2^(-1/12)
    const res62 = resolveSampleRegion(manifest, 62, 78);
    expect(res62.region.id).toBe("Ds4v10");
    expect(res62.pitchShiftSemitones).toBe(-1);
    expect(res62.playbackRate).toBeCloseTo(Math.pow(2, -1 / 12), 5);
  });

  it("demonstrates distinct velocity layers selected for the same pitch at low, medium, and high velocities", () => {
    const manifest = createMockManifest();

    const low = resolveSampleRegion(manifest, 60, 30); // Layer 2 (27..34)
    const medium = resolveSampleRegion(manifest, 60, 78); // Layer 10 (73..80)
    const high = resolveSampleRegion(manifest, 60, 110); // Layer 14 (105..112)

    expect(low.region.id).toBe("C4v2");
    expect(low.region.assetPath).toBe("samples/C4v2.ogg");
    expect(low.region.velocityLayer).toBe(2);

    expect(medium.region.id).toBe("C4v10");
    expect(medium.region.assetPath).toBe("samples/C4v10.ogg");
    expect(medium.region.velocityLayer).toBe(10);

    expect(high.region.id).toBe("C4v14");
    expect(high.region.assetPath).toBe("samples/C4v14.ogg");
    expect(high.region.velocityLayer).toBe(14);

    // All three select distinctly different assets
    expect(low.region.assetPath).not.toBe(medium.region.assetPath);
    expect(medium.region.assetPath).not.toBe(high.region.assetPath);
  });

  it("rejects pitches outside the acoustic piano range (21..108)", () => {
    const manifest = createMockManifest();

    expect(() => resolveSampleRegion(manifest, 20, 80)).toThrow(RangeError);
    expect(() => resolveSampleRegion(manifest, 109, 80)).toThrow(RangeError);
    expect(() => resolveSampleRegion(manifest, 0, 80)).toThrow(RangeError);
  });

  it("proves complete 88-key coverage (21..108) across all 16 velocity layers without gaps or overlaps", () => {
    const fullManifest = buildManifest("ogg", 48000);
    expect(fullManifest.regions).toHaveLength(480); // 30 roots * 16 layers

    // Verify 88-key coverage across every single layer (1..16)
    for (let layer = 1; layer <= 16; layer++) {
      expect(() => validate88KeyCoverage(fullManifest, layer)).not.toThrow();
    }

    // Verify each of the 30 key regions has exact key bounds
    expect(SALAMANDER_KEY_REGIONS).toHaveLength(30);
    expect(SALAMANDER_KEY_REGIONS[0].keyMin).toBe(21);
    expect(SALAMANDER_KEY_REGIONS[29].keyMax).toBe(108);

    // Total keys covered = 88
    let totalKeys = 0;
    for (const r of SALAMANDER_KEY_REGIONS) {
      totalKeys += r.keyMax - r.keyMin + 1;
    }
    expect(totalKeys).toBe(88);
  });

  it("validate88KeyCoverage rejects coverage gaps and conflicting overlapping regions", () => {
    // Manifest with missing key 21
    const gapManifest: HqPianoManifest = {
      schemaVersion: 1,
      instrumentId: "test-gap",
      displayName: "Test Gap",
      sampleFormat: "ogg",
      sampleRate: 48000,
      regions: [
        {
          id: "C1v1",
          rootPitch: 24,
          keyRange: { min: 22, max: 108 }, // key 21 is missing!
          velocityRange: { min: 1, max: 127 },
          velocityLayer: 1,
          assetPath: "samples/C1v1.ogg",
        },
      ],
    };

    expect(() => validate88KeyCoverage(gapManifest, 1)).toThrow(/Coverage gap: MIDI key 21/);

    // Manifest with overlapping regions
    const overlapManifest: HqPianoManifest = {
      schemaVersion: 1,
      instrumentId: "test-overlap",
      displayName: "Test Overlap",
      sampleFormat: "ogg",
      sampleRate: 48000,
      regions: [
        {
          id: "A0v1-a",
          rootPitch: 21,
          keyRange: { min: 21, max: 25 },
          velocityRange: { min: 1, max: 127 },
          velocityLayer: 1,
          assetPath: "samples/A0v1.ogg",
        },
        {
          id: "C1v1-b",
          rootPitch: 24,
          keyRange: { min: 23, max: 108 }, // keys 23..25 overlap!
          velocityRange: { min: 1, max: 127 },
          velocityLayer: 1,
          assetPath: "samples/C1v1.ogg",
        },
      ],
    };

    expect(() => validate88KeyCoverage(overlapManifest, 1)).toThrow(/Coverage conflict/);
  });
});
