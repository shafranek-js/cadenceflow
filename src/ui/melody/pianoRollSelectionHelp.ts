export function isPianoRollSelectionHelpOpenTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".piano-roll-selection-help")) return true;
  return Boolean(
    target.closest(".piano-roll-selection-action")?.querySelector("button[aria-describedby]"),
  );
}
