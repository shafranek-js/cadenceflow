import { describe, expect, it } from "vitest";
import { realizeProgressionMelodyPerformance } from "../../../src/audio/melodyPerformance";
import { realizeProgressionPerformanceEvents } from "../../../src/audio/eventRealizer";
import { modeForModule } from "../../../src/domain/harmony/functions";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import {
  snapshotAuthoredMelodyPhrase,
  snapshotChordMelody,
} from "../../../src/domain/melody/types";
import { createMelodyTimeline } from "../../../src/notation/melodyStaffProjection";
import { projectProjectToMidi } from "../../../src/export/midi/eventProjection";
import { projectProjectToMusicXml } from "../../../src/export/musicxml/projection";
import { rational } from "../../../src/domain/timing/rational";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";

describe("T212 concert-pitch consumers", () => {
  it("keeps playback, MIDI and MusicXML at each owner's concert pitch", () => {
    const base = createRichProjectFixture();
    const first = base.progression.steps[0];
    if (first?.kind !== "chord") throw new Error("fixture must start with a chord");
    const step = Object.freeze({
      ...first,
      transpositionSemitones: 3,
      melody: snapshotChordMelody({
        mode: "authored",
        phrase: snapshotAuthoredMelodyPhrase({
          notes: [
            {
              id: "t212-concert-note",
              pitch: exactPitch(67, { step: "G", alter: 0 }),
              onset: rational(0),
              duration: rational(1),
            },
          ],
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
    const playback = realizeProgressionPerformanceEvents({
      steps: project.progression.steps,
      tonic: project.tonic,
      context,
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
    });
    const midi = projectProjectToMidi(project);
    const musicXml = projectProjectToMusicXml(project);
    const playbackChordPitches = playback.events
      .filter((event) => event.stepId === step.id)
      .map((event) => event.pitch)
      .sort((left, right) => left - right);
    const untransposedChordPitches = realizeProgressionPerformanceEvents({
      steps: base.progression.steps,
      tonic: base.tonic,
      context,
      tempoBpm: base.globalTiming.tempoBpm,
      groove: base.groove,
    })
      .events.filter((event) => event.stepId === step.id)
      .map((event) => event.pitch + 3)
      .sort((left, right) => left - right);
    const midiChordPitches = midi.notes
      .filter((event) => event.stepId === step.id)
      .map((event) => event.pitch)
      .sort((left, right) => left - right);
    const xmlChordPitches = musicXml.measures
      .flatMap((measure) => measure.events)
      .filter((event) => event.kind === "note" && event.stepId === step.id)
      .map((event) => event.sourceMidi)
      .sort((left, right) => left - right);
    expect(midiChordPitches).toEqual(playbackChordPitches);
    expect(playbackChordPitches).toEqual(untransposedChordPitches);
    expect([...new Set(xmlChordPitches)]).toEqual([...new Set(playbackChordPitches)]);

    const melodyPlayback = realizeProgressionMelodyPerformance({
      steps: project.progression.steps,
      tonic: project.tonic,
      context,
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
      melodyTrack: Object.freeze({ ...project.melodyTrack, muted: false, solo: false }),
    }).events.filter((event) => event.eventKey === "t212-concert-note");
    const staff = createMelodyTimeline(project).events.filter(
      (event) => event.eventKey === "t212-concert-note",
    );
    const midiMelody = midi
      .melodyTracks!.flatMap((track) => track.notes)
      .filter((event) => event.eventKey === "t212-concert-note");
    const xmlMelody = musicXml
      .melodyParts!.flatMap((part) => part.measures)
      .flatMap((measure) => measure.events)
      .filter((event) => event.kind === "note" && event.eventKey === "t212-concert-note");

    expect(melodyPlayback.map((event) => event.pitch)).toEqual([70]);
    expect(staff.map((event) => event.pitch.midiNumber)).toEqual([70]);
    expect(midiMelody.map((event) => event.pitch)).toEqual([70]);
    expect(xmlMelody.map((event) => (event.kind === "note" ? event.sourceMidi : null))).toEqual([
      70,
    ]);
  });
});
