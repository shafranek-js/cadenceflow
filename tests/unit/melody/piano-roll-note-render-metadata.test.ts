import { describe, expect, it } from "vitest";
import { createEffectiveMelodyTimeline } from "../../../src/domain/melody/effectiveTimeline";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { PianoRollNoteRenderMetadataCache } from "../../../src/ui/melody/pianoRollNoteRenderMetadata";
import { isPianoRollNoteAuthored } from "../../../src/ui/melody/pianoRollProjection";

describe("PianoRollNoteRenderMetadataCache", () => {
  it("reuses per-step roles across selection-only project snapshots", () => {
    const project = createRichProjectFixture();
    const notes = createEffectiveMelodyTimeline(project);
    const cache = new PianoRollNoteRenderMetadataCache();
    const initial = cache.get(project, notes);
    const selected = {
      ...project,
      updatedAt: "selection-only",
      progression: { ...project.progression, selectedStepId: "selection-only-step" },
    };

    expect(cache.get(selected, notes)).toBe(initial);
  });

  it("precomputes authored state and the same harmonic role for each note pitch class", () => {
    const project = createRichProjectFixture();
    const note = createEffectiveMelodyTimeline(project)[0];
    expect(note).toBeDefined();
    const metadata = new PianoRollNoteRenderMetadataCache().get(project, [note!]);
    const step = metadata.get(note!.sourceStepId);
    expect(step).toBeDefined();
    expect(step?.authored).toBe(
      isPianoRollNoteAuthored(
        project.progression.steps.find((candidate) => candidate.id === note!.sourceStepId),
      ),
    );
    expect(step?.rolesByPitchClass.get(note!.pitch.pitchClassIdentity)).toMatchObject({
      primary: expect.any(String),
      targetNext: expect.any(Boolean),
    });
  });
});
