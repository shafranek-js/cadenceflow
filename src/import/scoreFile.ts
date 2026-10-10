import { MELODY_INSTRUMENT_CATALOG } from "../domain/melody/instrumentCatalog";
import type { MelodyInstrumentId } from "../domain/melody/instrumentCatalog";
import { exactPitch, type ExactPitch } from "../domain/harmony/pitch";
import { meter, type Meter } from "../domain/timing/meter";
import {
  rational,
  addRational,
  subtractRational,
  compareRational,
  ZERO,
  type Rational,
} from "../domain/timing/rational";

export interface ImportedNote {
  readonly pitch: ExactPitch;
  readonly onset: Rational;
  readonly duration: Rational;
}
export interface ImportedInstrument {
  readonly id: string;
  readonly name: string;
  readonly instrument: MelodyInstrumentId;
  readonly notes: readonly ImportedNote[];
  readonly endBeats: Rational;
  readonly unavailableReason?: string;
  readonly warnings?: readonly string[];
}
export interface ImportedScore {
  readonly instruments: readonly ImportedInstrument[];
  readonly tempoBpm: number;
  readonly meter: Meter;
  readonly warnings?: readonly string[];
  readonly title?: string;
  readonly tonic?: number;
}
const LIMIT = 100_000;
const EVENT_LIMIT = 400_000;
export const MAX_XML_BYTES = 10 * 1024 * 1024;
export function parseSafeXml(text: string): Document {
  if (new TextEncoder().encode(text).length > MAX_XML_BYTES)
    fail("XML files must be smaller than 10 MB.");
  if (/<!ENTITY\b|<!DOCTYPE\s+[^>]*\[/i.test(text))
    fail("XML entities and internal document type declarations are not allowed.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) fail("Invalid XML document.");
  const pending: { element: Element; depth: number }[] = [
    { element: doc.documentElement, depth: 1 },
  ];
  let elements = 0;
  while (pending.length) {
    const { element, depth } = pending.pop()!;
    if (depth > 128 || ++elements > 2_000_000) fail("XML structure exceeds the supported limits.");
    for (const child of Array.from(element.children))
      pending.push({ element: child, depth: depth + 1 });
  }
  return doc;
}
function fail(message: string): never {
  throw new Error(message);
}
function gm(program: number) {
  return (
    MELODY_INSTRUMENT_CATALOG.find((entry) => entry.program === program) ??
    MELODY_INSTRUMENT_CATALOG[0]!
  );
}
function midiPitch(midi: number): ExactPitch {
  const spellings: readonly [ExactPitch["spelling"]["step"], number][] = [
    ["C", 0],
    ["C", 1],
    ["D", 0],
    ["D", 1],
    ["E", 0],
    ["F", 0],
    ["F", 1],
    ["G", 0],
    ["G", 1],
    ["A", 0],
    ["A", 1],
    ["B", 0],
  ];
  const [step, alter] = spellings[((midi % 12) + 12) % 12]!;
  return exactPitch(midi, { step, alter });
}
export function parseMidi(bytes: Uint8Array): ImportedScore {
  let cursor = 0;
  const take = (length: number) => {
    if (!Number.isSafeInteger(length) || length < 0 || cursor + length > bytes.length)
      fail("Truncated MIDI file.");
    const result = bytes.subarray(cursor, cursor + length);
    cursor += length;
    return result;
  };
  const number = (length: number) =>
    Array.from(take(length)).reduce((value, byte) => value * 256 + byte, 0);
  const tag = () => String.fromCharCode(...take(4));
  if (tag() !== "MThd" || number(4) !== 6) fail("Invalid MIDI header.");
  const format = number(2),
    tracks = number(2),
    division = number(2);
  if (format > 1) fail("MIDI format 2 is not supported; export a format 0 or 1 file.");
  if (!division || division & 0x8000)
    fail("SMPTE MIDI timing is not supported; export beat-based MIDI.");
  if (!tracks || tracks > 1024) fail("Invalid MIDI track count.");
  let tempoBpm = 120,
    scoreMeter = meter(4, 4),
    eventCount = 0,
    expression = false,
    noteCount = 0;
  const instruments: ImportedInstrument[] = [];
  const tempoEvents: { tick: number; value: number }[] = [];
  const meterEvents: { tick: number; value: Meter }[] = [];
  const programEvents: {
    tick: number;
    channel: number;
    program: number;
    order: number;
    track: number;
  }[] = [];
  const trackNotes: {
    track: number;
    name: string;
    end: number;
    notes: { tick: number; order: number; channel: number; note: ImportedNote }[];
    percussion: boolean;
  }[] = [];
  for (let track = 0; track < tracks; track++) {
    if (tag() !== "MTrk") fail("Invalid MIDI track.");
    const data = take(number(4));
    let p = 0,
      tick = 0,
      running = 0,
      trackName = "";
    const read = () => {
      const value = data[p++];
      if (value === undefined) fail("Truncated MIDI event.");
      return value;
    };
    const vlq = () => {
      let value = 0;
      for (let i = 0; i < 4; i++) {
        const byte = read();
        value = value * 128 + (byte & 127);
        if (!(byte & 128)) return value;
      }
      return fail("Invalid MIDI event length.");
    };
    const notes: { tick: number; order: number; channel: number; note: ImportedNote }[] = [];
    const active = new Map<string, { tick: number; order: number }[]>();
    let percussion = false,
      ended = false;
    while (p < data.length) {
      if (++eventCount > EVENT_LIMIT) fail("MIDI file contains too many events.");
      tick += vlq();
      let status = read();
      if (status < 128) {
        p--;
        status = running;
        if (!status) fail("Invalid MIDI running status.");
      } else if (status < 240) running = status;
      if (status === 255 || status === 240 || status === 247) {
        running = 0;
        const type = status === 255 ? read() : -1,
          length = vlq();
        if (p + length > data.length) fail("Truncated MIDI metadata.");
        const payload = data.subarray(p, p + length);
        p += length;
        if (type === 3) trackName = new TextDecoder().decode(payload).trim();
        if (type === 47) {
          if (length !== 0 || p !== data.length) fail("Invalid MIDI end-of-track event.");
          ended = true;
        }
        if (type === 81 && length !== 3) fail("Invalid MIDI tempo event.");
        if (type === 88 && length !== 4) fail("Invalid MIDI time signature event.");
        if (type === 81 && length === 3) {
          const micros = payload[0]! * 65536 + payload[1]! * 256 + payload[2]!;
          if (!micros) fail("Invalid MIDI tempo.");
          tempoEvents.push({ tick, value: 60_000_000 / micros });
        }
        if (type === 88 && length >= 2) {
          const next = meter(payload[0]!, (2 ** payload[1]!) as Meter["denominator"]);
          meterEvents.push({ tick, value: next });
        }
        continue;
      }
      if (status >= 240) fail("Unsupported MIDI system event.");
      const kind = status >> 4,
        channel = status & 15,
        a = read(),
        b = kind === 12 || kind === 13 ? 0 : read();
      if (a >= 128 || b >= 128) fail("Invalid MIDI channel data.");
      if (kind === 11 || kind === 14 || (kind === 9 && b !== 0 && b !== 80)) expression = true;
      if (kind === 12) {
        programEvents.push({ tick, channel, program: a, order: eventCount, track });
        continue;
      }
      if (kind !== 8 && kind !== 9) continue;
      if (channel === 9) {
        percussion = true;
        continue;
      }
      const key = `${channel}:${a}`;
      if (kind === 9 && b > 0) {
        const stack = active.get(key) ?? [];
        stack.push({ tick, order: eventCount });
        active.set(key, stack);
      } else {
        const start = active.get(key)?.shift();
        if (start === undefined) fail("MIDI note-off has no matching note-on.");
        if (tick <= start.tick) fail("MIDI note has no positive duration.");
        if (++noteCount > LIMIT) fail("MIDI file contains too many notes.");
        notes.push({
          tick: start.tick,
          order: start.order,
          channel,
          note: {
            pitch: midiPitch(a),
            onset: rational(start.tick, division),
            duration: rational(tick - start.tick, division),
          },
        });
      }
    }
    if (Array.from(active.values()).some((notes) => notes.length))
      fail("MIDI file contains notes without a matching note-off.");
    if (!ended) fail("MIDI track is missing an end-of-track event.");
    trackNotes.push({ track, name: trackName, end: tick, notes, percussion });
  }
  tempoEvents.sort((a, b) => a.tick - b.tick);
  const initialTempo = tempoEvents.find((event) => event.tick === 0)?.value;
  for (const event of tempoEvents) {
    if (event.tick > 0 && Math.abs(event.value - tempoBpm) > 0.001)
      fail("Tempo changes are not supported. Export with a constant tempo.");
    if (
      event.tick === 0 &&
      initialTempo !== undefined &&
      Math.abs(initialTempo - event.value) > 0.001
    )
      fail("Conflicting MIDI tempo declarations.");
    tempoBpm = event.value;
  }
  meterEvents.sort((a, b) => a.tick - b.tick);
  if (
    meterEvents.some(
      (event) =>
        event.tick === 0 &&
        (event.value.numerator !== meterEvents[0]!.value.numerator ||
          event.value.denominator !== meterEvents[0]!.value.denominator),
    )
  )
    fail("Conflicting MIDI time signature declarations.");
  for (const event of meterEvents) {
    if (
      event.tick > 0 &&
      (event.value.numerator !== scoreMeter.numerator ||
        event.value.denominator !== scoreMeter.denominator)
    )
      fail("Meter changes are not supported. Export with a constant time signature.");
    scoreMeter = event.value;
  }
  const metadataTracks = new Set(
    trackNotes.filter((item) => !item.notes.length && !item.percussion).map((item) => item.track),
  );
  // Initial/channel setup in conductor tracks applies before same-tick notes,
  // regardless of the physical order of track chunks in a format 1 file.
  for (const event of programEvents) if (metadataTracks.has(event.track)) event.order = -1;
  programEvents.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const programsByChannel = Array.from({ length: 16 }, (_, channel) =>
    programEvents.filter((event) => event.channel === channel),
  );
  for (const item of trackNotes) {
    const groups = new Map<string, { channel: number; program: number; notes: ImportedNote[] }>();
    for (const source of item.notes) {
      const events = programsByChannel[source.channel]!;
      let lo = 0,
        hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1,
          event = events[mid]!;
        if (event.tick < source.tick || (event.tick === source.tick && event.order <= source.order))
          lo = mid + 1;
        else hi = mid;
      }
      const program = events[lo - 1]?.program ?? 0;
      const key = `${source.channel}:${program}`;
      if (!groups.has(key)) groups.set(key, { channel: source.channel, program, notes: [] });
      groups.get(key)!.notes.push(source.note);
    }
    for (const [key, group] of groups) {
      const entry = gm(group.program);
      instruments.push({
        id: `${item.track}:${key}`,
        name: `${item.name || `Track ${item.track + 1}`} — ${entry.label} (channel ${group.channel + 1})`,
        instrument: entry.id,
        notes: group.notes.sort((a, b) => compareRational(a.onset, b.onset)),
        endBeats: rational(item.end, division),
      });
    }
    if (item.percussion)
      instruments.push({
        id: `${item.track}:percussion`,
        name: `${item.name || `Track ${item.track + 1}`} — Percussion (channel 10)`,
        instrument: gm(0).id,
        notes: [],
        endBeats: rational(item.end, division),
        unavailableReason: "Unpitched percussion is not supported by the melody importer.",
      });
  }
  if (!instruments.some((item) => !item.unavailableReason && item.notes.length))
    fail("The MIDI file contains no supported pitched instruments.");
  return {
    instruments,
    tempoBpm,
    meter: scoreMeter,
    warnings: expression
      ? [
          "Note velocities, pedal, pitch bend and controller expression are not imported. Pitches and written note durations are preserved.",
        ]
      : [],
  };
}

export function parseMusicXml(text: string): ImportedScore {
  const doc = parseSafeXml(text);
  if (doc.documentElement.localName !== "score-partwise")
    fail("Only score-partwise MusicXML is supported.");
  const children = (parent: Element, name: string) =>
    Array.from(parent.children).filter((child) => child.localName === name);
  const child = (parent: Element, name: string) => children(parent, name)[0];
  const value = (parent: Element, name: string) => child(parent, name)?.textContent?.trim() ?? "";
  const integer = (raw: string, label: string) => {
    const n = Number(raw);
    if (!raw || !Number.isSafeInteger(n)) fail(`Invalid MusicXML ${label}.`);
    return n;
  };
  let scoreMeter = meter(4, 4),
    meterSeen = false,
    tempoBpm = 120,
    tempoSeen = false,
    count = 0;
  const instruments: ImportedInstrument[] = [];
  const warnings = new Set<string>();
  if (
    doc.querySelector("repeat, ending, segno, coda, sound[dacapo], sound[dalsegno], sound[tocoda]")
  )
    warnings.add(
      "Written measures are imported once in file order. Repeats, endings, D.C. and D.S. are not expanded.",
    );
  if (doc.querySelector("dynamics, articulations, ornaments, pedal, sound[dynamics]"))
    warnings.add(
      "Dynamics, articulation, ornamentation and pedal are not imported. Pitches and written note durations are preserved.",
    );
  let tonic: number | undefined;
  const title =
    doc.querySelector("work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim();
  for (const part of children(doc.documentElement, "part")) {
    const definition = Array.from(doc.querySelectorAll("score-part")).find(
      (item) => item.getAttribute("id") === part.getAttribute("id"),
    );
    const defs = definition ? children(definition, "score-instrument") : [];
    const partName = definition ? value(definition, "part-name") : "";
    if (
      part.querySelector("grace") ||
      Array.from(part.querySelectorAll("pitch > alter")).some(
        (element) => !Number.isInteger(Number(element.textContent)),
      )
    ) {
      instruments.push({
        id: `${part.getAttribute("id")}:unsupported`,
        name: partName || "Unsupported part",
        instrument: gm(0).id,
        notes: [],
        endBeats: ZERO,
        unavailableReason: part.querySelector("grace")
          ? "Grace notes require explicit durations before import."
          : "Microtonal pitches are not supported.",
      });
      continue;
    }
    const groups = new Map<
      string,
      { name: string; instrument: MelodyInstrumentId; notes: ImportedNote[] }
    >();
    let divisions = 1,
      measureStart = ZERO,
      transpose = 0;
    const pendingTies = new Map<string, ImportedNote>();
    let partPercussion = false;
    let measureCount = 0;
    for (const measureElement of children(part, "measure")) {
      if (++measureCount > 10_000) fail("MusicXML exceeds 10000 measures.");
      let position = ZERO,
        lastOnset = ZERO,
        measureEnd = ZERO;
      for (const element of Array.from(measureElement.children)) {
        if (element.localName === "attributes") {
          const raw = value(element, "divisions");
          if (raw) {
            divisions = integer(raw, "divisions");
            if (divisions <= 0) fail("MusicXML divisions must be positive.");
          }
          const time = child(element, "time");
          if (time) {
            const next = meter(
              integer(value(time, "beats"), "beats"),
              integer(value(time, "beat-type"), "beat-type") as Meter["denominator"],
            );
            if (
              (meterSeen ||
                compareRational(measureStart, ZERO) > 0 ||
                compareRational(position, ZERO) > 0) &&
              (next.numerator !== scoreMeter.numerator ||
                next.denominator !== scoreMeter.denominator)
            )
              fail("Meter changes are not supported. Export with a constant time signature.");
            scoreMeter = next;
            meterSeen = true;
          }
          const transposition = child(element, "transpose");
          if (transposition)
            transpose =
              integer(value(transposition, "chromatic") || "0", "transposition") +
              12 * integer(value(transposition, "octave-change") || "0", "octave change");
          const key = child(element, "key");
          if (key) {
            const fifths = value(key, "fifths"),
              mode = value(key, "mode");
            if (
              !fifths ||
              !Number.isInteger(Number(fifths)) ||
              Number(fifths) < -7 ||
              Number(fifths) > 7 ||
              (mode && !["major", "minor"].includes(mode))
            )
              warnings.add(
                "This key signature cannot be represented in the harmonic palette; imported note pitches are unchanged.",
              );
            else {
              const next = (((Number(fifths) * 7 + (mode === "minor" ? 9 : 0)) % 12) + 12) % 12;
              if (compareRational(measureStart, ZERO) === 0 && tonic === undefined) tonic = next;
              else if (tonic !== next)
                warnings.add(
                  "Key changes are not represented in the harmonic palette; imported note pitches are unchanged.",
                );
              if (!mode)
                warnings.add(
                  "The source key has no mode. Its major-key tonic is used for the harmonic palette; imported note pitches are unchanged.",
                );
              if (mode === "minor")
                warnings.add(
                  "The source minor-key tonic is preserved. The harmonic palette keeps its default mode; imported note pitches are unchanged.",
                );
            }
          }
        }
        if (element.localName === "direction") {
          const sound = child(element, "sound"),
            raw = sound?.getAttribute("tempo");
          const metronome = element.querySelector("metronome");
          let next = raw ? Number(raw) : NaN;
          if (!raw && metronome) {
            const unit = value(metronome, "beat-unit"),
              factors: Record<string, number> = {
                whole: 4,
                half: 2,
                quarter: 1,
                eighth: 0.5,
                "16th": 0.25,
              };
            const factor = factors[unit];
            if (!factor) fail("Unsupported MusicXML metronome beat unit.");
            next =
              Number(value(metronome, "per-minute")) *
              factor *
              (2 - 2 ** -children(metronome, "beat-unit-dot").length);
          }
          if (raw || metronome) {
            if (!Number.isFinite(next) || next <= 0) fail("Invalid MusicXML tempo.");
            if (
              (tempoSeen ||
                compareRational(measureStart, ZERO) > 0 ||
                compareRational(position, ZERO) > 0) &&
              Math.abs(next - tempoBpm) > 0.001
            )
              fail("Tempo changes are not supported. Export with a constant tempo.");
            tempoBpm = next;
            tempoSeen = true;
          }
        }
        if (element.localName === "backup" || element.localName === "forward") {
          const delta = rational(integer(value(element, "duration"), "duration"), divisions);
          if (compareRational(delta, ZERO) < 0) fail("Invalid MusicXML duration.");
          position =
            element.localName === "backup"
              ? subtractRational(position, delta)
              : addRational(position, delta);
          if (compareRational(position, ZERO) < 0) fail("Invalid MusicXML voice position.");
          if (compareRational(position, measureEnd) > 0) measureEnd = position;
        }
        if (element.localName !== "note") continue;
        if (++count > LIMIT) fail("MusicXML contains too many notes.");
        if (child(element, "grace")) fail("Grace notes require explicit durations before import.");
        const duration = rational(integer(value(element, "duration"), "note duration"), divisions);
        if (compareRational(duration, ZERO) <= 0) fail("MusicXML note duration must be positive.");
        const chord = Boolean(child(element, "chord")),
          onset = chord ? lastOnset : position;
        if (!chord) {
          lastOnset = position;
          position = addRational(position, duration);
        }
        const noteEnd = addRational(onset, duration);
        if (compareRational(noteEnd, measureEnd) > 0) measureEnd = noteEnd;
        if (child(element, "rest")) continue;
        const pitch = child(element, "pitch");
        if (!pitch) {
          if (child(element, "unpitched")) {
            partPercussion = true;
            continue;
          }
          fail("MusicXML note has no pitch.");
        }
        const step = value(pitch, "step") as ExactPitch["spelling"]["step"],
          octave = integer(value(pitch, "octave"), "octave"),
          alter = integer(value(pitch, "alter") || "0", "alteration");
        const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        if (!(step in semitones)) fail("Invalid MusicXML pitch step.");
        const midi = (octave + 1) * 12 + semitones[step]! + alter + transpose;
        const instrumentId =
          child(element, "instrument")?.getAttribute("id") ??
          defs[0]?.getAttribute("id") ??
          "default";
        if (defs.length && !defs.some((item) => item.getAttribute("id") === instrumentId))
          fail("MusicXML references an unknown instrument.");
        if (!groups.has(instrumentId)) {
          const instrumentDef = defs.find((item) => item.getAttribute("id") === instrumentId);
          const midiDef = definition
            ? children(definition, "midi-instrument").find(
                (item) => item.getAttribute("id") === instrumentId,
              )
            : undefined;
          const raw = midiDef ? value(midiDef, "midi-program") : "",
            program = raw ? integer(raw, "MIDI program") - 1 : 0;
          if (program < 0 || program > 127) fail("Invalid MusicXML MIDI program.");
          if (!raw)
            warnings.add(
              "An instrument has no General MIDI program. Acoustic Grand Piano is used for playback.",
            );
          const partName = definition ? value(definition, "part-name") : "",
            instrumentName = instrumentDef ? value(instrumentDef, "instrument-name") : "";
          groups.set(instrumentId, {
            name:
              defs.length > 1
                ? `${partName || "Part"} — ${instrumentName || instrumentId}`
                : partName || instrumentName || `Part ${instruments.length + groups.size + 1}`,
            instrument: gm(program).id,
            notes: [],
          });
        }
        const absolute = addRational(measureStart, onset),
          note: ImportedNote = {
            pitch: transpose ? midiPitch(midi) : exactPitch(midi, { step, alter }),
            onset: absolute,
            duration,
          };
        const tieKey = `${instrumentId}:${value(element, "voice") || "1"}:${value(element, "staff") || "1"}:${midi}`;
        const ties = children(element, "tie"),
          stop = ties.some((tie) => tie.getAttribute("type") === "stop"),
          start = ties.some((tie) => tie.getAttribute("type") === "start");
        const previous = stop ? pendingTies.get(tieKey) : undefined;
        if (stop && !previous) fail("MusicXML tie stop has no matching start.");
        if (previous) {
          const end = addRational(previous.onset, previous.duration);
          if (compareRational(end, absolute) !== 0) fail("MusicXML tie timing is inconsistent.");
          const merged = { ...previous, duration: addRational(previous.duration, duration) };
          const notes = groups.get(instrumentId)!.notes;
          notes[notes.indexOf(previous)] = merged;
          if (start) pendingTies.set(tieKey, merged);
          else pendingTies.delete(tieKey);
        } else {
          groups.get(instrumentId)!.notes.push(note);
          if (start) pendingTies.set(tieKey, note);
        }
      }
      const bar = rational(scoreMeter.numerator * 4, scoreMeter.denominator);
      if (compareRational(measureEnd, ZERO) > 0 && compareRational(measureEnd, bar) !== 0)
        warnings.add(
          "Pickup or irregular measures preserve their exact note timing. The new project groups this timeline into regular measures, so original bar boundaries may differ.",
        );
      measureStart = addRational(
        measureStart,
        compareRational(measureEnd, ZERO) > 0 ? measureEnd : bar,
      );
    }
    if (pendingTies.size) fail("MusicXML contains unfinished ties.");
    for (const [id, group] of groups)
      if (group.notes.length)
        instruments.push({
          id: `${part.getAttribute("id")}:${id}`,
          ...group,
          endBeats: measureStart,
        });
    if (partPercussion)
      instruments.push({
        id: `${part.getAttribute("id")}:percussion`,
        name: `${partName || "Part"} — Unpitched percussion`,
        instrument: gm(0).id,
        notes: [],
        endBeats: measureStart,
        unavailableReason: "Unpitched percussion is not supported by the melody importer.",
      });
  }
  if (!instruments.some((item) => !item.unavailableReason && item.notes.length))
    fail(
      "The MusicXML file contains no supported pitched instruments. Unpitched percussion, grace notes and microtonal parts cannot be imported.",
    );
  return {
    instruments,
    tempoBpm,
    meter: scoreMeter,
    warnings: [...warnings],
    ...(title ? { title } : {}),
    ...(tonic === undefined ? {} : { tonic }),
  };
}
export async function readScoreFile(file: File): Promise<ImportedScore> {
  if (file.size > 10 * 1024 * 1024) fail("Score files must be smaller than 10 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mid" || extension === "midi")
    return parseMidi(new Uint8Array(await file.arrayBuffer()));
  if (extension === "xml" || extension === "musicxml") return parseMusicXml(await file.text());
  if (extension === "mxl") {
    const { parseMxl } = await import("./mxl");
    return parseMxl(new Uint8Array(await file.arrayBuffer()));
  }
  return fail("Choose a .mid, .midi, .musicxml, .xml or .mxl file.");
}
