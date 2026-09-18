import { describe, expect, it } from "vitest";
import {
  SUZUKI_NOTE_COLORS,
  SUZUKI_NOTE_STROKES,
  getSuzukiNoteColor,
  getSuzukiNoteStroke,
  isDiatonicStep,
} from "../../../src/notation/suzukiColors";

describe("suzukiColors", () => {
  it("defines the canonical Suzuki / Chroma-Notes rainbow spectrum for all 7 diatonic pitch classes", () => {
    expect(SUZUKI_NOTE_COLORS.C).toBe("#fc0200"); // Red
    expect(SUZUKI_NOTE_COLORS.D).toBe("#fda101"); // Orange
    expect(SUZUKI_NOTE_COLORS.E).toBe("#fbf405"); // Yellow
    expect(SUZUKI_NOTE_COLORS.F).toBe("#29df00"); // Green
    expect(SUZUKI_NOTE_COLORS.G).toBe("#29e1fe"); // Light Blue / Cyan
    expect(SUZUKI_NOTE_COLORS.A).toBe("#0100d6"); // Deep Blue
    expect(SUZUKI_NOTE_COLORS.B).toBe("#fd01fa"); // Magenta / Purple
  });

  it("identifies diatonic steps correctly with isDiatonicStep", () => {
    for (const step of ["A", "B", "C", "D", "E", "F", "G"]) {
      expect(isDiatonicStep(step)).toBe(true);
    }
    expect(isDiatonicStep("H")).toBe(false);
    expect(isDiatonicStep("c")).toBe(false);
    expect(isDiatonicStep("")).toBe(false);
    expect(isDiatonicStep("C#")).toBe(false);
  });

  it("extracts and maps note color from various pitch representations with getSuzukiNoteColor", () => {
    // Pure uppercase step
    expect(getSuzukiNoteColor("C")).toBe("#fc0200");
    expect(getSuzukiNoteColor("D")).toBe("#fda101");
    expect(getSuzukiNoteColor("E")).toBe("#fbf405");
    expect(getSuzukiNoteColor("F")).toBe("#29df00");
    expect(getSuzukiNoteColor("G")).toBe("#29e1fe");
    expect(getSuzukiNoteColor("A")).toBe("#0100d6");
    expect(getSuzukiNoteColor("B")).toBe("#fd01fa");

    // Case insensitivity
    expect(getSuzukiNoteColor("c")).toBe("#fc0200");
    expect(getSuzukiNoteColor("d")).toBe("#fda101");
    expect(getSuzukiNoteColor("e")).toBe("#fbf405");

    // Altered pitch strings inherit base diatonic step color
    expect(getSuzukiNoteColor("C#")).toBe("#fc0200");
    expect(getSuzukiNoteColor("Db")).toBe("#fda101");
    expect(getSuzukiNoteColor("F#")).toBe("#29df00");
    expect(getSuzukiNoteColor("Bb")).toBe("#fd01fa");

    // VexFlow pitch key format e.g. "c/4", "f#/5", "bb/3"
    expect(getSuzukiNoteColor("c/4")).toBe("#fc0200");
    expect(getSuzukiNoteColor("f#/5")).toBe("#29df00");
    expect(getSuzukiNoteColor("bb/3")).toBe("#fd01fa");
    expect(getSuzukiNoteColor("g#/4")).toBe("#29e1fe");
  });

  it("returns undefined for empty or non-diatonic strings", () => {
    expect(getSuzukiNoteColor("")).toBeUndefined();
    expect(getSuzukiNoteColor("X")).toBeUndefined();
    expect(getSuzukiNoteColor("123")).toBeUndefined();
  });

  it("ensures all 7 Suzuki colors are distinct valid hex codes", () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    const values = Object.values(SUZUKI_NOTE_COLORS);
    expect(new Set(values).size).toBe(7);
    for (const color of values) {
      expect(color).toMatch(hexRegex);
    }
  });

  it("provides dark-yellow stroke for step E (yellow) notehead outline and falls back to fill for others", () => {
    expect(SUZUKI_NOTE_STROKES.E).toBe("#b45309");
    expect(getSuzukiNoteStroke("E")).toBe("#b45309");
    expect(getSuzukiNoteStroke("e")).toBe("#b45309");
    expect(getSuzukiNoteStroke("e/4")).toBe("#b45309");
    expect(getSuzukiNoteStroke("Eb")).toBe("#b45309");

    // Other notes fall back to their own fill color
    expect(getSuzukiNoteStroke("C")).toBe("#fc0200");
    expect(getSuzukiNoteStroke("G")).toBe("#29e1fe");
    expect(getSuzukiNoteStroke("")).toBeUndefined();
  });
});
