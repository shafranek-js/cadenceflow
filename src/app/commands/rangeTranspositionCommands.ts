import type { AppliedCommand, ProjectCommand } from ".";
import { getHarmonicModule } from "../../domain/harmony/moduleRegistry";
import type { ExactPitch } from "../../domain/harmony/pitch";
import {
  snapshotAuthoredMelodyPhrase,
  type AuthoredMelodyPhrase,
  type AuthoredMelodyNote,
} from "../../domain/melody/types";
import { resolveEffectiveMelodyPhrase } from "../../domain/melody/projection";
import { createEffectiveMelodyTimeline } from "../../domain/melody/effectiveTimeline";
import type { Project } from "../../domain/project/project";
import type { ChordStep, ProgressionStep } from "../../domain/progression/step";
import {
  assertStepTranspositionSemitones,
  clearTranspositionSpellingOverride,
  pitchToSourceFrame,
  realizeProgressionStepChord,
  stepTranspositionSemitones,
  transposeExactPitch,
} from "../../domain/progression/transposition";
import { realizeOrderedPianoProgression } from "../../instruments/piano/progressionRealization";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { compareRational, type Rational } from "../../domain/timing/rational";

export interface RangeTranspositionPayload {
  readonly stepIds: readonly string[];
  readonly semitones: number;
  readonly nowIso: string;
}

export type RangeTranspositionCommand = ProjectCommand<RangeTranspositionPayload> & {
  readonly type: "progression/transpose-range";
};

export class RangeTranspositionError extends RangeError {
  constructor(
    readonly reason: "invalid-range" | "unknown-step" | "out-of-range" | "invalid-pitch",
    message: string,
  ) {
    super(message);
    this.name = "RangeTranspositionError";
  }
}

interface GeneratedEvent {
  readonly eventKey: string;
  readonly pitch: ExactPitch;
  readonly sourcePitchMidi: number;
  readonly startOffsetBeats: Rational;
  readonly durationBeats: Rational;
}

export interface RangeTranspositionPlan {
  readonly progression: Project["progression"];
  readonly materializedStepIds: readonly string[];
  readonly chordChanges: readonly { readonly before: string; readonly after: string }[];
}

function generatedPhrases(project: Project): ReadonlyMap<string, readonly GeneratedEvent[] | null> {
  const module = getHarmonicModule(project.activeModule);
  const mode = module.mode;
  const context = {
    tonic: project.tonic,
    mode,
    moduleId: project.activeModule,
    spellingContext: { tonic: project.tonic, mode },
  };
  const steps = project.progression.steps;
  const realizations = realizeOrderedPianoProgression({
    steps,
    tonic: project.tonic,
    context,
  });
  const output = new Map<string, readonly GeneratedEvent[] | null>();
  steps.forEach((step, index) => {
    if (step.kind !== "chord" || step.melody?.mode !== "generated") return;
    const realization = realizations[index];
    if (!realization)
      throw new RangeTranspositionError(
        "invalid-pitch",
        `Missing realization for Step ${step.id}.`,
      );
    const next = realizations.slice(index + 1).find((entry) => entry !== null);
    try {
      const phrase = resolveEffectiveMelodyPhrase({
        sourceStepId: step.id,
        upperPitches: realization.upperPitches,
        durationBeats: step.duration.beats,
        melody: step.melody,
        recipe: step.melody.recipe,
        targetPitches: next
          ? [...next.upperPitches, ...(next.bassPitch ? [next.bassPitch] : [])]
          : [],
      });
      output.set(
        step.id,
        Object.freeze(
          phrase.events.map((event) =>
            Object.freeze({
              eventKey: event.eventKey,
              pitch: event.pitch,
              sourcePitchMidi: event.sourcePitchMidi - stepTranspositionSemitones(step),
              startOffsetBeats: event.startOffsetBeats,
              durationBeats: event.durationBeats,
            }),
          ),
        ),
      );
    } catch {
      output.set(step.id, null);
    }
  });
  return output;
}

function samePhrase(left: readonly GeneratedEvent[], right: readonly GeneratedEvent[]): boolean {
  return (
    left.length === right.length &&
    left.every((event, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        event.eventKey === other.eventKey &&
        event.pitch.midiNumber === other.pitch.midiNumber &&
        event.pitch.pitchClassIdentity === other.pitch.pitchClassIdentity &&
        event.pitch.octave === other.pitch.octave &&
        event.pitch.spelling.step === other.pitch.spelling.step &&
        event.pitch.spelling.alter === other.pitch.spelling.alter &&
        event.sourcePitchMidi === other.sourcePitchMidi &&
        compareRational(event.startOffsetBeats, other.startOffsetBeats) === 0 &&
        compareRational(event.durationBeats, other.durationBeats) === 0
      );
    })
  );
}

function clearStepSpellingOverrides(step: ProgressionStep): ProgressionStep {
  const clearPhrase = (phrase: AuthoredMelodyPhrase): AuthoredMelodyPhrase =>
    snapshotAuthoredMelodyPhrase({
      ...phrase,
      notes: phrase.notes.map((note) => ({
        ...note,
        pitch: clearTranspositionSpellingOverride(note.pitch),
      })),
    });
  if (step.kind === "rest")
    return step.authoredMelody
      ? Object.freeze({ ...step, authoredMelody: clearPhrase(step.authoredMelody) })
      : step;
  const melody =
    step.melody?.mode === "authored"
      ? Object.freeze({ ...step.melody, phrase: clearPhrase(step.melody.phrase) })
      : step.melody;
  const manualVoicing = step.performance.manualVoicing?.map(clearTranspositionSpellingOverride);
  const customPitch = step.performance.bass.customPitch
    ? clearTranspositionSpellingOverride(step.performance.bass.customPitch)
    : undefined;
  return Object.freeze({
    ...step,
    ...(melody ? { melody } : {}),
    performance: Object.freeze({
      ...step.performance,
      ...(manualVoicing ? { manualVoicing: Object.freeze(manualVoicing) } : {}),
      bass: Object.freeze({
        ...step.performance.bass,
        ...(customPitch ? { customPitch } : {}),
      }),
    }),
  });
}

function materializeGeneratedStep(step: ChordStep, desired: readonly GeneratedEvent[]): ChordStep {
  const recipe = step.melody?.mode === "generated" ? step.melody.recipe : undefined;
  if (!recipe)
    throw new RangeTranspositionError("invalid-range", `Step ${step.id} is not generated Melody.`);
  const notes: readonly AuthoredMelodyNote[] = desired.map((event) =>
    Object.freeze({
      id: event.eventKey,
      pitch: pitchToSourceFrame(event.pitch, step),
      sourcePitchMidi: event.sourcePitchMidi,
      onset: event.startOffsetBeats,
      duration: event.durationBeats,
    }),
  );
  const phrase = snapshotAuthoredMelodyPhrase({ notes, sourceRecipe: recipe });
  return Object.freeze({
    ...step,
    melody: Object.freeze({ mode: "authored", phrase, sourceRecipe: recipe }),
  });
}

function assertStoredPitchRange(project: Project, selectedIds: ReadonlySet<string>): void {
  for (const step of project.progression.steps) {
    if (!selectedIds.has(step.id)) continue;
    try {
      if (step.kind === "chord") {
        for (const pitch of step.performance.manualVoicing ?? [])
          transposeExactPitch(pitch, stepTranspositionSemitones(step));
        if (step.performance.bass.customPitch)
          transposeExactPitch(step.performance.bass.customPitch, stepTranspositionSemitones(step));
        if (step.melody?.mode === "authored")
          for (const note of step.melody.phrase.notes)
            transposeExactPitch(note.pitch, stepTranspositionSemitones(step));
      } else if (step.authoredMelody) {
        for (const note of step.authoredMelody.notes)
          transposeExactPitch(note.pitch, stepTranspositionSemitones(step));
      }
    } catch {
      throw new RangeTranspositionError(
        "out-of-range",
        `Transposition would move stored pitch material in ${step.id} outside MIDI 0..127.`,
      );
    }
  }
  try {
    const context = getHarmonicModule(project.activeModule).mode;
    for (const realization of realizeOrderedPianoProgression({
      steps: project.progression.steps,
      tonic: project.tonic,
      context: {
        tonic: project.tonic,
        mode: context,
        moduleId: project.activeModule,
        spellingContext: { tonic: project.tonic, mode: context },
      },
    })) {
      if (realization) {
        realization.upperPitches.forEach((pitch) => transposeExactPitch(pitch, 0));
        if (realization.bassPitch) transposeExactPitch(realization.bassPitch, 0);
      }
    }
    for (const step of project.progression.steps) {
      if (step.kind === "chord" && selectedIds.has(step.id)) {
        const realization = realizeProgressionStepRealization(step, project.tonic);
        realization.pitches.forEach((pitch) => transposeExactPitch(pitch, 0));
        if (realization.bassPitch) transposeExactPitch(realization.bassPitch, 0);
      }
    }
  } catch (error) {
    if (error instanceof RangeTranspositionError) throw error;
    throw new RangeTranspositionError(
      "out-of-range",
      "Transposition would move generated or contextual pitch material outside MIDI 0..127.",
    );
  }
}

function assertFinalOutputRange(project: Project, checkedStepIds: ReadonlySet<string>): void {
  assertStoredPitchRange(project, checkedStepIds);
  try {
    createEffectiveMelodyTimeline(project);
  } catch {
    throw new RangeTranspositionError(
      "out-of-range",
      "Transposition would move effective Melody outside MIDI 0..127.",
    );
  }
}

function sameEffectivePitch(left: ExactPitch, right: ExactPitch): boolean {
  return (
    left.midiNumber === right.midiNumber &&
    left.pitchClassIdentity === right.pitchClassIdentity &&
    left.octave === right.octave &&
    left.spelling.step === right.spelling.step &&
    left.spelling.alter === right.spelling.alter
  );
}

function assertProjectionStability(
  before: Project,
  after: Project,
  selectedIds: ReadonlySet<string>,
  semitones: number,
): void {
  const beforeMelody = createEffectiveMelodyTimeline(before);
  const afterMelody = createEffectiveMelodyTimeline(after);
  if (beforeMelody.length !== afterMelody.length)
    throw new RangeTranspositionError(
      "invalid-pitch",
      "Transposition changed the number of effective Melody notes.",
    );
  const afterByIdentity = new Map(
    afterMelody.map((event) => [`${event.sourceStepId}\u0000${event.eventKey}`, event]),
  );
  for (const event of beforeMelody) {
    const actual = afterByIdentity.get(`${event.sourceStepId}\u0000${event.eventKey}`);
    if (!actual)
      throw new RangeTranspositionError(
        "invalid-pitch",
        "Transposition changed Melody ownership or event IDs.",
      );
    const expectedPitch = selectedIds.has(event.sourceStepId)
      ? transposeExactPitch(event.pitch, semitones)
      : event.pitch;
    if (
      !sameEffectivePitch(actual.pitch, expectedPitch) ||
      actual.sourcePitchMidi !== event.sourcePitchMidi ||
      compareRational(actual.startBeats, event.startBeats) !== 0 ||
      compareRational(actual.durationBeats, event.durationBeats) !== 0 ||
      actual.instrument !== event.instrument
    )
      throw new RangeTranspositionError(
        "invalid-pitch",
        `Transposition would change a protected effective Melody event in Step ${event.sourceStepId}.`,
      );
  }

  const beforeContext = getHarmonicModule(before.activeModule).mode;
  const afterContext = getHarmonicModule(after.activeModule).mode;
  const beforeRealizations = realizeOrderedPianoProgression({
    steps: before.progression.steps,
    tonic: before.tonic,
    context: {
      tonic: before.tonic,
      mode: beforeContext,
      moduleId: before.activeModule,
      spellingContext: { tonic: before.tonic, mode: beforeContext },
    },
  });
  const afterRealizations = realizeOrderedPianoProgression({
    steps: after.progression.steps,
    tonic: after.tonic,
    context: {
      tonic: after.tonic,
      mode: afterContext,
      moduleId: after.activeModule,
      spellingContext: { tonic: after.tonic, mode: afterContext },
    },
  });
  beforeRealizations.forEach((previous, index) => {
    const current = afterRealizations[index];
    const step = before.progression.steps[index];
    if (step?.kind !== "chord" || !previous || !current) return;
    const selected = selectedIds.has(step.id);
    const expectedUppers = previous.upperPitches.map((pitch) =>
      selected ? transposeExactPitch(pitch, semitones) : pitch,
    );
    const upperStable =
      expectedUppers.length === current.upperPitches.length &&
      expectedUppers.every((pitch, pitchIndex) =>
        sameEffectivePitch(pitch, current.upperPitches[pitchIndex]!),
      );
    const expectedBass = previous.bassPitch
      ? selected
        ? transposeExactPitch(previous.bassPitch, semitones)
        : previous.bassPitch
      : undefined;
    if (
      !upperStable ||
      (expectedBass === undefined) !== (current.bassPitch === undefined) ||
      (expectedBass && current.bassPitch && !sameEffectivePitch(expectedBass, current.bassPitch))
    )
      throw new RangeTranspositionError(
        "invalid-pitch",
        `Transposition would change ordered Harmony output in Step ${step.id} beyond the selected offset.`,
      );
  });
}

export function planRangeTransposition(
  project: Project,
  stepIds: readonly string[],
  semitones: number,
): RangeTranspositionPlan {
  if (!Number.isInteger(semitones) || semitones < -127 || semitones > 127)
    throw new RangeTranspositionError(
      "invalid-range",
      "Choose an integer semitone amount in -127..127.",
    );
  const selectedIds = new Set(stepIds);
  if (selectedIds.size !== stepIds.length || selectedIds.size === 0)
    throw new RangeTranspositionError(
      "invalid-range",
      "Select one or more unique progression Steps.",
    );
  const steps = project.progression.steps;
  const known = new Set(steps.map((step) => step.id));
  for (const id of selectedIds)
    if (!known.has(id)) throw new RangeTranspositionError("unknown-step", `Unknown Step ${id}.`);
  if (semitones === 0)
    return Object.freeze({
      progression: project.progression,
      materializedStepIds: [],
      chordChanges: [],
    });

  const beforeGenerated = generatedPhrases(project);
  const transposedSteps = steps.map((step) => {
    if (!selectedIds.has(step.id)) return step;
    try {
      return Object.freeze({
        ...clearStepSpellingOverrides(step),
        transpositionSemitones: assertStepTranspositionSemitones(
          stepTranspositionSemitones(step) + semitones,
        ),
      });
    } catch {
      throw new RangeTranspositionError(
        "invalid-range",
        `Step ${step.id} would exceed the supported transposition range of -127..127 semitones.`,
      );
    }
  });
  let candidate: Project = Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(transposedSteps) }),
  });
  assertStoredPitchRange(candidate, selectedIds);
  const afterGenerated = generatedPhrases(candidate);
  const materialized = new Set<string>();
  const stabilizedSteps = candidate.progression.steps.map((step) => {
    if (step.kind !== "chord" || step.melody?.mode !== "generated") return step;
    const previous = beforeGenerated.get(step.id);
    const after = afterGenerated.get(step.id);
    if (previous === null)
      throw new RangeTranspositionError(
        "invalid-pitch",
        `The existing generated phrase for Step ${step.id} could not be resolved safely.`,
      );
    if (!previous) return step;
    const expected = selectedIds.has(step.id)
      ? previous.map((event) =>
          Object.freeze({ ...event, pitch: transposeExactPitch(event.pitch, semitones) }),
        )
      : previous;
    if (after && samePhrase(after, expected)) return step;
    materialized.add(step.id);
    return materializeGeneratedStep(step, expected);
  });
  candidate = Object.freeze({
    ...candidate,
    progression: Object.freeze({ ...candidate.progression, steps: Object.freeze(stabilizedSteps) }),
  });
  assertFinalOutputRange(candidate, new Set([...selectedIds, ...materialized]));
  assertProjectionStability(project, candidate, selectedIds, semitones);
  const chordChanges = steps.flatMap((step, index) => {
    const nextStep = stabilizedSteps[index];
    return step.kind === "chord" && selectedIds.has(step.id) && nextStep?.kind === "chord"
      ? [
          {
            before: formatChordSymbol(realizeProgressionStepChord(step, project.tonic)),
            after: formatChordSymbol(realizeProgressionStepChord(nextStep, project.tonic)),
          },
        ]
      : [];
  });
  return Object.freeze({
    progression: candidate.progression,
    materializedStepIds: Object.freeze([...materialized]),
    chordChanges: Object.freeze(chordChanges),
  });
}

export function previewRangeTransposition(
  project: Project,
  stepIds: readonly string[],
  semitones: number,
): { readonly valid: boolean; readonly message: string } {
  try {
    const plan = planRangeTransposition(project, stepIds, semitones);
    if (semitones === 0) return { valid: false, message: "Enter a non-zero semitone amount." };
    const changes = plan.chordChanges
      .slice(0, 3)
      .map((change) => `${change.before} → ${change.after}`);
    const overflow = plan.chordChanges.length - changes.length;
    const chordSummary = changes.length
      ? ` ${changes.join(", ")}${overflow > 0 ? `, +${overflow} more` : ""}.`
      : " Melody-only range; no chord symbols change.";
    const stabilized = plan.materializedStepIds.length
      ? ` ${plan.materializedStepIds.length} generated phrase${plan.materializedStepIds.length === 1 ? " will" : "s will"} be preserved as authored notes.`
      : " Generated phrases stay generated.";
    return {
      valid: true,
      message: `Apply ${semitones > 0 ? "+" : ""}${semitones} semitones to ${stepIds.length} selected Step${stepIds.length === 1 ? "" : "s"}.${chordSummary}${stabilized}`,
    };
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : "This transposition cannot be applied.",
    };
  }
}

export function transposeRange(
  project: Project,
  command: RangeTranspositionCommand,
): AppliedCommand {
  const plan = planRangeTransposition(project, command.payload.stepIds, command.payload.semitones);
  if (command.payload.semitones === 0 || plan.progression === project.progression)
    return {
      project,
      inverse: {
        type: "progression/restore",
        payload: { progression: project.progression, nowIso: command.payload.nowIso },
      },
    };
  const nextProject = Object.freeze({
    ...project,
    progression: plan.progression,
    updatedAt: command.payload.nowIso,
  });
  return {
    project: nextProject,
    forward: {
      type: "progression/restore",
      payload: { progression: plan.progression, nowIso: command.payload.nowIso },
    },
    inverse: {
      type: "progression/restore",
      payload: { progression: project.progression, nowIso: project.updatedAt },
    },
  };
}
