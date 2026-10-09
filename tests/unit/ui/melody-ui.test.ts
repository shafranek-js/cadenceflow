import { requireChord } from "../../fixtures/assertions";
// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PIANO_PERFORMANCE,
  createDefaultProject,
} from "../../../src/domain/project/factory";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import {
  MELODY_PITCH_MOTIONS,
  snapshotChordMelody,
  type ChordMelody,
  type MelodyRecipeInput,
} from "../../../src/domain/melody/types";
import type { ChordStep } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { MelodyContextMenu } from "../../../src/ui/melody/MelodyContextMenu";
import { MelodyEditorDialog } from "../../../src/ui/melody/MelodyEditorDialog";
import { MelodyTrackControls } from "../../../src/ui/melody/MelodyTrackControls";
import {
  MELODY_PITCH_MOTION_GALLERY_GROUPS,
  MELODY_PITCH_MOTION_LABELS,
} from "../../../src/ui/melody/labels";

const el = React.createElement;

function mountToDom(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender(next: React.ReactElement) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

// Callers pass a bare recipe literal; the helper adds the `{ mode: "generated" as const, recipe }` wrapper
// that `ChordStep.melody` requires.
function makeStep(id = "source-step", melody?: ChordMelody | MelodyRecipeInput): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(2)),
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "staff",
    ...(melody ? { melody: snapshotChordMelody(melody) } : {}),
  };
}

function makeProject(step: ChordStep = makeStep()) {
  const base = createDefaultProject("melody-ui", "Melody UI");
  return {
    ...base,
    progression: { ...base.progression, steps: Object.freeze([step]) },
  };
}

describe("T170 — Melody UI", () => {
  it("keeps the grouped Pitch Motion catalog complete and stable", () => {
    const groupedMotions = MELODY_PITCH_MOTION_GALLERY_GROUPS.flatMap((group) => group.motions);

    expect(groupedMotions).toEqual([...MELODY_PITCH_MOTIONS]);
    expect(new Set(groupedMotions).size).toBe(MELODY_PITCH_MOTIONS.length);
    expect(MELODY_PITCH_MOTION_GALLERY_GROUPS.map((group) => group.label)).toEqual([
      "Directional",
      "Shapes",
      "Pedal & Alternating",
    ]);
    for (const pitchMotion of MELODY_PITCH_MOTIONS) {
      expect(MELODY_PITCH_MOTION_LABELS[pitchMotion]).toBeTruthy();
    }
  });

  it("renders the correct create/edit/remove menu and restores focus on Escape", async () => {
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();
    const close = vi.fn();
    const mounted = mountToDom(
      el(MelodyContextMenu, {
        step: makeStep(),
        position: { x: 20, y: 20 },
        invoker,
        onEdit: vi.fn(),
        onRemove: vi.fn(),
        onCreate: vi.fn(),
        onClose: close,
      }),
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mounted.container.querySelector('[role="menu"]')).not.toBeNull();
    expect(mounted.container.textContent).toContain("Create Melody…");
    expect(mounted.container.textContent).not.toContain("Remove Melody");
    expect(document.activeElement?.textContent).toBe("Create Melody…");

    const menu = mounted.container.querySelector('[role="menu"]') as HTMLElement;
    act(() => menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(close).toHaveBeenCalledTimes(1);
    mounted.unmount();
    expect(document.activeElement).toBe(invoker);

    const editDom = renderToString(
      el(MelodyContextMenu, {
        step: makeStep("with-recipe", {
          pitchMotion: "down",
          rhythm: "even",
          connection: "retrigger",
          grid: "sixteenth",
          octaveOffset: -1,
        }),
        position: { x: 20, y: 20 },
        invoker,
        onEdit: vi.fn(),
        onRemove: vi.fn(),
        onCreate: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    expect(editDom).toContain("Edit Melody…");
    expect(editDom).toContain("Remove Melody");
    expect(editDom).not.toContain("Create Melody…");
    invoker.remove();
  });

  it("hydrates the editor, keeps changes local, and applies recipe plus instrument once", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const project = makeProject(
      makeStep("editable", {
        pitchMotion: "down",
        rhythm: "even",
        connection: "retrigger",
        grid: "sixteenth",
        octaveOffset: -1,
      }),
    );
    const mounted = mountToDom(
      el(MelodyEditorDialog, {
        isOpen: true,
        mode: "edit",
        step: requireChord(project.progression.steps[0]),
        project,
        restoreFocusRef: { current: null },
        onClose,
        onApply,
      }),
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    const pitchMotion = mounted.container.querySelector(
      '[aria-label="Pitch Motion"]',
    ) as HTMLSelectElement;
    const rhythm = mounted.container.querySelector('[aria-label="Rhythm"]') as HTMLSelectElement;
    const connection = mounted.container.querySelector(
      '[aria-label="Connection"]',
    ) as HTMLSelectElement;
    const grid = mounted.container.querySelector('[aria-label="Grid"]') as HTMLSelectElement;
    const octave = mounted.container.querySelector(
      '[aria-label="Octave offset"]',
    ) as HTMLSelectElement;
    const instrument = mounted.container.querySelector(
      '[aria-label="Melody Instrument"]',
    ) as HTMLSelectElement;
    expect(pitchMotion.value).toBe("down");
    expect(rhythm.value).toBe("even");
    expect(connection.value).toBe("retrigger");
    expect(grid.value).toBe("sixteenth");
    expect(octave.value).toBe("-1");
    expect(instrument.value).toBe("flute");

    act(() => {
      pitchMotion.value = "outside-in";
      pitchMotion.dispatchEvent(new Event("change", { bubbles: true }));
      instrument.value = "cello";
      instrument.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onApply).not.toHaveBeenCalled();
    const apply = mounted.container.querySelector(
      '[data-testid="melody-editor-apply"]',
    ) as HTMLButtonElement;
    act(() => apply.click());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      {
        pitchMotion: "outside-in",
        rhythm: "even",
        connection: "retrigger",
        grid: "sixteenth",
        octaveOffset: -1,
      },
      "cello",
    );
    expect(onClose).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it("disables Apply on octave overflow without clamping the draft", () => {
    const highStep: ChordStep = {
      ...makeStep("high"),
      duration: musicalDuration(rational(1)),
      performance: {
        ...DEFAULT_PIANO_PERFORMANCE,
        voicingMode: "manual",
        manualVoicing: Object.freeze([exactPitch(120, { step: "C", alter: 0 })]),
      },
    };
    const project = makeProject(highStep);
    const mounted = mountToDom(
      el(MelodyEditorDialog, {
        isOpen: true,
        mode: "create",
        step: highStep,
        project,
        restoreFocusRef: { current: null },
        onClose: vi.fn(),
        onApply: vi.fn(),
      }),
    );
    const octave = mounted.container.querySelector(
      '[aria-label="Octave offset"]',
    ) as HTMLSelectElement;
    act(() => {
      octave.value = "1";
      octave.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      mounted.container.querySelector('[data-testid="melody-editor-error"]')?.textContent,
    ).toContain("outside 0..127");
    expect(
      (mounted.container.querySelector('[data-testid="melody-editor-apply"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(octave.value).toBe("1");
    mounted.unmount();
  });

  it("synchronizes gallery selection, preserves draft axes, and returns focus in two Escapes", async () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const project = makeProject(
      makeStep("gallery", {
        pitchMotion: "up",
        rhythm: "dotted",
        connection: "tie-repeated",
        grid: "sixteenth-triplet",
        octaveOffset: 1,
      }),
    );
    const mounted = mountToDom(
      el(MelodyEditorDialog, {
        isOpen: true,
        mode: "edit",
        step: requireChord(project.progression.steps[0]),
        project,
        restoreFocusRef: { current: null },
        onClose,
        onApply,
      }),
    );

    const browse = mounted.container.querySelector(
      '[aria-label="Browse motions"]',
    ) as HTMLButtonElement;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    act(() => browse.click());

    const gallery = mounted.container.querySelector(
      '[data-testid="melody-pitch-motion-gallery"]',
    ) as HTMLElement;
    expect(gallery).not.toBeNull();
    expect(gallery.querySelectorAll('[role="radio"]')).toHaveLength(10);
    expect(gallery.querySelectorAll(".melody-pitch-motion-gallery-group")).toHaveLength(3);

    const pitchMotion = mounted.container.querySelector(
      '[aria-label="Pitch Motion"]',
    ) as HTMLSelectElement;
    const rhythm = mounted.container.querySelector('[aria-label="Rhythm"]') as HTMLSelectElement;
    const connection = mounted.container.querySelector(
      '[aria-label="Connection"]',
    ) as HTMLSelectElement;
    const grid = mounted.container.querySelector('[aria-label="Grid"]') as HTMLSelectElement;
    const octave = mounted.container.querySelector(
      '[aria-label="Octave offset"]',
    ) as HTMLSelectElement;
    const tile = gallery.querySelector(
      '[data-pitch-motion="alternate-root-up"]',
    ) as HTMLButtonElement;
    act(() => tile.click());
    expect(pitchMotion.value).toBe("alternate-root-up");
    expect(rhythm.value).toBe("dotted");
    expect(connection.value).toBe("tie-repeated");
    expect(grid.value).toBe("sixteenth-triplet");
    expect(octave.value).toBe("1");
    expect(onApply).not.toHaveBeenCalled();

    act(() => {
      tile.focus();
      tile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(pitchMotion.value).toBe("alternate-top-down");
    expect(document.activeElement).toBe(
      gallery.querySelector('[data-pitch-motion="alternate-top-down"]'),
    );

    act(() => tile.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).not.toHaveBeenCalled();
    expect(
      mounted.container.querySelector('[data-testid="melody-pitch-motion-gallery"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(browse);

    act(() => browse.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });

  it("commits a pointer volume drag once and exposes immediate mute/solo semantics", () => {
    const onChange = vi.fn();
    const mounted = mountToDom(
      el(MelodyTrackControls, {
        settings: { instrument: "flute", muted: false, solo: false, volume: 100 },
        onChange,
      }),
    );
    const volume = mounted.container.querySelector(
      '[aria-label="Melody Track Volume"]',
    ) as HTMLInputElement;
    act(() => {
      const setNativeValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      volume.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      setNativeValue?.call(volume, "72");
      volume.dispatchEvent(new Event("input", { bubbles: true }));
      setNativeValue?.call(volume, "64");
      volume.dispatchEvent(new Event("input", { bubbles: true }));
      volume.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ volume: 64 });

    const mute = mounted.container.querySelector(
      '[aria-label="Mute Melody Track"]',
    ) as HTMLButtonElement;
    const solo = mounted.container.querySelector(
      '[aria-label="Solo Melody Track"]',
    ) as HTMLButtonElement;
    act(() => mute.click());
    expect(onChange).toHaveBeenLastCalledWith({ muted: true });
    act(() => solo.click());
    expect(onChange).toHaveBeenLastCalledWith({ solo: true });
    mounted.unmount();
  });

  it("folds the Melody Track section through the shared disclosure toggle", () => {
    window.localStorage.clear();
    const mounted = mountToDom(
      el(MelodyTrackControls, {
        settings: { instrument: "flute", muted: false, solo: false, volume: 100 },
        onChange: vi.fn(),
      }),
    );

    const toggle = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="melody-track-disclosure-btn"]',
    );
    expect(toggle?.tagName).toBe("BUTTON");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector('[aria-label="Melody Track Volume"]')).not.toBeNull();

    act(() => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.container.querySelector('[aria-label="Melody Track Volume"]')).toBeNull();
    expect(mounted.container.querySelector('[aria-label="Mute Melody Track"]')).toBeNull();
    expect(
      window.localStorage.getItem("cadenceflow.ui.track-controls-melody-disclosure-open"),
    ).toBe("false");
    // The collapsed section keeps its accessible region and title.
    expect(mounted.container.querySelector('[aria-label="Melody Track controls"]')).not.toBeNull();
    expect(mounted.container.textContent).toContain("Melody Track");

    act(() => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector('[aria-label="Melody Track Volume"]')).not.toBeNull();

    mounted.unmount();
    window.localStorage.clear();
  });
});
