import {
  addRational,
  compareRational,
  rational,
  rationalToNumber,
  subtractRational,
  type Rational,
} from "../../src/domain/timing/rational";

export interface SpikeNote {
  readonly id: string;
  readonly pitch: "C4" | "E4" | "G4";
  readonly midi: number;
  readonly onset: Rational;
  readonly duration: Rational;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface TimelineGeometry {
  readonly left: number;
  readonly top: number;
  readonly pixelsPerBeat: number;
  readonly pixelsPerPitch: number;
  readonly highestMidi: number;
}

export interface TimelinePoint {
  readonly absoluteBeat: number;
  readonly midi: number;
}

export interface SelectionState {
  readonly selectedIds: readonly string[];
  readonly anchorId?: string;
}

export interface MeterFixture {
  readonly numerator: number;
  readonly denominator: number;
}

export interface ExactEndpointSetInput {
  readonly stepStart: Rational;
  readonly editableEnd: Rational;
  readonly meter: MeterFixture;
  readonly existingEndpoints?: readonly Rational[];
  readonly durationPresets?: readonly Rational[];
}

export interface ExactEndpointSnap {
  readonly endpoint: Rational;
  readonly duration: Rational;
  readonly clamp: "lower" | "upper" | null;
}

export interface ResizePreview {
  readonly note: SpikeNote;
  readonly endpoint: Rational;
  readonly duration: Rational;
  readonly clamp: "lower" | "upper" | null;
}

export interface InteractionSnapshot {
  readonly notes: readonly SpikeNote[];
  readonly invokerFocusId: string;
}

export interface InteractionState {
  readonly phase: "idle" | "preview";
  readonly invokerFocusId: string;
  readonly focusedId: string;
}

export const T199_FIXTURE: readonly SpikeNote[] = Object.freeze([
  Object.freeze({
    id: "note-c4",
    pitch: "C4" as const,
    midi: 60,
    onset: rational(0),
    duration: rational(1),
  }),
  Object.freeze({
    id: "note-e4",
    pitch: "E4" as const,
    midi: 64,
    onset: rational(1),
    duration: rational(1, 2),
  }),
  Object.freeze({
    id: "note-g4",
    pitch: "G4" as const,
    midi: 67,
    onset: rational(3, 2),
    duration: rational(1),
  }),
]);

export function cloneFixture(): readonly SpikeNote[] {
  return Object.freeze(
    T199_FIXTURE.map((note) =>
      Object.freeze({
        ...note,
        onset: rational(note.onset.numerator, note.onset.denominator),
        duration: rational(note.duration.numerator, note.duration.denominator),
      }),
    ),
  );
}

export function screenToTimelinePoint(
  point: ScreenPoint,
  geometry: TimelineGeometry,
): TimelinePoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("screen coordinates must be finite");
  }
  if (
    !Number.isFinite(geometry.pixelsPerBeat) ||
    !Number.isFinite(geometry.pixelsPerPitch) ||
    geometry.pixelsPerBeat <= 0 ||
    geometry.pixelsPerPitch <= 0
  ) {
    throw new RangeError("timeline scales must be finite and positive");
  }
  return {
    absoluteBeat: (point.x - geometry.left) / geometry.pixelsPerBeat,
    midi: geometry.highestMidi - Math.floor((point.y - geometry.top) / geometry.pixelsPerPitch),
  };
}

function noteBounds(note: SpikeNote, geometry: TimelineGeometry) {
  return {
    left: geometry.left + rationalToNumber(note.onset) * geometry.pixelsPerBeat,
    right:
      geometry.left +
      rationalToNumber(addRational(note.onset, note.duration)) * geometry.pixelsPerBeat,
    top: geometry.top + (geometry.highestMidi - note.midi) * geometry.pixelsPerPitch,
    bottom: geometry.top + (geometry.highestMidi - note.midi + 1) * geometry.pixelsPerPitch,
  };
}

function containsPoint(note: SpikeNote, point: ScreenPoint, geometry: TimelineGeometry) {
  const bounds = noteBounds(note, geometry);
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

export function selectAt(
  notes: readonly SpikeNote[],
  point: ScreenPoint,
  geometry: TimelineGeometry,
  extend = false,
  current: SelectionState = { selectedIds: [] },
): SelectionState {
  const hit = [...notes].reverse().find((note) => containsPoint(note, point, geometry));
  if (!hit) {
    return extend ? current : { selectedIds: [] };
  }
  if (!extend) {
    return { selectedIds: [hit.id], anchorId: hit.id };
  }
  const selectedIds = current.selectedIds.includes(hit.id)
    ? current.selectedIds.filter((id) => id !== hit.id)
    : [...current.selectedIds, hit.id];
  return { selectedIds, anchorId: current.anchorId ?? hit.id };
}

export function selectByMarquee(
  notes: readonly SpikeNote[],
  from: ScreenPoint,
  to: ScreenPoint,
  geometry: TimelineGeometry,
): SelectionState {
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);
  const top = Math.min(from.y, to.y);
  const bottom = Math.max(from.y, to.y);
  const selectedIds = notes
    .filter((note) => {
      const bounds = noteBounds(note, geometry);
      return (
        bounds.left < right && bounds.right > left && bounds.top < bottom && bounds.bottom > top
      );
    })
    .map((note) => note.id);
  return { selectedIds, anchorId: selectedIds[0] };
}

function lcm(a: number, b: number): number {
  const left = Math.abs(a);
  const right = Math.abs(b);
  let x = left;
  let y = right;
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return Math.abs((left / (x || 1)) * right) || 1;
}

function addUnique(target: Map<string, Rational>, value: Rational): void {
  target.set(`${value.numerator}/${value.denominator}`, value);
}

function sortRationals(values: readonly Rational[]): readonly Rational[] {
  return [...values].sort((a, b) => {
    const comparison = compareRational(a, b);
    if (comparison !== 0) return comparison;
    if (a.numerator !== b.numerator) return a.numerator - b.numerator;
    return a.denominator - b.denominator;
  });
}

export function buildExactEndpointCandidates({
  stepStart,
  editableEnd,
  meter,
  existingEndpoints = [],
  durationPresets = [],
}: ExactEndpointSetInput): readonly Rational[] {
  if (compareRational(editableEnd, stepStart) <= 0) {
    throw new RangeError("no positive exact endpoint is available");
  }
  const barLength = rational(meter.numerator * 4, meter.denominator);
  const latticeDenominator = [
    24,
    barLength.denominator,
    ...durationPresets.map((value) => value.denominator),
  ].reduce(lcm, 1);
  const quantum = rational(1, latticeDenominator);
  const candidates = new Map<string, Rational>();

  const span = subtractRational(editableEnd, stepStart);
  const latticeCount = Math.floor(
    (span.numerator * quantum.denominator) / (span.denominator * quantum.numerator),
  );
  const barCount = Math.floor(
    (editableEnd.numerator * barLength.denominator) /
      (editableEnd.denominator * barLength.numerator),
  );
  const maxMaterializedCandidates = 1_000_000;
  if (latticeCount + barCount > maxMaterializedCandidates) {
    throw new RangeError(
      `exact endpoint lattice exceeds ${maxMaterializedCandidates} candidates; snap arithmetically`,
    );
  }

  for (let index = 1; index <= latticeCount; index += 1) {
    const endpoint = addRational(
      stepStart,
      rational(index * quantum.numerator, quantum.denominator),
    );
    if (compareRational(endpoint, editableEnd) > 0) break;
    addUnique(candidates, endpoint);
  }

  for (const endpoint of existingEndpoints) {
    if (compareRational(endpoint, stepStart) > 0 && compareRational(endpoint, editableEnd) <= 0) {
      addUnique(candidates, endpoint);
    }
  }

  for (let index = 1; index <= barCount; index += 1) {
    const boundary = multiplyRational(barLength, rational(index));
    if (compareRational(boundary, editableEnd) > 0) break;
    if (compareRational(boundary, stepStart) > 0) addUnique(candidates, boundary);
  }

  for (const duration of durationPresets) {
    const endpoint = addRational(stepStart, duration);
    if (compareRational(endpoint, stepStart) > 0 && compareRational(endpoint, editableEnd) <= 0) {
      addUnique(candidates, endpoint);
    }
  }
  addUnique(candidates, editableEnd);
  return sortRationals([...candidates.values()]);
}

function multiplyRational(value: Rational, factor: Rational): Rational {
  return rational(value.numerator * factor.numerator, value.denominator * factor.denominator);
}

export function snapExactEndpoint(
  rawEndpointBeats: number,
  stepStart: Rational,
  editableEnd: Rational,
  candidates: readonly Rational[],
): ExactEndpointSnap {
  if (!Number.isFinite(rawEndpointBeats)) throw new RangeError("raw endpoint must be finite");
  if (candidates.length === 0) throw new RangeError("no positive exact endpoint is available");

  let selected = candidates[0]!;
  let selectedDistance = Math.abs(rawEndpointBeats - rationalToNumber(selected));
  for (const candidate of candidates.slice(1)) {
    const distance = Math.abs(rawEndpointBeats - rationalToNumber(candidate));
    const isCloser = distance < selectedDistance - Number.EPSILON;
    const isTie = Math.abs(distance - selectedDistance) <= Number.EPSILON;
    if (isCloser || (isTie && compareRational(candidate, selected) < 0)) {
      selected = candidate;
      selectedDistance = distance;
    }
  }

  const clamp =
    rawEndpointBeats < rationalToNumber(candidates[0]!)
      ? "lower"
      : rawEndpointBeats > rationalToNumber(editableEnd)
        ? "upper"
        : null;
  return {
    endpoint: selected,
    duration: subtractRational(selected, stepStart),
    clamp,
  };
}

export function resizeNotePreview(
  notes: readonly SpikeNote[],
  noteId: string,
  edge: "left" | "right",
  rawEndpointBeats: number,
  endpointInput: ExactEndpointSetInput,
): ResizePreview {
  const note = notes.find((candidate) => candidate.id === noteId);
  if (!note) throw new RangeError(`Unknown transient note: ${noteId}`);
  const stepStart = edge === "right" ? note.onset : endpointInput.stepStart;
  const endpoints = buildExactEndpointCandidates({ ...endpointInput, stepStart });
  const snap = snapExactEndpoint(rawEndpointBeats, stepStart, endpointInput.editableEnd, endpoints);
  const noteEnd = addRational(note.onset, note.duration);
  const nextOnset = edge === "left" ? snap.endpoint : note.onset;
  const nextDuration = edge === "left" ? subtractRational(noteEnd, snap.endpoint) : snap.duration;
  if (compareRational(nextDuration, rational(0)) <= 0) {
    throw new RangeError("resize must preserve a positive duration");
  }
  return {
    note: Object.freeze({ ...note, onset: nextOnset, duration: nextDuration }),
    endpoint: snap.endpoint,
    duration: nextDuration,
    clamp: snap.clamp,
  };
}

function quantizeScreenDelta(delta: number): Rational {
  return rational(Math.round(delta * 24), 24);
}

function movedNote(note: SpikeNote, deltaX: number, deltaY: number, geometry: TimelineGeometry) {
  const onset = addRational(note.onset, quantizeScreenDelta(deltaX / geometry.pixelsPerBeat));
  const midi = note.midi - Math.round(deltaY / geometry.pixelsPerPitch);
  if (compareRational(onset, rational(0)) < 0)
    throw new RangeError("move cannot precede beat zero");
  return Object.freeze({ ...note, onset, midi });
}

export function movePreview(
  notes: readonly SpikeNote[],
  selectedIds: readonly string[],
  delta: ScreenPoint,
  geometry: TimelineGeometry,
): readonly SpikeNote[] {
  const selected = new Set(selectedIds);
  return Object.freeze(
    notes.map((note) =>
      selected.has(note.id) ? movedNote(note, delta.x, delta.y, geometry) : note,
    ),
  );
}

export function ctrlDragDuplicatePreview(
  notes: readonly SpikeNote[],
  selectedIds: readonly string[],
  delta: ScreenPoint,
  geometry: TimelineGeometry,
): readonly SpikeNote[] {
  const selected = new Set(selectedIds);
  const usedIds = new Set(notes.map((note) => note.id));
  const copies = notes
    .filter((note) => selected.has(note.id))
    .map((note) => {
      let copyIndex = 1;
      let copyId = `${note.id}-copy-${copyIndex}`;
      while (usedIds.has(copyId)) {
        copyIndex += 1;
        copyId = `${note.id}-copy-${copyIndex}`;
      }
      usedIds.add(copyId);
      return movedNote({ ...note, id: copyId }, delta.x, delta.y, geometry);
    });
  return Object.freeze([...notes, ...copies]);
}

export function beginInteraction(
  notes: readonly SpikeNote[],
  invokerFocusId: string,
): InteractionSnapshot {
  return Object.freeze({
    notes: Object.freeze(notes.map((note) => Object.freeze({ ...note }))),
    invokerFocusId,
  });
}

export function beginPreview(snapshot: InteractionSnapshot): InteractionState {
  return {
    phase: "preview",
    invokerFocusId: snapshot.invokerFocusId,
    focusedId: "gesture-preview",
  };
}

export function escapePreview(state: InteractionState): InteractionState {
  return {
    phase: "idle",
    invokerFocusId: state.invokerFocusId,
    focusedId: state.invokerFocusId,
  };
}

export function cancelInteraction(snapshot: InteractionSnapshot): {
  readonly notes: readonly SpikeNote[];
  readonly state: InteractionState;
} {
  return {
    notes: cloneNotes(snapshot.notes),
    state: {
      phase: "idle",
      invokerFocusId: snapshot.invokerFocusId,
      focusedId: snapshot.invokerFocusId,
    },
  };
}

function cloneNotes(notes: readonly SpikeNote[]): readonly SpikeNote[] {
  return Object.freeze(
    notes.map((note) =>
      Object.freeze({
        ...note,
        onset: rational(note.onset.numerator, note.onset.denominator),
        duration: rational(note.duration.numerator, note.duration.denominator),
      }),
    ),
  );
}

export function keyboardExtendSelection(
  orderedIds: readonly string[],
  state: SelectionState,
  direction: "left" | "right",
): SelectionState {
  const anchorIndex = state.anchorId ? orderedIds.indexOf(state.anchorId) : -1;
  if (anchorIndex < 0) return state;
  const currentId = state.selectedIds[state.selectedIds.length - 1] ?? state.anchorId;
  const currentIndex = orderedIds.indexOf(currentId);
  const nextIndex = Math.max(
    0,
    Math.min(orderedIds.length - 1, currentIndex + (direction === "right" ? 1 : -1)),
  );
  const from = Math.min(anchorIndex, nextIndex);
  const to = Math.max(anchorIndex, nextIndex);
  return { selectedIds: orderedIds.slice(from, to + 1), anchorId: state.anchorId };
}
