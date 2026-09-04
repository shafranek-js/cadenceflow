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
});
