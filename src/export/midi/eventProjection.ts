import { realizeProgressionPerformanceEvents } from "../../audio/eventRealizer";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import { modeForModule } from "../../domain/harmony/functions";
import type { Project } from "../../domain/project/project";
import { addRational, subtractRational, ZERO, type Rational } from "../../domain/timing/rational";

/**
 * CadenceFlow's MIDI grid uses 120 ticks per quarter-note beat.
 *
 * Rational positions are rounded to nearest tick, with non-negative ties
 * rounded upward. Every positive semantic step and every emitted note receives
 * at least one tick, so valid custom durations can never collapse to zero.
 */
export const MIDI_PPQ = 120;

export type MidiProjectionRole = "upper" | "bass";

export interface MidiProjectionNote {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly order: number;
  readonly channel: number;
  readonly role: MidiProjectionRole;
  readonly pitch: number;
  readonly velocity: number;
  readonly startTick: number;
  readonly endTick: number;
}

export type MidiProjectedNote = MidiProjectionNote;

export interface MidiProjectionMeter {
  readonly numerator: number;
  readonly denominator: 1 | 2 | 4 | 8 | 16 | 32;
  readonly grouping: readonly number[];
}

export interface MidiProjection {
  readonly ppq: number;
  readonly tempoBpm: number;
  readonly meter: MidiProjectionMeter;
  readonly totalTicks: number;
  readonly notes: readonly MidiProjectionNote[];
}

interface QuantizedStepTiming {
  readonly exactStartBeats: Rational;
  readonly startTick: number;
  readonly endTick: number;
}

interface RawProjectionNote extends Omit<MidiProjectionNote, "order"> {
  readonly emissionIndex: number;
}

function roundHalfUpNonNegative(numerator: number, denominator: number): number {
  const whole = Math.floor(numerator / denominator);
  const remainder = numerator - whole * denominator;
  return whole + (remainder * 2 >= denominator ? 1 : 0);
}

/** Converts a musical Rational to ticks with the documented stable rule. */
export function quantizeRationalToMidiTicks(value: Rational, ppq = MIDI_PPQ): number {
  if (!Number.isSafeInteger(ppq) || ppq <= 0) {
    throw new RangeError("ppq must be a positive safe integer");
  }
  const scaledNumerator = value.numerator * ppq;
  if (scaledNumerator < 0) {
    return -roundHalfUpNonNegative(-scaledNumerator, value.denominator);
  }
  return roundHalfUpNonNegative(scaledNumerator, value.denominator);
}

function freezeMeter(project: Project): MidiProjectionMeter {
  return Object.freeze({
    numerator: project.globalTiming.meter.numerator,
    denominator: project.globalTiming.meter.denominator,
    grouping: Object.freeze([...project.globalTiming.meter.grouping]),
  });
}

function createContext(project: Project): HarmonicContext {
  const mode = modeForModule(project.activeModule);
  return Object.freeze({
    tonic: project.tonic,
    moduleId: project.activeModule,
    mode,
    spellingContext: Object.freeze({ tonic: project.tonic, mode }),
  });
}

function quantizeStepTimings(project: Project): {
  readonly timings: ReadonlyMap<number, QuantizedStepTiming>;
  readonly totalTicks: number;
} {
  let exactCursor = ZERO;
  let tickCursor = 0;
  const timings = new Map<number, QuantizedStepTiming>();

  project.progression.steps.forEach((step, stepIndex) => {
    const exactEnd = addRational(exactCursor, step.duration.beats);
    const roundedEndTick = quantizeRationalToMidiTicks(exactEnd);
    const endTick = Math.max(tickCursor + 1, roundedEndTick);
    timings.set(stepIndex, {
      exactStartBeats: exactCursor,
      startTick: tickCursor,
      endTick,
    });
    exactCursor = exactEnd;
    tickCursor = endTick;
  });

  return { timings, totalTicks: tickCursor };
}

function roleOrder(role: MidiProjectionRole): number {
  return role === "bass" ? 0 : 1;
}

function rawNoteComparator(a: RawProjectionNote, b: RawProjectionNote): number {
  return (
    a.startTick - b.startTick ||
    a.pitch - b.pitch ||
    roleOrder(a.role) - roleOrder(b.role) ||
    a.stepIndex - b.stepIndex ||
    a.emissionIndex - b.emissionIndex
  );
}

/**
 * Projects the saved progression through the same canonical performance events
 * used by live playback. Temporary branches and runtime transport state are not
 * part of this projection.
 */
export function projectProjectToMidi(project: Project): MidiProjection {
  const quantizedSteps = quantizeStepTimings(project);
  const performance = realizeProgressionPerformanceEvents({
    steps: project.progression.steps,
    tonic: project.tonic,
    context: createContext(project),
    tempoBpm: project.globalTiming.tempoBpm,
    groove: project.groove,
  });

  const rawNotes: RawProjectionNote[] = performance.events.map((event) => {
    const stepTiming = quantizedSteps.timings.get(event.stepIndex);
    if (!stepTiming) throw new Error(`missing quantized timing for step ${event.stepIndex}`);

    const offsetBeats = subtractRational(event.startBeats, stepTiming.exactStartBeats);
    const projectedStart = stepTiming.startTick + quantizeRationalToMidiTicks(offsetBeats);
    const startTick = Math.min(
      Math.max(stepTiming.startTick, projectedStart),
      Math.max(0, quantizedSteps.totalTicks - 1),
    );
    const durationTicks = Math.max(1, quantizeRationalToMidiTicks(event.durationBeats));
    const endTick = Math.min(quantizedSteps.totalTicks, startTick + durationTicks);

    return {
      stepIndex: event.stepIndex,
      stepId: event.stepId,
      channel: 0,
      role: event.channelRole,
      pitch: event.pitch,
      velocity: event.velocity,
      startTick,
      endTick,
      emissionIndex: event.emissionIndex,
    };
  });

  const notes = rawNotes.sort(rawNoteComparator).map((note, order) =>
    Object.freeze({
      stepIndex: note.stepIndex,
      stepId: note.stepId,
      order,
      channel: note.channel,
      role: note.role,
      pitch: note.pitch,
      velocity: note.velocity,
      startTick: note.startTick,
      endTick: note.endTick,
    }),
  );

  return Object.freeze({
    ppq: MIDI_PPQ,
    tempoBpm: project.globalTiming.tempoBpm,
    meter: freezeMeter(project),
    totalTicks: quantizedSteps.totalTicks,
    notes: Object.freeze(notes),
  });
}

export const projectMidiEvents = projectProjectToMidi;
export const projectProgressionToMidi = projectProjectToMidi;
