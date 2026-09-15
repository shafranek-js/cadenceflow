import { describe, expect, it } from "vitest";
import {
  formatKeyName,
  getAvailableModulations,
  getCircleOfFifthsDistance,
  getKeyRelationship,
  getModulationCategoryBadge,
} from "../../../src/domain/harmony/modulation";

describe("Modulation Domain Engine", () => {
  describe("Circle of Fifths & Key Relationships", () => {
    it("computes accurate circle of fifths distances", () => {
      // C Major (0) to G Major (7) is 1 step
      expect(getCircleOfFifthsDistance(0, "progressions", 7, "progressions")).toBe(1);
      // C Major (0) to F Major (5) is 1 step
      expect(getCircleOfFifthsDistance(0, "progressions", 5, "progressions")).toBe(1);
      // C Major (0) to D Major (2) is 2 steps
      expect(getCircleOfFifthsDistance(0, "progressions", 2, "progressions")).toBe(2);
      // C Major (0) to F# Major (6) is 6 steps
      expect(getCircleOfFifthsDistance(0, "progressions", 6, "progressions")).toBe(6);
      // C Major (0) to A Minor (9) is 0 steps (relative keys share same signature)
      expect(getCircleOfFifthsDistance(0, "progressions", 9, "dark-harmony")).toBe(0);
    });

    it("classifies musical key relationships correctly", () => {
      // C Major -> G Major
      const cToG = getKeyRelationship(0, "progressions", 7, "progressions");
      expect(cToG.isDominant).toBe(true);
      expect(cToG.relationName).toContain("Dominant");
      expect(cToG.circleOfFifthsDistance).toBe(1);

      // C Major -> F Major
      const cToF = getKeyRelationship(0, "progressions", 5, "progressions");
      expect(cToF.isSubdominant).toBe(true);
      expect(cToF.relationName).toContain("Subdominant");

      // C Major -> A Minor
      const cToAm = getKeyRelationship(0, "progressions", 9, "dark-harmony");
      expect(cToAm.isRelative).toBe(true);
      expect(cToAm.relationName).toBe("Relative Minor");

      // A Minor -> C Major
      const amToC = getKeyRelationship(9, "dark-harmony", 0, "progressions");
      expect(amToC.isRelative).toBe(true);
      expect(amToC.relationName).toBe("Relative Major");

      // C Major -> C Minor
      const cToCm = getKeyRelationship(0, "progressions", 0, "dark-harmony");
      expect(cToCm.isParallel).toBe(true);
      expect(cToCm.relationName).toBe("Parallel Minor");

      // C Major -> D Major (+2 semitones)
      const cToD = getKeyRelationship(0, "progressions", 2, "progressions");
      expect(cToD.isDirectLift).toBe(true);
      expect(cToD.relationName).toContain("Whole-step Lift");

      // C Major -> Eb Major (mediant)
      const cToEb = getKeyRelationship(0, "progressions", 3, "progressions");
      expect(cToEb.isMediant).toBe(true);
      expect(cToEb.relationName).toContain("Chromatic Mediant");
    });

    it("formats key names accurately", () => {
      expect(formatKeyName(0, "progressions")).toBe("C Major");
      expect(formatKeyName(9, "dark-harmony")).toBe("A Minor");
      expect(formatKeyName(3, "progressions")).toBe("Eb Major");
      expect(formatKeyName(7, "progressions")).toBe("G Major");
    });
  });

  describe("getAvailableModulations", () => {
    it("returns empty paths if source and target keys are identical", () => {
      const paths = getAvailableModulations(0, "progressions", 0, "progressions");
      expect(paths).toHaveLength(0);
    });

    it("discovers common chord pivots between C Major and G Major", () => {
      const paths = getAvailableModulations(0, "progressions", 7, "progressions");
      expect(paths.length).toBeGreaterThanOrEqual(3);

      const pivotPaths = paths.filter((p) => p.category === "pivot");
      expect(pivotPaths.length).toBeGreaterThanOrEqual(1);

      // Am (vi in C, ii in G) or Em (iii in C, vi in G) or C (I in C, IV in G)
      const amPivot = pivotPaths.find((p) => p.bridgeSteps[0]?.chordSymbol === "Am");
      expect(amPivot).toBeDefined();
      if (amPivot) {
        expect(amPivot.bridgeSteps).toHaveLength(3);
        expect(amPivot.bridgeSteps[0]?.role).toBe("pivot");
        expect(amPivot.bridgeSteps[0]?.sourceFunction.roman).toBe("vi");
        expect(amPivot.bridgeSteps[0]?.targetFunction.roman).toBe("ii");

        expect(amPivot.bridgeSteps[1]?.role).toBe("dominant");
        expect(amPivot.bridgeSteps[1]?.chordSymbol).toBe("D7");

        expect(amPivot.bridgeSteps[2]?.role).toBe("arrival");
        expect(amPivot.bridgeSteps[2]?.chordSymbol).toBe("G");
      }
    });

    it("discovers jazz turnarounds (ii - V7 - I) into target key", () => {
      const paths = getAvailableModulations(0, "progressions", 7, "progressions");
      const turnaround = paths.find((p) => p.category === "jazz-turnaround");
      expect(turnaround).toBeDefined();
      if (turnaround) {
        expect(turnaround.bridgeSteps[0]?.chordSymbol).toBe("Am"); // ii of G
        expect(turnaround.bridgeSteps[1]?.chordSymbol).toBe("D7"); // V7 of G
        expect(turnaround.bridgeSteps[2]?.chordSymbol).toBe("G"); // I of G
      }
    });

    it("discovers tritone substitution bridge (subV7 -> I)", () => {
      const paths = getAvailableModulations(0, "progressions", 7, "progressions");
      const tritonePath = paths.find((p) => p.category === "tritone-sub");
      expect(tritonePath).toBeDefined();
      if (tritonePath) {
        expect(tritonePath.bridgeSteps[0]?.chordSymbol).toBe("Ab7"); // subV7 of G
        expect(tritonePath.bridgeSteps[0]?.role).toBe("dominant");
        expect(tritonePath.bridgeSteps[1]?.chordSymbol).toBe("G");
      }
    });

    it("discovers modal pivot between C Major and Eb Major via Fm", () => {
      const paths = getAvailableModulations(0, "progressions", 3, "progressions");
      const modalPivot = paths.find(
        (p) => p.category === "pivot" && p.bridgeSteps[0]?.chordSymbol === "Fm",
      );
      expect(modalPivot).toBeDefined();
      if (modalPivot) {
        expect(modalPivot.bridgeSteps[0]?.sourceFunction.roman).toBe("iv");
        expect(modalPivot.bridgeSteps[0]?.targetFunction.roman).toBe("ii");
        expect(modalPivot.bridgeSteps[1]?.chordSymbol).toBe("Bb7");
        expect(modalPivot.bridgeSteps[2]?.chordSymbol).toBe("Eb");
      }
    });

    it("discovers anthemic truck-driver lift for whole-step modulation C -> D", () => {
      const paths = getAvailableModulations(0, "progressions", 2, "progressions");
      const lift = paths.find((p) => p.category === "direct-lift");
      expect(lift).toBeDefined();
      if (lift) {
        expect(lift.bridgeSteps[0]?.chordSymbol).toBe("A7");
        expect(lift.bridgeSteps[1]?.chordSymbol).toBe("D");
      }
    });

    it("supports minor key target (C Major -> A Minor)", () => {
      const paths = getAvailableModulations(0, "progressions", 9, "dark-harmony");
      expect(paths.length).toBeGreaterThanOrEqual(2);
      const arrival = paths[0]?.bridgeSteps[paths[0].bridgeSteps.length - 1];
      expect(arrival?.chordSymbol).toBe("Am");
      expect(arrival?.baseQuality).toBe("minor");
    });
  });

  describe("getModulationCategoryBadge", () => {
    it("returns correct badges and classes", () => {
      expect(getModulationCategoryBadge("pivot").label).toBe("Common Chord");
      expect(getModulationCategoryBadge("jazz-turnaround").label).toBe("Jazz Turnaround");
      expect(getModulationCategoryBadge("tritone-sub").label).toBe("Tritone Bridge");
      expect(getModulationCategoryBadge("chromatic-mediant").label).toBe("Chromatic Mediant");
      expect(getModulationCategoryBadge("direct-lift").label).toBe("Anthemic Lift");
    });
  });
});
