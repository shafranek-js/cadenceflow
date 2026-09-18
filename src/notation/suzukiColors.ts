import type { DiatonicStep } from "../domain/harmony/pitch";

/**
 * Suzuki / Chroma-Notes rainbow spectrum palette matching reference:
 *
 * C: Red (#fc0200)
 * D: Orange (#fda101)
 * E: Yellow (#fbf405)
 * F: Green (#29df00)
 * G: Light Blue / Cyan (#29e1fe)
 * A: Deep Blue (#0100d6)
 * B: Magenta / Purple (#fd01fa)
 */
export const SUZUKI_NOTE_COLORS: Readonly<Record<DiatonicStep, string>> = Object.freeze({
  C: "#fc0200",
  D: "#fda101",
  E: "#fbf405",
  F: "#29df00",
  G: "#29e1fe",
  A: "#0100d6",
  B: "#fd01fa",
});

/**
 * Distinct outline / stroke colors for noteheads requiring extra contrast against light score paper.
 * Step E (yellow) receives a dark-yellow / golden-amber outline (#b45309).
 */
export const SUZUKI_NOTE_STROKES: Readonly<Partial<Record<DiatonicStep, string>>> = Object.freeze({
  E: "#b45309",
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

/**
 * Returns the Suzuki stroke / outline color hex code for a given diatonic step.
 * Falls back to the note's fill color if no special stroke is defined.
 */
export function getSuzukiNoteStroke(stepOrKey: string): string | undefined {
  const match = stepOrKey.trim().match(/^[a-gA-G]/);
  if (!match) return undefined;
  const step = match[0].toUpperCase() as DiatonicStep;
  return SUZUKI_NOTE_STROKES[step] ?? SUZUKI_NOTE_COLORS[step];
}
