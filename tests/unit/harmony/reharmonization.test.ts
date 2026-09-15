import { describe, expect, it } from "vitest";
import {
  getAvailableSubstitutions,
  getSubstitutionKindBadge,
  realizeSubstitutionChordSymbol,
} from "../../../src/domain/harmony/reharmonization";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";

describe("Reharmonization & Chord Substitutions Assistant", () => {
  const projectMajor = createDefaultProject("test-major", "Major Project", "2026-09-15T00:00:00.000Z");

  const projectMinor = Object.freeze({
    ...createDefaultProject("test-minor", "Minor Project", "2026-09-15T00:00:00.000Z"),
    activeModule: "dark-harmony" as const,
    tonic: 9 as const, // A minor
  });

  describe("Major mode substitutions (in C major, tonic = 0)", () => {
    it("generates rich substitutions for tonic chord I (C)", () => {
      const stepI = createMatrixChordStep(projectMajor, "I", "step-1");
      const subs = getAvailableSubstitutions(stepI, "progressions", 0);

      expect(subs.length).toBeGreaterThanOrEqual(5);

      const targetFuncs = subs.map((s) => s.targetFunctionId);
      expect(targetFuncs).toContain("vi");
      expect(targetFuncs).toContain("iii");
      expect(targetFuncs).toContain("bVI");
      expect(targetFuncs).toContain("bIII");
      expect(targetFuncs).toContain("V7");
      expect(targetFuncs).toContain("subV7");

      // Verify chord symbols realized in C major
      const viSub = subs.find((s) => s.targetFunctionId === "vi")!;
      expect(viSub.chordSymbol).toBe("Am");
      expect(viSub.operation).toBe("replace");
      expect(viSub.kind).toBe("relative");
      expect(viSub.theoreticalRationale).toContain("common tones");

      const bViSub = subs.find((s) => s.targetFunctionId === "bVI")!;
      expect(bViSub.chordSymbol).toBe("Ab");
      expect(bViSub.operation).toBe("replace");
      expect(bViSub.kind).toBe("modal-swap");

      const v7Insert = subs.find((s) => s.targetFunctionId === "V7")!;
      expect(v7Insert.chordSymbol).toBe("G7");
      expect(v7Insert.operation).toBe("insert-before");
      expect(v7Insert.kind).toBe("secondary-dominant");

      const subV7Insert = subs.find((s) => s.targetFunctionId === "subV7")!;
      expect(subV7Insert.chordSymbol).toBe("Db7");
      expect(subV7Insert.operation).toBe("insert-before");
      expect(subV7Insert.kind).toBe("tritone");
    });

    it("generates modal weeping iv and predominant substitutions for IV (F)", () => {
      const stepIV = createMatrixChordStep(projectMajor, "IV", "step-2");
      const subs = getAvailableSubstitutions(stepIV, "progressions", 0);

      const ivSub = subs.find((s) => s.targetFunctionId === "iv")!;
      expect(ivSub).toBeDefined();
      expect(ivSub.chordSymbol).toBe("Fm");
      expect(ivSub.kind).toBe("modal-swap");
      expect(ivSub.operation).toBe("replace");
      expect(ivSub.tags).toContain("Gospel");

      const iiSub = subs.find((s) => s.targetFunctionId === "ii")!;
      expect(iiSub.chordSymbol).toBe("Dm");
      expect(iiSub.kind).toBe("relative");

      const v7ivSub = subs.find((s) => s.targetFunctionId === "V7/IV")!;
      expect(v7ivSub.chordSymbol).toBe("C7");
      expect(v7ivSub.operation).toBe("insert-before");
    });

    it("generates tritone substitution and backdoor cadence for V (G) and V7 (G7)", () => {
      const stepV = createMatrixChordStep(projectMajor, "V", "step-3");
      const subsV = getAvailableSubstitutions(stepV, "progressions", 0);

      const tritoneV = subsV.find((s) => s.targetFunctionId === "subV7")!;
      expect(tritoneV).toBeDefined();
      expect(tritoneV.chordSymbol).toBe("Db7");
      expect(tritoneV.kind).toBe("tritone");
      expect(tritoneV.operation).toBe("replace");

      const backdoorV = subsV.find((s) => s.targetFunctionId === "bVII")!;
      expect(backdoorV.chordSymbol).toBe("Bb");
      expect(backdoorV.kind).toBe("modal-swap");

      const extV7 = subsV.find((s) => s.targetFunctionId === "V7")!;
      expect(extV7.chordSymbol).toBe("G7");
      expect(extV7.kind).toBe("dominant-extension");

      const stepV7 = createMatrixChordStep(projectMajor, "V7", "step-4");
      const subsV7 = getAvailableSubstitutions(stepV7, "progressions", 0);
      const tritoneV7 = subsV7.find((s) => s.targetFunctionId === "subV7")!;
      expect(tritoneV7.chordSymbol).toBe("Db7");
      expect(tritoneV7.kind).toBe("tritone");
    });

    it("generates secondary dominant pre-insertions for ii and vi", () => {
      const stepIi = createMatrixChordStep(projectMajor, "ii", "step-5");
      const subsIi = getAvailableSubstitutions(stepIi, "progressions", 0);
      const insertV7ii = subsIi.find((s) => s.targetFunctionId === "V7/ii")!;
      expect(insertV7ii.chordSymbol).toBe("A7");
      expect(insertV7ii.operation).toBe("insert-before");

      const stepVi = createMatrixChordStep(projectMajor, "vi", "step-6");
      const subsVi = getAvailableSubstitutions(stepVi, "progressions", 0);
      const insertV7vi = subsVi.find((s) => s.targetFunctionId === "V7/vi")!;
      expect(insertV7vi.chordSymbol).toBe("E7");
      expect(insertV7vi.operation).toBe("insert-before");
    });
  });

  describe("Minor mode substitutions (in A minor, tonic = 9)", () => {
    it("generates relative major and dominant insertions for tonic i (Am)", () => {
      const stepI = createMatrixChordStep(projectMinor, "i", "step-m1", "dark-harmony");
      const subs = getAvailableSubstitutions(stepI, "dark-harmony", 9);

      const relMajor = subs.find((s) => s.targetFunctionId === "III")!;
      expect(relMajor.chordSymbol).toBe("C");
      expect(relMajor.kind).toBe("relative");

      const submed = subs.find((s) => s.targetFunctionId === "VI")!;
      expect(submed.chordSymbol).toBe("F");

      const domInsert = subs.find((s) => s.targetFunctionId === "V")!;
      expect(domInsert.chordSymbol).toBe("E");
      expect(domInsert.operation).toBe("insert-before");
    });

    it("generates Neapolitan sixth N6 and secondary diminished for iv (Dm)", () => {
      const stepIv = createMatrixChordStep(projectMinor, "iv", "step-m2", "dark-harmony");
      const subs = getAvailableSubstitutions(stepIv, "dark-harmony", 9);

      const neapolitan = subs.find((s) => s.targetFunctionId === "N6")!;
      expect(neapolitan.chordSymbol).toBe("Bb");
      expect(neapolitan.kind).toBe("modal-swap");

      const secDim = subs.find((s) => s.targetFunctionId === "vii°7/iv")!;
      expect(secDim.chordSymbol).toBe("C#°7");
      expect(secDim.operation).toBe("insert-before");
      expect(secDim.kind).toBe("passing-diminished");
    });

    it("generates passing diminished Pass°7 and modal v for dominant V (E)", () => {
      const stepV = createMatrixChordStep(projectMinor, "V", "step-m3", "dark-harmony");
      const subs = getAvailableSubstitutions(stepV, "dark-harmony", 9);

      const passDim = subs.find((s) => s.targetFunctionId === "Pass°7")!;
      expect(passDim.chordSymbol).toBe("D#°7");
      expect(passDim.operation).toBe("insert-before");
      expect(passDim.kind).toBe("passing-diminished");

      const modalV = subs.find((s) => s.targetFunctionId === "v")!;
      expect(modalV.chordSymbol).toBe("Em");
      expect(modalV.kind).toBe("modal-swap");
    });
  });

  describe("UI Badge metadata", () => {
    it("returns correct labels and styling classes for each substitution kind", () => {
      expect(getSubstitutionKindBadge("tritone").label).toBe("Tritone Sub");
      expect(getSubstitutionKindBadge("modal-swap").label).toBe("Modal Mixture");
      expect(getSubstitutionKindBadge("relative").label).toBe("Relative / Functional");
      expect(getSubstitutionKindBadge("secondary-dominant").label).toBe("Secondary Dominant");
      expect(getSubstitutionKindBadge("passing-diminished").label).toBe("Passing Diminished");
      expect(getSubstitutionKindBadge("dominant-extension").label).toBe("Extension");
    });
  });
});
