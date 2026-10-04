import type { Project } from "../domain/project/project";
import type { MelodyEvent, MelodyInstrument } from "../domain/melody/types";
import { getMelodyInstrument } from "../domain/melody/instrumentCatalog";
import { getHarmonicModule } from "../domain/harmony/moduleRegistry";
import {
  classifyHarmonicNoteRole,
  createHarmonicNoteRoleContext,
  type HarmonicNoteRole,
} from "../domain/harmony/noteRoles";
import { realizeChord } from "../domain/harmony/realization";
import {
  addRational,
  compareRational,
  subtractRational,
  ZERO,
  type Rational,
} from "../domain/timing/rational";
import { createProgressionMeasureLayout } from "../domain/timing/measureLayout";
import { realizeOrderedPianoProgression } from "../instruments/piano/progressionRealization";
import { realizeProgressionStepChord } from "../domain/progression/transposition";
import type { ExactPitch } from "../domain/harmony/pitch";
import { createEffectiveMelodyTimeline } from "../domain/melody/effectiveTimeline";
import { projectWrittenRhythm, type WrittenRhythmPart } from "./writtenRhythmProjection";

export type MelodyStaffClef = "treble" | "bass";

export interface MelodyTimelineEvent extends MelodyEvent {
  readonly eventKey: string;
  readonly startBeats: Rational;
  readonly instrument: MelodyInstrument;
  readonly clef: MelodyStaffClef;
  readonly harmonicRole: HarmonicNoteRole;
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
  readonly harmonicRole: HarmonicNoteRole;
  readonly writtenRhythm: readonly WrittenRhythmPart[];
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
  readonly writtenRhythm: readonly WrittenRhythmPart[];
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

function splitTimelineSpan(
  span: TimelineSpan,
  barLength: Rational,
  meter: Project["globalTiming"]["meter"],
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
          harmonicRole: event.harmonicRole,
          writtenRhythm: projectWrittenRhythm(
            durationBeats,
            subtractRational(cursor, measure.startBeats),
            meter,
          ),
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
          writtenRhythm: projectWrittenRhythm(
            durationBeats,
            subtractRational(cursor, measure.startBeats),
            meter,
          ),
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
  meter: Project["globalTiming"]["meter"],
): readonly MelodyStaffMeasure[] {
  const mutableMeasures = layout.measures.map((measure) => ({
    startBeats: measure.startBeats,
    endBeats: measure.endBeats,
    entries: [] as MelodyStaffEntry[],
  }));
  spans.forEach((span) => splitTimelineSpan(span, barLengthBeats, meter, mutableMeasures));
  return Object.freeze(
    layout.measures.map((measure, measureIndex) => {
      const entries = mutableMeasures[measureIndex]!.entries.sort(
        (a, b) =>
          compareRational(a.startBeats, b.startBeats) ||
          (a.kind === b.kind ? 0 : a.kind === "note" ? -1 : 1),
      );
      return Object.freeze({
        measureIndex: measure.measureIndex,
        number: measure.number,
        startBeats: measure.startBeats,
        endBeats: measure.endBeats,
        entries: Object.freeze(entries),
      });
    }),
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
  const effectiveEvents = createEffectiveMelodyTimeline(project);
  const owners = new Map(project.progression.steps.map((step, stepIndex) => [step.id, stepIndex]));
  const noteSpans = effectiveEvents
    .map((event) => ({
      startBeats: event.startBeats,
      endBeats: addRational(event.startBeats, event.durationBeats),
    }))
    .sort((a, b) => compareRational(a.startBeats, b.startBeats));
  const mergedNoteSpans: { startBeats: Rational; endBeats: Rational }[] = [];
  noteSpans.forEach((span) => {
    const previous = mergedNoteSpans.at(-1);
    if (previous && compareRational(span.startBeats, previous.endBeats) <= 0) {
      if (compareRational(span.endBeats, previous.endBeats) > 0) previous.endBeats = span.endBeats;
    } else mergedNoteSpans.push({ ...span });
  });
  let cursor = ZERO;
  let restOrdinal = 0;
  project.progression.steps.forEach((step) => {
    const stepStart = cursor;
    const stepEnd = addRational(stepStart, step.duration.beats);
    let silenceCursor = stepStart;
    mergedNoteSpans.forEach((span) => {
      if (
        compareRational(span.endBeats, stepStart) <= 0 ||
        compareRational(span.startBeats, stepEnd) >= 0
      )
        return;
      const noteStart =
        compareRational(span.startBeats, stepStart) < 0 ? stepStart : span.startBeats;
      if (compareRational(silenceCursor, noteStart) < 0)
        spans.push({
          kind: "rest",
          startBeats: silenceCursor,
          endBeats: noteStart,
          ...(step.kind === "chord" ? { sourceStepId: step.id } : {}),
          sourceKind: step.kind === "rest" ? "rest-step" : "no-melody-chord",
          ordinal: restOrdinal++,
        });
      if (compareRational(span.endBeats, silenceCursor) > 0)
        silenceCursor = compareRational(span.endBeats, stepEnd) < 0 ? span.endBeats : stepEnd;
    });
    if (compareRational(silenceCursor, stepEnd) < 0) {
      spans.push({
        kind: "rest",
        startBeats: silenceCursor,
        endBeats: stepEnd,
        ...(step.kind === "chord" ? { sourceStepId: step.id } : {}),
        sourceKind: step.kind === "rest" ? "rest-step" : "no-melody-chord",
        ordinal: restOrdinal++,
      });
    }
    cursor = stepEnd;
  });
  effectiveEvents.forEach((event) => {
    const ownerIndex = owners.get(event.sourceStepId)!;
    const owner = project.progression.steps[ownerIndex]!;
    const realization = orderedRealizations[ownerIndex];
    const nextRealization = orderedRealizations.slice(ownerIndex + 1).find((item) => item !== null);
    const chord =
      owner.kind === "chord" ? realizeProgressionStepChord(owner, project.tonic) : undefined;
    const roleContext = createHarmonicNoteRoleContext({
      tonic: project.tonic,
      moduleId: project.activeModule,
      rootPitchClass: chord?.rootPitchClass ?? project.tonic,
      chordPitches:
        owner.kind === "chord" && realization
          ? [...realization.upperPitches, ...(realization.bassPitch ? [realization.bassPitch] : [])]
          : [],
      nextChordPitches: nextRealization
        ? [
            ...nextRealization.upperPitches,
            ...(nextRealization.bassPitch ? [nextRealization.bassPitch] : []),
          ]
        : [],
    });
    const role = classifyHarmonicNoteRole(((event.pitch.midiNumber % 12) + 12) % 12, roleContext);
    const source: MelodyEvent = {
      sourceStepId: event.sourceStepId,
      index: event.eventIndex,
      eventKey: event.eventKey,
      pitch: event.pitch,
      sourcePitchMidi: event.sourcePitchMidi,
      startOffsetBeats: ZERO,
      durationBeats: event.durationBeats,
    };
    const timelineEvent = Object.freeze({
      ...source,
      eventKey: event.eventKey,
      startBeats: event.startBeats,
      instrument: event.instrument,
      clef: melodyClefForInstrument(event.instrument),
      harmonicRole: role,
    });
    events.push(timelineEvent);
    spans.push({
      kind: "note",
      event: timelineEvent,
      startBeats: event.startBeats,
      endBeats: addRational(event.startBeats, event.durationBeats),
    });
    const bucket = laneBuckets.get(event.instrument);
    if (bucket) bucket.events.push(timelineEvent);
    else laneBuckets.set(event.instrument, { firstStepIndex: ownerIndex, events: [timelineEvent] });
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

  const measures = buildMeasures(layout, spans, layout.barLengthBeats, project.globalTiming.meter);
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
        project.globalTiming.meter,
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
