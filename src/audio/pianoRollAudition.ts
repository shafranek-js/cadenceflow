import type { AudioNoteEvent } from "./contracts";
import { realizeProgressionAudioEvents } from "./eventRealizer";
import { getHarmonicModule } from "../domain/harmony/moduleRegistry";
import type { Project } from "../domain/project/project";
import { rationalToNumber } from "../domain/timing/rational";

export interface PianoRollChordAudition {
  readonly stepIndex: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly events: readonly AudioNoteEvent[];
}

/** Harmony-only preview for one effective chord interval; deliberately never projects Melody. */
export function realizePianoRollChordAudition(
  project: Project,
  stepId: string,
): PianoRollChordAudition | null {
  const stepIndex = project.progression.steps.findIndex((step) => step.id === stepId);
  const step = project.progression.steps[stepIndex];
  if (stepIndex < 0 || !step || step.kind !== "chord") return null;
  const startBeat = project.progression.steps
    .slice(0, stepIndex)
    .reduce((total, item) => total + rationalToNumber(item.duration.beats), 0);
  const endBeat = startBeat + rationalToNumber(step.duration.beats);
  if (endBeat <= startBeat) return null;
  const tempo = project.globalTiming.tempoBpm;
  const secondsPerBeat = 60 / tempo;
  const mode = getHarmonicModule(project.activeModule).mode;
  const events = realizeProgressionAudioEvents({
    steps: project.progression.steps,
    tonic: project.tonic,
    context: {
      tonic: project.tonic,
      mode,
      moduleId: project.activeModule,
      spellingContext: { tonic: project.tonic, mode },
    },
    tempoBpm: tempo,
    groove: project.groove,
    independentBassEnabled: project.independentBassEnabled,
  })
    .filter((event) => event.stepIndex === stepIndex)
    .map((event) => {
      const start = event.startSeconds / secondsPerBeat;
      const end = start + event.durationSeconds / secondsPerBeat;
      const clippedStart = Math.max(start, startBeat);
      const clippedEnd = Math.min(end, endBeat);
      return {
        ...event,
        startSeconds: (clippedStart - startBeat) * secondsPerBeat,
        durationSeconds: (clippedEnd - clippedStart) * secondsPerBeat,
      };
    })
    .filter((event) => event.durationSeconds > 0);
  return { stepIndex, startBeat, endBeat, events };
}
