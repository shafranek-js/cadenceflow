import { describe, expect, it } from "vitest";
import {
  SUZUKI_NOTE_COLORS,
  getSuzukiNoteColor,
  isDiatonicStep,
} from "../../../src/notation/suzukiColors";

describe("suzukiColors", () => {
  it("defines the canonical Suzuki / Chroma-Notes rainbow spectrum for all 7 diatonic pitch classes", () => {
    expect(SUZUKI_NOTE_COLORS.C).toBe("#dc2626"); // Crimson Red
    expect(SUZUKI_NOTE_COLORS.D).toBe("#c2410c"); // Tangerine Orange
    expect(SUZUKI_NOTE_COLORS.E).toBe("#b45309"); // Amber Gold
    expect(SUZUKI_NOTE_COLORS.F).toBe("#15803d"); // Emerald Green
    expect(SUZUKI_NOTE_COLORS.G).toBe("#0369a1"); // Cerulean Blue
    expect(SUZUKI_NOTE_COLORS.A).toBe("#4338ca"); // Royal Indigo
    expect(SUZUKI_NOTE_COLORS.B).toBe("#6d28d9"); // Amethyst Purple
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
    expect(getSuzukiNoteColor("C")).toBe("#dc2626");
    expect(getSuzukiNoteColor("D")).toBe("#c2410c");
    expect(getSuzukiNoteColor("E")).toBe("#b45309");
    expect(getSuzukiNoteColor("F")).toBe("#15803d");
    expect(getSuzukiNoteColor("G")).toBe("#0369a1");
    expect(getSuzukiNoteColor("A")).toBe("#4338ca");
    expect(getSuzukiNoteColor("B")).toBe("#6d28d9");

    // Case insensitivity
    expect(getSuzukiNoteColor("c")).toBe("#dc2626");
    expect(getSuzukiNoteColor("d")).toBe("#c2410c");
    expect(getSuzukiNoteColor("e")).toBe("#b45309");

    // Altered pitch strings inherit base diatonic step color
    expect(getSuzukiNoteColor("C#")).toBe("#dc2626");
    expect(getSuzukiNoteColor("Db")).toBe("#c2410c");
    expect(getSuzukiNoteColor("F#")).toBe("#15803d");
    expect(getSuzukiNoteColor("Bb")).toBe("#6d28d9");

    // VexFlow pitch key format e.g. "c/4", "f#/5", "bb/3"
    expect(getSuzukiNoteColor("c/4")).toBe("#dc2626");
    expect(getSuzukiNoteColor("f#/5")).toBe("#15803d");
    expect(getSuzukiNoteColor("bb/3")).toBe("#6d28d9");
    expect(getSuzukiNoteColor("g#/4")).toBe("#0369a1");
  });

  it("returns undefined for empty or non-diatonic strings", () => {
    expect(getSuzukiNoteColor("")).toBeUndefined();
    expect(getSuzukiNoteColor("X")).toBeUndefined();
    expect(getSuzukiNoteColor("123")).toBeUndefined();
  });

  it("ensures all 7 Suzuki colors meet WCAG AA contrast against score paper (#fffdf7)", () => {
    // Relative luminance calculation according to WCAG 2.1
    function luminance(hex: string): number {
      const rgb = [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ].map((val) => (val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)));
      return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    }

    function contrastRatio(hex1: string, hex2: string): number {
      const l1 = luminance(hex1);
      const l2 = luminance(hex2);
      const brighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (brighter + 0.05) / (darker + 0.05);
    }

    const scorePaper = "#fffdf7";
    for (const [step, color] of Object.entries(SUZUKI_NOTE_COLORS)) {
      const ratio = contrastRatio(color, scorePaper);
      // Contrast against musical paper must be at least 4.5:1 (WCAG AA)
      expect(ratio, `Color for step ${step} (${color}) should have >= 4.5 contrast ratio`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
