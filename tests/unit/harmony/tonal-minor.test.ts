import { describe, expect, it } from "vitest";
import { realizeDarkHarmonyChord } from "../../../src/domain/harmony/modules/darkHarmony";

describe("Tonal Minor", () => {
  it("uses harmonic-minor dominant and leading tone resources", () => {
    expect(realizeDarkHarmonyChord("V", 9).spelling.symbol).toBe("E");
    expect(realizeDarkHarmonyChord("V", 9).baseQuality).toBe("major");
    expect(realizeDarkHarmonyChord("vii°", 9).spelling.symbol).toBe("G#");
  });
  it("keeps natural-minor variants available", () => {
    expect(realizeDarkHarmonyChord("v", 9).baseQuality).toBe("minor");
    expect(realizeDarkHarmonyChord("VII", 9).spelling.symbol).toBe("G");
  });
});
