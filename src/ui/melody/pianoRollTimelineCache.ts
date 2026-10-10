import {
  createEffectiveMelodyTimeline,
  type EffectiveMelodyNote,
  type EffectiveMelodyTimelineInput,
} from "../../domain/melody/effectiveTimeline";

type TimelineBuilder = (project: EffectiveMelodyTimelineInput) => readonly EffectiveMelodyNote[];

/**
 * Caches the Piano Roll's effective notes across selection-only Project snapshots.
 * `createEffectiveMelodyTimeline` reads only these musical inputs; selectedStepId,
 * presentation, and other UI state do not change the timeline.
 */
export class PianoRollTimelineCache {
  readonly #build: TimelineBuilder;
  #steps: EffectiveMelodyTimelineInput["progression"]["steps"] | null = null;
  #tonic: EffectiveMelodyTimelineInput["tonic"] | null = null;
  #activeModule: EffectiveMelodyTimelineInput["activeModule"] | null = null;
  #melodyInstrument: EffectiveMelodyTimelineInput["melodyTrack"]["instrument"] | null = null;
  #notes: readonly EffectiveMelodyNote[] | null = null;

  constructor(build: TimelineBuilder = createEffectiveMelodyTimeline) {
    this.#build = build;
  }

  get(project: EffectiveMelodyTimelineInput): readonly EffectiveMelodyNote[] {
    const { steps } = project.progression;
    const { tonic, activeModule } = project;
    const melodyInstrument = project.melodyTrack.instrument;
    if (
      this.#notes &&
      this.#steps === steps &&
      this.#tonic === tonic &&
      this.#activeModule === activeModule &&
      this.#melodyInstrument === melodyInstrument
    )
      return this.#notes;

    this.#steps = steps;
    this.#tonic = tonic;
    this.#activeModule = activeModule;
    this.#melodyInstrument = melodyInstrument;
    this.#notes = this.#build(project);
    return this.#notes;
  }
}
