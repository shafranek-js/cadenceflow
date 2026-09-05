// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
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

    it("renders contextual preview matching the current key and mode with realized chord quality", () => {
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
      // I · vi · IV · V in C Major realizes to C · Am · F · G (with quality)
      expect(previewBox?.textContent).toContain("C · Am · F · G");
      expect(dom.textContent).toContain("C Major");
    });

    it("renders quality-aware preview across different keys: G Major (G · Em · C · D) and D Major (D · Bm · G · A)", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");

      // G Major
      const gMajorProject = { ...baseProject, tonic: 7 as const };
      const gDom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: samplePreset,
          project: gMajorProject,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );
      const gPreview = gDom.querySelector('[data-testid="preset-contextual-preview"]');
      expect(gPreview?.textContent).toContain("G · Em · C · D");

      // D Major
      const dMajorProject = { ...baseProject, tonic: 2 as const };
      const dDom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: samplePreset,
          project: dMajorProject,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );
      const dPreview = dDom.querySelector('[data-testid="preset-contextual-preview"]');
      expect(dPreview?.textContent).toContain("D · Bm · G · A");
    });

    it("renders quality-aware preview in G Tonal Minor: Gm · Cm · D · Gm", () => {
      const minorPreset = BUILT_IN_PRESETS.find((p) => p.id === "builtin-minor-i-iv-v-i")!;
      expect(minorPreset).toBeDefined();
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const gMinorProject = {
        ...baseProject,
        activeModule: "dark-harmony" as const,
        tonic: 7 as const, // G = 7
      };
      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: minorPreset,
          project: gMinorProject,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );
      const preview = dom.querySelector('[data-testid="preset-contextual-preview"]');
      expect(preview?.textContent).toContain("Gm · Cm · D · Gm");
    });

    it("renders flat-key spelling accurately in F Major: F · Bb · C · F (proves Bb, not A#)", () => {
      const cadencePreset = BUILT_IN_PRESETS.find((p) => p.id === "builtin-major-i-iv-v-i")!;
      expect(cadencePreset).toBeDefined();
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const fMajorProject = {
        ...baseProject,
        tonic: 5 as const, // F = 5
      };
      const dom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: cadencePreset,
          project: fMajorProject,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );
      const preview = dom.querySelector('[data-testid="preset-contextual-preview"]');
      expect(preview?.textContent).toContain("F · Bb · C · F");
      expect(preview?.textContent).not.toContain("A#");
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

    it("accurately summarizes realizable preset steps with chord quality", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const summary = getPresetRealizationSummary(BUILT_IN_PRESETS[0]!, project);
      expect(summary.kind).toBe("success");
      if (summary.kind === "success") {
        expect(summary.text).toBe("C · Am · F · G");
        expect(summary.chordSymbols).toEqual(["C", "Am", "F", "G"]);
      }
    });
  });

  describe("5. Modal Accessibility — Focus Trap, Initial Focus, Inert Nesting & Escape Handling", () => {
    it("renders PresetsPanel as inert and aria-hidden when isTopmost is false", () => {
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const dom = renderToDom(
        el(PresetsPanel, {
          isOpen: true,
          isTopmost: false,
          project,
          onClose: vi.fn(),
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      const panel = dom.querySelector(".presets-panel");
      expect(panel).not.toBeNull();
      expect(panel?.hasAttribute("inert")).toBe(true);
      expect(panel?.getAttribute("aria-hidden")).toBe("true");
      expect(panel?.classList.contains("is-inert")).toBe(true);
      expect(panel?.getAttribute("aria-modal")).toBeNull();
    });

    it("focuses #preset-name-input initially when SavePresetDialog opens", async () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const step1 = makeChordStep("s1", "I");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [step1],
        },
      };

      const mounted = mountToDom(
        el(SavePresetDialog, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onSave: vi.fn(),
        }),
      );

      // Allow requestAnimationFrame to execute
      await new Promise((r) => requestAnimationFrame(r));

      const input = mounted.container.querySelector("#preset-name-input");
      expect(document.activeElement).toBe(input);

      mounted.unmount();
    });

    it("traps Tab focus within the active dialog", async () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const step1 = makeChordStep("s1", "I");
      const project = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [step1],
        },
      };

      const mounted = mountToDom(
        el(SavePresetDialog, {
          isOpen: true,
          project,
          onClose: vi.fn(),
          onSave: vi.fn(),
        }),
      );

      await new Promise((r) => requestAnimationFrame(r));

      const input = mounted.container.querySelector("#preset-name-input") as HTMLInputElement;
      const cancelBtn = mounted.container.querySelector(
        '[data-testid="save-preset-cancel-btn"]',
      ) as HTMLButtonElement;
      const closeBtn = mounted.container.querySelector(".dialog-close-btn") as HTMLButtonElement;

      expect(input).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      expect(closeBtn).not.toBeNull();

      // Focus last focusable (cancel button since confirm is disabled)
      act(() => {
        cancelBtn.focus();
      });
      expect(document.activeElement).toBe(cancelBtn);

      // Press Tab without shift on last element: wraps to first focusable
      const tabEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(tabEvent);
      });
      expect(document.activeElement).toBe(closeBtn);

      // Press Shift+Tab on first element: wraps to last focusable
      const shiftTabEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(shiftTabEvent);
      });
      expect(document.activeElement).toBe(cancelBtn);

      mounted.unmount();
    });

    it("closes only topmost dialog on Escape without closing underlying panel", () => {
      const panelClose = vi.fn();
      const childClose = vi.fn();
      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");

      // PresetsPanel is inert (not topmost)
      const mountedPanel = mountToDom(
        el(PresetsPanel, {
          isOpen: true,
          isTopmost: false,
          project,
          onClose: panelClose,
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      // Child SavePresetDialog is open (topmost)
      const mountedChild = mountToDom(
        el(SavePresetDialog, {
          isOpen: true,
          project,
          onClose: childClose,
          onSave: vi.fn(),
        }),
      );

      // First Escape: child modal receives and closes
      const escapeEvent1 = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(escapeEvent1);

      expect(childClose).toHaveBeenCalledTimes(1);
      expect(panelClose).not.toHaveBeenCalled();

      mountedChild.unmount();
      mountedPanel.unmount();

      // Now test panel when it IS topmost
      const mountedPanelTopmost = mountToDom(
        el(PresetsPanel, {
          isOpen: true,
          isTopmost: true,
          project,
          onClose: panelClose,
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      const escapeEvent2 = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(escapeEvent2);

      expect(panelClose).toHaveBeenCalledTimes(1);
      mountedPanelTopmost.unmount();
    });

    it("restores focus to previous element when dialog unmounts", async () => {
      const triggerButton = document.createElement("button");
      triggerButton.textContent = "Open Modal";
      document.body.appendChild(triggerButton);
      triggerButton.focus();
      expect(document.activeElement).toBe(triggerButton);

      const project = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const mounted = mountToDom(
        el(PresetsPanel, {
          isOpen: true,
          isTopmost: true,
          project,
          onClose: vi.fn(),
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: vi.fn(),
        }),
      );

      await new Promise((r) => requestAnimationFrame(r));
      expect(document.activeElement).not.toBe(triggerButton);

      // Close / unmount dialog
      mounted.unmount();

      expect(document.activeElement).toBe(triggerButton);
      triggerButton.remove();
    });

    it("associates validation error messages and alerts with accessible ARIA attributes", () => {
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
      expect(input.getAttribute("aria-invalid")).toBe("false");
      expect(input.getAttribute("aria-describedby")).toBeNull();

      // Check PresetApplyDialog accessible alerts
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

      const projectWithSteps = {
        ...baseProject,
        progression: {
          ...baseProject.progression,
          steps: [step1],
        },
      };

      const applyDom = renderToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: darkD7Preset,
          project: projectWithSteps,
          onClose: vi.fn(),
          onApply: vi.fn(),
        }),
      );

      const alert = applyDom.querySelector('[data-testid="preset-ambiguous-alert"]');
      expect(alert?.getAttribute("role")).toBe("alert");
      expect(alert?.getAttribute("aria-live")).toBe("polite");

      // Check disabled insert description link
      const insertRadio = applyDom.querySelector('input[value="insert"]');
      expect(insertRadio?.getAttribute("aria-describedby")).toBe("insert-mode-description");
      const desc = applyDom.querySelector("#insert-mode-description");
      expect(desc).not.toBeNull();
    });
  });

  describe("6. Zero History Mutation Invariance", () => {
    it("opening, browsing, previewing, and closing dialogs dispatches 0 commands and modifies 0 history", () => {
      const baseProject = createDefaultProject("p1", "Test", "2026-09-05T00:00:00.000Z");
      const onSaveSpy = vi.fn();
      const onApplySpy = vi.fn();
      const onDeleteSpy = vi.fn();

      // Mount PresetsPanel
      const panel = mountToDom(
        el(PresetsPanel, {
          isOpen: true,
          isTopmost: true,
          project: baseProject,
          onClose: vi.fn(),
          onOpenApplyDialog: vi.fn(),
          onOpenSaveDialog: vi.fn(),
          onDeleteCustomPreset: onDeleteSpy,
        }),
      );
      panel.unmount();

      // Mount PresetApplyDialog (just viewing preview)
      const applyDialog = mountToDom(
        el(PresetApplyDialog, {
          isOpen: true,
          preset: BUILT_IN_PRESETS[0]!,
          project: baseProject,
          onClose: vi.fn(),
          onApply: onApplySpy,
        }),
      );
      applyDialog.unmount();

      // Mount SavePresetDialog (without confirming save)
      const saveDialog = mountToDom(
        el(SavePresetDialog, {
          isOpen: true,
          project: baseProject,
          onClose: vi.fn(),
          onSave: onSaveSpy,
        }),
      );
      saveDialog.unmount();

      // Verify zero commands / mutations were dispatched
      expect(onSaveSpy).not.toHaveBeenCalled();
      expect(onApplySpy).not.toHaveBeenCalled();
      expect(onDeleteSpy).not.toHaveBeenCalled();
    });
  });
});
