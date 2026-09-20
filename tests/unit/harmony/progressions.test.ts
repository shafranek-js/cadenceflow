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
  it("realizes V7 in C as G dominant targeting I", () => {
    const chord = realizeProgressionsChord("V7", 0);
    expect(chord.spelling.symbol).toBe("G");
    expect(chord.baseQuality).toBe("dominant");
    expect(chord.harmonicFunction.targetFunctionId).toBe("I");
  });
  it("supports V7/I as alias for V7", () => {
    const chord = realizeProgressionsChord("V7/I", 0);
    expect(chord.spelling.symbol).toBe("G");
    expect(chord.harmonicFunction.targetFunctionId).toBe("I");
  });
  it("strictly aligns every secondary dominant directly above its diatonic target column", () => {
    const cardsByFunction = new Map(
      PROGRESSIONS_MODULE.topology.cards.map((card) => [card.identity.functionId, card]),
    );
    const expectedAlignments: Array<[string, string, number]> = [
      ["V7", "I", 0],
      ["V7/vi", "vi", 1],
      ["V7/IV", "IV", 2],
      ["V7/ii", "ii", 3],
      ["V7/V", "V", 4],
      ["V7/iii", "iii", 5],
    ];
    for (const [dominantId, targetId, expectedColumn] of expectedAlignments) {
      const dominantCard = cardsByFunction.get(dominantId);
      const targetCard = cardsByFunction.get(targetId);
      expect(dominantCard, `Dominant ${dominantId} should exist`).toBeDefined();
      expect(targetCard, `Target ${targetId} should exist`).toBeDefined();
      expect(dominantCard!.position.column).toBe(expectedColumn);
      expect(targetCard!.position.column).toBe(expectedColumn);
      expect(dominantCard!.position.column).toBe(targetCard!.position.column);
    }
  });
  it("configures canonical 6-column baseline counts per layer", () => {
    const baselineCards = PROGRESSIONS_MODULE.topology.cards.filter((card) => card.baseline);
    const secDomCards = baselineCards.filter((card) => card.layerId === "secondary-dominants");
    const coreCards = baselineCards.filter((card) => card.layerId === "diatonic-core");
    const modalCards = baselineCards.filter((card) => card.layerId === "modal-interchange");

    expect(secDomCards).toHaveLength(6);
    expect(coreCards).toHaveLength(7);
    expect(modalCards).toHaveLength(4);

    // Modal interchange chords are centered in columns 1..4
    expect(modalCards.map((c) => c.position.column)).toEqual([1, 2, 3, 4]);

    // vii° is the seventh visible Main Chords card.
    const viiCard = PROGRESSIONS_MODULE.topology.cards.find(
      (card) => card.identity.functionId === "vii°",
    );
    expect(viiCard).toBeDefined();
    expect(viiCard!.baseline).toBe(true);
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
