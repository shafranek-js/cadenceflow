import { describe, expect, it } from "vitest";
import {
  MATRIX_ZONES,
  getZoneForLayer,
  getResolutionTarget,
} from "../../../src/domain/harmony/tendencyArrows";

describe("Harmonic tendency arrows and functional zoning", () => {
  describe("getZoneForLayer", () => {
    it("classifies core diatonic and minor layers into core zone", () => {
      const diatonicZone = getZoneForLayer("diatonic-core");
      expect(diatonicZone.id).toBe("core");
      expect(diatonicZone.badge).toBe("Mix Chords");
      expect(diatonicZone.symbol).toBe("∞");

      const tonalMinorZone = getZoneForLayer("tonal-minor-core");
      expect(tonalMinorZone.id).toBe("core");
    });

    it("classifies secondary dominants and secondary diminished into tension zone", () => {
      const secDomZone = getZoneForLayer("secondary-dominants");
      expect(secDomZone.id).toBe("tension");
      expect(secDomZone.badge).toBe("Don't Mix");
      expect(secDomZone.symbol).toBe("⊘");

      const secDimZone = getZoneForLayer("secondary-diminished");
      expect(secDimZone.id).toBe("tension");
      expect(secDimZone.badge).toBe("Don't Mix");
    });

    it("classifies modal interchange and chromatic colors into color zone", () => {
      const modalZone = getZoneForLayer("modal-interchange");
      expect(modalZone.id).toBe("color");
      expect(modalZone.badge).toBe("Modal Color");
      expect(modalZone.symbol).toBe("≈");

      const chromaticZone = getZoneForLayer("chromatic-colors");
      expect(chromaticZone.id).toBe("color");
    });
  });

  describe("getResolutionTarget", () => {
    it("maps dominant V7 and V7/I to tonic I", () => {
      expect(getResolutionTarget("V7", "progressions")).toBe("I");
      expect(getResolutionTarget("V7/I", "progressions")).toBe("I");
    });

    it("maps standard secondary dominants to their diatonic core targets", () => {
      expect(getResolutionTarget("V7/ii", "progressions")).toBe("ii");
      expect(getResolutionTarget("V7/iii", "progressions")).toBe("iii");
      expect(getResolutionTarget("V7/IV", "progressions")).toBe("IV");
      expect(getResolutionTarget("V7/V", "progressions")).toBe("V");
      expect(getResolutionTarget("V7/vi", "progressions")).toBe("vi");
    });

    it("maps Neapolitan chord N6 to dominant V", () => {
      expect(getResolutionTarget("N6", "progressions")).toBe("V");
    });

    it("maps secondary diminished chords to their respective targets", () => {
      expect(getResolutionTarget("vii°7/ii", "dark-harmony")).toBe("ii");
      expect(getResolutionTarget("vii°7/iv", "dark-harmony")).toBe("iv");
      expect(getResolutionTarget("vii°7/V", "dark-harmony")).toBe("V");
      expect(getResolutionTarget("vii°7/VI", "dark-harmony")).toBe("VI");
    });

    it("returns undefined for chords without a directional resolution target", () => {
      expect(getResolutionTarget("I", "progressions")).toBeUndefined();
      expect(getResolutionTarget("IV", "progressions")).toBeUndefined();
      expect(getResolutionTarget("vi", "progressions")).toBeUndefined();
      expect(getResolutionTarget("bVI", "progressions")).toBeUndefined();
    });
  });
});
