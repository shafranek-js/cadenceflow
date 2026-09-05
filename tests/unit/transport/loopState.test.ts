import { describe, expect, it } from "vitest";
import {
  INITIAL_LOOP_STATE,
  revalidateLoopState,
  resolveLoopRegion,
  setLoopMode,
  setLoopRange,
  type LoopState,
} from "../../../src/ui/transport/loopState";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { ProgressionStep } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";

function makeStep(id: string, num = 2, den = 1): ProgressionStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId: "I" }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(num, den)),
    cardView: "harmonic",
    performance: Object.freeze({
      articulation: "block",
      register: "auto",
      voicingMode: "auto",
      bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
      masterVelocity: 80,
      perNoteVelocityOverrides: Object.freeze({}),
      dynamicsViewPreference: "musical",
    }),
  });
}

describe("T107 — Contiguous Loop State & Validation", () => {
  it("initializes with loop disabled", () => {
    expect(INITIAL_LOOP_STATE.mode).toBe("disabled");
    expect(INITIAL_LOOP_STATE.enabled).toBe(false);
    expect(INITIAL_LOOP_STATE.region).toBeNull();
  });

  it("sets loop mode 'all' spanning entire progression", () => {
    const steps = [makeStep("s1"), makeStep("s2"), makeStep("s3")];
    const loop = setLoopMode(INITIAL_LOOP_STATE, "all", steps);

    expect(loop.mode).toBe("all");
    expect(loop.enabled).toBe(true);
    expect(loop.region).toEqual({ startStepId: "s1", endStepId: "s3" });

    const resolved = resolveLoopRegion(loop, steps);
    expect(resolved).not.toBeNull();
    expect(resolved!.startStepIndex).toBe(0);
    expect(resolved!.endStepIndex).toBe(2);
    expect(resolved!.durationBeats).toEqual(rational(6, 1)); // 3 steps * 2 beats = 6 beats
  });

  it("supports single-step loop", () => {
    const steps = [makeStep("s1"), makeStep("s2"), makeStep("s3")];
    const loop = setLoopRange("s2", "s2", steps);

    expect(loop.mode).toBe("range");
    expect(loop.enabled).toBe(true);
    expect(loop.region).toEqual({ startStepId: "s2", endStepId: "s2" });

    const resolved = resolveLoopRegion(loop, steps);
    expect(resolved!.startStepIndex).toBe(1);
    expect(resolved!.endStepIndex).toBe(1);
    expect(resolved!.durationBeats).toEqual(rational(2, 1));
  });

  it("supports contiguous multi-step loop range", () => {
    const steps = [makeStep("s1"), makeStep("s2"), makeStep("s3"), makeStep("s4")];
    const loop = setLoopRange("s2", "s3", steps);

    expect(loop.mode).toBe("range");
    expect(loop.region).toEqual({ startStepId: "s2", endStepId: "s3" });

    const resolved = resolveLoopRegion(loop, steps);
    expect(resolved!.startStepIndex).toBe(1);
    expect(resolved!.endStepIndex).toBe(2);
    expect(resolved!.startBeats).toEqual(rational(2, 1));
    expect(resolved!.durationBeats).toEqual(rational(4, 1));
  });

  it("revalidates loop state when steps change and adapts 'all' mode", () => {
    const steps = [makeStep("s1"), makeStep("s2")];
    const loop = setLoopMode(INITIAL_LOOP_STATE, "all", steps);

    // Add step 3
    const updatedSteps = [...steps, makeStep("s3")];
    const revalidated = revalidateLoopState(loop, updatedSteps);

    expect(revalidated.mode).toBe("all");
    expect(revalidated.region).toEqual({ startStepId: "s1", endStepId: "s3" });
  });

  it("safely clears loop if an endpoint is deleted rather than pointing at another unrelated step", () => {
    const steps = [makeStep("s1"), makeStep("s2"), makeStep("s3")];
    const loop = setLoopRange("s1", "s2", steps);

    // Remove step s2
    const remainingSteps = [steps[0]!, steps[2]!];
    const revalidated = revalidateLoopState(loop, remainingSteps);

    expect(revalidated.enabled).toBe(false);
    expect(revalidated.mode).toBe("disabled");
    expect(revalidated.region).toBeNull();
  });

  it("safely clears loop if endpoints are reordered so start appears after end", () => {
    const steps = [makeStep("s1"), makeStep("s2"), makeStep("s3")];
    const loop = setLoopRange("s1", "s3", steps);

    // Reorder: put s3 before s1
    const reorderedSteps = [steps[2]!, steps[1]!, steps[0]!];
    const revalidated = revalidateLoopState(loop, reorderedSteps);

    expect(revalidated.enabled).toBe(false);
    expect(revalidated.mode).toBe("disabled");
    expect(revalidated.region).toBeNull();
  });
});
