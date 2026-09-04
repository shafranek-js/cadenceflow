import { describe, expect, it } from "vitest";
import {
  PROGRESSIONS_MODULE,
  realizeProgressionsChord,
} from "../../../src/domain/harmony/modules/progressions";

describe("Progressions module", () => {
  it("keeps the three launch layers", () => {
    expect(PROGRESSIONS_MODULE.layers.map((layer) => layer.id)).toEqual([
      "secondary-dominants",
      "diatonic-core",
      "modal-interchange",
    ]);
  });
  it("realizes C major diatonic core", () => {
    expect(
      ["I", "vi", "IV", "ii", "V", "iii", "vii°"].map(
        (id) => realizeProgressionsChord(id, 0).spelling.symbol,
      ),
    ).toEqual(["C", "A", "F", "D", "G", "E", "B"]);
  });
  it("realizes V7/V in C as D dominant", () => {
    const chord = realizeProgressionsChord("V7/V", 0);
    expect(chord.spelling.symbol).toBe("D");
    expect(chord.baseQuality).toBe("dominant");
  });
  it("keeps card positions stable", () => {
    const positions = new Set(
      PROGRESSIONS_MODULE.topology.cards.map(
        (card) => `${card.position.column}:${card.position.row}`,
      ),
    );
    expect(positions.size).toBe(PROGRESSIONS_MODULE.topology.cards.length);
  });
});
