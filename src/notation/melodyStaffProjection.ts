import type { ProgressionStep } from "../domain/progression/step";
import type { Project } from "../domain/project/project";
import { realizeChordMelody, type MelodyEvent } from "../domain/melody/projection";
import type { MelodyInstrument } from "../domain/melody/types";
import {
  getMelodyInstrument,
  resolveEffectiveMelodyInstrument,
} from "../domain/melody/instrumentCatalog";
import { getHarmonicModule } from "../domain/harmony/moduleRegistry";
import {
  addRational,
  compareRational,
  subtractRational,
  ZERO,
  type Rational,
} from "../domain/timing/rational";
import { createProgressionMeasureLayout } from "../domain/timing/measureLayout";
import {
  realizeOrderedPianoProgression,
  type OrderedPianoRealization,
} from "../instruments/piano/progressionRealization";
import type { ExactPitch } from "../domain/harmony/pitch";

export type MelodyStaffClef = "treble" | "bass";

export interface MelodyTimelineEvent extends MelodyEvent {
  readonly eventKey: string;
  readonly startBeats: Rational;
  readonly instrument: MelodyInstrument;
  readonly clef: MelodyStaffClef;
}

export interface MelodyStaffNoteFragment {
  readonly kind: "note";
  readonly key: string;
  readonly eventKey: string;
  readonly sourceStepId: string;
  readonly eventIndex: number;
  readonly pitch: ExactPitch;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly startOffsetBeats: Rational;
  readonly startsHere: boolean;
  readonly continuesFromPrevious: boolean;
  readonly continuesToNext: boolean;
  readonly instrument: MelodyInstrument;
  readonly clef: MelodyStaffClef;
}

export type MelodyRestSourceKind = "no-melody-chord" | "rest-step" | "virtual-gap";

export interface MelodyStaffRestFragment {
  readonly kind: "rest";
  readonly key: string;
  readonly sourceStepId?: string;
  readonly sourceKind: MelodyRestSourceKind;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly startOffsetBeats: Rational;
}

export type MelodyStaffEntry = MelodyStaffNoteFragment | MelodyStaffRestFragment;

export interface MelodyStaffMeasure {
  readonly measureIndex: number;
  readonly number: number;
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly entries: readonly MelodyStaffEntry[];
}

export interface MelodyInstrumentLane {
  readonly instrumentId: MelodyInstrument;
  readonly firstStepIndex: number;
  readonly clef: MelodyStaffClef;
  readonly events: readonly MelodyTimelineEvent[];
  readonly measures: readonly MelodyStaffMeasure[];
  /** Measure indexes containing at least one sounding note for this lane. */
  readonly activeSystemIndexes: readonly number[];
}

export interface MelodyTimeline {
  readonly instrument: MelodyInstrument;
  readonly clef: MelodyStaffClef;
  readonly events: readonly MelodyTimelineEvent[];
  readonly measures: readonly MelodyStaffMeasure[];
  readonly lanes: readonly MelodyInstrumentLane[];
}

interface TimelineSpanBase {
  readonly startBeats: Rational;
  readonly endBeats: Rational;
}

interface NoteSpan extends TimelineSpanBase {
  readonly kind: "note";
  readonly event: MelodyTimelineEvent;
}

interface RestSpan extends TimelineSpanBase {
  readonly kind: "rest";
  readonly sourceStepId?: string;
  readonly sourceKind: MelodyRestSourceKind;
  readonly ordinal: number;
}

type TimelineSpan = NoteSpan | RestSpan;

export function melodyClefForInstrument(instrument: MelodyInstrument): MelodyStaffClef {
  return getMelodyInstrument(instrument).clef;
}

function contextForProject(project: Project) {
  const mode = getHarmonicModule(project.activeModule).mode;
  return {
    tonic: project.tonic,
    mode,
    moduleId: project.activeModule,
    spellingContext: { tonic: project.tonic, mode },
  };
}

function barIndexForPosition(position: Rational, barLength: Rational): number {
  return Math.floor(
    (position.numerator * barLength.denominator) / (position.denominator * barLength.numerator),
  );
}

function endOfSpan(span: TimelineSpan): Rational {
  return span.endBeats;
}

function createMelodyEvent(
  sourceStepId: string,
  event: MelodyEvent,
  stepStart: Rational,
  instrument: MelodyInstrument,
): MelodyTimelineEvent {
  return Object.freeze({
    ...event,
    eventKey: `${sourceStepId}:${event.index}`,
    startBeats: addRational(stepStart, event.startOffsetBeats),
    instrument,
    clef: melodyClefForInstrument(instrument),
  });
}

function addStepSpan(
  step: ProgressionStep,
  stepStart: Rational,
  realization: OrderedPianoRealization | null,
  spans: TimelineSpan[],
  events: MelodyTimelineEvent[],
  restOrdinal: number,
  trackInstrument: MelodyInstrument,
): number {
  const stepEnd = addRational(stepStart, step.duration.beats);
  if (step.kind !== "chord" || step.melody === undefined) {
    spans.push({
      kind: "rest",
      startBeats: stepStart,
      endBeats: stepEnd,
      ...(step.kind === "chord" ? { sourceStepId: step.id } : {}),
      sourceKind: step.kind === "rest" ? "rest-step" : "no-melody-chord",
      ordinal: restOrdinal,
    });
    return restOrdinal + 1;
  }

  if (!realization) throw new Error(`missing piano realization for chord step ${step.id}`);
  const phrase = realizeChordMelody({
    sourceStepId: step.id,
    upperPitches: realization.upperPitches,
    durationBeats: step.duration.beats,
    recipe: step.melody,
  });
  const instrument = resolveEffectiveMelodyInstrument(
    step.melodyInstrumentOverride,
    trackInstrument,
  ).id;
  phrase.events.forEach((event) => {
    const timelineEvent = createMelodyEvent(step.id, event, stepStart, instrument);
    events.push(timelineEvent);
    spans.push({
      kind: "note",
      event: timelineEvent,
      startBeats: timelineEvent.startBeats,
      endBeats: addRational(timelineEvent.startBeats, timelineEvent.durationBeats),
    });
  });
  return restOrdinal;
}

function splitTimelineSpan(
  span: TimelineSpan,
  barLength: Rational,
  measures: {
    readonly startBeats: Rational;
    readonly endBeats: Rational;
    entries: MelodyStaffEntry[];
  }[],
): void {
  let cursor = span.startBeats;
  while (compareRational(cursor, endOfSpan(span)) < 0) {
    const measureIndex = barIndexForPosition(cursor, barLength);
    const measure = measures[measureIndex];
    if (!measure) throw new Error(`melody timeline has no measure ${measureIndex}`);
    const fragmentEnd =
      compareRational(endOfSpan(span), measure.endBeats) <= 0 ? endOfSpan(span) : measure.endBeats;
    const durationBeats = subtractRational(fragmentEnd, cursor);
    if (span.kind === "note") {
      const event = span.event;
      measure.entries.push(
        Object.freeze({
          kind: "note",
          key: `${event.eventKey}:m${measureIndex}`,
          eventKey: event.eventKey,
          sourceStepId: event.sourceStepId,
          eventIndex: event.index,
          pitch: event.pitch,
          startBeats: cursor,
          durationBeats,
          startOffsetBeats: subtractRational(cursor, measure.startBeats),
          startsHere: compareRational(cursor, event.startBeats) === 0,
          continuesFromPrevious: compareRational(cursor, event.startBeats) > 0,
          continuesToNext: compareRational(fragmentEnd, endOfSpan(span)) < 0,
          instrument: event.instrument,
          clef: event.clef,
        }),
      );
    } else {
      measure.entries.push(
        Object.freeze({
          kind: "rest",
          key: `${span.sourceKind}:${span.sourceStepId ?? "tail"}:${span.ordinal}:m${measureIndex}`,
          ...(span.sourceStepId ? { sourceStepId: span.sourceStepId } : {}),
          sourceKind: span.sourceKind,
          startBeats: cursor,
          durationBeats,
          startOffsetBeats: subtractRational(cursor, measure.startBeats),
        }),
      );
    }
    cursor = fragmentEnd;
  }
}

function buildMeasures(
  layout: ReturnType<typeof createProgressionMeasureLayout>,
  spans: readonly TimelineSpan[],
  barLengthBeats: Rational,
): readonly MelodyStaffMeasure[] {
  const mutableMeasures = layout.measures.map((measure) => ({
    startBeats: measure.startBeats,
    endBeats: measure.endBeats,
    entries: [] as MelodyStaffEntry[],
  }));
  spans.forEach((span) => splitTimelineSpan(span, barLengthBeats, mutableMeasures));
  return Object.freeze(
    layout.measures.map((measure, measureIndex) =>
      Object.freeze({
        measureIndex: measure.measureIndex,
        number: measure.number,
        startBeats: measure.startBeats,
        endBeats: measure.endBeats,
        entries: Object.freeze(mutableMeasures[measureIndex]!.entries),
      }),
    ),
  );
}

function fillLaneSpans(
  events: readonly MelodyTimelineEvent[],
  endBeats: Rational,
): readonly TimelineSpan[] {
  const spans: TimelineSpan[] = [];
  let cursor = ZERO;
  let ordinal = 0;
  events.forEach((event) => {
    const eventEnd = addRational(event.startBeats, event.durationBeats);
    if (compareRational(cursor, event.startBeats) < 0) {
      spans.push({
        kind: "rest",
        startBeats: cursor,
        endBeats: event.startBeats,
        sourceKind: "virtual-gap",
        ordinal: ordinal++,
      });
    }
    spans.push({ kind: "note", event, startBeats: event.startBeats, endBeats: eventEnd });
    if (compareRational(eventEnd, cursor) > 0) cursor = eventEnd;
  });
  if (compareRational(cursor, endBeats) < 0) {
    spans.push({
      kind: "rest",
      startBeats: cursor,
      endBeats,
      sourceKind: "virtual-gap",
      ordinal,
    });
  }
  return Object.freeze(spans);
}

/**
 * Derives the complete written Melody timeline without adding generated notes
 * to Project. The adapter deliberately consumes the Piano realization seam and
 * passes only its upper voicing to the accepted pure melody generator.
 */
export function createMelodyTimeline(project: Project): MelodyTimeline {
  const instrument = project.melodyTrack.instrument;
  const clef = melodyClefForInstrument(instrument);

  const layout = createProgressionMeasureLayout(
    project.progression.steps,
    project.globalTiming.meter,
  );
  const spans: TimelineSpan[] = [];
  const events: MelodyTimelineEvent[] = [];
  const laneBuckets = new Map<
    MelodyInstrument,
    { readonly firstStepIndex: number; readonly events: MelodyTimelineEvent[] }
  >();
  const context = contextForProject(project);
  const orderedRealizations = realizeOrderedPianoProgression({
    steps: project.progression.steps,
    tonic: project.tonic,
    context,
  });
  let cursor = ZERO;
  let restOrdinal = 0;
  project.progression.steps.forEach((step, stepIndex) => {
    const eventStart = events.length;
    restOrdinal = addStepSpan(
      step,
      cursor,
      orderedRealizations[stepIndex] ?? null,
      spans,
      events,
      restOrdinal,
      instrument,
    );
    if (step.kind === "chord" && step.melody !== undefined) {
      const stepEvents = events.slice(eventStart);
      const stepInstrument = resolveEffectiveMelodyInstrument(
        step.melodyInstrumentOverride,
        instrument,
      ).id;
      const bucket = laneBuckets.get(stepInstrument);
      if (bucket) bucket.events.push(...stepEvents);
      else laneBuckets.set(stepInstrument, { firstStepIndex: stepIndex, events: [...stepEvents] });
    }
    cursor = addRational(cursor, step.duration.beats);
  });
  if (compareRational(layout.playbackDurationBeats, cursor) > 0) {
    spans.push({
      kind: "rest",
      startBeats: cursor,
      endBeats: layout.playbackDurationBeats,
      sourceKind: "virtual-gap",
      ordinal: restOrdinal,
    });
  }

  const measures = buildMeasures(layout, spans, layout.barLengthBeats);
  const lanes = [...laneBuckets.entries()]
    .sort(
      ([a, aValue], [b, bValue]) =>
        aValue.firstStepIndex - bValue.firstStepIndex ||
        getMelodyInstrument(a).program - getMelodyInstrument(b).program ||
        a.localeCompare(b),
    )
    .map(([instrumentId, bucket]) => {
      const laneEvents = Object.freeze([...bucket.events]);
      const laneMeasures = buildMeasures(
        layout,
        fillLaneSpans(laneEvents, layout.playbackDurationBeats),
        layout.barLengthBeats,
      );
      const activeSystemIndexes = Object.freeze(
        laneMeasures
          .filter((measure) => measure.entries.some((entry) => entry.kind === "note"))
          .map((measure) => measure.measureIndex),
      );
      return Object.freeze({
        instrumentId,
        firstStepIndex: bucket.firstStepIndex,
        clef: melodyClefForInstrument(instrumentId),
        events: laneEvents,
        measures: laneMeasures,
        activeSystemIndexes,
      });
    });
  return Object.freeze({
    instrument,
    clef: events[0]?.clef ?? clef,
    events: Object.freeze(events),
    measures,
    lanes: Object.freeze(lanes),
  });
}

export const projectMelodyStaff = createMelodyTimeline;
