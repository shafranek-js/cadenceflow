import { createEffectiveMelodyTimeline } from "../../domain/melody/effectiveTimeline";
import {
  snapshotAuthoredMelodyPhrase,
  snapshotChordMelody,
  type AuthoredMelodyNote,
  type AuthoredMelodyPhrase,
  type ChordMelodyRecipe,
} from "../../domain/melody/types";
import type { Project } from "../../domain/project/project";
import type { Progression } from "../../domain/progression/progression";
import type { TemporaryBranch } from "../../domain/progression/branch";
import type { ChordStep, ProgressionStep, RestStep } from "../../domain/progression/step";
import { createMatrixChordStep } from "./matrixCommands";
import type { HarmonicModuleId } from "../../domain/harmony/functions";
import type { HarmonicVariant } from "../../domain/harmony/chord";
import { musicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import type { Meter } from "../../domain/timing/meter";
import {
  addRational,
  compareRational,
  divideRational,
  multiplyRational,
  rational,
  subtractRational,
  ZERO,
  type Rational,
} from "../../domain/timing/rational";
import type { AppliedCommand, ProjectCommand } from ".";

interface SystemChordPayload {
  readonly nowIso: string;
}
export interface ReplaceSystemChordCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly stepId: string;
    readonly functionId: string;
    readonly moduleId?: HarmonicModuleId;
    readonly harmonicVariant?: HarmonicVariant;
  }
> {
  readonly type: "piano-roll/replace-chord";
}
export interface SetSystemRestCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly stepId: string;
  }
> {
  readonly type: "piano-roll/set-rest";
}
export interface SetSystemStepDurationCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly stepId: string;
    readonly duration: MusicalDuration;
  }
> {
  readonly type: "piano-roll/set-step-duration";
}
export interface ResizeSystemChordDurationCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly stepId: string;
    readonly duration: MusicalDuration;
  }
> {
  readonly type: "progression/resize-chord-duration";
}
export interface TransferSystemChordBoundaryCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly leftStepId: string;
    /** Step whose editable edge the user dragged; used as the surviving ID on a full merge. */
    readonly draggedStepId?: string;
    readonly draggedEdge?: "left" | "right";
    readonly resizeMode?: "boundary" | "isolated";
    readonly boundary: Rational;
    readonly snapQuantum: Rational;
  }
> {
  readonly type: "piano-roll/transfer-boundary";
}
export interface SplitSystemChordCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly stepId: string;
    readonly newStepId: string;
  }
> {
  readonly type: "piano-roll/split-step";
}
export interface TieSystemChordsCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly stepIds: readonly string[];
  }
> {
  readonly type: "piano-roll/tie-steps";
}

export class SystemChordCommandError extends RangeError {
  constructor(
    readonly reason:
      "unknown-step" | "invalid-boundary" | "invalid-duration" | "invalid-tie" | "invalid-id",
    message: string,
  ) {
    super(message);
    this.name = "SystemChordCommandError";
  }
}

interface AbsoluteNote {
  readonly id: string;
  readonly pitch: AuthoredMelodyNote["pitch"];
  readonly startBeats: Rational;
  readonly duration: Rational;
  readonly sourceStepId: string;
}

function startsFor(steps: readonly ProgressionStep[]): ReadonlyMap<string, Rational> {
  const starts = new Map<string, Rational>();
  let cursor = ZERO;
  for (const step of steps) {
    starts.set(step.id, cursor);
    cursor = addRational(cursor, step.duration.beats);
  }
  return starts;
}

function measureIndexAt(onset: Rational, meter: Meter): number {
  const barLength = rational(meter.numerator * 4, meter.denominator);
  return Math.floor(
    (onset.numerator * barLength.denominator) / (onset.denominator * barLength.numerator),
  );
}

function resizeRestId(
  steps: readonly ProgressionStep[],
  leftStepId: string,
  rightStepId: string | undefined,
): string {
  const base = `resize-gap:${leftStepId}:${rightStepId ?? "end"}`;
  if (!steps.some((step) => step.id === base)) return base;
  let suffix = 1;
  while (steps.some((step) => step.id === `${base}:${suffix}`)) suffix += 1;
  return `${base}:${suffix}`;
}

function sourcePhrase(step: ProgressionStep): AuthoredMelodyPhrase | undefined {
  if (step.kind === "rest") return step.authoredMelody;
  return step.melody?.mode === "authored" ? step.melody.phrase : undefined;
}

function sourceRecipe(step: ProgressionStep): ChordMelodyRecipe | undefined {
  if (step.kind === "rest") return step.authoredMelody?.sourceRecipe;
  if (step.melody?.mode === "generated") return step.melody.recipe;
  return step.melody?.mode === "authored"
    ? (step.melody.phrase.sourceRecipe ?? step.melody.sourceRecipe)
    : undefined;
}

function materializedNotes(project: Project, stepId: string): readonly AbsoluteNote[] {
  return createEffectiveMelodyTimeline(project)
    .filter((event) => event.sourceStepId === stepId)
    .map((event) => ({
      id: event.eventKey,
      pitch: event.pitch,
      startBeats: event.startBeats,
      duration: event.durationBeats,
      sourceStepId: stepId,
    }));
}

function authoredAbsoluteNotes(
  steps: readonly ProgressionStep[],
  starts: ReadonlyMap<string, Rational>,
): AbsoluteNote[] {
  const notes: AbsoluteNote[] = [];
  for (const step of steps) {
    const phrase = sourcePhrase(step);
    if (!phrase) continue;
    const start = starts.get(step.id)!;
    for (const note of phrase.notes) {
      notes.push({
        id: note.id,
        pitch: note.pitch,
        startBeats: addRational(start, note.onset),
        duration: note.duration,
        sourceStepId: step.id,
      });
    }
  }
  return notes;
}

function ownerAtOnset(
  steps: readonly ProgressionStep[],
  starts: ReadonlyMap<string, Rational>,
  onset: Rational,
): ProgressionStep {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const start = starts.get(step.id)!;
    const end = addRational(start, step.duration.beats);
    if (compareRational(onset, start) >= 0 && compareRational(onset, end) < 0) return step;
  }
  return steps.at(-1)!;
}

function collisionSafeId(id: string, stepId: string, used: Set<string>): string {
  if (!used.has(id)) return id;
  let suffix = 1;
  let candidate = `${id}~${stepId}~${suffix}`;
  while (used.has(candidate)) candidate = `${id}~${stepId}~${++suffix}`;
  return candidate;
}

/** Reassigns authored events by exact onset after a timeline topology change. */
function reanchorMelody(
  project: Project,
  nextSteps: readonly ProgressionStep[],
  options: {
    readonly materializeGeneratedStepIds?: ReadonlySet<string>;
    readonly shiftAfterStepId?: string;
    readonly shiftBy?: Rational;
    readonly fixedAbsoluteOnsets?: ReadonlyMap<string, Rational>;
  } = {},
): readonly ProgressionStep[] {
  const oldSteps = project.progression.steps;
  const oldStarts = startsFor(oldSteps);
  const nextStarts = startsFor(nextSteps);
  const shiftIndex = options.shiftAfterStepId
    ? oldSteps.findIndex((step) => step.id === options.shiftAfterStepId)
    : -1;
  const shiftBy = options.shiftBy ?? ZERO;
  const materialize = new Set(options.materializeGeneratedStepIds ?? []);
  const initialMaterialize = new Set(materialize);
  const notes = authoredAbsoluteNotes(oldSteps, oldStarts);

  for (const step of oldSteps) {
    if (
      step.kind !== "chord" ||
      step.melody?.mode !== "generated" ||
      !initialMaterialize.has(step.id)
    )
      continue;
    notes.push(...materializedNotes(project, step.id));
  }

  const eventGroups = new Map<string, AbsoluteNote[]>();
  const recipes = new Map<string, ChordMelodyRecipe | undefined>();
  const authoredOwnerIds = new Set<string>();
  const generatedDestinations = new Set<string>();
  for (const step of oldSteps) {
    if (sourcePhrase(step)) authoredOwnerIds.add(step.id);
    if (materialize.has(step.id)) authoredOwnerIds.add(step.id);
  }

  const indexedOldSteps = new Map(oldSteps.map((step, index) => [step.id, index]));
  for (const note of notes) {
    const fixedOnset = options.fixedAbsoluteOnsets?.get(`${note.sourceStepId}\u0000${note.id}`);
    const shift = shiftIndex >= 0 && (indexedOldSteps.get(note.sourceStepId) ?? -1) > shiftIndex;
    const absoluteOnset =
      fixedOnset ?? (shift ? addRational(note.startBeats, shiftBy) : note.startBeats);
    const owner = ownerAtOnset(nextSteps, nextStarts, absoluteOnset);
    const group = eventGroups.get(owner.id) ?? [];
    group.push({ ...note, startBeats: absoluteOnset });
    eventGroups.set(owner.id, group);
    if (
      owner.id !== note.sourceStepId &&
      owner.kind === "chord" &&
      owner.melody?.mode === "generated"
    ) {
      materialize.add(owner.id);
      authoredOwnerIds.add(owner.id);
      if (!initialMaterialize.has(owner.id)) generatedDestinations.add(owner.id);
    }
    const existingRecipe = recipes.get(owner.id);
    recipes.set(
      owner.id,
      existingRecipe ?? sourceRecipe(oldSteps.find((step) => step.id === note.sourceStepId)!),
    );
  }

  // If a generated destination receives an event, include its current effective
  // notes in the same authored phrase before assigning owners.
  for (const step of oldSteps) {
    if (
      step.kind !== "chord" ||
      step.melody?.mode !== "generated" ||
      !generatedDestinations.has(step.id)
    )
      continue;
    const generated = materializedNotes(project, step.id);
    for (const note of generated) {
      const sourceIndex = indexedOldSteps.get(step.id) ?? -1;
      const shifted = shiftIndex >= 0 && sourceIndex > shiftIndex;
      const absoluteOnset = shifted ? addRational(note.startBeats, shiftBy) : note.startBeats;
      const owner = ownerAtOnset(nextSteps, nextStarts, absoluteOnset);
      const group = eventGroups.get(owner.id) ?? [];
      group.push({ ...note, startBeats: absoluteOnset });
      eventGroups.set(owner.id, group);
      authoredOwnerIds.add(owner.id);
      recipes.set(owner.id, recipes.get(owner.id) ?? step.melody.recipe);
    }
  }

  return Object.freeze(
    nextSteps.map((step) => {
      const events = eventGroups.get(step.id);
      if (!events && !authoredOwnerIds.has(step.id)) return step;
      const used = new Set<string>();
      const ownerStart = nextStarts.get(step.id)!;
      const notesForStep = (events ?? [])
        .slice()
        .sort((left, right) => {
          const startOrder = compareRational(left.startBeats, right.startBeats);
          return startOrder || left.id.localeCompare(right.id);
        })
        .map((event) => {
          const id = collisionSafeId(event.id, step.id, used);
          used.add(id);
          return Object.freeze({
            id,
            pitch: event.pitch,
            onset: subtractRational(event.startBeats, ownerStart),
            duration: event.duration,
          });
        });
      const recipe = recipes.get(step.id) ?? sourceRecipe(step);
      const phrase = snapshotAuthoredMelodyPhrase({
        notes: notesForStep,
        ...(recipe ? { sourceRecipe: recipe } : {}),
      });
      if (step.kind === "rest") {
        const rest: RestStep = Object.freeze({ ...step, authoredMelody: phrase });
        return rest;
      }
      const melody = snapshotChordMelody({
        mode: "authored",
        phrase,
        ...(recipe ? { sourceRecipe: recipe } : {}),
      });
      const chord: ChordStep = Object.freeze({ ...step, melody });
      return chord;
    }),
  );
}

function effectiveGeneratedMelodyByStep(project: Project): ReadonlyMap<string, string> {
  const generatedIds = new Set(
    project.progression.steps
      .filter(
        (step): step is ChordStep => step.kind === "chord" && step.melody?.mode === "generated",
      )
      .map((step) => step.id),
  );
  const eventsByStep = new Map<string, string[]>();
  for (const event of createEffectiveMelodyTimeline(project)) {
    if (!generatedIds.has(event.sourceStepId)) continue;
    const events = eventsByStep.get(event.sourceStepId) ?? [];
    events.push(
      JSON.stringify({
        eventKey: event.eventKey,
        pitch: event.pitch,
        sourcePitchMidi: event.sourcePitchMidi,
        startBeats: event.startBeats,
        durationBeats: event.durationBeats,
        instrument: event.instrument,
      }),
    );
    eventsByStep.set(event.sourceStepId, events);
  }
  return new Map(
    [...generatedIds].map((stepId) => [stepId, JSON.stringify(eventsByStep.get(stepId) ?? [])]),
  );
}

function reanchorPreservingGeneratedMelody(
  project: Project,
  nextSteps: readonly ProgressionStep[],
  initiallyMaterialized: ReadonlySet<string>,
): readonly ProgressionStep[] {
  const firstPass = reanchorMelody(project, nextSteps, {
    materializeGeneratedStepIds: initiallyMaterialized,
  });
  const firstPassProject: Project = Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: firstPass }),
  });
  const sourceMelody = effectiveGeneratedMelodyByStep(project);
  const firstPassMelody = effectiveGeneratedMelodyByStep(firstPassProject);
  const changedGeneratedIds = new Set(
    [...firstPassMelody]
      .filter(([stepId, signature]) => sourceMelody.get(stepId) !== signature)
      .map(([stepId]) => stepId),
  );
  if (changedGeneratedIds.size === 0) return firstPass;
  return reanchorMelody(project, nextSteps, {
    materializeGeneratedStepIds: new Set([...initiallyMaterialized, ...changedGeneratedIds]),
  });
}

function applyProgression(
  project: Project,
  progression: Progression,
  nowIso: string,
): AppliedCommand {
  return {
    project: Object.freeze({ ...project, progression, updatedAt: nowIso }),
    forward: {
      type: "progression/restore",
      payload: { progression, nowIso },
    },
    inverse: {
      type: "progression/restore",
      payload: { progression: project.progression, nowIso: project.updatedAt },
    },
  };
}

function applyProgressionAndBranch(
  project: Project,
  progression: Progression,
  temporaryBranch: TemporaryBranch | undefined,
  nowIso: string,
): AppliedCommand {
  const { temporaryBranch: _previousBranch, ...projectWithoutBranch } = project;
  return {
    project: Object.freeze({
      ...projectWithoutBranch,
      progression,
      updatedAt: nowIso,
      ...(temporaryBranch ? { temporaryBranch } : {}),
    }),
    forward: {
      type: "branch/restore-state",
      payload: {
        progression,
        nowIso,
        ...(temporaryBranch ? { temporaryBranch } : {}),
      },
    },
    inverse: {
      type: "branch/restore-state",
      payload: {
        progression: project.progression,
        nowIso: project.updatedAt,
        ...(project.temporaryBranch ? { temporaryBranch: project.temporaryBranch } : {}),
      },
    },
  };
}

function withSteps(
  project: Project,
  steps: readonly ProgressionStep[],
  nowIso: string,
): AppliedCommand {
  return applyProgression(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze([...steps]) }),
    nowIso,
  );
}

export function replaceSystemChord(
  project: Project,
  command: ReplaceSystemChordCommand,
): AppliedCommand {
  const target = project.progression.steps.find((step) => step.id === command.payload.stepId);
  if (!target)
    throw new SystemChordCommandError("unknown-step", `Unknown Step ${command.payload.stepId}.`);
  const replacement = createMatrixChordStep(
    project,
    command.payload.functionId,
    target.id,
    command.payload.moduleId,
  );
  let next: ChordStep;
  if (target.kind === "rest") {
    next = Object.freeze({
      ...replacement,
      id: target.id,
      duration: target.duration,
      harmonicVariant: command.payload.harmonicVariant ?? replacement.harmonicVariant,
      ...(target.authoredMelody
        ? {
            melody: snapshotChordMelody({
              mode: "authored",
              phrase: target.authoredMelody,
              ...(target.authoredMelody.sourceRecipe
                ? { sourceRecipe: target.authoredMelody.sourceRecipe }
                : {}),
            }),
          }
        : {}),
      ...(target.melodyInstrumentOverride
        ? { melodyInstrumentOverride: target.melodyInstrumentOverride }
        : {}),
    });
  } else {
    const { explicitSpellingOverrides: _discarded, ...withoutSpelling } = target;
    next = Object.freeze({
      ...withoutSpelling,
      harmonicFunction: replacement.harmonicFunction,
      harmonicVariant: command.payload.harmonicVariant ?? replacement.harmonicVariant,
    });
    if (
      target.harmonicFunction.moduleId === next.harmonicFunction.moduleId &&
      target.harmonicFunction.functionId === next.harmonicFunction.functionId &&
      JSON.stringify(target.harmonicVariant) === JSON.stringify(next.harmonicVariant) &&
      target.explicitSpellingOverrides === undefined
    )
      return {
        project,
        inverse: {
          type: "progression/restore",
          payload: { progression: project.progression, nowIso: command.payload.nowIso },
        },
      };
  }
  return withSteps(
    project,
    project.progression.steps.map((step) => (step.id === target.id ? next : step)),
    command.payload.nowIso,
  );
}

export function setSystemRest(project: Project, command: SetSystemRestCommand): AppliedCommand {
  const target = project.progression.steps.find((step) => step.id === command.payload.stepId);
  if (!target)
    throw new SystemChordCommandError("unknown-step", `Unknown Step ${command.payload.stepId}.`);
  if (target.kind === "rest")
    return {
      project,
      inverse: {
        type: "progression/restore",
        payload: { progression: project.progression, nowIso: command.payload.nowIso },
      },
    };
  const phrase =
    target.melody?.mode === "authored"
      ? target.melody.phrase
      : target.melody?.mode === "generated"
        ? snapshotAuthoredMelodyPhrase({
            notes: materializedNotes(project, target.id).map((note) => ({
              id: note.id,
              pitch: note.pitch,
              onset: subtractRational(
                note.startBeats,
                startsFor(project.progression.steps).get(target.id)!,
              ),
              duration: note.duration,
            })),
            sourceRecipe: target.melody.recipe,
          })
        : undefined;
  const rest: RestStep = Object.freeze({
    id: target.id,
    kind: "rest",
    duration: target.duration,
    ...(phrase ? { authoredMelody: phrase } : {}),
    ...(target.melodyInstrumentOverride
      ? { melodyInstrumentOverride: target.melodyInstrumentOverride }
      : {}),
  });
  return withSteps(
    project,
    project.progression.steps.map((step) => (step.id === target.id ? rest : step)),
    command.payload.nowIso,
  );
}

export function setSystemStepDuration(
  project: Project,
  command: SetSystemStepDurationCommand,
): AppliedCommand {
  const targetIndex = project.progression.steps.findIndex(
    (step) => step.id === command.payload.stepId,
  );
  if (targetIndex < 0)
    throw new SystemChordCommandError("unknown-step", `Unknown Step ${command.payload.stepId}.`);
  const target = project.progression.steps[targetIndex]!;
  if (compareRational(command.payload.duration.beats, ZERO) <= 0)
    throw new SystemChordCommandError("invalid-duration", "Step duration must be positive.");
  if (compareRational(target.duration.beats, command.payload.duration.beats) === 0) {
    return {
      project,
      inverse: {
        type: "progression/restore",
        payload: { progression: project.progression, nowIso: command.payload.nowIso },
      },
    };
  }
  const delta = subtractRational(command.payload.duration.beats, target.duration.beats);
  const steps = project.progression.steps.map((step, index) =>
    index === targetIndex ? Object.freeze({ ...step, duration: command.payload.duration }) : step,
  );
  const reanchored = reanchorMelody(project, steps, {
    shiftAfterStepId: target.id,
    shiftBy: delta,
  });
  return withSteps(project, reanchored, command.payload.nowIso);
}

/** Resizes a chord while keeping later absolute onsets fixed outside a same-bar chord pair. */
export function resizeSystemChordDuration(
  project: Project,
  command: ResizeSystemChordDurationCommand,
): AppliedCommand {
  const steps = project.progression.steps;
  const index = steps.findIndex((step) => step.id === command.payload.stepId);
  if (index < 0)
    throw new SystemChordCommandError("unknown-step", `Unknown Step ${command.payload.stepId}.`);
  const target = steps[index]!;
  if (target.kind !== "chord")
    throw new SystemChordCommandError("invalid-duration", "Only chord Steps can be resized.");
  const newDuration = command.payload.duration.beats;
  if (compareRational(newDuration, ZERO) <= 0)
    throw new SystemChordCommandError("invalid-duration", "Step duration must be positive.");
  if (compareRational(target.duration.beats, newDuration) === 0)
    return {
      project,
      inverse: {
        type: "progression/restore",
        payload: { progression: project.progression, nowIso: command.payload.nowIso },
      },
    };

  const starts = startsFor(steps);
  const start = starts.get(target.id)!;
  const originalEnd = addRational(start, target.duration.beats);
  const next = steps[index + 1];
  const measureLength = rational(
    project.globalTiming.meter.numerator * 4,
    project.globalTiming.meter.denominator,
  );
  const measureIndex = measureIndexAt(start, project.globalTiming.meter);
  const measureEnd = multiplyRational(measureLength, rational(measureIndex + 1));
  const nextEnd = next ? addRational(originalEnd, next.duration.beats) : null;
  const sameMeasureChordPair =
    next?.kind === "chord" &&
    measureIndexAt(start, project.globalTiming.meter) ===
      measureIndexAt(originalEnd, project.globalTiming.meter) &&
    nextEnd !== null &&
    compareRational(nextEnd, measureEnd) <= 0;
  const newEnd = addRational(start, newDuration);
  const affectedGenerated = new Set<string>();
  let updatedSteps: ProgressionStep[];

  if (sameMeasureChordPair && next?.kind === "chord") {
    const nextStart = starts.get(next.id)!;
    const pairEnd = addRational(nextStart, next.duration.beats);
    const nextDuration = subtractRational(pairEnd, newEnd);
    if (compareRational(nextDuration, ZERO) <= 0)
      throw new SystemChordCommandError(
        "invalid-duration",
        "The next chord must keep a positive duration inside this measure.",
      );
    updatedSteps = steps.map((step, stepIndex) =>
      stepIndex === index
        ? Object.freeze({ ...step, duration: musicalDuration(newDuration) })
        : stepIndex === index + 1
          ? Object.freeze({ ...step, duration: musicalDuration(nextDuration) })
          : step,
    );
    if (target.melody?.mode === "generated") affectedGenerated.add(target.id);
    if (next.melody?.mode === "generated") affectedGenerated.add(next.id);
  } else {
    const delta = subtractRational(newDuration, target.duration.beats);
    const resizedTarget = Object.freeze({ ...target, duration: command.payload.duration });
    updatedSteps = [...steps.slice(0, index), resizedTarget];
    if (next?.kind === "rest") {
      const restDuration = subtractRational(next.duration.beats, delta);
      if (compareRational(restDuration, ZERO) <= 0)
        throw new SystemChordCommandError(
          "invalid-duration",
          "A resize must leave a positive explicit Rest before the following Step.",
        );
      updatedSteps.push(Object.freeze({ ...next, duration: musicalDuration(restDuration) }));
      updatedSteps.push(...steps.slice(index + 2));
    } else if (next?.kind === "chord") {
      if (compareRational(newEnd, originalEnd) > 0)
        throw new SystemChordCommandError(
          "invalid-duration",
          "The following chord keeps its absolute onset across measure boundaries.",
        );
      const gap = subtractRational(originalEnd, newEnd);
      if (compareRational(gap, ZERO) > 0) {
        updatedSteps.push(
          Object.freeze({
            id: resizeRestId(steps, target.id, next.id),
            kind: "rest" as const,
            duration: musicalDuration(gap),
            ...(target.melodyInstrumentOverride
              ? { melodyInstrumentOverride: target.melodyInstrumentOverride }
              : {}),
          }),
        );
      }
      updatedSteps.push(...steps.slice(index + 1));
    } else if (next) {
      throw new SystemChordCommandError("invalid-duration", "Unsupported following Step.");
    } else {
      if (compareRational(newEnd, originalEnd) > 0) {
        if (compareRational(newEnd, measureEnd) > 0)
          throw new SystemChordCommandError(
            "invalid-duration",
            "The final chord cannot extend beyond its measure boundary.",
          );
      } else {
        const gap = subtractRational(originalEnd, newEnd);
        updatedSteps.push(
          Object.freeze({
            id: resizeRestId(steps, target.id, undefined),
            kind: "rest" as const,
            duration: musicalDuration(gap),
            ...(target.melodyInstrumentOverride
              ? { melodyInstrumentOverride: target.melodyInstrumentOverride }
              : {}),
          }),
        );
      }
    }
    if (target.melody?.mode === "generated") affectedGenerated.add(target.id);
  }

  const reanchored = reanchorMelody(project, updatedSteps, {
    materializeGeneratedStepIds: affectedGenerated,
  });
  return withSteps(project, reanchored, command.payload.nowIso);
}

export function transferSystemChordBoundary(
  project: Project,
  command: TransferSystemChordBoundaryCommand,
): AppliedCommand {
  const resizeMode = command.payload.resizeMode ?? "boundary";
  const requestedEdge = command.payload.draggedEdge ?? "right";
  const requestedStepId = command.payload.draggedStepId ?? command.payload.leftStepId;
  if (requestedEdge === "left" && requestedStepId) {
    const draggedIndex = project.progression.steps.findIndex((step) => step.id === requestedStepId);
    const dragged = project.progression.steps[draggedIndex];
    if (draggedIndex === 0 && dragged?.kind === "chord") {
      const start = ZERO;
      const end = dragged.duration.beats;
      const minimumDuration = rational(1, 24);
      const maxBoundary = subtractRational(end, minimumDuration);
      if (
        compareRational(command.payload.snapQuantum, ZERO) <= 0 ||
        compareRational(command.payload.boundary, start) < 0 ||
        compareRational(command.payload.boundary, maxBoundary) > 0 ||
        divideRational(command.payload.boundary, command.payload.snapQuantum).denominator !== 1
      )
        throw new SystemChordCommandError(
          "invalid-boundary",
          "The left edge must leave at least 1/24 beat of chord duration.",
        );
      if (compareRational(command.payload.boundary, start) === 0)
        return {
          project,
          inverse: {
            type: "progression/restore",
            payload: { progression: project.progression, nowIso: command.payload.nowIso },
          },
        };
      const gap = subtractRational(command.payload.boundary, start);
      const resized = Object.freeze({
        ...dragged,
        duration: musicalDuration(subtractRational(end, command.payload.boundary)),
      });
      const leadingRest: RestStep = Object.freeze({
        id: resizeRestId(project.progression.steps, "start", dragged.id),
        kind: "rest",
        duration: musicalDuration(gap),
        ...(dragged.melodyInstrumentOverride
          ? { melodyInstrumentOverride: dragged.melodyInstrumentOverride }
          : {}),
      });
      const generated =
        dragged.melody?.mode === "generated" ? new Set([dragged.id]) : new Set<string>();
      const reanchored = reanchorMelody(
        project,
        [leadingRest, resized, ...project.progression.steps.slice(1)],
        {
          materializeGeneratedStepIds: generated,
        },
      );
      return withSteps(project, reanchored, command.payload.nowIso);
    }
  }
  if (requestedEdge === "right" && requestedStepId) {
    const draggedIndex = project.progression.steps.findIndex((step) => step.id === requestedStepId);
    const dragged = project.progression.steps[draggedIndex];
    if (draggedIndex === project.progression.steps.length - 1 && dragged?.kind === "chord") {
      const start = startsFor(project.progression.steps).get(dragged.id)!;
      const end = addRational(start, dragged.duration.beats);
      const minBoundary = addRational(start, rational(1, 24));
      if (
        compareRational(command.payload.snapQuantum, ZERO) <= 0 ||
        compareRational(command.payload.boundary, minBoundary) < 0 ||
        compareRational(command.payload.boundary, end) > 0 ||
        divideRational(command.payload.boundary, command.payload.snapQuantum).denominator !== 1
      )
        throw new SystemChordCommandError(
          "invalid-boundary",
          "The right edge must leave at least 1/24 beat of chord duration.",
        );
      if (compareRational(command.payload.boundary, end) === 0)
        return {
          project,
          inverse: {
            type: "progression/restore",
            payload: { progression: project.progression, nowIso: command.payload.nowIso },
          },
        };
      const resized = Object.freeze({
        ...dragged,
        duration: musicalDuration(subtractRational(command.payload.boundary, start)),
      });
      const trailingRest: RestStep = Object.freeze({
        id: resizeRestId(project.progression.steps, dragged.id, undefined),
        kind: "rest",
        duration: musicalDuration(subtractRational(end, command.payload.boundary)),
        ...(dragged.melodyInstrumentOverride
          ? { melodyInstrumentOverride: dragged.melodyInstrumentOverride }
          : {}),
      });
      const generated =
        dragged.melody?.mode === "generated" ? new Set([dragged.id]) : new Set<string>();
      const reanchored = reanchorMelody(
        project,
        [...project.progression.steps.slice(0, -1), resized, trailingRest],
        { materializeGeneratedStepIds: generated },
      );
      return withSteps(project, reanchored, command.payload.nowIso);
    }
  }
  const leftIndex = project.progression.steps.findIndex(
    (step) => step.id === command.payload.leftStepId,
  );
  if (leftIndex < 0 || leftIndex + 1 >= project.progression.steps.length)
    throw new SystemChordCommandError(
      "invalid-boundary",
      "The selected Step has no adjacent boundary here.",
    );
  const steps = project.progression.steps;
  const left = steps[leftIndex]!;
  const right = steps[leftIndex + 1]!;
  const starts = startsFor(steps);
  const pairStart = starts.get(left.id)!;
  const originalBoundary = starts.get(right.id)!;
  const pairEnd = addRational(originalBoundary, right.duration.beats);
  const leftEnd = addRational(pairStart, left.duration.beats);
  const barLength = rational(
    project.globalTiming.meter.numerator * 4,
    project.globalTiming.meter.denominator,
  );
  const measureEnd = multiplyRational(
    barLength,
    rational(measureIndexAt(pairStart, project.globalTiming.meter) + 1),
  );
  const boundaryMeasureStart = multiplyRational(
    barLength,
    rational(measureIndexAt(originalBoundary, project.globalTiming.meter)),
  );
  const boundaryMeasureEnd = addRational(boundaryMeasureStart, barLength);
  const sameMeasureChordPair =
    left.kind === "chord" &&
    right.kind === "chord" &&
    measureIndexAt(pairStart, project.globalTiming.meter) ===
      measureIndexAt(originalBoundary, project.globalTiming.meter) &&
    compareRational(pairEnd, measureEnd) <= 0;
  const sameMeasurePair =
    measureIndexAt(pairStart, project.globalTiming.meter) ===
      measureIndexAt(originalBoundary, project.globalTiming.meter) &&
    compareRational(pairEnd, measureEnd) <= 0;
  const crossMeasureChordPair =
    left.kind === "chord" && right.kind === "chord" && !sameMeasureChordPair;
  const minimumDuration = rational(1, 24);
  const transferMinimumDuration =
    compareRational(command.payload.snapQuantum, minimumDuration) > 0
      ? command.payload.snapQuantum
      : minimumDuration;
  const leftIsChord = left.kind === "chord";
  const rightIsChord = right.kind === "chord";
  const hasInternalSectionBoundary = (project.progression.sections ?? []).some(
    (section) => section.startStepId === right.id,
  );
  const canFullyMerge = !hasInternalSectionBoundary;
  const canFullyConsumeChord = sameMeasureChordPair;
  const identicalChordPair =
    sameMeasureChordPair && leftIsChord && rightIsChord && sameSystemChordIdentity(left, right);
  const draggedStepId = command.payload.draggedStepId ?? left.id;
  const draggedEdge = requestedEdge;
  const isLeftEdgeOfRightChord = draggedEdge === "left" && draggedStepId === right.id;
  const isRightEdgeOfLeftChord = draggedEdge === "right" && draggedStepId === left.id;
  const leftRestExtensionStart =
    compareRational(pairStart, boundaryMeasureStart) > 0 ? pairStart : boundaryMeasureStart;
  const rightRestExtensionEnd =
    compareRational(pairEnd, boundaryMeasureEnd) < 0 ? pairEnd : boundaryMeasureEnd;
  const leftRestCanExtend =
    left.kind === "rest" && compareRational(originalBoundary, leftRestExtensionStart) > 0;
  const rightRestCanExtend =
    right.kind === "rest" && compareRational(rightRestExtensionEnd, originalBoundary) > 0;
  const canExtendLeft =
    leftRestCanExtend ||
    (sameMeasurePair && left.kind === "chord" && (resizeMode === "boundary" || identicalChordPair));
  const canExtendRight =
    rightRestCanExtend ||
    (sameMeasurePair &&
      right.kind === "chord" &&
      (resizeMode === "boundary" || identicalChordPair));
  const isLeftEdgeShrink =
    isLeftEdgeOfRightChord && compareRational(command.payload.boundary, originalBoundary) > 0;
  const isRightEdgeShrink =
    isRightEdgeOfLeftChord && compareRational(command.payload.boundary, originalBoundary) < 0;
  const isRightEdgeExpand =
    isRightEdgeOfLeftChord && compareRational(command.payload.boundary, originalBoundary) > 0;
  if (draggedStepId !== left.id && draggedStepId !== right.id)
    throw new SystemChordCommandError(
      "invalid-boundary",
      "The dragged Step is not adjacent to this boundary.",
    );
  if (
    isLeftEdgeOfRightChord &&
    compareRational(command.payload.boundary, originalBoundary) < 0 &&
    !canExtendLeft
  )
    throw new SystemChordCommandError(
      "invalid-boundary",
      "The left edge cannot extend into the adjacent Step at the current resize mode or measure boundary.",
    );
  if (isRightEdgeExpand && !canExtendRight)
    throw new SystemChordCommandError(
      "invalid-boundary",
      "The right edge cannot extend into the adjacent Step at the current resize mode or measure boundary.",
    );
  let minBoundary = addRational(pairStart, leftIsChord ? minimumDuration : ZERO);
  let maxBoundary = subtractRational(pairEnd, rightIsChord ? minimumDuration : ZERO);
  if (isLeftEdgeOfRightChord) {
    minBoundary = canExtendLeft
      ? left.kind === "rest"
        ? leftRestExtensionStart
        : sameMeasureChordPair
          ? pairStart
          : addRational(pairStart, transferMinimumDuration)
      : originalBoundary;
  }
  if (isRightEdgeOfLeftChord) {
    maxBoundary = canExtendRight
      ? right.kind === "rest"
        ? canFullyMerge || compareRational(rightRestExtensionEnd, pairEnd) < 0
          ? rightRestExtensionEnd
          : subtractRational(pairEnd, minimumDuration)
        : sameMeasureChordPair
          ? pairEnd
          : subtractRational(pairEnd, transferMinimumDuration)
      : originalBoundary;
  } else if (crossMeasureChordPair && !isLeftEdgeShrink) {
    maxBoundary = originalBoundary;
  } else if (left.kind === "chord" && right.kind === "rest" && !canExtendRight) {
    maxBoundary = originalBoundary;
  } else if (sameMeasurePair && left.kind === "rest" && rightIsChord) {
    minBoundary = canFullyMerge ? pairStart : addRational(pairStart, minimumDuration);
  }
  const snappedIndex = divideRational(command.payload.boundary, command.payload.snapQuantum);
  if (
    compareRational(command.payload.snapQuantum, ZERO) <= 0 ||
    compareRational(command.payload.boundary, minBoundary) < 0 ||
    compareRational(command.payload.boundary, maxBoundary) > 0 ||
    snappedIndex.denominator !== 1
  )
    throw new SystemChordCommandError(
      "invalid-boundary",
      "The boundary must preserve a chord duration of at least 1/24 beat inside its editable measure.",
    );
  if (compareRational(command.payload.boundary, leftEnd) === 0)
    return {
      project,
      inverse: {
        type: "progression/restore",
        payload: { progression: project.progression, nowIso: command.payload.nowIso },
      },
    };
  const leftDurationBeats = subtractRational(command.payload.boundary, pairStart);
  let next: ProgressionStep[];
  const affectedGenerated = new Set<string>();
  if (
    isLeftEdgeShrink &&
    (resizeMode === "isolated" || crossMeasureChordPair || left.kind === "rest")
  ) {
    const rightDuration = musicalDuration(subtractRational(pairEnd, command.payload.boundary));
    if (left.kind === "rest") {
      next = steps.map((step, index) =>
        index === leftIndex
          ? Object.freeze({ ...step, duration: musicalDuration(leftDurationBeats) })
          : index === leftIndex + 1
            ? Object.freeze({ ...step, duration: rightDuration })
            : step,
      );
    } else {
      const gap: RestStep = Object.freeze({
        id: resizeRestId(steps, left.id, right.id),
        kind: "rest",
        duration: musicalDuration(subtractRational(command.payload.boundary, originalBoundary)),
        ...(right.melodyInstrumentOverride
          ? { melodyInstrumentOverride: right.melodyInstrumentOverride }
          : {}),
      });
      next = [
        ...steps.slice(0, leftIndex + 1),
        gap,
        Object.freeze({ ...right, duration: rightDuration }),
        ...steps.slice(leftIndex + 2),
      ];
    }
    if (right.kind === "chord" && right.melody?.mode === "generated")
      affectedGenerated.add(right.id);
  } else if (
    isRightEdgeShrink &&
    (resizeMode === "isolated" || crossMeasureChordPair || right.kind === "rest")
  ) {
    const leftDuration = musicalDuration(leftDurationBeats);
    if (right.kind === "rest") {
      const rightDuration = musicalDuration(subtractRational(pairEnd, command.payload.boundary));
      next = steps.map((step, index) =>
        index === leftIndex
          ? Object.freeze({ ...step, duration: leftDuration })
          : index === leftIndex + 1
            ? Object.freeze({ ...step, duration: rightDuration })
            : step,
      );
    } else {
      const gap: RestStep = Object.freeze({
        id: resizeRestId(steps, left.id, right.id),
        kind: "rest",
        duration: musicalDuration(subtractRational(originalBoundary, command.payload.boundary)),
        ...(left.kind === "chord" && left.melodyInstrumentOverride
          ? { melodyInstrumentOverride: left.melodyInstrumentOverride }
          : {}),
      });
      next = [
        ...steps.slice(0, leftIndex),
        Object.freeze({ ...left, duration: leftDuration }),
        gap,
        Object.freeze({ ...right, duration: musicalDuration(right.duration.beats) }),
        ...steps.slice(leftIndex + 2),
      ];
    }
    if (left.kind === "chord" && left.melody?.mode === "generated") affectedGenerated.add(left.id);
  } else if (sameMeasureChordPair) {
    if (canFullyConsumeChord && compareRational(command.payload.boundary, pairEnd) === 0) {
      if (draggedStepId !== left.id)
        throw new SystemChordCommandError(
          "invalid-boundary",
          "This edge cannot remove the adjacent chord.",
        );
      const merged = Object.freeze({
        ...left,
        duration: musicalDuration(subtractRational(pairEnd, pairStart)),
      });
      next = [...steps.slice(0, leftIndex), merged, ...steps.slice(leftIndex + 2)];
      for (const step of [left, right])
        if (step.kind === "chord" && step.melody?.mode === "generated")
          affectedGenerated.add(step.id);
      return applyFullyMergedBoundaryPair(
        project,
        next,
        left.id,
        right.id,
        merged.id,
        affectedGenerated,
        command.payload.nowIso,
      );
    }
    if (canFullyConsumeChord && compareRational(command.payload.boundary, pairStart) === 0) {
      if (draggedStepId !== right.id)
        throw new SystemChordCommandError(
          "invalid-boundary",
          "This edge cannot remove the adjacent chord.",
        );
      const merged = Object.freeze({
        ...right,
        duration: musicalDuration(subtractRational(pairEnd, pairStart)),
      });
      next = [...steps.slice(0, leftIndex), merged, ...steps.slice(leftIndex + 2)];
      for (const step of [left, right])
        if (step.kind === "chord" && step.melody?.mode === "generated")
          affectedGenerated.add(step.id);
      return applyFullyMergedBoundaryPair(
        project,
        next,
        left.id,
        right.id,
        merged.id,
        affectedGenerated,
        command.payload.nowIso,
      );
    }
    const rightDuration = musicalDuration(subtractRational(pairEnd, command.payload.boundary));
    next = steps.map((step, index) =>
      index === leftIndex
        ? Object.freeze({ ...step, duration: musicalDuration(leftDurationBeats) })
        : index === leftIndex + 1
          ? Object.freeze({ ...step, duration: rightDuration })
          : step,
    );
    for (const step of [left, right])
      if (step.kind === "chord" && step.melody?.mode === "generated")
        affectedGenerated.add(step.id);
  } else if (right.kind === "rest" && sameMeasurePair) {
    if (compareRational(command.payload.boundary, pairEnd) === 0 && left.kind === "chord") {
      if (!canFullyMerge || draggedStepId !== left.id)
        throw new SystemChordCommandError(
          "invalid-boundary",
          "This edge cannot remove the adjacent Rest.",
        );
      const merged = Object.freeze({
        ...left,
        duration: musicalDuration(subtractRational(pairEnd, pairStart)),
      });
      next = [...steps.slice(0, leftIndex), merged, ...steps.slice(leftIndex + 2)];
      if (left.melody?.mode === "generated") affectedGenerated.add(left.id);
      return applyFullyMergedBoundaryPair(
        project,
        next,
        left.id,
        right.id,
        merged.id,
        affectedGenerated,
        command.payload.nowIso,
      );
    }
    const rightDuration = musicalDuration(subtractRational(pairEnd, command.payload.boundary));
    next =
      compareRational(rightDuration.beats, ZERO) === 0
        ? [
            ...steps.slice(0, leftIndex),
            Object.freeze({ ...left, duration: musicalDuration(leftDurationBeats) }),
            ...steps.slice(leftIndex + 2),
          ]
        : steps.map((step, index) =>
            index === leftIndex
              ? Object.freeze({ ...step, duration: musicalDuration(leftDurationBeats) })
              : index === leftIndex + 1
                ? Object.freeze({ ...step, duration: rightDuration })
                : step,
          );
    if (left.kind === "chord" && left.melody?.mode === "generated") affectedGenerated.add(left.id);
  } else if (right.kind === "rest") {
    const rightDuration = musicalDuration(subtractRational(pairEnd, command.payload.boundary));
    next = steps.map((step, index) =>
      index === leftIndex
        ? Object.freeze({ ...step, duration: musicalDuration(leftDurationBeats) })
        : index === leftIndex + 1
          ? Object.freeze({ ...step, duration: rightDuration })
          : step,
    );
    if (left.kind === "chord" && left.melody?.mode === "generated") affectedGenerated.add(left.id);
  } else if (left.kind === "rest" && right.kind === "chord" && canExtendLeft) {
    if (compareRational(command.payload.boundary, pairStart) === 0) {
      if (!canFullyMerge || draggedStepId !== right.id)
        throw new SystemChordCommandError(
          "invalid-boundary",
          "This edge cannot remove the adjacent Rest.",
        );
      const merged = Object.freeze({
        ...right,
        duration: musicalDuration(subtractRational(pairEnd, pairStart)),
      });
      next = [...steps.slice(0, leftIndex), merged, ...steps.slice(leftIndex + 2)];
      if (right.melody?.mode === "generated") affectedGenerated.add(right.id);
      return applyFullyMergedBoundaryPair(
        project,
        next,
        left.id,
        right.id,
        merged.id,
        affectedGenerated,
        command.payload.nowIso,
      );
    }
    const rightDuration = musicalDuration(subtractRational(pairEnd, command.payload.boundary));
    next =
      compareRational(leftDurationBeats, ZERO) === 0
        ? [
            ...steps.slice(0, leftIndex),
            Object.freeze({ ...right, duration: rightDuration }),
            ...steps.slice(leftIndex + 2),
          ]
        : steps.map((step, index) =>
            index === leftIndex
              ? Object.freeze({ ...step, duration: musicalDuration(leftDurationBeats) })
              : index === leftIndex + 1
                ? Object.freeze({ ...step, duration: rightDuration })
                : step,
          );
    if (right.melody?.mode === "generated") affectedGenerated.add(right.id);
  } else if (left.kind === "rest" && right.kind === "chord" && !isLeftEdgeShrink) {
    throw new SystemChordCommandError(
      "invalid-boundary",
      "A chord starting in a new measure has no editable left resize edge.",
    );
  } else {
    if (left.kind !== "chord" || compareRational(command.payload.boundary, originalBoundary) > 0)
      throw new SystemChordCommandError(
        "invalid-boundary",
        "A chord across a measure boundary can only shorten into an explicit Rest gap.",
      );
    const gap = subtractRational(originalBoundary, command.payload.boundary);
    const resizedLeft = Object.freeze({ ...left, duration: musicalDuration(leftDurationBeats) });
    next = [...steps.slice(0, leftIndex), resizedLeft];
    if (compareRational(gap, ZERO) > 0) {
      const rest: RestStep = Object.freeze({
        id: resizeRestId(steps, left.id, right.id),
        kind: "rest",
        duration: musicalDuration(gap),
        ...(left.kind === "chord" && left.melodyInstrumentOverride
          ? { melodyInstrumentOverride: left.melodyInstrumentOverride }
          : {}),
      });
      next.push(rest);
    }
    next.push(...steps.slice(leftIndex + 1));
    if (left.melody?.mode === "generated") affectedGenerated.add(left.id);
  }
  const reanchored = reanchorMelody(project, next, {
    materializeGeneratedStepIds: affectedGenerated,
  });
  return withSteps(project, reanchored, command.payload.nowIso);
}

function applyFullyMergedBoundaryPair(
  project: Project,
  nextSteps: readonly ProgressionStep[],
  leftId: string,
  rightId: string,
  retainedId: string,
  generated: ReadonlySet<string>,
  nowIso: string,
): AppliedCommand {
  const reanchored = reanchorPreservingGeneratedMelody(project, nextSteps, generated);
  const mergedIds = new Set([leftId, rightId]);
  const selectedStepId = project.progression.selectedStepId;
  const loopRegion = project.progression.loopRegion
    ? Object.freeze({
        startStepId: mergedIds.has(project.progression.loopRegion.startStepId)
          ? retainedId
          : project.progression.loopRegion.startStepId,
        endStepId: mergedIds.has(project.progression.loopRegion.endStepId)
          ? retainedId
          : project.progression.loopRegion.endStepId,
      })
    : undefined;
  const sections = project.progression.sections?.map((section) =>
    section.startStepId === leftId || section.startStepId === rightId
      ? Object.freeze({ ...section, startStepId: retainedId })
      : section,
  );
  const progression: Progression = Object.freeze({
    ...project.progression,
    steps: reanchored,
    ...(selectedStepId && mergedIds.has(selectedStepId) ? { selectedStepId: retainedId } : {}),
    ...(loopRegion ? { loopRegion } : {}),
    ...(sections ? { sections: Object.freeze(sections) } : {}),
  });
  const branch = project.temporaryBranch
    ? (() => {
        const current = project.temporaryBranch!;
        const { rejoinStepId, ...rest } = current;
        const nextStepId = project.progression.steps.find((step) => step.id === rightId)
          ? project.progression.steps[
              project.progression.steps.findIndex((step) => step.id === rightId) + 1
            ]?.id
          : undefined;
        const nextRejoinStepId =
          rejoinStepId && mergedIds.has(rejoinStepId) ? nextStepId : rejoinStepId;
        return Object.freeze({
          ...rest,
          ...(current.originStepId && mergedIds.has(current.originStepId)
            ? { originStepId: retainedId }
            : {}),
          ...(nextRejoinStepId ? { rejoinStepId: nextRejoinStepId } : {}),
        });
      })()
    : undefined;
  return applyProgressionAndBranch(project, progression, branch, nowIso);
}

function uniqueStepId(project: Project, requested: string): string {
  if (!requested.trim() || project.progression.steps.some((step) => step.id === requested))
    throw new SystemChordCommandError(
      "invalid-id",
      `Step ID ${requested || "(empty)"} is invalid or already used.`,
    );
  return requested;
}

export function splitSystemStep(
  project: Project,
  command: SplitSystemChordCommand,
): AppliedCommand {
  const index = project.progression.steps.findIndex((step) => step.id === command.payload.stepId);
  if (index < 0)
    throw new SystemChordCommandError("unknown-step", `Unknown Step ${command.payload.stepId}.`);
  const source = project.progression.steps[index]!;
  const newId = uniqueStepId(project, command.payload.newStepId);
  const half = musicalDuration(divideRational(source.duration.beats, rational(2)));
  const first = Object.freeze({ ...source, duration: half }) as ProgressionStep;
  const second =
    source.kind === "rest"
      ? (() => {
          const { authoredMelody: _melody, ...rest } = source;
          return Object.freeze({ ...rest, id: newId, duration: half }) as RestStep;
        })()
      : (() => {
          const { melody: _melody, ...chord } = source;
          return Object.freeze({ ...chord, id: newId, duration: half }) as ChordStep;
        })();
  const next = [
    ...project.progression.steps.slice(0, index),
    first,
    second,
    ...project.progression.steps.slice(index + 1),
  ];
  const generated =
    source.kind === "chord" && source.melody?.mode === "generated"
      ? new Set([source.id])
      : new Set<string>();
  const reanchored = [...reanchorMelody(project, next, { materializeGeneratedStepIds: generated })];
  const recipe = sourceRecipe(source);
  const hasMelody =
    sourcePhrase(source) !== undefined ||
    (source.kind === "chord" && source.melody?.mode === "generated");
  if (hasMelody) {
    const secondIndex = reanchored.findIndex((step) => step.id === newId);
    const secondStep = reanchored[secondIndex]!;
    if (secondStep.kind === "rest" && !secondStep.authoredMelody) {
      reanchored[secondIndex] = Object.freeze({
        ...secondStep,
        authoredMelody: snapshotAuthoredMelodyPhrase({
          notes: [],
          ...(recipe ? { sourceRecipe: recipe } : {}),
        }),
      });
    } else if (secondStep.kind === "chord" && !secondStep.melody) {
      reanchored[secondIndex] = Object.freeze({
        ...secondStep,
        melody: snapshotChordMelody({
          mode: "authored",
          phrase: { notes: [], ...(recipe ? { sourceRecipe: recipe } : {}) },
          ...(recipe ? { sourceRecipe: recipe } : {}),
        }),
      });
    }
  }
  return withSteps(project, reanchored, command.payload.nowIso);
}

export function sameSystemChordIdentity(left: ChordStep, right: ChordStep): boolean {
  return (
    left.harmonicFunction.moduleId === right.harmonicFunction.moduleId &&
    left.harmonicFunction.functionId === right.harmonicFunction.functionId &&
    JSON.stringify(left.harmonicVariant) === JSON.stringify(right.harmonicVariant) &&
    JSON.stringify(left.explicitSpellingOverrides ?? {}) ===
      JSON.stringify(right.explicitSpellingOverrides ?? {}) &&
    JSON.stringify(left.performance) === JSON.stringify(right.performance) &&
    left.melodyInstrumentOverride === right.melodyInstrumentOverride
  );
}

export function systemTieDisabledReason(
  project: Project,
  stepIds: readonly string[],
): string | null {
  const uniqueIds = [...new Set(stepIds)];
  if (uniqueIds.length < 2) return "Select at least two Steps to tie.";
  if (uniqueIds.length !== stepIds.length)
    return "The selection contains the same Step more than once.";
  const indices = uniqueIds.map((id) =>
    project.progression.steps.findIndex((step) => step.id === id),
  );
  if (indices.some((index) => index < 0)) return "One of the selected Steps no longer exists.";
  const sorted = [...indices].sort((a, b) => a - b);
  if (sorted.some((index, offset) => offset > 0 && index !== sorted[offset - 1]! + 1))
    return "Tie is available only for contiguous Steps.";
  const selected = sorted.map((index) => project.progression.steps[index]!);
  const chords = selected.filter((step): step is ChordStep => step.kind === "chord");
  const rests = selected.filter((step) => step.kind === "rest");
  const starts = startsFor(project.progression.steps);
  if (rests.length) {
    if (selected.length !== 2 || chords.length !== 1 || rests.length !== 1)
      return "Tie can include exactly one chord and one adjacent Rest.";
    const start = starts.get(selected[0]!.id)!;
    const chordStart = starts.get(selected[1]!.id)!;
    const pairEnd = addRational(chordStart, selected[1]!.duration.beats);
    const barLength = rational(
      project.globalTiming.meter.numerator * 4,
      project.globalTiming.meter.denominator,
    );
    const measureEnd = multiplyRational(
      barLength,
      rational(measureIndexAt(start, project.globalTiming.meter) + 1),
    );
    if (
      measureIndexAt(start, project.globalTiming.meter) !==
        measureIndexAt(chordStart, project.globalTiming.meter) ||
      compareRational(pairEnd, measureEnd) > 0
    )
      return "Tie between a chord and Rest must stay inside one measure.";
  }
  if (chords.length > 1 && chords.some((step) => !sameSystemChordIdentity(chords[0]!, step)))
    return "Tie requires matching harmony, spelling, voicing, performance and melody instrument.";
  const internalStepId = selected[1]?.id;
  if (
    (project.progression.sections ?? []).some((section) => section.startStepId === internalStepId)
  )
    return "Tie cannot cross an internal Song Section boundary.";
  return null;
}

export function tieSystemSteps(project: Project, command: TieSystemChordsCommand): AppliedCommand {
  const requestedIds = command.payload.stepIds;
  const uniqueIds = [...new Set(requestedIds)];
  const disabledReason = systemTieDisabledReason(project, requestedIds);
  if (disabledReason) throw new SystemChordCommandError("invalid-tie", disabledReason);
  const indices = uniqueIds
    .map((id) => project.progression.steps.findIndex((step) => step.id === id))
    .sort((a, b) => a - b);
  const steps = project.progression.steps;
  const selected = indices.map((index) => steps[index]!);
  const chords = selected.filter((step): step is ChordStep => step.kind === "chord");
  const retainedChord = chords[0]!;
  const mergedIds = new Set(uniqueIds);
  let mergedDuration = ZERO;
  for (const step of selected) mergedDuration = addRational(mergedDuration, step.duration.beats);
  const firstIndex = indices[0]!;
  const merged = Object.freeze({ ...retainedChord, duration: musicalDuration(mergedDuration) });
  const next = [...steps.slice(0, firstIndex), merged, ...steps.slice(indices.at(-1)! + 1)];
  const generated = new Set(
    chords.filter((step) => step.melody?.mode === "generated").map((step) => step.id),
  );
  const reanchored = reanchorMelody(project, next, { materializeGeneratedStepIds: generated });
  const selectedStepId = project.progression.selectedStepId;
  const loopRegion = project.progression.loopRegion
    ? {
        startStepId: mergedIds.has(project.progression.loopRegion.startStepId)
          ? merged.id
          : project.progression.loopRegion.startStepId,
        endStepId: mergedIds.has(project.progression.loopRegion.endStepId)
          ? merged.id
          : project.progression.loopRegion.endStepId,
      }
    : undefined;
  const temporaryBranch = project.temporaryBranch
    ? (() => {
        const branch = project.temporaryBranch!;
        const { rejoinStepId, ...branchWithoutRejoin } = branch;
        const nextAfterTie = steps[indices.at(-1)! + 1]?.id;
        const nextRejoinStepId =
          rejoinStepId && mergedIds.has(rejoinStepId) ? nextAfterTie : rejoinStepId;
        return Object.freeze({
          ...branchWithoutRejoin,
          ...(branch.originStepId
            ? {
                originStepId: mergedIds.has(branch.originStepId) ? merged.id : branch.originStepId,
              }
            : {}),
          ...(nextRejoinStepId ? { rejoinStepId: nextRejoinStepId } : {}),
        });
      })()
    : undefined;
  const progression: Progression = Object.freeze({
    ...project.progression,
    steps: reanchored,
    ...(selectedStepId && mergedIds.has(selectedStepId) ? { selectedStepId: merged.id } : {}),
    ...(loopRegion ? { loopRegion: Object.freeze(loopRegion) } : {}),
    ...(project.progression.sections
      ? {
          sections: Object.freeze(
            project.progression.sections.map((section) =>
              section.startStepId !== merged.id && mergedIds.has(section.startStepId)
                ? Object.freeze({ ...section, startStepId: merged.id })
                : section,
            ),
          ),
        }
      : {}),
  });
  return applyProgressionAndBranch(project, progression, temporaryBranch, command.payload.nowIso);
}
