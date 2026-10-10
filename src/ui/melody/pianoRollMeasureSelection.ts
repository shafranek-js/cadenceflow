import type { EffectiveMelodyNote } from "../../domain/melody/effectiveTimeline";
import { addRational, compareRational, type Rational } from "../../domain/timing/rational";
import { pianoRollNoteIdentity } from "./pianoRollGroupSelection";

export interface PianoRollMeasureWindow {
  readonly measureIndex: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
}

export const EMPTY_PIANO_ROLL_SELECTION: ReadonlySet<string> = new Set();

/** Keep selection props local to the Measures that visibly contain each selected note. */
export function partitionPianoRollNoteSelectionByMeasure(
  measures: readonly PianoRollMeasureWindow[],
  effectiveNotes: readonly EffectiveMelodyNote[],
  selectedIdentities: ReadonlySet<string>,
): readonly ReadonlySet<string>[] {
  if (selectedIdentities.size === 0) return measures.map(() => EMPTY_PIANO_ROLL_SELECTION);
  const notesByIdentity = new Map(
    effectiveNotes.map((note) => [pianoRollNoteIdentity(note.sourceStepId, note.eventKey), note]),
  );
  const selectedByMeasure = measures.map(() => new Set<string>());
  for (const identity of selectedIdentities) {
    const note = notesByIdentity.get(identity);
    if (!note) continue;
    const noteEnd = addRational(note.startBeats, note.durationBeats);
    for (const measure of measures) {
      if (
        compareRational(note.startBeats, measure.endBeats) < 0 &&
        compareRational(noteEnd, measure.startBeats) > 0
      )
        selectedByMeasure[measure.measureIndex]?.add(identity);
    }
  }
  return selectedByMeasure.map((selected) =>
    selected.size > 0 ? selected : EMPTY_PIANO_ROLL_SELECTION,
  );
}
