// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PianoPerformanceInspector } from "../../../src/ui/inspector/PianoPerformanceInspector";
import {
  ChordPropertiesInspector,
  ChordPropertiesUnavailable,
} from "../../../src/ui/inspector/ChordPropertiesInspector";
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
    harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
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
  it("renders selected chord controls and dispatches Type through the canonical edit callback", () => {
    const onEdit = vi.fn();
    const step = makeChordStep();
    const { container, unmount } = mountToDom(
      el(ChordPropertiesInspector, {
        step,
        tonic: 0,
        context: {
          tonic: 0,
          mode: "major",
          moduleId: "progressions",
          spellingContext: { tonic: 0, mode: "major" },
        },
        onEdit,
      }),
    );

    expect(
      container.querySelector('[data-testid="chord-properties-sounding"]')?.textContent,
    ).toContain("C");
    const typeButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="chord-properties-type-9"]',
    );
    expect(
      container.querySelector('[data-testid="chord-properties-type"]')?.getAttribute("role"),
    ).toBe("group");
    expect(typeButton).not.toBeNull();
    act(() => {
      if (!typeButton) throw new Error("Expected the Type 9 button");
      typeButton.click();
    });
    expect(onEdit).toHaveBeenCalledWith({ type: "type", value: "9" });

    unmount();
  });

  it("explains the unavailable state for Rest or no selected chord", () => {
    const { container, unmount } = mountToDom(
      el(ChordPropertiesUnavailable, {
        message: "Chord Properties are unavailable for a Rest. Select a chord Step.",
      }),
    );

    expect(container.querySelector('[aria-label="Chord Properties"]')?.textContent).toContain(
      "unavailable for a Rest",
    );
    expect(container.querySelector("select, input, button")).toBeNull();
    unmount();
  });

  it("shows Borrow provenance and disables mutually exclusive Secondary", () => {
    const onEdit = vi.fn();
    const source = makeChordStep();
    const borrowed: ChordStep = {
      ...source,
      harmonicFunction: {
        moduleId: "progressions",
        functionId: "mode-dorian-1",
        category: "modal-interchange",
        borrowedFromMode: "dorian",
        borrowedDegree: 1,
      },
    };
    const { container, unmount } = mountToDom(
      el(ChordPropertiesInspector, {
        step: borrowed,
        tonic: 0,
        context: {
          tonic: 0,
          mode: "major",
          moduleId: "progressions",
          spellingContext: { tonic: 0, mode: "major" },
        },
        onEdit,
      }),
    );

    const borrowedLabel = container.querySelector(".chord-properties-function")?.textContent ?? "";
    expect(borrowedLabel).toContain("i⁷ (borrowed from Dorian)");
    expect(borrowedLabel).not.toContain("mode-");
    expect(
      container.querySelector<HTMLSelectElement>('[data-testid="chord-properties-secondary"]')
        ?.disabled,
    ).toBe(true);
    expect(container.textContent).toContain("mutually exclusive");
    expect(
      container.querySelector<HTMLSelectElement>('[data-testid="chord-properties-borrow"]')?.value,
    ).toBe("dorian");

    unmount();
  });

  it("keeps manual exact voicing authoritative and disables tone-set/function controls", () => {
    const onEdit = vi.fn();
    const manual = makeChordStep({
      voicingMode: "manual",
      manualVoicing: [],
    });
    const { container, unmount } = mountToDom(
      el(ChordPropertiesInspector, {
        step: manual,
        tonic: 0,
        context: {
          tonic: 0,
          mode: "major",
          moduleId: "progressions",
          spellingContext: { tonic: 0, mode: "major" },
        },
        onEdit,
      }),
    );

    expect(
      container.querySelector('[data-testid="chord-properties-manual-note"]')?.textContent,
    ).toContain("exact sounding notes");
    expect(
      container.querySelector<HTMLButtonElement>('[data-testid="chord-properties-type-9"]')
        ?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLSelectElement>('[data-testid="chord-properties-quality"]')
        ?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLFieldSetElement>(".chord-properties-options")?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLSelectElement>('[data-testid="chord-properties-secondary"]')
        ?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLSelectElement>('[data-testid="chord-properties-borrow"]')
        ?.disabled,
    ).toBe(true);

    unmount();
  });

  it("disables Diminished quality while a suspension is active", () => {
    const suspended = makeChordStep();
    const { container, unmount } = mountToDom(
      el(ChordPropertiesInspector, {
        step: {
          ...suspended,
          harmonicVariant: { ...suspended.harmonicVariant, suspensions: ["sus4"] },
        },
        tonic: 0,
        context: {
          tonic: 0,
          mode: "major",
          moduleId: "progressions",
          spellingContext: { tonic: 0, mode: "major" },
        },
        onEdit: vi.fn(),
      }),
    );

    expect(
      container.querySelector<HTMLOptionElement>(
        '[data-testid="chord-properties-quality"] option[value="diminished"]',
      )?.disabled,
    ).toBe(true);
    expect(container.textContent).toContain("Clear sus2/sus4 before choosing Diminished quality.");

    unmount();
  });

  it("keeps upper inversion available while its separate Bass controls are disabled", () => {
    const step = makeChordStep({ inversion: 1, bass: { choice: "third", octaveOffset: "auto" } });
    const { container, unmount } = mountToDom(
      el(ChordPropertiesInspector, {
        step,
        tonic: 0,
        context: {
          tonic: 0,
          mode: "major",
          moduleId: "progressions",
          spellingContext: { tonic: 0, mode: "major" },
        },
        independentBassEnabled: false,
        onEdit: vi.fn(),
      }),
    );

    expect(
      container.querySelector<HTMLSelectElement>('[data-testid="chord-properties-inversion"]')
        ?.disabled,
    ).toBe(false);
    expect(
      container.querySelector('[data-testid="chord-properties-bass"]')?.hasAttribute("disabled"),
    ).toBe(true);
    expect(container.textContent).toContain("Independent bass voice is off");

    unmount();
  });

  it("shows an unsupported existing secondary without labeling it None or V7/I", () => {
    const step: ChordStep = {
      ...makeChordStep(),
      harmonicFunction: {
        moduleId: "progressions",
        functionId: "subV7",
        category: "secondary-dominant",
        targetFunctionId: "I",
        targetId: "I",
      },
    };
    const { container, unmount } = mountToDom(
      el(ChordPropertiesInspector, {
        step,
        tonic: 0,
        context: {
          tonic: 0,
          mode: "major",
          moduleId: "progressions",
          spellingContext: { tonic: 0, mode: "major" },
        },
        onEdit: vi.fn(),
      }),
    );
    const secondary = container.querySelector<HTMLSelectElement>(
      '[data-testid="chord-properties-secondary"]',
    );
    expect(secondary?.value).toBe("unavailable");
    expect(new Set(Array.from(secondary?.options ?? [], (option) => option.value)).size).toBe(
      secondary?.options.length,
    );
    expect(container.textContent).toContain("not a supported V/vii target here");
    unmount();
  });

  it("keeps inversion and bass controls out of the separate performance disclosure", () => {
    const onPerformanceChange = vi.fn();
    const step = makeChordStep();
    const { container, unmount } = mountToDom(
      el(PianoPerformanceInspector, {
        step,
        tonic: 0,
        context: {
          tonic: 0,
          mode: "major",
          moduleId: "progressions",
          spellingContext: { tonic: 0, mode: "major" },
        },
        onPerformanceChange,
        onOpenVoicingEditor: vi.fn(),
      }),
    );

    expect(container.querySelector('[data-testid="inversion-select"]')).toBeNull();
    expect(container.querySelector('[data-testid="bass-choice-select"]')).toBeNull();
    expect(container.querySelector("#voicing-mode-select")).not.toBeNull();

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
