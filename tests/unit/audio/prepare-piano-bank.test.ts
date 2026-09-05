import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePianoManifest } from "../../../src/audio/hq-sample-piano/manifest";
import {
  SALAMANDER_ROOTS,
  VELOCITY_RANGES,
  buildManifest,
  checkFfmpeg,
} from "../../../scripts/prepare-piano-bank";

describe("T094 — Piano Bank Preparation & Attribution Pipeline", () => {
  it("builds a conforming 480-region Salamander manifest covering 16 layers across 30 roots", () => {
    const manifest = buildManifest("ogg", 48000);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.instrumentId).toBe("salamander-grand-v3");
    expect(manifest.sampleFormat).toBe("ogg");
    expect(manifest.sampleRate).toBe(48000);

    // 30 root notes * 16 velocity layers = 480 regions
    expect(manifest.regions).toHaveLength(480);
    expect(SALAMANDER_ROOTS).toHaveLength(30);
    expect(VELOCITY_RANGES).toHaveLength(16);

    // Validate using the official manifest validator
    expect(() => validatePianoManifest(manifest)).not.toThrow();

    // Verify lowest and highest pitch bounds
    const firstRegion = manifest.regions[0]!;
    const lastRegion = manifest.regions[manifest.regions.length - 1]!;

    expect(firstRegion.rootPitch).toBe(21); // A0
    expect(firstRegion.keyRange.min).toBe(21);

    expect(lastRegion.rootPitch).toBe(108); // C8
    expect(lastRegion.keyRange.max).toBe(108);
  });

  it("verifies public/audio/piano-hq/manifest.json is valid and complete on disk", () => {
    const manifestPath = resolve("public/audio/piano-hq/manifest.json");
    const rawContent = readFileSync(manifestPath, "utf-8");
    const data = JSON.parse(rawContent);

    const validated = validatePianoManifest(data);
    expect(validated.regions).toHaveLength(480);
    expect(validated.sampleFormat).toBe("ogg");
    expect(validated.metadata?.sourceRevision).toBe("370497372ece1603d1ca7b9892c82c1da566565e");
    expect(validated.metadata?.sourceRepository).toBe(
      "https://github.com/sfzinstruments/SalamanderGrandPiano",
    );
  });

  it("verifies public/licenses/piano-hq-attribution.txt contains all required attribution details", () => {
    const attributionPath = resolve("public/licenses/piano-hq-attribution.txt");
    const text = readFileSync(attributionPath, "utf-8");

    expect(text).toContain("Salamander Grand Piano V3");
    expect(text).toContain("Alexander Holm");
    expect(text).toContain("Creative Commons Attribution 3.0");
    expect(text).toContain("CC BY 3.0");
    expect(text).toContain("https://archive.org/details/SalamanderGrandPianoV3");
    expect(text).toContain("CADENCEFLOW DERIVATIVE NOTICE");
    expect(text).toContain("does NOT claim ownership");
  });

  it("detects ffmpeg in the environment", async () => {
    const hasFfmpeg = await checkFfmpeg();
    expect(hasFfmpeg).toBe(true);
  }, 25000);
});
