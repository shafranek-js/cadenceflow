import type { ProgressionStep } from "./step";

export interface LoopRegion {
  readonly startStepId: string;
  readonly endStepId: string;
}

export interface Progression {
  readonly steps: readonly ProgressionStep[];
  readonly selectedStepId?: string;
  readonly loopRegion?: LoopRegion;
}

export function emptyProgression(): Progression {
  return Object.freeze({ steps: Object.freeze([]) });
}
