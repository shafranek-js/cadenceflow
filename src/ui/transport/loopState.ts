import type { ProgressionStep } from "../../domain/progression/step";
import {
  validateLoopRegion,
  type LoopRegion,
  type ResolvedLoopRegion,
} from "../../domain/timing/timeline";

export type LoopMode = "disabled" | "all" | "range";

export interface LoopState {
  readonly mode: LoopMode;
  readonly enabled: boolean;
  readonly region: LoopRegion | null;
}

export const INITIAL_LOOP_STATE: LoopState = Object.freeze({
  mode: "disabled",
  enabled: false,
  region: null,
});

/**
 * Updates loop mode and validates endpoints.
 */
export function setLoopMode(
  state: LoopState,
  mode: LoopMode,
  steps: readonly ProgressionStep[],
  customRegion?: LoopRegion,
): LoopState {
  if (mode === "disabled" || steps.length === 0) {
    return Object.freeze({
      mode: "disabled",
      enabled: false,
      region: null,
    });
  }

  if (mode === "all") {
    const firstStep = steps[0]!;
    const lastStep = steps[steps.length - 1]!;
    return Object.freeze({
      mode: "all",
      enabled: true,
      region: Object.freeze({
        startStepId: firstStep.id,
        endStepId: lastStep.id,
      }),
    });
  }

  // mode === "range"
  const targetRegion = customRegion ?? state.region;
  if (!targetRegion) {
    // Default to whole progression if no range was previously specified
    const firstStep = steps[0]!;
    const lastStep = steps[steps.length - 1]!;
    return Object.freeze({
      mode: "range",
      enabled: true,
      region: Object.freeze({
        startStepId: firstStep.id,
        endStepId: lastStep.id,
      }),
    });
  }

  try {
    validateLoopRegion(targetRegion, steps);
    return Object.freeze({
      mode: "range",
      enabled: true,
      region: targetRegion,
    });
  } catch {
    // Invalid region fallback to disabled
    return Object.freeze({
      mode: "disabled",
      enabled: false,
      region: null,
    });
  }
}

/**
 * Sets a contiguous loop region by step IDs.
 * Single-step loop is valid (startStepId === endStepId).
 */
export function setLoopRange(
  startStepId: string,
  endStepId: string,
  steps: readonly ProgressionStep[],
): LoopState {
  const region: LoopRegion = Object.freeze({ startStepId, endStepId });
  validateLoopRegion(region, steps);

  return Object.freeze({
    mode: "range",
    enabled: true,
    region,
  });
}

/**
 * Revalidates loop state against updated progression steps.
 * If an endpoint was removed or reordered, cleanly disables loop rather than silently mutating targets.
 */
export function revalidateLoopState(
  state: LoopState,
  steps: readonly ProgressionStep[],
): LoopState {
  if (!state.enabled || !state.region || steps.length === 0) {
    return state.enabled
      ? Object.freeze({ mode: "disabled", enabled: false, region: null })
      : state;
  }

  if (state.mode === "all") {
    const firstStep = steps[0]!;
    const lastStep = steps[steps.length - 1]!;
    if (
      state.region.startStepId !== firstStep.id ||
      state.region.endStepId !== lastStep.id
    ) {
      return Object.freeze({
        mode: "all",
        enabled: true,
        region: Object.freeze({
          startStepId: firstStep.id,
          endStepId: lastStep.id,
        }),
      });
    }
    return state;
  }

  // mode === "range"
  try {
    validateLoopRegion(state.region, steps);
    return state;
  } catch {
    // Endpoints no longer valid or reordered: cleanly clear
    return Object.freeze({
      mode: "disabled",
      enabled: false,
      region: null,
    });
  }
}

/**
 * Resolves loop boundary beats for active loop state.
 */
export function resolveLoopRegion(
  state: LoopState,
  steps: readonly ProgressionStep[],
): ResolvedLoopRegion | null {
  if (!state.enabled || !state.region || steps.length === 0) {
    return null;
  }

  try {
    return validateLoopRegion(state.region, steps);
  } catch {
    return null;
  }
}
