import type { AudioNoteEvent } from "./contracts";
import type { ChordDefinition } from "../domain/harmony/chord";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { ExactPitch, PitchClassIdentity } from "../domain/harmony/pitch";
import { resolveGuitarChordVoicing } from "../domain/instruments/guitar/voicings";
import type { ChordStep, ProgressionStep } from "../domain/progression/step";
import {
  stepTranspositionSemitones,
  transposeChordDefinition,
  transposeExactPitch,
} from "../domain/progression/transposition";
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
import { realizeOrderedPianoProgression } from "../instruments/piano/progressionRealization";
import { guitarStrumOffsetSeconds } from "./guitar/strumTiming";

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
  readonly sourceUpperPitches: readonly ExactPitch[];
  readonly sourceBassPitch?: ExactPitch | undefined;
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

export interface EffectiveStepTiming {
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

function sortPitchPairs(
  pitches: readonly ExactPitch[],
  sourcePitches: readonly ExactPitch[],
  descending: boolean,
): readonly { readonly pitch: ExactPitch; readonly sourcePitch: ExactPitch }[] {
  return pitches
    .map((pitch, index) => {
      const sourcePitch = sourcePitches[index];
      if (!sourcePitch) throw new Error("Missing source-frame pitch for realized chord tone");
      return { pitch, sourcePitch, index };
    })
    .sort((a, b) =>
      descending
        ? b.pitch.midiNumber - a.pitch.midiNumber || a.index - b.index
        : a.pitch.midiNumber - b.pitch.midiNumber || a.index - b.index,
    )
    .map(({ pitch, sourcePitch }) => ({ pitch, sourcePitch }));
}

export function projectProgressionStepTimings(
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

  const projected = projectProgressionStepTimings(input.steps, input.groove ?? createGroove());
  const events: PerformanceBeatNoteEvent[] = [];
  const stepRealizations: PerformanceStepRealization[] = [];
  const orderedRealizations = realizeOrderedPianoProgression({
    steps: input.steps,
    tonic: input.tonic,
    context: input.context,
    ...(input.previousPitches ? { previousPitches: input.previousPitches } : {}),
    ...(input.previousBassPitch ? { previousBassPitch: input.previousBassPitch } : {}),
  });
  let emissionIndex = 0;

  const addEvent = (
    step: ChordStep,
    stepIndex: number,
    pitch: ExactPitch,
    sourcePitch: ExactPitch,
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
          String(sourcePitch.midiNumber),
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

    const realization = orderedRealizations[stepIndex];
    if (!realization) throw new Error(`missing piano realization for chord step ${step.id}`);

    stepRealizations.push(
      Object.freeze({
        stepIndex,
        stepId: step.id,
        upperPitches: realization.upperPitches,
        bassPitch: realization.bassPitch,
        sourceUpperPitches: realization.sourceUpperPitches,
        sourceBassPitch: realization.sourceBassPitch,
      }),
    );

    const gatedDuration = multiplyRational(timing.durationBeats, PERFORMANCE_GATE_RATIO);
    if (realization.bassPitch) {
      if (!realization.sourceBassPitch) throw new Error(`Missing source bass pitch for ${step.id}`);
      addEvent(
        step,
        stepIndex,
        realization.bassPitch,
        realization.sourceBassPitch,
        "bass",
        timing.startBeats,
        gatedDuration,
      );
    }

    const addUpperAtOffset = (
      pitch: ExactPitch,
      sourcePitch: ExactPitch,
      offsetBeats: Rational,
      durationRatio = PERFORMANCE_GATE_RATIO,
    ): void => {
      const remaining = subtractRational(timing.durationBeats, offsetBeats);
      addEvent(
        step,
        stepIndex,
        pitch,
        sourcePitch,
        "upper",
        addRational(timing.startBeats, offsetBeats),
        multiplyRational(remaining, durationRatio),
      );
    };

    const upperPitches = realization.upperPitches;
    switch (step.performance.articulation) {
      case "block":
        upperPitches.forEach((pitch, index) => {
          const sourcePitch = realization.sourceUpperPitches[index];
          if (!sourcePitch) throw new Error(`Missing source upper pitch for ${step.id}`);
          addUpperAtOffset(pitch, sourcePitch, ZERO);
        });
        break;
      case "arp-up":
      case "arp-down": {
        const ordered = sortPitchPairs(
          upperPitches,
          realization.sourceUpperPitches,
          step.performance.articulation === "arp-down",
        );
        const noteCount = ordered.length;
        const spreadDelay =
          noteCount > 1
            ? multiplyRational(timing.durationBeats, rational(2, 5 * (noteCount - 1)))
            : ZERO;
        const stepDelay = minRational(spreadDelay, millisecondsToBeats(45, input.tempoBpm));
        ordered.forEach(({ pitch, sourcePitch }, index) =>
          addUpperAtOffset(pitch, sourcePitch, multiplyRational(stepDelay, rational(index))),
        );
        break;
      }
      case "broken-chord": {
        const ordered = sortPitchPairs(upperPitches, realization.sourceUpperPitches, false);
        const upperHalfStart = Math.ceil(ordered.length / 2);
        const halfDelay = minRational(
          multiplyRational(timing.durationBeats, rational(1, 4)),
          millisecondsToBeats(80, input.tempoBpm),
        );
        ordered.forEach(({ pitch, sourcePitch }, index) =>
          addUpperAtOffset(pitch, sourcePitch, index >= upperHalfStart ? halfDelay : ZERO),
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
        upperPitches.forEach((pitch, index) => {
          const sourcePitch = realization.sourceUpperPitches[index];
          if (!sourcePitch) throw new Error(`Missing source upper pitch for ${step.id}`);
          const jitter = numberToRational((random() - 0.5) * 2 * maxJitterNumber);
          const offset = compareRational(jitter, ZERO) > 0 ? jitter : ZERO;
          addUpperAtOffset(pitch, sourcePitch, offset, numberToRational(0.88 + random() * 0.08));
        });
        break;
      }
    }
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
      stepIndex: event.stepIndex,
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
        stepIndex: event.stepIndex,
      }),
    ),
  );
}

export interface RealizeGuitarStepEventsInput {
  readonly chord: ChordDefinition;
  readonly step?: ChordStep | undefined;
  readonly tempoBpm: number;
  readonly articulation?: string | undefined;
  readonly masterVelocity?: number | undefined;
  readonly perNoteVelocityOverrides?: Readonly<Record<string, number>> | undefined;
  readonly durationBeats?: Rational | undefined;
  readonly instrument?: string | undefined;
  readonly stepStartSeconds?: number | undefined;
  readonly randomSource?: (() => number) | undefined;
}

export interface RealizedGuitarStepEvents {
  readonly events: readonly AudioNoteEvent[];
  readonly totalDurationSeconds: number;
  readonly pitches: readonly ExactPitch[];
}

/**
 * Realizes chord audition and playback events for guitar, faithfully projecting
 * guitar-specific articulations (downstrum stagger, arp-up, arp-down, broken-chord, fingerstyle jitter)
 * and note velocities across both HQ sample and SoundFont providers.
 */
export function realizeGuitarStepAudioEvents(
  input: RealizeGuitarStepEventsInput,
): RealizedGuitarStepEvents {
  if (!Number.isFinite(input.tempoBpm) || input.tempoBpm <= 0) {
    throw new RangeError("tempoBpm must be positive");
  }

  const isSeventh =
    input.chord.baseQuality === "dominant" || input.chord.variant?.seventh !== undefined;
  const isMajor7 = input.chord.variant?.seventh === "major7";
  const transposition = input.step ? stepTranspositionSemitones(input.step) : 0;
  const sourceChord = transposeChordDefinition(input.chord, -transposition);
  const guitarVoicing = resolveGuitarChordVoicing({
    rootPitchClass: sourceChord.rootPitchClass,
    baseQuality: sourceChord.baseQuality,
    spelling: sourceChord.spelling,
    ...(sourceChord.bassPitchClass !== undefined
      ? { bassPitchClass: sourceChord.bassPitchClass }
      : {}),
    isSeventh,
    isMajor7,
  });

  const sourceManualPitches =
    input.step?.performance?.voicingMode === "manual" &&
    input.step.performance.manualVoicing &&
    input.step.performance.manualVoicing.length > 0
      ? input.step.performance.manualVoicing
      : undefined;
  const sourcePitches = sourceManualPitches ?? guitarVoicing.pitches;
  const pitches = sourcePitches.map((pitch) => transposeExactPitch(pitch, transposition));

  const durationBeats = input.durationBeats ?? input.step?.duration?.beats ?? rational(4, 1);
  const secondsPerBeat = 60 / input.tempoBpm;
  const totalDurationSeconds = rationalToNumber(durationBeats) * secondsPerBeat;
  const stepStartSeconds = input.stepStartSeconds ?? 0;

  const articulation = input.articulation ?? input.step?.performance?.articulation ?? "block";
  const masterVelocity = input.masterVelocity ?? input.step?.performance?.masterVelocity ?? 80;
  const perNoteOverrides =
    input.perNoteVelocityOverrides ?? input.step?.performance?.perNoteVelocityOverrides;
  const instrument = input.instrument;

  const n = pitches.length;
  if (n === 0) {
    return Object.freeze({
      events: Object.freeze([]),
      totalDurationSeconds,
      pitches: Object.freeze([]),
    });
  }

  const events: AudioNoteEvent[] = [];
  const addNote = (
    pitch: ExactPitch,
    offsetSeconds: number,
    durationSeconds: number,
    velocity: number,
    channelRole: PerformanceEventRole,
  ) => {
    events.push(
      Object.freeze({
        pitch: pitch.midiNumber,
        startSeconds: stepStartSeconds + Math.max(0, offsetSeconds),
        durationSeconds: Math.max(0.1, durationSeconds),
        velocity: Math.max(1, Math.min(127, Math.round(velocity))),
        channelRole,
        ...(instrument ? { instrument } : {}),
      }),
    );
  };

  switch (articulation) {
    case "arp-up": {
      const ordered = [...pitches].sort((a, b) => a.midiNumber - b.midiNumber);
      const maxSpread = totalDurationSeconds * 0.5;
      const stepDelay = n > 1 ? Math.min(0.065, maxSpread / (n - 1)) : 0;
      ordered.forEach((pitch, idx) => {
        const offset = idx * stepDelay;
        const dur = Math.max(0.2, (totalDurationSeconds - offset) * 0.95);
        const vel = resolveEffectiveNoteVelocity(
          masterVelocity,
          String(pitch.midiNumber),
          perNoteOverrides,
        );
        addNote(pitch, offset, dur, vel, idx === 0 ? "bass" : "upper");
      });
      break;
    }

    case "arp-down": {
      const ordered = [...pitches].sort((a, b) => b.midiNumber - a.midiNumber);
      const maxSpread = totalDurationSeconds * 0.5;
      const stepDelay = n > 1 ? Math.min(0.065, maxSpread / (n - 1)) : 0;
      ordered.forEach((pitch, idx) => {
        const offset = idx * stepDelay;
        const dur = Math.max(0.2, (totalDurationSeconds - offset) * 0.95);
        const vel = resolveEffectiveNoteVelocity(
          masterVelocity,
          String(pitch.midiNumber),
          perNoteOverrides,
        );
        addNote(pitch, offset, dur, vel, idx === ordered.length - 1 ? "bass" : "upper");
      });
      break;
    }

    case "broken-chord": {
      const ordered = [...pitches].sort((a, b) => a.midiNumber - b.midiNumber);
      const half = Math.ceil(ordered.length / 2);
      const halfDelay = Math.min(0.11, totalDurationSeconds * 0.25);
      ordered.forEach((pitch, idx) => {
        const isUpper = idx >= half;
        const baseOffset = isUpper ? halfDelay : 0;
        const subIdx = isUpper ? idx - half : idx;
        const offset = baseOffset + subIdx * 0.014;
        const dur = Math.max(0.2, (totalDurationSeconds - offset) * 0.95);
        const vel = resolveEffectiveNoteVelocity(
          masterVelocity,
          String(pitch.midiNumber),
          perNoteOverrides,
        );
        addNote(pitch, offset, dur, vel, idx === 0 ? "bass" : "upper");
      });
      break;
    }

    case "humanized": {
      const rng = input.randomSource ?? createDeterministicRandomSource(101);
      const maxJitter = Math.min(0.025, totalDurationSeconds * 0.1);
      const ordered = [...pitches].sort((a, b) => a.midiNumber - b.midiNumber);
      ordered.forEach((pitch, idx) => {
        const baseVel = resolveEffectiveNoteVelocity(
          masterVelocity,
          String(pitch.midiNumber),
          perNoteOverrides,
        );
        if (idx === 0) {
          addNote(pitch, 0, totalDurationSeconds * 0.95, baseVel, "bass");
        } else {
          const jitter = Math.max(0, (rng() - 0.5) * 2 * maxJitter + 0.012 * idx);
          const durRatio = 0.88 + rng() * 0.08;
          const velJitter = Math.round((rng() - 0.5) * 12);
          const vel = Math.max(1, Math.min(127, baseVel + velJitter));
          const dur = Math.max(0.2, (totalDurationSeconds - jitter) * durRatio);
          addNote(pitch, jitter, dur, vel, "upper");
        }
      });
      break;
    }

    case "block":
    default: {
      // Natural guitar downstrum keeps the total chord spread to 30ms.
      pitches.forEach((pitch, idx) => {
        const offset = guitarStrumOffsetSeconds(idx, pitches.length);
        const dur = Math.max(0.2, (totalDurationSeconds - offset) * 0.95);
        const vel = resolveEffectiveNoteVelocity(
          masterVelocity,
          String(pitch.midiNumber),
          perNoteOverrides,
        );
        addNote(pitch, offset, dur, vel, idx === 0 ? "bass" : "upper");
      });
      break;
    }
  }

  events.sort((a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch);
  return Object.freeze({
    events: Object.freeze(events),
    totalDurationSeconds,
    pitches: Object.freeze(pitches),
  });
}
