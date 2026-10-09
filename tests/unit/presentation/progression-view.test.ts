import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import {
  setMeasuresPerSystem,
  setProgressionView,
  type SetMeasuresPerSystemCommand,
  type SetProgressionViewCommand,
} from "../../../src/app/commands/presentationCommands";

const T0 = "2026-09-11T12:00:00.000Z";
const T1 = "2026-09-11T12:00:01.000Z";

describe("US13 global progression presentation settings", () => {
  it("defaults to the piano-roll view and automatic measure packing", () => {
    const project = createDefaultProject("test-p", "Test", T0);

    // The shipped default is the piano-roll view; this assertion used to expect "harmonic", which
    // the product had already moved away from.
    expect(project.presentation.progressionView).toBe("piano-roll");
    expect(project.presentation.measuresPerSystem).toBe("auto");
  });

  it("updates progression view and restores it through the inverse command", () => {
    const project = createDefaultProject("test-p", "Test", T0);
    const previousView = project.presentation.progressionView;
    const result = setProgressionView(project, {
      type: "presentation/set-progression-view",
      payload: { view: "staff", nowIso: T1 },
    });

    expect(result.project.presentation.progressionView).toBe("staff");
    expect(result.inverse.type).toBe("presentation/set-progression-view");
    // The inverse restores whatever the view was, not a hard-coded value.
    expect((result.inverse as SetProgressionViewCommand).payload.view).toBe(previousView);

    const restored = setProgressionView(
      result.project,
      result.inverse as SetProgressionViewCommand,
    );
    expect(restored.project.presentation.progressionView).toBe(previousView);
  });

  it("updates progression view to tablature and guitar", () => {
    const project = createDefaultProject("test-p", "Test", T0);
    const tabResult = setProgressionView(project, {
      type: "presentation/set-progression-view",
      payload: { view: "tablature", nowIso: T1 },
    });
    expect(tabResult.project.presentation.progressionView).toBe("tablature");

    const guitarResult = setProgressionView(tabResult.project, {
      type: "presentation/set-progression-view",
      payload: { view: "guitar", nowIso: T1 },
    });
    expect(guitarResult.project.presentation.progressionView).toBe("guitar");
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8] as const)(
    "updates the maximum to %s measures per system and supports inverse",
    (measuresPerSystem) => {
      const project = createDefaultProject("test-p", "Test", T0);
      const result = setMeasuresPerSystem(project, {
        type: "presentation/set-measures-per-system",
        payload: { measuresPerSystem, nowIso: T1 },
      });

      expect(result.project.presentation.measuresPerSystem).toBe(measuresPerSystem);
      expect(result.inverse.type).toBe("presentation/set-measures-per-system");
      expect((result.inverse as SetMeasuresPerSystemCommand).payload.measuresPerSystem).toBe(
        "auto",
      );
    },
  );
});
