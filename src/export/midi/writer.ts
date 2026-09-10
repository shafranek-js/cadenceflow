import type {
  MidiProjection,
  MidiProjectionMelodyNote,
  MidiProjectionNote,
} from "./eventProjection";

const MIDI_MAX_VLQ = 0x0fffffff;
const MIDI_MAX_CHUNK_LENGTH = 0xffffffff;

interface MidiTrackEvent {
  readonly tick: number;
  readonly kind:
    | "track-name"
    | "instrument-name"
    | "channel-prefix"
    | "tempo"
    | "meter"
    | "program-change"
    | "control-change"
    | "note-off"
    | "note-on"
    | "eot";
  readonly channel?: number;
  readonly pitch?: number;
  readonly velocity?: number;
  readonly program?: number;
  readonly controller?: number;
  readonly value?: number;
  readonly text?: string;
  readonly roleOrder?: number;
  readonly order: number;
}

function assertUInt(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${label} must be an integer in 0..${max}`);
  }
}

function pushAscii(target: number[], value: string): void {
  for (const character of value) target.push(character.charCodeAt(0));
}

function pushU16(target: number[], value: number): void {
  target.push((value >>> 8) & 0xff, value & 0xff);
}

function pushU24(target: number[], value: number): void {
  target.push((value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function pushU32(target: number[], value: number): void {
  target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function encodeVlq(value: number): readonly number[] {
  assertUInt(value, MIDI_MAX_VLQ, "MIDI delta time");
  let buffer = value & 0x7f;
  const bytes = [buffer];
  while ((value >>= 7) > 0) {
    buffer = (value & 0x7f) | 0x80;
    bytes.unshift(buffer);
  }
  return bytes;
}

function eventKindOrder(kind: MidiTrackEvent["kind"]): number {
  switch (kind) {
    case "track-name":
      return 0;
    case "instrument-name":
      return 1;
    case "channel-prefix":
      return 2;
    case "tempo":
    case "meter":
      return 3;
    case "program-change":
      return 4;
    case "control-change":
      return 5;
    case "note-off":
      return 6;
    case "note-on":
      return 7;
    case "eot":
      return 8;
  }
}

function roleOrder(note: MidiProjectionNote | MidiProjectionMelodyNote): number {
  return "role" in note && note.role === "bass" ? 0 : 1;
}

function compareEvents(a: MidiTrackEvent, b: MidiTrackEvent): number {
  return (
    a.tick - b.tick ||
    eventKindOrder(a.kind) - eventKindOrder(b.kind) ||
    (a.pitch ?? -1) - (b.pitch ?? -1) ||
    (a.roleOrder ?? -1) - (b.roleOrder ?? -1) ||
    a.order - b.order
  );
}

function validateProjection(projection: MidiProjection): void {
  assertUInt(projection.ppq, 0x7fff, "PPQ");
  if (projection.ppq === 0) throw new RangeError("PPQ must be positive");
  if (!Number.isFinite(projection.tempoBpm) || projection.tempoBpm <= 0) {
    throw new RangeError("tempoBpm must be positive");
  }
  assertUInt(projection.meter.numerator, 0x7f, "meter numerator");
  if (![1, 2, 4, 8, 16, 32].includes(projection.meter.denominator)) {
    throw new RangeError("unsupported meter denominator");
  }
  assertUInt(projection.totalTicks, MIDI_MAX_VLQ, "totalTicks");
  for (const note of projection.notes) {
    assertUInt(note.channel, 15, "MIDI channel");
    assertUInt(note.pitch, 127, "MIDI pitch");
    if (!Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) {
      throw new RangeError("MIDI velocity must be an integer in 1..127");
    }
    assertUInt(note.startTick, projection.totalTicks, "note start tick");
    assertUInt(note.endTick, projection.totalTicks, "note end tick");
    if (note.endTick <= note.startTick)
      throw new RangeError("MIDI notes must have positive duration");
  }
  if (projection.melody) {
    assertUInt(projection.melody.program, 127, "Melody MIDI program");
    assertUInt(projection.melody.volume, 127, "Melody Track Volume");
    for (const note of projection.melody.notes) {
      if (note.channel !== 2) throw new RangeError("Melody MIDI channel must be 2");
      assertUInt(note.pitch, 127, "MIDI pitch");
      if (!Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) {
        throw new RangeError("MIDI velocity must be an integer in 1..127");
      }
      assertUInt(note.startTick, projection.totalTicks, "note start tick");
      assertUInt(note.endTick, projection.totalTicks, "note end tick");
      if (note.endTick <= note.startTick)
        throw new RangeError("MIDI notes must have positive duration");
    }
  }
}

interface TrackOptions {
  readonly notes: readonly (MidiProjectionNote | MidiProjectionMelodyNote)[];
  readonly includeTiming?: boolean;
  readonly trackName?: string;
  readonly instrumentName?: string;
  readonly channel?: number;
  readonly program?: number;
  readonly controllerVolume?: number;
}

function buildTrackEvents(
  projection: MidiProjection,
  options: TrackOptions,
): readonly MidiTrackEvent[] {
  const events: MidiTrackEvent[] = [];
  let order = 0;
  if (options.trackName) {
    events.push({ tick: 0, kind: "track-name", text: options.trackName, order: order++ });
  }
  if (options.instrumentName) {
    events.push({
      tick: 0,
      kind: "instrument-name",
      text: options.instrumentName,
      order: order++,
    });
  }
  if (options.channel !== undefined) {
    events.push({
      tick: 0,
      kind: "channel-prefix",
      channel: options.channel,
      order: order++,
    });
  }
  if (options.includeTiming) {
    events.push({ tick: 0, kind: "tempo", order: order++ });
    events.push({ tick: 0, kind: "meter", order: order++ });
  }
  if (options.program !== undefined && options.channel !== undefined) {
    events.push({
      tick: 0,
      kind: "program-change",
      channel: options.channel,
      program: options.program,
      order: order++,
    });
  }
  if (options.controllerVolume !== undefined && options.channel !== undefined) {
    events.push({
      tick: 0,
      kind: "control-change",
      channel: options.channel,
      controller: 7,
      value: options.controllerVolume,
      order: order++,
    });
  }
  for (const note of options.notes) {
    events.push({
      tick: note.startTick,
      kind: "note-on",
      channel: options.channel ?? note.channel,
      pitch: note.pitch,
      velocity: note.velocity,
      roleOrder: roleOrder(note),
      order: order++,
    });
    events.push({
      tick: note.endTick,
      kind: "note-off",
      channel: options.channel ?? note.channel,
      pitch: note.pitch,
      velocity: 0,
      roleOrder: roleOrder(note),
      order: order++,
    });
  }
  events.push({ tick: projection.totalTicks, kind: "eot", order: order });
  return Object.freeze(events.sort(compareEvents));
}

function encodeTextMeta(track: number[], metaType: number, value: string): void {
  const bytes = [...value].map((character) => character.charCodeAt(0));
  track.push(0xff, metaType, ...encodeVlq(bytes.length), ...bytes);
}

function encodeTrack(projection: MidiProjection, options: TrackOptions): Uint8Array {
  const events = buildTrackEvents(projection, options);
  const track: number[] = [];
  let previousTick = 0;
  const microsecondsPerQuarter = Math.min(
    0xffffff,
    Math.max(1, Math.round(60_000_000 / projection.tempoBpm)),
  );
  const denominatorPower = Math.round(Math.log2(projection.meter.denominator));

  for (const event of events) {
    const delta = event.tick - previousTick;
    if (delta < 0) throw new RangeError("MIDI events must be sorted by absolute tick");
    track.push(...encodeVlq(delta));
    switch (event.kind) {
      case "track-name":
        encodeTextMeta(track, 0x03, event.text!);
        break;
      case "instrument-name":
        encodeTextMeta(track, 0x04, event.text!);
        break;
      case "channel-prefix":
        track.push(0xff, 0x20, 0x01, event.channel!);
        break;
      case "tempo":
        track.push(0xff, 0x51, 0x03);
        pushU24(track, microsecondsPerQuarter);
        break;
      case "meter":
        track.push(0xff, 0x58, 0x04, projection.meter.numerator, denominatorPower, 24, 8);
        break;
      case "program-change":
        track.push(0xc0 | event.channel!, event.program!);
        break;
      case "control-change":
        track.push(0xb0 | event.channel!, event.controller!, event.value!);
        break;
      case "note-on":
        track.push(0x90 | event.channel!, event.pitch!, event.velocity!);
        break;
      case "note-off":
        track.push(0x80 | event.channel!, event.pitch!, 0);
        break;
      case "eot":
        track.push(0xff, 0x2f, 0x00);
        break;
    }
    previousTick = event.tick;
  }

  if (track.length > MIDI_MAX_CHUNK_LENGTH) throw new RangeError("MIDI track is too large");
  const chunk: number[] = [];
  pushAscii(chunk, "MTrk");
  pushU32(chunk, track.length);
  chunk.push(...track);
  return Uint8Array.from(chunk);
}

/** Writes a deterministic SMF format-0 file with one piano track. */
export function writeStandardMidiFile(projection: MidiProjection): Uint8Array {
  validateProjection(projection);
  const track = encodeTrack(projection, {
    notes: projection.notes,
    includeTiming: true,
  });
  const header: number[] = [];
  pushAscii(header, "MThd");
  pushU32(header, 6);
  pushU16(header, 0);
  pushU16(header, 1);
  pushU16(header, projection.ppq);
  return Uint8Array.from([...header, ...track]);
}

/**
 * Writes a notation-friendly SMF format-1 file.
 *
 * MIDI has no portable clef event. Separate, named upper and bass tracks give
 * notation importers the pitch range and semantic role needed to choose treble
 * and bass clefs correctly instead of guessing from one mixed format-0 track.
 */
export function writeMidiFile(projection: MidiProjection): Uint8Array {
  validateProjection(projection);
  const conductorTrack = encodeTrack(projection, {
    notes: [],
    includeTiming: true,
    trackName: "CadenceFlow Conductor",
  });
  const melodyTrack = projection.melody
    ? encodeTrack(projection, {
        notes: projection.melody.notes,
        trackName: "CadenceFlow Melody",
        instrumentName: projection.melody.instrumentName,
        channel: 2,
        program: projection.melody.program,
        controllerVolume: projection.melody.volume,
      })
    : undefined;
  const upperTrack = encodeTrack(projection, {
    notes: projection.notes.filter((note) => note.role === "upper"),
    trackName: "CadenceFlow Chords",
    instrumentName: "Acoustic Grand Piano",
    channel: 0,
    program: 0,
  });
  const bassTrack = encodeTrack(projection, {
    notes: projection.notes.filter((note) => note.role === "bass"),
    trackName: "CadenceFlow Bass",
    instrumentName: "Acoustic Grand Piano",
    channel: 1,
    program: 0,
  });
  const header: number[] = [];
  pushAscii(header, "MThd");
  pushU32(header, 6);
  pushU16(header, 1);
  pushU16(header, projection.melody ? 4 : 3);
  pushU16(header, projection.ppq);
  return Uint8Array.from([
    ...header,
    ...conductorTrack,
    ...(melodyTrack ? [...melodyTrack] : []),
    ...upperTrack,
    ...bassTrack,
  ]);
}
