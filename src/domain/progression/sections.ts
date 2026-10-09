import type { Progression, SongSection } from "./progression";

/** Stable canonical order: boundary position, then section ID for shared boundaries. */
export function orderSongSections(progression: Progression): readonly SongSection[] {
  const position = new Map(progression.steps.map((step, index) => [step.id, index]));
  return Object.freeze(
    [...(progression.sections ?? [])].sort(
      (a, b) =>
        (position.get(a.startStepId) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(b.startStepId) ?? Number.MAX_SAFE_INTEGER) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    ),
  );
}

/**
 * Returns the Progression with Song Sections ordered canonically and any section whose
 * `startStepId` no longer exists removed.
 *
 * Returns the **same object** when there is nothing to change. That identity matters: commands use
 * this to build their forward and inverse states, and an undo whose inverse re-allocates an
 * equal-but-distinct Progression breaks referential equality (`restored.progression ===
 * originalProgression`) and defeats memoisation in the UI even though the value is unchanged.
 */
export function normalizeSongSections(progression: Progression): Progression {
  const stepIds = new Set(progression.steps.map((step) => step.id));
  const existing = progression.sections ?? [];
  const sections = Object.freeze(
    orderSongSections(progression).filter((section) => stepIds.has(section.startStepId)),
  );
  // Already in canonical order, with nothing filtered out and nothing added: nothing to do.
  if (
    progression.sections !== undefined &&
    sections.length === existing.length &&
    sections.every((section, index) => section === existing[index])
  ) {
    return progression;
  }
  return Object.freeze({ ...progression, sections });
}

export function validateSongSections(progression: Progression): void {
  const stepIds = new Set(progression.steps.map((step) => step.id));
  const sectionIds = new Set<string>();
  for (const section of progression.sections ?? []) {
    if (!section.id.trim() || sectionIds.has(section.id))
      throw new RangeError(`Song Section IDs must be non-empty and unique: ${section.id}`);
    sectionIds.add(section.id);
    if (!section.name.trim()) throw new RangeError(`Song Section ${section.id} needs a name`);
    if (!stepIds.has(section.startStepId))
      throw new RangeError(
        `Song Section ${section.id} references missing Step ${section.startStepId}`,
      );
  }
}
