import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import {
  setExpertiseMode,
  setTheme,
  type SetExpertiseModeCommand,
  type SetThemeCommand,
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
});
