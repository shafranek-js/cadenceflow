import { describe, expect, it } from "vitest";
import { recommend } from "../../../src/domain/recommendations/engine";

const visible = ["I", "vi", "IV", "ii", "V", "iii", "vii°", "bIII", "bVI", "iv", "bVII"];

describe("Recommendation engine", () => {
  it("returns one best match and no more than three strong alternatives", () => {
    const result = recommend({
      currentFunctionId: "ii",
      recentFunctionIds: ["vi", "ii"],
      visibleFunctionIds: visible,
    });
    expect(result.bestMatch?.functionId).toBe("V");
    expect(result.alternatives.length).toBeLessThanOrEqual(3);
  });
  it("does not fill alternatives with weak candidates", () => {
    const result = recommend({
      currentFunctionId: "vii°",
      recentFunctionIds: ["vii°"],
      visibleFunctionIds: visible,
    });
    expect(result.bestMatch?.functionId).toBe("I");
    expect(result.alternatives.length).toBe(0);
  });
  it("resolves a secondary dominant to its target", () => {
    const result = recommend({
      currentFunctionId: "V7/V",
      recentFunctionIds: ["I", "V7/V"],
      visibleFunctionIds: visible,
    });
    expect(result.bestMatch?.functionId).toBe("V");
  });

  it("penalizes chaining tension chords without resolution (Don't Mix rule)", () => {
    const result = recommend({
      currentFunctionId: "V7/vi",
      recentFunctionIds: ["I", "V7/vi"],
      visibleFunctionIds: ["vi", "V7/ii", "V7/IV", "I"],
    });
    expect(result.bestMatch?.functionId).toBe("vi");
    expect(result.bestMatch?.score).toBe(112);

    // V7/ii is a chained tension chord without resolution
    const v7ii = [...result.alternatives, result.bestMatch].find((c) => c?.functionId === "V7/ii");
    // Since score is 10 (< MIN_STRONG_SCORE 68), it should not be in strong candidates
    expect(v7ii).toBeUndefined();
  });

  it("boosts modal interchange entry and return in progressions", () => {
    const entryResult = recommend({
      moduleId: "progressions",
      currentFunctionId: "I",
      recentFunctionIds: ["I"],
      visibleFunctionIds: visible,
    });
    const bIII = entryResult.alternatives.find((c) => c.functionId === "bIII");
    expect(bIII?.score).toBe(72);
    expect(bIII?.factors).toContainEqual(
      expect.objectContaining({ code: "modal-corridor-entry", contribution: 42 }),
    );

    const returnResult = recommend({
      moduleId: "progressions",
      currentFunctionId: "bIII",
      recentFunctionIds: ["IV", "bIII"],
      visibleFunctionIds: visible,
    });
    expect(returnResult.bestMatch?.functionId).toBe("bVI"); // existing rule 84
    const returnToI = returnResult.alternatives.find((c) => c.functionId === "I");
    expect(returnToI?.score).toBe(78);
    expect(returnToI?.factors).toContainEqual(
      expect.objectContaining({ code: "modal-corridor-return" }),
    );
  });
});
