import { describe, expect, it } from "vitest";
import { getFunctionSemantics } from "../../../src/domain/harmony/functionSemantics";

describe("Harmonic function semantics and style hints", () => {
  it("provides comprehensive semantics for secondary dominants", () => {
    const v7 = getFunctionSemantics("V7");
    expect(v7.functionId).toBe("V7");
    expect(v7.title).toContain("Первичный доминантсептаккорд");
    expect(v7.rule).toContain("Don't Mix");
    expect(v7.styleHints).toContain("Blues");
    expect(v7.tendencyType).toBe("dominant-resolution");

    const v7vi = getFunctionSemantics("V7/vi");
    expect(v7vi.title).toContain("параллельному минору vi");
    expect(v7vi.rule).toContain("Don't Mix");
    expect(v7vi.styleHints).toContain("Neo-Soul");
  });

  it("provides comprehensive semantics for diatonic core chords", () => {
    const tonic = getFunctionSemantics("I");
    expect(tonic.title).toContain("Главная тоническая опора");
    expect(tonic.rule).toContain("Mix Chords");
    expect(tonic.tendencyType).toBe("free-combinatorial");

    const subdom = getFunctionSemantics("IV");
    expect(subdom.title).toContain("Субдоминанта");
    expect(subdom.rule).toContain("Mix Chords");

    const dominant = getFunctionSemantics("V");
    expect(dominant.title).toContain("Доминанта");
  });

  it("provides comprehensive semantics for modal interchange chords", () => {
    const bIII = getFunctionSemantics("bIII");
    expect(bIII.title).toContain("Низкая терция");
    expect(bIII.styleHints).toContain("Cinematic");
    expect(bIII.rule).toContain("Modal Color");
    expect(bIII.tendencyType).toBe("modal-color");

    const bVII = getFunctionSemantics("bVII");
    expect(bVII.title).toContain("Миксолидийская септима");
    expect(bVII.styleHints).toContain("Classic Rock");

    const iv = getFunctionSemantics("iv");
    expect(iv.title).toContain("Минорная субдоминанта");
    expect(iv.styleHints).toContain("Beatles-style");
  });

  it("provides fallback for dynamic secondary diminished chords", () => {
    const dimV = getFunctionSemantics("vii°7/V");
    expect(dimV.title).toContain("к V");
    expect(dimV.rule).toContain("Don't Mix");
    expect(dimV.tendencyType).toBe("diminished-tension");
  });
});
