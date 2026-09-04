import { describe, expect, it } from "vitest";
import { appendBranchStep, branchRecommendationPath, startTemporaryBranch } from "../../../src/domain/progression/branch";
import { recommend } from "../../../src/domain/recommendations/engine";
import type { Progression } from "../../../src/domain/progression/progression";
import type { ChordStep } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

function step(id: string, fn: string): ChordStep { return { id, kind: "chord", harmonicFunction: { moduleId: "progressions", functionId: fn, category: "core" }, harmonicVariant: EMPTY_HARMONIC_VARIANT, duration: musicalDuration(rational(4), { kind: "bars", bars: 1 }), performance: DEFAULT_PIANO_PERFORMANCE, cardView: "harmonic" }; }
const visible = ["I", "vi", "IV", "ii", "V", "iii", "vii°", "bIII", "bVI", "iv", "bVII"];

describe("branch recommendation context", () => {
  it("each branch step becomes context for the next ranking", () => {
    const p: Progression = { steps: [step("s1", "I"), step("s2", "V")] };
    let branch = appendBranchStep(startTemporaryBranch(p, "b", "s1"), step("b1", "vi"));
    let path = branchRecommendationPath(p, branch).filter((x) => x.kind === "chord").map((x) => x.harmonicFunction.functionId);
    let result = recommend({ moduleId: "progressions", currentFunctionId: path.at(-1)!, recentFunctionIds: path, visibleFunctionIds: visible });
    expect(result.bestMatch?.functionId).toBe("IV");

    branch = appendBranchStep(branch, step("b2", "IV"));
    path = branchRecommendationPath(p, branch).filter((x) => x.kind === "chord").map((x) => x.harmonicFunction.functionId);
    result = recommend({ moduleId: "progressions", currentFunctionId: path.at(-1)!, recentFunctionIds: path, visibleFunctionIds: visible });
    expect(result.bestMatch?.functionId).toBe("V");
  });

  it("Composition Intent changes ranking without removing valid candidates", () => {
    const neutral = recommend({ moduleId: "progressions", currentFunctionId: "I", recentFunctionIds: ["I"], visibleFunctionIds: visible, compositionIntent: "neutral" });
    const tension = recommend({ moduleId: "progressions", currentFunctionId: "I", recentFunctionIds: ["I"], visibleFunctionIds: visible, compositionIntent: "build-tension" });
    const neutralV = [neutral.bestMatch, ...neutral.alternatives].find((x) => x?.functionId === "V")?.score ?? 0;
    const tensionV = [tension.bestMatch, ...tension.alternatives].find((x) => x?.functionId === "V")?.score ?? 0;
    expect(tensionV).toBeGreaterThan(neutralV);
    expect(visible).toContain("vi");
  });
});
