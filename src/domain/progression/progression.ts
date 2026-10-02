import type { ProgressionStep } from "./step";

export interface LoopRegion {
  readonly startStepId: string;
  readonly endStepId: string;
}

export interface SongSection {
  readonly id: string;
  readonly name: string;
  readonly startStepId: string;
}

export interface Progression {
  readonly steps: readonly ProgressionStep[];
  readonly selectedStepId?: string;
  readonly loopRegion?: LoopRegion;
  readonly sections?: readonly SongSection[];
}

export function emptyProgression(): Progression {
  return Object.freeze({ steps: Object.freeze([]), sections: Object.freeze([]) });
}
