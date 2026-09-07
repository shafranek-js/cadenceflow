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
import { realizeChord } from "../../../src/domain/harmony/realization";
import { modeForModule } from "../../../src/domain/harmony/functions";
import { pianoProfile } from "../../../src/instruments/piano/profile";
import {
  MIDI_PPQ,
  projectProjectToMidi,
  type MidiProjection,
} from "../../../src/export/midi/eventProjection";
import { writeStandardMidiFile } from "../../../src/export/midi/writer";

function performance(overrides: Partial<StepPerformance> = {}): StepPerformance {
  return Object.freeze({
    ...DEFAULT_PIANO_PERFORMANCE,
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

describe("US9 MIDI projection and deterministic SMF writer", () => {
  it("projects a non-default manual performance with exact pitches, bass, velocities, and ticks", () => {
    const project = makeManualProject();
    const before = structuredClone(project);
    const projection = projectProjectToMidi(project);

    expect(projection.ppq).toBe(120);
    expect(projection.tempoBpm).toBe(100);
    expect(projection.meter).toEqual({ numerator: 4, denominator: 4, grouping: [4] });
    expect(projection.totalTicks).toBe(120);
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
    expect(projection.totalTicks).toBe(280);
    expect(Math.max(...projection.notes.map((note) => note.endTick))).toBe(248);
    expect(projection.totalTicks - 248).toBe(32);
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
    expect(swung.totalTicks).toBe(120);
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
    const context = {
      tonic: project.tonic,
      moduleId: project.activeModule,
      mode: modeForModule(project.activeModule),
      spellingContext: { tonic: project.tonic, mode: modeForModule(project.activeModule) },
    } as const;
    const ivChord = realizeChord(first.harmonicFunction, project.tonic);
    const firstRealization = pianoProfile.realizeChord({
      context,
      chord: { ...ivChord, variant: first.harmonicVariant },
      performance: first.performance,
    });
    const iChord = realizeChord(second.harmonicFunction, project.tonic);
    const secondRealization = pianoProfile.realizeChord({
      context,
      chord: { ...iChord, variant: second.harmonicVariant },
      performance: second.performance,
      previousPitches: firstRealization.pitches,
      previousBassPitch: firstRealization.bassPitch,
    });

    expect(
      projection.notes
        .filter((note) => note.stepIndex === 0)
        .map((note) => note.pitch)
        .sort((a, b) => a - b),
    ).toEqual(
      [firstRealization.bassPitch, ...firstRealization.pitches]
        .filter((pitch): pitch is NonNullable<typeof pitch> => Boolean(pitch))
        .map((pitch) => pitch.midiNumber)
        .sort((a, b) => a - b),
    );
    expect(
      projection.notes
        .filter((note) => note.stepIndex === 1)
        .map((note) => note.pitch)
        .sort((a, b) => a - b),
    ).toEqual(
      [secondRealization.bassPitch, ...secondRealization.pitches]
        .filter((pitch): pitch is NonNullable<typeof pitch> => Boolean(pitch))
        .map((pitch) => pitch.midiNumber)
        .sort((a, b) => a - b),
    );
    expect(secondRealization.bassPitch?.midiNumber).toBe(52);
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
