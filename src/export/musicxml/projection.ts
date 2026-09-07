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
import { pianoProfile } from "../../instruments/piano/profile";

export const MUSICXML_VERSION = "4.0";
export const MUSICXML_PART_ID = "P1";
export const MUSICXML_PART_NAME = "Piano";
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
  readonly clef: { readonly sign: "G"; readonly line: 2 };
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
  readonly voice: "1";
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
  readonly voice: "1";
}

export type MusicXmlMeasureEvent =
  MusicXmlHarmonyEvent | MusicXmlDirectionEvent | MusicXmlNoteEvent | MusicXmlRestEvent;

export interface MusicXmlMeasure {
  readonly number: number;
  readonly startBeats: Rational;
  readonly capacityBeats: Rational;
  readonly durationBeats: Rational;
  readonly capacity: number;
  readonly events: readonly MusicXmlMeasureEvent[];
}

export interface MusicXmlProjection {
  readonly version: typeof MUSICXML_VERSION;
  readonly title: string;
  readonly part: { readonly id: typeof MUSICXML_PART_ID; readonly name: typeof MUSICXML_PART_NAME };
  readonly attributes: MusicXmlAttributes;
  readonly tempoBpm: number;
  readonly measures: readonly MusicXmlMeasure[];
  readonly diagnostics: readonly MusicXmlDiagnostic[];
}

interface MutableMeasure {
  readonly number: number;
  readonly startBeats: Rational;
  readonly capacityBeats: Rational;
  durationBeats: Rational;
  readonly events: MusicXmlMeasureEvent[];
}

interface ProjectedChord {
  readonly chord: ReturnType<typeof realizeHarmonyChord>;
  readonly pitches: readonly { readonly pitch: ExactPitch; readonly role: "upper" | "bass" }[];
  readonly harmony: MusicXmlHarmonyMapping;
  readonly dynamicLabel: "pp" | "p" | "mp" | "mf" | "f" | "ff";
  readonly sourceVelocity: number;
  readonly arpeggiate?: MusicXmlArticulation;
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
): void {
  const fragmentDuration = subtractRational(fragmentEnd, fragmentStart);
  const onsetBeats = subtractRational(fragmentStart, measure.startBeats);
  const duration = durationUnits(fragmentDuration, divisions);
  const isFirstFragment = fragmentIndex === 0;
  const isLastFragment = fragmentIndex === fragmentCount - 1;

  if (!projectedChord) {
    const event: MusicXmlRestEvent = Object.freeze({
      kind: "rest",
      onsetBeats,
      stepIndex: entry.stepIndex,
      stepId: entry.step.id,
      durationBeats: fragmentDuration,
      duration,
      voice: "1",
    });
    measure.events.push(event);
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

  const ties: ("start" | "stop")[] = [];
  if (!isFirstFragment) ties.push("stop");
  if (!isLastFragment) ties.push("start");

  projectedChord.pitches.forEach(({ pitch, role }, pitchIndex) => {
    const event: MusicXmlNoteEvent = Object.freeze({
      kind: "note",
      onsetBeats,
      stepIndex: entry.stepIndex,
      stepId: entry.step.id,
      durationBeats: fragmentDuration,
      duration,
      voice: "1",
      chord: pitchIndex > 0,
      sourceMidi: pitch.midiNumber,
      role,
      pitch: Object.freeze({
        ...mapPitchSpellingToMusicXml(pitch.spelling),
        octave: pitch.octave,
      }),
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

function calculateDivisions(project: Project, barLengthBeats: Rational): number {
  let divisions = 1;
  for (const step of project.progression.steps) {
    divisions = lcmOrThrow(divisions, step.duration.beats.denominator);
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
      );
    });
  }

  const measureList = [...measures.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, measure]) => freezeMeasure(measure, divisions));

  const key = mapTonicToMusicXmlKey(project.tonic, modeForModule(project.activeModule));
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
      clef: Object.freeze({ sign: "G", line: 2 }),
    }),
    tempoBpm: project.globalTiming.tempoBpm,
    measures: Object.freeze(measureList),
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
