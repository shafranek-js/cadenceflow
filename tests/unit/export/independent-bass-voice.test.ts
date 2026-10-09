import { describe, expect, it } from "vitest";
import { projectProjectToMidi } from "../../../src/export/midi/eventProjection";
import {
  projectProjectToMusicXml,
  type MusicXmlNoteEvent,
} from "../../../src/export/musicxml/projection";
import type { Project } from "../../../src/domain/project/project";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";

describe("project-level independent bass voice projections", () => {
  it("removes only separate bass output from MIDI and MusicXML while keeping upper notes", () => {
    const base = createRichProjectFixture();
    const firstStep = base.progression.steps[0];
    if (firstStep?.kind !== "chord") throw new Error("fixture must start with a chord");
    const enabled = Object.freeze({ ...base, independentBassEnabled: true });
    const disabled = Object.freeze({ ...base, independentBassEnabled: false });

    const enabledMidi = projectProjectToMidi(enabled).notes.filter(
      (note) => note.stepId === firstStep.id,
    );
    const disabledMidi = projectProjectToMidi(disabled).notes.filter(
      (note) => note.stepId === firstStep.id,
    );
    expect(enabledMidi.filter((note) => note.role === "bass")).toHaveLength(1);
    expect(disabledMidi.every((note) => note.role === "upper")).toBe(true);
    expect(disabledMidi.map((note) => note.pitch)).toEqual(
      enabledMidi.filter((note) => note.role === "upper").map((note) => note.pitch),
    );

    const notesForStep = (project: Project): readonly MusicXmlNoteEvent[] =>
      projectProjectToMusicXml(project)
        .measures.flatMap((measure) => measure.events)
        .filter(
          (event): event is MusicXmlNoteEvent =>
            event.kind === "note" && event.stepId === firstStep.id,
        );
    const enabledXml = notesForStep(enabled);
    const disabledXml = notesForStep(disabled);
    expect(enabledXml.filter((event) => event.role === "bass").length).toBeGreaterThan(0);
    expect(disabledXml.every((event) => event.role === "upper")).toBe(true);
    expect(disabledXml.map((event) => event.sourceMidi)).toEqual(
      enabledXml.filter((event) => event.role === "upper").map((event) => event.sourceMidi),
    );
  });
});
