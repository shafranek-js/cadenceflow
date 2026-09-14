import { describe, expect, it } from "vitest";
import { realizeProgressionMelodyPerformance } from "../../src/audio/melodyPerformance";
import { modeForModule } from "../../src/domain/harmony/functions";
import type { HarmonicContext } from "../../src/domain/harmony/modules/types";
import type { Project } from "../../src/domain/project/project";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { addRational, equalRational, rational } from "../../src/domain/timing/rational";
import { projectProjectToMidi } from "../../src/export/midi/eventProjection";
import { projectProjectToMusicXml } from "../../src/export/musicxml/projection";
import { createMelodyTimeline } from "../../src/notation/melodyStaffProjection";
import { musicalDuration } from "../../src/domain/timing/duration";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";

function projectWithRecipe(
  recipe: NonNullable<Project["progression"]["steps"][number]["melody"]>,
): Project {
  const project = createRichProjectFixture();
  const steps = project.progression.steps.map((step, index) =>
    index === 0 && step.kind === "chord" ? Object.freeze({ ...step, melody: recipe }) : step,
  );
  return Object.freeze({
    ...project,
    globalTiming: globalTiming(project.globalTiming.tempoBpm, meter(4, 4, [4])),
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
  });
}

function contextFor(project: Project): HarmonicContext {
  const mode = modeForModule(project.activeModule);
  return Object.freeze({
    tonic: project.tonic,
    moduleId: project.activeModule,
    mode,
    spellingContext: Object.freeze({ tonic: project.tonic, mode }),
  });
}

describe("T186 Batch A — one canonical Melody event projection", () => {
  it("keeps Staff, live playback, MIDI, and MusicXML aligned for new rhythm axes", () => {
    const project = projectWithRecipe({
      pitchMotion: "alternate-root-up",
      rhythm: "dotted",
      connection: "retrigger",
      grid: "eighth",
      octaveOffset: 0,
    });
    const timeline = createMelodyTimeline(project);
    const staffEvents = timeline.events.filter((event) => event.sourceStepId === "step-1");
    const performance = realizeProgressionMelodyPerformance({
      steps: project.progression.steps,
      tonic: project.tonic,
      context: contextFor(project),
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
    });
    const liveEvents = performance.events.filter((event) => event.sourceStepId === "step-1");
    const midi = projectProjectToMidi(project).melody;
    const xml = projectProjectToMusicXml(project).melody;
    if (!midi || !xml) throw new Error("expected Melody projections");
    const xmlEvents = xml.measures.flatMap((measure) =>
      measure.events.flatMap((event) =>
        event.kind === "note" && event.stepId === "step-1"
          ? [{ ...event, startBeats: addRational(measure.startBeats, event.onsetBeats) }]
          : [],
      ),
    );

    expect(staffEvents).toHaveLength(4);
    expect(liveEvents).toHaveLength(staffEvents.length);
    expect(midi.notes).toHaveLength(staffEvents.length);
    expect(xmlEvents).toHaveLength(staffEvents.length);
    for (const [index, staffEvent] of staffEvents.entries()) {
      const liveEvent = liveEvents[index]!;
      const midiEvent = midi.notes[index]!;
      const xmlEvent = xmlEvents[index]!;
      expect(liveEvent.pitch).toBe(staffEvent.pitch.midiNumber);
      expect(midiEvent.pitch).toBe(staffEvent.pitch.midiNumber);
      expect(xmlEvent.sourceMidi).toBe(staffEvent.pitch.midiNumber);
      expect(equalRational(liveEvent.startBeats, staffEvent.startBeats)).toBe(true);
      expect(equalRational(xmlEvent.startBeats, staffEvent.startBeats)).toBe(true);
      expect(equalRational(liveEvent.durationBeats, staffEvent.durationBeats)).toBe(true);
      expect(equalRational(xmlEvent.durationBeats, staffEvent.durationBeats)).toBe(true);
    }
  });

  it("carries tie-repeated merging through every downstream projection", () => {
    const project = projectWithRecipe({
      pitchMotion: "repeat-root",
      rhythm: "even",
      connection: "tie-repeated",
      grid: "eighth",
      octaveOffset: 0,
    });
    const staff = createMelodyTimeline(project).events.filter(
      (event) => event.sourceStepId === "step-1",
    );
    const performance = realizeProgressionMelodyPerformance({
      steps: project.progression.steps,
      tonic: project.tonic,
      context: contextFor(project),
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
    }).events.filter((event) => event.sourceStepId === "step-1");
    const midi = projectProjectToMidi(project).melody;
    const xml = projectProjectToMusicXml(project).melody;
    if (!midi || !xml) throw new Error("expected Melody projections");
    const xmlNotes = xml.measures.flatMap((measure) =>
      measure.events.filter((event) => event.kind === "note" && event.stepId === "step-1"),
    );

    expect(staff).toHaveLength(1);
    expect(performance).toHaveLength(1);
    expect(midi.notes).toHaveLength(1);
    expect(xmlNotes).toHaveLength(1);
    expect(equalRational(staff[0]!.durationBeats, rational(4))).toBe(true);
    expect(performance[0]!.durationBeats).toEqual(rational(4));
    expect(xmlNotes[0]!.ties).toEqual([]);
  });

  it("does not merge equal pitches across a Rest step", () => {
    const project = projectWithRecipe({
      pitchMotion: "repeat-root",
      rhythm: "even",
      connection: "tie-repeated",
      grid: "eighth",
      octaveOffset: 0,
    });
    const firstStep = project.progression.steps[0];
    if (!firstStep || firstStep.kind !== "chord") throw new Error("expected chord fixture step");
    const restStep = Object.freeze({
      id: "rest-boundary",
      kind: "rest" as const,
      duration: musicalDuration(rational(1)),
    });
    const secondStep = Object.freeze({ ...firstStep, id: "step-after-rest" });
    const boundaryProject = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([firstStep, restStep, secondStep]),
      }),
    });
    const events = createMelodyTimeline(boundaryProject).events;

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.sourceStepId)).toEqual(["step-1", "step-after-rest"]);
    expect(events.map((event) => event.durationBeats)).toEqual([rational(4), rational(4)]);
    expect(events.map((event) => event.startBeats)).toEqual([rational(0), rational(5)]);
  });
});
