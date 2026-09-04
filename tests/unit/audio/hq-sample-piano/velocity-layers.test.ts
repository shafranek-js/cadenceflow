import { describe, expect, it } from "vitest";
import {
  SALAMANDER_VELOCITY_LAYERS,
  resolveVelocityLayer,
} from "../../../../src/audio/hq-sample-piano/velocityLayers";

describe("T091 — Salamander 16 Velocity Layers (Authoritative Data/notes.txt)", () => {
  it("defines exactly 16 discrete velocity layers covering 1..127 without gaps", () => {
    expect(SALAMANDER_VELOCITY_LAYERS).toHaveLength(16);

    // Verify sequential coverage
    expect(SALAMANDER_VELOCITY_LAYERS[0]!.velocityMin).toBe(1);
    expect(SALAMANDER_VELOCITY_LAYERS[15]!.velocityMax).toBe(127);

    for (let i = 0; i < SALAMANDER_VELOCITY_LAYERS.length - 1; i++) {
      const curr = SALAMANDER_VELOCITY_LAYERS[i]!;
      const next = SALAMANDER_VELOCITY_LAYERS[i + 1]!;
      expect(next.velocityMin).toBe(curr.velocityMax + 1);
      expect(curr.layer).toBe(i + 1);
      expect(curr.name).toBe(`v${i + 1}`);
    }
  });

  it("tests lower and upper boundaries for all 16 Salamander V3 layers", () => {
    const expectedBounds = [
      { layer: 1, min: 1, max: 26 },
      { layer: 2, min: 27, max: 34 },
      { layer: 3, min: 35, max: 36 },
      { layer: 4, min: 37, max: 43 },
      { layer: 5, min: 44, max: 46 },
      { layer: 6, min: 47, max: 50 },
      { layer: 7, min: 51, max: 56 },
      { layer: 8, min: 57, max: 64 },
      { layer: 9, min: 65, max: 72 },
      { layer: 10, min: 73, max: 80 },
      { layer: 11, min: 81, max: 88 },
      { layer: 12, min: 89, max: 96 },
      { layer: 13, min: 97, max: 104 },
      { layer: 14, min: 105, max: 112 },
      { layer: 15, min: 113, max: 120 },
      { layer: 16, min: 121, max: 127 },
    ];

    for (const bound of expectedBounds) {
      expect(resolveVelocityLayer(bound.min).layer).toBe(bound.layer);
      expect(resolveVelocityLayer(bound.max).layer).toBe(bound.layer);
    }
  });

  it("selects distinctly different velocity layers for low (30 -> Layer 2), medium (78 -> Layer 10), and high (110 -> Layer 14)", () => {
    const low = resolveVelocityLayer(30); // 30 is in layer 2 (27..34)
    const medium = resolveVelocityLayer(78); // 78 is in layer 10 (73..80)
    const high = resolveVelocityLayer(110); // 110 is in layer 14 (105..112)

    expect(low.layer).toBe(2);
    expect(low.name).toBe("v2");

    expect(medium.layer).toBe(10);
    expect(medium.name).toBe("v10");

    expect(high.layer).toBe(14);
    expect(high.name).toBe("v14");

    // All three are strictly different layers
    expect(low.layer).not.toBe(medium.layer);
    expect(medium.layer).not.toBe(high.layer);
  });

  it("resolves layer 4 for velocity 40 (range 37..43)", () => {
    const layer4 = resolveVelocityLayer(40);
    expect(layer4.layer).toBe(4);
    expect(layer4.name).toBe("v4");
  });

  it("safely clamps boundary and out-of-range velocities", () => {
    expect(resolveVelocityLayer(1).layer).toBe(1);
    expect(resolveVelocityLayer(127).layer).toBe(16);

    // Negative / 0
    expect(resolveVelocityLayer(0).layer).toBe(1);
    expect(resolveVelocityLayer(-10).layer).toBe(1);

    // Above 127
    expect(resolveVelocityLayer(128).layer).toBe(16);
    expect(resolveVelocityLayer(255).layer).toBe(16);
  });
});
