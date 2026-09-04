import { describe, expect, it } from "vitest";
import {
  SALAMANDER_VELOCITY_LAYERS,
  resolveVelocityLayer,
} from "../../../../src/audio/hq-sample-piano/velocityLayers";

describe("T091 — Salamander 16 Velocity Layers", () => {
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

  it("selects distinctly different velocity layers for low, medium, and high velocities", () => {
    const low = resolveVelocityLayer(30); // 30 is in layer 4 (25..32)
    const medium = resolveVelocityLayer(80); // 80 is in layer 10 (73..80)
    const high = resolveVelocityLayer(112); // 112 is in layer 14 (105..112)

    expect(low.layer).toBe(4);
    expect(low.name).toBe("v4");

    expect(medium.layer).toBe(10);
    expect(medium.name).toBe("v10");

    expect(high.layer).toBe(14);
    expect(high.name).toBe("v14");

    // All three are strictly different layers
    expect(low.layer).not.toBe(medium.layer);
    expect(medium.layer).not.toBe(high.layer);
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
