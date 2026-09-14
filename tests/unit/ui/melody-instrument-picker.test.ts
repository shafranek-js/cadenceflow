import { describe, expect, it } from "vitest";
import { normalizeMelodyInstrumentSearch } from "../../../src/ui/melody/instrumentSearch";

describe("T188 Melody instrument search", () => {
  it("normalizes punctuation so parenthesized catalog labels match token queries", () => {
    expect(normalizeMelodyInstrumentSearch("Electric Guitar clean")).toBe("electric guitar clean");
    expect(normalizeMelodyInstrumentSearch("Electric Guitar (clean)")).toBe(
      "electric guitar clean",
    );
  });
});
