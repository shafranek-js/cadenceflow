// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PianoPerformanceInspector } from "../../../src/ui/inspector/PianoPerformanceInspector";
import { MelodyContextMenu } from "../../../src/ui/melody/MelodyContextMenu";
import type { ChordStep } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { ChordSubstitution } from "../../../src/domain/harmony/reharmonization";

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

function makeChordStep(functionId = "I"): ChordStep {
  return {
    id: "step-1",
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId, category: "core" },
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
    },
    cardView: "harmonic",
  };
}

describe("Reharmonization UI — Inspector and Context Menu", () => {
  it("renders Reharmonization disclosure with substitution cards for tonic chord I", () => {
    const onApplySubstitution = vi.fn();
    const onAuditionSubstitution = vi.fn();
    const step = makeChordStep("I");

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
        onPerformanceChange: vi.fn(),
        onOpenVoicingEditor: vi.fn(),
        onApplySubstitution,
        onAuditionSubstitution,
      }),
    );

    const disclosure = container.querySelector(".reharmonization-disclosure");
    expect(disclosure).not.toBeNull();

    const list = container.querySelector('[data-testid="reharmonization-list"]');
    expect(list).not.toBeNull();

    // Check specific substitution cards are rendered
    const viCard = container.querySelector('[data-testid="reharmonization-card-I-to-vi"]');
    expect(viCard).not.toBeNull();
    expect(viCard?.textContent).toContain("Am");
    expect(viCard?.textContent).toContain("Swap to Relative Minor (vi)");
    expect(viCard?.textContent).toContain("Why it works");

    const v7InsertCard = container.querySelector('[data-testid="reharmonization-card-I-insert-V7"]');
    expect(v7InsertCard).not.toBeNull();
    expect(v7InsertCard?.textContent).toContain("G7");
    expect(v7InsertCard?.textContent).toContain("Insert Before");

    const subV7Card = container.querySelector('[data-testid="reharmonization-card-I-insert-subV7"]');
    expect(subV7Card).not.toBeNull();
    expect(subV7Card?.textContent).toContain("Db7");
    expect(subV7Card?.textContent).toContain("Tritone Sub");

    unmount();
  });

  it("triggers onAuditionSubstitution and onApplySubstitution when clicked", () => {
    const onApplySubstitution = vi.fn();
    const onAuditionSubstitution = vi.fn();
    const step = makeChordStep("I");

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
        onPerformanceChange: vi.fn(),
        onOpenVoicingEditor: vi.fn(),
        onApplySubstitution,
        onAuditionSubstitution,
        auditioningSubstitutionId: "I-to-vi",
      }),
    );

    // Audition button for I-to-vi should have is-playing state
    const auditionBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="sub-audition-btn-I-to-vi"]',
    );
    expect(auditionBtn).not.toBeNull();
    expect(auditionBtn?.classList.contains("is-playing")).toBe(true);

    // Click audition for another card
    const subV7Audition = container.querySelector<HTMLButtonElement>(
      '[data-testid="sub-audition-btn-I-insert-subV7"]',
    );
    expect(subV7Audition).not.toBeNull();
    act(() => {
      subV7Audition?.click();
    });
    expect(onAuditionSubstitution).toHaveBeenCalledWith(
      expect.objectContaining({ id: "I-insert-subV7", targetFunctionId: "subV7" }),
    );

    // Click apply
    const applyBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="sub-apply-btn-I-to-vi"]',
    );
    expect(applyBtn).not.toBeNull();
    act(() => {
      applyBtn?.click();
    });
    expect(onApplySubstitution).toHaveBeenCalledWith(
      expect.objectContaining({ id: "I-to-vi", targetFunctionId: "vi" }),
    );

    unmount();
  });

  it("renders Reharmonize options in MelodyContextMenu and applies on click", () => {
    const onApplySubstitution = vi.fn();
    const onClose = vi.fn();
    const step = makeChordStep("IV");
    const testSub: ChordSubstitution = {
      id: "IV-to-iv",
      kind: "modal-swap",
      title: "Minor Subdominant swap (iv)",
      targetFunctionId: "iv",
      operation: "replace",
      chordSymbol: "Fm",
      description: "Borrow minor subdominant from parallel minor.",
      theoreticalRationale: "Emotional plagal cadence.",
      tags: ["Modal Mixture"],
    };

    const invoker = document.createElement("button");
    document.body.appendChild(invoker);

    const { container, unmount } = mountToDom(
      el(MelodyContextMenu, {
        step,
        position: { x: 100, y: 100 },
        invoker,
        tonic: 0,
        substitutions: [testSub],
        onApplySubstitution,
        onClose,
      }),
    );

    const reharmBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="step-menu-reharmonize-IV-to-iv"]',
    );
    expect(reharmBtn).not.toBeNull();
    expect(reharmBtn?.textContent).toContain("Swap to Fm");

    act(() => {
      reharmBtn?.click();
    });
    expect(onApplySubstitution).toHaveBeenCalledWith(testSub);
    expect(onClose).toHaveBeenCalled();

    unmount();
    invoker.remove();
  });
});
