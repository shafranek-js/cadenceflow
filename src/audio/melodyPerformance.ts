import type { AudioNoteEvent } from "./contracts";
import { projectProgressionStepTimings } from "./eventRealizer";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { PitchClassIdentity } from "../domain/harmony/pitch";
import { createEffectiveMelodyTimeline } from "../domain/melody/effectiveTimeline";
import { melodyGridDuration } from "../domain/melody/patterns";
import { projectSwingTiming, type TimedEvent } from "../domain/timing/swing";
import { snapshotChordMelody, type MelodyTrackSettings } from "../domain/melody/types";
import type { ProgressionStep } from "../domain/progression/step";
import {
  addRational,
  compareRational,
  rationalToNumber,
  subtractRational,
  type Rational,
} from "../domain/timing/rational";
import { resolveEffectiveNoteVelocity } from "../instruments/piano/dynamics";

export interface MelodyPerformanceEvent extends AudioNoteEvent {
  readonly channelRole: "melody";
  readonly eventKey: string;
  readonly sourceStepId: string;
  readonly sourcePitchMidi: number;
  readonly eventIndex: number;
  readonly stepIndex: number;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly instrument: MelodyTrackSettings["instrument"];
}

export interface MelodyPerformanceProjection {
  readonly events: readonly MelodyPerformanceEvent[];
  readonly totalDurationBeats: Rational;
}

export interface RealizeProgressionMelodyInput {
  readonly steps: readonly ProgressionStep[];
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly tempoBpm: number;
  readonly groove?: import("../domain/timing/swing").GrooveSettings | undefined;
  readonly melodyTrack?: MelodyTrackSettings | undefined;
  readonly initialStartSeconds?: number | undefined;
}

function melodyEventComparator(a: MelodyPerformanceEvent, b: MelodyPerformanceEvent): number {
  return (
    compareRational(a.startBeats, b.startBeats) ||
    a.pitch - b.pitch ||
    a.stepIndex - b.stepIndex ||
    a.eventIndex - b.eventIndex
  );
}

/**
 * Pure live Melody projection. It realizes all steps first so Play From Here
 * and loop ranges retain the same contextual upper voicing as full playback.
 */
export function realizeProgressionMelodyPerformance(
  input: RealizeProgressionMelodyInput,
): MelodyPerformanceProjection {
  if (!Number.isFinite(input.tempoBpm) || input.tempoBpm <= 0) {
    throw new RangeError("tempoBpm must be positive");
  }

  const track = input.melodyTrack;
  const projected = projectProgressionStepTimings(
    input.steps,
    input.groove ?? { feel: "straight", swingAmount: 0 },
  );
  const effective = createEffectiveMelodyTimeline({
    progression: { steps: input.steps },
    tonic: input.tonic,
    activeModule: input.context.moduleId,
    melodyTrack: track ?? { instrument: "flute", muted: false, solo: false, volume: 100 },
  });
  const secondsPerBeat = 60 / input.tempoBpm;
  const initialStartSeconds = input.initialStartSeconds ?? 0;
  const events: MelodyPerformanceEvent[] = [];
  const notesByStep = new Map<number, (typeof effective)[number][]>();
  effective.forEach((note) => {
    const notes = notesByStep.get(note.stepIndex) ?? [];
    notes.push(note);
    notesByStep.set(note.stepIndex, notes);
  });

  if (track?.muted) {
    return Object.freeze({
      events: Object.freeze([]),
      totalDurationBeats: projected.totalDurationBeats,
    });
  }

  const progressionEnd = projected.totalDurationBeats;
  effective.forEach((baseNote) => {
    let note = baseNote;
    const step = input.steps[note.stepIndex]!;
    const timing = projected.timings.get(note.stepIndex);
    if (!timing) throw new Error(`missing Step timing for Melody owner ${step.id}`);
    const chordMelody =
      step.kind === "chord" && step.melody ? snapshotChordMelody(step.melody) : undefined;
    const recipe =
      chordMelody?.mode === "generated"
        ? chordMelody.recipe
        : chordMelody?.mode === "authored"
          ? chordMelody.sourceRecipe
          : undefined;
    if (
      recipe?.rhythm === "even" &&
      (input.groove?.feel ?? "straight") === "swing" &&
      !recipe.grid.endsWith("-triplet")
    ) {
      const sameStep = notesByStep.get(note.stepIndex) ?? [];
      const timed: readonly TimedEvent[] = sameStep.map((item) => ({
        startBeats: subtractRational(item.startBeats, timing.startBeats),
        durationBeats: item.durationBeats,
      }));
      const swung = projectSwingTiming(timed, input.groove!, melodyGridDuration(recipe.grid));
      const adjusted = swung[sameStep.indexOf(baseNote)];
      if (adjusted)
        note = {
          ...baseNote,
          startBeats: addRational(timing.startBeats, adjusted.startBeats),
          durationBeats: adjusted.durationBeats,
        };
    }
    if (compareRational(note.startBeats, progressionEnd) >= 0) return;
    const effectiveEnd = addRational(note.startBeats, note.durationBeats);
    if (compareRational(effectiveEnd, progressionEnd) > 0)
      note = { ...note, durationBeats: subtractRational(progressionEnd, note.startBeats) };
    const sourceVelocity =
      step.kind === "chord"
        ? resolveEffectiveNoteVelocity(
            step.performance.masterVelocity,
            String(note.sourcePitchMidi),
            step.performance.perNoteVelocityOverrides,
          )
        : 100;
    events.push(
      Object.freeze({
        pitch: note.pitch.midiNumber,
        startSeconds: initialStartSeconds + rationalToNumber(note.startBeats) * secondsPerBeat,
        durationSeconds: rationalToNumber(note.durationBeats) * secondsPerBeat,
        velocity: sourceVelocity,
        channelRole: "melody" as const,
        eventKey: note.eventKey,
        sourceStepId: note.sourceStepId,
        sourcePitchMidi: note.sourcePitchMidi,
        eventIndex: note.eventIndex,
        stepIndex: note.stepIndex,
        startBeats: note.startBeats,
        durationBeats: note.durationBeats,
        instrument: note.instrument,
      }),
    );
  });

  events.sort(melodyEventComparator);
  return Object.freeze({
    events: Object.freeze(events),
    totalDurationBeats: projected.totalDurationBeats,
  });
}

export function melodyPerformanceToAudioEvents(
  projection: MelodyPerformanceProjection,
): readonly MelodyPerformanceEvent[] {
  return projection.events;
}

/**
 * Projects one authored Melody phrase for transient Chord Step audition.
 * The complete progression is still realized first so automatic voicing uses
 * the same preceding harmonic context as transport playback; only the chosen
 * Step is then retained and rebased to start at zero.
 */
export function realizeMelodyStepAudition(
  input: RealizeProgressionMelodyInput,
  sourceStepId: string,
): readonly MelodyPerformanceEvent[] {
  const selected = realizeProgressionMelodyPerformance(input).events.filter(
    (event) => event.sourceStepId === sourceStepId,
  );
  const first = selected[0];
  if (!first) return Object.freeze([]);
  return Object.freeze(
    selected.map((event) =>
      Object.freeze({
        ...event,
        startSeconds: event.startSeconds - first.startSeconds,
        startBeats: subtractRational(event.startBeats, first.startBeats),
      }),
    ),
  );
}
