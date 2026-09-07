import type { AudioNoteEvent } from "./contracts";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { ExactPitch, PitchClassIdentity } from "../domain/harmony/pitch";
import { realizeChord as realizeHarmonyChord } from "../domain/harmony/realization";
import type { ChordStep, ProgressionStep } from "../domain/progression/step";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  rationalToNumber,
  subtractRational,
  ZERO,
  type Rational,
} from "../domain/timing/rational";
import {
  groove as createGroove,
  projectSwingTiming,
  type GrooveSettings,
  type TimedEvent,
} from "../domain/timing/swing";
import {
  createDeterministicRandomSource,
  resolveEffectiveNoteVelocity,
} from "../instruments/piano/dynamics";
import { pianoProfile } from "../instruments/piano/profile";

const PERFORMANCE_GATE_RATIO = rational(19, 20);
const NUMBER_RATIONAL_PRECISION = 1_000_000;

export type PerformanceEventRole = "upper" | "bass";

export interface PerformanceBeatNoteEvent extends TimedEvent {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly emissionIndex: number;
  readonly pitch: number;
  readonly velocity: number;
  readonly channelRole: PerformanceEventRole;
}

export interface PerformanceStepRealization {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly upperPitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch | undefined;
}

export interface RealizedProgressionPerformance {
  readonly events: readonly PerformanceBeatNoteEvent[];
  readonly stepRealizations: readonly PerformanceStepRealization[];
  readonly totalDurationBeats: Rational;
}

export interface RealizeProgressionPerformanceInput {
  readonly steps: readonly ProgressionStep[];
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly tempoBpm: number;
  readonly groove?: GrooveSettings | undefined;
  readonly previousPitches?: readonly ExactPitch[] | undefined;
  readonly previousBassPitch?: ExactPitch | undefined;
  readonly randomSource?: (() => number) | undefined;
}

interface StepEnvelope extends TimedEvent {
  readonly stepIndex: number;
}

interface EffectiveStepTiming {
  readonly semanticStartBeats: Rational;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
}

function numberToRational(value: number): Rational {
  if (!Number.isFinite(value)) throw new RangeError("performance timing value must be finite");
  return rational(Math.round(value * NUMBER_RATIONAL_PRECISION), NUMBER_RATIONAL_PRECISION);
}

function minRational(a: Rational, b: Rational): Rational {
  return compareRational(a, b) <= 0 ? a : b;
}

function millisecondsToBeats(milliseconds: number, tempoBpm: number): Rational {
  return numberToRational((milliseconds / 1000) * (tempoBpm / 60));
}

function sortPitches(pitches: readonly ExactPitch[], descending: boolean): readonly ExactPitch[] {
  return pitches
    .map((pitch, index) => ({ pitch, index }))
    .sort((a, b) =>
      descending
        ? b.pitch.midiNumber - a.pitch.midiNumber || a.index - b.index
        : a.pitch.midiNumber - b.pitch.midiNumber || a.index - b.index,
    )
    .map(({ pitch }) => pitch);
}

function projectStepEnvelopes(
  steps: readonly ProgressionStep[],
  grooveSettings: GrooveSettings,
): {
  readonly timings: ReadonlyMap<number, EffectiveStepTiming>;
  readonly totalDurationBeats: Rational;
} {
  let cursor = ZERO;
  const semanticStarts = new Map<number, Rational>();
  const chordEnvelopes: StepEnvelope[] = [];

  steps.forEach((step, stepIndex) => {
    semanticStarts.set(stepIndex, cursor);
    if (step.kind === "chord") {
      chordEnvelopes.push({ stepIndex, startBeats: cursor, durationBeats: step.duration.beats });
    }
    cursor = addRational(cursor, step.duration.beats);
  });

  const projectedChords = projectSwingTiming(chordEnvelopes, grooveSettings);
  const projectedByIndex = new Map(projectedChords.map((entry) => [entry.stepIndex, entry]));
  const timings = new Map<number, EffectiveStepTiming>();

  steps.forEach((step, stepIndex) => {
    const semanticStartBeats = semanticStarts.get(stepIndex);
    if (!semanticStartBeats) throw new Error(`missing semantic timing for step ${stepIndex}`);
    const projected = projectedByIndex.get(stepIndex);
    timings.set(stepIndex, {
      semanticStartBeats,
      startBeats: projected?.startBeats ?? semanticStartBeats,
      durationBeats: projected?.durationBeats ?? step.duration.beats,
    });
  });

  return { timings, totalDurationBeats: cursor };
}

function performanceEventComparator(
  a: PerformanceBeatNoteEvent,
  b: PerformanceBeatNoteEvent,
): number {
  return (
    compareRational(a.startBeats, b.startBeats) ||
    a.pitch - b.pitch ||
    (a.channelRole === b.channelRole ? 0 : a.channelRole === "bass" ? -1 : 1) ||
    a.stepIndex - b.stepIndex ||
    a.emissionIndex - b.emissionIndex
  );
}

/**
 * Canonical, beat-domain performance projection shared by live playback and
 * file export. Voice leading and swing are resolved once, before consumers
 * convert the result to seconds or ticks.
 */
export function realizeProgressionPerformanceEvents(
  input: RealizeProgressionPerformanceInput,
): RealizedProgressionPerformance {
  if (!Number.isFinite(input.tempoBpm) || input.tempoBpm <= 0) {
    throw new RangeError("tempoBpm must be positive");
  }

  const projected = projectStepEnvelopes(input.steps, input.groove ?? createGroove());
  const events: PerformanceBeatNoteEvent[] = [];
  const stepRealizations: PerformanceStepRealization[] = [];
  let previousUpperPitches = input.previousPitches;
  let previousBassPitch = input.previousBassPitch;
  let emissionIndex = 0;

  const addEvent = (
    step: ChordStep,
    stepIndex: number,
    pitch: ExactPitch,
    channelRole: PerformanceEventRole,
    startBeats: Rational,
    durationBeats: Rational,
  ): void => {
    events.push(
      Object.freeze({
        stepIndex,
        stepId: step.id,
        emissionIndex: emissionIndex++,
        pitch: pitch.midiNumber,
        velocity: resolveEffectiveNoteVelocity(
          step.performance.masterVelocity,
          String(pitch.midiNumber),
          step.performance.perNoteVelocityOverrides,
        ),
        channelRole,
        startBeats,
        durationBeats,
      }),
    );
  };

  input.steps.forEach((step, stepIndex) => {
    if (step.kind === "rest") return;
    const timing = projected.timings.get(stepIndex);
    if (!timing) throw new Error(`missing projected timing for step ${stepIndex}`);

    const baseChord = realizeHarmonyChord(step.harmonicFunction, input.tonic);
    const realization = pianoProfile.realizeChord({
      context: input.context,
      chord: { ...baseChord, variant: step.harmonicVariant },
      performance: step.performance,
      ...(previousUpperPitches ? { previousPitches: previousUpperPitches } : {}),
      ...(previousBassPitch ? { previousBassPitch } : {}),
    });

    stepRealizations.push(
      Object.freeze({
        stepIndex,
        stepId: step.id,
        upperPitches: realization.pitches,
        bassPitch: realization.bassPitch,
      }),
    );

    const gatedDuration = multiplyRational(timing.durationBeats, PERFORMANCE_GATE_RATIO);
    if (realization.bassPitch) {
      addEvent(step, stepIndex, realization.bassPitch, "bass", timing.startBeats, gatedDuration);
    }

    const addUpperAtOffset = (
      pitch: ExactPitch,
      offsetBeats: Rational,
      durationRatio = PERFORMANCE_GATE_RATIO,
    ): void => {
      const remaining = subtractRational(timing.durationBeats, offsetBeats);
      addEvent(
        step,
        stepIndex,
        pitch,
        "upper",
        addRational(timing.startBeats, offsetBeats),
        multiplyRational(remaining, durationRatio),
      );
    };

    const upperPitches = realization.pitches;
    switch (step.performance.articulation) {
      case "block":
        upperPitches.forEach((pitch) => addUpperAtOffset(pitch, ZERO));
        break;
      case "arp-up":
      case "arp-down": {
        const ordered = sortPitches(upperPitches, step.performance.articulation === "arp-down");
        const noteCount = ordered.length;
        const spreadDelay =
          noteCount > 1
            ? multiplyRational(timing.durationBeats, rational(2, 5 * (noteCount - 1)))
            : ZERO;
        const stepDelay = minRational(spreadDelay, millisecondsToBeats(45, input.tempoBpm));
        ordered.forEach((pitch, index) =>
          addUpperAtOffset(pitch, multiplyRational(stepDelay, rational(index))),
        );
        break;
      }
      case "broken-chord": {
        const ordered = sortPitches(upperPitches, false);
        const upperHalfStart = Math.ceil(ordered.length / 2);
        const halfDelay = minRational(
          multiplyRational(timing.durationBeats, rational(1, 4)),
          millisecondsToBeats(80, input.tempoBpm),
        );
        ordered.forEach((pitch, index) =>
          addUpperAtOffset(pitch, index >= upperHalfStart ? halfDelay : ZERO),
        );
        break;
      }
      case "humanized": {
        const random = input.randomSource ?? createDeterministicRandomSource(101);
        const maxJitter = minRational(
          multiplyRational(timing.durationBeats, rational(1, 10)),
          millisecondsToBeats(15, input.tempoBpm),
        );
        const maxJitterNumber = rationalToNumber(maxJitter);
        upperPitches.forEach((pitch) => {
          const jitter = numberToRational((random() - 0.5) * 2 * maxJitterNumber);
          const offset = compareRational(jitter, ZERO) > 0 ? jitter : ZERO;
          addUpperAtOffset(pitch, offset, numberToRational(0.88 + random() * 0.08));
        });
        break;
      }
    }

    previousUpperPitches = realization.pitches;
    previousBassPitch = realization.bassPitch;
  });

  events.sort(performanceEventComparator);
  return Object.freeze({
    events: Object.freeze(events),
    stepRealizations: Object.freeze(stepRealizations),
    totalDurationBeats: projected.totalDurationBeats,
  });
}

export interface RealizeStepEventsInput {
  readonly step: ChordStep;
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly tempoBpm: number;
  readonly stepStartSeconds?: number;
  readonly previousPitches?: readonly ExactPitch[] | undefined;
  readonly previousBassPitch?: ExactPitch | undefined;
  readonly randomSource?: (() => number) | undefined;
}

export interface RealizedStepEvents {
  readonly events: readonly AudioNoteEvent[];
  readonly stepDurationSeconds: number;
  readonly upperPitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch | undefined;
}

/** Calculates musical duration in seconds given beats rational and tempo (BPM). */
export function beatsToSeconds(numerator: number, denominator: number, tempoBpm: number): number {
  if (tempoBpm <= 0) throw new RangeError("tempoBpm must be positive");
  return (numerator / denominator) * (60 / tempoBpm);
}

export function realizeStepAudioEvents(input: RealizeStepEventsInput): RealizedStepEvents {
  const performance = realizeProgressionPerformanceEvents({
    steps: [input.step],
    tonic: input.tonic,
    context: input.context,
    tempoBpm: input.tempoBpm,
    ...(input.previousPitches ? { previousPitches: input.previousPitches } : {}),
    ...(input.previousBassPitch ? { previousBassPitch: input.previousBassPitch } : {}),
    ...(input.randomSource ? { randomSource: input.randomSource } : {}),
  });
  const secondsPerBeat = 60 / input.tempoBpm;
  const stepStartSeconds = input.stepStartSeconds ?? 0;
  const events = performance.events.map((event) =>
    Object.freeze({
      pitch: event.pitch,
      startSeconds: stepStartSeconds + rationalToNumber(event.startBeats) * secondsPerBeat,
      durationSeconds: rationalToNumber(event.durationBeats) * secondsPerBeat,
      velocity: event.velocity,
      channelRole: event.channelRole,
    }),
  );
  const realization = performance.stepRealizations[0];
  if (!realization) throw new Error("chord step did not produce a realization");

  return Object.freeze({
    events: Object.freeze(events),
    stepDurationSeconds: rationalToNumber(performance.totalDurationBeats) * secondsPerBeat,
    upperPitches: realization.upperPitches,
    bassPitch: realization.bassPitch,
  });
}

export interface RealizeProgressionEventsInput {
  readonly steps: readonly ProgressionStep[];
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly tempoBpm: number;
  readonly groove?: GrooveSettings | undefined;
  readonly initialStartSeconds?: number;
  readonly randomSource?: (() => number) | undefined;
}

export function realizeProgressionAudioEvents(
  input: RealizeProgressionEventsInput,
): readonly AudioNoteEvent[] {
  const performance = realizeProgressionPerformanceEvents(input);
  const secondsPerBeat = 60 / input.tempoBpm;
  const initialStartSeconds = input.initialStartSeconds ?? 0;
  return Object.freeze(
    performance.events.map((event) =>
      Object.freeze({
        pitch: event.pitch,
        startSeconds: initialStartSeconds + rationalToNumber(event.startBeats) * secondsPerBeat,
        durationSeconds: rationalToNumber(event.durationBeats) * secondsPerBeat,
        velocity: event.velocity,
        channelRole: event.channelRole,
      }),
    ),
  );
}
