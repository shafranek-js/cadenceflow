import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  setExpertiseMode,
  setStaffBassVisibility,
  setTheme,
  type SetExpertiseModeCommand,
  type SetStaffBassVisibilityCommand,
  type SetThemeCommand,
} from "../../src/app/commands/presentationCommands";
import { ProjectController } from "../../src/app/projectController";
import { createDefaultProject } from "../../src/domain/project/factory";
import { createAutosaveEngine } from "../../src/persistence/autosave";
import { createCadenceFlowDb } from "../../src/persistence/db";
import { createProjectRepository } from "../../src/persistence/projectRepository";

const resources: Array<{
  readonly controller: ProjectController;
  readonly db: ReturnType<typeof createCadenceFlowDb>;
}> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.controller.flush();
    resource.controller.dispose();
    resource.db.close();
    await resource.db.delete();
  }
});

describe("US10 presentation persistence", () => {
  it("persists open project tab IDs in the existing metadata store", async () => {
    const db = createCadenceFlowDb(`ProjectTabsPersistence-${crypto.randomUUID()}`);
    const repo = createProjectRepository(db);

    try {
      await repo.setOpenProjectTabsState!({
        ids: ["project-b", "project-a", "project-b"],
        source: "user",
        updatedAt: 42,
      });

      const freshRepo = createProjectRepository(db);
      expect(await freshRepo.getOpenProjectTabsState!()).toEqual({
        ids: ["project-b", "project-a"],
        source: "user",
        updatedAt: 42,
      });
    } finally {
      db.close();
      await db.delete();
    }
  });

  it("autosaves and reloads theme and expertise without changing musical state", async () => {
    const db = createCadenceFlowDb(`PresentationPersistence-${crypto.randomUUID()}`);
    const repo = createProjectRepository(db);
    const autosave = createAutosaveEngine({ repo, debounceMs: 0 });
    const initial = createDefaultProject("presentation-persist", "Presentation Persist");
    const store = new AppStore(initial);
    const controller = new ProjectController({ store, repo, autosave });
    resources.push({ controller, db });
    controller.startAutosave();

    const themeCommand: SetThemeCommand = {
      type: "presentation/set-theme",
      payload: { theme: "light", nowIso: "2026-09-08T12:01:00.000Z" },
    };
    const modeCommand: SetExpertiseModeCommand = {
      type: "presentation/set-expertise-mode",
      payload: { expertiseMode: "expert", nowIso: "2026-09-08T12:02:00.000Z" },
    };
    store.dispatch(themeCommand, setTheme);
    store.dispatch(modeCommand, setExpertiseMode);
    store.dispatch(
      {
        type: "presentation/set-staff-bass-visibility",
        payload: { visible: true, nowIso: "2026-09-08T12:02:30.000Z" },
      } satisfies SetStaffBassVisibilityCommand,
      setStaffBassVisibility,
    );
    await controller.flush();

    const reloaded = await autosave.loadAutosavedProject();
    expect(reloaded).not.toBeNull();
    expect(reloaded?.presentation.theme).toBe("light");
    expect(reloaded?.presentation.expertiseMode).toBe("expert");
    expect(reloaded?.presentation.showBassInStaff).toBe(true);
    expect(reloaded?.tonic).toBe(initial.tonic);
    expect(reloaded?.activeModule).toBe(initial.activeModule);
    expect(reloaded?.progression.steps).toEqual(initial.progression.steps);
    expect(reloaded).not.toHaveProperty("history");
  });

  it("keeps presentation state project-owned across a named project switch", async () => {
    const db = createCadenceFlowDb(`PresentationSwitch-${crypto.randomUUID()}`);
    const repo = createProjectRepository(db);
    const autosave = createAutosaveEngine({ repo, debounceMs: 0 });
    const projectA = createDefaultProject("presentation-a", "Presentation A");
    const projectB = createDefaultProject("presentation-b", "Presentation B");
    await repo.saveProject(projectB);
    const store = new AppStore(projectA);
    const controller = new ProjectController({ store, repo, autosave });
    resources.push({ controller, db });
    controller.startAutosave();

    store.dispatch(
      {
        type: "presentation/set-theme",
        payload: { theme: "light", nowIso: "2026-09-08T12:03:00.000Z" },
      } satisfies SetThemeCommand,
      setTheme,
    );
    await controller.flush();
    await controller.openNamedProject(projectB.id);
    expect(store.project.id).toBe(projectB.id);
    expect(store.project.presentation.theme).toBe("dark");
    expect(store.history.undoDepth).toBe(0);

    await controller.openNamedProject(projectA.id);
    expect(store.project.id).toBe(projectA.id);
    expect(store.project.presentation.theme).toBe("light");
  });
});
