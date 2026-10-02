import { realizeOrderedPianoProgression } from "../../instruments/piano/progressionRealization";
import type { ProgressionStep } from "../progression/step";
import type { HarmonicModuleId } from "../harmony/functions";
import type { PitchClassIdentity } from "../harmony/pitch";
import type { MelodyTrackSettings } from "./types";
import {
  addRational,
  compareRational,
  subtractRational,
  ZERO,
  type Rational,
} from "../timing/rational";
import { getHarmonicModule } from "../harmony/moduleRegistry";
import { resolveEffectiveMelodyInstrument } from "./instrumentCatalog";
import { resolveEffectiveMelodyPhrase } from "./projection";
import { snapshotAuthoredMelodyPhrase, snapshotChordMelody } from "./types";
import { exactPitch, type ExactPitch } from "../harmony/pitch";

export interface EffectiveMelodyNote {
  readonly sourceStepId: string;
  readonly stepIndex: number;
  readonly eventKey: string;
  readonly eventIndex: number;
  readonly eventCount: number;
  readonly pitch: ExactPitch;
  readonly sourcePitchMidi: number;
  readonly startBeats: Rational;
  readonly durationBeats: Rational;
  readonly instrument: ReturnType<typeof resolveEffectiveMelodyInstrument>["id"];
}

function applySavedMelodySpelling(pitch: ExactPitch, step: ProgressionStep): ExactPitch {
  if (step.kind !== "chord") return pitch;
  const override =
    step.explicitSpellingOverrides?.[`upper:${pitch.midiNumber}`] ??
    step.explicitSpellingOverrides?.[String(pitch.midiNumber)];
  return override ? exactPitch(pitch.midiNumber, override) : pitch;
}
export interface EffectiveMelodyTimelineInput {
  readonly progression: { readonly steps: readonly ProgressionStep[] };
  readonly tonic: PitchClassIdentity;
  readonly activeModule: HarmonicModuleId;
  readonly melodyTrack: MelodyTrackSettings;
}

/**
 * Single semantic Melody pipeline for playback, notation, inline lanes and exports.
 * Ownership follows the Step containing note onset. Absolute timing is derived;
 * events at/after the current progression end are omitted and crossing events clip
 * at that end without changing the stored authored duration.
 */
export function createEffectiveMelodyTimeline(
  project: EffectiveMelodyTimelineInput,
): readonly EffectiveMelodyNote[] {
  const steps = project.progression.steps;
  const mode = getHarmonicModule(project.activeModule).mode;
  const context = {
    tonic: project.tonic,
    mode,
    moduleId: project.activeModule,
    spellingContext: { tonic: project.tonic, mode },
  };
  const realizations = realizeOrderedPianoProgression({
    steps,
    tonic: project.tonic,
    context,
  });
  let progressionEnd = ZERO;
  for (const step of steps) progressionEnd = addRational(progressionEnd, step.duration.beats);
  const output: EffectiveMelodyNote[] = [];
  let stepStart = ZERO;
  steps.forEach((step: ProgressionStep, stepIndex) => {
    const authored =
      (step.kind === "rest" ? step.authoredMelody : undefined) ??
      (step.kind === "chord" && step.melody?.mode === "authored" ? step.melody.phrase : undefined);
    let events: {
      readonly eventKey: string;
      readonly eventIndex: number;
      readonly eventCount: number;
      readonly pitch: ExactPitch;
      readonly sourcePitchMidi: number;
      readonly onset: Rational;
      readonly duration: Rational;
    }[];
    if (authored) {
      events = snapshotAuthoredMelodyPhrase(authored).notes.map((note, eventIndex) => ({
        eventKey: note.id,
        eventIndex,
        eventCount: authored.notes.length,
        pitch: note.pitch,
        sourcePitchMidi: note.pitch.midiNumber,
        onset: note.onset,
        duration: note.duration,
      }));
    } else if (step.kind === "chord" && step.melody !== undefined) {
      const chordMelody = snapshotChordMelody(step.melody);
      if (chordMelody.mode === "authored") {
        events = chordMelody.phrase.notes.map((note, eventIndex) => ({
          eventKey: note.id,
          eventIndex,
          eventCount: chordMelody.phrase.notes.length,
          pitch: note.pitch,
          sourcePitchMidi: note.pitch.midiNumber,
          onset: note.onset,
          duration: note.duration,
        }));
      } else {
        const realization = realizations[stepIndex];
        if (!realization)
          throw new Error(`missing contextual melody realization for step ${step.id}`);
        const nextRealization = realizations.slice(stepIndex + 1).find((item) => item !== null);
        const phrase = resolveEffectiveMelodyPhrase({
          sourceStepId: step.id,
          upperPitches: realization.upperPitches.map((pitch) =>
            applySavedMelodySpelling(pitch, step),
          ),
          durationBeats: step.duration.beats,
          melody: chordMelody,
          recipe: chordMelody.recipe,
          targetPitches: nextRealization
            ? [
                ...nextRealization.upperPitches.map((pitch) =>
                  applySavedMelodySpelling(pitch, steps[nextRealization.stepIndex]!),
                ),
                ...(nextRealization.bassPitch
                  ? [
                      applySavedMelodySpelling(
                        nextRealization.bassPitch,
                        steps[nextRealization.stepIndex]!,
                      ),
                    ]
                  : []),
              ]
            : [],
        });
        events = phrase.events.map((event) => ({
          eventKey: event.eventKey,
          eventIndex: event.index,
          eventCount: phrase.events.length,
          pitch: event.pitch,
          sourcePitchMidi: event.sourcePitchMidi,
          onset: event.startOffsetBeats,
          duration: event.durationBeats,
        }));
      }
    } else events = [];

    const instrument = resolveEffectiveMelodyInstrument(
      step.melodyInstrumentOverride,
      project.melodyTrack.instrument,
    ).id;
    for (const event of events) {
      const startBeats = addRational(stepStart, event.onset);
      if (compareRational(startBeats, progressionEnd) >= 0) continue;
      const unboundedEnd = addRational(startBeats, event.duration);
      const effectiveEnd =
        compareRational(unboundedEnd, progressionEnd) > 0 ? progressionEnd : unboundedEnd;
      if (compareRational(effectiveEnd, startBeats) <= 0) continue;
      output.push(
        Object.freeze({
          sourceStepId: step.id,
          stepIndex,
          eventKey: event.eventKey,
          eventIndex: event.eventIndex,
          eventCount: event.eventCount,
          pitch: event.pitch,
          sourcePitchMidi: event.sourcePitchMidi,
          startBeats,
          durationBeats: subtractRational(effectiveEnd, startBeats),
          instrument,
        }),
      );
    }
    stepStart = addRational(stepStart, step.duration.beats);
  });
  return Object.freeze(
    output.sort(
      (a, b) =>
        compareRational(a.startBeats, b.startBeats) ||
        a.pitch.midiNumber - b.pitch.midiNumber ||
        a.stepIndex - b.stepIndex ||
        a.eventIndex - b.eventIndex,
    ),
  );
}
