import { describe, expect, it } from "vitest";
import {
  type HqPianoManifest,
  resolveSampleRegion,
  validatePianoManifest,
} from "../../../../src/audio/hq-sample-piano/manifest";

function createMockManifest(): HqPianoManifest {
  return {
    schemaVersion: 1,
    instrumentId: "salamander-grand-v3",
    displayName: "Salamander Grand Piano V3",
    sampleFormat: "ogg",
    sampleRate: 48000,
    regions: [
      // Layer 4 (low)
      {
        id: "C4v4",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 25, max: 32 },
        velocityLayer: 4,
        assetPath: "samples/C4v4.ogg",
      },
      {
        id: "Ds4v4",
        rootPitch: 63,
        keyRange: { min: 62, max: 64 },
        velocityRange: { min: 25, max: 32 },
        velocityLayer: 4,
        assetPath: "samples/Ds4v4.ogg",
      },
      // Layer 10 (medium)
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
      // Layer 14 (high)
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

    // Pitch 60 with velocity 80 => C4v10, root 60, playbackRate 1.0
    const res60 = resolveSampleRegion(manifest, 60, 80);
    expect(res60.region.id).toBe("C4v10");
    expect(res60.playbackRate).toBe(1.0);
    expect(res60.pitchShiftSemitones).toBe(0);

    // Pitch 61 (C#4) with velocity 80 => C4v10, root 60, playbackRate 2^(1/12)
    const res61 = resolveSampleRegion(manifest, 61, 80);
    expect(res61.region.id).toBe("C4v10");
    expect(res61.pitchShiftSemitones).toBe(1);
    expect(res61.playbackRate).toBeCloseTo(Math.pow(2, 1 / 12), 5);

    // Pitch 62 (D4) with velocity 80 => Ds4v10, root 63, playbackRate 2^(-1/12)
    const res62 = resolveSampleRegion(manifest, 62, 80);
    expect(res62.region.id).toBe("Ds4v10");
    expect(res62.pitchShiftSemitones).toBe(-1);
    expect(res62.playbackRate).toBeCloseTo(Math.pow(2, -1 / 12), 5);
  });

  it("demonstrates distinct velocity layers selected for the same pitch at low, medium, and high velocities", () => {
    const manifest = createMockManifest();

    const low = resolveSampleRegion(manifest, 60, 30); // Layer 4
    const medium = resolveSampleRegion(manifest, 60, 77); // Layer 10
    const high = resolveSampleRegion(manifest, 60, 110); // Layer 14

    expect(low.region.id).toBe("C4v4");
    expect(low.region.assetPath).toBe("samples/C4v4.ogg");
    expect(low.region.velocityLayer).toBe(4);

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
});
