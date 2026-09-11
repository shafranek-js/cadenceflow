import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { AppStore } from "../../src/app/appStore";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import {
  createSetMelodyRecipeCommand,
  setMelodyRecipe,
} from "../../src/app/commands/melodyCommands";
import { createDefaultProject } from "../../src/domain/project/factory";
import type { Project } from "../../src/domain/project/project";
import type { ChordStep, RestStep } from "../../src/domain/progression/step";
import { rational, type Rational } from "../../src/domain/timing/rational";
import { musicalDuration } from "../../src/domain/timing/duration";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { groove } from "../../src/domain/timing/swing";
import {
  realizeChordMelody,
  type MelodyGrid,
  type MelodyPattern,
} from "../../src/domain/melody/projection";
import type { ChordMelodyRecipe } from "../../src/domain/melody/types";
import { getHarmonicModule } from "../../src/domain/harmony/moduleRegistry";
import { realizeProgressionMelodyPerformance } from "../../src/audio/melodyPerformance";
import { realizeOrderedPianoProgression } from "../../src/instruments/piano/progressionRealization";
import { createMelodyTimeline } from "../../src/notation/melodyStaffProjection";
import { projectProjectToMidi } from "../../src/export/midi/eventProjection";
import { writeMidiFile } from "../../src/export/midi/writer";
import {
  projectProjectToMusicXml,
  type MusicXmlMelodyMeasureEvent,
  type MusicXmlProjection,
} from "../../src/export/musicxml/projection";
import { writeMusicXml } from "../../src/export/musicxml/writer";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";

const PATTERNS: readonly MelodyPattern[] = Object.freeze([
  "up",
  "down",
  "up-down",
  "down-up",
  "outside-in",
  "inside-out",
]);
const GRIDS: readonly MelodyGrid[] = Object.freeze([
  "quarter",
  "eighth",
  "sixteenth",
  "eighth-triplet",
  "sixteenth-triplet",
]);
const FUNCTION_IDS = Object.freeze(["I", "V", "vi", "IV"]);
const DURATIONS: readonly Rational[] = Object.freeze([
  rational(5, 4),
  rational(7, 6),
  rational(3, 2),
  rational(5, 3),
  rational(2),
]);

interface CanonicalCase {
  readonly stepId: string;
  readonly pattern: MelodyPattern;
  readonly grid: MelodyGrid;
  readonly stepIndex: number;
}

const CANONICAL_MATRIX: readonly CanonicalCase[] = Object.freeze(
  PATTERNS.flatMap((pattern, patternIndex) =>
    GRIDS.map((grid, gridIndex) => ({
      stepId: `sc018-${patternIndex + 1}-${gridIndex + 1}`,
      pattern,
      grid,
      stepIndex: patternIndex * GRIDS.length + gridIndex,
    })),
  ),
);

function freezeChordWithMelody(
  step: ChordStep,
  durationBeats: Rational,
  recipe: ChordMelodyRecipe,
): ChordStep {
  return Object.freeze({
    ...step,
    duration: musicalDuration(durationBeats),
    melody: Object.freeze({ ...recipe }),
  });
}

function canonicalProject(): Project {
  const base = createDefaultProject("us12-sc018", "US12 SC-018 Canonical");
  const contextProject = Object.freeze({
    ...base,
    tonic: 2 as const,
    globalTiming: globalTiming(128, meter(7, 8, [2, 2, 3])),
    groove: groove("straight"),
  });
  const authored: readonly ChordStep[] = Object.freeze(
    CANONICAL_MATRIX.map((entry) => {
      const chord = createMatrixChordStep(
        contextProject,
        FUNCTION_IDS[entry.stepIndex % FUNCTION_IDS.length]!,
        entry.stepId,
      );
      return freezeChordWithMelody(chord, DURATIONS[entry.stepIndex % DURATIONS.length]!, {
        pattern: entry.pattern,
        grid: entry.grid,
        octaveOffset: entry.stepIndex % 3 === 0 ? 1 : 0,
      });
    }),
  );
  const noMelody = Object.freeze({
    ...createMatrixChordStep(contextProject, "I", "sc018-no-melody"),
    duration: musicalDuration(rational(1, 2)),
  });
  const rest: RestStep = Object.freeze({
    id: "sc018-rest",
    kind: "rest",
    duration: musicalDuration(rational(1, 3)),
  });
  const branchStep = Object.freeze({
    ...createMatrixChordStep(contextProject, "IV", "sc018-temporary-branch"),
    duration: musicalDuration(rational(4)),
  });
  return Object.freeze({
    ...contextProject,
    presentation: Object.freeze({ ...contextProject.presentation, theme: "light" as const }),
    melodyTrack: Object.freeze({
      ...contextProject.melodyTrack,
      instrument: "cello" as const,
      volume: 91,
    }),
    progression: Object.freeze({
      steps: Object.freeze([...authored, noMelody, rest]),
      selectedStepId: authored[0]!.id,
    }),
    temporaryBranch: Object.freeze({
      id: "sc018-temporary-branch",
      originStepId: authored[0]!.id,
      originAtEnd: false,
      compositionIntent: "surprise" as const,
      steps: Object.freeze([branchStep]),
    }),
  });
}

function contextFor(project: Project) {
  const mode = getHarmonicModule(project.activeModule).mode;
  return Object.freeze({
    tonic: project.tonic,
    moduleId: project.activeModule,
    mode,
    spellingContext: Object.freeze({ tonic: project.tonic, mode }),
  });
}

function allCanonicalEvents(project: Project): readonly {
  readonly key: string;
  readonly sourceStepId: string;
  readonly index: number;
  readonly pitch: number;
  readonly sourcePitchMidi: number;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
}[] {
  const timeline = createMelodyTimeline(project);
  return Object.freeze(
    timeline.events.map((event) => ({
      key: event.eventKey,
      sourceStepId: event.sourceStepId,
      index: event.index,
      pitch: event.pitch.midiNumber,
      sourcePitchMidi: event.sourcePitchMidi,
      startBeats: event.startBeats,
      durationBeats: event.durationBeats,
    })),
  );
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readVlq(bytes: Uint8Array, cursor: { value: number }): number {
  let result = 0;
  for (;;) {
    const byte = bytes[cursor.value++];
    if (byte === undefined) throw new Error("truncated MIDI VLQ");
    result = (result << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return result;
    if (result > 0x0fffffff) throw new Error("MIDI VLQ exceeds maximum");
  }
}

interface ParsedMidiNote {
  readonly pitch: number;
  readonly velocity: number;
  readonly startTick: number;
  readonly endTick: number;
}

interface ParsedMidiTrack {
  readonly name: string;
  readonly instrumentName: string;
  readonly channel?: number;
  readonly program?: number;
  readonly volume?: number;
  readonly notes: readonly ParsedMidiNote[];
}

interface ParsedMidiFile {
  readonly format: number;
  readonly ppq: number;
  readonly tracks: readonly ParsedMidiTrack[];
}

/** Independent parser for the serialized SMF. It deliberately does not read MidiProjection. */
function parseMidi(bytes: Uint8Array): ParsedMidiFile {
  if (readAscii(bytes, 0, 4) !== "MThd" || readU32(bytes, 4) !== 6) {
    throw new Error("invalid MIDI header");
  }
  const format = readU16(bytes, 8);
  const trackCount = readU16(bytes, 10);
  const ppq = readU16(bytes, 12);
  const tracks: ParsedMidiTrack[] = [];
  let offset = 14;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (readAscii(bytes, offset, 4) !== "MTrk") throw new Error("missing MIDI track chunk");
    const length = readU32(bytes, offset + 4);
    const start = offset + 8;
    const end = start + length;
    const cursor = { value: start };
    let tick = 0;
    let runningStatus: number | undefined;
    let name = "";
    let instrumentName = "";
    let channel: number | undefined;
    let program: number | undefined;
    let volume: number | undefined;
    const pending = new Map<string, ParsedMidiNote>();
    const notes: ParsedMidiNote[] = [];
    while (cursor.value < end) {
      tick += readVlq(bytes, cursor);
      let status = bytes[cursor.value++];
      if (status === undefined) throw new Error("truncated MIDI status");
      if (status < 0x80) {
        cursor.value -= 1;
        status = runningStatus;
        if (status === undefined) throw new Error("running status without a prior event");
      } else if (status < 0xf0) {
        runningStatus = status;
      }
      if (status === 0xff) {
        const metaType = bytes[cursor.value++];
        if (metaType === undefined) throw new Error("truncated MIDI meta type");
        const metaLength = readVlq(bytes, cursor);
        const data = bytes.slice(cursor.value, cursor.value + metaLength);
        cursor.value += metaLength;
        if (metaType === 0x03) name = new TextDecoder().decode(data);
        if (metaType === 0x04) instrumentName = new TextDecoder().decode(data);
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const sysexLength = readVlq(bytes, cursor);
        cursor.value += sysexLength;
        continue;
      }
      const command = status & 0xf0;
      const eventChannel = status & 0x0f;
      channel ??= eventChannel;
      const first = bytes[cursor.value++];
      if (first === undefined) throw new Error("truncated MIDI channel event");
      const second = command === 0xc0 || command === 0xd0 ? undefined : bytes[cursor.value++];
      if (command !== 0xc0 && command !== 0xd0 && second === undefined) {
        throw new Error("truncated MIDI channel event payload");
      }
      if (command === 0xc0) program = first;
      if (command === 0xb0 && first === 7) volume = second;
      if (command === 0x90 && second !== 0) {
        pending.set(`${eventChannel}:${first}`, {
          pitch: first,
          velocity: second!,
          startTick: tick,
          endTick: tick,
        });
      }
      if (command === 0x80 || (command === 0x90 && second === 0)) {
        const key = `${eventChannel}:${first}`;
        const note = pending.get(key);
        if (!note) throw new Error(`MIDI note-off without note-on for ${key}`);
        pending.delete(key);
        notes.push(Object.freeze({ ...note, endTick: tick }));
      }
    }
    if (pending.size > 0) throw new Error("MIDI track ended with active notes");
    tracks.push(
      Object.freeze({
        name,
        instrumentName,
        ...(channel !== undefined ? { channel } : {}),
        ...(program !== undefined ? { program } : {}),
        ...(volume !== undefined ? { volume } : {}),
        notes: Object.freeze(notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch)),
      }),
    );
    offset = end;
  }
  if (offset !== bytes.length) throw new Error("MIDI has trailing bytes");
  return Object.freeze({ format, ppq, tracks: Object.freeze(tracks) });
}

function xmlText(element: Element, selector: string): string {
  const child = element.querySelector(selector);
  if (!child?.textContent) throw new Error(`missing MusicXML ${selector}`);
  return child.textContent;
}

function xmlPitch(element: Element): number {
  const natural: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const step = xmlText(element, ":scope > pitch > step");
  const alter = Number(element.querySelector(":scope > pitch > alter")?.textContent ?? "0");
  const octave = Number(xmlText(element, ":scope > pitch > octave"));
  return (octave + 1) * 12 + natural[step]! + alter;
}

interface ParsedMusicXmlMelodyEvent {
  readonly measure: number;
  readonly onsetUnits: number;
  readonly duration: number;
  readonly pitch?: number;
}

/** Independent XML DOM parse of the serialized P2 part. */
function parseMusicXmlMelody(xml: string): {
  readonly instrument: string;
  readonly midiChannel: number;
  readonly midiProgram: number;
  readonly clef: string;
  readonly events: readonly ParsedMusicXmlMelodyEvent[];
} {
  const document = new JSDOM(xml, { contentType: "text/xml" }).window.document;
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error(`invalid MusicXML: ${parserError.textContent}`);
  const part = document.querySelector('part[id="P2"]');
  if (!part) throw new Error("MusicXML Melody P2 part is missing");
  const scorePart = document.querySelector('score-part[id="P2"]');
  if (!scorePart) throw new Error("MusicXML P2 score-part is missing");
  const measures = [...part.querySelectorAll(":scope > measure")];
  const events: ParsedMusicXmlMelodyEvent[] = [];
  measures.forEach((measure, measureIndex) => {
    let onsetUnits = 0;
    for (const note of [...measure.querySelectorAll(":scope > note")]) {
      const duration = Number(xmlText(note, ":scope > duration"));
      events.push({
        measure: measureIndex + 1,
        onsetUnits,
        duration,
        ...(note.querySelector(":scope > rest") ? {} : { pitch: xmlPitch(note) }),
      });
      onsetUnits += duration;
    }
  });
  return Object.freeze({
    instrument: xmlText(scorePart, ":scope > score-instrument > instrument-name"),
    midiChannel: Number(xmlText(scorePart, ":scope > midi-instrument > midi-channel")),
    midiProgram: Number(xmlText(scorePart, ":scope > midi-instrument > midi-program")),
    clef: xmlText(part.querySelector(":scope > measure")!, ":scope > attributes > clef > sign"),
    events: Object.freeze(events),
  });
}

function melodyProjectionNotes(
  projection: MusicXmlProjection,
): readonly MusicXmlMelodyMeasureEvent[] {
  return Object.freeze(
    (projection.melody?.measures ?? []).flatMap((measure) =>
      measure.events.filter((event) => event.kind === "note"),
    ),
  );
}

function stepIds(project: Project): readonly string[] {
  return project.progression.steps
    .filter((step): step is ChordStep => step.kind === "chord" && step.melody !== undefined)
    .map((step) => step.id);
}

function applyProjectPatch(project: Project, patch: Partial<Project["melodyTrack"]>): Project {
  return Object.freeze({
    ...project,
    melodyTrack: Object.freeze({ ...project.melodyTrack, ...patch }),
  });
}

describe("T176 — US12 SC-018 final Melody acceptance", () => {
  it("covers every Pattern/Grid through Staff, live performance, MIDI, and MusicXML", () => {
    const project = canonicalProject();
    const before = structuredClone(project);
    const context = contextFor(project);
    const expected = allCanonicalEvents(project);
    const timeline = createMelodyTimeline(project);
    const performance = realizeProgressionMelodyPerformance({
      steps: project.progression.steps,
      tonic: project.tonic,
      context,
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
      melodyTrack: project.melodyTrack,
    });
    const ordered = realizeOrderedPianoProgression({
      steps: project.progression.steps,
      tonic: project.tonic,
      context,
    });
    const authored = project.progression.steps.filter(
      (step): step is ChordStep => step.kind === "chord" && step.melody !== undefined,
    );
    const directByStep = authored.flatMap((step, stepIndex) => {
      const realization = ordered[stepIndex];
      if (!realization) throw new Error(`missing realization for ${step.id}`);
      return realizeChordMelody({
        sourceStepId: step.id,
        upperPitches: realization.upperPitches,
        durationBeats: step.duration.beats,
        recipe: step.melody,
      }).events;
    });

    expect(CANONICAL_MATRIX).toHaveLength(30);
    expect(new Set(CANONICAL_MATRIX.map((entry) => entry.pattern))).toEqual(new Set(PATTERNS));
    expect(new Set(CANONICAL_MATRIX.map((entry) => entry.grid))).toEqual(new Set(GRIDS));
    expect(stepIds(project)).toHaveLength(30);
    expect(project.progression.steps.at(-2)?.id).toBe("sc018-no-melody");
    expect(project.progression.steps.at(-1)?.id).toBe("sc018-rest");
    expect(project.temporaryBranch?.steps.map((step) => step.id)).toEqual([
      "sc018-temporary-branch",
    ]);
    expect(directByStep.map((event) => event.sourceStepId)).toEqual(
      expected.map((event) => event.sourceStepId),
    );
    expect(directByStep.map((event) => event.index)).toEqual(expected.map((event) => event.index));
    expect(
      directByStep.map((event) => [
        event.pitch.midiNumber,
        event.sourcePitchMidi,
        event.startOffsetBeats,
        event.durationBeats,
      ]),
    ).toEqual(
      authored.flatMap((step, stepIndex) => {
        const realization = ordered[stepIndex]!;
        return realizeChordMelody({
          sourceStepId: step.id,
          upperPitches: realization.upperPitches,
          durationBeats: step.duration.beats,
          recipe: step.melody!,
        }).events.map((event) => [
          event.pitch.midiNumber,
          event.sourcePitchMidi,
          event.startOffsetBeats,
          event.durationBeats,
        ]);
      }),
    );
    expect(
      directByStep.every((event) =>
        authored.some((step) => {
          const realization = ordered[authored.indexOf(step)];
          return (
            step.id === event.sourceStepId &&
            realization?.upperPitches.some((pitch) => pitch.midiNumber === event.sourcePitchMidi)
          );
        }),
      ),
    ).toBe(true);
    expect(directByStep.some((event) => event.sourceStepId === "sc018-temporary-branch")).toBe(
      false,
    );

    expect(
      timeline.events.map((event) => [
        event.eventKey,
        event.pitch.midiNumber,
        event.sourcePitchMidi,
        event.startBeats,
        event.durationBeats,
      ]),
    ).toEqual(
      expected.map((event) => [
        event.key,
        event.pitch,
        event.sourcePitchMidi,
        event.startBeats,
        event.durationBeats,
      ]),
    );
    expect(
      performance.events.map((event) => [
        event.eventKey,
        event.pitch,
        event.sourcePitchMidi,
        event.startBeats,
        event.durationBeats,
        event.velocity,
      ]),
    ).toEqual(
      expected.map((event) => {
        const source = project.progression.steps.find((step) => step.id === event.sourceStepId)!;
        return [
          event.key,
          event.pitch,
          event.sourcePitchMidi,
          event.startBeats,
          event.durationBeats,
          source.kind === "chord" ? source.performance.masterVelocity : 0,
        ];
      }),
    );
    expect(timeline.clef).toBe("bass");
    expect(
      timeline.measures
        .flatMap((measure) => measure.entries)
        .some((entry) => entry.kind === "rest"),
    ).toBe(true);

    const midiProjection = projectProjectToMidi(project);
    const midiBytes = writeMidiFile(midiProjection);
    const parsedMidi = parseMidi(midiBytes);
    const melodyTrack = parsedMidi.tracks.find((track) => track.name === "CadenceFlow Melody");
    expect(parsedMidi).toMatchObject({ format: 1, ppq: midiProjection.ppq });
    expect(parsedMidi.tracks).toHaveLength(4);
    expect(melodyTrack).toMatchObject({
      instrumentName: "Cello",
      channel: 2,
      program: 42,
      volume: 91,
    });
    expect(melodyTrack?.notes).toEqual(
      midiProjection.melody?.notes.map((note) => ({
        pitch: note.pitch,
        velocity: note.velocity,
        startTick: note.startTick,
        endTick: note.endTick,
      })),
    );
    expect(melodyTrack?.notes.some((note) => note.pitch === 0)).toBe(false);
    expect(new TextDecoder().decode(midiBytes)).not.toContain("sc018-temporary-branch");

    const musicXmlProjection = projectProjectToMusicXml(project);
    const musicXml = writeMusicXml(musicXmlProjection);
    const parsedXml = parseMusicXmlMelody(musicXml);
    const xmlNotes = parsedXml.events.filter((event) => event.pitch !== undefined);
    const expectedXmlNotes = melodyProjectionNotes(musicXmlProjection);
    expect(parsedXml).toMatchObject({
      instrument: "Cello",
      midiChannel: 3,
      midiProgram: 43,
      clef: "F",
    });
    expect(xmlNotes.map((event) => [event.pitch, event.duration])).toEqual(
      expectedXmlNotes.map((event) => [event.sourceMidi, event.duration]),
    );
    expect(xmlNotes.map((event) => [event.measure, event.onsetUnits, event.duration])).toEqual(
      (musicXmlProjection.melody?.measures ?? []).flatMap((measure) =>
        measure.events
          .filter((event) => event.kind === "note")
          .map((event) => [
            measure.number,
            (event.onsetBeats.numerator * musicXmlProjection.attributes.divisions) /
              event.onsetBeats.denominator,
            event.duration,
          ]),
      ),
    );
    expect(musicXml).toContain('<part id="P2">');
    expect(musicXml).not.toContain("sc018-temporary-branch");
    expect(musicXml).toBe(writeMusicXml(projectProjectToMusicXml(project)));
    expect(structuredClone(project)).toEqual(before);
  });

  it("keeps recipe-only persistence deterministic and separates groove, volume, mute, and solo", () => {
    const project = canonicalProject();
    const encoded = encodePortableProject(project);
    const decoded = decodePortableProject(encoded);
    expect(decoded).toEqual(project);
    expect(encoded).not.toContain("startOffsetBeats");
    expect(encoded).not.toContain("durationBeats");
    expect(encoded).not.toContain("eventKey");
    expect(encoded).not.toContain("history");
    expect(encodePortableProject(decoded)).toBe(encoded);

    const store = new AppStore(project);
    const firstStep = project.progression.steps.find(
      (step): step is ChordStep => step.kind === "chord" && step.melody !== undefined,
    )!;
    store.dispatch(
      createSetMelodyRecipeCommand(
        firstStep.id,
        { pattern: "inside-out", grid: "eighth", octaveOffset: 0 },
        "2026-09-11T10:00:00.000Z",
        "violin",
      ),
      setMelodyRecipe,
    );
    expect(store.history.undoDepth).toBe(1);
    expect(store.canUndo).toBe(true);
    store.replaceLoadedProject(decoded);
    expect(store.history.undoDepth).toBe(0);
    expect(store.history.redoDepth).toBe(0);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);

    const context = contextFor(project);
    const basePerformance = realizeProgressionMelodyPerformance({
      steps: project.progression.steps,
      tonic: project.tonic,
      context,
      tempoBpm: project.globalTiming.tempoBpm,
      groove: groove("straight"),
      melodyTrack: project.melodyTrack,
    });
    const lowVolume = applyProjectPatch(project, { volume: 12 });
    const lowVolumePerformance = realizeProgressionMelodyPerformance({
      steps: lowVolume.progression.steps,
      tonic: lowVolume.tonic,
      context,
      tempoBpm: lowVolume.globalTiming.tempoBpm,
      groove: lowVolume.groove,
      melodyTrack: lowVolume.melodyTrack,
    });
    expect(lowVolumePerformance.events.map((event) => event.velocity)).toEqual(
      basePerformance.events.map((event) => event.velocity),
    );
    expect(
      realizeProgressionMelodyPerformance({
        steps: project.progression.steps,
        tonic: project.tonic,
        context,
        tempoBpm: project.globalTiming.tempoBpm,
        groove: project.groove,
        melodyTrack: Object.freeze({ ...project.melodyTrack, muted: true, solo: false }),
      }).events,
    ).toHaveLength(0);
    for (const solo of [false, true] as const) {
      const projection = projectProjectToMidi(applyProjectPatch(project, { solo, muted: false }));
      expect(projection.melody?.notes.length).toBeGreaterThan(0);
    }

    const swingProject = Object.freeze({ ...project, groove: groove("swing", 0.75) });
    const swingPerformance = realizeProgressionMelodyPerformance({
      steps: swingProject.progression.steps,
      tonic: swingProject.tonic,
      context,
      tempoBpm: swingProject.globalTiming.tempoBpm,
      groove: swingProject.groove,
      melodyTrack: swingProject.melodyTrack,
    });
    const straightTriplets = basePerformance.events.filter((event) => {
      const step = project.progression.steps[event.stepIndex];
      return step?.kind === "chord" && step.melody?.grid.endsWith("-triplet");
    });
    const swingTriplets = swingPerformance.events.filter((event) => {
      const step = project.progression.steps[event.stepIndex];
      return step?.kind === "chord" && step.melody?.grid.endsWith("-triplet");
    });
    expect(swingTriplets.map((event) => [event.startBeats, event.durationBeats])).toEqual(
      straightTriplets.map((event) => [event.startBeats, event.durationBeats]),
    );
    expect(
      swingPerformance.events.some((event, index) => {
        const straight = basePerformance.events[index];
        return (
          JSON.stringify(event.startBeats) !== JSON.stringify(straight?.startBeats) ||
          JSON.stringify(event.durationBeats) !== JSON.stringify(straight?.durationBeats)
        );
      }),
    ).toBe(true);
    expect(writeMusicXml(projectProjectToMusicXml(swingProject))).toBe(
      writeMusicXml(projectProjectToMusicXml(project)),
    );
  });
});
