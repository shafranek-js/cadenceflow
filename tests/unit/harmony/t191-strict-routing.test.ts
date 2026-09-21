import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import {
  evaluateHarmonicRoute,
  semanticTargetForFunction,
} from "../../../src/domain/harmony/routing";
import { recommend } from "../../../src/domain/recommendations/engine";

const progressionsVisible = [
  "V7",
  "V7/vi",
  "V7/IV",
  "V7/ii",
  "V7/V",
  "V7/iii",
  "I",
  "vi",
  "IV",
  "ii",
  "V",
  "iii",
  "vii°",
  "bIII",
  "bVI",
  "iv",
  "bVII",
];

describe("T191 strict harmonic routing", () => {
  it("uses the topology targetId as the only best match in every tonic", () => {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      const project = { ...createDefaultProject(`t191-${tonic}`, `T191 ${tonic}`), tonic };
      const source = createMatrixChordStep(project, "V7/V", `source-${tonic}`);
      const targetId = source.harmonicFunction.targetId;
      expect(targetId).toBe("V");

      const result = recommend({
        moduleId: "progressions",
        currentFunctionId: source.harmonicFunction.functionId,
        currentTargetId: targetId,
        recentFunctionIds: [source.harmonicFunction.functionId],
        visibleFunctionIds: progressionsVisible,
      });

      expect(result.bestMatch?.functionId).toBe("V");
      expect(result.alternatives.some((candidate) => candidate.functionId.startsWith("V7/"))).toBe(
        false,
      );
      expect(result.blockedCandidates.some((candidate) => candidate.functionId === "V7/ii")).toBe(
        true,
      );
    }
  });

  it("keeps tension chains visible but marks them as confirmation-only", () => {
    const result = recommend({
      moduleId: "progressions",
      currentFunctionId: "V7/vi",
      currentTargetId: "vi",
      recentFunctionIds: ["I", "V7/vi"],
      visibleFunctionIds: ["vi", "V7/ii", "V7/IV", "I"],
    });

    expect(result.bestMatch?.functionId).toBe("vi");
    expect(result.alternatives.map((candidate) => candidate.functionId)).not.toContain("V7/ii");
    expect(result.blockedCandidates.map((candidate) => candidate.functionId)).toContain("V7/ii");
  });

  it("enforces the I/IV/V Modal Interchange corridor across all 12 tonics", () => {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      expect(
        evaluateHarmonicRoute({ moduleId: "progressions", currentFunctionId: "I" }, "bIII").status,
      ).toBe("allowed");
      expect(
        evaluateHarmonicRoute({ moduleId: "progressions", currentFunctionId: "bIII" }, "V").status,
      ).toBe("allowed");
      expect(
        evaluateHarmonicRoute({ moduleId: "progressions", currentFunctionId: "bIII" }, "bVI")
          .status,
      ).toBe("requires-confirmation");
      expect(
        evaluateHarmonicRoute({ moduleId: "progressions", currentFunctionId: "ii" }, "bIII").status,
      ).toBe("requires-confirmation");
    }
  });

  it("retains safe compatibility targets for legacy ids without topology metadata", () => {
    expect(semanticTargetForFunction("progressions", "V7/vi")).toBe("vi");
    expect(semanticTargetForFunction("progressions", "vii°")).toBe("I");
    expect(semanticTargetForFunction("dark-harmony", "vii°")).toBe("i");
  });
});
