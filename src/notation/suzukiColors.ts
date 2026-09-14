import type { DiatonicStep } from "../domain/harmony/pitch";

/**
 * High-contrast, WCAG AA compliant Suzuki / Rainbow spectrum palette.
 * Calibrated against standard musical paper (--score-paper: #fffdf7).
 *
 * C: Crimson Red
 * D: Tangerine Orange
 * E: Amber Gold
 * F: Emerald Green
 * G: Cerulean Blue
 * A: Royal Indigo
 * B: Amethyst Purple
 */
export const SUZUKI_NOTE_COLORS: Readonly<Record<DiatonicStep, string>> = Object.freeze({
  C: "#dc2626",
  D: "#c2410c",
  E: "#b45309",
  F: "#15803d",
  G: "#0369a1",
  A: "#4338ca",
  B: "#6d28d9",
});

const VALID_STEPS = new Set<string>(["C", "D", "E", "F", "G", "A", "B"]);

export function isDiatonicStep(value: string): value is DiatonicStep {
  return VALID_STEPS.has(value);
}

/**
 * Returns the Suzuki color hex code for a given diatonic step name or pitch key.
 * Case-insensitive, accepts unaltered, altered, or octave-qualified pitch strings
 * (e.g. "C", "c", "C#", "Db", "c/4", "f#/5").
 */
export function getSuzukiNoteColor(stepOrKey: string): string | undefined {
  const match = stepOrKey.trim().match(/^[a-gA-G]/);
  if (!match) return undefined;
  const step = match[0].toUpperCase() as DiatonicStep;
  return SUZUKI_NOTE_COLORS[step];
}
