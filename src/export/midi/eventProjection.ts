import type { HarmonicContext } from "../../domain/harmony/modules/types";
import { modeForModule } from "../../domain/harmony/functions";
import { realizeChord } from "../../domain/harmony/realization";
import type { ExactPitch } from "../../domain/harmony/pitch";
import type { ChordStep, PianoArticulation, ProgressionStep } from "../../domain/progression/step";
import type { Project } from "../../domain/project/project";
import {
  addRational,
  multiplyRational,
  rational,
  subtractRational,
  type Rational,
} from "../../domain/timing/rational";
import { createProgressionTimeline } from "../../domain/timing/timeline";
import { projectSwingTiming, type TimedEvent } from "../../domain/timing/swing";
import { pianoProfile } from "../../instruments/piano/profile";
import {
  createDeterministicRandomSource,
  resolveEffectiveNoteVelocity,
} from "../../instruments/piano/dynamics";

/**
 * CadenceFlow's MIDI grid uses 120 ticks per quarter-note beat.
 *
 * PPQ 120 represents the v1 eighth, sixteenth, dotted, and triplet duration
 * values exactly. Rational values outside that supported set are converted by
 * nearest-integer quantization; ties go upward for non-negative values. This
 * rule is applied to absolute musical positions, never to accumulated seconds.
 */
export const MIDI_PPQ = 120;

const MIDI_GATE_RATIO = rational(19, 20);

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

interface SwingStepTiming extends TimedEvent {
  readonly stepIndex: number;
}

interface EffectiveStepTiming {
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly endBeats: Rational;
}

interface RawProjectionNote {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly channel: number;
  readonly role: MidiProjectionRole;
  readonly pitch: number;
  readonly velocity: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly emissionIndex: number;
}

function roundHalfUpNonNegative(numerator: number, denominator: number): number {
  const whole = Math.floor(numerator / denominator);
  const remainder = numerator - whole * denominator;
  return whole + (remainder * 2 >= denominator ? 1 : 0);
}

function quantizeNumberToInteger(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("tick value must be finite");
  if (value >= 0) return roundHalfUpNonNegative(value, 1);
  return -roundHalfUpNonNegative(-value, 1);
}

/** Converts a musical Rational to ticks with the documented stable rule. */
export function quantizeRationalToMidiTicks(value: Rational, ppq = MIDI_PPQ): number {
  if (!Number.isSafeInteger(ppq) || ppq <= 0) {
    throw new RangeError("ppq must be a positive safe integer");
  }
  const scaledNumerator = value.numerator * ppq;
  const scaledDenominator = value.denominator;
  if (scaledNumerator < 0) {
    return -roundHalfUpNonNegative(-scaledNumerator, scaledDenominator);
  }
  return roundHalfUpNonNegative(scaledNumerator, scaledDenominator);
}

function quantizeTickNumber(value: number): number {
  return quantizeNumberToInteger(value);
}

function roleOrder(role: MidiProjectionRole): number {
  return role === "bass" ? 0 : 1;
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

function projectStepTimings(
  project: Project,
  steps: readonly ProgressionStep[],
): ReadonlyMap<number, EffectiveStepTiming> {
  const timeline = createProgressionTimeline(steps, project.globalTiming.meter);
  const chordEntries: SwingStepTiming[] = timeline.steps
    .filter((entry) => entry.step.kind === "chord")
    .map((entry) => ({
      stepIndex: entry.stepIndex,
      startBeats: entry.startBeats,
      durationBeats: entry.durationBeats,
    }));
  const swungEntries = projectSwingTiming(chordEntries, project.groove);
  const swungByIndex = new Map(swungEntries.map((entry) => [entry.stepIndex, entry]));
  const result = new Map<number, EffectiveStepTiming>();

  for (const entry of timeline.steps) {
    const swung = swungByIndex.get(entry.stepIndex);
    const startBeats = swung?.startBeats ?? entry.startBeats;
    const durationBeats = swung?.durationBeats ?? entry.durationBeats;
    result.set(entry.stepIndex, {
      startBeats,
      durationBeats,
      endBeats: addRational(startBeats, durationBeats),
    });
  }

  return result;
}

function quantizedEndTick(
  startTick: number,
  endTick: number,
  startBeats: Rational,
  durationBeats: Rational,
): number {
  const gatedEnd = quantizeRationalToMidiTicks(
    addRational(startBeats, multiplyRational(durationBeats, MIDI_GATE_RATIO)),
  );
  if (endTick <= startTick) return startTick;
  return Math.min(endTick, Math.max(startTick + 1, gatedEnd));
}

function endTickAfterOffset(
  startTick: number,
  endTick: number,
  durationBeats: Rational,
  offsetTick: number,
): { readonly startTick: number; readonly endTick: number } {
  const safeStart = Math.min(
    Math.max(startTick + offsetTick, startTick),
    Math.max(startTick, endTick - 1),
  );
  const offsetBeats = rational(safeStart - startTick, MIDI_PPQ);
  const remainingBeats = subtractRational(durationBeats, offsetBeats);
  const gatedDuration = Math.max(
    1,
    quantizeRationalToMidiTicks(multiplyRational(remainingBeats, MIDI_GATE_RATIO)),
  );
  return {
    startTick: safeStart,
    endTick: Math.min(endTick, safeStart + gatedDuration),
  };
}

function delayTicks(
  durationBeats: Rational,
  durationTicks: number,
  noteCount: number,
  tempoBpm: number,
  capMilliseconds: number,
): number {
  if (noteCount <= 1) return 0;
  const maxSpreadPerNote = multiplyRational(durationBeats, rational(2, 5 * (noteCount - 1)));
  const maxSpreadTicks = (maxSpreadPerNote.numerator * MIDI_PPQ) / maxSpreadPerNote.denominator;
  const capTicks = (capMilliseconds / 1000) * (tempoBpm / 60) * MIDI_PPQ;
  return Math.min(durationTicks, quantizeTickNumber(Math.min(maxSpreadTicks, capTicks)));
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

function addArticulatedUpperNotes(
  notes: RawProjectionNote[],
  step: ChordStep,
  timing: EffectiveStepTiming,
  upperPitches: readonly ExactPitch[],
  stepStartTick: number,
  stepEndTick: number,
  tempoBpm: number,
  nextEmissionIndex: { value: number },
): void {
  const articulation: PianoArticulation = step.performance.articulation;
  const add = (pitch: ExactPitch, startTick: number, endTick: number): void => {
    notes.push({
      stepIndex: -1,
      stepId: step.id,
      channel: 0,
      role: "upper",
      pitch: pitch.midiNumber,
      velocity: resolveEffectiveNoteVelocity(
        step.performance.masterVelocity,
        String(pitch.midiNumber),
        step.performance.perNoteVelocityOverrides,
      ),
      startTick,
      endTick,
      emissionIndex: nextEmissionIndex.value++,
    });
  };

  if (articulation === "block") {
    const endTick = quantizedEndTick(
      stepStartTick,
      stepEndTick,
      timing.startBeats,
      timing.durationBeats,
    );
    for (const pitch of upperPitches) add(pitch, stepStartTick, endTick);
    return;
  }

  if (articulation === "arp-up" || articulation === "arp-down") {
    const ordered = sortPitches(upperPitches, articulation === "arp-down");
    const delay = delayTicks(
      timing.durationBeats,
      stepEndTick - stepStartTick,
      ordered.length,
      tempoBpm,
      45,
    );
    ordered.forEach((pitch, index) => {
      const interval = endTickAfterOffset(
        stepStartTick,
        stepEndTick,
        timing.durationBeats,
        index * delay,
      );
      add(pitch, interval.startTick, interval.endTick);
    });
    return;
  }

  if (articulation === "broken-chord") {
    const ordered = sortPitches(upperPitches, false);
    const firstHalf = Math.ceil(ordered.length / 2);
    const delay = quantizeTickNumber(
      Math.min((stepEndTick - stepStartTick) / 4, (80 / 1000) * (tempoBpm / 60) * MIDI_PPQ),
    );
    ordered.forEach((pitch, index) => {
      const interval = endTickAfterOffset(
        stepStartTick,
        stepEndTick,
        timing.durationBeats,
        index >= firstHalf ? delay : 0,
      );
      add(pitch, interval.startTick, interval.endTick);
    });
    return;
  }

  const random = createDeterministicRandomSource(101);
  const maxJitterTicks = Math.min(
    (timing.durationBeats.numerator / timing.durationBeats.denominator) * MIDI_PPQ * 0.1,
    (15 / 1000) * (tempoBpm / 60) * MIDI_PPQ,
  );
  for (const pitch of upperPitches) {
    const jitter = quantizeTickNumber((random() - 0.5) * 2 * maxJitterTicks);
    const safeStart = Math.min(
      Math.max(stepStartTick, stepStartTick + jitter),
      Math.max(stepStartTick, stepEndTick - 1),
    );
    const durationFactor = 0.88 + random() * 0.08;
    const durationTicks = Math.max(
      1,
      quantizeTickNumber((stepEndTick - safeStart) * durationFactor),
    );
    add(pitch, safeStart, Math.min(stepEndTick, safeStart + durationTicks));
  }
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
 * Projects the saved semantic/performance progression directly to normalized
 * MIDI note intervals. The active temporary branch and playback runtime are
 * intentionally not part of this export projection.
 */
export function projectProjectToMidi(project: Project): MidiProjection {
  const steps = project.progression.steps;
  const timeline = createProgressionTimeline(steps, project.globalTiming.meter);
  const effectiveTimings = projectStepTimings(project, steps);
  const context = createContext(project);
  const rawNotes: RawProjectionNote[] = [];
  let previousPitches: readonly ExactPitch[] | undefined;
  let previousBassPitch: ExactPitch | undefined;
  const nextEmissionIndex = { value: 0 };

  for (const entry of timeline.steps) {
    if (entry.step.kind !== "chord") continue;
    const timing = effectiveTimings.get(entry.stepIndex);
    if (!timing) throw new Error(`missing timing for step ${entry.stepIndex}`);
    const chord = realizeChord(entry.step.harmonicFunction, project.tonic);
    const realization = pianoProfile.realizeChord({
      context,
      chord: { ...chord, variant: entry.step.harmonicVariant },
      performance: entry.step.performance,
      ...(previousPitches ? { previousPitches } : {}),
      ...(previousBassPitch ? { previousBassPitch } : {}),
    });
    const stepStartTick = quantizeRationalToMidiTicks(timing.startBeats);
    const stepEndTick = quantizeRationalToMidiTicks(timing.endBeats);

    if (realization.bassPitch) {
      rawNotes.push({
        stepIndex: entry.stepIndex,
        stepId: entry.step.id,
        channel: 0,
        role: "bass",
        pitch: realization.bassPitch.midiNumber,
        velocity: resolveEffectiveNoteVelocity(
          entry.step.performance.masterVelocity,
          String(realization.bassPitch.midiNumber),
          entry.step.performance.perNoteVelocityOverrides,
        ),
        startTick: stepStartTick,
        endTick: quantizedEndTick(
          stepStartTick,
          stepEndTick,
          timing.startBeats,
          timing.durationBeats,
        ),
        emissionIndex: nextEmissionIndex.value++,
      });
    }

    const beforeUpperCount = rawNotes.length;
    addArticulatedUpperNotes(
      rawNotes,
      entry.step,
      timing,
      realization.pitches,
      stepStartTick,
      stepEndTick,
      project.globalTiming.tempoBpm,
      nextEmissionIndex,
    );
    for (let i = beforeUpperCount; i < rawNotes.length; i++) {
      const note = rawNotes[i]!;
      rawNotes[i] = { ...note, stepIndex: entry.stepIndex };
    }

    previousPitches = realization.pitches;
    previousBassPitch = realization.bassPitch;
  }

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
    totalTicks: quantizeRationalToMidiTicks(timeline.totalDurationBeats),
    notes: Object.freeze(notes),
  });
}

export const projectMidiEvents = projectProjectToMidi;
export const projectProgressionToMidi = projectProjectToMidi;
