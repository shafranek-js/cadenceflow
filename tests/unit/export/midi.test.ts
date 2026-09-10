import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  DEFAULT_PIANO_PERFORMANCE,
  createDefaultProject,
} from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";
import type { ChordStep, RestStep, StepPerformance } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { globalTiming, meter } from "../../../src/domain/timing/meter";
import { rational } from "../../../src/domain/timing/rational";
import { groove } from "../../../src/domain/timing/swing";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { snapshotChordMelodyRecipe, type MelodyInstrument } from "../../../src/domain/melody/types";
import {
  MIDI_PPQ,
  projectProjectToMidi,
  quantizeRationalToMidiTicks,
  type MidiProjection,
} from "../../../src/export/midi/eventProjection";
import { writeMidiFile, writeStandardMidiFile } from "../../../src/export/midi/writer";

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

function chord(
  project: Project,
  functionId: string,
  id: string,
  durationNumerator: number,
  durationDenominator = 1,
  performanceOverrides: Partial<StepPerformance> = {},
): ChordStep {
  const base = createMatrixChordStep(project, functionId, id);
  return Object.freeze({
    ...base,
    duration: musicalDuration(rational(durationNumerator, durationDenominator)),
    performance: performance(performanceOverrides),
  });
}

function melodyChord(step: ChordStep, recipe: ChordStep["melody"]): ChordStep {
  if (!recipe) throw new Error("melody fixture requires a recipe");
  return Object.freeze({ ...step, melody: snapshotChordMelodyRecipe(recipe) });
}

function rest(id: string, numerator: number, denominator = 1): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(rational(numerator, denominator)),
  });
}

function projectWithSteps(
  steps: readonly (ChordStep | RestStep)[],
  overrides: Partial<Project> = {},
): Project {
  const base = createDefaultProject("midi-fixture", "MIDI Fixture", "2026-09-07T00:00:00.000Z");
  return Object.freeze({
    ...base,
    ...overrides,
    progression: Object.freeze({ steps: Object.freeze([...steps]) }),
  });
}

function makeManualProject(): Project {
  const base = createDefaultProject("manual-dark-fixture", "Manual Dark Fixture");
  const project = Object.freeze({
    ...base,
    activeModule: "dark-harmony" as const,
    tonic: 3,
  });
  const bass = exactPitch(36, { step: "C", alter: 0 });
  const upper = [
    exactPitch(60, { step: "C", alter: 0 }),
    exactPitch(64, { step: "E", alter: 0 }),
    exactPitch(67, { step: "G", alter: 0 }),
  ];
  return projectWithSteps(
    [
      chord(project, "i", "manual-step", 1, 1, {
        articulation: "block",
        register: 2,
        voicingMode: "manual",
        manualVoicing: upper,
        bass: { choice: "custom", octaveOffset: "auto", customPitch: bass },
        masterVelocity: 92,
        perNoteVelocityOverrides: { "60": 111 },
      }),
    ],
    { ...project },
  );
}

function makeMelodyExportProject(instrument: MelodyInstrument = "violin"): Project {
  const base = createDefaultProject("melody-midi-fixture", "Melody MIDI Fixture");
  const firstUpper = [
    exactPitch(60, { step: "C", alter: 0 }),
    exactPitch(64, { step: "E", alter: 0 }),
    exactPitch(67, { step: "G", alter: 0 }),
  ];
  const first = melodyChord(
    chord(base, "I", "melody-first", 2, 1, {
      voicingMode: "manual",
      manualVoicing: firstUpper,
      masterVelocity: 92,
      perNoteVelocityOverrides: { "64": 111 },
    }),
    { pattern: "up", grid: "quarter", octaveOffset: 1 },
  );
  const second = melodyChord(chord(base, "V", "melody-second", 1, 1), {
    pattern: "down",
    grid: "quarter",
    octaveOffset: 0,
  });
  return projectWithSteps([first, rest("melody-rest", 1, 2), second], {
    globalTiming: globalTiming(120, meter(4, 4, [4])),
    melodyTrack: Object.freeze({
      ...base.melodyTrack,
      instrument,
      muted: false,
      solo: false,
      volume: 96,
    }),
  });
}

describe("US9 MIDI projection and deterministic SMF writer", () => {
  it("projects a non-default manual performance with exact pitches, bass, velocities, and ticks", () => {
    const project = makeManualProject();
    const before = structuredClone(project);
    const projection = projectProjectToMidi(project);

    expect(projection.ppq).toBe(120);
    expect(projection.tempoBpm).toBe(100);
    expect(projection.meter).toEqual({ numerator: 4, denominator: 4, grouping: [4] });
    expect(projection.totalTicks).toBe(480);
    expect(projection.notes).toEqual([
      {
        stepIndex: 0,
        stepId: "manual-step",
        order: 0,
        channel: 0,
        role: "bass",
        pitch: 36,
        velocity: 92,
        startTick: 0,
        endTick: 114,
      },
      {
        stepIndex: 0,
        stepId: "manual-step",
        order: 1,
        channel: 0,
        role: "upper",
        pitch: 60,
        velocity: 111,
        startTick: 0,
        endTick: 114,
      },
      {
        stepIndex: 0,
        stepId: "manual-step",
        order: 2,
        channel: 0,
        role: "upper",
        pitch: 64,
        velocity: 92,
        startTick: 0,
        endTick: 114,
      },
      {
        stepIndex: 0,
        stepId: "manual-step",
        order: 3,
        channel: 0,
        role: "upper",
        pitch: 67,
        velocity: 92,
        startTick: 0,
        endTick: 114,
      },
    ]);
    expect(projection.notes.filter((note) => note.role === "bass")).toHaveLength(1);
    expect(structuredClone(project)).toEqual(before);
  });

  it("preserves progression order and exact silent Rest/trailing-Rest time", () => {
    const base = createDefaultProject("rest-fixture", "Rest Fixture");
    const steps = [
      chord(base, "I", "sounding-1", 1, 2),
      chord(base, "IV", "sounding-2", 3, 4),
      rest("middle-rest", 1, 2),
      chord(base, "V", "sounding-3", 1, 3),
      rest("trailing-rest", 1, 4),
    ];
    const projection = projectProjectToMidi(projectWithSteps(steps));

    expect(projection.notes.every((note) => note.stepIndex !== 2 && note.stepIndex !== 4)).toBe(
      true,
    );
    expect([
      ...new Set(projection.notes.map((note) => `${note.stepIndex}:${note.startTick}`)),
    ]).toEqual(["0:0", "1:60", "3:210"]);
    expect(projection.totalTicks).toBe(480);
    expect(Math.max(...projection.notes.map((note) => note.endTick))).toBe(248);
    expect(projection.totalTicks - 248).toBe(232);
  });

  it("keeps deterministic arpeggio ordering and explicit simultaneous tie ordering", () => {
    const base = createDefaultProject("arp-fixture", "Arp Fixture");
    const bass = exactPitch(36, { step: "C", alter: 0 });
    const upper = [
      exactPitch(67, { step: "G", alter: 0 }),
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
    ];
    const project = projectWithSteps(
      [
        chord(base, "I", "arp-step", 1, 1, {
          articulation: "arp-up",
          voicingMode: "manual",
          manualVoicing: upper,
          bass: { choice: "custom", octaveOffset: "auto", customPitch: bass },
        }),
      ],
      { globalTiming: globalTiming(120, meter(4, 4, [4])) },
    );
    const projection = projectProjectToMidi(project);

    expect(projection.notes.map((note) => [note.role, note.pitch, note.startTick])).toEqual([
      ["bass", 36, 0],
      ["upper", 60, 0],
      ["upper", 64, 11],
      ["upper", 67, 22],
    ]);
    expect(projection.notes.map((note) => note.order)).toEqual([0, 1, 2, 3]);
  });

  it("projects paired eighth-note swing in ticks without changing stored durations", () => {
    const base = createDefaultProject("swing-fixture", "Swing Fixture");
    const straightProject = projectWithSteps(
      [chord(base, "I", "eighth-1", 1, 2), chord(base, "V", "eighth-2", 1, 2)],
      { globalTiming: globalTiming(120, meter(4, 4, [4])) },
    );
    const project = Object.freeze({ ...straightProject, groove: groove("swing", 0.55) });
    const beforeDurations = structuredClone(project.progression.steps.map((step) => step.duration));
    const straight = projectProjectToMidi(straightProject);
    const swung = projectProjectToMidi(project);

    expect([
      ...new Set(straight.notes.filter((n) => n.stepIndex === 1).map((n) => n.startTick)),
    ]).toEqual([60]);
    expect([
      ...new Set(swung.notes.filter((n) => n.stepIndex === 0).map((n) => n.startTick)),
    ]).toEqual([0]);
    expect([
      ...new Set(swung.notes.filter((n) => n.stepIndex === 1).map((n) => n.startTick)),
    ]).toEqual([71]);
    expect(swung.totalTicks).toBe(480);
    expect(structuredClone(project.progression.steps.map((step) => step.duration))).toEqual(
      beforeDurations,
    );
    expect(projectProjectToMidi(project)).toEqual(swung);
  });

  it("uses canonical contextual automatic realization while preserving manual register immunity", () => {
    const base = createDefaultProject("context-fixture", "Context Fixture");
    const first = chord(base, "IV", "context-iv", 1, 1);
    const second = chord(base, "I", "context-i", 1, 1, { register: 2 });
    const project = projectWithSteps([first, second]);
    const projection = projectProjectToMidi(project);

    // Literal golden values: the expected table does not call the production realizer.
    expect(
      projection.notes.map((note) => [note.stepIndex, note.role, note.pitch, note.startTick]),
    ).toEqual([
      [0, "bass", 53, 0],
      [0, "upper", 57, 0],
      [0, "upper", 60, 0],
      [0, "upper", 65, 0],
      [1, "bass", 52, 120],
      [1, "upper", 79, 120],
      [1, "upper", 84, 120],
      [1, "upper", 88, 120],
    ]);
  });

  it("documents half-up tick quantization and preserves valid sub-tick steps", () => {
    expect(quantizeRationalToMidiTicks(rational(1, 240))).toBe(1);
    expect(quantizeRationalToMidiTicks(rational(1, 241))).toBe(0);

    const base = createDefaultProject("sub-tick-fixture", "Sub-tick Fixture");
    const project = projectWithSteps([
      chord(base, "I", "tiny-chord-1", 1, 1000),
      rest("tiny-rest", 1, 1000),
      chord(base, "V", "tiny-chord-2", 1, 1000),
    ]);
    const projection = projectProjectToMidi(project);

    expect(projection.totalTicks).toBe(480);
    expect([
      ...new Set(projection.notes.map((note) => `${note.stepIndex}:${note.startTick}`)),
    ]).toEqual(["0:0", "2:2"]);
    expect(projection.notes.every((note) => note.endTick > note.startTick)).toBe(true);
    expect(() => writeStandardMidiFile(projection)).not.toThrow();
  });
});

interface ParsedEvent {
  readonly tick: number;
  readonly kind: "tempo" | "meter" | "note-on" | "note-off" | "eot";
  readonly pitch?: number;
  readonly velocity?: number;
  readonly data?: readonly number[];
  readonly deltaBytes: readonly number[];
}

interface ParsedSmf {
  readonly format: number;
  readonly tracks: number;
  readonly division: number;
  readonly trackLength: number;
  readonly events: readonly ParsedEvent[];
}

interface ParsedFormatOneEvent {
  readonly tick: number;
  readonly kind:
    | "track-name"
    | "instrument-name"
    | "channel-prefix"
    | "tempo"
    | "meter"
    | "program-change"
    | "control-change"
    | "note-on"
    | "note-off"
    | "eot"
    | "other";
  readonly channel?: number;
  readonly program?: number;
  readonly controller?: number;
  readonly value?: number;
  readonly pitch?: number;
  readonly velocity?: number;
  readonly text?: string;
}

interface ParsedFormatOneTrack {
  readonly events: readonly ParsedFormatOneEvent[];
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! * 256 + bytes[offset + 1]!;
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function parseVlq(
  bytes: Uint8Array,
  offset: { value: number },
): { value: number; bytes: readonly number[] } {
  let value = 0;
  const encoded: number[] = [];
  let current: number;
  do {
    current = bytes[offset.value++]!;
    encoded.push(current);
    value = (value << 7) | (current & 0x7f);
  } while (current & 0x80);
  return { value, bytes: encoded };
}

function parseSmf(bytes: Uint8Array): ParsedSmf {
  expect(ascii(bytes, 0, 4)).toBe("MThd");
  expect(u32(bytes, 4)).toBe(6);
  const trackStart = 14;
  expect(ascii(bytes, trackStart, 4)).toBe("MTrk");
  const trackLength = u32(bytes, trackStart + 4);
  const trackEnd = trackStart + 8 + trackLength;
  expect(trackEnd).toBe(bytes.length);
  const cursor = { value: trackStart + 8 };
  let tick = 0;
  const events: ParsedEvent[] = [];
  while (cursor.value < trackEnd) {
    const delta = parseVlq(bytes, cursor);
    tick += delta.value;
    const status = bytes[cursor.value++]!;
    if (status === 0xff) {
      const metaType = bytes[cursor.value++]!;
      const length = bytes[cursor.value++]!;
      const data = [...bytes.slice(cursor.value, cursor.value + length)];
      cursor.value += length;
      const kind =
        metaType === 0x51
          ? "tempo"
          : metaType === 0x58
            ? "meter"
            : metaType === 0x2f
              ? "eot"
              : undefined;
      if (kind) events.push({ tick, kind, data, deltaBytes: delta.bytes });
      continue;
    }
    const command = status & 0xf0;
    const pitch = bytes[cursor.value++]!;
    const velocity = bytes[cursor.value++]!;
    if (command === 0x90 && velocity > 0) {
      events.push({ tick, kind: "note-on", pitch, velocity, deltaBytes: delta.bytes });
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      events.push({ tick, kind: "note-off", pitch, velocity, deltaBytes: delta.bytes });
    }
  }
  return {
    format: u16(bytes, 8),
    tracks: u16(bytes, 10),
    division: u16(bytes, 12),
    trackLength,
    events,
  };
}

function parseFormatOneSmf(bytes: Uint8Array): {
  readonly format: number;
  readonly division: number;
  readonly tracks: readonly ParsedFormatOneTrack[];
} {
  expect(ascii(bytes, 0, 4)).toBe("MThd");
  expect(u32(bytes, 4)).toBe(6);
  const trackCount = u16(bytes, 10);
  const tracks: ParsedFormatOneTrack[] = [];
  let trackOffset = 14;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    expect(ascii(bytes, trackOffset, 4)).toBe("MTrk");
    const trackLength = u32(bytes, trackOffset + 4);
    const trackEnd = trackOffset + 8 + trackLength;
    const cursor = { value: trackOffset + 8 };
    let tick = 0;
    const events: ParsedFormatOneEvent[] = [];

    while (cursor.value < trackEnd) {
      tick += parseVlq(bytes, cursor).value;
      const status = bytes[cursor.value++]!;
      if (status === 0xff) {
        const metaType = bytes[cursor.value++]!;
        const length = parseVlq(bytes, cursor).value;
        const data = [...bytes.slice(cursor.value, cursor.value + length)];
        cursor.value += length;
        const kind =
          metaType === 0x03
            ? "track-name"
            : metaType === 0x04
              ? "instrument-name"
              : metaType === 0x20
                ? "channel-prefix"
                : metaType === 0x51
                  ? "tempo"
                  : metaType === 0x58
                    ? "meter"
                    : metaType === 0x2f
                      ? "eot"
                      : "other";
        events.push({
          tick,
          kind,
          ...(kind === "track-name" || kind === "instrument-name"
            ? { text: String.fromCharCode(...data) }
            : {}),
          ...(kind === "channel-prefix" ? { channel: data[0] } : {}),
        });
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      if (command === 0xc0) {
        const program = bytes[cursor.value++]!;
        events.push({ tick, kind: "program-change", channel, program });
        continue;
      }
      if (command === 0xb0) {
        const controller = bytes[cursor.value++]!;
        const value = bytes[cursor.value++]!;
        events.push({ tick, kind: "control-change", channel, controller, value });
        continue;
      }
      const pitch = bytes[cursor.value++]!;
      const velocity = bytes[cursor.value++]!;
      if (command === 0x90 && velocity > 0) {
        events.push({ tick, kind: "note-on", channel, pitch, velocity });
      } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        events.push({ tick, kind: "note-off", channel, pitch, velocity });
      }
    }
    expect(cursor.value).toBe(trackEnd);
    tracks.push({ events });
    trackOffset = trackEnd;
  }

  expect(trackOffset).toBe(bytes.length);
  return {
    format: u16(bytes, 8),
    division: u16(bytes, 12),
    tracks,
  };
}

function rawProjection(overrides: Partial<MidiProjection> = {}): MidiProjection {
  return {
    ppq: MIDI_PPQ,
    tempoBpm: 120,
    meter: { numerator: 4, denominator: 4, grouping: [4] },
    totalTicks: 120,
    notes: [],
    ...overrides,
  };
}

describe("T133 — independent SMF parsing evidence", () => {
  it("writes valid format-0 header, tempo, meter, exact notes, and trailing-rest EOT", () => {
    const base = createDefaultProject("writer-fixture", "Writer Fixture");
    const project = projectWithSteps(
      [chord(base, "I", "writer-chord", 1, 2), rest("writer-rest", 3, 2)],
      { globalTiming: globalTiming(120, meter(3, 4, [1, 2])) },
    );
    const projection = projectProjectToMidi(project);
    const parsed = parseSmf(writeStandardMidiFile(projection));

    expect(parsed.format).toBe(0);
    expect(parsed.tracks).toBe(1);
    expect(parsed.division).toBe(MIDI_PPQ);
    expect(parsed.trackLength).toBeGreaterThan(0);
    expect(parsed.events.slice(0, 2).map((event) => event.kind)).toEqual(["tempo", "meter"]);
    expect(parsed.events[0]?.data).toEqual([0x07, 0xa1, 0x20]);
    expect(parsed.events[1]?.data).toEqual([3, 2, 24, 8]);
    expect(
      parsed.events
        .filter((event) => event.kind === "note-on")
        .map((event) => [event.tick, event.pitch, event.velocity]),
    ).toEqual(projection.notes.map((note) => [note.startTick, note.pitch, note.velocity]));
    expect(
      parsed.events
        .filter((event) => event.kind === "note-off")
        .map((event) => [event.tick, event.pitch]),
    ).toEqual(projection.notes.map((note) => [note.endTick, note.pitch]));
    expect(parsed.events.at(-1)).toMatchObject({ kind: "eot", tick: projection.totalTicks });
  });

  it("orders note-off before note-on at a shared nonzero tick", () => {
    const projection = rawProjection({
      totalTicks: 120,
      notes: [
        {
          stepIndex: 0,
          stepId: "a",
          order: 0,
          channel: 0,
          role: "upper",
          pitch: 60,
          velocity: 80,
          startTick: 0,
          endTick: 60,
        },
        {
          stepIndex: 1,
          stepId: "b",
          order: 1,
          channel: 0,
          role: "upper",
          pitch: 64,
          velocity: 80,
          startTick: 60,
          endTick: 120,
        },
      ],
    });
    const parsed = parseSmf(writeStandardMidiFile(projection));
    expect(parsed.events.filter((event) => event.tick === 60).map((event) => event.kind)).toEqual([
      "note-off",
      "note-on",
    ]);
  });

  it("encodes and independently decodes a VLQ delta greater than 127", () => {
    const projection = rawProjection({
      totalTicks: 200,
      notes: [
        {
          stepIndex: 0,
          stepId: "long",
          order: 0,
          channel: 0,
          role: "upper",
          pitch: 60,
          velocity: 80,
          startTick: 0,
          endTick: 1,
        },
      ],
    });
    const parsed = parseSmf(writeStandardMidiFile(projection));
    const eot = parsed.events.at(-1)!;
    expect(eot.tick).toBe(200);
    expect(eot.deltaBytes).toEqual([0x81, 0x47]);
  });

  it("is byte-for-byte deterministic for repeated writes", () => {
    const projection = rawProjection({
      totalTicks: 240,
      notes: [
        {
          stepIndex: 0,
          stepId: "one",
          order: 0,
          channel: 0,
          role: "bass",
          pitch: 36,
          velocity: 70,
          startTick: 0,
          endTick: 114,
        },
        {
          stepIndex: 0,
          stepId: "one",
          order: 1,
          channel: 0,
          role: "upper",
          pitch: 60,
          velocity: 100,
          startTick: 0,
          endTick: 114,
        },
      ],
    });
    expect(Array.from(writeStandardMidiFile(projection))).toEqual(
      Array.from(writeStandardMidiFile(projection)),
    );
  });
});

describe("notation-friendly MIDI export", () => {
  it("writes separate named chord and bass tracks with stable channels and barline EOT", () => {
    const projection = projectProjectToMidi(makeManualProject());
    const bytes = writeMidiFile(projection);
    const parsed = parseFormatOneSmf(bytes);

    expect(parsed.format).toBe(1);
    expect(parsed.division).toBe(MIDI_PPQ);
    expect(parsed.tracks).toHaveLength(3);
    expect(parsed.tracks.map((track) => track.events[0]?.text)).toEqual([
      "CadenceFlow Conductor",
      "CadenceFlow Chords",
      "CadenceFlow Bass",
    ]);

    const conductor = parsed.tracks[0]!.events;
    expect(conductor.map((event) => event.kind)).toContain("tempo");
    expect(conductor.map((event) => event.kind)).toContain("meter");

    const upperNotes = parsed.tracks[1]!.events.filter((event) => event.kind === "note-on");
    expect(upperNotes.map((event) => [event.channel, event.pitch, event.velocity])).toEqual([
      [0, 60, 111],
      [0, 64, 92],
      [0, 67, 92],
    ]);
    const bassNotes = parsed.tracks[2]!.events.filter((event) => event.kind === "note-on");
    expect(bassNotes.map((event) => [event.channel, event.pitch, event.velocity])).toEqual([
      [1, 36, 92],
    ]);
    expect(parsed.tracks[1]!.events[1]).toMatchObject({
      kind: "instrument-name",
      text: "Acoustic Grand Piano",
    });
    expect(parsed.tracks[2]!.events[2]).toMatchObject({
      kind: "channel-prefix",
      channel: 1,
    });
    expect(parsed.tracks.map((track) => track.events.at(-1))).toEqual([
      expect.objectContaining({ kind: "eot", tick: projection.totalTicks }),
      expect.objectContaining({ kind: "eot", tick: projection.totalTicks }),
      expect.objectContaining({ kind: "eot", tick: projection.totalTicks }),
    ]);
    expect(Array.from(writeMidiFile(projection))).toEqual(Array.from(bytes));
  });

  it("writes Melody as a fourth track from contextual recipes with independent channel metadata", () => {
    const project = makeMelodyExportProject();
    const before = structuredClone(project);
    const projection = projectProjectToMidi(project);
    const bytes = writeMidiFile(projection);
    const parsed = parseFormatOneSmf(bytes);

    expect(parsed.format).toBe(1);
    expect(parsed.division).toBe(MIDI_PPQ);
    expect(parsed.tracks).toHaveLength(4);
    expect(
      parsed.tracks.map((track) => track.events.find((event) => event.kind === "track-name")?.text),
    ).toEqual([
      "CadenceFlow Conductor",
      "CadenceFlow Melody",
      "CadenceFlow Chords",
      "CadenceFlow Bass",
    ]);

    const melodyEvents = parsed.tracks[1]!.events;
    expect(melodyEvents).toContainEqual({
      tick: 0,
      kind: "instrument-name",
      text: "Violin",
    });
    expect(melodyEvents).toContainEqual({ tick: 0, kind: "channel-prefix", channel: 2 });
    expect(melodyEvents).toContainEqual({
      tick: 0,
      kind: "program-change",
      channel: 2,
      program: 40,
    });
    expect(melodyEvents).toContainEqual({
      tick: 0,
      kind: "control-change",
      channel: 2,
      controller: 7,
      value: 96,
    });
    expect(
      melodyEvents
        .filter((event) => event.kind === "note-on")
        .map((event) => [event.channel, event.pitch, event.velocity, event.tick]),
    ).toEqual([
      [2, 72, 92, 0],
      [2, 76, 111, 120],
      [2, 67, 80, 300],
    ]);
    expect(
      melodyEvents
        .filter((event) => event.kind === "note-off")
        .map((event) => [event.channel, event.pitch, event.tick]),
    ).toEqual([
      [2, 72, 120],
      [2, 76, 240],
      [2, 67, 420],
    ]);
    expect(parsed.tracks.map((track) => track.events.at(-1))).toEqual([
      expect.objectContaining({ kind: "eot", tick: 480 }),
      expect.objectContaining({ kind: "eot", tick: 480 }),
      expect.objectContaining({ kind: "eot", tick: 480 }),
      expect.objectContaining({ kind: "eot", tick: 480 }),
    ]);
    expect(structuredClone(project)).toEqual(before);
  });

  it.each([
    ["violin", 40],
    ["cello", 42],
    ["oboe", 68],
    ["clarinet", 71],
    ["flute", 73],
    ["synth-lead", 80],
  ] as const)("maps %s to GM program %s", (instrument, program) => {
    const parsed = parseFormatOneSmf(
      writeMidiFile(projectProjectToMidi(makeMelodyExportProject(instrument))),
    );
    expect(parsed.tracks[1]!.events).toContainEqual({
      tick: 0,
      kind: "program-change",
      channel: 2,
      program,
    });
  });

  it("applies swing only to straight Melody subdivisions and keeps triplets straight", () => {
    const base = makeMelodyExportProject();
    const straight = projectProjectToMidi(base);
    const swung = projectProjectToMidi(Object.freeze({ ...base, groove: groove("swing", 0.55) }));
    const triplet = projectProjectToMidi(
      Object.freeze({
        ...base,
        progression: Object.freeze({
          steps: Object.freeze([
            melodyChord(chord(base, "I", "triplet-melody", 1, 1), {
              pattern: "up",
              grid: "eighth-triplet",
              octaveOffset: 0,
            }),
          ]),
        }),
        groove: groove("swing", 0.55),
      }),
    );

    expect(straight.melody?.notes.map((note) => note.startTick)).toEqual([0, 120, 300]);
    expect(swung.melody?.notes.map((note) => note.startTick)).toEqual([0, 142, 300]);
    expect(triplet.melody?.notes.map((note) => note.startTick)).toEqual([0, 40, 80]);
  });

  it("orders repeated same-pitch note-off before the following note-on", () => {
    const base = createDefaultProject("repeated-melody", "Repeated Melody");
    const step = melodyChord(
      chord(base, "I", "repeated-melody-step", 2, 1, {
        voicingMode: "manual",
        manualVoicing: [exactPitch(60, { step: "C", alter: 0 })],
      }),
      { pattern: "up", grid: "quarter", octaveOffset: 0 },
    );
    const parsed = parseFormatOneSmf(writeMidiFile(projectProjectToMidi(projectWithSteps([step]))));
    expect(
      parsed.tracks[1]!.events.filter(
        (event) => event.tick === 120 && (event.kind === "note-off" || event.kind === "note-on"),
      ).map((event) => event.kind),
    ).toEqual(["note-off", "note-on"]);
  });

  it("keeps Mute, Solo, and Temporary Branch outside the exported Melody data", () => {
    const base = makeMelodyExportProject();
    const branchStep = melodyChord(chord(base, "ii", "branch-melody-only", 1, 1), {
      pattern: "up",
      grid: "quarter",
      octaveOffset: 0,
    });
    const muted = Object.freeze({
      ...base,
      melodyTrack: Object.freeze({ ...base.melodyTrack, muted: true }),
    });
    const solo = Object.freeze({
      ...base,
      melodyTrack: Object.freeze({ ...base.melodyTrack, solo: true }),
    });
    const withBranch = Object.freeze({
      ...muted,
      temporaryBranch: Object.freeze({
        id: "melody-branch",
        originStepId: "melody-first",
        originAtEnd: false,
        rejoinStepId: "melody-second",
        compositionIntent: "surprise" as const,
        steps: Object.freeze([branchStep]),
      }),
    });

    const original = projectProjectToMidi(base);
    expect(projectProjectToMidi(muted)).toEqual(original);
    expect(projectProjectToMidi(solo)).toEqual(original);
    const branchProjection = projectProjectToMidi(withBranch);
    expect(branchProjection).toEqual(original);
    expect(branchProjection.melody?.notes.every((note) => !note.stepId.startsWith("branch-"))).toBe(
      true,
    );
  });

  it("pins no-Melody format-1 bytes and leaves legacy format-0 bytes unchanged", () => {
    const base = createDefaultProject(
      "pre-t174-golden",
      "Pre T174 Golden",
      "2026-09-10T00:00:00.000Z",
    );
    const step = createMatrixChordStep(base, "I", "golden-step");
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ steps: Object.freeze([step]) }),
    });
    const projection = projectProjectToMidi(project);
    expect(projection.melody).toBeUndefined();
    const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
    expect(hex(writeMidiFile(projection))).toBe(
      "4d546864000000060001000300784d54726b0000002d00ff0315436164656e6365466c6f7720436f6e647563746f7200ff51030927c000ff5804040218088360ff2f004d54726b0000005300ff0312436164656e6365466c6f772043686f72647300ff041441636f7573746963204772616e64205069616e6f00ff20010000c00000903c50019043500290405083298043000a80400001803c0029ff2f004d54726b0000004100ff0310436164656e6365466c6f77204261737300ff041441636f7573746963204772616e64205069616e6f00ff20010100c10000913050834881300018ff2f00",
    );
    expect(hex(writeStandardMidiFile(projection))).toBe(
      "4d546864000000060000000100784d54726b0000003400ff51030927c000ff5804040218080090305000903c50019043500290405083298043000a80400001803c001180300018ff2f00",
    );
  });
});
