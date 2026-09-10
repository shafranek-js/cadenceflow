import { Accidental, Formatter, Renderer, Stave, StaveNote, Tuplet, Voice } from "vexflow";
import type { MusicalDuration } from "../domain/timing/duration";
import type { StaffProjectionDto } from "./staffProjection";

const STAFF_INK = "#000";
const STAFF_LINE_SPACING = 8;
const STAFF_SAFETY_MARGIN = 8;
const MIN_VIEWBOX_WIDTH = 200;
const MIN_VIEWBOX_HEIGHT = 80;

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
): StaveNote {
  const note = new StaveNote({
    keys: projection.notes.map((item) => item.vexKey),
    duration: rhythm.vexDuration,
    dots: rhythm.dots,
    // Keep treble pitch placement without reserving visual space for a clef.
    clef: "treble",
  });

  projection.notes.forEach((item, index) => {
    const token = accidentalToken(item.alter);
    if (token) note.addModifier(new Accidental(token), index);
  });

  note.setStave(stave);
  note.setCenterAlignment(true);
  note.setStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  note.setLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  note.preFormat();
  return note;
}

export interface StaffSequenceEntry {
  readonly projection: StaffProjectionDto;
  readonly duration: MusicalDuration;
  readonly rest?: boolean;
}

function createRestNote(stave: Stave, rhythm: StaffRhythm): StaveNote {
  const note = new StaveNote({
    keys: ["b/4"],
    duration: `${rhythm.vexDuration}r`,
    clef: "treble",
  });
  note.setStave(stave);
  note.setStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  note.preFormat();
  return note;
}

interface StaffLayout {
  readonly width: number;
  readonly height: number;
  readonly staveX: number;
  readonly staveY: number;
  readonly staveWidth: number;
}

function getStaffLayout(
  container: HTMLDivElement,
  projection: StaffProjectionDto,
  rhythm: StaffRhythm,
): StaffLayout {
  const width = Math.max(container.clientWidth, MIN_VIEWBOX_WIDTH);
  const measureStave = new Stave(0, 0, width, {
    leftBar: false,
    rightBar: false,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  });
  const measureNote = createStaffNote(projection, measureStave, rhythm);
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
  const layout = getStaffLayout(container, projection, rhythm);
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

  const note = createStaffNote(projection, stave, rhythm);
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
): () => void {
  container.replaceChildren();
  if (entries.length === 0) return () => container.replaceChildren();

  const width = Math.max(container.clientWidth, MIN_VIEWBOX_WIDTH);
  const height = 160;
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  context.setFillStyle(STAFF_INK).setStrokeStyle(STAFF_INK).setLineWidth(1);

  const stave = new Stave(0, 60, width, {
    leftBar: false,
    rightBar: false,
    spacingBetweenLinesPx: STAFF_LINE_SPACING,
  });
  stave.setDefaultLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  stave.setContext(context).draw();

  const notes = entries.map((entry) => {
    const rhythm = staffRhythmForDuration(entry.duration);
    return entry.rest
      ? createRestNote(stave, rhythm)
      : createStaffNote(entry.projection, stave, rhythm);
  });
  const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
  voice.addTickables(notes);
  new Formatter().joinVoices([voice]).formatToStave([voice], stave);
  voice.draw(context, stave);

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

  return () => container.replaceChildren();
}
