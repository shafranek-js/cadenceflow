// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PianoPerformanceInspector } from "../../../src/ui/inspector/PianoPerformanceInspector";
import { VoiceLeadingMenu } from "../../../src/ui/progression/VoiceLeadingMenu";
import type { ChordStep, StepPerformance } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

const el = React.createElement;

function mountToDom(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function makeChordStep(performanceOverrides?: Partial<StepPerformance>): ChordStep {
  return {
    id: "step-1",
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId: "I" },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(4, 4)),
    performance: {
      articulation: "block",
      register: "auto",
      voicingMode: "auto",
      bass: { choice: "auto", octaveOffset: "auto" },
      masterVelocity: 80,
      perNoteVelocityOverrides: {},
      dynamicsViewPreference: "musical",
      ...performanceOverrides,
    },
    cardView: "harmonic",
  };
}

describe("Piano Performance Inspector — Inversions and Voice Leading UI", () => {
  it("renders inversion dropdown and quick pills in voicing disclosure", () => {
    const onPerformanceChange = vi.fn();
    const step = makeChordStep();
    const { container, unmount } = mountToDom(
      el(PianoPerformanceInspector, {
        step,
        tonic: 0,
        context: { tonic: 0, mode: "major", activeModuleId: "progressions" },
        onPerformanceChange,
        onOpenVoicingEditor: vi.fn(),
      }),
    );

    const inversionSelect = container.querySelector('[data-testid="inversion-select"]');
    expect(inversionSelect).not.toBeNull();

    const pillAuto = container.querySelector('[data-testid="inversion-pill-auto"]');
    const pill1 = container.querySelector('[data-testid="inversion-pill-1"]');
    const pill2 = container.querySelector('[data-testid="inversion-pill-2"]');
    const pill3 = container.querySelector('[data-testid="inversion-pill-3"]');

    expect(pillAuto).not.toBeNull();
    expect(pill1).not.toBeNull();
    expect(pill2).not.toBeNull();
    expect(pill3).not.toBeNull();

    // Clicking 1st inversion pill calls onPerformanceChange with inversion: 1
    act(() => {
      pill1?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPerformanceChange).toHaveBeenCalledWith({ inversion: 1 });

    unmount();
  });

  it("renders 7th bass note option and pills in bass disclosure", () => {
    const onPerformanceChange = vi.fn();
    const step = makeChordStep();
    const { container, unmount } = mountToDom(
      el(PianoPerformanceInspector, {
        step,
        tonic: 0,
        context: { tonic: 0, mode: "major", activeModuleId: "progressions" },
        onPerformanceChange,
        onOpenVoicingEditor: vi.fn(),
      }),
    );

    const bassPill7th = container.querySelector('[data-testid="bass-pill-seventh"]');
    expect(bassPill7th).not.toBeNull();
    expect(bassPill7th?.textContent).toBe("7th");

    act(() => {
      bassPill7th?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPerformanceChange).toHaveBeenCalledWith({
      bass: expect.objectContaining({ choice: "seventh" }),
    });

    unmount();
  });

  it("renders VoiceLeadingMenu and dispatches selected strategy", () => {
    const onApply = vi.fn();
    const { container, unmount } = mountToDom(
      el(VoiceLeadingMenu, {
        onApplyVoiceLeading: onApply,
      }),
    );

    const trigger = container.querySelector('[data-testid="voice-leading-menu-trigger"]');
    expect(trigger).not.toBeNull();

    // Open dropdown
    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const dropdown = container.querySelector('[data-testid="voice-leading-dropdown"]');
    expect(dropdown).not.toBeNull();

    const smoothAllBtn = container.querySelector('[data-testid="vl-strategy-smooth-all"]');
    expect(smoothAllBtn).not.toBeNull();

    // Click smooth-all strategy
    act(() => {
      smoothAllBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onApply).toHaveBeenCalledWith("smooth-all");

    unmount();
  });
});
