import type { StepCreationDefaults } from "../project/defaults";
import type { ChordStep } from "./step";

export function resetChordStepPerformance(
  step: ChordStep,
  defaults: StepCreationDefaults,
): ChordStep {
  return Object.freeze({
    ...step,
    performance: Object.freeze({
      ...defaults.performance,
      bass: Object.freeze({ ...defaults.performance.bass }),
      perNoteVelocityOverrides: Object.freeze({ ...defaults.performance.perNoteVelocityOverrides }),
      ...(defaults.performance.manualVoicing
        ? { manualVoicing: Object.freeze([...defaults.performance.manualVoicing]) }
        : {}),
    }),
  });
}
