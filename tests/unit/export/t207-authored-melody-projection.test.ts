import { describe, expect, it } from "vitest";
import { realizeProgressionMelodyPerformance } from "../../../src/audio/melodyPerformance";
import { modeForModule } from "../../../src/domain/harmony/functions";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { createMelodyTimeline } from "../../../src/notation/melodyStaffProjection";
import { projectProjectToMidi } from "../../../src/export/midi/eventProjection";
import { projectProjectToMusicXml } from "../../../src/export/musicxml/projection";
import { rational } from "../../../src/domain/timing/rational";

describe("T207 authored Melody consumer parity", () => {
  it("keeps stable note IDs, pitch, onset, and duration aligned in Staff, audio, MIDI, and MusicXML", () => {
    const base = createRichProjectFixture();
    const originalStep = base.progression.steps[0]!;
    if (originalStep.kind !== "chord") throw new Error("fixture must start with a chord");
    const step = Object.freeze({
      ...originalStep,
      melody: Object.freeze({
        mode: "authored" as const,
        phrase: Object.freeze({
          notes: Object.freeze([
            Object.freeze({
              id: "authored-G4",
              pitch: exactPitch(67, { step: "G", alter: 0 }),
              onset: rational(0),
              duration: rational(3, 4),
            }),
            Object.freeze({
              id: "authored-C5",
              pitch: exactPitch(72, { step: "C", alter: 0 }),
              onset: rational(3, 2),
              duration: rational(1, 2),
            }),
          ]),
        }),
      }),
    });
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({
        ...base.progression,
        steps: Object.freeze([step, ...base.progression.steps.slice(1)]),
      }),
    });
    const mode = modeForModule(project.activeModule);
    const context = Object.freeze({
      tonic: project.tonic,
      mode,
      moduleId: project.activeModule,
      spellingContext: Object.freeze({ tonic: project.tonic, mode }),
    });
    const timeline = createMelodyTimeline(project);
    const laneEvents = timeline.events.filter((event) => event.sourceStepId === step.id);
    const audioEvents = realizeProgressionMelodyPerformance({
      steps: project.progression.steps,
      tonic: project.tonic,
      context,
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
      melodyTrack: Object.freeze({ ...project.melodyTrack, muted: false, solo: false }),
    }).events.filter((event) => event.sourceStepId === step.id);
    const midiEvents = projectProjectToMidi(project)
      .melodyTracks!.flatMap((lane) => lane.notes)
      .filter((event) => event.stepId === step.id);
    const xmlEvents = projectProjectToMusicXml(project)
      .melodyParts!.flatMap((part) =>
        part.measures.flatMap((measure) =>
          measure.events
            .filter((event) => event.kind === "note")
            .map((event) => ({
              ...event,
              onset: {
                numerator:
                  measure.startBeats.numerator * event.onsetBeats.denominator +
                  event.onsetBeats.numerator * measure.startBeats.denominator,
                denominator: measure.startBeats.denominator * event.onsetBeats.denominator,
              },
            })),
        ),
      )
      .filter((event) => event.stepId === step.id);
    expect(
      laneEvents.map((event) => [
        event.eventKey,
        event.pitch.midiNumber,
        event.startBeats,
        event.durationBeats,
      ]),
    ).toEqual(
      audioEvents.map((event) => [
        event.eventKey,
        event.pitch,
        event.startBeats,
        event.durationBeats,
      ]),
    );
    expect(
      midiEvents.map((event) => [event.eventKey, event.pitch, event.startTick, event.endTick]),
    ).toEqual([
      ["authored-G4", 67, 0, 90],
      ["authored-C5", 72, 180, 240],
    ]);
    expect(xmlEvents.map((event) => [event.eventKey, event.sourceMidi])).toEqual([
      ["authored-G4", 67],
      ["authored-C5", 72],
    ]);
  });
});
