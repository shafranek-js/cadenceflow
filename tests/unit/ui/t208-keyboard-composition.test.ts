// @vitest-environment jsdom
// @vitest-environment-options {"pretendToBeVisual":true}
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { computeScalePitches } from "../../../src/domain/harmony/modes";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { snapshotChordMelody } from "../../../src/domain/melody/types";
import type { AuthoredMelodyNote } from "../../../src/domain/melody/types";
import { rational } from "../../../src/domain/timing/rational";
import { MelodyEditorDialog } from "../../../src/ui/melody/MelodyEditorDialog";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import {
  movePitchBySemitone,
  movePitchDiatonically,
  pitchForScaleDegree,
} from "../../../src/ui/melody/keyboardComposition";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("T208 keyboard composition pitch helpers", () => {
  it("uses the active scale spelling and chooses the closest octave for scale degrees", () => {
    const scale = computeScalePitches(9, "aeolian");
    const pitch = pitchForScaleDegree(3, scale, 59);
    expect(pitch.midiNumber).toBe(60);
    expect(pitch.spelling).toEqual(scale[2]?.spelling);
  });

  it("moves through the active scale and moves chromatically by one semitone", () => {
    const scale = computeScalePitches(0, "ionian");
    const chromatic = exactPitch(61, { step: "C", alter: 1 });
    expect(movePitchDiatonically(chromatic, 1, scale).midiNumber).toBe(62);
    expect(movePitchDiatonically(chromatic, -1, scale).midiNumber).toBe(60);
    expect(movePitchBySemitone(chromatic, 1).midiNumber).toBe(62);
    expect(movePitchBySemitone(chromatic, -1).midiNumber).toBe(60);
  });

  it("keeps arrow selection and pitch edits in the dialog draft until Apply", async () => {
    const base = createRichProjectFixture();
    const step = base.progression.steps.find((item) => item.kind === "chord");
    if (!step || step.kind !== "chord") throw new Error("fixture requires a chord step");
    const notes: readonly AuthoredMelodyNote[] = [
      {
        id: "authored-c4",
        pitch: exactPitch(60, { step: "C", alter: 0 }),
        onset: rational(0),
        duration: rational(1),
      },
      {
        id: "authored-d4",
        pitch: exactPitch(62, { step: "D", alter: 0 }),
        onset: rational(1),
        duration: rational(1),
      },
    ];
    const project = {
      ...base,
      progression: {
        ...base.progression,
        steps: base.progression.steps.map((item) =>
          item.id === step.id
            ? { ...item, melody: snapshotChordMelody({ mode: "authored", phrase: { notes } }) }
            : item,
        ),
      },
    };
    const applied = vi.fn();
    const onApply = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        React.createElement(MelodyEditorDialog, {
          isOpen: true,
          mode: "edit",
          step: project.progression.steps.find((item) => item.id === step.id) as typeof step,
          project,
          onClose: vi.fn(),
          onApply,
          onApplyAuthored: applied,
        }),
      );
    });
    const button = (name: string) =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    act(() => button("Authored notes")?.click());
    const list = container.querySelector<HTMLOListElement>("[data-testid='authored-note-list']");
    const first = container.querySelector<HTMLButtonElement>(
      "[data-authored-note-id='authored-c4']",
    );
    act(() => list?.focus());
    act(() =>
      list?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(first?.getAttribute("aria-pressed")).toBe("true");
    act(() => first?.focus());
    act(() =>
      first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(
      container
        .querySelector("[data-authored-note-id='authored-d4']")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    act(() =>
      container
        .querySelector("[data-authored-note-id='authored-d4']")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }),
        ),
    );
    expect(container.querySelectorAll("[data-authored-note-id][aria-pressed='true']")).toHaveLength(
      2,
    );
    act(() => list?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    act(() =>
      list?.dispatchEvent(new KeyboardEvent("keydown", { key: "3", ctrlKey: true, bubbles: true })),
    );
    act(() =>
      list?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", metaKey: true, bubbles: true }),
      ),
    );
    act(() => first?.focus());
    act(() =>
      first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })),
    );
    expect(first?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll("[data-authored-note-id][aria-pressed='true']")).toHaveLength(
      1,
    );
    expect(applied).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    act(() => first?.click());
    act(() =>
      first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    act(() => list?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(
      container.querySelector<HTMLInputElement>('[aria-label="Authored pitch MIDI"]')?.value,
    ).toBe("64");
    act(() =>
      container.querySelector<HTMLButtonElement>("[data-testid='melody-editor-apply']")?.click(),
    );
    expect(applied).toHaveBeenCalledOnce();
    const phrase = applied.mock.calls[0]?.[0] as { notes: readonly AuthoredMelodyNote[] };
    expect(phrase.notes.map((note) => note.pitch.midiNumber)).toEqual([62, 64]);
    expect(phrase.notes.map((note) => note.id)).toEqual(["authored-c4", "authored-d4"]);
    act(() => root.unmount());
    container.remove();
  });
});

afterEach(() => document.body.replaceChildren());
