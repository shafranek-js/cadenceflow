import { describe, expect, it } from "vitest";
import { realizeProgressionMelodyPerformance } from "../../../src/audio/melodyPerformance";
import { modeForModule } from "../../../src/domain/harmony/functions";
import type { HarmonicContext } from "../../../src/domain/harmony/modules/types";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { snapshotChordMelodyRecipe } from "../../../src/domain/melody/types";
import type { ChordStep } from "../../../src/domain/progression/step";
import { projectProjectToMidi } from "../../../src/export/midi/eventProjection";
import { projectProjectToMusicXml } from "../../../src/export/musicxml/projection";
import { writeMusicXml } from "../../../src/export/musicxml/writer";
import { writeMidiFile } from "../../../src/export/midi/writer";
import { createMelodyTimeline } from "../../../src/notation/melodyStaffProjection";
import { addRational, type Rational } from "../../../src/domain/timing/rational";

function contextFor(project: ReturnType<typeof createRichProjectFixture>): HarmonicContext {
  const mode = modeForModule(project.activeModule);
  return Object.freeze({
    tonic: project.tonic,
    mode,
    moduleId: project.activeModule,
    spellingContext: Object.freeze({ tonic: project.tonic, mode }),
  });
}

function eventSignature(event: {
  readonly sourceStepId: string;
  readonly pitch: number;
  readonly instrument: string;
}): string {
  return `${event.sourceStepId}|${event.instrument}|${event.pitch}`;
}

function signatureDurations(
  events: readonly {
    readonly sourceStepId: string;
    readonly pitch: number;
    readonly instrument: string;
    readonly durationBeats: Rational;
  }[],
): readonly [string, number, number][] {
  const durations = new Map<string, Rational>();
  events.forEach((event) => {
    const signature = eventSignature(event);
    const current = durations.get(signature);
    durations.set(
      signature,
      current ? addRational(current, event.durationBeats) : event.durationBeats,
    );
  });
  return [...durations.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([signature, duration]) => [signature, duration.numerator, duration.denominator]);
}

describe("T188 effective Melody instrument projection", () => {
  it("partitions mixed Melody events into deterministic MIDI tracks", () => {
    const project = createRichProjectFixture();
    const step1 = project.progression.steps[0] as ChordStep;
    const step2 = project.progression.steps[1] as ChordStep;
    const updatedStep1 = Object.freeze({ ...step1, melodyInstrumentOverride: "cello" as const });
    const updatedStep2 = Object.freeze({
      ...step2,
      melody: snapshotChordMelodyRecipe({ pattern: "up", grid: "quarter", octaveOffset: 0 }),
    });
    const updated = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([updatedStep1, updatedStep2, ...project.progression.steps.slice(2)]),
      }),
    });
    const projection = projectProjectToMidi(updated);
    const melodyTracks = projection.melodyTracks!;
    expect(melodyTracks.map((track) => track.instrument)).toEqual(["cello", "violin"]);
    expect(
      melodyTracks.map((track) =>
        track.programChanges.map((change) => [change.tick, change.instrument, change.program]),
      ),
    ).toEqual([[[0, "cello", 42]], [[0, "violin", 40]]]);
    expect(
      melodyTracks.every((track) =>
        track.notes.every((note) => note.instrument === track.instrument),
      ),
    ).toBe(true);
    const canonicalEvents = realizeProgressionMelodyPerformance({
      steps: updated.progression.steps,
      tonic: updated.tonic,
      context: contextFor(updated),
      tempoBpm: updated.globalTiming.tempoBpm,
      groove: updated.groove,
      melodyTrack: Object.freeze({ ...updated.melodyTrack, muted: false, solo: false }),
    }).events;
    const canonicalSignatures = canonicalEvents.map((event) => eventSignature(event)).sort();
    const midiSignatures = melodyTracks
      .flatMap((track) =>
        track.notes.map((note) =>
          eventSignature({
            sourceStepId: note.stepId,
            instrument: note.instrument,
            pitch: note.pitch,
          }),
        ),
      )
      .sort();
    expect(midiSignatures).toEqual(canonicalSignatures);
    expect(midiSignatures).toHaveLength(canonicalEvents.length);
    const bytes = writeMidiFile(projection);
    expect(bytes[10]! * 256 + bytes[11]!).toBe(5);
    expect(new TextDecoder().decode(bytes)).toContain("CadenceFlow Melody");
  });

  it("partitions notation into one full lane per effective instrument", () => {
    const project = createRichProjectFixture();
    const step1 = project.progression.steps[0] as ChordStep;
    const step2 = project.progression.steps[1] as ChordStep;
    const updated = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([
          Object.freeze({ ...step1, melodyInstrumentOverride: "cello" as const }),
          Object.freeze({
            ...step2,
            melody: snapshotChordMelodyRecipe({ pattern: "up", grid: "quarter", octaveOffset: 0 }),
            melodyInstrumentOverride: "violin" as const,
          }),
          ...project.progression.steps.slice(2),
        ]),
      }),
    });
    const timeline = createMelodyTimeline(updated);
    expect(timeline.lanes.map((lane) => lane.instrumentId)).toEqual(["cello", "violin"]);
    expect(
      timeline.lanes.every((lane) =>
        lane.events.every((event) => event.instrument === lane.instrumentId),
      ),
    ).toBe(true);
    expect(
      timeline.lanes.every((lane) => lane.measures.every((measure) => measure.entries.length > 0)),
    ).toBe(true);
    expect(timeline.lanes.map((lane) => lane.activeSystemIndexes)).toEqual([[0, 1], [1]]);
    expect(timeline.lanes[0]!.measures[2]!.entries.every((entry) => entry.kind === "rest")).toBe(
      true,
    );
    expect(timeline.lanes[1]!.measures[0]!.entries.every((entry) => entry.kind === "rest")).toBe(
      true,
    );
  });

  it("associates each effective instrument with one MusicXML score instrument", () => {
    const project = createRichProjectFixture();
    const step1 = project.progression.steps[0] as ChordStep;
    const updated = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([
          Object.freeze({ ...step1, melodyInstrumentOverride: "gm-081" as const }),
          Object.freeze({
            ...(project.progression.steps[1] as ChordStep),
            melody: snapshotChordMelodyRecipe({ pattern: "up", grid: "quarter", octaveOffset: 0 }),
          }),
          ...project.progression.steps.slice(2),
        ]),
      }),
    });
    const projection = projectProjectToMusicXml(updated);
    expect(projection.melodyParts?.map((part) => part.instrument)).toEqual(["gm-081", "violin"]);
    expect(projection.melody?.instruments).toEqual([
      expect.objectContaining({ instrument: "gm-081", midiProgram: 82, family: "Synth Lead" }),
    ]);
    expect(projection.melodyParts).toHaveLength(2);
    const parts = projection.melodyParts!;
    expect(parts.map((part) => part.instrument)).toEqual(["gm-081", "violin"]);
    expect(parts.every((part) => part.measures.length === projection.measures.length)).toBe(true);
    expect(parts.every((part) => part.measures.every((measure) => measure.events.length > 0))).toBe(
      true,
    );
    expect(parts[0]!.measures[0]!.events.some((event) => event.kind === "note")).toBe(true);
    expect(parts[1]!.measures[0]!.events.every((event) => event.kind === "rest")).toBe(true);
    const canonicalEvents = realizeProgressionMelodyPerformance({
      steps: updated.progression.steps,
      tonic: updated.tonic,
      context: contextFor(updated),
      tempoBpm: updated.globalTiming.tempoBpm,
      groove: updated.groove,
      melodyTrack: Object.freeze({ ...updated.melodyTrack, muted: false, solo: false }),
    }).events;
    const xmlNoteEvents = parts.flatMap((part) =>
      part.measures.flatMap((measure) =>
        measure.events.flatMap((event) => (event.kind === "note" ? [event] : [])),
      ),
    );
    const xmlLogicalEvents = xmlNoteEvents.map((event) => ({
      sourceStepId: event.stepId,
      instrument: event.instrument,
      pitch: event.sourceMidi,
      durationBeats: event.durationBeats,
    }));
    const xmlSignatures = xmlLogicalEvents.map((event) => eventSignature(event));
    expect(new Set(xmlSignatures)).toEqual(
      new Set(canonicalEvents.map((event) => eventSignature(event))),
    );
    expect(xmlNoteEvents.length).toBeGreaterThanOrEqual(canonicalEvents.length);
    expect(signatureDurations(xmlLogicalEvents)).toEqual(signatureDurations(canonicalEvents));
    const xml = writeMusicXml(projection);
    expect(xml).toContain('score-instrument id="P2-Igm-081"');
    expect(xml).toContain('score-part id="P3"');
    expect(xml).toContain('instrument id="P2-Igm-081"');
  });
});
