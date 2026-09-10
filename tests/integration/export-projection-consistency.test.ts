import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  realizeProgressionAudioEvents,
  realizeProgressionPerformanceEvents,
} from "../../src/audio/eventRealizer";
import { DEFAULT_PIANO_PERFORMANCE, createDefaultProject } from "../../src/domain/project/factory";
import type { Project } from "../../src/domain/project/project";
import { EMPTY_HARMONIC_VARIANT, type HarmonicVariant } from "../../src/domain/harmony/chord";
import { exactPitch } from "../../src/domain/harmony/pitch";
import type {
  ChordStep,
  ProgressionStep,
  RestStep,
  StepPerformance,
} from "../../src/domain/progression/step";
import { musicalDuration } from "../../src/domain/timing/duration";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { rational, type Rational } from "../../src/domain/timing/rational";
import { groove } from "../../src/domain/timing/swing";
import { projectProjectToMidi, type MidiProjection } from "../../src/export/midi/eventProjection";
import { writeStandardMidiFile } from "../../src/export/midi/writer";
import {
  projectProjectToMusicXml,
  type MusicXmlNoteEvent,
  type MusicXmlProjection,
} from "../../src/export/musicxml/projection";
import { writeMusicXml } from "../../src/export/musicxml/writer";

interface ParsedMidiEvent {
  readonly tick: number;
  readonly kind: "tempo" | "meter" | "note-on" | "note-off" | "eot";
  readonly pitch?: number;
  readonly velocity?: number;
  readonly data?: readonly number[];
}

interface ParsedMidi {
  readonly format: number;
  readonly tracks: number;
  readonly ppq: number;
  readonly totalTrackLength: number;
  readonly events: readonly ParsedMidiEvent[];
}

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readVlq(bytes: Uint8Array, cursor: { value: number }): number {
  let value = 0;
  let complete = false;
  while (!complete) {
    const byte = bytes[cursor.value++];
    if (byte === undefined) throw new Error("truncated MIDI VLQ");
    value = (value << 7) | (byte & 0x7f);
    if (value > 0x0fffffff) throw new Error("MIDI VLQ exceeds the SMF maximum");
    complete = (byte & 0x80) === 0;
  }
  return value;
}

/** Independent SMF parser: it reads serialized bytes and never inspects the DTO. */
function parseSmf(bytes: Uint8Array): ParsedMidi {
  expect(ascii(bytes, 0, 4)).toBe("MThd");
  expect(u32(bytes, 4)).toBe(6);
  expect(ascii(bytes, 14, 4)).toBe("MTrk");
  const trackLength = u32(bytes, 18);
  const trackStart = 22;
  const trackEnd = trackStart + trackLength;
  expect(trackEnd).toBe(bytes.length);

  const cursor = { value: trackStart };
  let tick = 0;
  const events: ParsedMidiEvent[] = [];
  while (cursor.value < trackEnd) {
    tick += readVlq(bytes, cursor);
    const status = bytes[cursor.value++];
    if (status === undefined) throw new Error("truncated MIDI event status");
    if (status === 0xff) {
      const metaType = bytes[cursor.value++];
      if (metaType === undefined) throw new Error("truncated MIDI meta event");
      const length = readVlq(bytes, cursor);
      const data = [...bytes.slice(cursor.value, cursor.value + length)];
      cursor.value += length;
      if (metaType === 0x51) events.push({ tick, kind: "tempo", data });
      else if (metaType === 0x58) events.push({ tick, kind: "meter", data });
      else if (metaType === 0x2f) events.push({ tick, kind: "eot", data });
      continue;
    }
    const command = status & 0xf0;
    if (command < 0x80 || command > 0xe0) throw new Error("unsupported MIDI event");
    const first = bytes[cursor.value++];
    const second = bytes[cursor.value++];
    if (first === undefined || second === undefined)
      throw new Error("truncated MIDI channel event");
    if (command === 0x90 && second > 0) {
      events.push({ tick, kind: "note-on", pitch: first, velocity: second });
    } else if (command === 0x80 || (command === 0x90 && second === 0)) {
      events.push({ tick, kind: "note-off", pitch: first, velocity: second });
    }
  }
  return {
    format: u16(bytes, 8),
    tracks: u16(bytes, 10),
    ppq: u16(bytes, 12),
    totalTrackLength: trackLength,
    events,
  };
}

function performance(overrides: Partial<StepPerformance> = {}): StepPerformance {
  return Object.freeze({
    ...DEFAULT_PIANO_PERFORMANCE,
    articulation: "block",
    ...overrides,
    ...(overrides.bass
      ? { bass: Object.freeze({ ...DEFAULT_PIANO_PERFORMANCE.bass, ...overrides.bass }) }
      : {}),
    ...(overrides.perNoteVelocityOverrides
      ? { perNoteVelocityOverrides: Object.freeze({ ...overrides.perNoteVelocityOverrides }) }
      : {}),
    ...(overrides.manualVoicing
      ? { manualVoicing: Object.freeze([...overrides.manualVoicing]) }
      : {}),
  });
}

function chordStep(
  project: Project,
  functionId: string,
  id: string,
  durationBeats: Rational,
  performanceOverrides: Partial<StepPerformance> = {},
  harmonicVariant: HarmonicVariant = EMPTY_HARMONIC_VARIANT,
): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: project.activeModule,
      functionId,
      category: "core",
    }),
    harmonicVariant,
    duration: musicalDuration(durationBeats),
    performance: performance(performanceOverrides),
    cardView: "harmonic",
  });
}

function restStep(
  id: string,
  beats: Rational,
  displayHint: RestStep["duration"]["displayHint"],
): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(beats, displayHint),
  });
}

function canonicalProject(): Project {
  const base = createDefaultProject("us9-canonical", "US9 Canonical / Swing");
  const contextProject = Object.freeze({
    ...base,
    activeModule: "dark-harmony" as const,
    tonic: 2,
    globalTiming: globalTiming(140, meter(7, 8, [2, 2, 3])),
    groove: groove("swing", 0.55),
  });
  const variant: HarmonicVariant = Object.freeze({
    seventh: "minor7",
    extensions: Object.freeze([9]),
    suspensions: Object.freeze([]),
    alterations: Object.freeze([{ degree: 5, semitones: 1 }]),
  });
  const steps: readonly ProgressionStep[] = Object.freeze([
    chordStep(contextProject, "i", "manual-i", rational(1, 2), {
      articulation: "arp-up",
      voicingMode: "manual",
      manualVoicing: Object.freeze([
        exactPitch(62, { step: "D", alter: 0 }),
        exactPitch(65, { step: "F", alter: 0 }),
        exactPitch(69, { step: "A", alter: 0 }),
      ]),
      bass: {
        choice: "custom",
        octaveOffset: "auto",
        customPitch: exactPitch(38, { step: "D", alter: 0 }),
      },
      masterVelocity: 95,
      perNoteVelocityOverrides: { "65": 110 },
    }),
    chordStep(contextProject, "V", "auto-v-before-rest", rational(1, 2), {}, variant),
    restStep("rest-between", rational(1, 3), {
      kind: "triplet",
      baseBeats: rational(1, 2),
    }),
    chordStep(
      contextProject,
      "V",
      "auto-v-after-rest",
      rational(1, 2),
      { articulation: "arp-down", masterVelocity: 64 },
      variant,
    ),
    restStep("trailing-rest", rational(3, 2), {
      kind: "dotted",
      baseBeats: rational(1),
    }),
  ]);
  return Object.freeze({
    ...contextProject,
    progression: Object.freeze({ steps }),
    temporaryBranch: Object.freeze({
      id: "active-temporary-branch",
      originStepId: "manual-i",
      originAtEnd: false,
      rejoinStepId: "auto-v-after-rest",
      compositionIntent: "surprise",
      steps: Object.freeze([
        chordStep(contextProject, "iv", "branch-only-note", rational(4), {
          masterVelocity: 127,
        }),
      ]),
    }),
  });
}

function noteEvents(projection: MusicXmlProjection): MusicXmlNoteEvent[] {
  return projection.measures.flatMap((measure) =>
    measure.events.filter((event): event is MusicXmlNoteEvent => event.kind === "note"),
  );
}

function pitchFromXml(step: string, alter: number, octave: number): number {
  const natural: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (octave + 1) * 12 + natural[step]! + alter;
}

interface XmlNode {
  get(path: string): XmlNode | null;
  find(path: string): XmlNode[];
  name(): string;
  text(): string;
  attr(name: string): { value(): string } | null;
}

async function parseMusicXml(xml: string): Promise<XmlNode> {
  const libxml = await import("libxmljs2");
  return libxml.parseXml(xml) as unknown as XmlNode;
}

function xmlText(node: XmlNode, path: string): string {
  const child = node.get(path);
  if (!child) throw new Error(`Missing MusicXML node: ${path}`);
  return child.text();
}

function xmlNotes(document: XmlNode): readonly {
  readonly pitch?: number;
  readonly duration: number;
  readonly rest: boolean;
  readonly chord: boolean;
}[] {
  return document
    .find("//*")
    .filter((node) => node.name() === "note")
    .map((note) => {
      const rest = Boolean(note.get("rest"));
      const pitchNode = note.get("pitch");
      return {
        ...(pitchNode
          ? {
              pitch: pitchFromXml(
                xmlText(pitchNode, "step"),
                pitchNode.get("alter") ? Number(xmlText(pitchNode, "alter")) : 0,
                Number(xmlText(pitchNode, "octave")),
              ),
            }
          : {}),
        duration: Number(xmlText(note, "duration")),
        rest,
        chord: Boolean(note.get("chord")),
      };
    });
}

describe("T139 — canonical playback/MIDI/MusicXML projection consistency", () => {
  it("keeps literal musical identity across playback, serialized MIDI, and parsed MusicXML", async () => {
    const project = canonicalProject();
    const before = structuredClone(project);
    const performanceProjection = realizeProgressionPerformanceEvents({
      steps: project.progression.steps,
      tonic: project.tonic,
      context: {
        tonic: project.tonic,
        moduleId: project.activeModule,
        mode: "tonal-minor",
        spellingContext: { tonic: project.tonic, mode: "tonal-minor" },
      },
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
    });
    const audioEvents = realizeProgressionAudioEvents({
      steps: project.progression.steps,
      tonic: project.tonic,
      context: {
        tonic: project.tonic,
        moduleId: project.activeModule,
        mode: "tonal-minor",
        spellingContext: { tonic: project.tonic, mode: "tonal-minor" },
      },
      tempoBpm: project.globalTiming.tempoBpm,
      groove: project.groove,
    });
    const midiProjection: MidiProjection = projectProjectToMidi(project);
    const midiBytes = writeStandardMidiFile(midiProjection);
    const parsedMidi = parseSmf(midiBytes);
    const musicXmlProjection = projectProjectToMusicXml(project);
    const musicXml = writeMusicXml(musicXmlProjection);
    const repeatedXml = writeMusicXml(projectProjectToMusicXml(project));

    // These tables are intentionally literal acceptance evidence, independent
    // of the production realizer and of either file exporter.
    const expectedStepIds = [
      "manual-i",
      "auto-v-before-rest",
      "rest-between",
      "auto-v-after-rest",
      "trailing-rest",
    ];
    const expectedTotalBeats = rational(10, 3);
    const expectedManualPitches = [38, 62, 65, 69];
    const expectedFirstAutoVPitches = [49, 61, 65, 67, 71, 81];
    const expectedSecondAutoVPitches = [57, 61, 65, 67, 71, 81];
    const expectedPitchSequence = [
      ...expectedManualPitches,
      ...expectedFirstAutoVPitches,
      ...expectedSecondAutoVPitches,
    ];
    const expectedMidiNotes = [
      [0, 38, 95, 67],
      [0, 62, 95, 67],
      [13, 65, 110, 68],
      [25, 69, 95, 69],
      ...expectedFirstAutoVPitches.map((pitch) => [71, pitch, 80, 118]),
      [160, 57, 64, 217],
      [160, 81, 64, 217],
      [166, 71, 64, 217],
      [172, 67, 64, 218],
      [178, 65, 64, 218],
      [184, 61, 64, 218],
    ];

    expect(expectedStepIds).toEqual(project.progression.steps.map((step) => step.id));
    expect(performanceProjection.totalDurationBeats).toEqual(expectedTotalBeats);
    expect(audioEvents).toHaveLength(16);
    expect(performanceProjection.events.map((event) => event.pitch)).toEqual([
      ...expectedManualPitches,
      ...expectedFirstAutoVPitches,
      57,
      81,
      71,
      67,
      65,
      61,
    ]);
    expect(midiProjection.ppq).toBe(120);
    expect(midiProjection.totalTicks).toBe(420);
    expect(
      midiProjection.notes.map((note) => [note.startTick, note.pitch, note.velocity, note.endTick]),
    ).toEqual(expectedMidiNotes);
    expect(parsedMidi).toMatchObject({ format: 0, tracks: 1, ppq: 120 });
    expect(parsedMidi.totalTrackLength).toBeGreaterThan(0);
    expect(parsedMidi.events.filter((event) => event.kind === "tempo")[0]?.data).toEqual([
      0x06, 0x8a, 0x1b,
    ]);
    expect(parsedMidi.events.filter((event) => event.kind === "meter")[0]?.data).toEqual([
      7, 3, 24, 8,
    ]);
    expect(
      parsedMidi.events
        .filter((event) => event.kind === "note-on")
        .map((event) => [event.tick, event.pitch, event.velocity]),
    ).toEqual(midiProjection.notes.map((note) => [note.startTick, note.pitch, note.velocity]));
    expect(
      parsedMidi.events
        .filter((event) => event.kind === "note-off")
        .map((event) => [event.tick, event.pitch]),
    ).toEqual(
      [...midiProjection.notes]
        .sort((a, b) => a.endTick - b.endTick || a.pitch - b.pitch)
        .map((note) => [note.endTick, note.pitch]),
    );
    expect(parsedMidi.events.at(-1)).toMatchObject({ kind: "eot", tick: 420 });

    // Swing changes supported performance/MIDI timing, while written notation
    // remains semantic straight durations. The first pair is the literal swing evidence.
    expect(
      performanceProjection.events.find((event) => event.stepId === "auto-v-before-rest")
        ?.startBeats,
    ).toEqual(rational(71, 120));
    expect(
      midiProjection.notes
        .filter((note) => note.stepId === "auto-v-before-rest")
        .every((note) => note.startTick === 71),
    ).toBe(true);
    expect(musicXmlProjection.attributes).toMatchObject({
      divisions: 6,
      key: { fifths: -1, mode: "minor" },
      time: { numerator: 7, denominator: 8, beats: "2+2+3", grouping: [2, 2, 3] },
    });
    expect(musicXmlProjection.tempoBpm).toBe(140);
    expect(musicXmlProjection.measures[0]?.capacity).toBe(21);
    expect(musicXmlProjection.measures[0]?.durationBeats).toEqual(rational(7, 2));
    expect(noteEvents(musicXmlProjection).map((event) => event.sourceMidi)).toEqual(
      expectedPitchSequence,
    );
    expect(
      noteEvents(musicXmlProjection)
        .filter((event) => event.stepId === "manual-i")
        .map((event) => [event.pitch.step, event.pitch.alter, event.pitch.octave]),
    ).toEqual([
      ["D", 0, 2],
      ["D", 0, 4],
      ["F", 0, 4],
      ["A", 0, 4],
    ]);
    expect(
      noteEvents(musicXmlProjection)
        .filter((event) => event.stepId === "manual-i")
        .every((event) => event.arpeggiate === "arpeggiate-up" || event.role === "bass"),
    ).toBe(true);
    expect(
      musicXmlProjection.measures
        .flatMap((measure) => measure.events)
        .filter((event) => event.kind === "rest")
        .map((event) => [event.stepId, event.duration]),
    ).toEqual([
      ["rest-between", 2],
      ["trailing-rest", 9],
      ["__trailing-measure-gap__", 1],
    ]);
    expect(musicXmlProjection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "presentation-state-omitted",
      "recommendation-metadata-omitted",
      "runtime-state-omitted",
      "groove-omitted",
      "temporary-branch-omitted",
      "per-note-velocity-omitted",
    ]);

    const document = await parseMusicXml(musicXml);
    expect(xmlText(document, "//attributes/key/fifths")).toBe("-1");
    expect(xmlText(document, "//attributes/key/mode")).toBe("minor");
    expect(xmlText(document, "//attributes/time/beats")).toBe("2+2+3");
    expect(xmlText(document, "//attributes/time/beat-type")).toBe("8");
    expect(document.get("//direction[1]/sound")?.attr("tempo")?.value()).toBe("140");
    expect(document.find("//harmony/kind").map((node) => node.text())).toEqual([
      "minor",
      "dominant",
      "dominant",
    ]);
    expect(document.find("//dynamics/*").map((node) => node.name())).toEqual(["f", "mf", "mp"]);
    const parsedNotes = xmlNotes(document);
    expect(parsedNotes.filter((note) => !note.rest).map((note) => note.pitch)).toEqual(
      expectedPitchSequence,
    );
    expect(
      parsedNotes.filter((note) => note.rest).map((note) => [note.duration, note.rest]),
    ).toEqual([
      [2, true],
      [9, true],
      [1, true],
    ]);
    expect(parsedNotes.filter((note) => !note.rest && note.chord)).toHaveLength(13);
    expect(musicXml).not.toContain("branch-only-note");
    expect(repeatedXml).toBe(musicXml);

    const directory = await mkdtemp(join(tmpdir(), "cadenceflow-us9-t139-"));
    try {
      const outputPath = join(directory, "fresh-output.musicxml");
      await writeFile(outputPath, musicXml, "utf8");
      const validation = spawnSync(
        process.execPath,
        [
          resolve("node_modules/tsx/dist/cli.mjs"),
          resolve("scripts/validate-musicxml.ts"),
          outputPath,
        ],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(validation.error).toBeUndefined();
      expect(validation.status, validation.stderr).toBe(0);
      expect(validation.stdout).toContain("valid MusicXML 4.0");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    expect(structuredClone(project)).toEqual(before);
    expect(project.temporaryBranch?.steps.map((step) => step.id)).toEqual(["branch-only-note"]);
  }, 30_000);
});
