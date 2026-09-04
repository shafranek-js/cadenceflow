import { describe, expect, it } from "vitest";
import { baselineSecondaryDiminishedFunctions, realizeDarkHarmonyChord, supportedSecondaryDiminishedTargets } from "../../../src/domain/harmony/modules/darkHarmony";
import { recommendationVocabulary } from "../../../src/domain/harmony/moduleRegistry";
import { recommend } from "../../../src/domain/recommendations/engine";

describe("Secondary diminished", () => {
  it("keeps the three stable baseline functions", () => expect(baselineSecondaryDiminishedFunctions().map((x) => x.functionId)).toEqual(["vii°7/V", "vii°7/iv", "vii°7/VI"]));
  it("supports all core targets without exposing them all as baseline", () => {
    expect(supportedSecondaryDiminishedTargets()).toEqual(["i", "ii°", "III", "iv", "V", "VI", "vii°"]);
    expect(realizeDarkHarmonyChord("vii°7/V", 9).spelling.symbol).toBe("D#°7");
  });
  it("promotes a non-baseline secondary diminished contextually without changing the baseline", () => {
    const vocabulary = recommendationVocabulary("dark-harmony").map((identity) => identity.functionId);
    const result = recommend({ moduleId: "dark-harmony", currentFunctionId: "VI", recentFunctionIds: ["i", "VI"], visibleFunctionIds: vocabulary });
    const promoted = [result.bestMatch, ...result.alternatives].filter(Boolean).map((candidate) => candidate!.functionId);
    expect(promoted).toContain("vii°7/ii°");
    expect(baselineSecondaryDiminishedFunctions().map((x) => x.functionId)).toEqual(["vii°7/V", "vii°7/iv", "vii°7/VI"]);
  });
});
