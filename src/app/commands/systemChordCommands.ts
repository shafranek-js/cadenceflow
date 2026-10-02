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
import {
  addRational,
  compareRational,
  divideRational,
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
export interface TransferSystemChordBoundaryCommand extends ProjectCommand<
  SystemChordPayload & {
    readonly leftStepId: string;
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

export function transferSystemChordBoundary(
  project: Project,
  command: TransferSystemChordBoundaryCommand,
): AppliedCommand {
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
  const pairEnd = addRational(starts.get(right.id)!, right.duration.beats);
  const leftEnd = addRational(pairStart, left.duration.beats);
  const minLeft = addRational(pairStart, command.payload.snapQuantum);
  const maxBoundary = subtractRational(pairEnd, command.payload.snapQuantum);
  const snappedIndex = divideRational(command.payload.boundary, command.payload.snapQuantum);
  if (
    compareRational(command.payload.snapQuantum, ZERO) <= 0 ||
    compareRational(command.payload.boundary, minLeft) < 0 ||
    compareRational(command.payload.boundary, maxBoundary) > 0 ||
    snappedIndex.denominator !== 1
  )
    throw new SystemChordCommandError(
      "invalid-boundary",
      "Both adjacent durations must remain at least one Snap unit.",
    );
  if (compareRational(command.payload.boundary, leftEnd) === 0)
    return {
      project,
      inverse: {
        type: "progression/restore",
        payload: { progression: project.progression, nowIso: command.payload.nowIso },
      },
    };
  const leftDuration = musicalDuration(subtractRational(command.payload.boundary, pairStart));
  const rightDuration = musicalDuration(subtractRational(pairEnd, command.payload.boundary));
  const next = steps.map((step, index) =>
    index === leftIndex
      ? Object.freeze({ ...step, duration: leftDuration })
      : index === leftIndex + 1
        ? Object.freeze({ ...step, duration: rightDuration })
        : step,
  );
  const affectedGenerated = new Set(
    [left, right]
      .filter(
        (step): step is ChordStep => step.kind === "chord" && step.melody?.mode === "generated",
      )
      .map((step) => step.id),
  );
  const reanchored = reanchorMelody(project, next, {
    materializeGeneratedStepIds: affectedGenerated,
  });
  return withSteps(project, reanchored, command.payload.nowIso);
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

function sameHarmonyAndPerformance(left: ChordStep, right: ChordStep): boolean {
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
  if (selected.some((step) => step.kind !== "chord")) return "Tie cannot include a Rest or gap.";
  const chords = selected as ChordStep[];
  if (chords.some((step) => !sameHarmonyAndPerformance(chords[0]!, step)))
    return "Tie requires matching harmony, spelling, voicing, performance and melody instrument.";
  const selectedIds = new Set(uniqueIds);
  if (
    (project.progression.sections ?? []).some(
      (section) => selectedIds.has(section.startStepId) && section.startStepId !== chords[0]!.id,
    )
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
  const chords = selected as ChordStep[];
  const mergedIds = new Set(uniqueIds);
  let mergedDuration = ZERO;
  for (const step of chords) mergedDuration = addRational(mergedDuration, step.duration.beats);
  const firstIndex = indices[0]!;
  const merged = Object.freeze({ ...chords[0]!, duration: musicalDuration(mergedDuration) });
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
  });
  return applyProgressionAndBranch(project, progression, temporaryBranch, command.payload.nowIso);
}
