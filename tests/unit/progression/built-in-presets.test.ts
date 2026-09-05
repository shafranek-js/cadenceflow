import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS,
  getBuiltInPresets,
  getBuiltInPresetById,
} from "../../../src/domain/progression/builtInPresets";
import { realizePresetSteps } from "../../../src/domain/progression/presets";
import type { HarmonicContext } from "../../../src/domain/harmony/modules/types";

describe("T114 — Curated Built-in Preset Catalog Data (US7)", () => {
  it("provides a deeply immutable catalog with at least 2 Major and 2 Tonal Minor presets", () => {
    expect(BUILT_IN_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(Object.isFrozen(BUILT_IN_PRESETS)).toBe(true);

    const majorPresets = BUILT_IN_PRESETS.filter((p) =>
      p.steps.every((s) => s.harmonicFunction.moduleId === "progressions"),
    );
    const minorPresets = BUILT_IN_PRESETS.filter((p) =>
      p.steps.every((s) => s.harmonicFunction.moduleId === "dark-harmony"),
    );

    expect(majorPresets.length).toBeGreaterThanOrEqual(2);
    expect(minorPresets.length).toBeGreaterThanOrEqual(2);

    // Verify getter functions
    expect(getBuiltInPresets()).toBe(BUILT_IN_PRESETS);
    expect(getBuiltInPresetById(majorPresets[0]!.id)).toBe(majorPresets[0]);
    expect(getBuiltInPresetById("non-existent-id")).toBeUndefined();
  });

  it("ensures all built-in presets have unique IDs, non-empty names, source 'builtIn', and frozen steps", () => {
    const ids = new Set<string>();

    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);

      expect(preset.name.trim()).toBeTruthy();
      expect(preset.source).toBe("builtIn");
      expect(preset.steps.length).toBeGreaterThan(0);
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.steps)).toBe(true);

      for (const step of preset.steps) {
        expect(Object.isFrozen(step)).toBe(true);
        expect(Object.isFrozen(step.harmonicFunction)).toBe(true);
        expect(Object.isFrozen(step.duration)).toBe(true);
        expect(step.duration.beats.numerator).toBeGreaterThan(0);
        expect(step.duration.beats.denominator).toBeGreaterThan(0);

        // Strict invariant: no harmonicVariant or performance on preset step
        expect((step as Record<string, unknown>).harmonicVariant).toBeUndefined();
        expect((step as Record<string, unknown>).performance).toBeUndefined();
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
