import { describe, expect, it } from "vitest";
import {
  DARK_HARMONY_MODULE,
  realizeDarkHarmonyChord,
} from "../../../src/domain/harmony/modules/darkHarmony";

describe("Dark Harmony", () => {
  it("uses the compact three-layer launch topology", () =>
    expect(DARK_HARMONY_MODULE.layers.map((x) => x.id)).toEqual([
      "secondary-diminished",
      "tonal-minor-core",
      "chromatic-colors",
    ]));
  it("realizes Neapolitan in A minor as Bb major", () => {
    const chord = realizeDarkHarmonyChord("N6", 9);
    expect(chord.spelling.symbol).toBe("Bb");
    expect(chord.baseQuality).toBe("major");
  });
});
