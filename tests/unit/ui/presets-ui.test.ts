// @vitest-environment jsdom
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultProject,
  DEFAULT_PIANO_PERFORMANCE,
} from "../../../src/domain/project/factory";
import { BUILT_IN_PRESETS } from "../../../src/domain/progression/builtInPresets";
import type { FunctionalPreset } from "../../../src/domain/progression/presets";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { PresetApplyDialog } from "../../../src/ui/progression/PresetApplyDialog";
import { PresetsPanel } from "../../../src/ui/progression/PresetsPanel";
import { SavePresetDialog } from "../../../src/ui/progression/SavePresetDialog";
import {
  formatContextLabel,
  formatPresetStepDuration,
  getPresetRealizationSummary,
} from "../../../src/ui/progression/presetUtils";

const el = React.createElement;

function renderToDom(element: React.ReactElement): HTMLElement {
  const html = renderToString(element);
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

function makeChordStep(id: string, functionId: string): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(1, 1)),
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "harmonic",
  };
}

function makeRestStep(id: string): RestStep {
  return {
    id,
    kind: "rest",
    duration: musicalDuration(rational(1, 1)),
  };
}

describe("T117 — Presets UI Components", () => {
  describe("1. PresetsPanel — Browser, Sections, Catalog & Empty States", () => {
    it("renders nothing when isOpen is false", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const dom = renderToDom(
        el(PresetsPanel, {
          isOpen: false,
          project,
          onClose: vi.fn(),
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      expect(dom.querySelector(".presets-panel")).toBeNull();
    });

    it("renders built-in presets section with all 6 curated presets and neutral names", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const dom = renderToDom(
        el(PresetsPanel, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      const panel = dom.querySelector(".presets-panel");
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute("role")).toBe("dialog");
      expect(panel?.getAttribute("aria-modal")).toBe("true");

      // Verify all 6 built-in presets rendered
      const builtinGrid = dom.querySelector('[data-testid="builtin-preset-grid"]');
      expect(builtinGrid).not.toBeNull();
      const cards = builtinGrid?.querySelectorAll(".preset-card");
      expect(cards?.length).toBe(BUILT_IN_PRESETS.length);
      expect(cards?.length).toBe(6);

      // Verify neutral names visible, NO genre tags
      expect(dom.textContent).toContain("Major I–vi–IV–V");
      expect(dom.textContent).toContain("Major ii–V–I");
      expect(dom.textContent).toContain("Minor ii°–V–i");
      expect(dom.textContent).not.toContain("50s / Doo-Wop");
      expect(dom.textContent).not.toContain("Jazz Cadence");
      expect(dom.textContent).not.toContain("Andalusian");

      // Verify harmonic functions visible
      expect(dom.textContent).toContain("I · vi · IV · V");
      expect(dom.textContent).toContain("Functions:");
      expect(dom.textContent).toContain("Durations:");
    });

    it("renders custom presets section empty state when project has no custom presets", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const dom = renderToDom(
        el(PresetsPanel, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      const empty = dom.querySelector('[data-testid="custom-presets-empty"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain("No custom presets saved yet");
    });

    it("renders custom presets from project.customPresets with Apply and Delete actions", () => {
      const customPreset: FunctionalPreset = {
        id: "custom-p1",
        name: "My Custom Progression",
        description: "User defined progression",
        source: "custom",
        steps: [
          {
            harmonicFunction: { moduleId: "progressions", functionId: "I" },
            duration: musicalDuration(rational(2, 1)),
          },
          {
            harmonicFunction: { moduleId: "progressions", functionId: "V" },
            duration: musicalDuration(rational(2, 1)),
          },
        ],
      };

      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const project = {
        ...baseProject,
        customPresets: [customPreset],
      };

      const dom = renderToDom(
        el(PresetsPanel, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      const customCard = dom.querySelector('[data-testid="preset-card-custom-p1"]');
      expect(customCard).not.toBeNull();
      expect(customCard?.textContent).toContain("My Custom Progression");
      expect(customCard?.textContent).toContain("Custom");
      expect(customCard?.textContent).toContain("I · V");

      const deleteBtn = customCard?.querySelector('[data-testid="delete-preset-custom-p1"]');
      expect(deleteBtn).not.toBeNull();

      const applyBtn = customCard?.querySelector('[data-testid="apply-preset-custom-p1"]');
      expect(applyBtn).not.toBeNull();
    });
  });

  describe("2. SavePresetDialog — Validation, Rest & Empty Progression Handling", () => {
    it("renders nothing when isOpen is false", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const dom = renderToDom(
        el(SavePresetDialog, {
          isOpen: false,
          project,
          onClose: vi.fn(),
          onSave: vi.fn(),
        }),
      );

      expect(dom.querySelector(".save-preset-dialog")).toBeNull();
    });

    it("blocks save and shows warning when progression contains Rest steps", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const step1 = makeChordStep("s1", "I");
      const step2 = makeRestStep("s2");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [step1, step2],
        },
      };

      const dom = renderToDom(
        el(SavePresetDialog, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onSave: vi.fn(),
        }),
      );

      const warning = dom.querySelector('[data-testid="save-preset-rest-warning"]');
      expect(warning).not.toBeNull();
      expect(warning?.textContent).toContain("Custom Presets currently support chord steps only");
      expect(warning?.textContent).toContain("Remove Rest steps");

      // Save button is disabled
      const saveBtn = dom.querySelector(
        '[data-testid="save-preset-confirm-btn"]',
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it("blocks save and shows warning when progression is empty", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [],
        },
      };

      const dom = renderToDom(
        el(SavePresetDialog, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onSave: vi.fn(),
        }),
      );

      const warning = dom.querySelector('[data-testid="save-preset-empty-warning"]');
      expect(warning).not.toBeNull();
      expect(warning?.textContent).toContain("Cannot save an empty progression as a preset");

      const saveBtn = dom.querySelector(
        '[data-testid="save-preset-confirm-btn"]',
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it("renders name input for valid chord progression with disabled button initially (name empty)", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const step1 = makeChordStep("s1", "I");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [step1],
        },
      };

      const dom = renderToDom(
        el(SavePresetDialog, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onSave: vi.fn(),
        }),
      );

      const input = dom.querySelector("#preset-name-input") as HTMLInputElement;
      expect(input).not.toBeNull();

      const saveBtn = dom.querySelector(
        '[data-testid="save-preset-confirm-btn"]',
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });
  });

  describe("3. PresetApplyDialog — Insertion Modes, Selection State, Contextual Realization", () => {
    const samplePreset: FunctionalPreset = BUILT_IN_PRESETS[0]!; // Major I-vi-IV-V

    it("renders contextual preview matching the current key and mode", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: samplePreset,
          project,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );

      const previewBox = dom.querySelector('[data-testid="preset-contextual-preview"]');
      expect(previewBox).not.toBeNull();
      // I · vi · IV · V in C Major realizes to C · A · F · G
      expect(previewBox?.textContent).toContain("C · A · F · G");
      expect(dom.textContent).toContain("C Major");
    });

    it("renders simplified 'Use Preset' flow when progression is empty", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [],
        },
      };

      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: samplePreset,
          project,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );

      expect(dom.textContent).toContain(
        "Progression is currently empty. Applying this preset will create the initial progression.",
      );
      expect(dom.querySelector('[role="radiogroup"]')).toBeNull();

      const confirmBtn = dom.querySelector(
        '[data-testid="preset-apply-confirm-btn"]',
      ) as HTMLButtonElement;
      expect(confirmBtn.textContent).toBe("Use Preset");
      expect(confirmBtn.disabled).toBe(false);
    });

    it("renders three modes for non-empty progression; Insert is disabled without selection", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const step1 = makeChordStep("s1", "I");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [step1],
          selectedStepId: null, // No selection
        },
      };

      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: samplePreset,
          project,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );

      const radioGroup = dom.querySelector('[role="radiogroup"]');
      expect(radioGroup).not.toBeNull();

      const radios = radioGroup?.querySelectorAll(
        'input[type="radio"]',
      ) as NodeListOf<HTMLInputElement>;
      expect(radios.length).toBe(3);

      const [replaceRadio, appendRadio, insertRadio] = Array.from(radios);
      expect(replaceRadio?.value).toBe("replace");
      expect(appendRadio?.value).toBe("append");
      expect(insertRadio?.value).toBe("insert");

      // Without selection, insert is disabled
      expect(insertRadio?.disabled).toBe(true);
      expect(dom.textContent).toContain("Select a progression step to insert before it");
    });

    it("enables Insert mode when a step is selected and shows target step index and function", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const step1 = makeChordStep("s1", "I");
      const step2 = makeChordStep("s2", "V");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [step1, step2],
          selectedStepId: "s2", // Step 2 selected
        },
      };

      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: samplePreset,
          project,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );

      const insertRadio = dom.querySelector(
        'input[type="radio"][value="insert"]',
      ) as HTMLInputElement;
      expect(insertRadio.disabled).toBe(false);

      // Label indicates insert before Step 2: V
      expect(dom.textContent).toContain("Insert before Step 2: V");

      const confirmBtn = dom.querySelector(
        '[data-testid="preset-apply-confirm-btn"]',
      ) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(false);
    });

    it("disables Apply and shows warning alert on ambiguous preset realization", () => {
      const darkD7Preset: FunctionalPreset = {
        id: "test-ambiguous-d7",
        name: "Ambiguous D7 Preset",
        source: "custom",
        steps: [
          {
            harmonicFunction: { moduleId: "dark-harmony", functionId: "D7" },
            duration: musicalDuration(rational(1, 1)),
          },
        ],
      };

      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");

      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: darkD7Preset,
          project,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );

      const alert = dom.querySelector('[data-testid="preset-ambiguous-alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain("Ambiguous Harmonic Mapping");

      const confirmBtn = dom.querySelector(
        '[data-testid="preset-apply-confirm-btn"]',
      ) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });

    it("disables Apply and shows error alert on incompatible preset realization", () => {
      const incompatiblePreset: FunctionalPreset = {
        id: "test-incompatible",
        name: "Incompatible Preset",
        source: "custom",
        steps: [
          {
            harmonicFunction: { moduleId: "progressions", functionId: "UNKNOWN_FUNCTION_XYZ" },
            duration: musicalDuration(rational(1, 1)),
          },
        ],
      };

      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");

      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: incompatiblePreset,
          project,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );

      const alert = dom.querySelector('[data-testid="preset-incompatible-alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain("Incompatible Harmonic Context");

      const confirmBtn = dom.querySelector(
        '[data-testid="preset-apply-confirm-btn"]',
      ) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });
  });

  describe("4. Preset Formatting & Summary Utilities", () => {
    it("formats durations accurately", () => {
      expect(formatPresetStepDuration(musicalDuration(rational(4, 1)))).toBe("Whole");
      expect(formatPresetStepDuration(musicalDuration(rational(2, 1)))).toBe("Half");
      expect(formatPresetStepDuration(musicalDuration(rational(1, 1)))).toBe("Quarter");
      expect(formatPresetStepDuration(musicalDuration(rational(1, 2)))).toBe("Eighth");
      expect(formatPresetStepDuration(musicalDuration(rational(1, 4)))).toBe("Sixteenth");
      expect(formatPresetStepDuration(musicalDuration(rational(3, 1)))).toBe("Dotted Half");
      expect(formatPresetStepDuration(musicalDuration(rational(3, 2)))).toBe("Dotted Quarter");
      expect(formatPresetStepDuration(musicalDuration(rational(2, 3)))).toBe("Quarter Triplet");
      expect(formatPresetStepDuration(musicalDuration(rational(1, 3)))).toBe("Eighth Triplet");
      expect(formatPresetStepDuration(musicalDuration(rational(5, 4)))).toBe("5/4 beats");
    });

    it("formats context label for Major and Tonal Minor", () => {
      const majorProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      expect(formatContextLabel(majorProject)).toBe("C Major");

      const minorProject = {
        ...majorProject,
        activeModule: "dark-harmony" as const,
        tonic: 9 as const, // A = 9
      };
      expect(formatContextLabel(minorProject)).toBe("A Tonal Minor");
    });

    it("accurately summarizes realizable preset steps", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const summary = getPresetRealizationSummary(BUILT_IN_PRESETS[0]!, project);
      expect(summary.kind).toBe("success");
      if (summary.kind === "success") {
        expect(summary.text).toBe("C · A · F · G");
        expect(summary.chordSymbols).toEqual(["C", "A", "F", "G"]);
      }
    });
  });
});
