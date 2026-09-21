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

  it("excludes tension-to-tension chains from ordinary recommendations", () => {
    const result = recommend({
      currentFunctionId: "V7/vi",
      recentFunctionIds: ["I", "V7/vi"],
      visibleFunctionIds: ["vi", "V7/ii", "V7/IV", "I"],
    });
    expect(result.bestMatch?.functionId).toBe("vi");
    expect(result.bestMatch?.score).toBe(112);

    const v7ii = result.blockedCandidates.find((c) => c.functionId === "V7/ii");
    expect(v7ii?.routeStatus).toBe("requires-confirmation");
    expect(v7ii?.routeReason).toBe("directed-tension-route-blocked");
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
    expect(returnResult.bestMatch?.functionId).toBe("I");
    expect(returnResult.bestMatch?.score).toBe(78);
    expect(returnResult.bestMatch?.factors).toContainEqual(
      expect.objectContaining({ code: "modal-corridor-return" }),
    );
    expect(returnResult.blockedCandidates.find((c) => c.functionId === "bVI")).toMatchObject({
      routeStatus: "requires-confirmation",
      routeReason: "modal-corridor-return",
    });
  });

  it("boosts recommendations matching active genreFocus with genre-affinity", () => {
    const defaultResult = recommend({
      moduleId: "progressions",
      currentFunctionId: "I",
      recentFunctionIds: ["I"],
      visibleFunctionIds: visible,
      genreFocus: "all",
    });
    const defaultBIII = defaultResult.alternatives.find((c) => c.functionId === "bIII");
    expect(defaultBIII?.score).toBe(72);

    const cinematicResult = recommend({
      moduleId: "progressions",
      currentFunctionId: "I",
      recentFunctionIds: ["I"],
      visibleFunctionIds: visible,
      genreFocus: "cinematic",
    });
    const cinematicBIII = cinematicResult.alternatives.find((c) => c.functionId === "bIII");
    expect(cinematicBIII?.score).toBe(84);
    expect(cinematicBIII?.factors).toContainEqual(
      expect.objectContaining({ code: "genre-affinity", contribution: 12 }),
    );
  });
});
