import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS,
  getBuiltInPresets,
  getBuiltInPresetById,
} from "../../../src/domain/progression/builtInPresets";
import { realizePresetSteps } from "../../../src/domain/progression/presets";
import type { HarmonicContext } from "../../../src/domain/harmony/modules/types";

const FORBIDDEN_GENRE_WORDS = [
  "jazz",
  "doo-wop",
  "andalusian",
  "cinematic",
  "authentic",
  "pop",
  "rock",
  "blues",
];

describe("T114 — Curated Built-in Preset Catalog Data (US7)", () => {
  it("provides a deeply immutable catalog of exactly 6 neutral functional presets (3 Major, 3 Tonal Minor)", () => {
    expect(BUILT_IN_PRESETS).toHaveLength(6);
    expect(Object.isFrozen(BUILT_IN_PRESETS)).toBe(true);

    const expectedIds = [
      "builtin-major-i-vi-iv-v",
      "builtin-major-i-iv-v-i",
      "builtin-major-ii-v-i",
      "builtin-minor-i-iv-v-i",
      "builtin-minor-i-vii-vi-v",
      "builtin-minor-iio-v-i",
    ] as const;

    const actualIds = BUILT_IN_PRESETS.map((p) => p.id);
    expect(actualIds).toEqual(expectedIds);

    // Verify getter functions
    expect(getBuiltInPresets()).toBe(BUILT_IN_PRESETS);
    for (const id of expectedIds) {
      const preset = getBuiltInPresetById(id);
      expect(preset).toBeDefined();
      expect(preset!.id).toBe(id);
    }
    expect(getBuiltInPresetById("non-existent-id")).toBeUndefined();
  });

  it("ensures all preset names and descriptions are neutral and contain zero genre or authenticity promises", () => {
    for (const preset of BUILT_IN_PRESETS) {
      const lowerName = preset.name.toLowerCase();
      const lowerDesc = (preset.description ?? "").toLowerCase();

      for (const word of FORBIDDEN_GENRE_WORDS) {
        expect(lowerName).not.toContain(word);
        expect(lowerDesc).not.toContain(word);
      }

      // Check required naming pattern
      expect(preset.name).toMatch(/^(Major|Minor)\s+/);
      expect(preset.source).toBe("builtIn");
    }
  });

  it("ensures deep immutability against consumer mutation attempts", () => {
    expect(Object.isFrozen(BUILT_IN_PRESETS)).toBe(true);

    for (const preset of BUILT_IN_PRESETS) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.steps)).toBe(true);

      for (const step of preset.steps) {
        expect(Object.isFrozen(step)).toBe(true);
        expect(Object.isFrozen(step.harmonicFunction)).toBe(true);
        expect(Object.isFrozen(step.duration)).toBe(true);
        expect(Object.isFrozen(step.duration.beats)).toBe(true);

        // Attempting to modify properties throws in strict mode
        expect(() => {
          (step as Record<string, unknown>).newProp = "mutate";
        }).toThrow();

        expect(() => {
          (preset as Record<string, unknown>).name = "mutated";
        }).toThrow();
      }
    }
  });

  it("guarantees zero performance, voicing, or harmonicVariant fields on built-in presets", () => {
    const forbiddenKeys = [
      "performance",
      "voicing",
      "manualVoicing",
      "harmonicVariant",
      "variant",
      "extensions",
      "seventh",
      "dynamics",
      "articulation",
      "register",
      "bass",
    ];

    for (const preset of BUILT_IN_PRESETS) {
      for (const step of preset.steps) {
        const record = step as Record<string, unknown>;
        for (const key of forbiddenKeys) {
          expect(record[key]).toBeUndefined();
        }
      }
    }
  });

  it("successfully realizes every built-in preset in its target harmonic context", () => {
    const cMajorContext: HarmonicContext = {
      tonic: 0,
      moduleId: "progressions",
      mode: "major",
      spellingContext: { tonic: 0, mode: "major" },
    };

    const cMinorContext: HarmonicContext = {
      tonic: 0,
      moduleId: "dark-harmony",
      mode: "tonal-minor",
      spellingContext: { tonic: 0, mode: "tonal-minor" },
    };

    for (const preset of BUILT_IN_PRESETS) {
      const isMinor = preset.steps[0]!.harmonicFunction.moduleId === "dark-harmony";
      const context = isMinor ? cMinorContext : cMajorContext;
      const result = realizePresetSteps(preset, context);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.steps).toHaveLength(preset.steps.length);
        for (let i = 0; i < preset.steps.length; i++) {
          expect(result.steps[i]!.harmonicFunction.functionId).toBe(
            preset.steps[i]!.harmonicFunction.functionId,
          );
          expect(result.steps[i]!.duration).toEqual(preset.steps[i]!.duration);
          expect(result.steps[i]!.kind).toBe("chord");
        }
      }
    }
  });
});
