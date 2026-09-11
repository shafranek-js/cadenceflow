import { describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  setMeasuresPerSystem,
  setProgressionView,
  type SetMeasuresPerSystemCommand,
  type SetProgressionViewCommand,
} from "../../src/app/commands/presentationCommands";
import { createDefaultProject } from "../../src/domain/project/factory";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";

describe("US13 global presentation state", () => {
  it("is undoable, redoable, and absent from musical step state", () => {
    const initial = createDefaultProject("us13-presentation", "US13 Presentation");
    const store = new AppStore(initial);

    store.dispatch(
      {
        type: "presentation/set-progression-view",
        payload: { view: "staff", nowIso: "2026-09-11T12:01:00.000Z" },
      } satisfies SetProgressionViewCommand,
      setProgressionView,
    );
    store.dispatch(
      {
        type: "presentation/set-measures-per-system",
        payload: { measuresPerSystem: 2, nowIso: "2026-09-11T12:02:00.000Z" },
      } satisfies SetMeasuresPerSystemCommand,
      setMeasuresPerSystem,
    );

    expect(store.project.presentation.progressionView).toBe("staff");
    expect(store.project.presentation.measuresPerSystem).toBe(2);
    expect(store.project.progression).toBe(initial.progression);
    expect(store.undo()).toBe(true);
    expect(store.project.presentation.measuresPerSystem).toBe("auto");
    expect(store.undo()).toBe(true);
    expect(store.project.presentation.progressionView).toBe("harmonic");
    expect(store.redo()).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.project.presentation).toMatchObject({
      progressionView: "staff",
      measuresPerSystem: 2,
    });
  });

  it("round-trips explicit presentation state without serializing history", () => {
    const project = createDefaultProject("us13-persistence", "US13 Persistence");
    const view = setProgressionView(project, {
      type: "presentation/set-progression-view",
      payload: { view: "piano", nowIso: "2026-09-11T12:03:00.000Z" },
    }).project;
    const updated = setMeasuresPerSystem(view, {
      type: "presentation/set-measures-per-system",
      payload: { measuresPerSystem: 3, nowIso: "2026-09-11T12:04:00.000Z" },
    }).project;

    const restored = decodePortableProject(encodePortableProject(updated));

    expect(restored.presentation.progressionView).toBe("piano");
    expect(restored.presentation.measuresPerSystem).toBe(3);
    expect(restored).not.toHaveProperty("history");
    expect(restored.progression).toEqual(updated.progression);
  });
});
