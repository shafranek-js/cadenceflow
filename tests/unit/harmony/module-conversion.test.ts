import { describe, expect, it } from "vitest";
import {
  mapFunctionAcrossModules,
  planModuleSwitch,
} from "../../../src/domain/harmony/moduleSwitch";
import type { ChordStep } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";

describe("module conversion", () => {
  it("maps unambiguous core functions", () => {
    const result = mapFunctionAcrossModules(
      { moduleId: "progressions", functionId: "I", category: "core" },
      "dark-harmony",
    );
    expect(result?.functionId).toBe("i");
  });
  it("does not guess borrowed functions", () => {
    const result = mapFunctionAcrossModules(
      { moduleId: "progressions", functionId: "bVII", category: "modal-interchange" },
      "dark-harmony",
    );
    expect(result).toBeNull();
  });
  it("offers multiple explicit alternatives plus Keep Original for ambiguous functions", () => {
    const step: ChordStep = {
      id: "s1",
      kind: "chord",
      harmonicFunction: {
        moduleId: "progressions",
        functionId: "bVII",
        category: "modal-interchange",
      },
      harmonicVariant: EMPTY_HARMONIC_VARIANT,
      duration: musicalDuration(rational(4), { kind: "bars", bars: 1 }),
      performance: DEFAULT_PIANO_PERFORMANCE,
      cardView: "harmonic",
    };
    const plan = planModuleSwitch([step], "dark-harmony");
    expect(plan.hasAmbiguities).toBe(true);
    expect(plan.resolutions[0]?.keepOriginalAllowed).toBe(true);
    expect(plan.resolutions[0]?.alternatives.length).toBeGreaterThanOrEqual(2);
  });
});
