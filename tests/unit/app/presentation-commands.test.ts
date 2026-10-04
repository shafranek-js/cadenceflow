import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import {
  setExpertiseMode,
  setStaffBassVisibility,
  setNoteColorMode,
  setResolutionArrows,
  setGenreFocus,
  setTheme,
  setGuitarChordOrientation,
  setGuitarChordColorMode,
  setSidePanelMode,
  type SetExpertiseModeCommand,
  type SetStaffBassVisibilityCommand,
  type SetNoteColorModeCommand,
  type SetResolutionArrowsCommand,
  type SetGenreFocusCommand,
  type SetThemeCommand,
  type SetGuitarChordOrientationCommand,
  type SetGuitarChordColorModeCommand,
  type SetSidePanelModeCommand,
} from "../../../src/app/commands/presentationCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { explainRecommendation } from "../../../src/domain/recommendations/explanations";

describe("US10 presentation commands", () => {
  const nowIso = "2026-09-08T12:00:00.000Z";

  it("changes only the immutable theme presentation field and supports inverse application", () => {
    const initial = createDefaultProject("presentation-theme", "Presentation Theme");
    const initialPresentation = initial.presentation;
    const initialProgression = initial.progression;
    const command: SetThemeCommand = {
      type: "presentation/set-theme",
      payload: { theme: "light", nowIso },
    };

    const applied = setTheme(initial, command);

    expect(applied.project.presentation.theme).toBe("light");
    expect(applied.project.presentation.expertiseMode).toBe("composer");
    expect(applied.project.progression).toBe(initialProgression);
    expect(initial.presentation).toBe(initialPresentation);
    expect(initial.presentation.theme).toBe("dark");
    expect(Object.isFrozen(applied.project)).toBe(true);
    expect(Object.isFrozen(applied.project.presentation)).toBe(true);

    const undone = applyInverseCommand(applied.project, applied.inverse);
    expect(undone.presentation.theme).toBe("dark");
    expect(undone.presentation.expertiseMode).toBe("composer");
  });

  it("changes only expertise presentation and restores it through AppStore undo/redo", () => {
    const initial = createDefaultProject("presentation-mode", "Presentation Mode");
    const store = new AppStore(initial);
    const command: SetExpertiseModeCommand = {
      type: "presentation/set-expertise-mode",
      payload: { expertiseMode: "expert", nowIso },
    };

    store.dispatch(command, setExpertiseMode);
    expect(store.project.presentation.expertiseMode).toBe("expert");
    expect(store.project.tonic).toBe(initial.tonic);
    expect(store.project.progression).toBe(initial.progression);
    expect(store.history.undoDepth).toBe(1);

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.expertiseMode).toBe("composer");
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.expertiseMode).toBe("expert");
  });

  it("keeps Staff bass hidden by default and toggles only its visual preference", () => {
    const initial = createDefaultProject("presentation-staff-bass", "Staff Bass");
    const store = new AppStore(initial);
    const command: SetStaffBassVisibilityCommand = {
      type: "presentation/set-staff-bass-visibility",
      payload: { visible: true, nowIso },
    };

    expect(initial.presentation.showBassInStaff).toBe(false);
    store.dispatch(command, setStaffBassVisibility);
    expect(store.project.presentation.showBassInStaff).toBe(true);
    expect(store.project.progression).toBe(initial.progression);
    expect(store.project.defaults).toBe(initial.defaults);

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.showBassInStaff).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.showBassInStaff).toBe(true);
  });

  it("keeps standard note colors by default and supports mode undo/redo and inverse", () => {
    const initial = createDefaultProject("presentation-suzuki", "Suzuki Project");
    const store = new AppStore(initial);
    const command: SetNoteColorModeCommand = {
      type: "presentation/set-note-color-mode",
      payload: { mode: "suzuki", nowIso },
    };

    expect(initial.presentation.noteColorMode).toBe("standard");
    store.dispatch(command, setNoteColorMode);
    expect(store.project.presentation.noteColorMode).toBe("suzuki");
    expect(store.project.progression).toBe(initial.progression);
    expect(store.project.defaults).toBe(initial.defaults);
    expect(store.project.tonic).toBe(initial.tonic);

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.noteColorMode).toBe("standard");
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.noteColorMode).toBe("suzuki");

    const inverseResult = setNoteColorMode(initial, command);
    const undone = applyInverseCommand(inverseResult.project, inverseResult.inverse);
    expect(undone.presentation.noteColorMode).toBe("standard");
  });

  it("enables resolution arrows by default and supports toggling, undo/redo, and inverse", () => {
    const initial = createDefaultProject("presentation-arrows", "Arrows Project");
    const store = new AppStore(initial);
    const command: SetResolutionArrowsCommand = {
      type: "presentation/set-resolution-arrows",
      payload: { enabled: false, nowIso },
    };

    expect(initial.presentation.resolutionArrows).toBe(true);
    store.dispatch(command, setResolutionArrows);
    expect(store.project.presentation.resolutionArrows).toBe(false);
    expect(store.project.progression).toBe(initial.progression);
    expect(store.project.defaults).toBe(initial.defaults);
    expect(store.project.tonic).toBe(initial.tonic);

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.resolutionArrows).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.resolutionArrows).toBe(false);

    const inverseResult = setResolutionArrows(initial, command);
    const undone = applyInverseCommand(inverseResult.project, inverseResult.inverse);
    expect(undone.presentation.resolutionArrows).toBe(true);
  });

  it("changes genreFocus presentation and supports undo/redo and inverse", () => {
    const initial = createDefaultProject("presentation-genre", "Presentation Genre");
    const store = new AppStore(initial);
    const command: SetGenreFocusCommand = {
      type: "presentation/set-genre-focus",
      payload: { genre: "neo-soul", nowIso },
    };

    store.dispatch(command, setGenreFocus);
    expect(store.project.presentation.genreFocus).toBe("neo-soul");
    expect(store.history.undoDepth).toBe(1);

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.genreFocus).toBe("all");
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.genreFocus).toBe("neo-soul");

    const inverseResult = setGenreFocus(initial, command);
    const undone = applyInverseCommand(inverseResult.project, inverseResult.inverse);
    expect(undone.presentation.genreFocus).toBe("all");
  });

  it("provides three distinct explanation representations without changing recommendation data", () => {
    const candidate = {
      functionId: "V",
      score: 92,
      factors: [
        { code: "dominant-resolution", contribution: 62, source: "function" as const },
        { code: "path-support", contribution: 4, source: "path" as const },
      ],
    };

    const beginner = explainRecommendation(candidate, "beginner");
    const composer = explainRecommendation(candidate, "composer");
    const expert = explainRecommendation(candidate, "expert");

    expect(new Set([beginner.headline, composer.headline, expert.headline]).size).toBe(3);
    expect(beginner.details.join(" ")).not.toBe(composer.details.join(" "));
    expect(composer.details.join(" ")).not.toBe(expert.details.join(" "));
    expect(`${composer.headline} ${composer.details.join(" ")}`).not.toMatch(/score|\+\d|-\d/);
    expect(`${expert.headline} ${expert.details.join(" ")}`).toContain("score");
    expect(candidate.functionId).toBe("V");
    expect(candidate.score).toBe(92);
  });

  it("toggles guitar chord orientation between vertical and horizontal with undo/redo", () => {
    const initial = createDefaultProject("presentation-guitar-orientation", "Guitar Orientation");
    const store = new AppStore(initial);
    const command: SetGuitarChordOrientationCommand = {
      type: "presentation/set-guitar-chord-orientation",
      payload: { orientation: "horizontal", nowIso },
    };

    expect(initial.presentation.guitarChordOrientation).toBe("vertical");
    store.dispatch(command, setGuitarChordOrientation);
    expect(store.project.presentation.guitarChordOrientation).toBe("horizontal");

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.guitarChordOrientation).toBe("vertical");
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.guitarChordOrientation).toBe("horizontal");

    const inverseResult = setGuitarChordOrientation(initial, command);
    const undone = applyInverseCommand(inverseResult.project, inverseResult.inverse);
    expect(undone.presentation.guitarChordOrientation).toBe("vertical");
  });

  it("changes only the project guitar marker color preference and supports undo/redo", () => {
    const initial = createDefaultProject("presentation-guitar-color", "Guitar Colors");
    const store = new AppStore(initial);
    const initialProgression = initial.progression;
    const initialHarmonyTrack = initial.harmonyTrack;
    const initialMelodyTrack = initial.melodyTrack;
    const command: SetGuitarChordColorModeCommand = {
      type: "presentation/set-guitar-chord-color-mode",
      payload: { mode: "fingering", nowIso },
    };

    expect(initial.presentation.guitarChordColorMode).toBe("chord-roles");
    store.dispatch(command, setGuitarChordColorMode);
    expect(store.project.presentation.guitarChordColorMode).toBe("fingering");
    expect(store.project.progression).toBe(initialProgression);
    expect(store.project.harmonyTrack).toBe(initialHarmonyTrack);
    expect(store.project.melodyTrack).toBe(initialMelodyTrack);

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.guitarChordColorMode).toBe("chord-roles");
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.guitarChordColorMode).toBe("fingering");

    const inverseResult = setGuitarChordColorMode(initial, command);
    const undone = applyInverseCommand(inverseResult.project, inverseResult.inverse);
    expect(undone.presentation.guitarChordColorMode).toBe("chord-roles");
  });

  it("toggles side panel mode between fixed and autohide with undo/redo and inverse", () => {
    const initial = createDefaultProject("presentation-side-panel-mode", "Side Panel Mode");
    const store = new AppStore(initial);
    const command: SetSidePanelModeCommand = {
      type: "presentation/set-side-panel-mode",
      payload: { mode: "autohide", nowIso },
    };

    expect(initial.presentation.sidePanelMode).toBe("fixed");
    store.dispatch(command, setSidePanelMode);
    expect(store.project.presentation.sidePanelMode).toBe("autohide");

    expect(store.undo()).toBe(true);
    expect(store.project.presentation.sidePanelMode).toBe("fixed");
    expect(store.redo()).toBe(true);
    expect(store.project.presentation.sidePanelMode).toBe("autohide");

    const inverseResult = setSidePanelMode(initial, command);
    const undone = applyInverseCommand(inverseResult.project, inverseResult.inverse);
    expect(undone.presentation.sidePanelMode).toBe("fixed");
  });
});
