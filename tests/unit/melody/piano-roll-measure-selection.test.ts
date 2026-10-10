import { describe, expect, it } from "vitest";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { rational } from "../../../src/domain/timing/rational";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { pianoRollNoteIdentity } from "../../../src/ui/melody/pianoRollGroupSelection";
import {
  EMPTY_PIANO_ROLL_SELECTION,
  partitionPianoRollNoteSelectionByMeasure,
} from "../../../src/ui/melody/pianoRollMeasureSelection";

describe("partitionPianoRollNoteSelectionByMeasure", () => {
  it("keeps a cross-measure selected note visible in both measures and leaves others empty", () => {
    const project = createRichProjectFixture();
    const [source, other] = createEffectiveMelodyTimeline(project);
    expect(source).toBeDefined();
    expect(other).toBeDefined();
    const crossingNote = {
      ...source!,
      startBeats: rational(3),
      durationBeats: rational(2),
    };
    const otherNote = {
      ...other!,
      startBeats: rational(5),
      durationBeats: rational(1),
    };
    const measures = [
      { measureIndex: 0, startBeats: rational(0), endBeats: rational(4) },
      { measureIndex: 1, startBeats: rational(4), endBeats: rational(8) },
      { measureIndex: 2, startBeats: rational(8), endBeats: rational(12) },
    ];
    const crossingId = pianoRollNoteIdentity(crossingNote.sourceStepId, crossingNote.eventKey);
    const otherId = pianoRollNoteIdentity(otherNote.sourceStepId, otherNote.eventKey);
    const selected = partitionPianoRollNoteSelectionByMeasure(
      measures,
      [crossingNote, otherNote],
      new Set([crossingId]),
    );

    expect(selected[0]).toEqual(new Set([crossingId]));
    expect(selected[1]).toEqual(new Set([crossingId]));
    expect(selected[2]).toBe(EMPTY_PIANO_ROLL_SELECTION);
    expect(selected.some((identities) => identities.has(otherId))).toBe(false);
  });

  it("reuses the shared empty selection for every measure when nothing is selected", () => {
    const selected = partitionPianoRollNoteSelectionByMeasure(
      [
        { measureIndex: 0, startBeats: rational(0), endBeats: rational(4) },
        { measureIndex: 1, startBeats: rational(4), endBeats: rational(8) },
      ],
      [],
      new Set(),
    );

    expect(selected).toEqual([EMPTY_PIANO_ROLL_SELECTION, EMPTY_PIANO_ROLL_SELECTION]);
    expect(selected[0]).toBe(selected[1]);
  });
});
