import type { CardViewId } from "../../domain/progression/step";

/**
 * The card views the shared view toggle offers by default.
 *
 * This lives outside `ViewModeToggle.tsx` so that module only exports components: mixing a constant
 * into a component module defeats React Fast Refresh for the whole file
 * (`react-refresh/only-export-components`).
 *
 * It is also the list the persistence drift guard compares against the portable schema, so a view
 * the UI can offer but cannot persist fails a test instead of a save.
 */
export const DEFAULT_VIEW_IDS: readonly CardViewId[] = Object.freeze([
  "harmonic",
  "piano",
  "staff",
  "guitar",
  "tablature",
]);
