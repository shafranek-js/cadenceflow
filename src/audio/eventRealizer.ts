import type { AudioNoteEvent } from "./contracts";
import type { ChordStep, ProgressionStep } from "../domain/progression/step";
import type { ExactPitch, PitchClassIdentity } from "../domain/harmony/pitch";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import { realizeChord as realizeHarmonyChord } from "../domain/harmony/realization";
import { pianoProfile } from "../instruments/piano/profile";
import { resolveArticulationTiming } from "../instruments/piano/articulation";
import { resolveEffectiveNoteVelocity } from "../instruments/piano/dynamics";

export interface RealizeStepEventsInput {
  readonly step: ChordStep;
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly tempoBpm: number;
  readonly stepStartSeconds?: number;
  readonly previousPitches?: readonly ExactPitch[] | undefined;
  readonly randomSource?: (() => number) | undefined;
}

export interface RealizedStepEvents {
  readonly events: readonly AudioNoteEvent[];
  readonly stepDurationSeconds: number;
  readonly upperPitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch | undefined;
}

/**
 * Calculates musical duration in seconds given beats rational and tempo (BPM).
 */
export function beatsToSeconds(numerator: number, denominator: number, tempoBpm: number): number {
  if (tempoBpm <= 0) throw new RangeError("tempoBpm must be positive");
  const beats = numerator / denominator;
  return beats * (60 / tempoBpm);
}

/**
 * Realizes canonical performance AudioNoteEvents for a single Progression ChordStep.
 * Emits canonical events with exact pitch, relative start, duration, velocity, and channel role.
 */
export function realizeStepAudioEvents(input: RealizeStepEventsInput): RealizedStepEvents {
  const {
    step,
    tonic,
    context,
    tempoBpm,
    stepStartSeconds = 0,
    previousPitches,
    randomSource,
  } = input;

  const stepDurationSeconds = beatsToSeconds(
    step.duration.beats.numerator,
    step.duration.beats.denominator,
    tempoBpm,
  );

  const baseChord = realizeHarmonyChord(step.harmonicFunction, tonic);
  const chord = {
    ...baseChord,
    variant: step.harmonicVariant,
  };

  const realization = pianoProfile.realizeChord({
    context,
    chord,
    performance: step.performance,
    ...(previousPitches ? { previousPitches } : {}),
  });

  const timingIntents = resolveArticulationTiming(
    step.performance.articulation,
    realization.pitches,
    stepDurationSeconds,
    realization.bassPitch,
    randomSource ? { randomSource } : undefined,
  );

  const events: AudioNoteEvent[] = [];

  for (const intent of timingIntents) {
    const noteKey = String(intent.pitch.midiNumber);
    const velocity = resolveEffectiveNoteVelocity(
      step.performance.masterVelocity,
      noteKey,
      step.performance.perNoteVelocityOverrides,
    );

    events.push(
      Object.freeze({
        pitch: intent.pitch.midiNumber,
        startSeconds: stepStartSeconds + intent.startOffsetSeconds,
        durationSeconds: intent.durationSeconds,
        velocity,
        channelRole: intent.role,
      }),
    );
  }

  // Sort events chronologically, then by pitch ascending
  events.sort((a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch);

  return Object.freeze({
    events: Object.freeze(events),
    stepDurationSeconds,
    upperPitches: realization.pitches,
    bassPitch: realization.bassPitch,
  });
}

export interface RealizeProgressionEventsInput {
  readonly steps: readonly ProgressionStep[];
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly tempoBpm: number;
  readonly initialStartSeconds?: number;
  readonly randomSource?: () => number;
}

/**
 * Realizes canonical performance AudioNoteEvents across an entire sequence of progression steps.
 * Chains contextual voice leading between neighboring chord steps.
 */
export function realizeProgressionAudioEvents(
  input: RealizeProgressionEventsInput,
): readonly AudioNoteEvent[] {
  const { steps, tonic, context, tempoBpm, initialStartSeconds = 0, randomSource } = input;

  const allEvents: AudioNoteEvent[] = [];
  let currentStartSeconds = initialStartSeconds;
  let previousPitches: readonly ExactPitch[] | undefined;

  for (const step of steps) {
    if (step.kind === "rest") {
      const restDuration = beatsToSeconds(
        step.duration.beats.numerator,
        step.duration.beats.denominator,
        tempoBpm,
      );
      currentStartSeconds += restDuration;
      continue;
    }

    if (step.kind === "chord") {
      const stepResult = realizeStepAudioEvents({
        step,
        tonic,
        context,
        tempoBpm,
        stepStartSeconds: currentStartSeconds,
        ...(previousPitches ? { previousPitches } : {}),
        ...(randomSource ? { randomSource } : {}),
      });

      allEvents.push(...stepResult.events);
      currentStartSeconds += stepResult.stepDurationSeconds;
      previousPitches = stepResult.upperPitches;
    }
  }

  allEvents.sort((a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch);
  return Object.freeze(allEvents);
}
