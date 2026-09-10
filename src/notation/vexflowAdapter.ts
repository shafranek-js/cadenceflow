import {
  Accidental,
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

export interface StaffSequenceRestEntry extends StaffSequenceEntryBase {
  readonly kind: "rest";
}

export interface StaffSequenceGapEntry extends StaffSequenceEntryBase {
  readonly kind: "gap";
}

export type StaffSequenceEntry =
  StaffSequenceChordEntry | StaffSequenceRestEntry | StaffSequenceGapEntry;

export interface StaffSequencePosition {
  readonly key: string;
  readonly x: number;
  readonly ratio: number;
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
): StaffLayout {
  const width = Math.max(container.clientWidth, MIN_VIEWBOX_WIDTH);
  const staveX = SEQUENCE_STAVE_INSET;
  const staveWidth = width - SEQUENCE_STAVE_INSET * 2;
  const probeStave = new Stave(staveX, 0, staveWidth, {
    leftBar: true,
    rightBar: true,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  });
  probeStave.addClef("treble").addTimeSignature(`${meter.numerator}/${meter.denominator}`);
  const staffCenter = probeStave.getYForLine(2);
  let topDistance = MIN_SEQUENCE_HEIGHT / 2;
  let bottomDistance = MIN_SEQUENCE_HEIGHT / 2;

  entries.forEach((entry) => {
    if (entry.kind !== "chord") return;
    const rhythm = staffRhythmForDuration(entry.duration);
    const note = createStaffNote(entry.projection, probeStave, rhythm, entry.duration, false);
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
): () => void {
  container.replaceChildren();
  if (entries.length === 0) return () => container.replaceChildren();

  const layout = getSequenceLayout(container, entries, meter);
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
  stave.addClef("treble").addTimeSignature(`${meter.numerator}/${meter.denominator}`);
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
          ? createRestNote(stave, rhythm, entry.duration)
          : createStaffNote(
              entry.projection,
              stave,
              rhythm,
              entry.duration,
              false,
              entry.highlighted ? playingInk : STAFF_INK,
            );
    note.setAttribute("data-staff-entry", entry.key);
    if (entry.kind === "chord" && entry.highlighted) {
      note.setAttribute("data-staff-playing", "true");
    }
    return { entry, note, rhythm };
  });
  const tuplets = notes.flatMap(({ entry, note, rhythm }) =>
    entry.kind !== "gap" && rhythm.tuplet
      ? [
          new Tuplet([note], {
            numNotes: rhythm.tuplet.numNotes,
            notesOccupied: rhythm.tuplet.notesOccupied,
            bracketed: true,
            ratioed: false,
          }),
        ]
      : [],
  );
  const bassNotes = bassStave
    ? entries.map((entry) => {
        const rhythm = staffRhythmForDuration(entry.duration);
        const note =
          entry.kind === "gap" || (entry.kind === "chord" && !entry.bassProjection)
            ? createGapNote(bassStave, entry.duration)
            : entry.kind === "rest"
              ? createRestNote(bassStave, rhythm, entry.duration, "bass")
              : createStaffNote(
                  entry.bassProjection!,
                  bassStave,
                  rhythm,
                  entry.duration,
                  false,
                  entry.highlighted ? playingInk : STAFF_INK,
                  "bass",
                );
        note.setAttribute("data-bass-staff-entry", entry.key);
        if (entry.kind === "chord" && entry.highlighted && entry.bassProjection) {
          note.setAttribute("data-staff-playing", "true");
        }
        return { entry, note, rhythm };
      })
    : [];
  const bassTuplets = bassNotes.flatMap(({ entry, note, rhythm }) =>
    (entry.kind === "rest" || (entry.kind === "chord" && entry.bassProjection)) && rhythm.tuplet
      ? [
          new Tuplet([note], {
            numNotes: rhythm.tuplet.numNotes,
            notesOccupied: rhythm.tuplet.notesOccupied,
            bracketed: true,
            ratioed: false,
          }),
        ]
      : [],
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
  const alignToTimeline = ({ entry, note }: (typeof notes)[number]) => {
    const onsetRatio = rationalToNumber(entry.startOffsetBeats) / barLengthBeats;
    note.getTickContext().setX(timeStartX + Math.min(Math.max(onsetRatio, 0), 1) * usableWidth);
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
    if (entry.kind !== "chord") return;
    const indexes = entry.projection.notes.map((_, index) => index);
    if (entry.continuesFromPrevious) {
      new StaveTie({ lastNote: note, lastIndexes: indexes }).setContext(context).draw();
    }
    if (entry.continuesToNext) {
      new StaveTie({ firstNote: note, firstIndexes: indexes }).setContext(context).draw();
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
  svg.dataset.staffClef = "treble";
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
    .filter((entry) => entry.kind === "chord" && entry.highlighted)
    .map((entry) => entry.key)
    .join(",");
  svg.dataset.staffSequencePositions = positions
    .map((position) => `${position.key}:${position.ratio.toFixed(6)}`)
    .join(",");

  return () => container.replaceChildren();
}
