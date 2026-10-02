import { AppStore } from "../../src/app/appStore";
import {
  createSetStepDurationCommand,
  setStepDuration,
} from "../../src/app/commands/timingCommands";
import { selectStep } from "../../src/app/commands/progressionCommands";
import { createDefaultProject } from "../../src/domain/project/factory";
import type { Project } from "../../src/domain/project/project";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational, type Rational } from "../../src/domain/timing/rational";

export function createCanonicalStepDurationFixture(): Project {
  const nowIso = "2026-09-29T00:00:00.000Z";
  const base = createDefaultProject("t199-step-command", "T199 Step command", nowIso);
  const step = Object.freeze({
    id: "step-duration",
    kind: "rest" as const,
    duration: musicalDuration(rational(1)),
  });
  return Object.freeze({
    ...base,
    progression: Object.freeze({ steps: Object.freeze([step]) }),
  });
}

export function selectStepThroughPersistedRoute(
  store: AppStore,
  stepId: string,
  nowIso = "2026-09-29T00:01:00.000Z",
): void {
  store.dispatch({ type: "progression/select-step", payload: { stepId, nowIso } }, selectStep);
}

export function applyTimingResizeOnce(
  store: AppStore,
  stepId: string,
  beats: Rational,
  nowIso = "2026-09-29T00:02:00.000Z",
): void {
  if (beats.numerator <= 0) throw new RangeError("canonical duration must be positive");
  if (!store.project.progression.steps.some((step) => step.id === stepId)) {
    throw new RangeError(`Unknown canonical Step: ${stepId}`);
  }
  const command = createSetStepDurationCommand(stepId, musicalDuration(beats), nowIso);
  store.dispatch(command, setStepDuration);
}

export function projectJson(store: AppStore): string {
  return JSON.stringify(store.project);
}
