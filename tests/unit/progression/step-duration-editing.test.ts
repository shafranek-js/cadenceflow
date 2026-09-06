// @vitest-environment jsdom
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { musicalDuration, type MusicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { createProgressionTimeline } from "../../../src/domain/timing/timeline";
import { resetChordStepPerformance } from "../../../src/domain/progression/reset";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";
import { AppStore } from "../../../src/app/appStore";
import {
  addRestStep,
  type AddRestStepCommand,
  resetStepPerformance,
  type ResetStepPerformanceCommand,
} from "../../../src/app/commands/progressionCommands";
import {
  setStepDuration,
  type SetStepDurationCommand,
} from "../../../src/app/commands/timingCommands";
import { StepDurationControl } from "../../../src/ui/progression/StepDurationControl";
import { ProgressionStepCard } from "../../../src/ui/progression/ProgressionStepCard";
import { ProgressionTrack } from "../../../src/ui/progression/ProgressionTrack";

// Setup JSDOM globals
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Progression Step Duration Direct Editing (US6/US3 Corrective UX)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  });

  describe("1. Command, Domain & State Semantics", () => {
    it("Item 1, 2, 4: changes existing ChordStep duration 4 -> 2, only selected step changes, exact Rational is 2/1", () => {
      const p0 = createDefaultProject("test-dur-1", "Step Duration Test");
      const stepA = createMatrixChordStep(p0, "I", "step-A"); // default duration 4
      const stepB = createMatrixChordStep(p0, "IV", "step-B"); // default duration 4
      const p1 = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [stepA, stepB],
          selectedStepId: "step-A",
        },
      };

      expect(p1.progression.steps[0]!.duration.beats.numerator).toBe(4);
      expect(p1.progression.steps[0]!.duration.beats.denominator).toBe(1);
      expect(p1.progression.steps[1]!.duration.beats.numerator).toBe(4);
      expect(p1.progression.steps[1]!.duration.beats.denominator).toBe(1);

      const command: SetStepDurationCommand = {
        type: "timing/set-step-duration",
        payload: {
          stepId: "step-A",
          duration: musicalDuration(rational(2, 1)),
          nowIso: new Date().toISOString(),
        },
      };

      const applied = setStepDuration(p1, command);
      const updated = applied.project;

      // Item 1: step-A duration changed to 2
      expect(updated.progression.steps[0]!.duration.beats.numerator).toBe(2);
      expect(updated.progression.steps[0]!.duration.beats.denominator).toBe(1);

      // Item 2: step-B remains unchanged at 4
      expect(updated.progression.steps[1]!.duration.beats.numerator).toBe(4);
      expect(updated.progression.steps[1]!.duration.beats.denominator).toBe(1);

      // Item 4: exact Rational representation is 2/1
      expect(updated.progression.steps[0]!.duration.beats).toEqual(rational(2, 1));
    });

    it("Item 3: repeated occurrences of same harmonic function remain strictly independent", () => {
      const p0 = createDefaultProject("test-dur-rep", "Repeated Steps Independence");
      const step1 = createMatrixChordStep(p0, "I", "step-I-1");
      const step2 = createMatrixChordStep(p0, "I", "step-I-2");
      const step3 = createMatrixChordStep(p0, "IV", "step-IV-3");
      const p1 = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [step1, step2, step3],
          selectedStepId: "step-I-1",
        },
      };

      // Edit first I from 4 to 2
      const command: SetStepDurationCommand = {
        type: "timing/set-step-duration",
        payload: {
          stepId: "step-I-1",
          duration: musicalDuration(rational(2, 1)),
          nowIso: new Date().toISOString(),
        },
      };

      const applied = setStepDuration(p1, command);
      const updated = applied.project;

      // First I is 2
      expect(updated.progression.steps[0]!.duration.beats).toEqual(rational(2, 1));
      // Second I is still 4
      expect(updated.progression.steps[1]!.duration.beats).toEqual(rational(4, 1));
      // Third step IV is still 4
      expect(updated.progression.steps[2]!.duration.beats).toEqual(rational(4, 1));
    });

    it("Item 6, 7, 8: Undo restores 4, Redo restores 2, and selection remains on the same step", () => {
      const p0 = createDefaultProject("test-dur-undo", "Undo Redo Test");
      const stepA = createMatrixChordStep(p0, "I", "step-A");
      const initialProject = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [stepA],
          selectedStepId: "step-A",
        },
      };

      const store = new AppStore(initialProject);

      const command: SetStepDurationCommand = {
        type: "timing/set-step-duration",
        payload: {
          stepId: "step-A",
          duration: musicalDuration(rational(2, 1)),
          nowIso: new Date().toISOString(),
        },
      };

      store.dispatch(command, setStepDuration);

      // Present is 2, selectedStepId is preserved
      expect(store.project.progression.steps[0]!.duration.beats).toEqual(rational(2, 1));
      expect(store.project.progression.selectedStepId).toBe("step-A");

      // Undo -> restores 4, selectedStepId preserved
      store.undo();
      expect(store.project.progression.steps[0]!.duration.beats).toEqual(rational(4, 1));
      expect(store.project.progression.selectedStepId).toBe("step-A");

      // Redo -> restores 2, selectedStepId preserved
      store.redo();
      expect(store.project.progression.steps[0]!.duration.beats).toEqual(rational(2, 1));
      expect(store.project.progression.selectedStepId).toBe("step-A");
    });

    it("Item 9: non-timing performance properties (articulation, velocity, register) remain unchanged", () => {
      const p0 = createDefaultProject("test-dur-perf", "Performance Preserved");
      const originalStep = createMatrixChordStep(p0, "V", "step-V");
      const customizedStep: ChordStep = {
        ...originalStep,
        performance: {
          ...originalStep.performance,
          articulation: "arp-up",
          masterVelocity: 95,
          register: 1,
        },
      };

      const project = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [customizedStep],
          selectedStepId: "step-V",
        },
      };

      const command: SetStepDurationCommand = {
        type: "timing/set-step-duration",
        payload: {
          stepId: "step-V",
          duration: musicalDuration(rational(2, 1)),
          nowIso: new Date().toISOString(),
        },
      };

      const updated = setStepDuration(project, command).project;
      const target = updated.progression.steps[0] as ChordStep;

      expect(target.duration.beats).toEqual(rational(2, 1));
      expect(target.performance.articulation).toBe("arp-up");
      expect(target.performance.masterVelocity).toBe(95);
      expect(target.performance.register).toBe(1);
    });

    it("Item 10: Reset Performance preserves edited Duration (regression invariant)", () => {
      const p0 = createDefaultProject("test-dur-reset", "Reset Preserves Duration");
      const step = createMatrixChordStep(p0, "vi", "step-vi");
      const customized: ChordStep = {
        ...step,
        duration: musicalDuration(rational(2, 1)), // customized duration = 2
        performance: {
          ...step.performance,
          masterVelocity: 110,
          articulation: "broken-chord",
        },
      };

      const project = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [customized],
          selectedStepId: "step-vi",
        },
      };

      // Direct domain reset
      const resetDirect = resetChordStepPerformance(customized, project.defaults.piano);
      expect(resetDirect.duration.beats).toEqual(rational(2, 1));
      expect(resetDirect.performance.masterVelocity).toBe(
        project.defaults.piano.performance.masterVelocity,
      );

      // Command dispatcher reset
      const resetCommand: ResetStepPerformanceCommand = {
        type: "progression/reset-performance",
        payload: {
          stepId: "step-vi",
          nowIso: new Date().toISOString(),
        },
      };

      const resetProject = resetStepPerformance(project, resetCommand).project;
      const afterResetStep = resetProject.progression.steps[0] as ChordStep;
      expect(afterResetStep.duration.beats).toEqual(rational(2, 1));
      expect(afterResetStep.performance.masterVelocity).toBe(
        project.defaults.piano.performance.masterVelocity,
      );
    });

    it("Item 11: fractional custom duration (3/2, 2/3, 5/4) retains exact Rational precision", () => {
      const p0 = createDefaultProject("test-dur-frac", "Fractional Precision");
      const step = createMatrixChordStep(p0, "ii", "step-ii");
      let project = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [step],
          selectedStepId: "step-ii",
        },
      };

      for (const [num, den] of [
        [3, 2],
        [2, 3],
        [1, 3],
        [5, 4],
        [7, 8],
      ]) {
        const command: SetStepDurationCommand = {
          type: "timing/set-step-duration",
          payload: {
            stepId: "step-ii",
            duration: musicalDuration(rational(num, den)),
            nowIso: new Date().toISOString(),
          },
        };
        project = setStepDuration(project, command).project;
        expect(project.progression.steps[0]!.duration.beats).toEqual(rational(num, den));
      }
    });

    it("Item 12: Rest Step duration editing shares exact same timing command path", () => {
      const p0 = createDefaultProject("test-dur-rest", "Rest Step Duration");
      const addRestCmd: AddRestStepCommand = {
        type: "progression/add-rest",
        payload: { nowIso: new Date().toISOString() },
      };
      const p1 = addRestStep(p0, addRestCmd).project;
      const restStep = p1.progression.steps[0] as RestStep;
      expect(restStep.kind).toBe("rest");
      expect(restStep.duration.beats).toEqual(rational(1, 1)); // default quarter rest (1 beat)

      // Change rest step duration from 4 to 2
      const setDurCmd: SetStepDurationCommand = {
        type: "timing/set-step-duration",
        payload: {
          stepId: restStep.id,
          duration: musicalDuration(rational(2, 1)),
          nowIso: new Date().toISOString(),
        },
      };
      const p2 = setStepDuration(p1, setDurCmd).project;
      expect(p2.progression.steps[0]!.duration.beats).toEqual(rational(2, 1));

      // Change rest step duration to fractional 1/2
      const setFracCmd: SetStepDurationCommand = {
        type: "timing/set-step-duration",
        payload: {
          stepId: restStep.id,
          duration: musicalDuration(rational(1, 2)),
          nowIso: new Date().toISOString(),
        },
      };
      const p3 = setStepDuration(p2, setFracCmd).project;
      expect(p3.progression.steps[0]!.duration.beats).toEqual(rational(1, 2));
    });

    it("Item 13: timeline duration projection reflects changed duration in canonical beats and seconds", () => {
      const p0 = createDefaultProject("test-dur-timeline", "Timeline Projection");
      const step1 = createMatrixChordStep(p0, "I", "s1"); // 4
      const step2 = createMatrixChordStep(p0, "IV", "s2"); // 4
      const p1 = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [step1, step2],
          selectedStepId: "s1",
        },
      };

      const timelineBefore = createProgressionTimeline(p1.progression.steps, p1.globalTiming.meter);
      expect(timelineBefore.totalDurationBeats).toEqual(rational(8, 1));
      expect(timelineBefore.steps[0]!.durationBeats).toEqual(rational(4, 1));
      expect(timelineBefore.steps[1]!.startBeats).toEqual(rational(4, 1));

      // Change step1: 4 -> 2
      const p2 = setStepDuration(p1, {
        type: "timing/set-step-duration",
        payload: {
          stepId: "s1",
          duration: musicalDuration(rational(2, 1)),
          nowIso: new Date().toISOString(),
        },
      }).project;

      const timelineAfter = createProgressionTimeline(p2.progression.steps, p2.globalTiming.meter);
      expect(timelineAfter.totalDurationBeats).toEqual(rational(6, 1));
      expect(timelineAfter.steps[0]!.durationBeats).toEqual(rational(2, 1));
      // Step 2 starts at beat 2 instead of beat 4
      expect(timelineAfter.steps[1]!.startBeats).toEqual(rational(2, 1));
    });
  });

  describe("2. UI Component: StepDurationControl", () => {
    it("renders Duration label programmatically associated with select element", () => {
      const onChange = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          createElement(StepDurationControl, {
            value: musicalDuration(rational(4, 1)),
            onChange,
            id: "test-step-dur-id",
          }),
        );
      });

      const label = container.querySelector('label[for="test-step-dur-id"]');
      const select = container.querySelector("#test-step-dur-id") as HTMLSelectElement;

      expect(label).not.toBeNull();
      expect(label?.textContent).toContain("Duration");
      expect(select).not.toBeNull();
      expect(select.value).toBe("4/1");

      act(() => {
        root.unmount();
      });
    });

    it("selecting Half preset immediately fires onChange with rational(2, 1)", () => {
      const onChange = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          createElement(StepDurationControl, {
            value: musicalDuration(rational(4, 1)),
            onChange,
          }),
        );
      });

      const select = container.querySelector("select") as HTMLSelectElement;
      expect(select.value).toBe("4/1");

      act(() => {
        select.value = "2/1";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const passedDur = onChange.mock.calls[0][0] as MusicalDuration;
      expect(passedDur.beats).toEqual(rational(2, 1));

      act(() => {
        root.unmount();
      });
    });

    it("selecting Custom displays custom input row and parses valid exact fraction", () => {
      const onChange = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          createElement(StepDurationControl, {
            value: musicalDuration(rational(2, 1)),
            onChange,
          }),
        );
      });

      const select = container.querySelector("select") as HTMLSelectElement;

      // Select Custom
      act(() => {
        select.value = "custom";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Custom input row is now visible
      const customInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      const setBtn = container.querySelector("button.step-duration-set-btn") as HTMLButtonElement;

      expect(customInput).not.toBeNull();
      expect(setBtn).not.toBeNull();

      // Enter 3/4
      act(() => {
        setInputValue(customInput, "3/4");
        setBtn.click();
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const passedDur = onChange.mock.calls[0][0] as MusicalDuration;
      expect(passedDur.beats).toEqual(rational(3, 4));

      act(() => {
        root.unmount();
      });
    });

    it("entering invalid custom duration displays accessible error alert", () => {
      const onChange = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          createElement(StepDurationControl, {
            value: musicalDuration(rational(2, 1)),
            onChange,
          }),
        );
      });

      const select = container.querySelector("select") as HTMLSelectElement;

      act(() => {
        select.value = "custom";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const customInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      const setBtn = container.querySelector("button.step-duration-set-btn") as HTMLButtonElement;

      // Enter invalid string
      act(() => {
        setInputValue(customInput, "not-a-number");
        setBtn.click();
      });

      expect(onChange).not.toHaveBeenCalled();
      const errorMsg = container.querySelector('[role="alert"]');
      expect(errorMsg).not.toBeNull();
      expect(errorMsg?.textContent).toContain("Invalid format");

      act(() => {
        root.unmount();
      });
    });
  });

  describe("3. UI Integration: ProgressionStepCard and ProgressionTrack", () => {
    it("Item 5: card summary reflects duration change · 4 -> · 2 immediately", () => {
      const p0 = createDefaultProject("test-card-summary", "Card Summary Test");
      const step = createMatrixChordStep(p0, "I", "step-1");
      const onDurationChange = vi.fn();
      const root = createRoot(container);

      // Render with 4 beats
      act(() => {
        root.render(
          createElement(ProgressionStepCard, {
            step,
            tonic: p0.tonic,
            selected: true,
            canReplace: false,
            onSelect: vi.fn(),
            onPerformanceChange: vi.fn(),
            onDurationChange,
            onViewChange: vi.fn(),
            onReplace: vi.fn(),
            onReset: vi.fn(),
            onRemove: vi.fn(),
            onMoveLeft: vi.fn(),
            onMoveRight: vi.fn(),
          }),
        );
      });

      const summarySpan = container.querySelector(".step-view > span");
      expect(summarySpan?.textContent).toContain("· 4");

      // Verify Duration control exists inside .step-editor after Register
      const durationSelect = container.querySelector('[data-testid="step-duration-select"]');
      expect(durationSelect).not.toBeNull();

      // Render updated step with 2 beats
      const stepUpdated: ChordStep = {
        ...step,
        duration: musicalDuration(rational(2, 1)),
      };

      act(() => {
        root.render(
          createElement(ProgressionStepCard, {
            step: stepUpdated,
            tonic: p0.tonic,
            selected: true,
            canReplace: false,
            onSelect: vi.fn(),
            onPerformanceChange: vi.fn(),
            onDurationChange,
            onViewChange: vi.fn(),
            onReplace: vi.fn(),
            onReset: vi.fn(),
            onRemove: vi.fn(),
            onMoveLeft: vi.fn(),
            onMoveRight: vi.fn(),
          }),
        );
      });

      expect(summarySpan?.textContent).toContain("· 2");
      expect(summarySpan?.textContent).not.toContain("· 4");

      act(() => {
        root.unmount();
      });
    });

    it("ProgressionTrack integrates RestStep and ChordStep duration editing cleanly", () => {
      const p0 = createDefaultProject("test-track-rest", "Track Rest Test");
      const chordStep = createMatrixChordStep(p0, "I", "c1");
      const restStep: RestStep = {
        id: "r1",
        kind: "rest",
        duration: musicalDuration(rational(4, 1)),
      };
      const project = {
        ...p0,
        progression: {
          ...p0.progression,
          steps: [chordStep, restStep],
          selectedStepId: "r1", // Rest step selected
        },
      };

      const onDurationChange = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          createElement(ProgressionTrack, {
            project,
            onSelectStep: vi.fn(),
            onEditPerformance: vi.fn(),
            onDurationChange,
            onSetStepView: vi.fn(),
            onSetAllViews: vi.fn(),
            onReplace: vi.fn(),
            onReset: vi.fn(),
            onRemove: vi.fn(),
            onReorder: vi.fn(),
          }),
        );
      });

      // Rest card has summary and expanded editor when selected
      const restCard = container.querySelector(".progression-rest-card.is-selected");
      expect(restCard).not.toBeNull();
      expect(restCard?.textContent).toContain("Rest");
      expect(restCard?.textContent).toContain("4");

      const durationSelect = restCard?.querySelector(
        '[data-testid="step-duration-select"]',
      ) as HTMLSelectElement;
      expect(durationSelect).not.toBeNull();
      expect(durationSelect.value).toBe("4/1");

      // Change rest duration to Half
      act(() => {
        durationSelect.value = "2/1";
        durationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(onDurationChange).toHaveBeenCalledWith("r1", musicalDuration(rational(2, 1)));

      act(() => {
        root.unmount();
      });
    });
  });
});
