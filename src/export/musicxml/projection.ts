import {
  mapCadenceFlowModeToMusicXmlMode,
  mapChordToMusicXmlHarmony,
  mapGrooveToMusicXml,
  mapMasterVelocityToMusicXmlDynamic,
  mapPianoArticulationToMusicXml,
  mapPitchSpellingToMusicXml,
  mapTonicToMusicXmlKey,
  musicXmlDiagnostic,
  type MusicXmlArticulation,
  type MusicXmlDiagnostic,
  type MusicXmlHarmonyMapping,
  type MusicXmlKeySignature,
  type MusicXmlPitchSpelling,
} from "./mapping";
import { realizeChord as realizeHarmonyChord } from "../../domain/harmony/realization";
import { modeForModule } from "../../domain/harmony/functions";
import { exactPitch, type ExactPitch } from "../../domain/harmony/pitch";
import { melodyGridDuration } from "../../domain/melody/patterns";
import { realizeChordMelody } from "../../domain/melody/projection";
import {
  validateMelodyTrackSettings,
  type MelodyGrid,
  type MelodyInstrument,
} from "../../domain/melody/types";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import type { ChordStep, ProgressionStep, RestStep } from "../../domain/progression/step";
import type { Project } from "../../domain/project/project";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  subtractRational,
  ZERO,
  type Rational,
} from "../../domain/timing/rational";
import { createProgressionTimeline, type TimelineStepEntry } from "../../domain/timing/timeline";
import { createProgressionMeasureLayout } from "../../domain/timing/measureLayout";
import { pianoProfile } from "../../instruments/piano/profile";

export const MUSICXML_VERSION = "4.0";
export const MUSICXML_PART_ID = "P1";
export const MUSICXML_PART_NAME = "Piano";
export const MUSICXML_MELODY_PART_ID = "P2";
export const MUSICXML_MAX_DIVISIONS = 1_000_000;

export class MusicXmlExportError extends Error {
  readonly code:
    "empty-progression" | "invalid-tempo" | "duration-divisions-overflow" | "invalid-projection";

  constructor(code: MusicXmlExportError["code"], message: string) {
    super(message);
    this.name = "MusicXmlExportError";
    this.code = code;
  }
}

export interface MusicXmlAttributes {
  readonly divisions: number;
  readonly key: MusicXmlKeySignature;
  readonly time: {
    readonly numerator: number;
    readonly denominator: 1 | 2 | 4 | 8 | 16 | 32;
    readonly beats: string;
    readonly grouping: readonly number[];
  };
  readonly staves: 2;
  readonly clefs: readonly [
    { readonly number: 1; readonly sign: "G"; readonly line: 2 },
    { readonly number: 2; readonly sign: "F"; readonly line: 4 },
  ];
}

export interface MusicXmlHarmonyEvent {
  readonly kind: "harmony";
  readonly onsetBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly harmony: MusicXmlHarmonyMapping;
}

export interface MusicXmlDirectionEvent {
  readonly kind: "direction";
  readonly onsetBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly dynamicLabel: "pp" | "p" | "mp" | "mf" | "f" | "ff";
  readonly sourceVelocity: number;
}

export interface MusicXmlNoteEvent {
  readonly kind: "note";
  readonly onsetBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly durationBeats: Rational;
  readonly duration: number;
  readonly voice: "1" | "2";
  readonly staff: 1 | 2;
  readonly chord: boolean;
  readonly sourceMidi: number;
  readonly role: "upper" | "bass";
  readonly pitch: MusicXmlPitchSpelling & { readonly octave: number };
  readonly ties: readonly ("start" | "stop")[];
  readonly arpeggiate?: MusicXmlArticulation;
}

export interface MusicXmlRestEvent {
  readonly kind: "rest";
  readonly onsetBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly durationBeats: Rational;
  readonly duration: number;
  readonly voice: "1" | "2";
  readonly staff: 1 | 2;
}

export type MusicXmlMeasureEvent =
  MusicXmlHarmonyEvent | MusicXmlDirectionEvent | MusicXmlNoteEvent | MusicXmlRestEvent;

export interface MusicXmlMelodyTimeModification {
  readonly actualNotes: 3;
  readonly normalNotes: 2;
  readonly normalType: "eighth" | "16th";
}

export interface MusicXmlMelodyNoteEvent {
  readonly kind: "note";
  readonly onsetBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly durationBeats: Rational;
  readonly duration: number;
  readonly voice: "1";
  readonly staff: 1;
  readonly chord: false;
  readonly sourceMidi: number;
  readonly sourcePitchMidi: number;
  readonly pitch: MusicXmlPitchSpelling & { readonly octave: number };
  readonly type: "quarter" | "eighth" | "16th";
  readonly ties: readonly ("start" | "stop")[];
  readonly timeModification?: MusicXmlMelodyTimeModification;
  readonly tupletMarks: readonly ("start" | "stop")[];
}

export interface MusicXmlMelodyRestEvent {
  readonly kind: "rest";
  readonly onsetBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly durationBeats: Rational;
  readonly duration: number;
  readonly voice: "1";
  readonly staff: 1;
}

export type MusicXmlMelodyMeasureEvent = MusicXmlMelodyNoteEvent | MusicXmlMelodyRestEvent;

export interface MusicXmlMeasure {
  readonly number: number;
  readonly startBeats: Rational;
  readonly capacityBeats: Rational;
  readonly durationBeats: Rational;
  readonly capacity: number;
  readonly events: readonly MusicXmlMeasureEvent[];
}

export interface MusicXmlMelodyMeasure {
  readonly number: number;
  readonly startBeats: Rational;
  readonly capacityBeats: Rational;
  readonly durationBeats: Rational;
  readonly capacity: number;
  readonly events: readonly MusicXmlMelodyMeasureEvent[];
}

export interface MusicXmlMelodyPart {
  readonly id: typeof MUSICXML_MELODY_PART_ID;
  readonly name: string;
  readonly instrumentName: string;
  readonly instrument: MelodyInstrument;
  /** MusicXML uses one-based channels; channel 3 is the app's melody channel 2. */
  readonly midiChannel: 3;
  /** MusicXML uses one-based programs; this is the General MIDI program + 1. */
  readonly midiProgram: number;
  readonly clef: { readonly sign: "G" | "F"; readonly line: 2 | 4 };
  readonly measures: readonly MusicXmlMelodyMeasure[];
}

export interface MusicXmlProjection {
  readonly version: typeof MUSICXML_VERSION;
  readonly title: string;
  readonly part: { readonly id: typeof MUSICXML_PART_ID; readonly name: typeof MUSICXML_PART_NAME };
  readonly attributes: MusicXmlAttributes;
  readonly tempoBpm: number;
  readonly measures: readonly MusicXmlMeasure[];
  readonly melody?: MusicXmlMelodyPart;
  readonly diagnostics: readonly MusicXmlDiagnostic[];
}

interface MutableMeasure {
  readonly number: number;
  readonly startBeats: Rational;
  readonly capacityBeats: Rational;
  durationBeats: Rational;
  readonly events: MusicXmlMeasureEvent[];
}

interface MutableMelodyMeasure {
  readonly number: number;
  readonly startBeats: Rational;
  readonly capacityBeats: Rational;
  durationBeats: Rational;
  readonly events: MusicXmlMelodyMeasureEvent[];
}

interface MelodyRawEventBase {
  readonly startBeats: Rational;
  readonly endBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
}

interface MelodyRawNoteEvent extends MelodyRawEventBase {
  readonly kind: "note";
  readonly sourceMidi: number;
  readonly sourcePitchMidi: number;
  readonly pitch: MusicXmlPitchSpelling & { readonly octave: number };
  readonly type: MusicXmlMelodyNoteEvent["type"];
  readonly timeModification?: MusicXmlMelodyTimeModification;
  readonly tupletMarks: readonly ("start" | "stop")[];
}

interface MelodyRawRestEvent extends MelodyRawEventBase {
  readonly kind: "rest";
}

type MelodyRawEvent = MelodyRawNoteEvent | MelodyRawRestEvent;

interface ProjectedChord {
  readonly chord: ReturnType<typeof realizeHarmonyChord>;
  readonly pitches: readonly { readonly pitch: ExactPitch; readonly role: "upper" | "bass" }[];
  readonly harmony: MusicXmlHarmonyMapping;
  readonly dynamicLabel: "pp" | "p" | "mp" | "mf" | "f" | "ff";
  readonly sourceVelocity: number;
  readonly arpeggiate?: MusicXmlArticulation;
}

const MELODY_MUSICXML_METADATA: Readonly<
  Record<MelodyInstrument, { readonly name: string; readonly program: number }>
> = Object.freeze({
  flute: Object.freeze({ name: "Flute", program: 73 }),
  violin: Object.freeze({ name: "Violin", program: 40 }),
  clarinet: Object.freeze({ name: "Clarinet", program: 71 }),
  oboe: Object.freeze({ name: "Oboe", program: 68 }),
  cello: Object.freeze({ name: "Cello", program: 42 }),
  "synth-lead": Object.freeze({ name: "Synth Lead", program: 80 }),
});

function melodyNoteType(grid: MelodyGrid): MusicXmlMelodyNoteEvent["type"] {
  switch (grid) {
    case "quarter":
      return "quarter";
    case "eighth":
    case "eighth-triplet":
      return "eighth";
    case "sixteenth":
    case "sixteenth-triplet":
      return "16th";
    default:
      throw new MusicXmlExportError(
        "invalid-projection",
        `Unsupported Melody grid: ${String(grid)}.`,
      );
  }
}

function melodyTimeModification(grid: MelodyGrid): MusicXmlMelodyTimeModification | undefined {
  switch (grid) {
    case "eighth-triplet":
      return Object.freeze({ actualNotes: 3, normalNotes: 2, normalType: "eighth" });
    case "sixteenth-triplet":
      return Object.freeze({ actualNotes: 3, normalNotes: 2, normalType: "16th" });
    default:
      return undefined;
  }
}

function melodyTupletMarks(
  grid: MelodyGrid,
  eventIndex: number,
  eventCount: number,
): readonly ("start" | "stop")[] {
  if (!grid.endsWith("-triplet")) return Object.freeze([]);
  const groupStart = Math.floor(eventIndex / 3) * 3;
  const groupEnd = Math.min(groupStart + 2, eventCount - 1);
  const marks: ("start" | "stop")[] = [];
  if (eventIndex === groupStart) marks.push("start");
  if (eventIndex === groupEnd) marks.push("stop");
  return Object.freeze(marks);
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) [left, right] = [right, left % right];
  return left || 1;
}

function lcmOrThrow(left: number, right: number): number {
  const divisor = gcd(left, right);
  const quotient = left / divisor;
  if (!Number.isSafeInteger(quotient) || quotient > Math.floor(MUSICXML_MAX_DIVISIONS / right)) {
    throw new MusicXmlExportError(
      "duration-divisions-overflow",
      `Exact MusicXML divisions exceed the supported limit of ${MUSICXML_MAX_DIVISIONS}.`,
    );
  }
  const result = quotient * right;
  if (!Number.isSafeInteger(result) || result <= 0 || result > MUSICXML_MAX_DIVISIONS) {
    throw new MusicXmlExportError(
      "duration-divisions-overflow",
      `Exact MusicXML divisions exceed the supported limit of ${MUSICXML_MAX_DIVISIONS}.`,
    );
  }
  return result;
}

function durationUnits(value: Rational, divisions: number): number {
  const scaled = value.numerator * divisions;
  if (!Number.isSafeInteger(scaled) || scaled % value.denominator !== 0) {
    throw new MusicXmlExportError(
      "duration-divisions-overflow",
      `Duration ${value.numerator}/${value.denominator} cannot be represented exactly at ${divisions} divisions.`,
    );
  }
  const units = scaled / value.denominator;
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new MusicXmlExportError(
      "duration-divisions-overflow",
      `Duration ${value.numerator}/${value.denominator} produced an invalid MusicXML duration.`,
    );
  }
  return units;
}

function floorRational(value: Rational): number {
  return Math.floor(value.numerator / value.denominator);
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

function pitchWithSavedSpelling(
  pitch: ExactPitch,
  step: ChordStep,
  role: "upper" | "bass",
): ExactPitch {
  const overrides = step.explicitSpellingOverrides;
  const override =
    overrides?.[`${role}:${pitch.midiNumber}`] ?? overrides?.[String(pitch.midiNumber)];
  return override ? exactPitch(pitch.midiNumber, override) : pitch;
}

function musicXmlPitchForExactPitch(
  pitch: ExactPitch,
): MusicXmlPitchSpelling & { readonly octave: number } {
  const spelling = mapPitchSpellingToMusicXml(pitch.spelling);
  const naturalPitchClass: Record<MusicXmlPitchSpelling["step"], number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const octaveNumerator = pitch.midiNumber - naturalPitchClass[spelling.step] - spelling.alter;
  if (octaveNumerator % 12 !== 0) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `Pitch spelling ${spelling.step}${spelling.alter} cannot represent MIDI ${pitch.midiNumber} exactly.`,
    );
  }
  return Object.freeze({ ...spelling, octave: octaveNumerator / 12 - 1 });
}

function freezeProjectedPitches(
  realization: { readonly pitches: readonly ExactPitch[]; readonly bassPitch?: ExactPitch },
  step: ChordStep,
): readonly { readonly pitch: ExactPitch; readonly role: "upper" | "bass" }[] {
  const pitches: { readonly pitch: ExactPitch; readonly role: "upper" | "bass" }[] = [];
  if (realization.bassPitch) {
    pitches.push({
      pitch: pitchWithSavedSpelling(realization.bassPitch, step, "bass"),
      role: "bass",
    });
  }
  const uppers = [...realization.pitches]
    .map((pitch) => pitchWithSavedSpelling(pitch, step, "upper"))
    .sort((a, b) => a.midiNumber - b.midiNumber);
  for (const pitch of uppers) pitches.push({ pitch, role: "upper" });
  return Object.freeze(pitches.map((item) => Object.freeze(item)));
}

function projectChord(
  project: Project,
  step: ChordStep,
  context: HarmonicContext,
  previousPitches: readonly ExactPitch[] | undefined,
  previousBassPitch: ExactPitch | undefined,
  diagnostics: MusicXmlDiagnostic[],
): ProjectedChord {
  const chord = realizeHarmonyChord(step.harmonicFunction, project.tonic);
  const harmonyMapping = mapChordToMusicXmlHarmony(
    { ...chord, variant: step.harmonicVariant },
    step.id,
  );
  diagnostics.push(...harmonyMapping.diagnostics);
  if (harmonyMapping.status === "error" || !harmonyMapping.value) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `MusicXML harmony mapping for step ${step.id} would not be exact.`,
    );
  }

  const articulationMapping = mapPianoArticulationToMusicXml(
    step.performance.articulation,
    step.id,
  );
  diagnostics.push(...articulationMapping.diagnostics);
  const dynamicMapping = mapMasterVelocityToMusicXmlDynamic(step.performance.masterVelocity);
  diagnostics.push(...dynamicMapping.diagnostics);
  if (dynamicMapping.status === "error" || !dynamicMapping.value) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `Invalid Master Velocity on step ${step.id}.`,
    );
  }

  if (Object.keys(step.performance.perNoteVelocityOverrides).length > 0) {
    diagnostics.push(
      musicXmlDiagnostic(
        "per-note-velocity-omitted",
        "Per-note velocity differences are not represented as one chord-level notation dynamic.",
        "warning",
        step.id,
      ),
    );
  }

  const realization = pianoProfile.realizeChord({
    context,
    chord: { ...chord, variant: step.harmonicVariant },
    performance: step.performance,
    ...(previousPitches ? { previousPitches } : {}),
    ...(previousBassPitch ? { previousBassPitch } : {}),
  });

  return Object.freeze({
    chord,
    pitches: freezeProjectedPitches(realization, step),
    harmony: harmonyMapping.value,
    dynamicLabel: dynamicMapping.value.label,
    sourceVelocity: dynamicMapping.value.sourceVelocity,
    ...(articulationMapping.value ? { arpeggiate: articulationMapping.value } : {}),
  });
}

function addFragment(
  measure: MutableMeasure,
  entry: TimelineStepEntry,
  fragmentStart: Rational,
  fragmentEnd: Rational,
  divisions: number,
  projectedChord: ProjectedChord | undefined,
  fragmentIndex: number,
  fragmentCount: number,
  emitDynamic: boolean,
): void {
  const fragmentDuration = subtractRational(fragmentEnd, fragmentStart);
  const onsetBeats = subtractRational(fragmentStart, measure.startBeats);
  const duration = durationUnits(fragmentDuration, divisions);
  const isFirstFragment = fragmentIndex === 0;
  const isLastFragment = fragmentIndex === fragmentCount - 1;

  if (!projectedChord) {
    measure.events.push(
      ...([1, 2] as const).map((staff): MusicXmlRestEvent =>
        Object.freeze({
          kind: "rest",
          onsetBeats,
          stepIndex: entry.stepIndex,
          stepId: entry.step.id,
          durationBeats: fragmentDuration,
          duration,
          voice: staff === 1 ? "1" : "2",
          staff,
        }),
      ),
    );
    measure.durationBeats = addRational(measure.durationBeats, fragmentDuration);
    return;
  }

  if (isFirstFragment) {
    measure.events.push(
      Object.freeze({
        kind: "harmony",
        onsetBeats,
        stepIndex: entry.stepIndex,
        stepId: entry.step.id,
        harmony: projectedChord.harmony,
      }),
    );
    if (emitDynamic) {
      measure.events.push(
        Object.freeze({
          kind: "direction",
          onsetBeats,
          stepIndex: entry.stepIndex,
          stepId: entry.step.id,
          dynamicLabel: projectedChord.dynamicLabel,
          sourceVelocity: projectedChord.sourceVelocity,
        }),
      );
    }
  }

  const ties: ("start" | "stop")[] = [];
  if (!isFirstFragment) ties.push("stop");
  if (!isLastFragment) ties.push("start");

  let upperPitchIndex = 0;
  projectedChord.pitches.forEach(({ pitch, role }) => {
    const staff = role === "upper" ? 1 : 2;
    const event: MusicXmlNoteEvent = Object.freeze({
      kind: "note",
      onsetBeats,
      stepIndex: entry.stepIndex,
      stepId: entry.step.id,
      durationBeats: fragmentDuration,
      duration,
      voice: staff === 1 ? "1" : "2",
      staff,
      chord: role === "upper" ? upperPitchIndex++ > 0 : false,
      sourceMidi: pitch.midiNumber,
      role,
      pitch: musicXmlPitchForExactPitch(pitch),
      ties: Object.freeze([...ties]),
      // Piano arpeggiation affects upper voices; the independent bass stays on beat.
      ...(isFirstFragment && role === "upper" && projectedChord.arpeggiate
        ? { arpeggiate: projectedChord.arpeggiate }
        : {}),
    });
    measure.events.push(event);
  });
  measure.durationBeats = addRational(measure.durationBeats, fragmentDuration);
}

function eventPriority(event: MusicXmlMeasureEvent): number {
  switch (event.kind) {
    case "direction":
      return 0;
    case "harmony":
      return 1;
    case "rest":
      return 2;
    case "note":
      return event.chord ? 4 : 3;
  }
}

function sortEvents(events: readonly MusicXmlMeasureEvent[]): readonly MusicXmlMeasureEvent[] {
  return Object.freeze(
    [...events].sort(
      (a, b) =>
        compareRational(a.onsetBeats, b.onsetBeats) ||
        eventPriority(a) - eventPriority(b) ||
        a.stepIndex - b.stepIndex ||
        (a.kind === "note" && b.kind === "note" ? a.sourceMidi - b.sourceMidi : 0),
    ),
  );
}

function freezeMeasure(measure: MutableMeasure, divisions: number): MusicXmlMeasure {
  const capacity = durationUnits(measure.capacityBeats, divisions);
  return Object.freeze({
    number: measure.number,
    startBeats: measure.startBeats,
    capacityBeats: measure.capacityBeats,
    durationBeats: measure.durationBeats,
    capacity,
    events: sortEvents(measure.events),
  });
}

function freezeMelodyMeasure(
  measure: MutableMelodyMeasure,
  divisions: number,
): MusicXmlMelodyMeasure {
  return Object.freeze({
    number: measure.number,
    startBeats: measure.startBeats,
    capacityBeats: measure.capacityBeats,
    durationBeats: measure.durationBeats,
    capacity: durationUnits(measure.capacityBeats, divisions),
    events: Object.freeze([...measure.events]),
  });
}

function addMelodyRawEvent(
  measures: readonly MutableMelodyMeasure[],
  rawEvent: MelodyRawEvent,
  divisions: number,
  barLengthBeats: Rational,
): void {
  if (compareRational(rawEvent.endBeats, rawEvent.startBeats) <= 0) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `Melody event ${rawEvent.stepId} must have a positive duration.`,
    );
  }

  let cursor = rawEvent.startBeats;
  while (compareRational(cursor, rawEvent.endBeats) < 0) {
    const barIndex = floorRational(divideRationalSafe(cursor, barLengthBeats));
    const measure = measures[barIndex];
    if (!measure) {
      throw new MusicXmlExportError(
        "invalid-projection",
        `Melody event ${rawEvent.stepId} falls outside the MusicXML measure layout.`,
      );
    }
    const boundary = addRational(measure.startBeats, measure.capacityBeats);
    const fragmentEnd =
      compareRational(rawEvent.endBeats, boundary) <= 0 ? rawEvent.endBeats : boundary;
    const durationBeats = subtractRational(fragmentEnd, cursor);
    const isFirstFragment = compareRational(cursor, rawEvent.startBeats) === 0;
    const isLastFragment = compareRational(fragmentEnd, rawEvent.endBeats) === 0;
    const ties: ("start" | "stop")[] = [];
    if (!isFirstFragment) ties.push("stop");
    if (!isLastFragment) ties.push("start");
    const onsetBeats = subtractRational(cursor, measure.startBeats);
    const duration = durationUnits(durationBeats, divisions);

    if (rawEvent.kind === "note") {
      const tupletMarks: ("start" | "stop")[] = [];
      if (isFirstFragment && rawEvent.tupletMarks.includes("start")) tupletMarks.push("start");
      if (isLastFragment && rawEvent.tupletMarks.includes("stop")) tupletMarks.push("stop");
      measure.events.push(
        Object.freeze({
          kind: "note",
          onsetBeats,
          stepIndex: rawEvent.stepIndex,
          stepId: rawEvent.stepId,
          durationBeats,
          duration,
          voice: "1",
          staff: 1,
          chord: false,
          sourceMidi: rawEvent.sourceMidi,
          sourcePitchMidi: rawEvent.sourcePitchMidi,
          pitch: rawEvent.pitch,
          type: rawEvent.type,
          ties: Object.freeze(ties),
          ...(rawEvent.timeModification ? { timeModification: rawEvent.timeModification } : {}),
          tupletMarks: Object.freeze(tupletMarks),
        } satisfies MusicXmlMelodyNoteEvent),
      );
    } else {
      measure.events.push(
        Object.freeze({
          kind: "rest",
          onsetBeats,
          stepIndex: rawEvent.stepIndex,
          stepId: rawEvent.stepId,
          durationBeats,
          duration,
          voice: "1",
          staff: 1,
        } satisfies MusicXmlMelodyRestEvent),
      );
    }
    measure.durationBeats = addRational(measure.durationBeats, durationBeats);
    cursor = fragmentEnd;
  }
}

function buildMelodyPart(
  project: Project,
  timeline: ReturnType<typeof createProgressionTimeline>,
  projectedChords: ReadonlyMap<number, ProjectedChord>,
  measureLayout: ReturnType<typeof createProgressionMeasureLayout>,
  divisions: number,
  barLengthBeats: Rational,
): MusicXmlMelodyPart | undefined {
  const hasAuthoredMelody = project.progression.steps.some(
    (step) => step.kind === "chord" && step.melody !== undefined,
  );
  if (!hasAuthoredMelody) return undefined;

  let melodyTrack;
  try {
    melodyTrack = validateMelodyTrackSettings(project.melodyTrack);
  } catch (error) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `Invalid Melody track settings: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  const rawEvents: MelodyRawEvent[] = [];
  for (const entry of timeline.steps) {
    if (entry.step.kind !== "chord" || !entry.step.melody) {
      rawEvents.push(
        Object.freeze({
          kind: "rest",
          startBeats: entry.startBeats,
          endBeats: entry.endBeats,
          stepIndex: entry.stepIndex,
          stepId: entry.step.id,
        }),
      );
      continue;
    }
    const recipe = entry.step.melody;

    const projectedChord = projectedChords.get(entry.stepIndex);
    if (!projectedChord) {
      throw new MusicXmlExportError(
        "invalid-projection",
        `Missing contextual Piano realization for Melody step ${entry.step.id}.`,
      );
    }

    try {
      const phrase = realizeChordMelody({
        sourceStepId: entry.step.id,
        upperPitches: projectedChord.pitches
          .filter((item) => item.role === "upper")
          .map((item) => item.pitch),
        durationBeats: entry.durationBeats,
        recipe,
      });
      const type = melodyNoteType(recipe.grid);
      const timeModification = melodyTimeModification(recipe.grid);
      phrase.events.forEach((event) => {
        const startBeats = addRational(entry.startBeats, event.startOffsetBeats);
        rawEvents.push(
          Object.freeze({
            kind: "note",
            startBeats,
            endBeats: addRational(startBeats, event.durationBeats),
            stepIndex: entry.stepIndex,
            stepId: entry.step.id,
            sourceMidi: event.pitch.midiNumber,
            sourcePitchMidi: event.sourcePitchMidi,
            pitch: musicXmlPitchForExactPitch(event.pitch),
            type,
            ...(timeModification ? { timeModification } : {}),
            tupletMarks: melodyTupletMarks(recipe.grid, event.index, phrase.events.length),
          }),
        );
      });
    } catch (error) {
      if (error instanceof MusicXmlExportError) throw error;
      throw new MusicXmlExportError(
        "invalid-projection",
        `Invalid Melody recipe on step ${entry.step.id}: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }

  if (compareRational(measureLayout.trailingSilenceBeats, ZERO) > 0) {
    rawEvents.push(
      Object.freeze({
        kind: "rest",
        startBeats: measureLayout.authoredDurationBeats,
        endBeats: measureLayout.playbackDurationBeats,
        stepIndex: project.progression.steps.length,
        stepId: "__trailing-measure-gap__",
      }),
    );
  }

  const measures: MutableMelodyMeasure[] = measureLayout.measures.map((measure) => ({
    number: measure.number,
    startBeats: measure.startBeats,
    capacityBeats: measure.capacityBeats,
    durationBeats: ZERO,
    events: [],
  }));
  for (const rawEvent of rawEvents) {
    addMelodyRawEvent(measures, rawEvent, divisions, barLengthBeats);
  }

  const metadata = MELODY_MUSICXML_METADATA[melodyTrack.instrument];
  if (!metadata) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `Unsupported Melody instrument: ${String(melodyTrack.instrument)}.`,
    );
  }
  const clef: MusicXmlMelodyPart["clef"] =
    melodyTrack.instrument === "cello" ? { sign: "F", line: 4 } : { sign: "G", line: 2 };
  return Object.freeze({
    id: MUSICXML_MELODY_PART_ID,
    name: metadata.name,
    instrumentName: metadata.name,
    instrument: melodyTrack.instrument,
    midiChannel: 3,
    midiProgram: metadata.program + 1,
    clef,
    measures: Object.freeze(measures.map((measure) => freezeMelodyMeasure(measure, divisions))),
  });
}

function calculateDivisions(project: Project, barLengthBeats: Rational): number {
  let divisions = 1;
  for (const step of project.progression.steps) {
    divisions = lcmOrThrow(divisions, step.duration.beats.denominator);
    if (step.kind === "chord" && step.melody) {
      try {
        divisions = lcmOrThrow(divisions, melodyGridDuration(step.melody.grid).denominator);
      } catch (error) {
        if (error instanceof MusicXmlExportError) throw error;
        throw new MusicXmlExportError(
          "invalid-projection",
          `Invalid Melody recipe on step ${step.id}: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
    }
  }
  divisions = lcmOrThrow(divisions, barLengthBeats.denominator);
  return divisions;
}

function groupingText(grouping: readonly number[]): string {
  return grouping.join("+");
}

/**
 * Converts the saved semantic Project directly to an immutable MusicXML DTO.
 * This boundary intentionally ignores temporary branches, presentation state,
 * runtime transport state, playback seconds, and the MIDI projection.
 */
export function projectProjectToMusicXml(project: Project): MusicXmlProjection {
  if (!project.progression.steps.length) {
    throw new MusicXmlExportError(
      "empty-progression",
      "MusicXML export requires a non-empty saved progression.",
    );
  }
  if (!Number.isFinite(project.globalTiming.tempoBpm) || project.globalTiming.tempoBpm <= 0) {
    throw new MusicXmlExportError(
      "invalid-tempo",
      "MusicXML export requires a positive finite tempo.",
    );
  }

  const meter = project.globalTiming.meter;
  const barLengthBeats = rational(meter.numerator * 4, meter.denominator);
  const divisions = calculateDivisions(project, barLengthBeats);
  const context = createContext(project);
  const timeline = createProgressionTimeline(project.progression.steps, meter);
  const diagnostics: MusicXmlDiagnostic[] = [
    musicXmlDiagnostic(
      "presentation-state-omitted",
      "Matrix selection, Card View, theme, and expertise mode are outside the notation score.",
      "info",
    ),
    musicXmlDiagnostic(
      "recommendation-metadata-omitted",
      "Recommendation and preset metadata are outside the saved progression score.",
      "info",
    ),
    musicXmlDiagnostic(
      "runtime-state-omitted",
      "Transport, playhead, Undo/Redo, and audio-provider runtime state are outside the score.",
      "info",
    ),
  ];
  diagnostics.push(...mapGrooveToMusicXml(project.groove.feel).diagnostics);
  if (project.temporaryBranch) {
    diagnostics.push(
      musicXmlDiagnostic(
        "temporary-branch-omitted",
        "The active temporary branch is excluded; saved progression steps are the score source.",
        "warning",
      ),
    );
  }

  const measures = new Map<number, MutableMeasure>();
  const getMeasure = (barIndex: number): MutableMeasure => {
    const existing = measures.get(barIndex);
    if (existing) return existing;
    const created: MutableMeasure = {
      number: barIndex + 1,
      startBeats: multiplyRational(barLengthBeats, rational(barIndex)),
      capacityBeats: barLengthBeats,
      durationBeats: ZERO,
      events: [],
    };
    measures.set(barIndex, created);
    return created;
  };

  let previousPitches: readonly ExactPitch[] | undefined;
  let previousBassPitch: ExactPitch | undefined;
  let previousDynamicLabel: ProjectedChord["dynamicLabel"] | undefined;
  const projectedChords = new Map<number, ProjectedChord>();

  for (const entry of timeline.steps) {
    if (entry.step.kind === "chord") {
      const projectedChord = projectChord(
        project,
        entry.step,
        context,
        previousPitches,
        previousBassPitch,
        diagnostics,
      );
      projectedChords.set(entry.stepIndex, projectedChord);
      previousPitches = projectedChord.pitches
        .filter((item) => item.role === "upper")
        .map((item) => item.pitch);
      previousBassPitch = projectedChord.pitches.find((item) => item.role === "bass")?.pitch;
    }

    const fragments: { readonly start: Rational; readonly end: Rational }[] = [];
    let cursor = entry.startBeats;
    while (compareRational(cursor, entry.endBeats) < 0) {
      const barIndex = floorRational(divideRationalSafe(cursor, barLengthBeats));
      const boundary = multiplyRational(barLengthBeats, rational(barIndex + 1));
      const end = compareRational(entry.endBeats, boundary) <= 0 ? entry.endBeats : boundary;
      fragments.push(Object.freeze({ start: cursor, end }));
      cursor = end;
    }
    const projectedChord = projectedChords.get(entry.stepIndex);
    const emitDynamic = Boolean(
      projectedChord && projectedChord.dynamicLabel !== previousDynamicLabel,
    );
    fragments.forEach((fragment, fragmentIndex) => {
      addFragment(
        getMeasure(floorRational(divideRationalSafe(fragment.start, barLengthBeats))),
        entry,
        fragment.start,
        fragment.end,
        divisions,
        projectedChord,
        fragmentIndex,
        fragments.length,
        emitDynamic,
      );
    });
    if (projectedChord) previousDynamicLabel = projectedChord.dynamicLabel;
  }

  const measureLayout = createProgressionMeasureLayout(project.progression.steps, meter);
  if (compareRational(measureLayout.trailingSilenceBeats, ZERO) > 0) {
    const finalMeasure = measures.get(measureLayout.measures.length - 1);
    if (!finalMeasure)
      throw new MusicXmlExportError("invalid-projection", "Missing final measure.");
    const gapOnset = subtractRational(measureLayout.authoredDurationBeats, finalMeasure.startBeats);
    finalMeasure.events.push(
      ...([1, 2] as const).map((staff): MusicXmlRestEvent =>
        Object.freeze({
          kind: "rest",
          onsetBeats: gapOnset,
          stepIndex: project.progression.steps.length,
          stepId: "__trailing-measure-gap__",
          durationBeats: measureLayout.trailingSilenceBeats,
          duration: durationUnits(measureLayout.trailingSilenceBeats, divisions),
          voice: staff === 1 ? "1" : "2",
          staff,
        }),
      ),
    );
    finalMeasure.durationBeats = addRational(
      finalMeasure.durationBeats,
      measureLayout.trailingSilenceBeats,
    );
  }

  const measureList = [...measures.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, measure]) => freezeMeasure(measure, divisions));

  const key = mapTonicToMusicXmlKey(project.tonic, modeForModule(project.activeModule));
  const melodyPart = buildMelodyPart(
    project,
    timeline,
    projectedChords,
    measureLayout,
    divisions,
    barLengthBeats,
  );
  const projection: MusicXmlProjection = Object.freeze({
    version: MUSICXML_VERSION,
    title: project.name,
    part: Object.freeze({ id: MUSICXML_PART_ID, name: MUSICXML_PART_NAME }),
    attributes: Object.freeze({
      divisions,
      key,
      time: Object.freeze({
        numerator: meter.numerator,
        denominator: meter.denominator,
        beats: groupingText(meter.grouping),
        grouping: Object.freeze([...meter.grouping]),
      }),
      staves: 2,
      clefs: Object.freeze([
        Object.freeze({ number: 1, sign: "G", line: 2 }),
        Object.freeze({ number: 2, sign: "F", line: 4 }),
      ] as const),
    }),
    tempoBpm: project.globalTiming.tempoBpm,
    measures: Object.freeze(measureList),
    ...(melodyPart ? { melody: melodyPart } : {}),
    diagnostics: Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic }))),
  });
  return projection;
}

function divideRationalSafe(value: Rational, divisor: Rational): Rational {
  return rational(value.numerator * divisor.denominator, value.denominator * divisor.numerator);
}

export const projectProgressionToMusicXml = projectProjectToMusicXml;

export function musicXmlModeForProject(project: Project): "major" | "minor" {
  return mapCadenceFlowModeToMusicXmlMode(modeForModule(project.activeModule));
}

export type { ChordStep, ProgressionStep, RestStep };
