import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  Fraction,
  GhostNote,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  StemmableNote,
  TabNote,
  TabStave,
  TabTie,
  Tuplet,
  Voice,
} from "vexflow";
import { GUITAR_FINGER_COLORS as GUITAR_FINGER_COLOR_PALETTE } from "../domain/instruments/guitar/fingerColors";
import { musicalDuration, type MusicalDuration } from "../domain/timing/duration";
import type { Meter } from "../domain/timing/meter";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  rationalToNumber,
  subtractRational,
  type Rational,
  ZERO,
} from "../domain/timing/rational";
import type { StaffProjectionDto } from "./staffProjection";
import { getSuzukiNoteColor, getSuzukiNoteStroke } from "./suzukiColors";
import {
  projectSingleWrittenRhythm,
  projectWrittenRhythm,
  type WrittenRhythmPart,
} from "./writtenRhythmProjection";
const STAFF_INK = "#000";
const STAFF_PLAYING_INK_FALLBACK = "#8a5732";
const STAFF_LINE_SPACING = 8;
const SYSTEM_STAFF_LINE_SPACING = 12;
const TAB_LINE_SPACING = 15;
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
  return exact[value] ?? projectSingleWrittenRhythm(duration.beats);
}
function createStaffNote(
  projection: StaffProjectionDto,
  stave: Stave,
  rhythm: StaffRhythm,
  duration: MusicalDuration,
  centerAligned = true,
  ink = STAFF_INK,
  clef = "treble",
  suzukiColors = false,
): StaveNote {
  const note = new StaveNote({
    keys: projection.notes.map((item) => item.vexKey),
    duration: rhythm.vexDuration,
    dots: rhythm.dots,
    durationOverride: vexDurationOverride(duration, rhythm),
    // Keep treble pitch placement without reserving visual space for a clef.
    clef,
  });
  attachRhythmicDots(note, rhythm.dots);
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
  note.setLedgerLineStyle({ fillStyle: ink, strokeStyle: ink, lineWidth: 1 });
  if (suzukiColors) {
    projection.notes.forEach((item, index) => {
      const color = getSuzukiNoteColor(item.step);
      const stroke = getSuzukiNoteStroke(item.step);
      if (color) {
        note.setKeyStyle(index, {
          fillStyle: color,
          strokeStyle: stroke ?? color,
          ...(item.step === "E" ? { lineWidth: 1.5 } : {}),
        });
      }
    });
  }
  note.preFormat();
  return note;
}
function createTabChordNote(
  stave: TabStave,
  entry: StaffSequenceChordEntry,
  rhythm: StaffRhythm,
  duration: MusicalDuration,
  ink = STAFF_INK,
): TabNote {
  const positions =
    entry.tabPositions && entry.tabPositions.length > 0
      ? entry.tabPositions.map((pos) => ({ str: pos.str, fret: pos.fret }))
      : [{ str: 6, fret: "x" }];
  const note = new TabNote(
    {
      positions,
      duration: rhythm.vexDuration,
      dots: rhythm.dots,
      durationOverride: vexDurationOverride(duration, rhythm),
    },
    true,
  );
  attachRhythmicDots(note, rhythm.dots);
  note.setStave(stave);
  if (ink !== STAFF_INK) {
    note.setStyle({ fillStyle: ink, strokeStyle: ink });
  }
  note.preFormat();
  return note;
}
function createTabSingleNote(
  stave: TabStave,
  entry: StaffSequenceNoteEntry,
  rhythm: StaffRhythm,
  duration: MusicalDuration,
  ink = STAFF_INK,
): TabNote {
  const positions =
    entry.tabPositions && entry.tabPositions.length > 0
      ? entry.tabPositions.map((pos) => ({ str: pos.str, fret: pos.fret }))
      : [{ str: 1, fret: 0 }];
  const note = new TabNote(
    {
      positions,
      duration: rhythm.vexDuration,
      dots: rhythm.dots,
      durationOverride: vexDurationOverride(duration, rhythm),
    },
    true,
  );
  attachRhythmicDots(note, rhythm.dots);
  note.setStave(stave);
  if (ink !== STAFF_INK) {
    note.setStyle({ fillStyle: ink, strokeStyle: ink });
  }
  note.preFormat();
  return note;
}
interface StaffSequenceEntryBase {
  readonly key: string;
  readonly duration: MusicalDuration;
  readonly startOffsetBeats: Rational;
  readonly writtenRhythm?: WrittenRhythmPart;
  readonly sourceEventKeys?: readonly string[];
  readonly rhythmicVoice?: string;
  readonly tabPositionConflict?: boolean;
}
export interface StaffSequenceChordEntry extends StaffSequenceEntryBase {
  readonly kind: "chord";
  readonly projection: StaffProjectionDto;
  readonly bassProjection?: StaffProjectionDto;
  readonly tabPositions?: readonly {
    readonly str: number;
    readonly fret: number;
    readonly finger?: number | undefined;
  }[];
  readonly continuesFromPrevious?: boolean;
  readonly continuesToNext?: boolean;
  readonly highlighted?: boolean;
}
export interface StaffSequenceNoteEntry extends StaffSequenceEntryBase {
  readonly kind: "note";
  readonly projection: StaffProjectionDto;
  readonly tabPositions?: readonly {
    readonly str: number;
    readonly fret: number;
    readonly finger?: number | undefined;
  }[];
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
function staffRhythmForEntry(entry: StaffSequenceEntry): StaffRhythm {
  return entry.writtenRhythm ?? staffRhythmForDuration(entry.duration);
}
function attachRhythmicDots(note: StaveNote | TabNote, count: number): void {
  for (let dot = 0; dot < count; dot += 1) {
    Dot.buildAndAttach([note], note instanceof TabNote ? undefined : { all: true });
  }
}
function expandStaffSequenceEntries(
  entries: readonly StaffSequenceEntry[],
  meter: Meter,
): readonly StaffSequenceEntry[] {
  return Object.freeze(
    entries.flatMap((entry) => {
      const isWrittenPart = Boolean(entry.writtenRhythm);
      const parts = entry.writtenRhythm
        ? [entry.writtenRhythm]
        : projectWrittenRhythm(entry.duration.beats, entry.startOffsetBeats, meter);
      return parts.map((part) => ({
        ...entry,
        key: parts.length === 1 ? entry.key : `${entry.key}:written-${part.index}`,
        duration: musicalDuration(part.beats),
        startOffsetBeats: isWrittenPart
          ? entry.startOffsetBeats
          : addRational(entry.startOffsetBeats, part.offsetBeats),
        writtenRhythm: part,
        ...(entry.kind === "chord" || entry.kind === "note"
          ? {
              continuesFromPrevious: Boolean(entry.continuesFromPrevious),
              continuesToNext: Boolean(entry.continuesToNext),
            }
          : {}),
      }));
    }),
  );
}
function expandSystemMeasure(
  measure: StaffSystemMeasureInput,
  meter: Meter,
): StaffSystemMeasureInput {
  const melodyLanes = measure.melodyLanes?.map((lane) => ({
    ...lane,
    entries: expandStaffSequenceEntries(lane.entries, meter),
  }));
  return Object.freeze({
    ...measure,
    harmonyEntries: expandStaffSequenceEntries(measure.harmonyEntries, meter),
    ...(measure.melodyEntries
      ? { melodyEntries: expandStaffSequenceEntries(measure.melodyEntries, meter) }
      : {}),
    ...(melodyLanes ? { melodyLanes: Object.freeze(melodyLanes) } : {}),
  });
}
export type StaffClef = "treble" | "bass";
export interface StaffSequenceRenderOptions {
  readonly clef?: StaffClef;
  readonly suzukiColors?: boolean;
}
export interface StaffProjectionRenderOptions {
  readonly suzukiColors?: boolean;
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
  readonly melodyLanes?: readonly StaffSystemMelodyLaneInput[];
}
export interface StaffSystemMelodyLaneInput {
  readonly id: string;
  readonly clef: StaffClef;
  readonly entries: readonly StaffSequenceEntry[];
}
export type StaffSystemStaff = "melody" | "harmony" | "bass" | `melody:${string}`;
export interface StaffSystemPosition extends StaffSequencePosition {
  readonly staff: StaffSystemStaff;
  readonly measureIndex: number;
}
export type TabFingeringStyle = "badge" | "dots" | "numbers";
export const GUITAR_FINGER_COLORS: Record<number, string> = {
  0: "#9ca3af",
  ...GUITAR_FINGER_COLOR_PALETTE,
};
export interface StaffSystemRenderOptions {
  readonly widthPx?: number;
  readonly showTimeSignature?: boolean;
  readonly showBass?: boolean;
  readonly melodyClef?: StaffClef;
  readonly suzukiColors?: boolean;
  readonly isTablature?: boolean;
  readonly showFingering?: boolean;
  readonly fingeringStyle?: TabFingeringStyle | undefined;
}
interface RenderedSequenceTickable {
  readonly entry: StaffSequenceEntry;
  readonly note: StaveNote | TabNote | GhostNote;
  readonly rhythm: StaffRhythm;
}

function noteElementId(note: StaveNote | TabNote | GhostNote): string | undefined {
  const internal = note as unknown as { readonly attrs?: { readonly id?: string } };
  return note.getAttribute("id") || internal.attrs?.id;
}
/**
 * A tuplet describes a rhythmic group, not an individual note. Compatible
 * triplet tickables are grouped; custom exact ratios remain owner-scoped.
 */
function createSequenceTuplets(
  rendered: readonly RenderedSequenceTickable[],
  eligible: (entry: StaffSequenceEntry) => boolean,
): readonly Tuplet[] {
  const voices = new Map<string, RenderedSequenceTickable[]>();
  rendered.forEach((item) => {
    const key = item.entry.rhythmicVoice ?? "default";
    const voice = voices.get(key) ?? [];
    voice.push(item);
    voices.set(key, voice);
  });
  if (voices.size > 1) {
    return Object.freeze(
      [...voices.values()].flatMap((voice) => createSequenceTuplets(voice, eligible)),
    );
  }
  if (voices.size === 1) rendered = [...voices.values()][0]!;

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
    const nextSignature = `${specification.numNotes}:${specification.notesOccupied}:${item.rhythm.vexDuration}:${item.rhythm.notation.startsWith("tuplet-") ? item.entry.key : ""}`;
    if (signature !== null && signature !== nextSignature) flush();
    signature = nextSignature;
    pending.push(item);
    if (item.rhythm.notation.startsWith("tuplet-") || pending.length === specification.numNotes)
      flush();
  }
  flush();
  return Object.freeze(tuplets);
}

function renderedRhythmicVoiceGroups<T extends RenderedSequenceTickable>(
  rendered: readonly T[],
): readonly (readonly T[])[] {
  const voices = new Map<string, T[]>();
  rendered.forEach((item) => {
    const key = item.entry.rhythmicVoice ?? "default";
    const voice = voices.get(key) ?? [];
    voice.push(item);
    voices.set(key, voice);
  });
  return Object.freeze([...voices.values()].map((voice) => Object.freeze(voice)));
}

function createSystemVoices(rendered: readonly RenderedSequenceTickable[], meter: Meter): Voice[] {
  return renderedRhythmicVoiceGroups(rendered).map((items) => {
    const voice = new Voice({ numBeats: meter.numerator, beatValue: meter.denominator }).setMode(
      Voice.Mode.SOFT,
    );
    const orderedItems = [...items].sort((left, right) =>
      compareRational(left.entry.startOffsetBeats, right.entry.startOffsetBeats),
    );
    const tickables: (StaveNote | TabNote | GhostNote)[] = [];
    let cursor = ZERO;
    orderedItems.forEach((item) => {
      const onset = item.entry.startOffsetBeats;
      if (compareRational(onset, cursor) > 0) {
        const stave = item.note.getStave();
        if (!stave) throw new Error(`Missing stave for rhythmic entry ${item.entry.key}`);
        tickables.push(createGapNote(stave, musicalDuration(subtractRational(onset, cursor))));
      }
      tickables.push(item.note);
      const end = addRational(onset, item.entry.duration.beats);
      if (compareRational(end, cursor) > 0) cursor = end;
    });
    voice.addTickables(tickables);
    return voice;
  });
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
  attachRhythmicDots(note, rhythm.dots);
  note.setStave(stave);
  note.setStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK });
  note.preFormat();
  return note;
}
function createGapNote(stave: Stave, duration: MusicalDuration): GhostNote {
  const note = new GhostNote({ duration: "q", durationOverride: exactDurationFraction(duration) });
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
    spacingBetweenLinesPx: SYSTEM_STAFF_LINE_SPACING,
  });
  probeStave.addClef(clef).addTimeSignature(`${meter.numerator}/${meter.denominator}`);
  const staffCenter = probeStave.getYForLine(2);
  let topDistance = MIN_SEQUENCE_HEIGHT / 2;
  let bottomDistance = MIN_SEQUENCE_HEIGHT / 2;
  entries.forEach((entry) => {
    if (entry.kind !== "chord" && entry.kind !== "note") return;
    const rhythm = staffRhythmForEntry(entry);
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
  svg.querySelectorAll<SVGPathElement>(".vf-stave path, .vf-stavenote > path").forEach((path) => {
    path.setAttribute("stroke-width", "1");
    path.setAttribute("shape-rendering", "crispEdges");
  });
  return svg;
}
export function renderStaffProjection(
  container: HTMLDivElement,
  projection: StaffProjectionDto,
  duration: MusicalDuration,
  options?: StaffProjectionRenderOptions,
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
  stave.setDefaultLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK, lineWidth: 1 });
  stave.setContext(context).draw();
  const note = createStaffNote(
    projection,
    stave,
    rhythm,
    duration,
    true,
    STAFF_INK,
    "treble",
    options?.suzukiColors ?? false,
  );
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
/** * Renders all onset events belonging to one measure on a shared paper staff. * This is intentionally a separate helper from the single-chord card renderer: * a measure can contain several independent attacks and explicit rests. */ export function renderStaffSequence(
  container: HTMLDivElement,
  entries: readonly StaffSequenceEntry[],
  meter: Meter,
  onLayout?: (positions: readonly StaffSequencePosition[]) => void,
  options: StaffSequenceRenderOptions = {},
): () => void {
  container.replaceChildren();
  entries = expandStaffSequenceEntries(entries, meter);
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
    spacingBetweenLinesPx: SYSTEM_STAFF_LINE_SPACING,
  };
  const stave = new Stave(layout.staveX, layout.staveY, layout.staveWidth, staveOptions);
  stave.addClef(clef).addTimeSignature(`${meter.numerator}/${meter.denominator}`);
  stave.setDefaultLedgerLineStyle({ fillStyle: STAFF_INK, strokeStyle: STAFF_INK, lineWidth: 1 });
  stave.setContext(context).draw();
  const bassStave = hasBassStaff
    ? new Stave(layout.staveX, layout.bassStaveY!, layout.staveWidth, staveOptions)
    : undefined;
  if (bassStave) {
    bassStave.addClef("bass").addTimeSignature(`${meter.numerator}/${meter.denominator}`);
    bassStave.setDefaultLedgerLineStyle({
      fillStyle: STAFF_INK,
      strokeStyle: STAFF_INK,
      lineWidth: 1,
    });
    bassStave.setContext(context).draw();
    new StaveConnector(stave, bassStave).setType("brace").setContext(context).draw();
    new StaveConnector(stave, bassStave).setType("singleLeft").setContext(context).draw();
    new StaveConnector(stave, bassStave).setType("singleRight").setContext(context).draw();
  }
  const playingInk =
    getComputedStyle(container).getPropertyValue("--piano-pressed-key-border").trim() ||
    STAFF_PLAYING_INK_FALLBACK;
  const suzukiColors = options.suzukiColors ?? false;
  const notes = entries.map((entry) => {
    const rhythm = staffRhythmForEntry(entry);
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
              suzukiColors,
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
        const rhythm = staffRhythmForEntry(entry);
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
            suzukiColors,
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
  drawConnectedTies(
    container,
    context,
    [
      ...notes.map((item) => ({ ...item, staff: "staff", measureIndex: 0 })),
      ...bassNotes.map((item) => ({ ...item, staff: "bass", measureIndex: 0 })),
    ],
    meter,
    0,
    1,
  );
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
  notes.forEach(({ note, entry }) => {
    const rawId = noteElementId(note);
    if (!rawId) return;
    const domId = rawId.startsWith("vf-") ? rawId : `vf-${rawId}`;
    const svgEl =
      container.querySelector<SVGElement>(`#${domId}`) ??
      container.querySelector<SVGElement>(`#${rawId}`);
    if (svgEl) {
      svgEl.setAttribute("data-staff-entry", entry.key);
      if ((entry.kind === "chord" || entry.kind === "note") && entry.highlighted) {
        svgEl.setAttribute("data-staff-playing", "true");
      }
    }
  });
  bassNotes.forEach(({ note, entry }) => {
    const rawId = noteElementId(note);
    if (!rawId) return;
    const domId = rawId.startsWith("vf-") ? rawId : `vf-${rawId}`;
    const svgEl =
      container.querySelector<SVGElement>(`#${domId}`) ??
      container.querySelector<SVGElement>(`#${rawId}`);
    if (svgEl) {
      svgEl.setAttribute("data-bass-staff-entry", entry.key);
      if (entry.kind === "chord" && entry.highlighted && entry.bassProjection) {
        svgEl.setAttribute("data-staff-playing", "true");
      }
    }
  });
  svg.querySelectorAll<SVGPathElement>(".vf-stave path, .vf-stavenote > path").forEach((path) => {
    path.setAttribute("stroke-width", "1");
    path.setAttribute("shape-rendering", "crispEdges");
  });
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
interface RenderedTieItem {
  readonly entry: StaffSequenceEntry;
  readonly note: StaveNote | TabNote | GhostNote;
  readonly staff: string;
  readonly measureIndex: number;
}

function tieMembers(
  item: RenderedTieItem,
): readonly { readonly index: number; readonly key: string }[] {
  if (item.entry.kind !== "chord" && item.entry.kind !== "note") return [];
  const sourceKeys = item.entry.sourceEventKeys;
  if (!sourceKeys?.length) return [];
  const isTab = item.note instanceof TabNote;
  const projectionNotes =
    item.entry.kind === "chord" || item.entry.kind === "note" ? item.entry.projection.notes : [];
  const count = isTab ? item.note.getPositions().length : projectionNotes.length;
  return Array.from({ length: count }, (_, index) => {
    const sourceKey = sourceKeys[index] ?? sourceKeys[0]!;
    if (isTab) {
      const position = item.note.getPositions()[index];
      return {
        index,
        key: `${sourceKey}|${item.entry.rhythmicVoice ?? "default"}|tab:${position?.str}:${position?.fret}`,
      };
    }
    return {
      index,
      key: `${sourceKey}|${item.entry.rhythmicVoice ?? "default"}|pitch:${projectionNotes[index]?.vexKey ?? index}`,
    };
  });
}

function continuesInto(item: RenderedTieItem): boolean {
  const rhythm = item.entry.writtenRhythm;
  return (
    Boolean(
      item.entry.kind !== "rest" && item.entry.kind !== "gap" && item.entry.continuesToNext,
    ) || Boolean(rhythm && rhythm.index < rhythm.count - 1)
  );
}

function continuesFrom(item: RenderedTieItem): boolean {
  const rhythm = item.entry.writtenRhythm;
  return (
    Boolean(
      item.entry.kind !== "rest" && item.entry.kind !== "gap" && item.entry.continuesFromPrevious,
    ) || Boolean(rhythm && rhythm.index > 0)
  );
}

function drawOwnedTie(
  container: HTMLDivElement,
  context: ReturnType<Renderer["getContext"]>,
  first: RenderedTieItem | undefined,
  last: RenderedTieItem | undefined,
  firstIndex: number | undefined,
  lastIndex: number | undefined,
  ownerKey: string,
  memberKey: string,
  staff: string,
  kind: "complete" | "system-edge-left" | "system-edge-right",
): void {
  const firstNote =
    first?.note instanceof StaveNote || first?.note instanceof TabNote ? first.note : undefined;
  const lastNote =
    last?.note instanceof StaveNote || last?.note instanceof TabNote ? last.note : undefined;
  const useTabTie = firstNote instanceof TabNote || lastNote instanceof TabNote;
  const tie = useTabTie
    ? new TabTie({
        ...(firstNote ? { firstNote } : {}),
        ...(lastNote ? { lastNote } : {}),
        ...(firstIndex !== undefined ? { firstIndexes: [firstIndex] } : {}),
        ...(lastIndex !== undefined ? { lastIndexes: [lastIndex] } : {}),
      })
    : new StaveTie({
        ...(firstNote ? { firstNote } : {}),
        ...(lastNote ? { lastNote } : {}),
        ...(firstIndex !== undefined ? { firstIndexes: [firstIndex] } : {}),
        ...(lastIndex !== undefined ? { lastIndexes: [lastIndex] } : {}),
      });
  tie.setContext(context).draw();
  const group = Array.from(container.querySelectorAll<SVGGElement>("g.vf-stavetie")).at(-1);
  group?.setAttribute("data-tie-kind", kind);
  group?.setAttribute("data-tie-staff", staff);
  group?.setAttribute("data-tie-owner-key", ownerKey);
  group?.setAttribute("data-tie-member-key", memberKey);
  if (first) group?.setAttribute("data-tie-first-entry", first.entry.key);
  if (last) group?.setAttribute("data-tie-last-entry", last.entry.key);
}

function drawConnectedTies(
  container: HTMLDivElement,
  context: ReturnType<Renderer["getContext"]>,
  rendered: readonly RenderedTieItem[],
  meter: Meter,
  systemStartMeasure: number,
  systemEndMeasure: number,
): void {
  const barLength = rational(meter.numerator * 4, meter.denominator);
  const timeline = rendered.flatMap((item) =>
    tieMembers(item).map((member) => {
      const start = addRational(
        multiplyRational(barLength, rational(item.measureIndex)),
        item.entry.startOffsetBeats,
      );
      return {
        item,
        member,
        start,
        end: addRational(start, item.entry.duration.beats),
      };
    }),
  );
  const matchedIncoming = new Set<string>();
  const matchedOutgoing = new Set<string>();
  timeline.forEach((left) => {
    if (!continuesInto(left.item)) return;
    const right = timeline.find(
      (candidate) =>
        candidate.item.staff === left.item.staff &&
        candidate.member.key === left.member.key &&
        compareRational(candidate.start, left.end) === 0 &&
        continuesFrom(candidate.item),
    );
    if (!right) return;
    matchedOutgoing.add(`${left.item.staff}|${left.member.key}|${left.item.entry.key}`);
    matchedIncoming.add(`${right.item.staff}|${right.member.key}|${right.item.entry.key}`);
    drawOwnedTie(
      container,
      context,
      left.item,
      right.item,
      left.member.index,
      right.member.index,
      left.member.key.split("|")[0]!,
      left.member.key,
      left.item.staff,
      "complete",
    );
  });
  const systemStart = multiplyRational(barLength, rational(systemStartMeasure));
  const systemEnd = multiplyRational(barLength, rational(systemEndMeasure));
  timeline.forEach((node) => {
    const identity = `${node.item.staff}|${node.member.key}|${node.item.entry.key}`;
    if (
      continuesFrom(node.item) &&
      compareRational(node.start, systemStart) === 0 &&
      !matchedIncoming.has(identity)
    ) {
      drawOwnedTie(
        container,
        context,
        undefined,
        node.item,
        undefined,
        node.member.index,
        node.member.key.split("|")[0]!,
        node.member.key,
        node.item.staff,
        "system-edge-left",
      );
    }
    if (
      continuesInto(node.item) &&
      compareRational(node.end, systemEnd) === 0 &&
      !matchedOutgoing.has(identity)
    ) {
      drawOwnedTie(
        container,
        context,
        node.item,
        undefined,
        node.member.index,
        undefined,
        node.member.key.split("|")[0]!,
        node.member.key,
        node.item.staff,
        "system-edge-right",
      );
    }
  });
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
        ...(entry.writtenRhythm ? { writtenRhythm: entry.writtenRhythm } : {}),
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
  const beams: Beam[] = [];
  const byVoice = new Map<string, RenderedSystemTickable[]>();
  rendered.forEach((item) => {
    const key = item.entry.rhythmicVoice ?? "default";
    const voice = byVoice.get(key) ?? [];
    voice.push(item);
    byVoice.set(key, voice);
  });
  byVoice.forEach((voice) => {
    let beamableRun: StemmableNote[] = [];
    const flush = () => {
      if (beamableRun.length > 1) {
        beams.push(
          ...Beam.generateBeams(beamableRun, {
            groups: beamGroupsForMeter(meter),
            beamRests: false,
            showStemlets: false,
          }),
        );
      }
      beamableRun = [];
    };
    voice.forEach(({ entry, note }) => {
      const rhythm = staffRhythmForEntry(entry);
      if (
        (entry.kind !== "note" && entry.kind !== "chord") ||
        (!(note instanceof StaveNote) && !(note instanceof TabNote)) ||
        !["8", "16", "32", "64"].includes(rhythm.vexDuration)
      ) {
        flush();
        return;
      }
      beamableRun.push(note);
    });
    flush();
  });
  return Object.freeze(beams);
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
    spacingBetweenLinesPx: SYSTEM_STAFF_LINE_SPACING,
  });
  probeStave.addClef(clef);
  if (showTimeSignature) probeStave.addTimeSignature(`${meter.numerator}/${meter.denominator}`);
  const staffCenter = probeStave.getYForLine(2);
  let topDistance = MIN_SEQUENCE_HEIGHT / 2;
  let bottomDistance = MIN_SEQUENCE_HEIGHT / 2;
  entries.forEach((entry) => {
    if (entry.kind !== "chord" && entry.kind !== "note") return;
    const rhythm = staffRhythmForEntry(entry);
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
    spacingBetweenLinesPx: SYSTEM_STAFF_LINE_SPACING,
  };
}
/** * Renders one continuous VexFlow SVG for a group of consecutive measures. * Each voice is formatted per measure, then its tick contexts are moved onto * the same explicit time axis across Melody, Harmony, and optional Bass rows. */ export function renderStaffSystem(
  container: HTMLDivElement,
  measures: readonly StaffSystemMeasureInput[],
  meter: Meter,
  onLayout?: (positions: readonly StaffSystemPosition[]) => void,
  options: StaffSystemRenderOptions = {},
): () => void {
  container.replaceChildren();
  if (measures.length === 0) return () => container.replaceChildren();
  measures = measures.map((measure) => expandSystemMeasure(measure, meter));
  const showBass =
    options.showBass ??
    measures.some((measure) =>
      measure.harmonyEntries.some(
        (entry) => entry.kind === "chord" && Boolean(entry.bassProjection),
      ),
    );
  const melodyLaneInputs = measures[0]?.melodyLanes;
  const hasMelodyLanes = melodyLaneInputs !== undefined && melodyLaneInputs.length > 0;
  const hasMelody =
    hasMelodyLanes || measures.some((measure) => measure.melodyEntries !== undefined);
  const rows: SystemRow[] = [];
  if (!options.isTablature) {
    if (melodyLaneInputs && melodyLaneInputs.length > 0) {
      melodyLaneInputs.forEach((lane) => {
        rows.push({
          staff: `melody:${lane.id}`,
          clef: lane.clef,
          entriesForMeasure: (measure) =>
            measure.melodyLanes?.find((candidate) => candidate.id === lane.id)?.entries ?? [],
        });
      });
    } else if (hasMelody) {
      rows.push({
        staff: "melody",
        clef: options.melodyClef ?? "treble",
        entriesForMeasure: (measure) => measure.melodyEntries ?? [],
      });
    }
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
    const entries = measures.flatMap((measure) => {
      const rowEntries = row.entriesForMeasure(measure);
      if (options.isTablature && row.staff === "harmony") {
        const melodyEntries =
          measure.melodyLanes?.flatMap((lane) => lane.entries) ?? measure.melodyEntries ?? [];
        return [...rowEntries, ...melodyEntries];
      }
      return rowEntries;
    });
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
    const isTablatureRow = Boolean(options.isTablature && row.staff === "harmony");
    const staves = measures.map((measure, measureIndex) => {
      const stave = isTablatureRow
        ? new TabStave(measureX[measureIndex]!, rowTop, measureWidths[measureIndex]!, {
            spacingBetweenLinesPx: TAB_LINE_SPACING,
            leftBar: true,
            rightBar: true,
          })
        : new Stave(measureX[measureIndex]!, rowTop, measureWidths[measureIndex]!, {
            ...systemStaveOptions(row.staff === "harmony" && showBass),
          });
      if (measureIndex === 0) {
        if (isTablatureRow) {
          stave.addClef("tab");
        } else {
          stave.addClef(row.clef);
        }
        if (showTimeSignature) stave.addTimeSignature(`${meter.numerator}/${meter.denominator}`);
      }
      const center = isTablatureRow ? stave.getYForLine(2.5) : stave.getYForLine(2);
      // getYForLine() is absolute, so preserve this row's top offset while
      // centering the stave. Subtracting the absolute value directly collapses
      // every row onto the first one.
      stave.setY(rowTop + rowHeight / 2 - (center - rowTop));
      stave.setDefaultLedgerLineStyle({
        fillStyle: STAFF_INK,
        strokeStyle: STAFF_INK,
        lineWidth: 1,
      });
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
    getComputedStyle(container).getPropertyValue("--score-playback-border").trim() ||
    getComputedStyle(container).getPropertyValue("--piano-pressed-key-border").trim() ||
    STAFF_PLAYING_INK_FALLBACK;
  const suzukiColors = options.suzukiColors ?? false;
  const positions: StaffSystemPosition[] = [];
  let tupletCount = 0;
  let beamCount = 0;
  const allRendered: RenderedSystemTickable[] = [];
  rowLayouts.forEach((rowLayout) => {
    measures.forEach((measure, measureIndex) => {
      const stave = rowLayout.staves[measureIndex]!;
      const entries = rowLayout.row.entriesForMeasure(measure);
      if (entries.length === 0) return;
      const isTab = Boolean(options.isTablature && rowLayout.row.staff === "harmony");
      const measureMelody = measure.melodyLanes?.[0]?.entries ?? measure.melodyEntries ?? [];
      const hasMeasureMelodyNotes = isTab && measureMelody.some((e) => e.kind === "note");
      if (hasMeasureMelodyNotes) {
        const renderedMelody: RenderedSystemTickable[] = measureMelody.map((entry) => {
          const rhythm = staffRhythmForEntry(entry);
          let note: StaveNote | TabNote | GhostNote;
          if (entry.kind === "gap") {
            note = createGapNote(stave, entry.duration);
          } else if (entry.kind === "rest") {
            note = createRestNote(stave, rhythm, entry.duration, rowLayout.row.clef);
          } else if (entry.kind === "note") {
            note = createTabSingleNote(
              stave as TabStave,
              entry,
              rhythm,
              entry.duration,
              entry.highlighted ? playingInk : STAFF_INK,
            );
          } else {
            note = createTabChordNote(
              stave as TabStave,
              entry,
              rhythm,
              entry.duration,
              entry.highlighted ? playingInk : STAFF_INK,
            );
          }
          note.setAttribute("data-staff-entry", entry.key);
          if (entry.kind === "note" && entry.highlighted) {
            note.setAttribute("data-staff-playing", "true");
          }
          return { entry, note, rhythm, staff: rowLayout.row.staff, measureIndex, stave };
        });
        const renderedHarmony: RenderedSystemTickable[] = entries.map((entry) => {
          const rhythm = staffRhythmForEntry(entry);
          let note: StaveNote | TabNote | GhostNote;
          let effectiveEntry = entry;
          if (entry.kind === "gap") {
            note = createGapNote(stave, entry.duration);
          } else if (entry.kind === "rest") {
            note = createRestNote(stave, rhythm, entry.duration, rowLayout.row.clef);
          } else if (entry.kind === "chord") {
            const chordOnset = rationalToNumber(entry.startOffsetBeats);
            const occupiedMelodyStrings = new Set<number>();
            measureMelody.forEach((m) => {
              if (m.kind === "note" && rationalToNumber(m.startOffsetBeats) === chordOnset) {
                m.tabPositions?.forEach((pos) => occupiedMelodyStrings.add(pos.str));
              }
            });
            const hasUnplacedPosition = (entry.tabPositions?.length ?? 0) === 0;
            const tabPositionConflict =
              hasUnplacedPosition ||
              (entry.tabPositions ?? []).some((pos) => occupiedMelodyStrings.has(pos.str));
            effectiveEntry = tabPositionConflict ? { ...entry, tabPositionConflict: true } : entry;
            note = createTabChordNote(
              stave as TabStave,
              entry,
              rhythm,
              entry.duration,
              tabPositionConflict ? "#c62828" : entry.highlighted ? playingInk : STAFF_INK,
            );
            if (tabPositionConflict) note.setAttribute("data-tab-position-conflict", "true");
          } else {
            note = createTabSingleNote(
              stave as TabStave,
              entry,
              rhythm,
              entry.duration,
              entry.highlighted ? playingInk : STAFF_INK,
            );
          }
          note.setAttribute("data-staff-entry", entry.key);
          if (entry.kind === "chord" && entry.highlighted) {
            note.setAttribute("data-staff-playing", "true");
          }
          return {
            entry: effectiveEntry,
            note,
            rhythm,
            staff: rowLayout.row.staff,
            measureIndex,
            stave,
          };
        });
        const melodyVoices = createSystemVoices(renderedMelody, meter);
        const harmonyVoices = createSystemVoices(renderedHarmony, meter);
        const voices = [...melodyVoices, ...harmonyVoices];
        const melodyTuplets = createSequenceTuplets(
          renderedMelody,
          (entry) => entry.kind !== "gap",
        );
        const harmonyTuplets = createSequenceTuplets(
          renderedHarmony,
          (entry) => entry.kind !== "gap",
        );
        const melodyBeams = createSystemBeams(renderedMelody, meter);
        const harmonyBeams = createSystemBeams(renderedHarmony, meter);
        tupletCount += melodyTuplets.length + harmonyTuplets.length;
        beamCount += melodyBeams.length + harmonyBeams.length;
        new Formatter().joinVoices(voices).formatToStave(voices, stave);
        const comparableStaves = rowLayouts.map((candidate) => candidate.staves[measureIndex]!);
        const timeStartX =
          Math.max(...comparableStaves.map((candidate) => candidate.getNoteStartX())) +
          SEQUENCE_NOTE_EDGE_PADDING;
        const timeEndX =
          Math.min(...comparableStaves.map((candidate) => candidate.getNoteEndX())) -
          SEQUENCE_NOTE_EDGE_PADDING;
        const usableWidth = Math.max(timeEndX - timeStartX, 1);
        const alignItem = (item: RenderedSystemTickable) => {
          const barLengthBeats = (meter.numerator * 4) / meter.denominator;
          const onsetRatio = rationalToNumber(item.entry.startOffsetBeats) / barLengthBeats;
          const targetX = timeStartX + Math.min(Math.max(onsetRatio, 0), 1) * usableWidth;
          const tickContext = item.note.getTickContext();
          tickContext.setX(targetX);
          tickContext.setX(targetX + (targetX - item.note.getAbsoluteX()));
        };
        renderedMelody.forEach(alignItem);
        renderedHarmony.forEach(alignItem);
        voices.forEach((voice) => voice.draw(context, stave));
        [...melodyBeams, ...harmonyBeams].forEach((beam) => beam.setContext(context).draw());
        [...melodyTuplets, ...harmonyTuplets].forEach((tuplet) =>
          tuplet.setContext(context).draw(),
        );
        renderedMelody.forEach((item) => allRendered.push(item));
        renderedHarmony.forEach((item) => allRendered.push(item));
        [...renderedMelody, ...renderedHarmony].forEach((item) => {
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
        return;
      }
      const rendered = entries.map((entry) => {
        const rhythm = staffRhythmForEntry(entry);
        let note: StaveNote | TabNote | GhostNote;
        if (entry.kind === "gap") {
          note = createGapNote(stave, entry.duration);
        } else if (entry.kind === "rest") {
          note = createRestNote(stave, rhythm, entry.duration, rowLayout.row.clef);
        } else if (isTab && entry.kind === "chord") {
          note = createTabChordNote(
            stave as TabStave,
            entry,
            rhythm,
            entry.duration,
            entry.tabPositionConflict ? "#c62828" : entry.highlighted ? playingInk : STAFF_INK,
          );
          if (entry.tabPositionConflict || !entry.tabPositions?.length) {
            note.setAttribute("data-tab-position-conflict", "true");
          }
        } else if (isTab && entry.kind === "note") {
          note = createTabSingleNote(
            stave as TabStave,
            entry,
            rhythm,
            entry.duration,
            entry.highlighted ? playingInk : STAFF_INK,
          );
        } else {
          note = createStaffNote(
            entry.projection,
            stave,
            rhythm,
            entry.duration,
            false,
            entry.highlighted ? playingInk : STAFF_INK,
            rowLayout.row.clef,
            suzukiColors,
          );
        }
        note.setAttribute("data-staff-entry", entry.key);
        if ((entry.kind === "chord" || entry.kind === "note") && entry.highlighted) {
          note.setAttribute("data-staff-playing", "true");
        }
        return { entry, note, rhythm, staff: rowLayout.row.staff, measureIndex, stave };
      });
      // Staff rests use the same compensated duration override as pitched notes.
      // Tablature rests are exact-duration ghost notes and must not be scaled again.
      const tuplets = createSequenceTuplets(rendered, (entry) => entry.kind !== "gap");
      const beams = createSystemBeams(rendered, meter);
      tupletCount += tuplets.length;
      beamCount += beams.length;
      // Entries are positioned from their exact onset below; a soft VexFlow

      // voice permits overlapping authored notes without serializing them.
      const voices = createSystemVoices(rendered, meter);
      new Formatter().joinVoices(voices).formatToStave(voices, stave);
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
      voices.forEach((voice) => voice.draw(context, stave));
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
    });
  });
  drawConnectedTies(
    container,
    context,
    allRendered,
    meter,
    measures[0]!.measureIndex,
    measures.at(-1)!.measureIndex + 1,
  );
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
  allRendered.forEach(({ note, entry, stave }) => {
    const rawId = noteElementId(note);
    if (!rawId) return;
    const domId = rawId.startsWith("vf-") ? rawId : `vf-${rawId}`;
    const svgEl =
      container.querySelector<SVGElement>(`#${domId}`) ??
      container.querySelector<SVGElement>(`#${rawId}`);
    if (!svgEl) return;
    svgEl.setAttribute("data-staff-entry", entry.key);
    if (entry.sourceEventKeys?.length) {
      svgEl.setAttribute("data-source-event-keys", JSON.stringify(entry.sourceEventKeys));
    }
    if (entry.tabPositionConflict) {
      svgEl.setAttribute("data-tab-position-conflict", "true");
    }
    if (options.isTablature && svgEl.classList.contains("vf-tabnote")) {
      if (
        options.showFingering &&
        (entry.kind === "chord" || entry.kind === "note") &&
        entry.tabPositions &&
        entry.tabPositions.length > 0
      ) {
        const sortedPositions = [...entry.tabPositions].sort((a, b) => a.str - b.str);
        const textElements = Array.from(
          svgEl.querySelectorAll<SVGTextElement>("text:not(.vf-tab-finger)"),
        ).sort(
          (a, b) => parseFloat(a.getAttribute("y") || "0") - parseFloat(b.getAttribute("y") || "0"),
        );
        const rectElements = Array.from(svgEl.querySelectorAll<SVGRectElement>("rect")).sort(
          (a, b) => parseFloat(a.getAttribute("y") || "0") - parseFloat(b.getAttribute("y") || "0"),
        );
        const style: TabFingeringStyle = options.fingeringStyle ?? "badge";
        const fingerColors = GUITAR_FINGER_COLORS;
        const fingerNames: Record<number, string> = {
          1: "1: Указательный (Index)",
          2: "2: Средний (Middle)",
          3: "3: Безымянный (Ring)",
          4: "4: Мизинец (Pinky)",
        };
        const tabStave = stave instanceof TabStave ? stave : null;
        sortedPositions.forEach((pos, idx) => {
          if (pos.finger !== undefined && pos.finger > 0 && pos.fret > 0) {
            let baseText: SVGTextElement | undefined = undefined;
            if (tabStave) {
              const targetY = tabStave.getYForLine(pos.str - 1);
              baseText = textElements.find(
                (el) => Math.abs(parseFloat(el.getAttribute("y") || "0") - targetY) < 7,
              );
            }
            if (!baseText) {
              baseText = textElements[idx];
            }
            if (baseText) {
              const textY = parseFloat(baseText.getAttribute("y") || "0");
              const baseRect =
                rectElements.find(
                  (r) => Math.abs(parseFloat(r.getAttribute("y") || "0") - (textY - 3)) < 6,
                ) ?? rectElements[idx];
              const rectX = parseFloat(
                baseRect?.getAttribute("x") || baseText.getAttribute("x") || "0",
              );
              const rectW = parseFloat(
                baseRect?.getAttribute("width") || (pos.fret >= 10 ? "16" : "11"),
              );
              const rectY = parseFloat(baseRect?.getAttribute("y") || "0");
              const rectH = parseFloat(baseRect?.getAttribute("height") || "6");
              const lineY = rectY > 0 ? rectY + rectH / 2 : textY - 3;
              const centerX = rectX + rectW / 2;
              const rectRight = rectX + rectW;
              if (style === "badge") {
                // Circle under the fret number!
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", String(centerX));
                circle.setAttribute("cy", String(lineY));
                circle.setAttribute("r", "7.1");
                circle.setAttribute("class", "vf-tab-fret-badge vf-tab-finger-badge");
                circle.setAttribute("data-tab-finger", String(pos.finger));
                circle.setAttribute("fill", fingerColors[pos.finger] || "#475569");
                const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
                title.textContent = `Лад ${pos.fret} — ${fingerNames[pos.finger] ?? `Палец ${pos.finger}`}`;
                circle.appendChild(title);
                baseText.classList.add("vf-tab-fret-text-with-badge");
                baseText.setAttribute("data-tab-finger", String(pos.finger));
                baseText.setAttribute("fill", "#ffffff");
                // Insert circle right before baseText so baseText renders on top of circle
                svgEl.insertBefore(circle, baseText);
              } else if (style === "dots") {
                // Pure color dot beside fret number
                const cx = rectRight + 6;
                const cy = lineY;
                const badgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                badgeGroup.setAttribute("class", "vf-tab-finger-dot vf-tab-finger-badge");
                badgeGroup.setAttribute("data-tab-finger", String(pos.finger));
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", String(cx));
                circle.setAttribute("cy", String(cy));
                circle.setAttribute("r", "4.5");
                circle.setAttribute("class", "vf-tab-finger-circle");
                circle.setAttribute("fill", fingerColors[pos.finger] || "#475569");
                const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
                title.textContent = fingerNames[pos.finger] ?? `Палец ${pos.finger}`;
                circle.appendChild(title);
                badgeGroup.appendChild(circle);
                svgEl.appendChild(badgeGroup);
              } else {
                // Numbered circle beside fret number
                const cx = rectRight + 8;
                const cy = lineY;
                const badgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                badgeGroup.setAttribute("class", "vf-tab-finger-badge");
                badgeGroup.setAttribute("data-tab-finger", String(pos.finger));
                const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                circle.setAttribute("cx", String(cx));
                circle.setAttribute("cy", String(cy));
                circle.setAttribute("r", "5.5");
                circle.setAttribute("class", "vf-tab-finger-circle");
                circle.setAttribute("fill", fingerColors[pos.finger] || "#475569");
                const fingerSvg = document.createElementNS("http://www.w3.org/2000/svg", "text");
                fingerSvg.setAttribute("class", "vf-tab-finger vf-tab-finger-text");
                fingerSvg.setAttribute("data-tab-finger", String(pos.finger));
                fingerSvg.setAttribute("x", String(cx));
                fingerSvg.setAttribute("y", String(cy));
                fingerSvg.setAttribute("text-anchor", "middle");
                fingerSvg.setAttribute("dominant-baseline", "central");
                fingerSvg.textContent = String(pos.finger);
                badgeGroup.appendChild(circle);
                badgeGroup.appendChild(fingerSvg);
                svgEl.appendChild(badgeGroup);
              }
            }
          }
        });
      }
      if ((entry.kind === "chord" || entry.kind === "note") && entry.highlighted) {
        svgEl.setAttribute("data-staff-playing", "true");
        svgEl.querySelectorAll<SVGRectElement>("rect").forEach((rect) => {
          const y = parseFloat(rect.getAttribute("y") || "0");
          const h = parseFloat(rect.getAttribute("height") || "0");
          const x = parseFloat(rect.getAttribute("x") || "0");
          const w = parseFloat(rect.getAttribute("width") || "0");
          rect.setAttribute("y", String(y - 2));
          rect.setAttribute("height", String(h + 4));
          rect.setAttribute("x", String(x - 2));
          rect.setAttribute("width", String(w + 4));
          rect.setAttribute("rx", "3");
          rect.setAttribute("ry", "3");
        });
      }
    } else if ((entry.kind === "chord" || entry.kind === "note") && entry.highlighted) {
      svgEl.setAttribute("data-staff-playing", "true");
    }
  });
  svg.querySelectorAll<SVGPathElement>(".vf-stave path, .vf-stavenote > path").forEach((path) => {
    path.setAttribute("stroke-width", "1");
    path.setAttribute("shape-rendering", "crispEdges");
  });
  onLayout?.(Object.freeze(positions));
  return () => container.replaceChildren();
}
