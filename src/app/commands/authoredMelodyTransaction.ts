import type { AppliedCommand, ProjectCommand } from ".";
import type { AuthoredMelodyNote, AuthoredMelodyPhrase } from "../../domain/melody/types";
import { snapshotAuthoredMelodyPhrase, snapshotChordMelody } from "../../domain/melody/types";
import { validateMelodyInstrumentId } from "../../domain/melody/instrumentCatalog";
import type { ChordStep, ProgressionStep, RestStep } from "../../domain/progression/step";
import type { Project } from "../../domain/project/project";
import {
  addRational,
  compareRational,
  subtractRational,
  ZERO,
  type Rational,
} from "../../domain/timing/rational";
import { assertMidiNumber, type ExactPitch } from "../../domain/harmony/pitch";
import { createEffectiveMelodyTimeline } from "../../domain/melody/effectiveTimeline";
import { pitchToConcertFrame, pitchToSourceFrame } from "../../domain/progression/transposition";

export interface AbsoluteAuthoredNote {
  readonly id: string;
  readonly pitch: ExactPitch;
  readonly sourcePitchMidi?: number;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
}
export type AuthoredMelodyEdit =
  | {
      readonly type: "upsert";
      readonly note: AbsoluteAuthoredNote;
      readonly sourceStepId?: string;
      /** Source identity when a collision-safe transfer assigns a new destination ID. */
      readonly sourceNoteId?: string;
    }
  | { readonly type: "delete"; readonly noteId: string; readonly sourceStepId: string };
export interface AuthoredMelodyTransactionPayload {
  readonly edits: readonly AuthoredMelodyEdit[];
  readonly convertStepIds?: readonly string[];
  readonly expectedUpdatedAt?: string;
  readonly nowIso: string;
}
interface StepMelodyState {
  readonly stepId: string;
  readonly authoredMelody?: AuthoredMelodyPhrase;
  readonly chordMelody?: ChordStep["melody"];
  readonly melodyInstrumentOverride?: ChordStep["melodyInstrumentOverride"];
}
interface RestorePayload {
  readonly states: readonly StepMelodyState[];
  readonly nowIso: string;
}
export type AuthoredMelodyTransactionCommand = ProjectCommand<AuthoredMelodyTransactionPayload> & {
  readonly type: "melody/apply-authored-transaction";
};
export type RestoreAuthoredMelodyCommand = ProjectCommand<RestorePayload> & {
  readonly type: "melody/restore-authored-transaction";
};
export class AuthoredMelodyTransactionError extends RangeError {
  constructor(
    readonly reason:
      | "stale-project"
      | "unknown-step"
      | "unknown-note"
      | "ambiguous-note"
      | "generated-destination"
      | "out-of-range"
      | "invalid-note",
    message: string,
  ) {
    super(message);
    this.name = "AuthoredMelodyTransactionError";
  }
}
function phraseFor(step: ProgressionStep): AuthoredMelodyPhrase | undefined {
  if (step.kind === "rest") return step.authoredMelody;
  if (step.melody?.mode === "authored") return step.melody.phrase;
  return undefined;
}
function sameExactPitch(left: ExactPitch, right: ExactPitch): boolean {
  return (
    left.midiNumber === right.midiNumber &&
    left.pitchClassIdentity === right.pitchClassIdentity &&
    left.octave === right.octave &&
    left.spelling.step === right.spelling.step &&
    left.spelling.alter === right.spelling.alter &&
    (left.transpositionCompensationSemitones ?? 0) ===
      (right.transpositionCompensationSemitones ?? 0) &&
    left.transpositionSpellingOverride?.step === right.transpositionSpellingOverride?.step &&
    left.transpositionSpellingOverride?.alter === right.transpositionSpellingOverride?.alter
  );
}
function isRational(value: Rational): boolean {
  return (
    Number.isSafeInteger(value.numerator) &&
    Number.isSafeInteger(value.denominator) &&
    value.denominator > 0
  );
}
function snapshotStep(step: ProgressionStep): StepMelodyState {
  return {
    stepId: step.id,
    ...(step.kind === "rest" && step.authoredMelody ? { authoredMelody: step.authoredMelody } : {}),
    ...(step.kind === "chord" && step.melody !== undefined ? { chordMelody: step.melody } : {}),
    ...(step.melodyInstrumentOverride
      ? { melodyInstrumentOverride: step.melodyInstrumentOverride }
      : {}),
  };
}
function applyState(project: Project, states: readonly StepMelodyState[], nowIso: string): Project {
  const byId = new Map(states.map((state) => [state.stepId, state]));
  const steps = project.progression.steps.map((step) => {
    const state = byId.get(step.id);
    if (!state) return step;
    if (step.kind === "rest") {
      const { authoredMelody: _a, melodyInstrumentOverride: _i, ...rest } = step;
      return Object.freeze({
        ...rest,
        ...(state.authoredMelody
          ? { authoredMelody: snapshotAuthoredMelodyPhrase(state.authoredMelody) }
          : {}),
        ...(state.melodyInstrumentOverride
          ? { melodyInstrumentOverride: validateMelodyInstrumentId(state.melodyInstrumentOverride) }
          : {}),
      }) as RestStep;
    }
    const { melody: _m, melodyInstrumentOverride: _i, ...chord } = step;
    return Object.freeze({
      ...chord,
      ...(state.chordMelody ? { melody: snapshotChordMelody(state.chordMelody) } : {}),
      ...(state.melodyInstrumentOverride
        ? { melodyInstrumentOverride: validateMelodyInstrumentId(state.melodyInstrumentOverride) }
        : {}),
    }) as ChordStep;
  });
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    updatedAt: nowIso,
  });
}
export function restoreAuthoredMelodyTransaction(
  project: Project,
  command: RestoreAuthoredMelodyCommand,
): AppliedCommand {
  const previous = command.payload.states.map((state) => {
    const step = project.progression.steps.find((candidate) => candidate.id === state.stepId);
    if (!step)
      throw new AuthoredMelodyTransactionError("unknown-step", `Unknown Step ${state.stepId}`);
    return snapshotStep(step);
  });
  return {
    project: applyState(project, command.payload.states, command.payload.nowIso),
    inverse: { type: command.type, payload: { states: previous, nowIso: project.updatedAt } },
  };
}
export function applyAuthoredMelodyTransaction(
  project: Project,
  command: AuthoredMelodyTransactionCommand,
): AppliedCommand {
  if (
    command.payload.expectedUpdatedAt !== undefined &&
    command.payload.expectedUpdatedAt !== project.updatedAt
  )
    throw new AuthoredMelodyTransactionError(
      "stale-project",
      "The Project changed before this Melody edit could be applied.",
    );
  const starts = new Map<string, Rational>();
  let end = ZERO;
  for (const step of project.progression.steps) {
    starts.set(step.id, end);
    end = addRational(end, step.duration.beats);
  }
  const steps = project.progression.steps;
  const states = new Map<string, StepMelodyState>();
  const notesByStep = new Map<string, AuthoredMelodyNote[]>();
  const originalSourceNotes = new Map<string, AuthoredMelodyNote>();
  for (const step of steps) {
    for (const note of phraseFor(step)?.notes ?? [])
      originalSourceNotes.set(`${step.id}\u0000${note.id}`, note);
  }
  const converting = new Set(command.payload.convertStepIds ?? []);
  const effective = createEffectiveMelodyTimeline(project);
  if (converting.size) {
    for (const stepId of converting) {
      const step = steps.find((candidate) => candidate.id === stepId);
      if (!step || step.kind !== "chord" || step.melody?.mode !== "generated")
        throw new AuthoredMelodyTransactionError(
          "invalid-note",
          `Step ${stepId} is not generated Melody.`,
        );
      const start = starts.get(stepId)!;
      notesByStep.set(
        stepId,
        effective
          .filter((note) => note.sourceStepId === stepId)
          .map((note) => ({
            id: crypto.randomUUID(),
            pitch: note.pitch,
            sourcePitchMidi: note.sourcePitchMidi,
            onset: subtractRational(note.startBeats, start),
            duration: note.durationBeats,
          })),
      );
    }
  }
  const loadNotes = (step: ProgressionStep) => {
    if (!notesByStep.has(step.id)) {
      if (step.kind === "chord" && step.melody?.mode === "generated") {
        const start = starts.get(step.id)!;
        notesByStep.set(
          step.id,
          effective
            .filter((note) => note.sourceStepId === step.id)
            .map((note) => ({
              id: note.eventKey,
              pitch: note.pitch,
              sourcePitchMidi: note.sourcePitchMidi,
              onset: subtractRational(note.startBeats, start),
              duration: note.durationBeats,
            })),
        );
      } else
        notesByStep.set(
          step.id,
          (phraseFor(step)?.notes ?? []).map((note) => ({
            ...note,
            pitch: pitchToConcertFrame(note.pitch, step),
          })),
        );
    }
    return notesByStep.get(step.id)!;
  };
  const locate = (id: string, sourceStepId?: string) => {
    const candidates = steps.filter(
      (step) =>
        (phraseFor(step)?.notes.some((note) => note.id === id) ||
          (step.kind === "chord" &&
            step.melody?.mode === "generated" &&
            effective.some((note) => note.sourceStepId === step.id && note.eventKey === id))) &&
        (!sourceStepId || step.id === sourceStepId),
    );
    if (!candidates.length)
      throw new AuthoredMelodyTransactionError("unknown-note", `Unknown authored note ${id}`);
    if (candidates.length > 1)
      throw new AuthoredMelodyTransactionError(
        "ambiguous-note",
        `Note ID ${id} occurs in multiple Steps; specify its owner.`,
      );
    return candidates[0]!;
  };
  const editedNoteIdentities = new Set<string>();
  const markEditedIdentity = (stepId: string, noteId: string) => {
    const identity = `${stepId}\u0000${noteId}`;
    if (editedNoteIdentities.has(identity)) {
      throw new AuthoredMelodyTransactionError(
        "invalid-note",
        `Authored note ${noteId} in Step ${stepId} cannot be edited more than once in one transaction.`,
      );
    }
    editedNoteIdentities.add(identity);
  };
  for (const edit of command.payload.edits) {
    if (edit.type === "delete") {
      const source = locate(edit.noteId, edit.sourceStepId);
      markEditedIdentity(source.id, edit.noteId);
      loadNotes(source);
      const sourceNotes = notesByStep.get(source.id)!;
      const sourceIndex = sourceNotes.findIndex((note) => note.id === edit.noteId);
      if (sourceIndex < 0)
        throw new AuthoredMelodyTransactionError(
          "unknown-note",
          `Unknown authored note ${edit.noteId}`,
        );
      sourceNotes.splice(sourceIndex, 1);
      continue;
    }
    if (
      !edit.note.id ||
      !isRational(edit.note.startBeats) ||
      !isRational(edit.note.durationBeats) ||
      edit.note.startBeats.numerator < 0 ||
      compareRational(edit.note.durationBeats, ZERO) <= 0
    )
      throw new AuthoredMelodyTransactionError(
        "invalid-note",
        "Authored notes require an ID, valid pitch, non-negative onset, and positive Rational duration.",
      );
    try {
      assertMidiNumber(edit.note.pitch.midiNumber);
      if (edit.note.pitch.transpositionCompensationSemitones !== undefined)
        throw new RangeError("Concert edits cannot include source-frame compensation.");
      snapshotAuthoredMelodyPhrase({
        notes: [
          {
            id: edit.note.id,
            pitch: edit.note.pitch,
            ...(edit.note.sourcePitchMidi !== undefined
              ? { sourcePitchMidi: edit.note.sourcePitchMidi }
              : {}),
            onset: ZERO,
            duration: edit.note.durationBeats,
          },
        ],
      });
    } catch {
      throw new AuthoredMelodyTransactionError(
        "invalid-note",
        "Authored note pitch or exact duration is invalid.",
      );
    }
    const sourceId = edit.sourceNoteId ?? edit.note.id;
    const source =
      edit.sourceStepId || edit.sourceNoteId
        ? locate(sourceId, edit.sourceStepId)
        : steps.some((step) => phraseFor(step)?.notes.some((note) => note.id === sourceId))
          ? locate(sourceId)
          : undefined;
    const noteEnd = addRational(edit.note.startBeats, edit.note.durationBeats);
    if (compareRational(edit.note.startBeats, end) >= 0 || compareRational(noteEnd, end) > 0)
      throw new AuthoredMelodyTransactionError(
        "out-of-range",
        "New Melody edits must remain within the current progression.",
      );
    let destination = steps[0];
    let cursor = ZERO;
    for (const step of steps) {
      const next = addRational(cursor, step.duration.beats);
      if (compareRational(edit.note.startBeats, next) < 0) {
        destination = step;
        break;
      }
      cursor = next;
    }
    if (!destination)
      throw new AuthoredMelodyTransactionError(
        "out-of-range",
        "Melody onset is outside the progression.",
      );
    if (destination.kind === "chord" && destination.melody?.mode === "generated")
      loadNotes(destination);
    let inheritedSourcePitchMidi = edit.note.sourcePitchMidi;
    if (source) {
      loadNotes(source);
      const sourceNotes = notesByStep.get(source.id)!;
      const sourceIndex = sourceNotes.findIndex((note) => note.id === sourceId);
      if (sourceIndex < 0)
        throw new AuthoredMelodyTransactionError(
          "unknown-note",
          `Unknown authored note ${sourceId}`,
        );
      const sourceNote = sourceNotes[sourceIndex]!;
      if (inheritedSourcePitchMidi === undefined && sourceNote.sourcePitchMidi !== undefined) {
        inheritedSourcePitchMidi =
          sourceNote.sourcePitchMidi + (edit.note.pitch.midiNumber - sourceNote.pitch.midiNumber);
      }
      sourceNotes.splice(sourceIndex, 1);
    }
    const destinationNotes = loadNotes(destination);
    let id = edit.note.id;
    if (destinationNotes.some((note) => note.id === id)) {
      let suffix = 1;
      do {
        id = `${edit.note.id}~${destination.id}~${suffix++}`;
      } while (destinationNotes.some((note) => note.id === id));
    }
    const sourceIdentity = `${source?.id ?? destination.id}\u0000${source ? sourceId : edit.note.id}`;
    markEditedIdentity(source?.id ?? destination.id, source ? sourceId : edit.note.id);
    const destinationIdentity = `${destination.id}\u0000${id}`;
    if (destinationIdentity !== sourceIdentity) markEditedIdentity(destination.id, id);
    const onset = subtractRational(edit.note.startBeats, starts.get(destination.id)!);
    destinationNotes.push(
      Object.freeze({
        id,
        pitch: edit.note.pitch,
        ...(inheritedSourcePitchMidi !== undefined
          ? { sourcePitchMidi: inheritedSourcePitchMidi }
          : {}),
        onset,
        duration: edit.note.durationBeats,
      }),
    );
  }
  const touched = new Set(notesByStep.keys());
  for (const step of steps)
    if (touched.has(step.id)) {
      const notes = notesByStep.get(step.id)!;
      const phrase = snapshotAuthoredMelodyPhrase({
        notes: notes.map((note) => {
          const original = originalSourceNotes.get(`${step.id}\u0000${note.id}`);
          if (original && sameExactPitch(pitchToConcertFrame(original.pitch, step), note.pitch))
            return { ...note, pitch: original.pitch };
          return { ...note, pitch: pitchToSourceFrame(note.pitch, step) };
        }),
        ...(phraseFor(step)?.sourceRecipe
          ? { sourceRecipe: phraseFor(step)!.sourceRecipe }
          : step.kind === "chord" && step.melody?.mode === "generated"
            ? { sourceRecipe: step.melody.recipe }
            : {}),
      });
      states.set(step.id, {
        stepId: step.id,
        ...(step.kind === "rest"
          ? { authoredMelody: phrase }
          : {
              chordMelody: Object.freeze({
                mode: "authored",
                phrase,
                ...(phrase.sourceRecipe
                  ? { sourceRecipe: phrase.sourceRecipe }
                  : step.melody?.mode === "authored" && step.melody.sourceRecipe
                    ? { sourceRecipe: step.melody.sourceRecipe }
                    : {}),
              }),
            }),
        ...(step.melodyInstrumentOverride
          ? { melodyInstrumentOverride: step.melodyInstrumentOverride }
          : {}),
      });
    }
  const previous = [...touched].map((id) => snapshotStep(steps.find((step) => step.id === id)!));
  const nextStates = [...states.values()];
  return {
    project: applyState(project, nextStates, command.payload.nowIso),
    forward: command,
    inverse: {
      type: "melody/restore-authored-transaction",
      payload: { states: previous, nowIso: project.updatedAt },
    },
  };
}
