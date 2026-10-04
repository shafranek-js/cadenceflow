import type { AuthoredMelodyEdit } from "../../app/commands/authoredMelodyTransaction";
import type { ExactPitch } from "../../domain/harmony/pitch";
import { assertMidiNumber, exactPitch } from "../../domain/harmony/pitch";
import {
  createEffectiveMelodyTimeline,
  type EffectiveMelodyNote,
} from "../../domain/melody/effectiveTimeline";
import { resolveEffectiveMelodyInstrument } from "../../domain/melody/instrumentCatalog";
import type { Project } from "../../domain/project/project";
import type { RestStep } from "../../domain/progression/step";
import { musicalDuration } from "../../domain/timing/duration";
import { measureLengthBeats } from "../../domain/timing/measureLayout";
import type { Rational } from "../../domain/timing/rational";
import {
  addRational,
  compareRational,
  divideRational,
  multiplyRational,
  rational,
  subtractRational,
  ZERO,
} from "../../domain/timing/rational";

export interface PianoRollNoteIdentity {
  readonly sourceStepId: string;
  readonly eventKey: string;
}

export interface PianoRollGroupMoveChange extends PianoRollNoteIdentity {
  readonly pitch: ExactPitch;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
}

export interface PianoRollClipboardEntry {
  readonly pitch: ExactPitch;
  readonly onset: Rational;
  readonly duration: Rational;
  readonly instrument: EffectiveMelodyNote["instrument"];
}

export interface PianoRollGroupEditPlan {
  readonly edits: readonly AuthoredMelodyEdit[];
  readonly selection: readonly PianoRollNoteIdentity[];
  readonly appendedSteps?: readonly RestStep[];
}

export function pianoRollNoteIdentity(sourceStepId: string, eventKey: string): string {
  return JSON.stringify([sourceStepId, eventKey]);
}

export function parsePianoRollNoteIdentity(value: string): PianoRollNoteIdentity | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    )
      return { sourceStepId: parsed[0], eventKey: parsed[1] };
  } catch {
    return null;
  }
  return null;
}

export function pianoRollRectanglesIntersect(
  left: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  right: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
): boolean {
  return (
    left.right >= right.left &&
    left.left <= right.right &&
    left.bottom >= right.top &&
    left.top <= right.bottom
  );
}

function stepPhraseIds(project: Project, stepId: string, timeline: readonly EffectiveMelodyNote[]) {
  const step = project.progression.steps.find((candidate) => candidate.id === stepId);
  if (!step) return [];
  if (step.kind === "rest") return step.authoredMelody?.notes.map((note) => note.id) ?? [];
  if (step.melody?.mode === "authored") return step.melody.phrase.notes.map((note) => note.id);
  if (step.melody?.mode === "generated")
    return timeline.filter((note) => note.sourceStepId === stepId).map((note) => note.eventKey);
  return [];
}

function locateStep(project: Project, startBeats: Rational) {
  let cursor = ZERO;
  for (const step of project.progression.steps) {
    const end = addRational(cursor, step.duration.beats);
    if (compareRational(startBeats, end) < 0) return step;
    cursor = end;
  }
  return undefined;
}

function progressionEnd(project: Project): Rational {
  return project.progression.steps.reduce(
    (end, step) => addRational(end, step.duration.beats),
    ZERO,
  );
}

function sameEffectiveMelodyTimeline(
  left: readonly EffectiveMelodyNote[],
  right: readonly EffectiveMelodyNote[],
): boolean {
  return (
    left.length === right.length &&
    left.every((note, index) => {
      const candidate = right[index];
      return (
        candidate !== undefined &&
        note.sourceStepId === candidate.sourceStepId &&
        note.eventKey === candidate.eventKey &&
        note.pitch.midiNumber === candidate.pitch.midiNumber &&
        note.pitch.spelling.step === candidate.pitch.spelling.step &&
        note.pitch.spelling.alter === candidate.pitch.spelling.alter &&
        note.sourcePitchMidi === candidate.sourcePitchMidi &&
        compareRational(note.startBeats, candidate.startBeats) === 0 &&
        compareRational(note.durationBeats, candidate.durationBeats) === 0 &&
        note.instrument === candidate.instrument
      );
    })
  );
}

function effectiveInstrument(project: Project, stepId: string) {
  const step = project.progression.steps.find((candidate) => candidate.id === stepId);
  if (!step) return undefined;
  return resolveEffectiveMelodyInstrument(
    step.melodyInstrumentOverride,
    project.melodyTrack.instrument,
  ).id;
}

export function planPianoRollGroupMove(
  project: Project,
  changes: readonly PianoRollGroupMoveChange[],
): PianoRollGroupEditPlan {
  if (!changes.length) return { edits: [], selection: [] };
  const timeline = createEffectiveMelodyTimeline(project);
  const timelineByIdentity = new Map(
    timeline.map((note) => [pianoRollNoteIdentity(note.sourceStepId, note.eventKey), note]),
  );
  const usedIdentities = new Set<string>();
  const endOfProgression = progressionEnd(project);
  const proposed = changes.map((change) => {
    const identity = pianoRollNoteIdentity(change.sourceStepId, change.eventKey);
    if (usedIdentities.has(identity))
      throw new Error("A selected Melody note appears more than once.");
    usedIdentities.add(identity);
    const source = timelineByIdentity.get(identity);
    if (!source) throw new Error("The selected Melody changed before the group edit could commit.");
    try {
      assertMidiNumber(change.pitch.midiNumber);
    } catch {
      throw new Error("The group edit would move a note outside MIDI pitches 0–127.");
    }
    const noteEnd = addRational(change.startBeats, change.durationBeats);
    if (
      compareRational(change.startBeats, ZERO) < 0 ||
      compareRational(change.durationBeats, ZERO) <= 0 ||
      compareRational(noteEnd, endOfProgression) > 0
    )
      throw new Error("The group edit must keep every note inside the current progression.");
    const destination = locateStep(project, change.startBeats);
    if (!destination) throw new Error("A group note has no Step owner at its new onset.");
    if (effectiveInstrument(project, destination.id) !== source.instrument)
      throw new Error(
        "This move crosses into a Step with a different Melody instrument. Move the notes separately or change the destination instrument first.",
      );
    return { change, source, destination };
  });

  const occupiedByStep = new Map(
    project.progression.steps.map((step) => [
      step.id,
      new Set(stepPhraseIds(project, step.id, timeline)),
    ]),
  );
  // Same-owner updates remove their source before inserting the replacement.
  for (const { change, destination } of proposed)
    if (change.sourceStepId === destination.id)
      occupiedByStep.get(destination.id)?.delete(change.eventKey);

  const edits: AuthoredMelodyEdit[] = [];
  const selection: PianoRollNoteIdentity[] = [];
  for (const { change, destination } of proposed) {
    const occupied = occupiedByStep.get(destination.id)!;
    let destinationNoteId = change.eventKey;
    if (occupied.has(destinationNoteId)) {
      let suffix = 1;
      do {
        destinationNoteId = `${change.eventKey}~${destination.id}~${suffix++}`;
      } while (occupied.has(destinationNoteId));
    }
    occupied.add(destinationNoteId);
    edits.push({
      type: "upsert",
      sourceStepId: change.sourceStepId,
      ...(destinationNoteId !== change.eventKey ? { sourceNoteId: change.eventKey } : {}),
      note: {
        id: destinationNoteId,
        pitch: change.pitch,
        startBeats: change.startBeats,
        durationBeats: change.durationBeats,
      },
    });
    selection.push({ sourceStepId: destination.id, eventKey: destinationNoteId });
  }
  return { edits, selection };
}

export function planPianoRollPaste(
  project: Project,
  clipboard: readonly PianoRollClipboardEntry[],
  anchor: Rational,
  createId: () => string = () => crypto.randomUUID(),
  createStepId: () => string = () => crypto.randomUUID(),
): PianoRollGroupEditPlan {
  if (!clipboard.length) return { edits: [], selection: [] };
  const originalEnd = progressionEnd(project);
  const absoluteEntries = clipboard.map((entry) => {
    const startBeats = addRational(anchor, entry.onset);
    if (compareRational(startBeats, ZERO) < 0 || compareRational(entry.duration, ZERO) <= 0)
      throw new Error("The paste requires non-negative onsets and positive note durations.");
    assertMidiNumber(entry.pitch.midiNumber);
    return { entry, startBeats, noteEnd: addRational(startBeats, entry.duration) };
  });
  const maximumEnd = absoluteEntries.reduce(
    (latest, value) => (compareRational(value.noteEnd, latest) > 0 ? value.noteEnd : latest),
    originalEnd,
  );
  const appendedSteps = planPasteExtension(project, absoluteEntries, maximumEnd, createStepId);
  const candidateProject = appendedSteps.length
    ? {
        ...project,
        progression: {
          ...project.progression,
          steps: [...project.progression.steps, ...appendedSteps],
        },
      }
    : project;
  if (
    appendedSteps.length > 0 &&
    !sameEffectiveMelodyTimeline(
      createEffectiveMelodyTimeline(project),
      createEffectiveMelodyTimeline(candidateProject),
    )
  )
    throw new Error(
      "Pasting would reveal or lengthen existing Melody beyond the current composition end. No content was changed.",
    );
  const endOfProgression = progressionEnd(candidateProject);
  const edits: AuthoredMelodyEdit[] = [];
  const selection: PianoRollNoteIdentity[] = [];
  const seenIds = new Set<string>();
  const timeline = createEffectiveMelodyTimeline(candidateProject);
  const occupiedIdsByStep = new Map(
    candidateProject.progression.steps.map((step) => [
      step.id,
      new Set(stepPhraseIds(project, step.id, timeline)),
    ]),
  );
  for (const { entry, startBeats, noteEnd } of absoluteEntries) {
    if (compareRational(noteEnd, endOfProgression) > 0)
      throw new Error("The paste could not extend far enough to contain every copied note.");
    const destination = locateStep(candidateProject, startBeats);
    if (!destination) throw new Error("The paste position has no Step owner.");
    if (effectiveInstrument(candidateProject, destination.id) !== entry.instrument)
      throw new Error(
        "The destination Step uses a different Melody instrument than the copied note.",
      );
    let id = createId();
    while (seenIds.has(id) || occupiedIdsByStep.get(destination.id)?.has(id)) id = createId();
    seenIds.add(id);
    occupiedIdsByStep.get(destination.id)?.add(id);
    edits.push({
      type: "upsert",
      note: { id, pitch: entry.pitch, startBeats, durationBeats: entry.duration },
    });
    selection.push({ sourceStepId: destination.id, eventKey: id });
  }
  return {
    edits,
    selection,
    ...(appendedSteps.length ? { appendedSteps } : {}),
  };
}

function planPasteExtension(
  project: Project,
  entries: readonly {
    readonly entry: PianoRollClipboardEntry;
    readonly startBeats: Rational;
    readonly noteEnd: Rational;
  }[],
  maximumEnd: Rational,
  createStepId: () => string,
): readonly RestStep[] {
  const originalEnd = progressionEnd(project);
  if (compareRational(maximumEnd, originalEnd) <= 0) return [];

  const barLength = measureLengthBeats(project.globalTiming.meter);
  const finalMeasurePosition = divideRational(maximumEnd, barLength);
  const finalMeasureCount = Math.ceil(
    finalMeasurePosition.numerator / finalMeasurePosition.denominator,
  );
  const requiredEnd = multiplyRational(barLength, rational(finalMeasureCount));
  const originalMeasurePosition = divideRational(originalEnd, barLength);
  let nextBarIndex =
    Math.floor(originalMeasurePosition.numerator / originalMeasurePosition.denominator) + 1;
  let cursor = originalEnd;
  const usedStepIds = new Set(project.progression.steps.map((step) => step.id));
  const appended: RestStep[] = [];
  const defaultInstrument = resolveEffectiveMelodyInstrument(
    undefined,
    project.melodyTrack.instrument,
  ).id;

  while (compareRational(cursor, requiredEnd) < 0) {
    const barline = multiplyRational(barLength, rational(nextBarIndex));
    const chunkEnd = compareRational(barline, requiredEnd) < 0 ? barline : requiredEnd;
    const instruments = new Set(
      entries
        .filter(
          ({ startBeats }) =>
            compareRational(startBeats, cursor) >= 0 && compareRational(startBeats, chunkEnd) < 0,
        )
        .map(({ entry }) => entry.instrument),
    );
    if (instruments.size > 1)
      throw new Error(
        "The paste needs different Melody instruments within one new Measure; split the paste by instrument.",
      );
    const instrument = instruments.values().next().value as
      PianoRollClipboardEntry["instrument"] | undefined;
    let id = createStepId();
    while (usedStepIds.has(id)) id = createStepId();
    usedStepIds.add(id);
    const step: RestStep = Object.freeze({
      id,
      kind: "rest",
      duration: musicalDuration(subtractRational(chunkEnd, cursor)),
      ...(instrument && instrument !== defaultInstrument
        ? { melodyInstrumentOverride: instrument }
        : {}),
    });
    appended.push(step);
    cursor = chunkEnd;
    nextBarIndex += 1;
  }
  return Object.freeze(appended);
}

export function groupMoveChanges(
  selected: readonly EffectiveMelodyNote[],
  deltaPitch: number,
  deltaStart: Rational,
  pitchForMidi: (midi: number) => ExactPitch,
): readonly PianoRollGroupMoveChange[] {
  return selected.map((note) => ({
    sourceStepId: note.sourceStepId,
    eventKey: note.eventKey,
    pitch: deltaPitch === 0 ? note.pitch : pitchForMidi(note.pitch.midiNumber + deltaPitch),
    startBeats: addRational(note.startBeats, deltaStart),
    durationBeats: note.durationBeats,
  }));
}

export function planPianoRollGroupMoveByDelta(
  project: Project,
  selected: readonly EffectiveMelodyNote[],
  deltaPitch: number,
  deltaStart: Rational,
): PianoRollGroupEditPlan {
  if (
    selected.some(
      (note) => note.pitch.midiNumber + deltaPitch < 0 || note.pitch.midiNumber + deltaPitch > 127,
    )
  )
    throw new Error("The group edit would move a note outside MIDI pitches 0–127.");
  return planPianoRollGroupMove(
    project,
    groupMoveChanges(selected, deltaPitch, deltaStart, (midi) => {
      assertMidiNumber(midi);
      const spelling = [
        { step: "C", alter: 0 },
        { step: "C", alter: 1 },
        { step: "D", alter: 0 },
        { step: "D", alter: 1 },
        { step: "E", alter: 0 },
        { step: "F", alter: 0 },
        { step: "F", alter: 1 },
        { step: "G", alter: 0 },
        { step: "G", alter: 1 },
        { step: "A", alter: 0 },
        { step: "A", alter: 1 },
        { step: "B", alter: 0 },
      ] as const;
      const note = spelling[((midi % 12) + 12) % 12]!;
      return exactPitch(midi, note);
    }),
  );
}
