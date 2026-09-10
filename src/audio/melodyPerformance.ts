import type { AudioNoteEvent } from "./contracts";
import { projectProgressionStepTimings } from "./eventRealizer";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { PitchClassIdentity } from "../domain/harmony/pitch";
import { realizeChordMelody } from "../domain/melody/projection";
import { melodyGridDuration } from "../domain/melody/patterns";
import type { MelodyTrackSettings } from "../domain/melody/types";
import type { ProgressionStep } from "../domain/progression/step";
import { projectSwingTiming, type GrooveSettings, type TimedEvent } from "../domain/timing/swing";
import {
  addRational,
  compareRational,
  rationalToNumber,
  type Rational,
} from "../domain/timing/rational";
import { resolveEffectiveNoteVelocity } from "../instruments/piano/dynamics";
import { realizeOrderedPianoProgression } from "../instruments/piano/progressionRealization";

export interface MelodyPerformanceEvent extends AudioNoteEvent {
  readonly channelRole: "melody";
  readonly eventKey: string;
  readonly sourceStepId: string;
  readonly sourcePitchMidi: number;
  readonly eventIndex: number;
  readonly stepIndex: number;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
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
  readonly groove?: GrooveSettings | undefined;
  readonly melodyTrack?: MelodyTrackSettings | undefined;
  readonly initialStartSeconds?: number | undefined;
}

function isStraightMelodyGrid(grid: Parameters<typeof melodyGridDuration>[0]): boolean {
  return !grid.endsWith("-triplet");
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
  const realizations = realizeOrderedPianoProgression({
    steps: input.steps,
    tonic: input.tonic,
    context: input.context,
  });
  const secondsPerBeat = 60 / input.tempoBpm;
  const initialStartSeconds = input.initialStartSeconds ?? 0;
  const events: MelodyPerformanceEvent[] = [];

  if (track?.muted) {
    return Object.freeze({
      events: Object.freeze([]),
      totalDurationBeats: projected.totalDurationBeats,
    });
  }

  input.steps.forEach((step, stepIndex) => {
    if (step.kind === "rest" || !step.melody) return;
    const realization = realizations[stepIndex];
    const timing = projected.timings.get(stepIndex);
    if (!realization || !timing) {
      throw new Error(`missing contextual melody realization for step ${step.id}`);
    }

    const phrase = realizeChordMelody({
      sourceStepId: step.id,
      upperPitches: realization.upperPitches,
      durationBeats: timing.durationBeats,
      recipe: step.melody,
    });
    const canSwing =
      (input.groove?.feel ?? "straight") === "swing" && isStraightMelodyGrid(step.melody.grid);
    const gridDuration = melodyGridDuration(step.melody.grid);
    const phraseTimedEvents: readonly TimedEvent[] = phrase.events.map((event) => ({
      startBeats: event.startOffsetBeats,
      durationBeats: event.durationBeats,
    }));
    const phraseEvents: readonly TimedEvent[] = canSwing
      ? projectSwingTiming(phraseTimedEvents, input.groove!, gridDuration)
      : phraseTimedEvents;

    phrase.events.forEach((sourceEvent, eventIndex) => {
      const timedEvent = phraseEvents[eventIndex]!;
      const startBeats = addRational(timing.startBeats, timedEvent.startBeats);
      const sourceVelocity = resolveEffectiveNoteVelocity(
        step.performance.masterVelocity,
        String(sourceEvent.sourcePitchMidi),
        step.performance.perNoteVelocityOverrides,
      );
      events.push(
        Object.freeze({
          pitch: sourceEvent.pitch.midiNumber,
          startSeconds: initialStartSeconds + rationalToNumber(startBeats) * secondsPerBeat,
          durationSeconds: rationalToNumber(timedEvent.durationBeats) * secondsPerBeat,
          velocity: sourceVelocity,
          channelRole: "melody" as const,
          eventKey: `${step.id}:${sourceEvent.index}`,
          sourceStepId: step.id,
          sourcePitchMidi: sourceEvent.sourcePitchMidi,
          eventIndex: sourceEvent.index,
          stepIndex,
          startBeats,
          durationBeats: timedEvent.durationBeats,
        }),
      );
    });
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
