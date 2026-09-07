import type {
  MusicXmlDirectionEvent,
  MusicXmlHarmonyEvent,
  MusicXmlMeasureEvent,
  MusicXmlNoteEvent,
  MusicXmlProjection,
  MusicXmlRestEvent,
} from "./projection";

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

function element(name: string, value: string | number, level: number): string {
  const indent = "  ".repeat(level);
  return `${indent}<${name}>${escapeXml(String(value))}</${name}>`;
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
  if (event.voice !== "1") {
    throw new MusicXmlWriterError(`unsupported MusicXML voice on ${event.stepId}.`);
  }
}

function validateRest(event: MusicXmlRestEvent): void {
  assertInteger(event.duration, `duration for ${event.stepId}`, 1);
  if (event.voice !== "1") {
    throw new MusicXmlWriterError(`unsupported MusicXML voice on ${event.stepId}.`);
  }
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
  lines.push(emptyElement("clef", level + 1));
  lines.push(element("sign", attributes.clef.sign, level + 2));
  lines.push(element("line", attributes.clef.line, level + 2));
  lines.push(closeElement("clef", level + 1));
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
  lines.push(
    `${"  ".repeat(level + 1)}<kind${xmlAttribute("text", harmony.text)}>${escapeXml(harmony.kind)}</kind>`,
  );
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
  lines.push(...writeNotations(event, level + 1));
  lines.push(closeElement("note", level));
  return lines;
}

function writeRest(event: MusicXmlRestEvent, level: number): string[] {
  const lines = [emptyElement("note", level)];
  lines.push(selfClosingElement("rest", level + 1));
  lines.push(element("duration", event.duration, level + 1));
  lines.push(element("voice", event.voice, level + 1));
  lines.push(closeElement("note", level));
  return lines;
}

function writeMeasureEvents(events: readonly MusicXmlMeasureEvent[], level: number): string[] {
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
        lines.push(...writeNote(event, level));
        break;
      case "rest":
        lines.push(...writeRest(event, level));
        break;
    }
  }
  return lines;
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
    '    <score-part id="P1">',
    element("part-name", projection.part.name, 3),
    "    </score-part>",
    "  </part-list>",
    '  <part id="P1">',
  ];

  projection.measures.forEach((measure, index) => {
    lines.push(`    <measure${xmlAttribute("number", measure.number)}>`);
    if (index === 0) {
      lines.push(...writeAttributes(projection, 3));
      lines.push(...writeTempoDirection(projection, 3));
    }
    lines.push(...writeMeasureEvents(measure.events, 3));
    lines.push("    </measure>");
  });
  lines.push("  </part>", "</score-partwise>");
  return `${lines.join("\n")}\n`;
}

export function writeMusicXmlFile(projection: MusicXmlProjection): Uint8Array {
  return new TextEncoder().encode(writeMusicXml(projection));
}

export const writeMusicXmlDocument = writeMusicXml;
