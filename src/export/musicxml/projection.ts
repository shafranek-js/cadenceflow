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
import type { ExactPitch } from "../../domain/harmony/pitch";
import { createEffectiveMelodyTimeline } from "../../domain/melody/effectiveTimeline";
import {
  snapshotChordMelody,
  validateMelodyTrackSettings,
  type MelodyGrid,
  type MelodyInstrument,
  type MelodyRhythm,
} from "../../domain/melody/types";
import {
  getMelodyInstrument,
  type MelodyInstrumentCatalogEntry,
} from "../../domain/melody/instrumentCatalog";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import type { ChordStep, ProgressionStep, RestStep } from "../../domain/progression/step";
import type { Project } from "../../domain/project/project";
import {
  realizeProgressionStepChord,
  stepTranspositionSemitones,
  transposeExactPitch,
} from "../../domain/progression/transposition";
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
import { projectWrittenRhythm } from "../../notation/writtenRhythmProjection";
import { pianoProfile } from "../../instruments/piano/profile";

export const MUSICXML_VERSION = "4.0";
export const MUSICXML_PART_ID = "P1";
export const MUSICXML_PART_NAME = "Piano";
export const MUSICXML_MELODY_PART_ID = "P2";
/**
 * Upper bound on the exact `divisions` value the exporter will emit.
 *
 * `divisions` must be a multiple of every duration denominator in the score (see
 * `calculateDivisions`), so the number grows with the least common multiple of the subdivision
 * grid in use. The previous limit of 1_000_000 was reached by plausible tuplet combinations —
 * sixteenths plus triplet-eighths plus quintuplets already lands at 2400, and mixing several
 * tuplet families multiplies quickly (e.g. 5·7·9·25 = 7875, and adding a 32nd-note grid gives
 * 252000). Raising the ceiling keeps those scores exportable exactly instead of refusing them.
 *
 * The value stays a safe integer so `value.numerator * divisions` cannot lose precision, and it
 * is documented by `MusicXmlProjection.attributes.divisions` in the emitted XML.
 */
export const MUSICXML_MAX_DIVISIONS = 100_000_000;

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
  /**
   * Written note value, decomposed so the bar can always be notated.
   *
   * A bar is not necessarily one writable value: five quarter beats in 5/4 are neither a whole note
   * (4) nor a dotted whole (6), so they must be written as tied notes. `<type>` is therefore
   * required per written part, not per sounding note — without it notation software cannot tell how
   * long the bar is and reports the file as corrupted.
   */
  readonly type: MusicXmlWrittenNoteType;
  readonly dots?: 1;
  readonly timeModification?: MusicXmlMelodyTimeModification;
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
  readonly type: MusicXmlWrittenNoteType;
  readonly dots?: 1;
  readonly timeModification?: MusicXmlMelodyTimeModification;
  readonly ties: readonly ("start" | "stop")[];
}

export type MusicXmlMeasureEvent =
  MusicXmlHarmonyEvent | MusicXmlDirectionEvent | MusicXmlNoteEvent | MusicXmlRestEvent;

export interface MusicXmlMelodyTimeModification {
  readonly actualNotes: number;
  readonly normalNotes: number;
  readonly normalType: MusicXmlWrittenNoteType;
}

export type MusicXmlWrittenNoteType =
  "whole" | "half" | "quarter" | "eighth" | "16th" | "32nd" | "64th";

export interface MusicXmlMelodyNoteEvent {
  readonly eventKey: string;
  readonly kind: "note";
  readonly onsetBeats: Rational;
  readonly stepIndex: number;
  readonly stepId: string;
  readonly durationBeats: Rational;
  readonly duration: number;
  readonly voice: string;
  readonly staff: 1;
  readonly chord: false;
  readonly sourceMidi: number;
  readonly sourcePitchMidi: number;
  readonly instrumentId: string;
  readonly instrument: MelodyInstrument;
  readonly clef: { readonly sign: "G" | "F"; readonly line: 2 | 4 };
  readonly pitch: MusicXmlPitchSpelling & { readonly octave: number };
  readonly type: MusicXmlWrittenNoteType;
  readonly dots?: 1;
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
  readonly voice: string;
  readonly staff: 1;
  readonly type: MusicXmlWrittenNoteType;
  readonly dots?: 1;
  readonly timeModification?: MusicXmlMelodyTimeModification;
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
  readonly id: string;
  readonly firstStepIndex: number;
  readonly name: string;
  readonly instrumentName: string;
  readonly instrument: MelodyInstrument;
  /** MusicXML uses one-based channels; channel 3 is the app's melody channel 2. */
  readonly midiChannel: number;
  /** MusicXML uses one-based programs; this is the General MIDI program + 1. */
  readonly midiProgram: number;
  readonly clef: { readonly sign: "G" | "F"; readonly line: 2 | 4 };
  readonly instruments: readonly MusicXmlMelodyInstrument[];
  readonly measures: readonly MusicXmlMelodyMeasure[];
}

export interface MusicXmlMelodyInstrument {
  readonly id: string;
  readonly instrument: MelodyInstrument;
  readonly name: string;
  readonly family: string;
  readonly clef: { readonly sign: "G" | "F"; readonly line: 2 | 4 };
  readonly midiChannel: number;
  readonly midiProgram: number;
}

export interface MusicXmlProjection {
  readonly version: typeof MUSICXML_VERSION;
  readonly title: string;
  readonly part: { readonly id: typeof MUSICXML_PART_ID; readonly name: typeof MUSICXML_PART_NAME };
  readonly attributes: MusicXmlAttributes;
  readonly tempoBpm: number;
  readonly measures: readonly MusicXmlMeasure[];
  readonly melody?: MusicXmlMelodyPart;
  /** One full-score part per unique effective Melody instrument. */
  readonly melodyParts?: readonly MusicXmlMelodyPart[];
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
  readonly voice: string;
  readonly eventKey: string;
  readonly kind: "note";
  readonly sourceMidi: number;
  readonly sourcePitchMidi: number;
  readonly pitch: MusicXmlPitchSpelling & { readonly octave: number };
  readonly grid: MelodyGrid;
  readonly tupletMarks: readonly ("start" | "stop")[];
  readonly instrument: MelodyInstrument;
}

interface MelodyRawRestEvent extends MelodyRawEventBase {
  readonly kind: "rest";
}

type MelodyRawEvent = MelodyRawNoteEvent | MelodyRawRestEvent;

interface ProjectedChord {
  readonly chord: ReturnType<typeof realizeHarmonyChord>;
  readonly pitches: readonly { readonly pitch: ExactPitch; readonly role: "upper" | "bass" }[];
  readonly contextUpperPitches: readonly ExactPitch[];
  readonly contextBassPitch?: ExactPitch | undefined;
  readonly harmony: MusicXmlHarmonyMapping;
  readonly dynamicLabel: "pp" | "p" | "mp" | "mf" | "f" | "ff";
  readonly sourceVelocity: number;
  readonly arpeggiate?: MusicXmlArticulation;
}

function melodyClef(entry: MelodyInstrumentCatalogEntry): { sign: "G" | "F"; line: 2 | 4 } {
  return entry.clef === "bass" ? { sign: "F", line: 4 } : { sign: "G", line: 2 };
}

/** Preserve the established user-facing alias for the bundled Lead 1 sample. */
function melodyExportName(entry: MelodyInstrumentCatalogEntry): string {
  return entry.id === "synth-lead" ? "Synth Lead" : entry.label;
}

interface WrittenRhythmPart {
  readonly durationBeats: Rational;
  readonly notation: Pick<MusicXmlMelodyNoteEvent, "type" | "dots" | "timeModification">;
}

const MUSIC_XML_NOTE_TYPE: Readonly<Record<string, MusicXmlWrittenNoteType>> = Object.freeze({
  w: "whole",
  h: "half",
  q: "quarter",
  "8": "eighth",
  "16": "16th",
  "32": "32nd",
  "64": "64th",
});

function writtenRhythmPartsForDuration(
  duration: Rational,
  startOffset: Rational,
  timeSignature: Project["globalTiming"]["meter"],
): readonly WrittenRhythmPart[] {
  if (compareRational(duration, ZERO) <= 0) {
    throw new MusicXmlExportError(
      "invalid-projection",
      "Melody rhythm parts need positive durations.",
    );
  }
  return Object.freeze(
    projectWrittenRhythm(duration, startOffset, timeSignature).map((part) => {
      const type = MUSIC_XML_NOTE_TYPE[part.vexDuration];
      if (!type)
        throw new MusicXmlExportError(
          "invalid-projection",
          `Unsupported written rhythm value ${part.vexDuration}.`,
        );
      return Object.freeze({
        durationBeats: part.beats,
        notation: Object.freeze({
          type,
          ...(part.dots === 1 ? { dots: 1 as const } : {}),
          ...(part.tuplet
            ? {
                timeModification: {
                  actualNotes: part.tuplet.numNotes,
                  normalNotes: part.tuplet.notesOccupied,
                  normalType: type,
                },
              }
            : {}),
        }),
      });
    }),
  );
}

function melodyTupletMarks(
  grid: MelodyGrid,
  rhythm: MelodyRhythm,
  eventIndex: number,
  eventCount: number,
): readonly ("start" | "stop")[] {
  if (rhythm !== "even" || !grid.endsWith("-triplet")) return Object.freeze([]);
  const groupStart = Math.floor(eventIndex / 3) * 3;
  const groupEnd = Math.min(groupStart + 2, eventCount - 1);
  const marks: ("start" | "stop")[] = [];
  if (eventIndex === groupStart) marks.push("start");
  if (eventIndex === groupEnd) marks.push("stop");
  return Object.freeze(marks);
}

/**
 * Aligns tuplet brackets with the written values that actually form the tuplet.
 *
 * `<time-modification>` comes from decomposing a duration into writable values, while brackets used to
 * be placed by Melody event index (groups of three on a triplet grid). The two disagree as soon as a
 * tuplet note is split into tied written parts: the bracket opened on a plain note and the
 * time-modified notes fell outside it. MuseScore then cannot measure the bar at all — it reported
 * "Found: 585/384. Expected: 6/4" for a bar whose durations sum exactly.
 *
 * A bracket now opens on the first note of a run of time-modified events and closes on the last, per
 * voice. Only notes can carry a bracket: the writer emits `<tuplet>` inside `<notations>`, which the
 * rest element does not produce. A run holding fewer than two notes is not a tuplet and gets none.
 */
function alignTupletBrackets(events: MusicXmlMelodyMeasureEvent[]): void {
  const voices = new Map<string, number[]>();
  events.forEach((event, index) => {
    if (event.kind !== "note" && event.kind !== "rest") return;
    const key = `${event.staff}:${event.voice}`;
    const indices = voices.get(key);
    if (indices) indices.push(index);
    else voices.set(key, [index]);
  });

  for (const indices of voices.values()) {
    indices.sort((left, right) =>
      compareRational(events[left]!.onsetBeats, events[right]!.onsetBeats),
    );
    let run: number[] = [];
    const closeRun = () => {
      const notes = run.filter((index) => events[index]?.kind === "note");
      const first = notes[0];
      const last = notes[notes.length - 1];
      if (first !== undefined && last !== undefined && first !== last) {
        for (const index of [first, last]) {
          const event = events[index];
          if (!event || event.kind !== "note") continue;
          const marks: ("start" | "stop")[] = [];
          if (index === first) marks.push("start");
          if (index === last) marks.push("stop");
          events[index] = Object.freeze({ ...event, tupletMarks: Object.freeze(marks) });
        }
      }
      run = [];
    };
    for (const index of indices) {
      const event = events[index];
      const timed =
        event !== undefined &&
        (event.kind === "note" || event.kind === "rest") &&
        event.timeModification !== undefined;
      if (timed) run.push(index);
      else closeRun();
    }
    closeRun();
  }
}

function effectiveMelodyForExport(project: Project) {
  try {
    return createEffectiveMelodyTimeline(project);
  } catch (error) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `Invalid effective Melody data: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) [left, right] = [right, left % right];
  return left || 1;
}

/**
 * Combines two denominators into the running `divisions` value, or reports what overflowed.
 *
 * `source` names the step or melody note whose denominator forced the failure. The message has to
 * be actionable: the previous version said only that the limit was exceeded, leaving the user no
 * way to find the offending step in a long progression.
 */
function lcmOrThrow(left: number, right: number, source: string): number {
  const divisor = gcd(left, right);
  const quotient = left / divisor;
  const overflow = () =>
    new MusicXmlExportError(
      "duration-divisions-overflow",
      `MusicXML divisions would need to be a multiple of ${quotient * right} to notate ${source} ` +
        `exactly, which exceeds the supported limit of ${MUSICXML_MAX_DIVISIONS}. ` +
        `Reduce the tuplet complexity of that step, or use MIDI export instead.`,
    );
  if (!Number.isSafeInteger(quotient) || quotient > Math.floor(MUSICXML_MAX_DIVISIONS / right)) {
    throw overflow();
  }
  const result = quotient * right;
  if (!Number.isSafeInteger(result) || result <= 0 || result > MUSICXML_MAX_DIVISIONS) {
    throw overflow();
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
  return override ? Object.freeze({ ...pitch, spelling: Object.freeze({ ...override }) }) : pitch;
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
  const toConcertPitch = (pitch: ExactPitch, role: "upper" | "bass") =>
    transposeExactPitch(
      pitchWithSavedSpelling(pitch, step, role),
      stepTranspositionSemitones(step),
    );
  const pitches: { readonly pitch: ExactPitch; readonly role: "upper" | "bass" }[] = [];
  if (realization.bassPitch) {
    pitches.push({
      pitch: toConcertPitch(realization.bassPitch, "bass"),
      role: "bass",
    });
  }
  const uppers = [...realization.pitches]
    .map((pitch) => toConcertPitch(pitch, "upper"))
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
  const sourceChord = realizeHarmonyChord(step.harmonicFunction, project.tonic);
  const chord = realizeProgressionStepChord(step, project.tonic);
  const harmonyMapping = mapChordToMusicXmlHarmony(chord, step.id);
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

  const outputRealization = pianoProfile.realizeChord({
    context,
    chord: { ...sourceChord, variant: step.harmonicVariant },
    performance: step.performance,
    concertTranspositionSemitones: stepTranspositionSemitones(step),
    ...(previousPitches ? { previousPitches } : {}),
    ...(previousBassPitch ? { previousBassPitch } : {}),
  });
  const contextRealization =
    step.performance.register === "auto"
      ? outputRealization
      : pianoProfile.realizeChord({
          context,
          chord: { ...sourceChord, variant: step.harmonicVariant },
          performance: { ...step.performance, register: "auto" },
          concertTranspositionSemitones: stepTranspositionSemitones(step),
          ...(previousPitches ? { previousPitches } : {}),
          ...(previousBassPitch ? { previousBassPitch } : {}),
        });

  return Object.freeze({
    chord,
    pitches: freezeProjectedPitches(
      project.independentBassEnabled ? outputRealization : { pitches: outputRealization.pitches },
      step,
    ),
    contextUpperPitches: contextRealization.pitches,
    contextBassPitch: project.independentBassEnabled ? contextRealization.bassPitch : undefined,
    harmony: harmonyMapping.value,
    dynamicLabel: dynamicMapping.value.label,
    sourceVelocity: dynamicMapping.value.sourceVelocity,
    ...(articulationMapping.value ? { arpeggiate: articulationMapping.value } : {}),
  });
}

/**
 * Written values for one Piano note or rest.
 *
 * A duration a single written note expresses stays one note, so accepted notation that was already
 * correct is untouched — a dotted quarter in 7/8 stays one dotted quarter, not a quarter tied to an
 * eighth, even though it crosses the 2+2+3 grouping. Only a duration no single value expresses —
 * five quarter beats in 5/4, neither a whole nor a dotted whole — becomes tied notes. Tuplets are not
 * single values and fall through to the metric decomposition, which writes `<time-modification>`.
 */
function pianoWrittenParts(
  durationBeats: Rational,
  onsetBeats: Rational,
  meter: Project["globalTiming"]["meter"],
): ReturnType<typeof writtenRhythmPartsForDuration> {
  const single = singleWrittenValue(durationBeats);
  if (single) {
    return Object.freeze([
      Object.freeze({
        durationBeats,
        notation: Object.freeze({
          type: single.type,
          ...(single.dots ? { dots: single.dots } : {}),
        }),
      }),
    ]);
  }
  const tuplet = tupletWrittenValue(durationBeats);
  if (tuplet) {
    return Object.freeze([
      Object.freeze({
        durationBeats,
        notation: Object.freeze({
          type: tuplet.type,
          timeModification: tuplet.timeModification,
        }),
      }),
    ]);
  }
  return writtenRhythmPartsForDuration(durationBeats, onsetBeats, meter);
}

/** Every duration a single written note expresses, with its dots. */
const SINGLE_WRITTEN_VALUES: readonly {
  readonly beats: Rational;
  readonly type: MusicXmlWrittenNoteType;
  readonly dots?: 1;
}[] = Object.freeze(
  (
    [
      ["whole", 4, 1],
      ["half", 2, 1],
      ["quarter", 1, 1],
      ["eighth", 1, 2],
      ["16th", 1, 4],
      ["32nd", 1, 8],
      ["64th", 1, 16],
    ] as const
  ).flatMap(([type, numerator, denominator]) =>
    Object.freeze([
      Object.freeze({ beats: rational(numerator, denominator), type }),
      Object.freeze({
        beats: multiplyRational(rational(numerator, denominator), rational(3, 2)),
        type,
        dots: 1 as const,
      }),
    ]),
  ),
);

function singleWrittenValue(durationBeats: Rational) {
  return SINGLE_WRITTEN_VALUES.find((value) => compareRational(value.beats, durationBeats) === 0);
}

/**
 * Conventional tuplet ratios: `actual` notes in the time of `normal`.
 *
 * `normal` stays within 2..4 so ordinary ratios (3:2 triplets, 5:4 quintuplets, 2:3 duplets) are
 * recognised without misreading a plain five-beat bar as "4 whole notes in the time of 5".
 */
const TUPLET_NORMAL_NOTES: readonly number[] = Object.freeze([2, 3, 4]);
const TUPLET_ACTUAL_LIMIT = 13;

/**
 * A duration one tuplet note expresses, e.g. a quintuplet that is `1/5` of a beat.
 *
 * Without this the metric decomposition writes `1/5` as a dotted 32nd tied to a 1/80 tuplet, which
 * drags a 16th-note grid into `divisions` (45045 becomes 720720) for music that is a plain
 * quintuplet. Recognising the ratio keeps the grid as coarse as the music actually needs.
 */
function tupletWrittenValue(durationBeats: Rational):
  | {
      readonly type: MusicXmlWrittenNoteType;
      readonly timeModification: MusicXmlMelodyTimeModification;
    }
  | undefined {
  for (const value of SINGLE_WRITTEN_VALUES) {
    if (value.dots) continue;
    const ratio = rational(
      durationBeats.numerator * value.beats.denominator,
      durationBeats.denominator * value.beats.numerator,
    );
    // `1/1` is a plain value and `1/n` is not a conventional tuplet ratio.
    if (ratio.numerator < 2 || !TUPLET_NORMAL_NOTES.includes(ratio.numerator)) continue;
    if (ratio.denominator < 2 || ratio.denominator > TUPLET_ACTUAL_LIMIT) continue;
    return {
      type: value.type,
      timeModification: Object.freeze({
        actualNotes: ratio.denominator,
        normalNotes: ratio.numerator,
        normalType: value.type,
      }),
    };
  }
  return undefined;
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
  meter: Project["globalTiming"]["meter"],
): void {
  const fragmentDuration = subtractRational(fragmentEnd, fragmentStart);
  const onsetBeats = subtractRational(fragmentStart, measure.startBeats);
  const isFirstFragment = fragmentIndex === 0;
  const isLastFragment = fragmentIndex === fragmentCount - 1;
  // Split the fragment into writable note values. A bar is not necessarily a single value — five
  // quarter beats need a whole tied to a quarter — and every written part carries its own `<type>`.
  const writtenParts = pianoWrittenParts(fragmentDuration, onsetBeats, meter);

  if (!projectedChord) {
    let restCursor = onsetBeats;
    for (const part of writtenParts) {
      for (const staff of [1, 2] as const) {
        measure.events.push(
          Object.freeze({
            kind: "rest",
            onsetBeats: restCursor,
            stepIndex: entry.stepIndex,
            stepId: entry.step.id,
            durationBeats: part.durationBeats,
            duration: durationUnits(part.durationBeats, divisions),
            voice: staff === 1 ? "1" : "2",
            staff,
            type: part.notation.type,
            ...(part.notation.dots ? { dots: part.notation.dots } : {}),
            ...(part.notation.timeModification
              ? { timeModification: part.notation.timeModification }
              : {}),
            ties: Object.freeze([]),
          }),
        );
      }
      restCursor = addRational(restCursor, part.durationBeats);
    }
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

  let noteCursor = onsetBeats;
  writtenParts.forEach((part, partIndex) => {
    const isFirstPart = partIndex === 0;
    const isLastPart = partIndex === writtenParts.length - 1;
    // A note spanning several written parts is tied; the fragment boundaries tie too.
    const partTies: ("start" | "stop")[] = [];
    if (!isFirstFragment || !isFirstPart) partTies.push("stop");
    if (!isLastFragment || !isLastPart) partTies.push("start");

    let upperPitchIndex = 0;
    projectedChord.pitches.forEach(({ pitch, role }) => {
      const staff = role === "upper" ? 1 : 2;
      const event: MusicXmlNoteEvent = Object.freeze({
        kind: "note",
        onsetBeats: noteCursor,
        stepIndex: entry.stepIndex,
        stepId: entry.step.id,
        durationBeats: part.durationBeats,
        duration: durationUnits(part.durationBeats, divisions),
        voice: staff === 1 ? "1" : "2",
        staff,
        // Only the first pitch of a written part is a new attack; the rest sustain it.
        chord: role === "upper" ? upperPitchIndex++ > 0 : false,
        sourceMidi: pitch.midiNumber,
        role,
        // Preserve the accepted Piano DTO/XML semantics exactly. Melody uses
        // musicXmlPitchForExactPitch below because its octave-offset spelling
        // must remain concert-pitch accurate, but the legacy Piano part keeps
        // the stored ExactPitch octave for no-Melody byte compatibility.
        pitch: Object.freeze({
          ...mapPitchSpellingToMusicXml(pitch.spelling),
          octave: pitch.octave,
        }),
        type: part.notation.type,
        ...(part.notation.dots ? { dots: part.notation.dots } : {}),
        ...(part.notation.timeModification
          ? { timeModification: part.notation.timeModification }
          : {}),
        ties: Object.freeze([...partTies]),
        // Piano arpeggiation affects upper voices; the independent bass stays on beat.
        ...(isFirstFragment && isFirstPart && role === "upper" && projectedChord.arpeggiate
          ? { arpeggiate: projectedChord.arpeggiate }
          : {}),
      });
      measure.events.push(event);
    });
    noteCursor = addRational(noteCursor, part.durationBeats);
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
  meter: Project["globalTiming"]["meter"],
  partId: string,
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
    const writtenParts = writtenRhythmPartsForDuration(
      durationBeats,
      subtractRational(cursor, measure.startBeats),
      meter,
    );
    let partCursor = cursor;
    writtenParts.forEach((part, partIndex) => {
      const firstPart = partIndex === 0;
      const lastPart = partIndex === writtenParts.length - 1;
      const partOnsetBeats = subtractRational(partCursor, measure.startBeats);
      const partDuration = durationUnits(part.durationBeats, divisions);
      if (rawEvent.kind === "note") {
        const partTies: ("start" | "stop")[] = [];
        if (!firstPart || !isFirstFragment) partTies.push("stop");
        if (!lastPart || !isLastFragment) partTies.push("start");
        // Brackets are aligned with the written values once the whole measure is assembled, because a
        // tuplet can span several raw events and a single event can become several tied parts.
        const tupletMarks: ("start" | "stop")[] = [];
        measure.events.push(
          Object.freeze({
            kind: "note",
            onsetBeats: partOnsetBeats,
            stepIndex: rawEvent.stepIndex,
            stepId: rawEvent.stepId,
            eventKey: rawEvent.eventKey,
            durationBeats: part.durationBeats,
            duration: partDuration,
            voice: rawEvent.voice,
            staff: 1,
            chord: false,
            sourceMidi: rawEvent.sourceMidi,
            sourcePitchMidi: rawEvent.sourcePitchMidi,
            instrumentId: `${partId}-I${rawEvent.instrument}`,
            instrument: rawEvent.instrument,
            clef: melodyClef(getMelodyInstrument(rawEvent.instrument)),
            pitch: rawEvent.pitch,
            type: part.notation.type,
            ...(part.notation.dots ? { dots: part.notation.dots } : {}),
            ties: Object.freeze(partTies),
            ...(part.notation.timeModification
              ? { timeModification: part.notation.timeModification }
              : {}),
            tupletMarks: Object.freeze(tupletMarks),
          } satisfies MusicXmlMelodyNoteEvent),
        );
      } else {
        measure.events.push(
          Object.freeze({
            kind: "rest",
            onsetBeats: partOnsetBeats,
            stepIndex: rawEvent.stepIndex,
            stepId: rawEvent.stepId,
            durationBeats: part.durationBeats,
            duration: partDuration,
            voice: "1",
            staff: 1,
            type: part.notation.type,
            ...(part.notation.dots ? { dots: part.notation.dots } : {}),
            ...(part.notation.timeModification
              ? { timeModification: part.notation.timeModification }
              : {}),
          } satisfies MusicXmlMelodyRestEvent),
        );
      }
      partCursor = addRational(partCursor, part.durationBeats);
    });
    measure.durationBeats = addRational(measure.durationBeats, durationBeats);
    cursor = fragmentEnd;
  }
}

function buildMelodyParts(
  project: Project,
  timeline: ReturnType<typeof createProgressionTimeline>,
  measureLayout: ReturnType<typeof createProgressionMeasureLayout>,
  divisions: number,
  barLengthBeats: Rational,
): readonly MusicXmlMelodyPart[] | undefined {
  const effectiveMelody = effectiveMelodyForExport(project);
  const hasAuthoredMelody = effectiveMelody.length > 0;
  if (!hasAuthoredMelody) return undefined;

  try {
    validateMelodyTrackSettings(project.melodyTrack);
  } catch (error) {
    throw new MusicXmlExportError(
      "invalid-projection",
      `Invalid Melody track settings: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }

  const rawEventsByInstrument = new Map<MelodyInstrument, MelodyRawEvent[]>();
  const firstStepByInstrument = new Map<MelodyInstrument, number>();
  const inactiveSpans: MelodyRawRestEvent[] = [];
  const occupied: { startBeats: Rational; endBeats: Rational }[] = effectiveMelody.map((note) => ({
    startBeats: note.startBeats,
    endBeats: addRational(note.startBeats, note.durationBeats),
  }));
  for (const entry of timeline.steps) {
    const covered = occupied.some(
      (span) =>
        compareRational(span.startBeats, entry.endBeats) < 0 &&
        compareRational(span.endBeats, entry.startBeats) > 0,
    );
    if (!covered)
      inactiveSpans.push(
        Object.freeze({
          kind: "rest",
          startBeats: entry.startBeats,
          endBeats: entry.endBeats,
          stepIndex: entry.stepIndex,
          stepId: entry.step.id,
        }),
      );
  }
  for (const note of effectiveMelody) {
    const step = project.progression.steps[note.stepIndex]!;
    const instrument = note.instrument;
    if (!firstStepByInstrument.has(instrument))
      firstStepByInstrument.set(instrument, note.stepIndex);
    const rawEvents = rawEventsByInstrument.get(instrument) ?? [];
    const savedMelody =
      step.kind === "chord" && step.melody ? snapshotChordMelody(step.melody) : undefined;
    const recipe = savedMelody?.mode === "generated" ? savedMelody.recipe : undefined;
    const grid =
      recipe?.grid ??
      (savedMelody?.mode === "authored" ? savedMelody.sourceRecipe?.grid : undefined) ??
      "quarter";
    rawEvents.push(
      Object.freeze({
        kind: "note",
        voice: "1",
        startBeats: note.startBeats,
        endBeats: addRational(note.startBeats, note.durationBeats),
        stepIndex: note.stepIndex,
        stepId: note.sourceStepId,
        sourceMidi: note.pitch.midiNumber,
        sourcePitchMidi: note.sourcePitchMidi,
        eventKey: note.eventKey,
        instrument,
        pitch: musicXmlPitchForExactPitch(note.pitch),
        grid,
        tupletMarks: melodyTupletMarks(
          grid,
          recipe?.rhythm ?? "even",
          note.eventIndex,
          note.eventCount,
        ),
      }),
    );
    rawEventsByInstrument.set(instrument, rawEvents);
  }
  if (compareRational(measureLayout.trailingSilenceBeats, ZERO) > 0) {
    inactiveSpans.push(
      Object.freeze({
        kind: "rest",
        startBeats: measureLayout.authoredDurationBeats,
        endBeats: measureLayout.playbackDurationBeats,
        stepIndex: project.progression.steps.length,
        stepId: "__trailing-measure-gap__",
      }),
    );
  }

  const usedInstruments = [...firstStepByInstrument.keys()].sort(
    (a, b) =>
      firstStepByInstrument.get(a)! - firstStepByInstrument.get(b)! ||
      getMelodyInstrument(a).program - getMelodyInstrument(b).program ||
      a.localeCompare(b),
  );
  return Object.freeze(
    usedInstruments.map((instrument, laneIndex) => {
      const rawEvents = [...(rawEventsByInstrument.get(instrument) ?? [])].sort(
        (a, b) => compareRational(a.startBeats, b.startBeats) || a.stepIndex - b.stepIndex,
      );
      const voiceEnds: Rational[] = [];
      const voicedEvents = rawEvents.map((rawEvent) => {
        let lane = voiceEnds.findIndex(
          (voiceEnd) => compareRational(voiceEnd, rawEvent.startBeats) <= 0,
        );
        if (lane < 0) lane = voiceEnds.length;
        voiceEnds[lane] = rawEvent.endBeats;
        return rawEvent.kind === "note"
          ? Object.freeze({ ...rawEvent, voice: String(lane + 1) })
          : rawEvent;
      });
      const filledEvents: MelodyRawEvent[] = [];
      let cursor = ZERO;
      let restOrdinal = 0;
      const addRestGap = (startBeats: Rational, endBeats: Rational) => {
        let restCursor = startBeats;
        while (compareRational(restCursor, endBeats) < 0) {
          const source = inactiveSpans.find(
            (span) =>
              compareRational(restCursor, span.startBeats) >= 0 &&
              compareRational(restCursor, span.endBeats) < 0,
          );
          const restEnd = source
            ? compareRational(source.endBeats, endBeats) < 0
              ? source.endBeats
              : endBeats
            : endBeats;
          filledEvents.push(
            Object.freeze({
              kind: "rest",
              startBeats: restCursor,
              endBeats: restEnd,
              stepIndex: source?.stepIndex ?? project.progression.steps.length,
              stepId: source?.stepId ?? `__melody-${instrument}-rest-${restOrdinal++}`,
            }),
          );
          restCursor = restEnd;
        }
      };
      voicedEvents.forEach((rawEvent) => {
        if (compareRational(cursor, rawEvent.startBeats) < 0) {
          addRestGap(cursor, rawEvent.startBeats);
        }
        filledEvents.push(rawEvent);
        if (compareRational(cursor, rawEvent.endBeats) < 0) cursor = rawEvent.endBeats;
      });
      if (compareRational(cursor, measureLayout.playbackDurationBeats) < 0) {
        addRestGap(cursor, measureLayout.playbackDurationBeats);
      }

      const measures: MutableMelodyMeasure[] = measureLayout.measures.map((measure) => ({
        number: measure.number,
        startBeats: measure.startBeats,
        capacityBeats: measure.capacityBeats,
        durationBeats: ZERO,
        events: [],
      }));
      const partId = `P${laneIndex + 2}`;
      filledEvents.forEach((rawEvent) => {
        addMelodyRawEvent(
          measures,
          rawEvent,
          divisions,
          barLengthBeats,
          project.globalTiming.meter,
          partId,
        );
      });
      for (const measure of measures) alignTupletBrackets(measure.events);
      const metadata = getMelodyInstrument(instrument);
      const midiChannel = 3 + (laneIndex % 14);
      const instrumentEntry = Object.freeze({
        id: `${partId}-I${instrument}`,
        instrument,
        name: melodyExportName(metadata),
        family: metadata.family,
        clef: melodyClef(metadata),
        midiChannel,
        midiProgram: metadata.program + 1,
      });
      const name =
        usedInstruments.length === 1
          ? melodyExportName(metadata)
          : `Melody · ${melodyExportName(metadata)}`;
      return Object.freeze({
        id: partId,
        firstStepIndex: firstStepByInstrument.get(instrument)!,
        name,
        instrumentName: name,
        instrument,
        midiChannel,
        midiProgram: metadata.program + 1,
        clef: melodyClef(metadata),
        instruments: Object.freeze([instrumentEntry]),
        measures: Object.freeze(measures.map((measure) => freezeMelodyMeasure(measure, divisions))),
      });
    }),
  );
}

function calculateDivisions(project: Project, barLengthBeats: Rational): number {
  let divisions = 1;
  for (const step of project.progression.steps) {
    divisions = lcmOrThrow(
      divisions,
      step.duration.beats.denominator,
      `step "${step.id}" (duration ${step.duration.beats.numerator}/${step.duration.beats.denominator} beats)`,
    );
  }
  const meter = project.globalTiming.meter;
  // The measure layout is needed because the written rhythm of a Melody event depends on where the
  // event sits inside its measure, not only on its duration.
  const layout = createProgressionMeasureLayout(project.progression.steps, meter);
  for (const note of effectiveMelodyForExport(project)) {
    // `EffectiveMelodyNote` identifies itself by `eventKey` (there is no `id`); `stepIndex` is
    // zero-based, so step 1 is reported as "step 1".
    const where = `melody event "${note.eventKey}" on step ${note.stepIndex + 1} ("${note.sourceStepId}")`;
    divisions = lcmOrThrow(
      lcmOrThrow(
        divisions,
        note.startBeats.denominator,
        `${where} onset ${note.startBeats.numerator}/${note.startBeats.denominator} beats`,
      ),
      note.durationBeats.denominator,
      `${where} duration ${note.durationBeats.numerator}/${note.durationBeats.denominator} beats`,
    );

    // A Melody event is *notated* by splitting it at measure boundaries and decomposing each
    // fragment into writable values (`writtenRhythmPartsForDuration` -> `projectWrittenRhythm`).
    // That decomposition is context sensitive: the same duration yields different written values
    // depending on its offset in the measure, and it can introduce denominators absent from the
    // event's own onset and duration. `1/3` offset inside 7/8, for instance, decomposes `5/4` into
    // `2/3 + 1/2 + 1/16 + 1/48`. Computing `divisions` from the raw onset and duration alone
    // therefore rejected perfectly notatable music with "cannot be represented exactly". Mirror the
    // notator here so every value it will emit is representable.
    const eventEnd = addRational(note.startBeats, note.durationBeats);
    for (const measure of layout.measures) {
      const measureEnd = addRational(measure.startBeats, measure.capacityBeats);
      if (compareRational(note.startBeats, measureEnd) >= 0) continue;
      if (compareRational(eventEnd, measure.startBeats) <= 0) continue;
      const fragmentStart =
        compareRational(note.startBeats, measure.startBeats) > 0
          ? note.startBeats
          : measure.startBeats;
      const fragmentEnd = compareRational(eventEnd, measureEnd) < 0 ? eventEnd : measureEnd;
      const fragmentBeats = subtractRational(fragmentEnd, fragmentStart);
      if (compareRational(fragmentBeats, ZERO) <= 0) continue;
      for (const part of projectWrittenRhythm(
        fragmentBeats,
        subtractRational(fragmentStart, measure.startBeats),
        meter,
      )) {
        divisions = lcmOrThrow(
          divisions,
          part.beats.denominator,
          `${where}, notated as ${part.beats.numerator}/${part.beats.denominator} beats in measure ${measure.number}`,
        );
      }
    }
  }
  // The Piano part decomposes each Step fragment into written values the same way, so its parts must
  // be representable too. A fragment cut by a barline can carry a denominator that neither the Step
  // duration nor the Melody events have.
  let stepCursor = ZERO;
  for (const step of project.progression.steps) {
    const stepEnd = addRational(stepCursor, step.duration.beats);
    for (const measure of layout.measures) {
      const measureEnd = addRational(measure.startBeats, measure.capacityBeats);
      if (compareRational(stepCursor, measureEnd) >= 0) continue;
      if (compareRational(stepEnd, measure.startBeats) <= 0) continue;
      const fragmentStart =
        compareRational(stepCursor, measure.startBeats) > 0 ? stepCursor : measure.startBeats;
      const fragmentEnd = compareRational(stepEnd, measureEnd) < 0 ? stepEnd : measureEnd;
      const fragmentBeats = subtractRational(fragmentEnd, fragmentStart);
      if (compareRational(fragmentBeats, ZERO) <= 0) continue;
      // A fragment that is already one written value keeps the duration it always had, so only the
      // parts introduced by decomposing an un-writable fragment can add a new denominator.
      if (singleWrittenValue(fragmentBeats)) continue;
      for (const part of pianoWrittenParts(
        fragmentBeats,
        subtractRational(fragmentStart, measure.startBeats),
        meter,
      )) {
        divisions = lcmOrThrow(
          divisions,
          part.durationBeats.denominator,
          `step "${step.id}", notated as ${part.durationBeats.numerator}/${part.durationBeats.denominator} beats in measure ${measure.number}`,
        );
      }
    }
    stepCursor = stepEnd;
  }
  if (
    compareRational(layout.trailingSilenceBeats, ZERO) > 0 &&
    !singleWrittenValue(layout.trailingSilenceBeats)
  ) {
    divisions = lcmOrThrow(
      divisions,
      layout.trailingSilenceBeats.denominator,
      `the trailing silence of ${layout.trailingSilenceBeats.numerator}/${layout.trailingSilenceBeats.denominator} beats`,
    );
  }
  divisions = lcmOrThrow(
    divisions,
    barLengthBeats.denominator,
    `the ${project.globalTiming.meter.numerator}/${project.globalTiming.meter.denominator} bar length`,
  );
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
      previousPitches = projectedChord.contextUpperPitches;
      previousBassPitch = projectedChord.contextBassPitch;
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
        meter,
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
    // A trailing gap also has to be written as writable rests, or the final bar cannot be notated.
    const gapParts = pianoWrittenParts(measureLayout.trailingSilenceBeats, gapOnset, meter);
    let gapCursor = gapOnset;
    for (const part of gapParts) {
      finalMeasure.events.push(
        ...([1, 2] as const).map((staff): MusicXmlRestEvent =>
          Object.freeze({
            kind: "rest",
            onsetBeats: gapCursor,
            stepIndex: project.progression.steps.length,
            stepId: "__trailing-measure-gap__",
            durationBeats: part.durationBeats,
            duration: durationUnits(part.durationBeats, divisions),
            voice: staff === 1 ? "1" : "2",
            staff,
            type: part.notation.type,
            ...(part.notation.dots ? { dots: part.notation.dots } : {}),
            ...(part.notation.timeModification
              ? { timeModification: part.notation.timeModification }
              : {}),
            ties: Object.freeze([]),
          }),
        ),
      );
      gapCursor = addRational(gapCursor, part.durationBeats);
    }
    finalMeasure.durationBeats = addRational(
      finalMeasure.durationBeats,
      measureLayout.trailingSilenceBeats,
    );
  }

  const measureList = [...measures.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, measure]) => freezeMeasure(measure, divisions));

  const key = mapTonicToMusicXmlKey(project.tonic, modeForModule(project.activeModule));
  const melodyParts = buildMelodyParts(project, timeline, measureLayout, divisions, barLengthBeats);
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
    ...(melodyParts && melodyParts.length > 0
      ? { melody: melodyParts[0], melodyParts: Object.freeze(melodyParts) }
      : {}),
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
