import type {
  MusicXmlDirectionEvent,
  MusicXmlHarmonyEvent,
  MusicXmlMelodyMeasureEvent,
  MusicXmlMelodyNoteEvent,
  MusicXmlMelodyPart,
  MusicXmlMeasureEvent,
  MusicXmlNoteEvent,
  MusicXmlProjection,
  MusicXmlRestEvent,
} from "./projection";
import type { MelodyInstrument } from "../../domain/melody/types";

export class MusicXmlWriterError extends Error {
  readonly code = "invalid-projection" as const;

  constructor(message: string) {
    super(message);
    this.name = "MusicXmlWriterError";
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function element(name: string, value: string | number, level: number, attributes = ""): string {
  const indent = "  ".repeat(level);
  return `${indent}<${name}${attributes}>${escapeXml(String(value))}</${name}>`;
}

function emptyElement(name: string, level: number, attributes = ""): string {
  const indent = "  ".repeat(level);
  return `${indent}<${name}${attributes}>`;
}

function selfClosingElement(name: string, level: number, attributes = ""): string {
  const indent = "  ".repeat(level);
  return `${indent}<${name}${attributes}/>`;
}

function closeElement(name: string, level: number): string {
  return `${"  ".repeat(level)}</${name}>`;
}

function xmlAttribute(name: string, value: string | number): string {
  return ` ${name}="${escapeXml(String(value))}"`;
}

function assertInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new MusicXmlWriterError(`${label} must be a safe integer >= ${minimum}.`);
  }
}

function validateNote(event: MusicXmlNoteEvent): void {
  assertInteger(event.duration, `duration for ${event.stepId}`, 1);
  assertInteger(event.sourceMidi, `source MIDI for ${event.stepId}`, 0);
  if (event.sourceMidi > 127) {
    throw new MusicXmlWriterError(`source MIDI for ${event.stepId} must be <= 127.`);
  }
  if (!Number.isSafeInteger(event.pitch.octave)) {
    throw new MusicXmlWriterError(`octave for ${event.stepId} must be a safe integer.`);
  }
  if (!Number.isSafeInteger(event.pitch.alter)) {
    throw new MusicXmlWriterError(`alter for ${event.stepId} must be a safe integer.`);
  }
  if ((event.staff === 1 && event.voice !== "1") || (event.staff === 2 && event.voice !== "2")) {
    throw new MusicXmlWriterError(`voice and staff disagree on ${event.stepId}.`);
  }
}

function validateRest(event: MusicXmlRestEvent): void {
  assertInteger(event.duration, `duration for ${event.stepId}`, 1);
  if ((event.staff === 1 && event.voice !== "1") || (event.staff === 2 && event.voice !== "2")) {
    throw new MusicXmlWriterError(`voice and staff disagree on ${event.stepId}.`);
  }
}

function validateMelodyNote(event: MusicXmlMelodyNoteEvent): void {
  assertInteger(event.duration, `duration for ${event.stepId}`, 1);
  assertInteger(event.sourceMidi, `source MIDI for ${event.stepId}`, 0);
  assertInteger(event.sourcePitchMidi, `source pitch MIDI for ${event.stepId}`, 0);
  if (event.sourceMidi > 127 || event.sourcePitchMidi > 127) {
    throw new MusicXmlWriterError(`source MIDI for ${event.stepId} must be <= 127.`);
  }
  if (!Number.isSafeInteger(event.pitch.octave) || !Number.isSafeInteger(event.pitch.alter)) {
    throw new MusicXmlWriterError(`pitch for ${event.stepId} must contain safe integer values.`);
  }
  if (event.voice !== "1" || event.staff !== 1 || event.chord !== false) {
    throw new MusicXmlWriterError(
      `Melody note ${event.stepId} must use voice 1, staff 1, and no chord.`,
    );
  }
  if (!["quarter", "eighth", "16th"].includes(event.type)) {
    throw new MusicXmlWriterError(`Melody note ${event.stepId} has an invalid written type.`);
  }
  for (const tie of event.ties) {
    if (tie !== "start" && tie !== "stop") {
      throw new MusicXmlWriterError(`Melody note ${event.stepId} has an invalid tie.`);
    }
  }
  for (const mark of event.tupletMarks) {
    if (mark !== "start" && mark !== "stop") {
      throw new MusicXmlWriterError(`Melody note ${event.stepId} has an invalid tuplet mark.`);
    }
  }
  if (event.timeModification) {
    if (
      event.timeModification.actualNotes !== 3 ||
      event.timeModification.normalNotes !== 2 ||
      !["eighth", "16th"].includes(event.timeModification.normalType)
    ) {
      throw new MusicXmlWriterError(
        `Melody note ${event.stepId} has an invalid time modification.`,
      );
    }
  }
}

function validateMelodyRest(event: MusicXmlMelodyMeasureEvent & { readonly kind: "rest" }): void {
  assertInteger(event.duration, `duration for ${event.stepId}`, 1);
  if (event.voice !== "1" || event.staff !== 1) {
    throw new MusicXmlWriterError(`Melody rest ${event.stepId} must use voice 1 and staff 1.`);
  }
}

function validateMelodyPart(projection: MusicXmlProjection, melody: MusicXmlMelodyPart): void {
  if (
    !melody ||
    typeof melody !== "object" ||
    melody.id !== "P2" ||
    !melody.name ||
    melody.instrumentName !== melody.name
  ) {
    throw new MusicXmlWriterError(
      "MusicXML Melody part must be the deterministic P2 instrument part.",
    );
  }
  const metadata: Readonly<
    Record<MelodyInstrument, { readonly name: string; readonly program: number }>
  > = {
    flute: { name: "Flute", program: 73 },
    violin: { name: "Violin", program: 40 },
    clarinet: { name: "Clarinet", program: 71 },
    oboe: { name: "Oboe", program: 68 },
    cello: { name: "Cello", program: 42 },
    "synth-lead": { name: "Synth Lead", program: 80 },
  };
  const instrument = metadata[melody.instrument];
  if (
    !instrument ||
    melody.name !== instrument.name ||
    melody.instrumentName !== instrument.name ||
    melody.midiProgram !== instrument.program + 1
  ) {
    throw new MusicXmlWriterError("MusicXML Melody instrument metadata is not deterministic.");
  }
  if (melody.midiChannel !== 3) {
    throw new MusicXmlWriterError("MusicXML Melody must use one-based MIDI channel 3.");
  }
  assertInteger(melody.midiProgram, "Melody MIDI program", 1);
  if (melody.midiProgram > 128) {
    throw new MusicXmlWriterError("Melody MIDI program must be <= 128.");
  }
  const expectedClef =
    melody.instrument === "cello" ? { sign: "F", line: 4 } : { sign: "G", line: 2 };
  if (melody.clef.sign !== expectedClef.sign || melody.clef.line !== expectedClef.line) {
    throw new MusicXmlWriterError("Melody clef does not match its instrument.");
  }
  if (
    !Array.isArray(melody.measures) ||
    melody.measures.length !== projection.measures.length ||
    melody.measures.length === 0
  ) {
    throw new MusicXmlWriterError("MusicXML Melody must have one measure for every Piano measure.");
  }
  melody.measures.forEach((measure, index) => {
    if (measure.number !== index + 1) {
      throw new MusicXmlWriterError(
        "MusicXML Melody measures must be numbered consecutively from 1.",
      );
    }
    assertInteger(measure.capacity, `Melody capacity for measure ${measure.number}`, 1);
    let duration = 0;
    measure.events.forEach((event) => {
      if (event.kind === "note") validateMelodyNote(event);
      if (event.kind === "rest") validateMelodyRest(event);
      duration += event.duration;
    });
    if (duration !== measure.capacity) {
      throw new MusicXmlWriterError(
        `Melody measure ${measure.number} duration ${duration} does not equal capacity ${measure.capacity}.`,
      );
    }
  });
}

function validateProjection(projection: MusicXmlProjection): void {
  if (projection.version !== "4.0") {
    throw new MusicXmlWriterError("MusicXML projection version must be 4.0.");
  }
  if (!projection.title)
    throw new MusicXmlWriterError("MusicXML projection title cannot be empty.");
  if (projection.part.id !== "P1" || projection.part.name !== "Piano") {
    throw new MusicXmlWriterError("MusicXML writer only supports the deterministic P1 Piano part.");
  }
  assertInteger(projection.attributes.divisions, "divisions", 1);
  if (!Number.isFinite(projection.tempoBpm) || projection.tempoBpm <= 0) {
    throw new MusicXmlWriterError("tempoBpm must be positive and finite.");
  }
  if (projection.measures.length === 0) {
    throw new MusicXmlWriterError("MusicXML projection must contain at least one measure.");
  }

  projection.measures.forEach((measure, index) => {
    if (measure.number !== index + 1) {
      throw new MusicXmlWriterError("MusicXML measures must be numbered consecutively from 1.");
    }
    assertInteger(measure.capacity, `capacity for measure ${measure.number}`, 1);
    measure.events.forEach((event) => {
      if (event.kind === "note") validateNote(event);
      if (event.kind === "rest") validateRest(event);
    });
  });
  if (projection.melody) validateMelodyPart(projection, projection.melody);
}

function writeAttributes(projection: MusicXmlProjection, level: number): string[] {
  const attributes = projection.attributes;
  const lines = [emptyElement("attributes", level)];
  lines.push(element("divisions", attributes.divisions, level + 1));
  lines.push(emptyElement("key", level + 1));
  lines.push(element("fifths", attributes.key.fifths, level + 2));
  lines.push(element("mode", attributes.key.mode, level + 2));
  lines.push(closeElement("key", level + 1));
  lines.push(emptyElement("time", level + 1));
  lines.push(element("beats", attributes.time.beats, level + 2));
  lines.push(element("beat-type", attributes.time.denominator, level + 2));
  lines.push(closeElement("time", level + 1));
  lines.push(element("staves", attributes.staves, level + 1));
  lines.push(
    element(
      "part-symbol",
      "brace",
      level + 1,
      `${xmlAttribute("top-staff", 1)}${xmlAttribute("bottom-staff", 2)}`,
    ),
  );
  for (const clef of attributes.clefs) {
    lines.push(emptyElement("clef", level + 1, xmlAttribute("number", clef.number)));
    lines.push(element("sign", clef.sign, level + 2));
    lines.push(element("line", clef.line, level + 2));
    lines.push(closeElement("clef", level + 1));
  }
  lines.push(closeElement("attributes", level));
  return lines;
}

function writeTempoDirection(projection: MusicXmlProjection, level: number): string[] {
  const lines = [emptyElement("direction", level, xmlAttribute("placement", "above"))];
  lines.push(emptyElement("direction-type", level + 1));
  lines.push(emptyElement("metronome", level + 2));
  lines.push(element("beat-unit", "quarter", level + 3));
  lines.push(element("per-minute", projection.tempoBpm, level + 3));
  lines.push(closeElement("metronome", level + 2));
  lines.push(closeElement("direction-type", level + 1));
  lines.push(element("staff", 1, level + 1));
  lines.push(selfClosingElement("sound", level + 1, xmlAttribute("tempo", projection.tempoBpm)));
  lines.push(closeElement("direction", level));
  return lines;
}

function writeDynamicDirection(event: MusicXmlDirectionEvent, level: number): string[] {
  if (!event.dynamicLabel) return [];
  const lines = [emptyElement("direction", level, xmlAttribute("placement", "below"))];
  lines.push(emptyElement("direction-type", level + 1));
  lines.push(emptyElement("dynamics", level + 2));
  lines.push(selfClosingElement(event.dynamicLabel, level + 3));
  lines.push(closeElement("dynamics", level + 2));
  lines.push(closeElement("direction-type", level + 1));
  lines.push(element("staff", 1, level + 1));
  lines.push(closeElement("direction", level));
  return lines;
}

function writeHarmony(event: MusicXmlHarmonyEvent, level: number): string[] {
  const harmony = event.harmony;
  const lines = [emptyElement("harmony", level)];
  lines.push(emptyElement("root", level + 1));
  lines.push(element("root-step", harmony.root.step, level + 2));
  if (harmony.root.alter !== 0) lines.push(element("root-alter", harmony.root.alter, level + 2));
  lines.push(closeElement("root", level + 1));
  lines.push(element("kind", harmony.kind, level + 1));
  for (const degree of harmony.degrees) {
    lines.push(emptyElement("degree", level + 1));
    lines.push(element("degree-value", degree.value, level + 2));
    lines.push(element("degree-alter", degree.alter, level + 2));
    lines.push(element("degree-type", degree.type, level + 2));
    lines.push(closeElement("degree", level + 1));
  }
  lines.push(closeElement("harmony", level));
  return lines;
}

function writeTies(event: MusicXmlNoteEvent, level: number): string[] {
  const lines: string[] = [];
  for (const tie of event.ties) {
    lines.push(selfClosingElement("tie", level, xmlAttribute("type", tie)));
  }
  return lines;
}

function writeNotations(event: MusicXmlNoteEvent, level: number): string[] {
  if (event.ties.length === 0 && !event.arpeggiate) return [];
  const lines: string[] = [];
  lines.push(emptyElement("notations", level));
  for (const tie of event.ties) {
    lines.push(selfClosingElement("tied", level + 1, xmlAttribute("type", tie)));
  }
  if (event.arpeggiate) {
    const direction = event.arpeggiate === "arpeggiate-up" ? "up" : "down";
    lines.push(selfClosingElement("arpeggiate", level + 1, xmlAttribute("direction", direction)));
  }
  lines.push(closeElement("notations", level));
  return lines;
}

function writeNote(event: MusicXmlNoteEvent, level: number): string[] {
  const lines = [emptyElement("note", level)];
  if (event.chord) lines.push(selfClosingElement("chord", level + 1));
  lines.push(emptyElement("pitch", level + 1));
  lines.push(element("step", event.pitch.step, level + 2));
  if (event.pitch.alter !== 0) lines.push(element("alter", event.pitch.alter, level + 2));
  lines.push(element("octave", event.pitch.octave, level + 2));
  lines.push(closeElement("pitch", level + 1));
  lines.push(element("duration", event.duration, level + 1));
  lines.push(...writeTies(event, level + 1));
  lines.push(element("voice", event.voice, level + 1));
  lines.push(element("staff", event.staff, level + 1));
  lines.push(...writeNotations(event, level + 1));
  lines.push(closeElement("note", level));
  return lines;
}

function writeMelodyTies(event: MusicXmlMelodyNoteEvent, level: number): string[] {
  return event.ties.map((tie) => selfClosingElement("tie", level, xmlAttribute("type", tie)));
}

function writeMelodyNotations(event: MusicXmlMelodyNoteEvent, level: number): string[] {
  if (event.ties.length === 0 && event.tupletMarks.length === 0) return [];
  const lines = [emptyElement("notations", level)];
  for (const tie of event.ties) {
    lines.push(selfClosingElement("tied", level + 1, xmlAttribute("type", tie)));
  }
  for (const mark of event.tupletMarks) {
    lines.push(
      selfClosingElement(
        "tuplet",
        level + 1,
        `${xmlAttribute("type", mark)}${xmlAttribute("number", 1)}`,
      ),
    );
  }
  lines.push(closeElement("notations", level));
  return lines;
}

function writeMelodyNote(event: MusicXmlMelodyNoteEvent, level: number): string[] {
  const lines = [emptyElement("note", level)];
  lines.push(emptyElement("pitch", level + 1));
  lines.push(element("step", event.pitch.step, level + 2));
  if (event.pitch.alter !== 0) lines.push(element("alter", event.pitch.alter, level + 2));
  lines.push(element("octave", event.pitch.octave, level + 2));
  lines.push(closeElement("pitch", level + 1));
  lines.push(element("duration", event.duration, level + 1));
  lines.push(...writeMelodyTies(event, level + 1));
  lines.push(element("voice", event.voice, level + 1));
  lines.push(element("type", event.type, level + 1));
  if (event.timeModification) {
    lines.push(emptyElement("time-modification", level + 1));
    lines.push(element("actual-notes", event.timeModification.actualNotes, level + 2));
    lines.push(element("normal-notes", event.timeModification.normalNotes, level + 2));
    lines.push(element("normal-type", event.timeModification.normalType, level + 2));
    lines.push(closeElement("time-modification", level + 1));
  }
  lines.push(element("staff", event.staff, level + 1));
  lines.push(...writeMelodyNotations(event, level + 1));
  lines.push(closeElement("note", level));
  return lines;
}

function writeMelodyRest(
  event: MusicXmlMelodyMeasureEvent & { readonly kind: "rest" },
  level: number,
): string[] {
  const lines = [emptyElement("note", level)];
  lines.push(selfClosingElement("rest", level + 1));
  lines.push(element("duration", event.duration, level + 1));
  lines.push(element("voice", event.voice, level + 1));
  lines.push(element("staff", event.staff, level + 1));
  lines.push(closeElement("note", level));
  return lines;
}

function writeMelodyAttributes(
  projection: MusicXmlProjection,
  melody: MusicXmlMelodyPart,
  level: number,
): string[] {
  const attributes = projection.attributes;
  const lines = [emptyElement("attributes", level)];
  lines.push(element("divisions", attributes.divisions, level + 1));
  lines.push(emptyElement("key", level + 1));
  lines.push(element("fifths", attributes.key.fifths, level + 2));
  lines.push(element("mode", attributes.key.mode, level + 2));
  lines.push(closeElement("key", level + 1));
  lines.push(emptyElement("time", level + 1));
  lines.push(element("beats", attributes.time.beats, level + 2));
  lines.push(element("beat-type", attributes.time.denominator, level + 2));
  lines.push(closeElement("time", level + 1));
  lines.push(emptyElement("clef", level + 1));
  lines.push(element("sign", melody.clef.sign, level + 2));
  lines.push(element("line", melody.clef.line, level + 2));
  lines.push(closeElement("clef", level + 1));
  lines.push(closeElement("attributes", level));
  return lines;
}

function writeMelodyPart(
  projection: MusicXmlProjection,
  melody: MusicXmlMelodyPart,
  level: number,
): string[] {
  const lines = [emptyElement("part", level, xmlAttribute("id", melody.id))];
  melody.measures.forEach((measure, index) => {
    lines.push(`${"  ".repeat(level + 1)}<measure${xmlAttribute("number", measure.number)}>`);
    if (index === 0) lines.push(...writeMelodyAttributes(projection, melody, level + 2));
    for (const event of measure.events) {
      lines.push(
        ...(event.kind === "note"
          ? writeMelodyNote(event, level + 2)
          : writeMelodyRest(event, level + 2)),
      );
    }
    lines.push(`${"  ".repeat(level + 1)}</measure>`);
  });
  lines.push(closeElement("part", level));
  return lines;
}

function writeMelodyScorePart(melody: MusicXmlMelodyPart, level: number): string[] {
  const instrumentId = `${melody.id}-I1`;
  const lines = [emptyElement("score-part", level, xmlAttribute("id", melody.id))];
  lines.push(element("part-name", melody.name, level + 1));
  lines.push(emptyElement("score-instrument", level + 1, xmlAttribute("id", instrumentId)));
  lines.push(element("instrument-name", melody.instrumentName, level + 2));
  lines.push(closeElement("score-instrument", level + 1));
  lines.push(emptyElement("midi-instrument", level + 1, xmlAttribute("id", instrumentId)));
  lines.push(element("midi-channel", melody.midiChannel, level + 2));
  lines.push(element("midi-program", melody.midiProgram, level + 2));
  lines.push(closeElement("midi-instrument", level + 1));
  lines.push(closeElement("score-part", level));
  return lines;
}

function writeRest(event: MusicXmlRestEvent, level: number): string[] {
  const lines = [emptyElement("note", level)];
  lines.push(selfClosingElement("rest", level + 1));
  lines.push(element("duration", event.duration, level + 1));
  lines.push(element("voice", event.voice, level + 1));
  lines.push(element("staff", event.staff, level + 1));
  lines.push(closeElement("note", level));
  return lines;
}

function writeTrebleEvents(events: readonly MusicXmlMeasureEvent[], level: number): string[] {
  const lines: string[] = [];
  for (const event of events) {
    switch (event.kind) {
      case "direction":
        lines.push(...writeDynamicDirection(event, level));
        break;
      case "harmony":
        lines.push(...writeHarmony(event, level));
        break;
      case "note":
        if (event.staff === 1) lines.push(...writeNote(event, level));
        break;
      case "rest":
        if (event.staff === 1) lines.push(...writeRest(event, level));
        break;
    }
  }
  return lines;
}

function writeBassEvents(events: readonly MusicXmlMeasureEvent[], level: number): string[] {
  const lines: string[] = [];
  for (const event of events) {
    if (event.kind === "note" && event.staff === 2) lines.push(...writeNote(event, level));
    if (event.kind === "rest" && event.staff === 2) lines.push(...writeRest(event, level));
  }
  return lines;
}

function writeBackup(duration: number, level: number): string[] {
  return [
    emptyElement("backup", level),
    element("duration", duration, level + 1),
    closeElement("backup", level),
  ];
}

/** Serializes the MusicXML semantic projection without making musical decisions. */
export function writeMusicXml(projection: MusicXmlProjection): string {
  validateProjection(projection);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="4.0">',
    "  <work>",
    element("work-title", projection.title, 2),
    "  </work>",
    "  <part-list>",
    ...(projection.melody ? writeMelodyScorePart(projection.melody, 2) : []),
    '    <score-part id="P1">',
    element("part-name", projection.part.name, 3),
    "    </score-part>",
    "  </part-list>",
    ...(projection.melody ? writeMelodyPart(projection, projection.melody, 1) : []),
    '  <part id="P1">',
  ];

  projection.measures.forEach((measure, index) => {
    lines.push(`    <measure${xmlAttribute("number", measure.number)}>`);
    if (index === 0) {
      lines.push(...writeAttributes(projection, 3));
      lines.push(...writeTempoDirection(projection, 3));
    }
    lines.push(...writeTrebleEvents(measure.events, 3));
    lines.push(...writeBackup(measure.capacity, 3));
    lines.push(...writeBassEvents(measure.events, 3));
    lines.push("    </measure>");
  });
  lines.push("  </part>", "</score-partwise>");
  return `${lines.join("\n")}\n`;
}

export function writeMusicXmlFile(projection: MusicXmlProjection): Uint8Array {
  return new TextEncoder().encode(writeMusicXml(projection));
}

export const writeMusicXmlDocument = writeMusicXml;
