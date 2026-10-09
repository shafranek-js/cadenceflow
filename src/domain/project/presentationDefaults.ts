import type { PresentationState } from "./project";

/**
 * Canonical default presentation state, shared by the project factory and the migration chain.
 *
 * This lives in its own module to avoid an import cycle: `factory.ts` needs
 * `CURRENT_PROJECT_SCHEMA_VERSION` from `migrations.ts`, so `migrations.ts` must not import the
 * factory. The v8→v9 migration backfills these values into legacy files so that the project
 * schema can require them.
 */
export const DEFAULT_PRESENTATION_STATE: PresentationState = Object.freeze({
  expertiseMode: "composer",
  theme: "dark",
  globalMatrixCardView: "harmonic",
  progressionView: "piano-roll",
  measuresPerSystem: "auto",
  showBassInStaff: false,
  noteColorMode: "standard",
  resolutionArrows: true,
  genreFocus: "all",
  guitarChordOrientation: "horizontal",
  guitarChordColorMode: "chord-roles",
  sidePanelMode: "fixed",
});

/**
 * The subset of defaults a migration may inject into an older file.
 *
 * Excludes the members that the **decoder** can derive from genuinely legacy data:
 *
 * - `progressionView` — `decodeProgressionView` infers it from the Steps' own `cardView` values,
 *   but only when the key is absent. Writing a value here would discard that information and pin
 *   every migrated project to the current default.
 * - `measuresPerSystem` — `decodeMeasuresPerSystem` reads the older `measureLayoutColumns` alias
 *   under the same "only when absent" rule.
 *
 * Members listed here have no legacy representation, so filling them is lossless; they are also
 * what the project schema requires, which is why they must be present after migration.
 */
export function backfillPresentationDefaults(): Partial<PresentationState> {
  const {
    progressionView: _view,
    measuresPerSystem: _packing,
    ...rest
  } = DEFAULT_PRESENTATION_STATE;
  return rest;
}
