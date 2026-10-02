export type LabelHierarchyMode = "function-first" | "chord-first" | "inline";

export const LABEL_HIERARCHY_MODES: readonly {
  readonly value: LabelHierarchyMode;
  readonly label: string;
  readonly description: string;
}[] = Object.freeze([
  Object.freeze({
    value: "function-first" as const,
    label: "Function first",
    description: "Show the harmonic function as the primary label.",
  }),
  Object.freeze({
    value: "chord-first" as const,
    label: "Chord first",
    description: "Show the realized chord symbol as the primary label.",
  }),
  Object.freeze({
    value: "inline" as const,
    label: "Inline",
    description: "Keep the chord symbol and function on one compact line.",
  }),
]);

export function formatProgressionChordLabel(
  mode: LabelHierarchyMode,
  functionLabel: string,
  chordLabel: string,
): string {
  if (mode === "chord-first") return `${chordLabel} · ${functionLabel}`;
  if (mode === "inline") return `${chordLabel} (${functionLabel})`;
  return `${functionLabel} · ${chordLabel}`;
}
