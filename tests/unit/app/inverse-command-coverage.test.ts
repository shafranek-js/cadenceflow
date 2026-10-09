import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import {
  applyInverseCommand,
  UnhandledInverseCommandError,
} from "../../../src/app/commands/dispatcher";
import {
  switchModule,
  type SwitchModuleCommand,
} from "../../../src/app/commands/harmonyContextCommands";
import { addMatrixPreview } from "../../../src/app/commands/matrixCommands";
import { restoreBranchState } from "../../../src/app/commands/branchCommands";
import {
  restoreAllTemplates,
  restoreGlobalMatrixTemplate,
  restoreModuleTemplate,
} from "../../../src/app/commands/matrixTemplateCommands";
import {
  applyAuthoredMelodyTransaction,
  restoreAuthoredMelodyTransaction,
} from "../../../src/app/commands/authoredMelodyTransaction";
import { restoreMelodyState } from "../../../src/app/commands/melodyCommands";
import { restoreCustomPresets } from "../../../src/app/commands/presetCommands";
import { restoreHarmonyState } from "../../../src/app/commands/harmonyCommands";
import {
  removeStep,
  repeatChordStep,
  restoreProgression,
} from "../../../src/app/commands/progressionCommands";
import {
  applyModesFormula,
  restoreModesFormulaState,
} from "../../../src/app/commands/modesExplorerCommands";
import { setTonic } from "../../../src/app/commands/harmonyContextCommands";
import {
  renameProject,
  setIndependentBassEnabled,
} from "../../../src/app/commands/projectCommands";
import { setSongSections } from "../../../src/app/commands/sectionCommands";
import {
  restoreMeterAndSteps,
  setGroove,
  setStepDuration,
  setTempo,
} from "../../../src/app/commands/timingCommands";
import {
  setCardViewOverride,
  setGlobalCardView,
} from "../../../src/app/commands/matrixViewCommands";
import {
  setExpertiseMode,
  setGenreFocus,
  setGuitarChordColorMode,
  setGuitarChordOrientation,
  setMeasuresPerSystem,
  setNoteColorMode,
  setProgressionView,
  setResolutionArrows,
  setSidePanelMode,
  setStaffBassVisibility,
  setSuzukiColors,
  setTheme,
} from "../../../src/app/commands/presentationCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import type { Project } from "../../../src/domain/project/project";

/**
 * Guard for the inverse-command dispatcher.
 *
 * Regression context: `applyInverseCommand` ended in `default: return project`, so any
 * inverse type without a handler produced an Undo that returned `true` while leaving the
 * Project untouched. `harmony/switch-module` was unhandled exactly that way: Undo switched
 * `activeModule` back in the UI but left every Step carrying the *other* module's harmonic
 * functions. `switchModule`'s own ambiguity guard was skipped entirely, because the inverse
 * never reached it.
 *
 * These tests fail if the source stops emitting an inverse type, if a new inverse type is
 * added without a dispatcher branch, or if the switch-module inverse regresses.
 */

// Raw command sources, inlined by Vite. Scoped to the command layer, which is the only
// place that creates inverse commands.
const commandSources = import.meta.glob("../../../src/app/commands/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * Every command `type` that the command layer can emit as an `inverse:`.
 *
 * Types are declared as string literals (`type: "x/y"`) by project convention, so the
 * literal in the object also becomes the interface's `type` via the `& { type: "x/y" }`
 * intersection. Collecting literals that sit near an `inverse:` key is therefore exact.
 */
function inverseTypesEmittedByCommands(): string[] {
  const types = new Set<string>();
  for (const source of Object.values(commandSources)) {
    // The window is generous: some inverse payloads list other keys before `type`.
    for (const match of source.matchAll(/inverse:\s*\{([\s\S]{0,900}?)\n\s{4,8}\}/g)) {
      const typeMatch = /type:\s*"([a-z-]+\/[a-z-]+)"/.exec(match[1]!);
      if (typeMatch) types.add(typeMatch[1]!);
    }
  }
  return [...types].sort();
}

/** Every handler the dispatcher can route to, keyed by the inverse type it restores. */
const HANDLERS: Readonly<
  Record<string, (project: Project, command: never) => { readonly project: Project }>
> = {
  "timing/restore-meter-and-steps": restoreMeterAndSteps,
  "timing/set-tempo": setTempo,
  "timing/set-groove": setGroove,
  "timing/set-step-duration": setStepDuration,
  "progression/restore": restoreProgression,
  "progression/set-sections": setSongSections,
  "progression/remove-step": removeStep,
  "progression/repeat-chord": repeatChordStep,
  "presets/restore-custom": restoreCustomPresets,
  "branch/restore-state": restoreBranchState,
  "matrix/add-preview": addMatrixPreview,
  "matrix-template/restore-module": restoreModuleTemplate,
  "matrix-template/restore-all": restoreAllTemplates,
  "matrix-template/restore-global": restoreGlobalMatrixTemplate,
  "matrix/set-global-card-view": setGlobalCardView,
  "matrix/set-card-view-override": setCardViewOverride,
  "harmony/set-tonic": setTonic,
  "harmony/switch-module": switchModule,
  "modes/apply-formula": applyModesFormula,
  "modes/restore-formula-state": restoreModesFormulaState,
  "project/rename": renameProject,
  "project/set-independent-bass-enabled": setIndependentBassEnabled,
  "presentation/set-theme": setTheme,
  "presentation/set-expertise-mode": setExpertiseMode,
  "presentation/set-staff-bass-visibility": setStaffBassVisibility,
  "presentation/set-progression-view": setProgressionView,
  "presentation/set-measures-per-system": setMeasuresPerSystem,
  "presentation/set-note-color-mode": setNoteColorMode,
  "presentation/set-suzuki-colors": setSuzukiColors,
  "presentation/set-resolution-arrows": setResolutionArrows,
  "presentation/set-genre-focus": setGenreFocus,
  "presentation/set-guitar-chord-orientation": setGuitarChordOrientation,
  "presentation/set-guitar-chord-color-mode": setGuitarChordColorMode,
  "presentation/set-side-panel-mode": setSidePanelMode,
  "melody/restore-state": restoreMelodyState,
  "melody/restore-authored-transaction": restoreAuthoredMelodyTransaction,
  "melody/apply-authored-transaction": applyAuthoredMelodyTransaction,
  "harmony/restore-state": restoreHarmonyState,
};

const nowIso = "2026-10-05T00:00:00.000Z";

function projectWithSteps(): Project {
  const base = createDefaultProject("inverse-dispatch-test");
  const steps = Object.freeze([
    createMatrixChordStep(base, "I", "step-1", "progressions"),
    createMatrixChordStep(base, "IV", "step-2", "progressions"),
  ]);
  return Object.freeze<Project>({
    ...base,
    progression: Object.freeze({ ...base.progression, steps, selectedStepId: "step-1" }),
  });
}

describe("inverse command dispatch coverage", () => {
  it("collects inverse types from the command layer (guards the glob itself)", () => {
    const types = inverseTypesEmittedByCommands();
    // If the glob or the scan breaks, fail loudly instead of passing vacuously.
    expect(types.length).toBeGreaterThan(20);
    expect(types).toContain("progression/restore");
    expect(types).toContain("harmony/switch-module");
  });

  it("has a dispatcher branch for every inverse type the command layer emits", () => {
    const missing = inverseTypesEmittedByCommands().filter((type) => !(type in HANDLERS));

    // If this fails, add the missing case to `applyInverseCommand` AND to HANDLERS here.
    // Leaving it unhandled would make Undo a silent no-op again.
    expect(missing).toEqual([]);
  });

  it("throws instead of silently returning the Project for an unhandled inverse type", () => {
    const project = projectWithSteps();

    expect(() =>
      applyInverseCommand(project, { type: "not/a-real-command", payload: {} } as never),
    ).toThrow(UnhandledInverseCommandError);
  });
});

describe("harmony/switch-module inverse", () => {
  it("restores both activeModule and every Step's harmonicFunction", () => {
    const store = new AppStore(projectWithSteps());
    const before = store.project;
    const beforeIdentities = before.progression.steps.map((step) =>
      step.kind === "chord" ? JSON.stringify(step.harmonicFunction) : "rest",
    );

    const command: SwitchModuleCommand = {
      type: "harmony/switch-module",
      payload: { destinationModule: "dark-harmony", resolutions: {}, nowIso },
    };
    store.dispatch(command, switchModule);

    // Sanity: the forward command actually changed something to undo.
    expect(store.project.activeModule).toBe("dark-harmony");
    const afterIdentities = store.project.progression.steps.map((step) =>
      step.kind === "chord" ? JSON.stringify(step.harmonicFunction) : "rest",
    );
    expect(afterIdentities).not.toEqual(beforeIdentities);

    // The regression: this returned the Project unchanged, so Undo reported success
    // while the Steps kept the destination module's functions.
    expect(store.undo()).toBe(true);

    expect(store.project.activeModule).toBe(before.activeModule);
    expect(
      store.project.progression.steps.map((step) =>
        step.kind === "chord" ? JSON.stringify(step.harmonicFunction) : "rest",
      ),
    ).toEqual(beforeIdentities);
  });

  it("round-trips through redo as well", () => {
    const store = new AppStore(projectWithSteps());
    const command: SwitchModuleCommand = {
      type: "harmony/switch-module",
      payload: { destinationModule: "dark-harmony", resolutions: {}, nowIso },
    };
    store.dispatch(command, switchModule);
    const switchedModule = store.project.activeModule;
    const switchedIdentities = store.project.progression.steps.map((step) =>
      step.kind === "chord" ? JSON.stringify(step.harmonicFunction) : "rest",
    );

    store.undo();
    expect(store.redo()).toBe(true);

    expect(store.project.activeModule).toBe(switchedModule);
    expect(
      store.project.progression.steps.map((step) =>
        step.kind === "chord" ? JSON.stringify(step.harmonicFunction) : "rest",
      ),
    ).toEqual(switchedIdentities);
  });
});
