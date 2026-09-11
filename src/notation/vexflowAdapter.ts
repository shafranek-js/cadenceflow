import {
  Accidental,
  Beam,
  Formatter,
  Fraction,
  GhostNote,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Tuplet,
  Voice,
} from "vexflow";
import type { MusicalDuration } from "../domain/timing/duration";
import type { Meter } from "../domain/timing/meter";
import { rationalToNumber, type Rational } from "../domain/timing/rational";
import type { StaffProjectionDto } from "./staffProjection";

const STAFF_INK = "#000";
const STAFF_PLAYING_INK_FALLBACK = "#8a5732";
const STAFF_LINE_SPACING = 8;
const STAFF_SAFETY_MARGIN = 8;
const MIN_VIEWBOX_WIDTH = 200;
const MIN_VIEWBOX_HEIGHT = 80;
const MIN_SEQUENCE_HEIGHT = 160;
const SEQUENCE_STAVE_INSET = 18;
const SEQUENCE_NOTE_EDGE_PADDING = 18;
const SEQUENCE_LEDGER_SAFETY_MARGIN = 24;
const GRAND_STAFF_SEPARATION = 112;

function accidentalToken(alter: number): string | null {
  if (alter === 0) return null;
  if (alter === 1) return "#";
  if (alter === -1) return "b";
  if (alter === 2) return "##";
  if (alter === -2) return "bb";
  return null;
}

interface StaffRhythm {
  readonly vexDuration: string;
  readonly dots: number;
  readonly tuplet?: { readonly numNotes: number; readonly notesOccupied: number };
  readonly notation: string;
}

export function staffRhythmForDuration(duration: MusicalDuration): StaffRhythm {
  const value = `${duration.beats.numerator}/${duration.beats.denominator}`;
  const exact: Readonly<Record<string, StaffRhythm>> = {
    "4/1": { vexDuration: "w", dots: 0, notation: "whole" },
    "2/1": { vexDuration: "h", dots: 0, notation: "half" },
    "1/1": { vexDuration: "q", dots: 0, notation: "quarter" },
    "1/2": { vexDuration: "8", dots: 0, notation: "eighth" },
    "1/4": { vexDuration: "16", dots: 0, notation: "sixteenth" },
    "3/1": { vexDuration: "h", dots: 1, notation: "dotted-half" },
    "3/2": { vexDuration: "q", dots: 1, notation: "dotted-quarter" },
    "3/4": { vexDuration: "8", dots: 1, notation: "dotted-eighth" },
    "2/3": {
      vexDuration: "q",
      dots: 0,
      tuplet: { numNotes: 3, notesOccupied: 2 },
      notation: "quarter-triplet",
    },
    "1/3": {
      vexDuration: "8",
      dots: 0,
      tuplet: { numNotes: 3, notesOccupied: 2 },
      notation: "eighth-triplet",
    },
    "1/6": {
      vexDuration: "16",
      dots: 0,
      tuplet: { numNotes: 3, notesOccupied: 2 },
      notation: "sixteenth-triplet",
    },
  };
  return exact[value] ?? { vexDuration: "q", dots: 0, notation: `custom-${value}` };
}

function createStaffNote(
  projection: StaffProjectionDto,
  stave: Stave,
  rhythm: StaffRhythm,
  duration: MusicalDuration,
  centerAligned = true,
  ink = STAFF_INK,
  clef = "treble",
): StaveNote {
  const note = new StaveNote({
    keys: projection.notes.map((item) => item.vexKey),
    duration: rhythm.vexDuration,
    dots: rhythm.dots,
    durationOverride: vexDurationOverride(duration, rhythm),
    // Keep treble pitch placement without reserving visual space for a clef.
    clef,
  });

  projection.notes.forEach((item, index) => {
    const token = accidentalToken(item.alter);
    if (token) {
      const accidental = new Accidental(token);
      accidental.setStyle({ fillStyle: ink, strokeStyle: ink });
      note.addModifier(accidental, index);
    }
  });

  note.setStave(stave);
  note.setCenterAlignment(centerAligned);
  note.setStyle({ fillStyle: ink, strokeStyle: ink });
  note.setLedgerLineStyle({ fillStyle: ink, strokeStyle: ink });
  note.preFormat();
  return note;
}

interface StaffSequenceEntryBase {
  readonly key: string;
  readonly duration: MusicalDuration;
  readonly startOffsetBeats: Rational;
}

export interface StaffSequenceChordEntry extends StaffSequenceEntryBase {
  readonly kind: "chord";
  readonly projection: StaffProjectionDto;
  readonly bassProjection?: StaffProjectionDto;
  readonly continuesFromPrevious?: boolean;
  readonly continuesToNext?: boolean;
  readonly highlighted?: boolean;
}

export interface StaffSequenceNoteEntry extends StaffSequenceEntryBase {
  readonly kind: "note";
  readonly projection: StaffProjectionDto;
  readonly continuesFromPrevious?: boolean;
  readonly continuesToNext?: boolean;
  readonly highlighted?: boolean;
}

export interface StaffSequenceRestEntry extends StaffSequenceEntryBase {
  readonly kind: "rest";
}

export interface StaffSequenceGapEntry extends StaffSequenceEntryBase {
  readonly kind: "gap";
}

export type StaffSequenceEntry =
  StaffSequenceChordEntry | StaffSequenceNoteEntry | StaffSequenceRestEntry | StaffSequenceGapEntry;

export type StaffClef = "treble" | "bass";

export interface StaffSequenceRenderOptions {
  readonly clef?: StaffClef;
}

export interface StaffSequencePosition {
  readonly key: string;
  readonly x: number;
  readonly ratio: number;
}

export interface StaffSystemMeasureInput {
  readonly measureIndex: number;
  readonly widthPx: number;
  readonly harmonyEntries: readonly StaffSequenceEntry[];
  readonly melodyEntries?: readonly StaffSequenceEntry[];
}

export type StaffSystemStaff = "melody" | "harmony" | "bass";

export interface StaffSystemPosition extends StaffSequencePosition {
  readonly staff: StaffSystemStaff;
  readonly measureIndex: number;
}

export interface StaffSystemRenderOptions {
  readonly widthPx?: number;
  readonly showTimeSignature?: boolean;
  readonly showBass?: boolean;
  readonly melodyClef?: StaffClef;
}

interface RenderedSequenceTickable {
  readonly entry: StaffSequenceEntry;
  readonly note: StaveNote | GhostNote;
  readonly rhythm: StaffRhythm;
}

/**
 * A tuplet describes a rhythmic group, not an individual note. Group adjacent
 * compatible tickables in threes so an eighth/sixteenth-triplet run receives
 * one bracket and one numeral per beat. A truncated final group remains a
 * single partial tuplet, preserving its exact Rational duration.
 */
function createSequenceTuplets(
  rendered: readonly RenderedSequenceTickable[],
  eligible: (entry: StaffSequenceEntry) => boolean,
): readonly Tuplet[] {
  const tuplets: Tuplet[] = [];
  let pending: RenderedSequenceTickable[] = [];
  let signature: string | null = null;

  const flush = () => {
    if (pending.length === 0) return;
    const specification = pending[0]!.rhythm.tuplet!;
    tuplets.push(
      new Tuplet(
        pending.map(({ note }) => note),
        {
          numNotes: specification.numNotes,
          notesOccupied: specification.notesOccupied,
          bracketed: true,
          ratioed: false,
        },
      ),
    );
    pending = [];
    signature = null;
  };

  for (const item of rendered) {
    const specification = item.rhythm.tuplet;
    if (!specification || !eligible(item.entry)) {
      flush();
      continue;
    }
    const nextSignature = `${specification.numNotes}:${specification.notesOccupied}:${item.rhythm.vexDuration}`;
    if (signature !== null && signature !== nextSignature) flush();
    signature = nextSignature;
    pending.push(item);
    if (pending.length === specification.numNotes) flush();
  }
  flush();
  return Object.freeze(tuplets);
}

function exactDurationFraction(duration: MusicalDuration): Fraction {
  return new Fraction(duration.beats.numerator, duration.beats.denominator * 4);
}

function vexDurationOverride(duration: MusicalDuration, rhythm: StaffRhythm): Fraction {
  const exact = exactDurationFraction(duration);
  if (!rhythm.tuplet) return exact;
  return exact.multiply(rhythm.tuplet.numNotes, rhythm.tuplet.notesOccupied);
}

function createRestNote(
  stave: Stave,
  rhythm: StaffRhythm,
  duration: MusicalDuration,
  clef = "treble",
): StaveNote {
  const note = new StaveNote({
    keys: [clef === "bass" ? "d/3" : "b/4"],
    duration: `${rhythm.vexDuration}r`,
    dots: rhythm.dots,
    durationOverride: vexDurationOverride(duration, rhythm),
    clef,
  });
  note.setStave(stave);
  note.setStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  note.preFormat();
  return note;
}

function createGapNote(stave: Stave, duration: MusicalDuration): GhostNote {
  const note = new GhostNote({
    duration: "q",
    durationOverride: exactDurationFraction(duration),
  });
  note.setStave(stave);
  note.preFormat();
  return note;
}

interface StaffLayout {
  readonly width: number;
  readonly height: number;
  readonly staveX: number;
  readonly staveY: number;
  readonly bassStaveY: number | undefined;
  readonly staveWidth: number;
}

function getSequenceLayout(
  container: HTMLDivElement,
  entries: readonly StaffSequenceEntry[],
  meter: Meter,
  clef: StaffClef,
): StaffLayout {
  const width = Math.max(container.clientWidth, MIN_VIEWBOX_WIDTH);
  const staveX = SEQUENCE_STAVE_INSET;
  const staveWidth = width - SEQUENCE_STAVE_INSET * 2;
  const probeStave = new Stave(staveX, 0, staveWidth, {
    leftBar: true,
    rightBar: true,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  });
  probeStave.addClef(clef).addTimeSignature(`${meter.numerator}/${meter.denominator}`);
  const staffCenter = probeStave.getYForLine(2);
  let topDistance = MIN_SEQUENCE_HEIGHT / 2;
  let bottomDistance = MIN_SEQUENCE_HEIGHT / 2;

  entries.forEach((entry) => {
    if (entry.kind !== "chord" && entry.kind !== "note") return;
    const rhythm = staffRhythmForDuration(entry.duration);
    const note = createStaffNote(
      entry.projection,
      probeStave,
      rhythm,
      entry.duration,
      false,
      STAFF_INK,
      clef,
    );
    const bounds = note.getNoteHeadBounds();
    topDistance = Math.max(topDistance, staffCenter - bounds.yTop + SEQUENCE_LEDGER_SAFETY_MARGIN);
    bottomDistance = Math.max(
      bottomDistance,
      bounds.yBottom - staffCenter + SEQUENCE_LEDGER_SAFETY_MARGIN,
    );
  });

  const halfHeight = Math.max(topDistance, bottomDistance, MIN_SEQUENCE_HEIGHT / 2);
  const singleStaveHeight = Math.ceil(halfHeight * 2);
  const hasBassStaff = entries.some(
    (entry) => entry.kind === "chord" && entry.bassProjection?.notes.length,
  );
  return {
    width,
    height: hasBassStaff ? singleStaveHeight + GRAND_STAFF_SEPARATION : singleStaveHeight,
    staveX,
    staveY: singleStaveHeight / 2 - staffCenter,
    bassStaveY: hasBassStaff
      ? singleStaveHeight / 2 - staffCenter + GRAND_STAFF_SEPARATION
      : undefined,
    staveWidth,
  };
}

function getStaffLayout(
  container: HTMLDivElement,
  projection: StaffProjectionDto,
  rhythm: StaffRhythm,
  duration: MusicalDuration,
): StaffLayout {
  const width = Math.max(container.clientWidth, MIN_VIEWBOX_WIDTH);
  const measureStave = new Stave(0, 0, width, {
    leftBar: false,
    rightBar: false,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  });
  const measureNote = createStaffNote(projection, measureStave, rhythm, duration);
  const noteBounds = measureNote.getNoteHeadBounds();
  // Stave lines are numbered from 0 (top) to 4 (bottom), so line 2 is the
  // geometric center of a five-line staff.
  const staffCenter = measureStave.getYForLine(2);
  const topDistance = Math.max(staffCenter - noteBounds.yTop, 0) + STAFF_SAFETY_MARGIN;
  const bottomDistance = Math.max(noteBounds.yBottom - staffCenter, 0) + STAFF_SAFETY_MARGIN;
  const halfHeight = Math.max(topDistance, bottomDistance, MIN_VIEWBOX_HEIGHT / 2);
  const height = Math.ceil(halfHeight * 2);
  const staveX = 0;
  const staveWidth = width;

  return {
    width,
    height,
    staveX,
    staveY: height / 2 - staffCenter,
    bassStaveY: undefined,
    staveWidth,
  };
}

function configureSvg(
  container: HTMLDivElement,
  projection: StaffProjectionDto,
  layout: StaffLayout,
  duration: MusicalDuration,
  rhythm: StaffRhythm,
): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("VexFlow did not create an SVG staff surface");

  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.backgroundColor = "#fff";
  svg.dataset.staffPitches = projection.notes.map((item) => String(item.midiNumber)).join(",");
  svg.dataset.staffDuration = `${duration.beats.numerator}/${duration.beats.denominator}`;
  svg.dataset.staffRhythm = rhythm.notation;
  return svg;
}

export function renderStaffProjection(
  container: HTMLDivElement,
  projection: StaffProjectionDto,
  duration: MusicalDuration,
): () => void {
  container.replaceChildren();
  if (projection.notes.length === 0) return () => container.replaceChildren();

  const rhythm = staffRhythmForDuration(duration);
  const layout = getStaffLayout(container, projection, rhythm, duration);
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(layout.width, layout.height);
  const context = renderer.getContext();
  context.setFillStyle(STAFF_INK).setStrokeStyle(STAFF_INK).setLineWidth(1);

  const stave = new Stave(layout.staveX, layout.staveY, layout.staveWidth, {
    leftBar: false,
    rightBar: false,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  });
  stave.setDefaultLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  stave.setContext(context).draw();

  const note = createStaffNote(projection, stave, rhythm, duration);
  const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
  let tuplet: Tuplet | undefined;
  if (rhythm.tuplet) {
    tuplet = new Tuplet([note], {
      numNotes: rhythm.tuplet.numNotes,
      notesOccupied: rhythm.tuplet.notesOccupied,
      bracketed: true,
      ratioed: false,
    });
  }
  voice.addTickables([note]);
  new Formatter().joinVoices([voice]).formatToStave([voice], stave);
  voice.draw(context, stave);
  tuplet?.setContext(context).draw();
  configureSvg(container, projection, layout, duration, rhythm);

  return () => container.replaceChildren();
}

/**
 * Renders all onset events belonging to one measure on a shared paper staff.
 * This is intentionally a separate helper from the single-chord card renderer:
 * a measure can contain several independent attacks and explicit rests.
 */
export function renderStaffSequence(
  container: HTMLDivElement,
  entries: readonly StaffSequenceEntry[],
  meter: Meter,
  onLayout?: (positions: readonly StaffSequencePosition[]) => void,
  options: StaffSequenceRenderOptions = {},
): () => void {
  container.replaceChildren();
  if (entries.length === 0) return () => container.replaceChildren();

  const clef = options.clef ?? "treble";
  const layout = getSequenceLayout(container, entries, meter, clef);
  const { width, height } = layout;
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.setFillStyle(STAFF_INK).setStrokeStyle(STAFF_INK).setLineWidth(1);

  const hasBassStaff = layout.bassStaveY !== undefined;
  const staveOptions = {
    leftBar: !hasBassStaff,
    rightBar: !hasBassStaff,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  };
  const stave = new Stave(layout.staveX, layout.staveY, layout.staveWidth, staveOptions);
  stave.addClef(clef).addTimeSignature(`${meter.numerator}/${meter.denominator}`);
  stave.setDefaultLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  stave.setContext(context).draw();
  const bassStave = hasBassStaff
    ? new Stave(layout.staveX, layout.bassStaveY!, layout.staveWidth, staveOptions)
    : undefined;
  if (bassStave) {
    bassStave.addClef("bass").addTimeSignature(`${meter.numerator}/${meter.denominator}`);
    bassStave.setDefaultLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
    bassStave.setContext(context).draw();
    new StaveConnector(stave, bassStave).setType("brace").setContext(context).draw();
    new StaveConnector(stave, bassStave).setType("singleLeft").setContext(context).draw();
    new StaveConnector(stave, bassStave).setType("singleRight").setContext(context).draw();
  }

  const playingInk =
    getComputedStyle(container).getPropertyValue("--piano-pressed-key-border").trim() ||
    STAFF_PLAYING_INK_FALLBACK;

  const notes = entries.map((entry) => {
    const rhythm = staffRhythmForDuration(entry.duration);
    const note =
      entry.kind === "gap"
        ? createGapNote(stave, entry.duration)
        : entry.kind === "rest"
          ? createRestNote(stave, rhythm, entry.duration, clef)
          : createStaffNote(
              entry.projection,
              stave,
              rhythm,
              entry.duration,
              false,
              entry.highlighted ? playingInk : STAFF_INK,
              clef,
            );
    note.setAttribute("data-staff-entry", entry.key);
    if ((entry.kind === "chord" || entry.kind === "note") && entry.highlighted) {
      note.setAttribute("data-staff-playing", "true");
    }
    return { entry, note, rhythm };
  });
  const tuplets = createSequenceTuplets(notes, (entry) => entry.kind !== "gap");
  const bassNotes = bassStave
    ? entries.map((entry) => {
        const rhythm = staffRhythmForDuration(entry.duration);
        let note: StaveNote | GhostNote;
        if (
          entry.kind === "gap" ||
          entry.kind === "note" ||
          (entry.kind === "chord" && !entry.bassProjection)
        ) {
          note = createGapNote(bassStave, entry.duration);
        } else if (entry.kind === "rest") {
          note = createRestNote(bassStave, rhythm, entry.duration, "bass");
        } else {
          note = createStaffNote(
            entry.bassProjection!,
            bassStave,
            rhythm,
            entry.duration,
            false,
            entry.highlighted ? playingInk : STAFF_INK,
            "bass",
          );
        }
        note.setAttribute("data-bass-staff-entry", entry.key);
        if (entry.kind === "chord" && entry.highlighted && entry.bassProjection) {
          note.setAttribute("data-staff-playing", "true");
        }
        return { entry, note, rhythm };
      })
    : [];
  const bassTuplets = createSequenceTuplets(
    bassNotes,
    (entry) => entry.kind === "rest" || (entry.kind === "chord" && Boolean(entry.bassProjection)),
  );
  const voice = new Voice({ numBeats: meter.numerator, beatValue: meter.denominator }).setMode(
    Voice.Mode.FULL,
  );
  voice.addTickables(notes.map(({ note }) => note));
  new Formatter().joinVoices([voice]).formatToStave([voice], stave);
  const bassVoice = bassStave
    ? new Voice({ numBeats: meter.numerator, beatValue: meter.denominator }).setMode(
        Voice.Mode.FULL,
      )
    : undefined;
  if (bassVoice && bassStave) {
    bassVoice.addTickables(bassNotes.map(({ note }) => note));
    new Formatter().joinVoices([bassVoice]).formatToStave([bassVoice], bassStave);
  }

  const barLengthBeats = (meter.numerator * 4) / meter.denominator;
  const timeStartX =
    Math.max(stave.getNoteStartX(), bassStave?.getNoteStartX() ?? 0) + SEQUENCE_NOTE_EDGE_PADDING;
  const timeEndX =
    Math.min(stave.getNoteEndX(), bassStave?.getNoteEndX() ?? Number.POSITIVE_INFINITY) -
    SEQUENCE_NOTE_EDGE_PADDING;
  const usableWidth = Math.max(timeEndX - timeStartX, 1);
  const alignToTimeline = ({ entry, note }: RenderedSequenceTickable) => {
    const onsetRatio = rationalToNumber(entry.startOffsetBeats) / barLengthBeats;
    const targetX = timeStartX + Math.min(Math.max(onsetRatio, 0), 1) * usableWidth;
    const tickContext = note.getTickContext();
    tickContext.setX(targetX);
    // TickContext X is not the rendered note anchor: VexFlow adds the note's
    // pre-format shift (for accidentals, displaced heads, and glyph padding).
    // Correct for that stable shift so the actual note anchor, rather than its
    // timing container, stays on the safe musical timeline. Without this the
    // final onset can be drawn past the right barline in compact previews.
    tickContext.setX(targetX + (targetX - note.getAbsoluteX()));
  };
  notes.forEach(alignToTimeline);
  bassNotes.forEach(alignToTimeline);
  voice.draw(context, stave);
  if (bassVoice && bassStave) bassVoice.draw(context, bassStave);

  const positions = notes.flatMap(({ entry, note }) =>
    entry.kind === "gap"
      ? []
      : [
          Object.freeze({
            key: entry.key,
            x: note.getAbsoluteX(),
            ratio: note.getAbsoluteX() / width,
          }),
        ],
  );
  const bassPositions = bassNotes.flatMap(({ entry, note }) =>
    entry.kind === "gap" || (entry.kind === "chord" && !entry.bassProjection)
      ? []
      : [
          Object.freeze({
            key: entry.key,
            x: note.getAbsoluteX(),
            ratio: note.getAbsoluteX() / width,
          }),
        ],
  );
  onLayout?.(Object.freeze(positions));

  notes.forEach(({ entry, note }) => {
    if (entry.kind !== "chord" && entry.kind !== "note") return;
    const indexes = entry.projection.notes.map((_, index) => index);
    if (entry.continuesFromPrevious) {
      indexes.forEach((index) => {
        new StaveTie({ lastNote: note, lastIndexes: [index] }).setContext(context).draw();
      });
    }
    if (entry.continuesToNext) {
      indexes.forEach((index) => {
        new StaveTie({ firstNote: note, firstIndexes: [index] }).setContext(context).draw();
      });
    }
  });
  bassNotes.forEach(({ entry, note }) => {
    if (entry.kind !== "chord" || !entry.bassProjection) return;
    const indexes = entry.bassProjection.notes.map((_, index) => index);
    if (entry.continuesFromPrevious) {
      new StaveTie({ lastNote: note, lastIndexes: indexes }).setContext(context).draw();
    }
    if (entry.continuesToNext) {
      new StaveTie({ firstNote: note, firstIndexes: indexes }).setContext(context).draw();
    }
  });
  tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
  bassTuplets.forEach((tuplet) => tuplet.setContext(context).draw());

  const svg = container.querySelector("svg");
  if (!svg) throw new Error("VexFlow did not create a shared staff surface");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.backgroundColor = "#fff";
  svg.dataset.staffSequenceLength = String(entries.length);
  svg.dataset.staffClef = clef;
  svg.dataset.staffMeter = `${meter.numerator}/${meter.denominator}`;
  svg.dataset.staffSystem = bassStave ? "grand" : "treble";
  svg.dataset.staffBassEntries = entries
    .filter((entry) => entry.kind === "chord" && entry.bassProjection)
    .map((entry) => entry.key)
    .join(",");
  svg.dataset.staffBassSequencePositions = bassPositions
    .map((position) => `${position.key}:${position.ratio.toFixed(6)}`)
    .join(",");
  svg.dataset.staffPlayingEntries = entries
    .filter((entry) => (entry.kind === "chord" || entry.kind === "note") && entry.highlighted)
    .map((entry) => entry.key)
    .join(",");
  svg.dataset.staffTupletGroups = String(tuplets.length);
  svg.dataset.staffSequencePositions = positions
    .map((position) => `${position.key}:${position.ratio.toFixed(6)}`)
    .join(",");

  return () => container.replaceChildren();
}

interface SystemRow {
  readonly staff: StaffSystemStaff;
  readonly clef: StaffClef;
  readonly entriesForMeasure: (measure: StaffSystemMeasureInput) => readonly StaffSequenceEntry[];
}

interface SystemRowLayout {
  readonly row: SystemRow;
  readonly staves: readonly Stave[];
  readonly height: number;
  readonly top: number;
}

interface RenderedSystemTickable extends RenderedSequenceTickable {
  readonly staff: StaffSystemStaff;
  readonly measureIndex: number;
  readonly stave: Stave;
}

function entriesForBassStaff(
  entries: readonly StaffSequenceEntry[],
): readonly StaffSequenceEntry[] {
  return Object.freeze(
    entries.map((entry) => {
      if (entry.kind === "chord" && entry.bassProjection) {
        const { bassProjection: _bassProjection, ...withoutBassProjection } = entry;
        return Object.freeze({ ...withoutBassProjection, projection: entry.bassProjection });
      }
      if (entry.kind === "rest" || entry.kind === "gap") return entry;
      return Object.freeze({
        key: entry.key,
        kind: "gap" as const,
        duration: entry.duration,
        startOffsetBeats: entry.startOffsetBeats,
      });
    }),
  );
}

function beamGroupsForMeter(meter: Meter): Fraction[] {
  if (meter.grouping.length > 1) {
    return meter.grouping.map((pulses) => new Fraction(pulses, meter.denominator));
  }
  // The score reference groups 4/4 eighth-notes by half-bar. This keeps four
  // related attacks visually together while preserving a clear mid-bar break.
  if (meter.numerator === 4 && meter.denominator === 4) {
    return [new Fraction(2, 4)];
  }
  return Beam.getDefaultBeamGroups(`${meter.numerator}/${meter.denominator}`);
}

function createSystemBeams(
  rendered: readonly RenderedSystemTickable[],
  meter: Meter,
): readonly Beam[] {
  const notes = rendered
    .map(({ note }) => note)
    .filter((note): note is StaveNote => note instanceof StaveNote);
  return Object.freeze(
    Beam.generateBeams(notes, {
      groups: beamGroupsForMeter(meter),
      beamRests: false,
      showStemlets: false,
    }),
  );
}

function systemStaffHeight(
  entries: readonly StaffSequenceEntry[],
  clef: StaffClef,
  widthPx: number,
  showTimeSignature: boolean,
  meter: Meter,
): number {
  const probeStave = new Stave(0, 0, widthPx, {
    leftBar: true,
    rightBar: true,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  });
  probeStave.addClef(clef);
  if (showTimeSignature) probeStave.addTimeSignature(`${meter.numerator}/${meter.denominator}`);
  const staffCenter = probeStave.getYForLine(2);
  let topDistance = MIN_SEQUENCE_HEIGHT / 2;
  let bottomDistance = MIN_SEQUENCE_HEIGHT / 2;
  entries.forEach((entry) => {
    if (entry.kind !== "chord" && entry.kind !== "note") return;
    const rhythm = staffRhythmForDuration(entry.duration);
    const note = createStaffNote(
      entry.projection,
      probeStave,
      rhythm,
      entry.duration,
      false,
      STAFF_INK,
      clef,
    );
    const bounds = note.getNoteHeadBounds();
    topDistance = Math.max(topDistance, staffCenter - bounds.yTop + SEQUENCE_LEDGER_SAFETY_MARGIN);
    bottomDistance = Math.max(
      bottomDistance,
      bounds.yBottom - staffCenter + SEQUENCE_LEDGER_SAFETY_MARGIN,
    );
  });
  return Math.ceil(Math.max(topDistance, bottomDistance, MIN_SEQUENCE_HEIGHT / 2) * 2);
}

function systemStaveOptions(hasBassStaff: boolean) {
  return {
    leftBar: !hasBassStaff,
    rightBar: !hasBassStaff,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  };
}

/**
 * Renders one continuous VexFlow SVG for a group of consecutive measures.
 * Each voice is formatted per measure, then its tick contexts are moved onto
 * the same explicit time axis across Melody, Harmony, and optional Bass rows.
 */
export function renderStaffSystem(
  container: HTMLDivElement,
  measures: readonly StaffSystemMeasureInput[],
  meter: Meter,
  onLayout?: (positions: readonly StaffSystemPosition[]) => void,
  options: StaffSystemRenderOptions = {},
): () => void {
  container.replaceChildren();
  if (measures.length === 0) return () => container.replaceChildren();

  const showBass =
    options.showBass ??
    measures.some((measure) =>
      measure.harmonyEntries.some(
        (entry) => entry.kind === "chord" && Boolean(entry.bassProjection),
      ),
    );
  const hasMelody = measures.some((measure) => measure.melodyEntries !== undefined);
  const rows: SystemRow[] = [];
  if (hasMelody) {
    rows.push({
      staff: "melody",
      clef: options.melodyClef ?? "treble",
      entriesForMeasure: (measure) => measure.melodyEntries ?? [],
    });
  }
  rows.push({
    staff: "harmony",
    clef: "treble",
    entriesForMeasure: (measure) => measure.harmonyEntries,
  });
  if (showBass) {
    rows.push({
      staff: "bass",
      clef: "bass",
      entriesForMeasure: (measure) => entriesForBassStaff(measure.harmonyEntries),
    });
  }

  const baseWidths = measures.map((measure) => Math.max(1, measure.widthPx));
  const requiredWidth = baseWidths.reduce((sum, width) => sum + width, 0);
  // Score-system widths come from the presentation projection. Do not apply
  // the single-staff minimum here: short meters such as 2/4 intentionally
  // receive a proportionally shorter measure.
  const width = Math.max(options.widthPx ?? requiredWidth, requiredWidth, 1);
  const connectorInset = showBass ? 14 : 0;
  const widthScale = Math.max(width - connectorInset, 1) / requiredWidth;
  const measureWidths = baseWidths.map((measureWidth) => measureWidth * widthScale);
  const measureX: number[] = [];
  let cursorX = connectorInset;
  measureWidths.forEach((measureWidth) => {
    measureX.push(cursorX);
    cursorX += measureWidth;
  });
  const showTimeSignature = options.showTimeSignature ?? false;
  const staffHeights = rows.map((row) => {
    const entries = measures.flatMap((measure) => row.entriesForMeasure(measure));
    return systemStaffHeight(
      entries,
      row.clef,
      Math.max(...measureWidths),
      showTimeSignature,
      meter,
    );
  });
  const rowGap = 18;
  const height =
    staffHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + rowGap * (rows.length - 1);
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.setFillStyle(STAFF_INK).setStrokeStyle(STAFF_INK).setLineWidth(1);

  const rowLayouts: SystemRowLayout[] = [];
  let rowTop = 0;
  rows.forEach((row, rowIndex) => {
    const rowHeight = staffHeights[rowIndex]!;
    const staves = measures.map((measure, measureIndex) => {
      const stave = new Stave(measureX[measureIndex]!, rowTop, measureWidths[measureIndex]!, {
        ...systemStaveOptions(row.staff === "harmony" && showBass),
      });
      if (measureIndex === 0) {
        stave.addClef(row.clef);
        if (showTimeSignature) stave.addTimeSignature(`${meter.numerator}/${meter.denominator}`);
      }
      const center = stave.getYForLine(2);
      // getYForLine() is absolute, so preserve this row's top offset while
      // centering the stave. Subtracting the absolute value directly collapses
      // every row onto the first one.
      stave.setY(rowTop + rowHeight / 2 - (center - rowTop));
      stave.setDefaultLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
      stave.setContext(context).draw();
      return stave;
    });
    rowLayouts.push({ row, staves: Object.freeze(staves), height: rowHeight, top: rowTop });
    rowTop += rowHeight + rowGap;
  });

  const bassLayout = rowLayouts.find((layout) => layout.row.staff === "bass");
  const harmonyLayout = rowLayouts.find((layout) => layout.row.staff === "harmony");
  if (bassLayout && harmonyLayout) {
    measures.forEach((_, measureIndex) => {
      if (measureIndex === 0) {
        new StaveConnector(harmonyLayout.staves[measureIndex]!, bassLayout.staves[measureIndex]!)
          .setType("brace")
          .setContext(context)
          .draw();
        new StaveConnector(harmonyLayout.staves[measureIndex]!, bassLayout.staves[measureIndex]!)
          .setType("singleLeft")
          .setContext(context)
          .draw();
      }
      new StaveConnector(harmonyLayout.staves[measureIndex]!, bassLayout.staves[measureIndex]!)
        .setType("singleRight")
        .setContext(context)
        .draw();
    });
  }

  const playingInk =
    getComputedStyle(container).getPropertyValue("--piano-pressed-key-border").trim() ||
    STAFF_PLAYING_INK_FALLBACK;
  const positions: StaffSystemPosition[] = [];
  let tupletCount = 0;
  let beamCount = 0;
  const allRendered: RenderedSystemTickable[] = [];

  rowLayouts.forEach((rowLayout) => {
    measures.forEach((measure, measureIndex) => {
      const stave = rowLayout.staves[measureIndex]!;
      const entries = rowLayout.row.entriesForMeasure(measure);
      if (entries.length === 0) return;
      const rendered = entries.map((entry) => {
        const rhythm = staffRhythmForDuration(entry.duration);
        const note =
          entry.kind === "gap"
            ? createGapNote(stave, entry.duration)
            : entry.kind === "rest"
              ? createRestNote(stave, rhythm, entry.duration, rowLayout.row.clef)
              : createStaffNote(
                  entry.projection,
                  stave,
                  rhythm,
                  entry.duration,
                  false,
                  entry.highlighted ? playingInk : STAFF_INK,
                  rowLayout.row.clef,
                );
        note.setAttribute("data-staff-entry", entry.key);
        if ((entry.kind === "chord" || entry.kind === "note") && entry.highlighted) {
          note.setAttribute("data-staff-playing", "true");
        }
        return { entry, note, rhythm, staff: rowLayout.row.staff, measureIndex, stave };
      });
      const tuplets = createSequenceTuplets(
        rendered,
        (entry) => entry.kind !== "gap" && entry.kind !== "rest",
      );
      const beams = createSystemBeams(rendered, meter);
      tupletCount += tuplets.length;
      beamCount += beams.length;
      const voice = new Voice({ numBeats: meter.numerator, beatValue: meter.denominator }).setMode(
        Voice.Mode.FULL,
      );
      voice.addTickables(rendered.map(({ note }) => note));
      new Formatter().joinVoices([voice]).formatToStave([voice], stave);

      const comparableStaves = rowLayouts.map((candidate) => candidate.staves[measureIndex]!);
      const timeStartX =
        Math.max(...comparableStaves.map((candidate) => candidate.getNoteStartX())) +
        SEQUENCE_NOTE_EDGE_PADDING;
      const timeEndX =
        Math.min(...comparableStaves.map((candidate) => candidate.getNoteEndX())) -
        SEQUENCE_NOTE_EDGE_PADDING;
      const usableWidth = Math.max(timeEndX - timeStartX, 1);
      rendered.forEach((item) => {
        const barLengthBeats = (meter.numerator * 4) / meter.denominator;
        const onsetRatio = rationalToNumber(item.entry.startOffsetBeats) / barLengthBeats;
        const targetX = timeStartX + Math.min(Math.max(onsetRatio, 0), 1) * usableWidth;
        const tickContext = item.note.getTickContext();
        tickContext.setX(targetX);
        tickContext.setX(targetX + (targetX - item.note.getAbsoluteX()));
      });
      voice.draw(context, stave);
      beams.forEach((beam) => beam.setContext(context).draw());
      tuplets.forEach((tuplet) => tuplet.setContext(context).draw());
      rendered.forEach((item) => allRendered.push(item));

      rendered.forEach((item) => {
        if (item.entry.kind === "gap") return;
        positions.push(
          Object.freeze({
            key: item.entry.key,
            x: item.note.getAbsoluteX(),
            ratio: item.note.getAbsoluteX() / width,
            staff: rowLayout.row.staff,
            measureIndex: measure.measureIndex,
          }),
        );
      });

      rendered.forEach((item) => {
        if (item.entry.kind !== "chord" && item.entry.kind !== "note") return;
        const indexes = item.entry.projection.notes.map((_, index) => index);
        if (item.entry.continuesFromPrevious) {
          indexes.forEach((index) => {
            new StaveTie({ lastNote: item.note, lastIndexes: [index] }).setContext(context).draw();
          });
        }
        if (item.entry.continuesToNext) {
          indexes.forEach((index) => {
            new StaveTie({ firstNote: item.note, firstIndexes: [index] })
              .setContext(context)
              .draw();
          });
        }
      });
    });
  });

  const svg = container.querySelector("svg");
  if (!svg) throw new Error("VexFlow did not create a score system surface");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.backgroundColor = "#fff";
  const harmonyEntries = measures.flatMap((measure) => measure.harmonyEntries);
  svg.dataset.staffSequenceLength = String(harmonyEntries.length);
  svg.dataset.staffSystemMeasureCount = String(measures.length);
  svg.dataset.staffSystem = "score";
  svg.dataset.staffMeter = `${meter.numerator}/${meter.denominator}`;
  svg.dataset.staffTimeSignature = showTimeSignature ? "true" : "false";
  svg.dataset.staffSystemClefs = rows.map((row) => row.clef).join(",");
  svg.dataset.staffBassEntries = showBass
    ? harmonyEntries
        .filter((entry) => entry.kind === "chord" && entry.bassProjection)
        .map((entry) => entry.key)
        .join(",")
    : "";
  svg.dataset.staffPlayingEntries = allRendered
    .filter(
      ({ entry }) =>
        (entry.kind === "chord" || entry.kind === "note") && Boolean(entry.highlighted),
    )
    .map(({ entry }) => entry.key)
    .join(",");
  svg.dataset.staffTupletGroups = String(tupletCount);
  svg.dataset.staffBeamGroups = String(beamCount);
  svg.dataset.staffSystemPositions = positions
    .map((position) => `${position.staff}:${position.key}:${position.ratio.toFixed(6)}`)
    .join(",");
  svg.dataset.staffSequencePositions = positions
    .filter((position) => position.staff === "harmony")
    .map((position) => `${position.key}:${position.ratio.toFixed(6)}`)
    .join(",");
  onLayout?.(Object.freeze(positions));

  return () => container.replaceChildren();
}
