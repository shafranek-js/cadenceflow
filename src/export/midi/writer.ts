import type { MidiProjection, MidiProjectionNote } from "./eventProjection";

const MIDI_MAX_VLQ = 0x0fffffff;
const MIDI_MAX_CHUNK_LENGTH = 0xffffffff;

interface MidiTrackEvent {
  readonly tick: number;
  readonly kind: "tempo" | "meter" | "note-off" | "note-on" | "eot";
  readonly channel?: number;
  readonly pitch?: number;
  readonly velocity?: number;
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
    case "tempo":
    case "meter":
      return 0;
    case "note-off":
      return 1;
    case "note-on":
      return 2;
    case "eot":
      return 3;
  }
}

function roleOrder(note: MidiProjectionNote): number {
  return note.role === "bass" ? 0 : 1;
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
}

function buildTrackEvents(projection: MidiProjection): readonly MidiTrackEvent[] {
  const events: MidiTrackEvent[] = [
    { tick: 0, kind: "tempo", order: 0 },
    { tick: 0, kind: "meter", order: 1 },
  ];
  let order = 2;
  for (const note of projection.notes) {
    events.push({
      tick: note.startTick,
      kind: "note-on",
      channel: note.channel,
      pitch: note.pitch,
      velocity: note.velocity,
      roleOrder: roleOrder(note),
      order: order++,
    });
    events.push({
      tick: note.endTick,
      kind: "note-off",
      channel: note.channel,
      pitch: note.pitch,
      velocity: 0,
      roleOrder: roleOrder(note),
      order: order++,
    });
  }
  events.push({ tick: projection.totalTicks, kind: "eot", order: order });
  return Object.freeze(events.sort(compareEvents));
}

function encodeTrack(projection: MidiProjection): Uint8Array {
  const events = buildTrackEvents(projection);
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
      case "tempo":
        track.push(0xff, 0x51, 0x03);
        pushU24(track, microsecondsPerQuarter);
        break;
      case "meter":
        track.push(0xff, 0x58, 0x04, projection.meter.numerator, denominatorPower, 24, 8);
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
  const track = encodeTrack(projection);
  const header: number[] = [];
  pushAscii(header, "MThd");
  pushU32(header, 6);
  pushU16(header, 0);
  pushU16(header, 1);
  pushU16(header, projection.ppq);
  return Uint8Array.from([...header, ...track]);
}

export const writeMidiFile = writeStandardMidiFile;
