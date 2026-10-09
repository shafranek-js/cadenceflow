import type { Project } from "../project/project";
import type { Progression, SongSection } from "./progression";
import type { ChordStep, ProgressionStep, RestStep } from "./step";
import type { EffectiveMelodyNote } from "../melody/effectiveTimeline";
import { createEffectiveMelodyTimeline } from "../melody/effectiveTimeline";
import { pitchToConcertFrame, pitchToSourceFrame } from "./transposition";
import {
  snapshotAuthoredMelodyPhrase,
  type AuthoredMelodyNote,
  type ChordMelodyRecipe,
} from "../melody/types";
import { resolveEffectiveMelodyInstrument } from "../melody/instrumentCatalog";
import { createProgressionMeasureLayout } from "../timing/measureLayout";
import type { ProgressionMeasure } from "../timing/measureLayout";
import { musicalDuration } from "../timing/duration";
import {
  addRational,
  compareRational,
  equalRational,
  multiplyRational,
  rational,
  subtractRational,
  ZERO,
  type Rational,
} from "../timing/rational";
import { normalizeSongSections } from "./sections";

export interface MeasureDeletionPlan {
  readonly progression: Progression;
  readonly measureNumber: number;
  readonly startBeats: Rational;
  readonly removedDurationBeats: Rational;
  readonly reanchoredStepIds: ReadonlyMap<string, string | undefined>;
}

export interface MeasureDeletionRefusal {
  readonly reason: string;
}

export type MeasureDeletionResult = MeasureDeletionPlan | MeasureDeletionRefusal;

interface StepPiece {
  readonly source: ProgressionStep;
  readonly newStart: Rational;
  readonly output: ProgressionStep;
}

interface PreservedNote {
  readonly id: string;
  readonly pitch: EffectiveMelodyNote["pitch"];
  readonly sourcePitchMidi: number;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly instrument: EffectiveMelodyNote["instrument"];
  readonly sourceRecipe?: ChordMelodyRecipe;
  readonly wasGenerated: boolean;
}

interface NoteInterval {
  readonly id: string;
  readonly pitch: AuthoredMelodyNote["pitch"];
  readonly sourcePitchMidi: number;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly instrument: EffectiveMelodyNote["instrument"];
}

function recipeForStep(step: ProgressionStep): ChordMelodyRecipe | undefined {
  if (step.kind === "rest") return step.authoredMelody?.sourceRecipe;
  if (step.melody?.mode === "generated") return step.melody.recipe;
  return step.melody?.sourceRecipe ?? step.melody?.phrase.sourceRecipe;
}

function stripAuthoredMelody(step: ProgressionStep): ProgressionStep {
  if (step.kind === "rest") {
    const { authoredMelody: _melody, ...rest } = step;
    return Object.freeze(rest) as RestStep;
  }
  if (step.melody?.mode !== "authored") return step;
  const { melody: _melody, ...rest } = step;
  return Object.freeze(rest) as ChordStep;
}

function withDuration(step: ProgressionStep, beats: Rational): ProgressionStep {
  if (equalRational(step.duration.beats, beats)) return step;
  return Object.freeze({ ...step, duration: musicalDuration(beats) }) as ProgressionStep;
}

function clonePiece(step: ProgressionStep, id: string, duration: Rational): ProgressionStep {
  return withDuration(Object.freeze({ ...step, id }) as ProgressionStep, duration);
}

/** Mints the trailing Step id of a split: the original id stays on the earliest piece. */
function uniqueStepId(
  sourceId: string,
  measureNumber: number,
  used: Set<string>,
  label = "right",
): string {
  const base = `${sourceId}~measure-${measureNumber}-${label}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function noteSegments(
  note: NoteInterval,
  deleteStart: Rational,
  deleteEnd: Rational,
  deleteLength: Rational,
  measureNumber: number,
  wasGenerated: boolean,
  sourceRecipe?: ChordMelodyRecipe,
): readonly PreservedNote[] {
  const noteEnd = addRational(note.startBeats, note.durationBeats);
  const result: PreservedNote[] = [];
  const beforeEnd = compareRational(noteEnd, deleteStart) < 0 ? noteEnd : deleteStart;
  if (
    compareRational(note.startBeats, deleteStart) < 0 &&
    compareRational(beforeEnd, note.startBeats) > 0
  ) {
    result.push({
      id: note.id,
      pitch: note.pitch,
      sourcePitchMidi: note.sourcePitchMidi,
      startBeats: note.startBeats,
      durationBeats: subtractRational(beforeEnd, note.startBeats),
      instrument: note.instrument,
      ...(sourceRecipe ? { sourceRecipe } : {}),
      wasGenerated,
    });
  }
  const afterStart = compareRational(note.startBeats, deleteEnd) > 0 ? note.startBeats : deleteEnd;
  if (compareRational(noteEnd, deleteEnd) > 0 && compareRational(noteEnd, afterStart) > 0) {
    const shiftedStart = subtractRational(afterStart, deleteLength);
    result.push({
      id: result.length === 0 ? note.id : `${note.id}~measure-${measureNumber}-after`,
      pitch: note.pitch,
      sourcePitchMidi: note.sourcePitchMidi,
      startBeats: shiftedStart,
      durationBeats: subtractRational(noteEnd, afterStart),
      instrument: note.instrument,
      ...(sourceRecipe ? { sourceRecipe } : {}),
      wasGenerated,
    });
  }
  return Object.freeze(result);
}

function ownerAt(pieces: readonly StepPiece[], startBeats: Rational): StepPiece | undefined {
  return pieces.find((piece) => {
    const end = addRational(piece.newStart, piece.output.duration.beats);
    return compareRational(startBeats, piece.newStart) >= 0 && compareRational(startBeats, end) < 0;
  });
}

function comparePitch(
  a: { readonly pitch: AuthoredMelodyNote["pitch"] },
  b: { readonly pitch: AuthoredMelodyNote["pitch"] },
): boolean {
  return (
    a.pitch.midiNumber === b.pitch.midiNumber &&
    a.pitch.spelling.step === b.pitch.spelling.step &&
    a.pitch.spelling.alter === b.pitch.spelling.alter
  );
}

function stableNoteOrder(a: PreservedNote, b: PreservedNote): number {
  return (
    compareRational(a.startBeats, b.startBeats) ||
    a.pitch.midiNumber - b.pitch.midiNumber ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function eventOrder(a: EffectiveMelodyNote, b: EffectiveMelodyNote): number {
  return (
    compareRational(a.startBeats, b.startBeats) ||
    a.pitch.midiNumber - b.pitch.midiNumber ||
    (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0)
  );
}

function sameGeneratedPhrase(
  expected: readonly PreservedNote[],
  actual: readonly EffectiveMelodyNote[],
): boolean {
  if (expected.length !== actual.length || expected.some((note) => !note.wasGenerated))
    return false;
  const orderedExpected = [...expected].sort(stableNoteOrder);
  const orderedActual = [...actual].sort(eventOrder);
  return orderedExpected.every((note, index) => {
    const candidate = orderedActual[index];
    return Boolean(
      candidate &&
      candidate.eventKey === note.id &&
      equalRational(candidate.startBeats, note.startBeats) &&
      equalRational(candidate.durationBeats, note.durationBeats) &&
      comparePitch(note, candidate) &&
      candidate.instrument === note.instrument,
    );
  });
}

function collisionSafeNoteId(id: string, existing: ReadonlySet<string>): string {
  if (!existing.has(id)) return id;
  let suffix = 1;
  let candidate = `${id}~${suffix}`;
  while (existing.has(candidate)) candidate = `${id}~${++suffix}`;
  return candidate;
}

function withInstrument(
  step: ProgressionStep,
  instrument: string,
  project: Project,
): ProgressionStep {
  const inherited = resolveEffectiveMelodyInstrument(undefined, project.melodyTrack.instrument).id;
  const nextOverride =
    step.melodyInstrumentOverride === instrument
      ? instrument
      : instrument === inherited
        ? undefined
        : instrument;
  if (step.melodyInstrumentOverride === nextOverride) return step;
  const { melodyInstrumentOverride: _old, ...rest } = step;
  return Object.freeze({
    ...rest,
    ...(nextOverride ? { melodyInstrumentOverride: nextOverride } : {}),
  }) as ProgressionStep;
}

function setAuthoredPhrase(
  step: ProgressionStep,
  notes: readonly PreservedNote[],
  hadMelody: boolean,
  sourceRecipe?: ChordMelodyRecipe,
): ProgressionStep {
  if (!hadMelody && notes.length === 0) return step;
  const used = new Set<string>();
  const authoredNotes: AuthoredMelodyNote[] = [...notes].sort(stableNoteOrder).map((note) => {
    const id = collisionSafeNoteId(note.id, used);
    used.add(id);
    const pitch = pitchToSourceFrame(note.pitch, step);
    const sourcePitchMidi = pitch.midiNumber + (pitch.transpositionCompensationSemitones ?? 0);
    return Object.freeze({
      id,
      pitch,
      ...(note.wasGenerated || note.sourcePitchMidi !== sourcePitchMidi
        ? { sourcePitchMidi: note.sourcePitchMidi }
        : {}),
      onset: subtractRational(note.startBeats, ZERO),
      duration: note.durationBeats,
    });
  });
  // This helper is called after onsets have been converted to phrase-local time.
  const phrase = snapshotAuthoredMelodyPhrase({
    notes: authoredNotes,
    ...(sourceRecipe ? { sourceRecipe } : {}),
  });
  if (step.kind === "rest") return Object.freeze({ ...step, authoredMelody: phrase }) as RestStep;
  return Object.freeze({
    ...step,
    melody: Object.freeze({
      mode: "authored",
      phrase,
      ...(sourceRecipe ? { sourceRecipe } : {}),
    }),
  }) as ChordStep;
}

function targetStepIndex(steps: readonly ProgressionStep[], id: string): number {
  return steps.findIndex((step) => step.id === id);
}

function sameEffectiveTimeline(
  expected: readonly {
    readonly sourceStepId: string;
    readonly eventKey: string;
    readonly pitch: AuthoredMelodyNote["pitch"];
    readonly sourcePitchMidi: number;
    readonly startBeats: Rational;
    readonly durationBeats: Rational;
    readonly instrument: EffectiveMelodyNote["instrument"];
  }[],
  actual: readonly EffectiveMelodyNote[],
): boolean {
  if (expected.length !== actual.length) return false;
  const order = <
    T extends {
      sourceStepId: string;
      eventKey: string;
      startBeats: Rational;
      pitch: { midiNumber: number };
    },
  >(
    a: T,
    b: T,
  ) =>
    (a.sourceStepId < b.sourceStepId ? -1 : a.sourceStepId > b.sourceStepId ? 1 : 0) ||
    compareRational(a.startBeats, b.startBeats) ||
    a.pitch.midiNumber - b.pitch.midiNumber ||
    (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0);
  const orderedExpected = [...expected].sort(order);
  const orderedActual = [...actual].sort(order);
  return orderedExpected.every((note, index) => {
    const candidate = orderedActual[index];
    return Boolean(
      candidate &&
      candidate.sourceStepId === note.sourceStepId &&
      candidate.eventKey === note.eventKey &&
      equalRational(candidate.startBeats, note.startBeats) &&
      equalRational(candidate.durationBeats, note.durationBeats) &&
      comparePitch(note, candidate) &&
      candidate.sourcePitchMidi === note.sourcePitchMidi &&
      candidate.instrument === note.instrument,
    );
  });
}

/** Plans one exact bar deletion without mutating the input Project. */
export function planMeasureDeletion(project: Project, measureIndex: number): MeasureDeletionResult {
  if (project.temporaryBranch)
    return {
      reason:
        "Finish or discard the active branch before deleting a Measure; its anchors refer to the current Steps.",
    };
  try {
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );
    const measure = layout.measures[measureIndex];
    if (!Number.isInteger(measureIndex) || !measure)
      return { reason: "This Measure is no longer available." };
    const deleteStart = measure.startBeats;
    const nominalEnd = addRational(deleteStart, layout.barLengthBeats);
    const deleteEnd =
      compareRational(nominalEnd, layout.authoredDurationBeats) < 0
        ? nominalEnd
        : layout.authoredDurationBeats;
    if (compareRational(deleteEnd, deleteStart) <= 0)
      return { reason: "This Measure contains no authored time to delete." };
    const deleteLength = subtractRational(deleteEnd, deleteStart);
    const sourceSteps = project.progression.steps;
    const usedIds = new Set(sourceSteps.map((step) => step.id));
    const pieces: StepPiece[] = [];
    const sourceIndices = new Map<string, number>();
    const sourceStarts = new Map<string, Rational>();
    let oldCursor = ZERO;

    sourceSteps.forEach((source, sourceIndex) => {
      const oldStart = oldCursor;
      const oldEnd = addRational(oldStart, source.duration.beats);
      sourceStarts.set(source.id, oldStart);
      sourceIndices.set(source.id, sourceIndex);
      const intervals: { start: Rational; end: Rational; side: "left" | "right" }[] = [];
      const leftEnd = compareRational(oldEnd, deleteStart) < 0 ? oldEnd : deleteStart;
      if (compareRational(oldStart, leftEnd) < 0)
        intervals.push({ start: oldStart, end: leftEnd, side: "left" });
      const rightStart = compareRational(oldStart, deleteEnd) > 0 ? oldStart : deleteEnd;
      if (compareRational(oldEnd, rightStart) > 0)
        intervals.push({ start: rightStart, end: oldEnd, side: "right" });

      intervals.forEach((interval, pieceIndex) => {
        const id =
          intervals.length === 2 && pieceIndex === 1
            ? uniqueStepId(source.id, measure.number, usedIds)
            : source.id;
        const newStart =
          interval.side === "right"
            ? subtractRational(interval.start, deleteLength)
            : interval.start;
        const duration = subtractRational(interval.end, interval.start);
        const output = stripAuthoredMelody(clonePiece(source, id, duration));
        pieces.push({ source, newStart, output });
      });
      oldCursor = oldEnd;
    });

    const nextStepsBeforeMelody = pieces.map((piece) => piece.output);
    const ownerPieces = pieces;
    const originalMelody = createEffectiveMelodyTimeline(project);
    const generatedOwners = new Set(
      sourceSteps.flatMap((step) =>
        step.kind === "chord" && step.melody?.mode === "generated" ? [step.id] : [],
      ),
    );
    const preservedByOwner = new Map<string, PreservedNote[]>();
    const ownerRecipes = new Map<string, ChordMelodyRecipe | undefined>();
    const ownerHadMelody = new Set<string>();
    const sourceRecipeById = new Map(sourceSteps.map((step) => [step.id, recipeForStep(step)]));
    const newStarts = new Map<string, Rational>();
    let newCursor = ZERO;
    for (const step of nextStepsBeforeMelody) {
      newStarts.set(step.id, newCursor);
      newCursor = addRational(newCursor, step.duration.beats);
    }

    const addPreservedSegments = (
      note: NoteInterval,
      sourceStepId: string,
      wasGenerated: boolean,
      recipe: ChordMelodyRecipe | undefined,
    ): string | undefined => {
      for (const segment of noteSegments(
        note,
        deleteStart,
        deleteEnd,
        deleteLength,
        measure.number,
        wasGenerated,
        recipe,
      )) {
        const owner =
          ownerAt(ownerPieces, segment.startBeats) ??
          ownerPieces.find((piece) => piece.output.id === sourceStepId);
        if (!owner)
          return "A retained authored Melody note would lose its Step owner, and schema v10 has no owner for notes outside the progression. No content was changed.";
        const notes = preservedByOwner.get(owner.output.id) ?? [];
        const localNote: PreservedNote = {
          ...segment,
          startBeats: subtractRational(segment.startBeats, newStarts.get(owner.output.id)!),
        };
        notes.push(localNote);
        preservedByOwner.set(owner.output.id, notes);
        ownerHadMelody.add(owner.output.id);
        if (!ownerRecipes.has(owner.output.id))
          ownerRecipes.set(owner.output.id, sourceRecipeById.get(owner.source.id));
      }
      return undefined;
    };

    for (const note of originalMelody) {
      if (!generatedOwners.has(note.sourceStepId)) continue;
      const reason = addPreservedSegments(
        {
          id: note.eventKey,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats: note.startBeats,
          durationBeats: note.durationBeats,
          instrument: note.instrument,
        },
        note.sourceStepId,
        true,
        sourceRecipeById.get(note.sourceStepId),
      );
      if (reason) return { reason };
    }
    for (const source of sourceSteps) {
      const phrase =
        source.kind === "rest"
          ? source.authoredMelody
          : source.melody?.mode === "authored"
            ? source.melody.phrase
            : undefined;
      if (!phrase) continue;
      const sourceStart = sourceStarts.get(source.id)!;
      const instrument = resolveEffectiveMelodyInstrument(
        source.melodyInstrumentOverride,
        project.melodyTrack.instrument,
      ).id;
      for (const note of phrase.notes) {
        const reason = addPreservedSegments(
          {
            id: note.id,
            pitch: pitchToConcertFrame(note.pitch, source),
            sourcePitchMidi:
              note.sourcePitchMidi ??
              note.pitch.midiNumber + (note.pitch.transpositionCompensationSemitones ?? 0),
            startBeats: addRational(sourceStart, note.onset),
            durationBeats: note.duration,
            instrument,
          },
          source.id,
          false,
          phrase.sourceRecipe ?? sourceRecipeById.get(source.id),
        );
        if (reason) return { reason };
      }
    }

    for (const piece of pieces) {
      const source = piece.source;
      const hadMelody =
        source.kind === "rest" ? source.authoredMelody !== undefined : source.melody !== undefined;
      if (hadMelody) ownerHadMelody.add(piece.output.id);
      if (!ownerRecipes.has(piece.output.id))
        ownerRecipes.set(piece.output.id, recipeForStep(source));
    }

    for (const [ownerId, notes] of preservedByOwner) {
      const instruments = new Set(notes.map((note) => note.instrument));
      if (instruments.size > 1) {
        const names = [...instruments].sort().join(" and ");
        return {
          reason: `The retained notes would need ${names} in one Step, but v9 stores one Melody instrument per Step. No content was changed.`,
        };
      }
      const stepIndex = nextStepsBeforeMelody.findIndex((step) => step.id === ownerId);
      const step = nextStepsBeforeMelody[stepIndex];
      if (!step) continue;
      nextStepsBeforeMelody[stepIndex] = withInstrument(step, [...instruments][0]!, project);
    }

    const generationTestSteps = nextStepsBeforeMelody.map((step) => step);
    const generationTestProject: Project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze(generationTestSteps),
      }),
    });
    const generatedAfter = createEffectiveMelodyTimeline(generationTestProject);
    const generatedAfterByOwner = new Map<string, EffectiveMelodyNote[]>();
    for (const note of generatedAfter) {
      const owner = generatedAfterByOwner.get(note.sourceStepId) ?? [];
      owner.push(note);
      generatedAfterByOwner.set(note.sourceStepId, owner);
    }

    const finalSteps = nextStepsBeforeMelody.map((step) => {
      const preserved = preservedByOwner.get(step.id) ?? [];
      const origin = ownerPieces.find((piece) => piece.output.id === step.id)?.source;
      const originallyGenerated = origin?.kind === "chord" && origin.melody?.mode === "generated";
      const expectedAbsolute = preserved.map((note) => ({
        ...note,
        startBeats: addRational(newStarts.get(step.id)!, note.startBeats),
      }));
      if (
        originallyGenerated &&
        sameGeneratedPhrase(expectedAbsolute, generatedAfterByOwner.get(step.id) ?? [])
      )
        return step;
      const sourceRecipe =
        ownerRecipes.get(step.id) ?? preserved.find((note) => note.sourceRecipe)?.sourceRecipe;
      return setAuthoredPhrase(step, preserved, ownerHadMelody.has(step.id), sourceRecipe);
    });

    const survivingIds = new Set(finalSteps.map((step) => step.id));
    const mapRemovedStep = (id: string): string | undefined => {
      if (survivingIds.has(id)) return id;
      const index = sourceIndices.get(id);
      if (index === undefined) return undefined;
      const following = sourceSteps.slice(index + 1).find((step) => survivingIds.has(step.id));
      if (following) return following.id;
      const previous = sourceSteps
        .slice(0, index)
        .reverse()
        .find((step) => survivingIds.has(step.id));
      return previous?.id;
    };
    const reanchoredStepIds = new Map<string, string | undefined>(
      sourceSteps.map((step) => [step.id, mapRemovedStep(step.id)]),
    );
    const sections: readonly SongSection[] = (project.progression.sections ?? []).flatMap(
      (section) => {
        const target = reanchoredStepIds.get(section.startStepId);
        return target ? [Object.freeze({ ...section, startStepId: target })] : [];
      },
    );
    const loopStart = project.progression.loopRegion
      ? reanchoredStepIds.get(project.progression.loopRegion.startStepId)
      : undefined;
    const loopEnd = project.progression.loopRegion
      ? reanchoredStepIds.get(project.progression.loopRegion.endStepId)
      : undefined;
    const loopStartIndex = loopStart ? targetStepIndex(finalSteps, loopStart) : -1;
    const loopEndIndex = loopEnd ? targetStepIndex(finalSteps, loopEnd) : -1;
    const loopRegion =
      loopStartIndex >= 0 && loopEndIndex >= loopStartIndex
        ? Object.freeze({ startStepId: loopStart!, endStepId: loopEnd! })
        : undefined;
    const oldSelected = project.progression.selectedStepId;
    const selectedStepId = oldSelected ? reanchoredStepIds.get(oldSelected) : undefined;
    const progressionBase = {
      ...project.progression,
      steps: Object.freeze(finalSteps),
      sections: Object.freeze(sections),
      ...(selectedStepId ? { selectedStepId } : {}),
    };
    const {
      loopRegion: _oldLoop,
      selectedStepId: _oldSelection,
      ...withoutOptionalState
    } = progressionBase;
    const progression = normalizeSongSections(
      Object.freeze({
        ...withoutOptionalState,
        ...(selectedStepId ? { selectedStepId } : {}),
        ...(loopRegion ? { loopRegion } : {}),
      }),
    );
    const expectedEffective: {
      sourceStepId: string;
      eventKey: string;
      pitch: AuthoredMelodyNote["pitch"];
      sourcePitchMidi: number;
      startBeats: Rational;
      durationBeats: Rational;
      instrument: EffectiveMelodyNote["instrument"];
    }[] = [];
    for (const step of finalSteps) {
      const ownerStart = newStarts.get(step.id)!;
      const used = new Set<string>();
      for (const note of [...(preservedByOwner.get(step.id) ?? [])].sort(stableNoteOrder)) {
        const eventKey = collisionSafeNoteId(note.id, used);
        used.add(eventKey);
        const startBeats = addRational(ownerStart, note.startBeats);
        if (compareRational(startBeats, newCursor) >= 0) continue;
        const noteEnd = addRational(startBeats, note.durationBeats);
        const visibleEnd = compareRational(noteEnd, newCursor) > 0 ? newCursor : noteEnd;
        if (compareRational(visibleEnd, startBeats) <= 0) continue;
        expectedEffective.push({
          sourceStepId: step.id,
          eventKey,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats,
          durationBeats: subtractRational(visibleEnd, startBeats),
          instrument: note.instrument,
        });
      }
    }
    const finalProject: Project = Object.freeze({ ...project, progression });
    const actualEffective = createEffectiveMelodyTimeline(finalProject);
    if (!sameEffectiveTimeline(expectedEffective, actualEffective))
      return {
        reason:
          "This Measure cannot be removed without changing retained effective Melody. No content was changed.",
      };
    return Object.freeze({
      progression,
      measureNumber: measure.number,
      startBeats: deleteStart,
      removedDurationBeats: deleteLength,
      reanchoredStepIds,
    });
  } catch (error) {
    return {
      reason:
        error instanceof Error
          ? `This Measure cannot be removed safely: ${error.message}`
          : "This Measure cannot be removed safely.",
    };
  }
}

export interface MeasureInsertionPlan {
  readonly progression: Progression;
  readonly measureNumber: number;
  readonly startBeats: Rational;
  readonly insertedDurationBeats: Rational;
  /** Identity mapping for surviving Step IDs. */
  readonly reanchoredStepIds: ReadonlyMap<string, string | undefined>;
  /** A split Step keeps its original ID on the left; a loop ending there must include the right piece. */
  readonly loopStartStepIds: ReadonlyMap<string, string | undefined>;
  readonly loopEndStepIds: ReadonlyMap<string, string | undefined>;
}

export type MeasureInsertionResult = MeasureInsertionPlan | MeasureDeletionRefusal;

interface InsertionNoteSegment extends PreservedNote {
  readonly originalEventKey: string;
}

function freshStepId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function insertionNoteSegments(
  note: NoteInterval,
  boundary: Rational,
  insertedDuration: Rational,
  measureNumber: number,
  wasGenerated: boolean,
  sourceRecipe?: ChordMelodyRecipe,
): readonly InsertionNoteSegment[] {
  const noteEnd = addRational(note.startBeats, note.durationBeats);
  const segments: InsertionNoteSegment[] = [];
  if (compareRational(note.startBeats, boundary) < 0) {
    const beforeEnd = compareRational(noteEnd, boundary) < 0 ? noteEnd : boundary;
    if (compareRational(beforeEnd, note.startBeats) > 0) {
      segments.push({
        id: note.id,
        originalEventKey: note.id,
        pitch: note.pitch,
        sourcePitchMidi: note.sourcePitchMidi,
        startBeats: note.startBeats,
        durationBeats: subtractRational(beforeEnd, note.startBeats),
        instrument: note.instrument,
        ...(sourceRecipe ? { sourceRecipe } : {}),
        wasGenerated,
      });
    }
    if (compareRational(noteEnd, boundary) > 0) {
      segments.push({
        id: `${note.id}~measure-${measureNumber}-after`,
        originalEventKey: note.id,
        pitch: note.pitch,
        sourcePitchMidi: note.sourcePitchMidi,
        startBeats: addRational(boundary, insertedDuration),
        durationBeats: subtractRational(noteEnd, boundary),
        instrument: note.instrument,
        ...(sourceRecipe ? { sourceRecipe } : {}),
        wasGenerated,
      });
    }
  } else {
    segments.push({
      id: note.id,
      originalEventKey: note.id,
      pitch: note.pitch,
      sourcePitchMidi: note.sourcePitchMidi,
      startBeats: addRational(note.startBeats, insertedDuration),
      durationBeats: note.durationBeats,
      instrument: note.instrument,
      ...(sourceRecipe ? { sourceRecipe } : {}),
      wasGenerated,
    });
  }
  return Object.freeze(segments);
}

/** Plans an exact blank bar after the displayed Measure without mutating the input Project. */
export function planMeasureInsertion(
  project: Project,
  measureIndex: number,
): MeasureInsertionResult {
  if (project.temporaryBranch)
    return {
      reason:
        "Finish or discard the active branch before inserting a Measure; its anchors refer to the current Steps.",
    };
  try {
    const sourceSteps = project.progression.steps;
    const layout = createProgressionMeasureLayout(sourceSteps, project.globalTiming.meter);
    const measure = layout.measures[measureIndex];
    if (!Number.isInteger(measureIndex) || !measure)
      return { reason: "This Measure is no longer available." };

    // A displayed Measure ends at its barline even when it is the partial final Measure.
    // In that case its implicit tail becomes an explicit RestStep before the new blank bar.
    const boundary = measure.endBeats;
    const insertedDuration = measure.capacityBeats;
    const sourceDuration = layout.authoredDurationBeats;
    const needsTrailingRest = compareRational(sourceDuration, boundary) < 0;
    const usedIds = new Set(sourceSteps.map((step) => step.id));
    const sourceStarts = new Map<string, Rational>();
    const splitSuffixIds = new Map<string, string>();
    const pieces: StepPiece[] = [];
    let oldCursor = ZERO;

    sourceSteps.forEach((source) => {
      const oldStart = oldCursor;
      const oldEnd = addRational(oldStart, source.duration.beats);
      sourceStarts.set(source.id, oldStart);
      if (compareRational(oldStart, boundary) < 0 && compareRational(oldEnd, boundary) > 0) {
        const suffixId = uniqueStepId(source.id, measure.number, usedIds);
        splitSuffixIds.set(source.id, suffixId);
        pieces.push({
          source,
          newStart: oldStart,
          output: stripAuthoredMelody(
            clonePiece(source, source.id, subtractRational(boundary, oldStart)),
          ),
        });
        pieces.push({
          source,
          newStart: addRational(boundary, insertedDuration),
          output: stripAuthoredMelody(
            clonePiece(source, suffixId, subtractRational(oldEnd, boundary)),
          ),
        });
      } else {
        const shifted = compareRational(oldStart, boundary) >= 0;
        pieces.push({
          source,
          newStart: shifted ? addRational(oldStart, insertedDuration) : oldStart,
          output: stripAuthoredMelody(clonePiece(source, source.id, source.duration.beats)),
        });
      }
      oldCursor = oldEnd;
    });

    const bridgeRest: RestStep | undefined = needsTrailingRest
      ? Object.freeze({
          id: freshStepId(`measure-${measure.number}-leading-silence`, usedIds),
          kind: "rest",
          duration: musicalDuration(subtractRational(boundary, sourceDuration)),
        })
      : undefined;
    const insertedRest: RestStep = Object.freeze({
      id: freshStepId(`measure-${measure.number}-inserted`, usedIds),
      kind: "rest",
      duration: musicalDuration(insertedDuration),
    });
    if (bridgeRest)
      pieces.push({ source: bridgeRest, newStart: sourceDuration, output: bridgeRest });
    pieces.push({ source: insertedRest, newStart: boundary, output: insertedRest });
    pieces.sort((a, b) => compareRational(a.newStart, b.newStart));

    const nextStepsBeforeMelody = pieces.map((piece) => piece.output);
    const originalMelody = createEffectiveMelodyTimeline(project);
    const generatedOwners = new Set(
      sourceSteps.flatMap((step) =>
        step.kind === "chord" && step.melody?.mode === "generated" ? [step.id] : [],
      ),
    );
    const sourceRecipeById = new Map(sourceSteps.map((step) => [step.id, recipeForStep(step)]));
    const newStarts = new Map<string, Rational>();
    let newCursor = ZERO;
    for (const step of nextStepsBeforeMelody) {
      newStarts.set(step.id, newCursor);
      newCursor = addRational(newCursor, step.duration.beats);
    }

    const preservedByOwner = new Map<string, PreservedNote[]>();
    const ownerRecipes = new Map<string, ChordMelodyRecipe | undefined>();
    const ownerHadMelody = new Set<string>();
    const addSegments = (
      note: NoteInterval,
      wasGenerated: boolean,
      recipe: ChordMelodyRecipe | undefined,
    ): string | undefined => {
      for (const segment of insertionNoteSegments(
        note,
        boundary,
        insertedDuration,
        measure.number,
        wasGenerated,
        recipe,
      )) {
        const owner = ownerAt(pieces, segment.startBeats);
        if (!owner)
          return "A retained Melody note would fall outside any Step owner after insertion. No content was changed.";
        const notes = preservedByOwner.get(owner.output.id) ?? [];
        notes.push({
          ...segment,
          startBeats: subtractRational(segment.startBeats, newStarts.get(owner.output.id)!),
        });
        preservedByOwner.set(owner.output.id, notes);
        ownerHadMelody.add(owner.output.id);
        if (!ownerRecipes.has(owner.output.id))
          ownerRecipes.set(owner.output.id, sourceRecipeById.get(owner.source.id));
      }
      return undefined;
    };

    for (const note of originalMelody) {
      if (!generatedOwners.has(note.sourceStepId)) continue;
      const reason = addSegments(
        {
          id: note.eventKey,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats: note.startBeats,
          durationBeats: note.durationBeats,
          instrument: note.instrument,
        },
        true,
        sourceRecipeById.get(note.sourceStepId),
      );
      if (reason) return { reason };
    }

    for (const source of sourceSteps) {
      const phrase =
        source.kind === "rest"
          ? source.authoredMelody
          : source.melody?.mode === "authored"
            ? source.melody.phrase
            : undefined;
      if (!phrase) continue;
      const sourceStart = sourceStarts.get(source.id)!;
      const instrument = resolveEffectiveMelodyInstrument(
        source.melodyInstrumentOverride,
        project.melodyTrack.instrument,
      ).id;
      for (const note of phrase.notes) {
        const reason = addSegments(
          {
            id: note.id,
            pitch: pitchToConcertFrame(note.pitch, source),
            sourcePitchMidi:
              note.sourcePitchMidi ??
              note.pitch.midiNumber + (note.pitch.transpositionCompensationSemitones ?? 0),
            startBeats: addRational(sourceStart, note.onset),
            durationBeats: note.duration,
            instrument,
          },
          false,
          phrase.sourceRecipe ?? sourceRecipeById.get(source.id),
        );
        if (reason) return { reason };
      }
    }

    for (const piece of pieces) {
      const source = piece.source;
      const hadMelody =
        source.kind === "rest" ? source.authoredMelody !== undefined : source.melody !== undefined;
      if (hadMelody) ownerHadMelody.add(piece.output.id);
      if (!ownerRecipes.has(piece.output.id))
        ownerRecipes.set(piece.output.id, recipeForStep(source));
    }

    for (const [ownerId, notes] of preservedByOwner) {
      const instruments = new Set(notes.map((note) => note.instrument));
      if (instruments.size > 1) {
        const names = [...instruments].sort().join(" and ");
        return {
          reason: `Retained notes would need ${names} in one Step, but the project stores one Melody instrument per Step. No content was changed.`,
        };
      }
      const index = nextStepsBeforeMelody.findIndex((step) => step.id === ownerId);
      const ownerStep = nextStepsBeforeMelody[index];
      if (ownerStep)
        nextStepsBeforeMelody[index] = withInstrument(ownerStep, [...instruments][0]!, project);
    }

    const generationTestProject: Project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([...nextStepsBeforeMelody]),
      }),
    });
    const generatedAfterByOwner = new Map<string, EffectiveMelodyNote[]>();
    for (const note of createEffectiveMelodyTimeline(generationTestProject)) {
      const owner = generatedAfterByOwner.get(note.sourceStepId) ?? [];
      owner.push(note);
      generatedAfterByOwner.set(note.sourceStepId, owner);
    }

    const finalSteps = nextStepsBeforeMelody.map((step) => {
      const preserved = preservedByOwner.get(step.id) ?? [];
      const origin = pieces.find((piece) => piece.output.id === step.id)?.source;
      const originallyGenerated = origin?.kind === "chord" && origin.melody?.mode === "generated";
      const expectedAbsolute = preserved.map((note) => ({
        ...note,
        startBeats: addRational(newStarts.get(step.id)!, note.startBeats),
      }));
      if (
        originallyGenerated &&
        sameGeneratedPhrase(expectedAbsolute, generatedAfterByOwner.get(step.id) ?? [])
      )
        return step;
      const sourceRecipe =
        ownerRecipes.get(step.id) ?? preserved.find((note) => note.sourceRecipe)?.sourceRecipe;
      return setAuthoredPhrase(step, preserved, ownerHadMelody.has(step.id), sourceRecipe);
    });

    const identityStepIds = new Map<string, string | undefined>(
      sourceSteps.map((step) => [step.id, step.id]),
    );
    const loopEndStepIds = new Map<string, string | undefined>(
      sourceSteps.map((step) => [step.id, splitSuffixIds.get(step.id) ?? step.id]),
    );
    const oldLoop = project.progression.loopRegion;
    const loopStart = oldLoop ? identityStepIds.get(oldLoop.startStepId) : undefined;
    const loopEnd = oldLoop ? loopEndStepIds.get(oldLoop.endStepId) : undefined;
    const loopStartIndex = loopStart ? targetStepIndex(finalSteps, loopStart) : -1;
    const loopEndIndex = loopEnd ? targetStepIndex(finalSteps, loopEnd) : -1;
    const loopRegion =
      loopStartIndex >= 0 && loopEndIndex >= loopStartIndex
        ? Object.freeze({ startStepId: loopStart!, endStepId: loopEnd! })
        : undefined;
    const progressionBase = {
      ...project.progression,
      steps: Object.freeze(finalSteps),
      ...(project.progression.sections
        ? { sections: Object.freeze([...project.progression.sections]) }
        : {}),
      ...(project.progression.selectedStepId
        ? { selectedStepId: project.progression.selectedStepId }
        : {}),
    };
    const {
      loopRegion: _oldLoop,
      selectedStepId: _oldSelection,
      ...withoutOptionalState
    } = progressionBase;
    const progression = normalizeSongSections(
      Object.freeze({
        ...withoutOptionalState,
        ...(project.progression.selectedStepId
          ? { selectedStepId: project.progression.selectedStepId }
          : {}),
        ...(loopRegion ? { loopRegion } : {}),
      }),
    );

    // Verify the candidate against the exact audible source timeline. Any raw phrase tail that
    // becomes audible when the final implicit gap is materialized causes an atomic refusal.
    const expectedByOwner = new Map<string, InsertionNoteSegment[]>();
    for (const note of originalMelody) {
      for (const segment of insertionNoteSegments(
        {
          id: note.eventKey,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats: note.startBeats,
          durationBeats: note.durationBeats,
          instrument: note.instrument,
        },
        boundary,
        insertedDuration,
        measure.number,
        generatedOwners.has(note.sourceStepId),
        sourceRecipeById.get(note.sourceStepId),
      )) {
        const owner = ownerAt(pieces, segment.startBeats);
        if (!owner)
          return {
            reason:
              "A retained effective Melody note would have no Step owner after insertion. No content was changed.",
          };
        const list = expectedByOwner.get(owner.output.id) ?? [];
        list.push(segment);
        expectedByOwner.set(owner.output.id, list);
      }
    }
    const expectedEffective: {
      sourceStepId: string;
      eventKey: string;
      pitch: AuthoredMelodyNote["pitch"];
      sourcePitchMidi: number;
      startBeats: Rational;
      durationBeats: Rational;
      instrument: EffectiveMelodyNote["instrument"];
    }[] = [];
    for (const step of finalSteps) {
      const ownerStart = newStarts.get(step.id)!;
      const used = new Set<string>();
      const notes = [...(expectedByOwner.get(step.id) ?? [])].sort(stableNoteOrder);
      for (const note of notes) {
        const eventKey = collisionSafeNoteId(note.id, used);
        used.add(eventKey);
        const startBeats = addRational(ownerStart, subtractRational(note.startBeats, ownerStart));
        if (compareRational(startBeats, newCursor) >= 0) continue;
        const noteEnd = addRational(startBeats, note.durationBeats);
        const visibleEnd = compareRational(noteEnd, newCursor) > 0 ? newCursor : noteEnd;
        if (compareRational(visibleEnd, startBeats) <= 0) continue;
        expectedEffective.push({
          sourceStepId: step.id,
          eventKey,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats,
          durationBeats: subtractRational(visibleEnd, startBeats),
          instrument: note.instrument,
        });
      }
    }
    const actualEffective = createEffectiveMelodyTimeline(
      Object.freeze({ ...project, progression }),
    );
    if (!sameEffectiveTimeline(expectedEffective, actualEffective))
      return {
        reason:
          "This Measure cannot be inserted without changing retained effective Melody; the final Measure also materializes its previous silent tail. No content was changed.",
      };

    return Object.freeze({
      progression,
      measureNumber: measure.number,
      startBeats: boundary,
      insertedDurationBeats: insertedDuration,
      reanchoredStepIds: identityStepIds,
      loopStartStepIds: identityStepIds,
      loopEndStepIds,
    });
  } catch (error) {
    return {
      reason:
        error instanceof Error
          ? `This Measure cannot be inserted safely: ${error.message}`
          : "This Measure cannot be inserted safely.",
    };
  }
}

export interface MeasureDuplicationPlan {
  readonly progression: Progression;
  readonly sourceMeasureNumber: number;
  readonly duplicateMeasureNumber: number;
  readonly startBeats: Rational;
  readonly duplicatedDurationBeats: Rational;
  readonly duplicatedStepIds: readonly string[];
}

export type MeasureDuplicationResult = MeasureDuplicationPlan | MeasureDeletionRefusal;

type MusicalTimelinePoint = Pick<
  EffectiveMelodyNote,
  "sourceStepId" | "pitch" | "sourcePitchMidi" | "startBeats" | "durationBeats" | "instrument"
>;

function sameEffectiveMusic(
  expected: readonly MusicalTimelinePoint[],
  actual: readonly MusicalTimelinePoint[],
): boolean {
  if (expected.length !== actual.length) return false;
  const compare = (a: MusicalTimelinePoint, b: MusicalTimelinePoint) =>
    (a.sourceStepId < b.sourceStepId ? -1 : a.sourceStepId > b.sourceStepId ? 1 : 0) ||
    compareRational(a.startBeats, b.startBeats) ||
    a.pitch.midiNumber - b.pitch.midiNumber ||
    a.sourcePitchMidi - b.sourcePitchMidi ||
    (a.instrument < b.instrument ? -1 : a.instrument > b.instrument ? 1 : 0);
  const orderedExpected = [...expected].sort(compare);
  const orderedActual = [...actual].sort(compare);
  return orderedExpected.every((note, index) => {
    const candidate = orderedActual[index];
    return Boolean(
      candidate &&
      note.sourceStepId === candidate.sourceStepId &&
      equalRational(note.startBeats, candidate.startBeats) &&
      equalRational(note.durationBeats, candidate.durationBeats) &&
      comparePitch(note, candidate) &&
      note.sourcePitchMidi === candidate.sourcePitchMidi &&
      note.instrument === candidate.instrument,
    );
  });
}

/** Plans one copy of the displayed Measure at the end of the progression. */
export function planMeasureDuplication(
  project: Project,
  measureIndex: number,
): MeasureDuplicationResult {
  if (project.temporaryBranch)
    return {
      reason:
        "Finish or discard the active branch before duplicating a Measure; its anchors refer to the current Steps. No content was changed.",
    };
  try {
    const sourceSteps = project.progression.steps;
    const layout = createProgressionMeasureLayout(sourceSteps, project.globalTiming.meter);
    const measure = layout.measures[measureIndex];
    if (!Number.isInteger(measureIndex) || !measure)
      return { reason: "This Measure is no longer available." };

    const appendStart = layout.playbackDurationBeats;
    const duplicateNumber = layout.measures.length + 1;
    const usedStepIds = new Set(sourceSteps.map((step) => step.id));
    const sourceStarts = new Map<string, Rational>();
    const sourceById = new Map(sourceSteps.map((step) => [step.id, step]));
    const sourceRecipes = new Map(sourceSteps.map((step) => [step.id, recipeForStep(step)]));
    let sourceCursor = ZERO;
    for (const step of sourceSteps) {
      sourceStarts.set(step.id, sourceCursor);
      sourceCursor = addRational(sourceCursor, step.duration.beats);
    }

    const appendPieces: StepPiece[] = [];
    if (compareRational(layout.authoredDurationBeats, appendStart) < 0) {
      const tail = Object.freeze({
        id: freshStepId(`measure-${duplicateNumber}-leading-rest`, usedStepIds),
        kind: "rest" as const,
        duration: musicalDuration(subtractRational(appendStart, layout.authoredDurationBeats)),
      });
      appendPieces.push({
        source: tail,
        newStart: layout.authoredDurationBeats,
        output: tail,
      });
    }

    const duplicatePieces: StepPiece[] = measure.fragments.map((fragment) => {
      const id = freshStepId(
        `${fragment.step.id}~measure-${duplicateNumber}-duplicate`,
        usedStepIds,
      );
      const output = stripAuthoredMelody(clonePiece(fragment.step, id, fragment.durationBeats));
      const newStart = addRational(
        appendStart,
        subtractRational(fragment.startBeats, measure.startBeats),
      );
      const piece = { source: fragment.step, newStart, output };
      appendPieces.push(piece);
      return piece;
    });

    if (measure.trailingGap) {
      const sourceGap = measure.trailingGap;
      const rest = Object.freeze({
        id: freshStepId(`measure-${duplicateNumber}-source-gap`, usedStepIds),
        kind: "rest" as const,
        duration: musicalDuration(sourceGap.durationBeats),
      });
      const newStart = addRational(
        appendStart,
        subtractRational(sourceGap.startBeats, measure.startBeats),
      );
      const piece = { source: rest, newStart, output: rest };
      appendPieces.push(piece);
      duplicatePieces.push(piece);
    }
    appendPieces.sort((a, b) => compareRational(a.newStart, b.newStart));

    let appendCursor = layout.authoredDurationBeats;
    for (const piece of appendPieces) {
      if (!equalRational(piece.newStart, appendCursor))
        return {
          reason:
            "The displayed Measure cannot be represented as a continuous bar in this progression. No content was changed.",
        };
      appendCursor = addRational(appendCursor, piece.output.duration.beats);
    }
    if (!equalRational(appendCursor, addRational(appendStart, measure.capacityBeats)))
      return {
        reason:
          "The displayed Measure does not cover one exact bar, so it cannot be duplicated safely. No content was changed.",
      };

    const usedNoteIds = new Set<string>();
    for (const step of sourceSteps) {
      const phrase =
        step.kind === "rest"
          ? step.authoredMelody
          : step.melody?.mode === "authored"
            ? step.melody.phrase
            : undefined;
      for (const note of phrase?.notes ?? []) usedNoteIds.add(note.id);
    }
    const originalMelody = createEffectiveMelodyTimeline(project);
    for (const note of originalMelody) usedNoteIds.add(note.eventKey);

    const generatedOwners = new Set(
      sourceSteps.flatMap((step) =>
        step.kind === "chord" && step.melody?.mode === "generated" ? [step.id] : [],
      ),
    );
    const copiedByOwner = new Map<string, PreservedNote[]>();
    const ownerHadMelody = new Set<string>();
    const ownerRecipes = new Map<string, ChordMelodyRecipe | undefined>();
    const sourceMeasureEnd = measure.endBeats;
    for (const piece of duplicatePieces) {
      const source = piece.source;
      if (source.kind === "rest" ? source.authoredMelody : source.melody)
        ownerHadMelody.add(piece.output.id);
      ownerRecipes.set(piece.output.id, recipeForStep(source));
    }

    const expectedCopied: MusicalTimelinePoint[] = [];
    for (const note of originalMelody) {
      const noteEnd = addRational(note.startBeats, note.durationBeats);
      const clippedStart =
        compareRational(note.startBeats, measure.startBeats) > 0
          ? note.startBeats
          : measure.startBeats;
      const clippedEnd =
        compareRational(noteEnd, sourceMeasureEnd) < 0 ? noteEnd : sourceMeasureEnd;
      if (compareRational(clippedEnd, clippedStart) <= 0) continue;

      const targetStart = addRational(
        appendStart,
        subtractRational(clippedStart, measure.startBeats),
      );
      const owner = ownerAt(duplicatePieces, targetStart);
      if (!owner)
        return {
          reason:
            "A copied Melody note would have no Step owner in the appended Measure. No content was changed.",
        };
      const targetInstrument = resolveEffectiveMelodyInstrument(
        owner.output.melodyInstrumentOverride,
        project.melodyTrack.instrument,
      ).id;
      if (targetInstrument !== note.instrument)
        return {
          reason: `The copied Melody would need ${note.instrument} in Measure ${duplicateNumber}, but its retained Step override uses ${targetInstrument}. v9 stores one Melody instrument per Step. No content was changed.`,
        };

      const sourceOwner = sourceById.get(note.sourceStepId);
      const sourceStart = sourceStarts.get(note.sourceStepId);
      if (!sourceOwner || !sourceStart)
        return {
          reason: "A copied Melody note has no source Step owner. No content was changed.",
        };
      const baseId = `${note.sourceStepId}~${note.eventKey}~duplicate-measure-${duplicateNumber}`;
      const id = freshStepId(baseId, usedNoteIds);
      const durationBeats = subtractRational(clippedEnd, clippedStart);
      const sourceRecipe = sourceRecipes.get(sourceOwner.id);
      const localNote: PreservedNote = {
        id,
        pitch: note.pitch,
        sourcePitchMidi: note.sourcePitchMidi,
        startBeats: subtractRational(targetStart, owner.newStart),
        durationBeats,
        instrument: note.instrument,
        ...(sourceRecipe ? { sourceRecipe } : {}),
        wasGenerated: generatedOwners.has(sourceOwner.id),
      };
      const notes = copiedByOwner.get(owner.output.id) ?? [];
      notes.push(localNote);
      copiedByOwner.set(owner.output.id, notes);
      ownerHadMelody.add(owner.output.id);
      expectedCopied.push({
        sourceStepId: owner.output.id,
        pitch: note.pitch,
        sourcePitchMidi: note.sourcePitchMidi,
        startBeats: targetStart,
        durationBeats,
        instrument: note.instrument,
      });
    }

    const draftSteps = [...sourceSteps, ...appendPieces.map((piece) => piece.output)];
    const draftProject: Project = Object.freeze({
      ...project,
      progression: Object.freeze({ ...project.progression, steps: Object.freeze(draftSteps) }),
    });
    const draftTimeline = createEffectiveMelodyTimeline(draftProject);
    const finalAppendedSteps = appendPieces.map((piece) => {
      if (!duplicatePieces.some((duplicate) => duplicate.output.id === piece.output.id))
        return piece.output;
      const step = piece.output;
      const expectedForOwner = (copiedByOwner.get(step.id) ?? []).map((note) => ({
        sourceStepId: step.id,
        pitch: note.pitch,
        sourcePitchMidi: note.sourcePitchMidi,
        startBeats: addRational(piece.newStart, note.startBeats),
        durationBeats: note.durationBeats,
        instrument: note.instrument,
      }));
      const generatedSource =
        piece.source.kind === "chord" && piece.source.melody?.mode === "generated";
      const generatedMatches = sameEffectiveMusic(
        expectedForOwner,
        draftTimeline.filter((note) => note.sourceStepId === step.id),
      );
      if (generatedSource && generatedMatches) return step;
      return setAuthoredPhrase(
        step,
        copiedByOwner.get(step.id) ?? [],
        ownerHadMelody.has(step.id),
        ownerRecipes.get(step.id),
      );
    });

    const finalSteps = [...sourceSteps, ...finalAppendedSteps];
    const firstDuplicateStep = duplicatePieces[0]?.output;
    if (!firstDuplicateStep)
      return { reason: "This Measure has no copyable Step fragments. No content was changed." };
    const progression = normalizeSongSections(
      Object.freeze({
        ...project.progression,
        steps: Object.freeze(finalSteps),
        selectedStepId: firstDuplicateStep.id,
      }),
    );
    const actualTimeline = createEffectiveMelodyTimeline(
      Object.freeze({ ...project, progression }),
    );
    const expectedTimeline = [...originalMelody, ...expectedCopied];
    if (!sameEffectiveMusic(expectedTimeline, actualTimeline))
      return {
        reason:
          "Duplicating this Measure would change existing effective Melody or reveal dormant notes in the partial final bar. No content was changed.",
      };

    return Object.freeze({
      progression,
      sourceMeasureNumber: measure.number,
      duplicateMeasureNumber: duplicateNumber,
      startBeats: appendStart,
      duplicatedDurationBeats: measure.capacityBeats,
      duplicatedStepIds: Object.freeze(duplicatePieces.map((piece) => piece.output.id)),
    });
  } catch (error) {
    return {
      reason:
        error instanceof Error
          ? `This Measure cannot be duplicated safely: ${error.message}`
          : "This Measure cannot be duplicated safely.",
    };
  }
}

export interface MeasureMovePlan {
  readonly progression: Progression;
  /** 1-based number of the Measure in its original position. */
  readonly sourceMeasureNumber: number;
  /** 1-based number the moved Measure occupies after the move. */
  readonly targetMeasureNumber: number;
  /** Ids of the Steps that make up the moved Measure, in their new order. */
  readonly movedStepIds: readonly string[];
  readonly movedDurationBeats: Rational;
  /** Identity/renaming map for surviving Step ids, mirroring MeasureInsertionPlan. */
  readonly reanchoredStepIds: ReadonlyMap<string, string | undefined>;
  readonly loopStartStepIds: ReadonlyMap<string, string | undefined>;
  readonly loopEndStepIds: ReadonlyMap<string, string | undefined>;
}

export type MeasureMoveResult = MeasureMovePlan | MeasureDeletionRefusal;

export interface MeasureBlockMoveOptions {
  /** Pad a partial final bar when the moved block touches it or is inserted after it. */
  readonly padPartialFinalMeasure?: boolean;
  /** Effective notes from before optional padding; padding must not activate dormant Melody. */
  readonly preservedEffectiveMelody?: readonly EffectiveMelodyNote[];
}

/**
 * One region of the splice: `[start, end)` in authored time is displaced by exactly `shiftBeats`.
 * A Step/note piece is split wherever its span straddles a region boundary, so every piece lies
 * inside one region and the whole move is a monotone piecewise translation of the timeline.
 */
interface MoveRegion {
  readonly start: Rational;
  readonly end: Rational;
  readonly shiftBeats: Rational;
}

function minRational(a: Rational, b: Rational): Rational {
  return compareRational(a, b) <= 0 ? a : b;
}

function maxRational(a: Rational, b: Rational): Rational {
  return compareRational(a, b) >= 0 ? a : b;
}

function shiftForPosition(regions: readonly MoveRegion[], position: Rational): Rational {
  for (const region of regions) {
    if (compareRational(position, region.start) >= 0 && compareRational(position, region.end) < 0)
      return region.shiftBeats;
  }
  return ZERO;
}

/**
 * Splits one note into the segments the splice creates, measured in the destination timeline.
 * Splitting happens at the region boundaries and wherever a landing owner boundary corresponds in
 * source time, so no segment straddles two owners. Adjacent pieces that come back out adjacent stay
 * merged, and each segment reports the onset it had in the Step it came from so the caller can
 * re-attach it with its original phrase-local position.
 */
function moveNoteSpans(
  noteStart: Rational,
  noteEnd: Rational,
  srcStart: Rational,
  srcEnd: Rational,
  progressionEnd: Rational,
  ownerBounds: readonly Rational[],
  regions: readonly MoveRegion[],
  sourceStepStart: Rational,
): readonly {
  readonly start: Rational;
  readonly end: Rational;
  readonly onset: Rational;
}[] {
  const candidates = [srcStart, srcEnd];
  for (const region of regions)
    for (const bound of ownerBounds) candidates.push(subtractRational(bound, region.shiftBeats));
  const points = [...new Set(candidates)]
    .filter((point) => compareRational(point, noteStart) > 0 && compareRational(point, noteEnd) < 0)
    .sort(compareRational);
  const ordered = [noteStart, ...points, noteEnd];
  const spans: { start: Rational; end: Rational; onset: Rational }[] = [];
  for (let index = 0; index + 1 < ordered.length; index++) {
    const from = ordered[index]!;
    const to = ordered[index + 1]!;
    const shiftBeats = shiftForPosition(regions, from);
    const movedStart = addRational(from, shiftBeats);
    const movedEnd = addRational(to, shiftBeats);
    // The progression end never moves, so material from beyond it stays beyond it and is inaudible.
    if (compareRational(movedStart, progressionEnd) >= 0) continue;
    const clippedEnd = compareRational(movedEnd, progressionEnd) > 0 ? progressionEnd : movedEnd;
    if (compareRational(clippedEnd, movedStart) <= 0) continue;
    const previous = spans[spans.length - 1];
    if (previous && compareRational(previous.end, movedStart) === 0) previous.end = clippedEnd;
    else
      spans.push({
        start: movedStart,
        end: clippedEnd,
        onset: subtractRational(from, sourceStepStart),
      });
  }
  return spans;
}

/**
 * True only when authored Step fragments (not the implicit trailing gap) tile exactly
 * `[measure.startBeats, measure.startBeats + barLength)`. A Measure whose authored content overruns
 * its bar, or stops short of it, cannot be spliced as a whole bar.
 */
function coversExactBar(
  measure: ProgressionMeasure,
  barLength: Rational,
  authoredDurationBeats: Rational,
): boolean {
  const barEnd = addRational(measure.startBeats, barLength);
  let cursor = measure.startBeats;
  for (const fragment of measure.fragments) {
    if (compareRational(fragment.startBeats, cursor) !== 0) return false;
    cursor = addRational(cursor, fragment.durationBeats);
  }
  // A Step overrunning the progression end is clipped by that end, so the authored Measure ends
  // where the shorter of the two does.
  const authoredEnd =
    compareRational(cursor, authoredDurationBeats) < 0 ? cursor : authoredDurationBeats;
  return compareRational(authoredEnd, barEnd) === 0;
}

/**
 * Plans a move of one or more whole bars. The selected time block is spliced out and re-inserted
 * immediately before the Measure currently at `toInsertIndex`, preserving Step identities and
 * effective Melody through the existing piecewise-translation planner.
 *
 * `toInsertIndex === layout.measures.length` appends the block after the final Measure. Positions
 * from the block's first Measure through the position immediately after its last Measure are
 * refusals rather than unchanged plans.
 */
export function planMeasureBlockMove(
  project: Project,
  fromMeasureIndex: number,
  measureCount: number,
  toInsertIndex: number,
  options: MeasureBlockMoveOptions = {},
): MeasureMoveResult {
  if (project.temporaryBranch)
    return {
      reason:
        "Finish or discard the active branch before moving a Measure; its anchors refer to the current Steps. No content was changed.",
    };
  try {
    const sourceSteps = project.progression.steps;
    const layout = createProgressionMeasureLayout(sourceSteps, project.globalTiming.meter);
    const count = layout.measures.length;
    if (
      !Number.isInteger(fromMeasureIndex) ||
      fromMeasureIndex < 0 ||
      fromMeasureIndex >= count ||
      !Number.isInteger(measureCount) ||
      measureCount < 1 ||
      fromMeasureIndex + measureCount > count
    )
      return { reason: "This Measure block is no longer available." };
    if (!Number.isInteger(toInsertIndex) || toInsertIndex < 0 || toInsertIndex > count)
      return { reason: "The target position is no longer available." };
    const finalMeasure = layout.measures.at(-1);
    const finalPadding = finalMeasure?.trailingGap?.durationBeats ?? ZERO;
    const blockTouchesPartialFinal = fromMeasureIndex + measureCount === count;
    if (
      options.padPartialFinalMeasure &&
      compareRational(finalPadding, ZERO) > 0 &&
      (blockTouchesPartialFinal || toInsertIndex === count)
    ) {
      const preservedEffectiveMelody =
        options.preservedEffectiveMelody ?? createEffectiveMelodyTimeline(project);
      const usedIds = new Set(sourceSteps.map((step) => step.id));
      const paddingStep: RestStep = Object.freeze({
        id: uniqueStepId(
          `system-move-padding-${finalMeasure!.number}`,
          finalMeasure!.number,
          usedIds,
          "rest",
        ),
        kind: "rest",
        duration: musicalDuration(finalPadding),
      });
      const paddedProject: Project = Object.freeze({
        ...project,
        progression: Object.freeze({
          ...project.progression,
          steps: Object.freeze([...sourceSteps, paddingStep]),
        }),
      });
      return planMeasureBlockMove(paddedProject, fromMeasureIndex, measureCount, toInsertIndex, {
        preservedEffectiveMelody,
      });
    }
    // Insertion anywhere within or directly after the selected block leaves its order unchanged.
    if (toInsertIndex >= fromMeasureIndex && toInsertIndex <= fromMeasureIndex + measureCount)
      return {
        reason:
          toInsertIndex === fromMeasureIndex
            ? "This Measure block is already at that position; no content was changed."
            : "This Measure block already sits immediately before that position; no content was changed.",
      };

    const measure = layout.measures[fromMeasureIndex]!;
    const barLength = layout.barLengthBeats;
    for (const sourceMeasure of layout.measures.slice(
      fromMeasureIndex,
      fromMeasureIndex + measureCount,
    ))
      if (!coversExactBar(sourceMeasure, barLength, layout.authoredDurationBeats))
        return {
          reason:
            measureCount === 1
              ? "This Measure does not cover one exact bar, so it cannot be moved safely. No content was changed."
              : "Every Measure in a moved block must cover one exact bar, so this block cannot be moved safely. No content was changed.",
        };

    const srcStart = multiplyRational(barLength, rational(fromMeasureIndex));
    const blockDuration = multiplyRational(barLength, rational(measureCount));
    const srcEnd = addRational(srcStart, blockDuration);
    const movingEarlier = toInsertIndex < fromMeasureIndex;
    // Moving earlier: the block lands at the target bar. Moving later removes the block first,
    // shifting the insertion boundary left by the complete block length.
    const targetStart = multiplyRational(
      barLength,
      rational(movingEarlier ? toInsertIndex : toInsertIndex - measureCount),
    );
    const moveShift = subtractRational(targetStart, srcStart);
    const movedBlockEnd = addRational(targetStart, blockDuration);

    // Moving EARLIER: everything skipped over slides right by the block's full bar span.
    //
    // Moving LATER: the block is lifted out and the intervening time slides left by the same span.
    const laterBoundary = multiplyRational(barLength, rational(toInsertIndex));
    const regions: readonly MoveRegion[] = movingEarlier
      ? [
          { start: targetStart, end: srcStart, shiftBeats: blockDuration },
          { start: srcStart, end: srcEnd, shiftBeats: moveShift },
        ]
      : [
          { start: srcStart, end: srcEnd, shiftBeats: moveShift },
          { start: srcEnd, end: laterBoundary, shiftBeats: subtractRational(ZERO, blockDuration) },
        ];

    const sourceStarts = new Map<string, Rational>();
    const usedIds = new Set(sourceSteps.map((step) => step.id));
    const pieceGroups = new Map<string, StepPiece[]>();
    let oldCursor = ZERO;

    sourceSteps.forEach((source) => {
      const oldStart = oldCursor;
      const oldEnd = addRational(oldStart, source.duration.beats);
      sourceStarts.set(source.id, oldStart);
      const intervals: { start: Rational; end: Rational }[] = [];
      const beforeEnd = minRational(oldEnd, srcStart);
      if (compareRational(oldStart, beforeEnd) < 0)
        intervals.push({ start: oldStart, end: beforeEnd });
      const moveStart = maxRational(oldStart, srcStart);
      const moveEnd = minRational(oldEnd, srcEnd);
      if (compareRational(moveStart, moveEnd) < 0)
        intervals.push({ start: moveStart, end: moveEnd });
      // Clamped at `srcEnd` in both directions: a Step can start after `srcEnd` (a piece that only
      // slides) or before it (the trailing piece of a Step the moved bar cuts through).
      const afterStart = maxRational(oldStart, srcEnd);
      if (compareRational(oldEnd, afterStart) > 0)
        intervals.push({ start: afterStart, end: oldEnd });
      // Ordered by new position: the earliest piece keeps the source id, later pieces get new ids.
      const ordered = intervals
        .map((interval) => ({
          interval,
          newStart: addRational(interval.start, shiftForPosition(regions, interval.start)),
        }))
        .sort((a, b) => compareRational(a.newStart, b.newStart));
      const group = ordered.map(({ interval, newStart }, pieceIndex) => {
        const duration = subtractRational(interval.end, interval.start);
        const id =
          pieceIndex === 0
            ? source.id
            : uniqueStepId(
                source.id,
                measure.number,
                usedIds,
                pieceIndex === 1 ? "right" : `right-${pieceIndex}`,
              );
        return {
          source,
          newStart,
          output: stripAuthoredMelody(clonePiece(source, id, duration)),
        };
      });
      pieceGroups.set(source.id, group);
      oldCursor = oldEnd;
    });

    const pieces: readonly StepPiece[] = Object.freeze(
      [...pieceGroups.values()]
        .flatMap((group) => group)
        .sort((a, b) => compareRational(a.newStart, b.newStart)),
    );
    // The moved block occupies `[targetStart, targetStart + blockDuration)`.
    const movedPieceIds = new Set(
      pieces
        .filter(
          (piece) =>
            compareRational(piece.newStart, targetStart) >= 0 &&
            compareRational(piece.newStart, movedBlockEnd) < 0,
        )
        .map((piece) => piece.output.id),
    );
    const afterPieceIds = new Map<string, string>();
    for (const piece of pieces) afterPieceIds.set(piece.source.id, piece.output.id);

    // The pieces must tile the timeline exactly, in the order they occupy it: anything else would
    // silently shift a bar line.
    const newStarts = new Map<string, Rational>();
    let newCursor = ZERO;
    for (const piece of pieces) {
      if (compareRational(piece.newStart, newCursor) !== 0)
        return {
          reason:
            "This Measure cannot be moved without leaving a gap or an overlap in the progression. No content was changed.",
        };
      newStarts.set(piece.output.id, newCursor);
      newCursor = addRational(newCursor, piece.output.duration.beats);
    }
    const nextStepsBeforeMelody = pieces.map((piece) => piece.output);

    const originalMelody =
      options.preservedEffectiveMelody ?? createEffectiveMelodyTimeline(project);
    const generatedOwners = new Set(
      sourceSteps.flatMap((step) =>
        step.kind === "chord" && step.melody?.mode === "generated" ? [step.id] : [],
      ),
    );
    const sourceRecipeById = new Map(sourceSteps.map((step) => [step.id, recipeForStep(step)]));
    const preservedByOwner = new Map<string, PreservedNote[]>();
    const ownerRecipes = new Map<string, ChordMelodyRecipe | undefined>();
    const ownerHadMelody = new Set<string>();
    // Destination-time boundaries of every piece, per source Step: splitting a note here keeps each
    // of its segments inside exactly one owner.
    const boundsBySourceStep = new Map<string, Rational[]>();
    for (const piece of pieces) {
      const bounds = boundsBySourceStep.get(piece.source.id) ?? [];
      bounds.push(piece.newStart, addRational(piece.newStart, piece.output.duration.beats));
      boundsBySourceStep.set(piece.source.id, bounds);
    }

    const addPreservedSegments = (
      note: NoteInterval,
      sourceStepId: string,
      sourceStepStart: Rational,
      wasGenerated: boolean,
      recipe: ChordMelodyRecipe | undefined,
    ): string | undefined => {
      const noteEnd = addRational(note.startBeats, note.durationBeats);
      // Owner boundaries in destination time become split points here, so every returned segment
      // lands inside exactly one piece of the source Step.
      const ownerBounds = boundsBySourceStep.get(sourceStepId) ?? [];
      const spans = moveNoteSpans(
        note.startBeats,
        noteEnd,
        srcStart,
        srcEnd,
        newCursor,
        ownerBounds,
        regions,
        sourceStepStart,
      );
      if (spans.length === 0)
        return "A retained authored Melody note would be removed by the move, and the move must preserve Melody. No content was changed.";
      for (const [spanIndex, span] of spans.entries()) {
        const owner = ownerAt(pieces, span.start);
        if (!owner)
          return "A retained authored Melody note would lose its Step owner, and schema v10 has no owner for notes outside the progression. No content was changed.";
        const ownerDuration = owner.output.duration.beats;
        // `span.start` is the segment's onset in the destination timeline, so its phrase-local
        // onset is simply where it sits inside the piece that owns it.
        const localOnset = subtractRational(span.start, owner.newStart);
        const localEnd = subtractRational(span.end, owner.newStart);
        if (compareRational(localEnd, ZERO) <= 0) continue;
        if (compareRational(localOnset, ownerDuration) >= 0) continue;
        const clippedOnset = compareRational(localOnset, ZERO) < 0 ? ZERO : localOnset;
        const clippedEnd = compareRational(localEnd, ownerDuration) > 0 ? ownerDuration : localEnd;
        const id =
          spanIndex === 0 ? note.id : `${note.id}~measure-${measure.number}-after-${spanIndex}`;
        const notes = preservedByOwner.get(owner.output.id) ?? [];
        notes.push({
          id,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats: clippedOnset,
          durationBeats: subtractRational(clippedEnd, clippedOnset),
          instrument: note.instrument,
          ...(recipe ? { sourceRecipe: recipe } : {}),
          wasGenerated,
        });
        preservedByOwner.set(owner.output.id, notes);
        ownerHadMelody.add(owner.output.id);
        if (!ownerRecipes.has(owner.output.id))
          ownerRecipes.set(owner.output.id, sourceRecipeById.get(sourceStepId));
      }
      return undefined;
    };

    for (const note of originalMelody) {
      if (!generatedOwners.has(note.sourceStepId)) continue;
      const reason = addPreservedSegments(
        {
          id: note.eventKey,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats: note.startBeats,
          durationBeats: note.durationBeats,
          instrument: note.instrument,
        },
        note.sourceStepId,
        sourceStarts.get(note.sourceStepId) ?? ZERO,
        true,
        sourceRecipeById.get(note.sourceStepId),
      );
      if (reason) return { reason };
    }
    for (const source of sourceSteps) {
      const phrase =
        source.kind === "rest"
          ? source.authoredMelody
          : source.melody?.mode === "authored"
            ? source.melody.phrase
            : undefined;
      if (!phrase) continue;
      const sourceStart = sourceStarts.get(source.id)!;
      const instrument = resolveEffectiveMelodyInstrument(
        source.melodyInstrumentOverride,
        project.melodyTrack.instrument,
      ).id;
      for (const note of phrase.notes) {
        const absoluteStart = addRational(sourceStart, note.onset);
        const absoluteEnd = addRational(absoluteStart, note.duration);
        const stepEnd = addRational(sourceStart, source.duration.beats);
        // Phrase notes are performed only in the Step that owns them. A note that starts at/after
        // the Step end (or after the progression end) is dormant and not retained content, and one
        // that overruns the Step end contributes only its visible part.
        if (compareRational(absoluteStart, stepEnd) >= 0) continue;
        if (compareRational(absoluteStart, newCursor) >= 0) continue;
        const visibleEnd = compareRational(absoluteEnd, stepEnd) < 0 ? absoluteEnd : stepEnd;
        const visibleProgressionEnd =
          compareRational(visibleEnd, newCursor) < 0 ? visibleEnd : newCursor;
        if (compareRational(visibleProgressionEnd, absoluteStart) <= 0) continue;
        const reason = addPreservedSegments(
          {
            id: note.id,
            pitch: pitchToConcertFrame(note.pitch, source),
            sourcePitchMidi:
              note.sourcePitchMidi ??
              note.pitch.midiNumber + (note.pitch.transpositionCompensationSemitones ?? 0),
            startBeats: absoluteStart,
            durationBeats: subtractRational(visibleProgressionEnd, absoluteStart),
            instrument,
          },
          source.id,
          sourceStart,
          false,
          phrase.sourceRecipe ?? sourceRecipeById.get(source.id),
        );
        if (reason) return { reason };
      }
    }

    for (const piece of pieces) {
      const source = piece.source;
      const hadMelody =
        source.kind === "rest" ? source.authoredMelody !== undefined : source.melody !== undefined;
      if (hadMelody) ownerHadMelody.add(piece.output.id);
      if (!ownerRecipes.has(piece.output.id))
        ownerRecipes.set(piece.output.id, recipeForStep(source));
    }

    for (const [ownerId, notes] of preservedByOwner) {
      const instruments = new Set(notes.map((note) => note.instrument));
      if (instruments.size > 1) {
        const names = [...instruments].sort().join(" and ");
        return {
          reason: `The retained notes would need ${names} in one Step, but v9 stores one Melody instrument per Step. No content was changed.`,
        };
      }
      const index = nextStepsBeforeMelody.findIndex((step) => step.id === ownerId);
      const ownerStep = nextStepsBeforeMelody[index];
      if (ownerStep)
        nextStepsBeforeMelody[index] = withInstrument(ownerStep, [...instruments][0]!, project);
    }

    const generationTestProject: Project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([...nextStepsBeforeMelody]),
      }),
    });
    const generatedAfterByOwner = new Map<string, EffectiveMelodyNote[]>();
    for (const note of createEffectiveMelodyTimeline(generationTestProject)) {
      const owner = generatedAfterByOwner.get(note.sourceStepId) ?? [];
      owner.push(note);
      generatedAfterByOwner.set(note.sourceStepId, owner);
    }

    const finalSteps = nextStepsBeforeMelody.map((step) => {
      const preserved = preservedByOwner.get(step.id) ?? [];
      const origin = pieces.find((piece) => piece.output.id === step.id)?.source;
      const originallyGenerated = origin?.kind === "chord" && origin.melody?.mode === "generated";
      const expectedAbsolute = preserved.map((note) => ({
        ...note,
        startBeats: addRational(newStarts.get(step.id)!, note.startBeats),
      }));
      if (
        originallyGenerated &&
        sameGeneratedPhrase(expectedAbsolute, generatedAfterByOwner.get(step.id) ?? [])
      )
        return step;
      const sourceRecipe =
        ownerRecipes.get(step.id) ?? preserved.find((note) => note.sourceRecipe)?.sourceRecipe;
      return setAuthoredPhrase(step, preserved, ownerHadMelody.has(step.id), sourceRecipe);
    });

    // A move never drops a Step, so every surviving id is its own anchor. A split Step's loop end
    // must still cover its trailing piece.
    const reanchoredStepIds = new Map<string, string | undefined>(
      sourceSteps.map((step) => [step.id, step.id]),
    );
    const loopStartStepIds = new Map<string, string | undefined>(reanchoredStepIds);
    const loopEndStepIds = new Map<string, string | undefined>(
      sourceSteps.map((step) => [step.id, afterPieceIds.get(step.id) ?? step.id]),
    );
    const sections: readonly SongSection[] = (project.progression.sections ?? []).flatMap(
      (section) => {
        const target = reanchoredStepIds.get(section.startStepId);
        return target ? [Object.freeze({ ...section, startStepId: target })] : [];
      },
    );
    const oldLoop = project.progression.loopRegion;
    const loopStart = oldLoop ? loopStartStepIds.get(oldLoop.startStepId) : undefined;
    const loopEnd = oldLoop ? loopEndStepIds.get(oldLoop.endStepId) : undefined;
    const loopStartIndex = loopStart ? targetStepIndex(finalSteps, loopStart) : -1;
    const loopEndIndex = loopEnd ? targetStepIndex(finalSteps, loopEnd) : -1;
    const loopRegion =
      loopStartIndex >= 0 && loopEndIndex >= loopStartIndex
        ? Object.freeze({ startStepId: loopStart!, endStepId: loopEnd! })
        : undefined;
    const oldSelected = project.progression.selectedStepId;
    const selectedStepId = oldSelected ? reanchoredStepIds.get(oldSelected) : undefined;
    const progressionBase = {
      ...project.progression,
      steps: Object.freeze(finalSteps),
      sections: Object.freeze(sections),
      ...(selectedStepId ? { selectedStepId } : {}),
    };
    const {
      loopRegion: _oldLoop,
      selectedStepId: _oldSelection,
      ...withoutOptionalState
    } = progressionBase;
    const progression = normalizeSongSections(
      Object.freeze({
        ...withoutOptionalState,
        ...(selectedStepId ? { selectedStepId } : {}),
        ...(loopRegion ? { loopRegion } : {}),
      }),
    );

    const expectedEffective: {
      sourceStepId: string;
      eventKey: string;
      pitch: AuthoredMelodyNote["pitch"];
      sourcePitchMidi: number;
      startBeats: Rational;
      durationBeats: Rational;
      instrument: EffectiveMelodyNote["instrument"];
    }[] = [];
    for (const step of finalSteps) {
      const ownerStart = newStarts.get(step.id)!;
      const used = new Set<string>();
      for (const note of [...(preservedByOwner.get(step.id) ?? [])].sort(stableNoteOrder)) {
        const eventKey = collisionSafeNoteId(note.id, used);
        used.add(eventKey);
        const startBeats = addRational(ownerStart, note.startBeats);
        if (compareRational(startBeats, newCursor) >= 0) continue;
        const noteEnd = addRational(startBeats, note.durationBeats);
        const visibleEnd = compareRational(noteEnd, newCursor) > 0 ? newCursor : noteEnd;
        if (compareRational(visibleEnd, startBeats) <= 0) continue;
        expectedEffective.push({
          sourceStepId: step.id,
          eventKey,
          pitch: note.pitch,
          sourcePitchMidi: note.sourcePitchMidi,
          startBeats,
          durationBeats: subtractRational(visibleEnd, startBeats),
          instrument: note.instrument,
        });
      }
    }
    const actualEffective = createEffectiveMelodyTimeline(
      Object.freeze({ ...project, progression }),
    );
    if (!sameEffectiveTimeline(expectedEffective, actualEffective))
      return {
        reason:
          "This Measure cannot be moved without changing retained effective Melody. No content was changed.",
      };

    const orderedMovedStepIds = finalSteps
      .filter((step) => movedPieceIds.has(step.id))
      .map((step) => step.id);
    const movedStepDurations = new Map(finalSteps.map((step) => [step.id, step.duration.beats]));
    const movedDurationBeats = orderedMovedStepIds.reduce(
      (total: Rational, id) => addRational(total, movedStepDurations.get(id)!),
      ZERO,
    );
    return Object.freeze({
      progression,
      sourceMeasureNumber: measure.number,
      targetMeasureNumber: movingEarlier ? toInsertIndex + 1 : toInsertIndex - measureCount + 1,
      movedStepIds: Object.freeze(orderedMovedStepIds),
      movedDurationBeats,
      reanchoredStepIds,
      loopStartStepIds,
      loopEndStepIds,
    });
  } catch (error) {
    return {
      reason:
        error instanceof Error
          ? `This Measure cannot be moved safely: ${error.message}`
          : "This Measure cannot be moved safely.",
    };
  }
}

export function planMeasureMove(
  project: Project,
  fromMeasureIndex: number,
  toInsertIndex: number,
): MeasureMoveResult {
  return planMeasureBlockMove(project, fromMeasureIndex, 1, toInsertIndex);
}
