import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import { selectStep } from "../../src/app/commands/progressionCommands";
import { setTempo, type SetTempoCommand } from "../../src/app/commands/timingCommands";
import { ProjectController } from "../../src/app/projectController";
import { createDefaultProject } from "../../src/domain/project/factory";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";
import { createAutosaveEngine } from "../../src/persistence/autosave";
import { createCadenceFlowDb } from "../../src/persistence/db";
import {
  createProjectRepository,
  type ProjectRepository,
} from "../../src/persistence/projectRepository";
import { encodePortableProject } from "../../src/persistence/portableProject";

const databases: Array<ReturnType<typeof createCadenceFlowDb>> = [];
const controllers: ProjectController[] = [];

afterEach(async () => {
  const testControllers = controllers.splice(0);
  await Promise.all(testControllers.map((controller) => controller.flush().catch(() => {})));
  testControllers.forEach((controller) => controller.dispose());
  await Promise.all(
    databases.splice(0).map(async (db) => {
      db.close();
      await db.delete();
    }),
  );
});

function createHarness(
  initial = createDefaultProject("project-a", "Project A"),
  options?: {
    readonly debounceMs?: number;
    readonly startAutosave?: boolean;
    readonly ids?: readonly string[];
  },
) {
  const db = createCadenceFlowDb(`CadenceFlowProjectController-${crypto.randomUUID()}`);
  databases.push(db);
  const repo: ProjectRepository = createProjectRepository(db);
  const autosave = createAutosaveEngine({ repo, debounceMs: options?.debounceMs ?? 0 });
  const store = new AppStore(initial);
  const ids = [...(options?.ids ?? ["project-b", "project-c", "project-d", "project-e"])];
  const controller = new ProjectController({
    store,
    repo,
    autosave,
    createId: () => ids.shift() ?? `generated-${crypto.randomUUID()}`,
    now: () => "2026-09-07T12:00:00.000Z",
  });
  controllers.push(controller);
  if (options?.startAutosave !== false) controller.startAutosave();
  return { controller, repo, store, db };
}

function addHistory(store: AppStore): void {
  const command: SetTempoCommand = {
    type: "timing/set-tempo",
    payload: { tempoBpm: 128, nowIso: "2026-09-07T12:01:00.000Z" },
  };
  store.dispatch(command, setTempo);
}

describe("US8 Batch C — ProjectController lifecycle and session boundaries", () => {
  it("autosaves selected-step UI state without adding an Undo entry", async () => {
    const base = createDefaultProject("project-a", "Project A");
    const step = createMatrixChordStep(base, "I", "step-a");
    const initial = Object.freeze({
      ...base,
      progression: Object.freeze({
        ...base.progression,
        steps: Object.freeze([step]),
      }),
    });
    const { controller, repo, store } = createHarness(initial);
    await controller.flush();

    store.dispatch(
      {
        type: "progression/select-step",
        payload: { stepId: step.id, nowIso: "2026-09-08T00:00:00.000Z" },
      },
      selectStep,
    );
    await controller.flush();

    expect(store.history.canUndo).toBe(false);
    expect((await repo.loadProject(initial.id))?.progression.selectedStepId).toBe(step.id);
  });

  it("creates, persists, names, and activates a fresh project with a unique identity", async () => {
    const { controller, repo, store } = createHarness();
    await controller.flush();

    const created = await controller.createNewProject("  New Song  ");

    expect(created.name).toBe("New Song");
    expect(created.id).toBe("project-b");
    expect(created.id).not.toBe("project-a");
    expect(created.progression.steps).toHaveLength(0);
    expect(store.project).toEqual(created);
    expect(store.history.undoDepth).toBe(0);
    expect(await repo.getLastActiveProjectId()).toBe("project-b");
    expect(await repo.listProjects()).toHaveLength(2);
  });

  it("renames in place without creating a duplicate or clearing active-session history", async () => {
    const { controller, repo, store } = createHarness();
    await controller.flush();
    addHistory(store);
    const beforeDepth = store.history.undoDepth;

    await controller.renameActiveProject("  Renamed Song ");

    expect(store.project.id).toBe("project-a");
    expect(store.project.name).toBe("Renamed Song");
    expect(store.history.undoDepth).toBe(beforeDepth + 1);
    expect(await repo.listProjects()).toHaveLength(1);
    expect((await repo.listProjects())[0]?.name).toBe("Renamed Song");
    expect(await repo.getLastActiveProjectId()).toBe("project-a");
  });

  it("opens a named project atomically and starts it with empty session history", async () => {
    const { controller, repo, store } = createHarness();
    await controller.flush();
    const projectB = createDefaultProject("project-b", "Project B");
    await repo.saveProject(projectB);
    addHistory(store);

    await controller.openNamedProject("project-b");

    expect(store.project).toEqual(projectB);
    expect(store.history.undoDepth).toBe(0);
    expect(store.history.redoDepth).toBe(0);
    expect(await repo.getLastActiveProjectId()).toBe("project-b");
  });

  it("opening the active project flushes pending changes without restoring a stale snapshot", async () => {
    const { controller, repo, store } = createHarness(undefined, { debounceMs: 100_000 });
    await controller.flush();
    addHistory(store);

    await controller.openNamedProject("project-a");

    expect(store.project.globalTiming.tempoBpm).toBe(128);
    expect(store.history.undoDepth).toBe(1);
    expect((await repo.loadProject("project-a"))?.globalTiming.tempoBpm).toBe(128);
    await controller.flush();
    expect((await repo.loadProject("project-a"))?.globalTiming.tempoBpm).toBe(128);
  });

  it("flushes pending outgoing autosave before switching active project identity", async () => {
    const db = createCadenceFlowDb(`CadenceFlowProjectController-race-${crypto.randomUUID()}`);
    databases.push(db);
    const baseRepo = createProjectRepository(db);
    const projectB = createDefaultProject("project-b", "Project B");
    await baseRepo.saveProject(projectB);

    let releaseSave!: () => void;
    let saveStarted!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const started = new Promise<void>((resolve) => {
      saveStarted = resolve;
    });
    let firstSave = true;
    const slowRepo: ProjectRepository = {
      listProjects: () => baseRepo.listProjects(),
      loadProject: (id) => baseRepo.loadProject(id),
      saveProject: async (project) => {
        if (firstSave) {
          firstSave = false;
          saveStarted();
          await saveGate;
        }
        await baseRepo.saveProject(project);
      },
      deleteProject: (id) => baseRepo.deleteProject(id),
      getLastActiveProjectId: () => baseRepo.getLastActiveProjectId(),
      setLastActiveProjectId: (id) => baseRepo.setLastActiveProjectId(id),
      clearLastActiveProjectId: () => baseRepo.clearLastActiveProjectId(),
    };
    const store = new AppStore(createDefaultProject("project-a", "Project A"));
    const controller = new ProjectController({
      store,
      repo: slowRepo,
      autosave: createAutosaveEngine({ repo: slowRepo, debounceMs: 0 }),
      now: () => "2026-09-07T12:00:00.000Z",
    });
    controllers.push(controller);
    controller.startAutosave();
    await started;

    const switchPromise = controller.openNamedProject("project-b");
    await Promise.resolve();
    expect(store.project.id).toBe("project-a");
    releaseSave();
    await switchPromise;

    expect(await baseRepo.loadProject("project-a")).not.toBeNull();
    expect(await baseRepo.getLastActiveProjectId()).toBe("project-b");
    expect(store.project.id).toBe("project-b");
  });

  it("deletes a non-active project without touching the active project or recovery pointer", async () => {
    const { controller, repo, store } = createHarness();
    await controller.flush();
    await repo.saveProject(createDefaultProject("project-b", "Project B"));

    await controller.deleteProject("project-b");

    expect(store.project.id).toBe("project-a");
    expect(await repo.loadProject("project-b")).toBeNull();
    expect(await repo.getLastActiveProjectId()).toBe("project-a");
  });

  it("deletes the active project and activates a surviving project deterministically", async () => {
    const { controller, repo, store } = createHarness();
    await controller.flush();
    const projectB = createDefaultProject("project-b", "Project B");
    await repo.saveProject(projectB);

    await controller.deleteProject("project-a");

    expect(await repo.loadProject("project-a")).toBeNull();
    expect(store.project.id).toBe("project-b");
    expect(store.history.undoDepth).toBe(0);
    expect(await repo.getLastActiveProjectId()).toBe("project-b");
  });

  it("creates a fresh untitled project when deleting the only active project", async () => {
    const { controller, repo, store } = createHarness();
    await controller.flush();

    await controller.deleteProject("project-a");

    expect(await repo.loadProject("project-a")).toBeNull();
    expect(store.project.name).toBe("Untitled");
    expect(store.project.id).toBe("project-b");
    expect(await repo.getLastActiveProjectId()).toBe("project-b");
  });

  it("recovers the valid last session, including an active temporary branch, with fresh history", async () => {
    const source = createRichProjectFixture();
    const first = createHarness(source);
    await first.controller.flush();
    first.controller.dispose();

    const secondStore = new AppStore(createDefaultProject("fallback", "Fallback"));
    const secondController = new ProjectController({
      store: secondStore,
      repo: first.repo,
      autosave: createAutosaveEngine({ repo: first.repo, debounceMs: 0 }),
    });
    addHistory(secondStore);
    const recovered = await secondController.recoverLastSession();

    expect(recovered?.id).toBe(source.id);
    expect(secondStore.project.temporaryBranch?.id).toBe(source.temporaryBranch?.id);
    expect(secondStore.history.undoDepth).toBe(0);
    expect(secondStore.history.redoDepth).toBe(0);
    secondController.dispose();
  });

  it("clears a stale recovery pointer and falls back without throwing", async () => {
    const { controller, repo, store } = createHarness();
    await repo.setLastActiveProjectId("missing-project");

    await expect(controller.recoverLastSession()).resolves.toBeNull();

    expect(store.project.id).toBe("project-a");
    expect(await repo.getLastActiveProjectId()).toBeNull();
  });

  it("startup fallback preserves an existing colliding record and is StrictMode-idempotent", async () => {
    const placeholder = createDefaultProject("local-dev", "CadenceFlow");
    const { controller, repo, store } = createHarness(placeholder, {
      startAutosave: false,
      ids: ["local-dev", "fresh-start"],
    });
    const existing = setTempo(createDefaultProject("local-dev", "Saved Orphan"), {
      type: "timing/set-tempo",
      payload: { tempoBpm: 140, nowIso: "2026-09-07T12:01:00.000Z" },
    }).project;
    await repo.saveProject(existing);
    await repo.setLastActiveProjectId("missing-project");
    addHistory(store);

    const [first, second] = await Promise.all([
      controller.initializeSession("CadenceFlow"),
      controller.initializeSession("CadenceFlow"),
    ]);
    controller.startAutosave();
    await controller.flush();

    expect(first.id).toBe("fresh-start");
    expect(second.id).toBe("fresh-start");
    expect(store.project.id).toBe("fresh-start");
    expect(store.history.undoDepth).toBe(0);
    expect(await repo.getLastActiveProjectId()).toBe("fresh-start");
    expect((await repo.loadProject("local-dev"))?.name).toBe("Saved Orphan");
    expect((await repo.loadProject("local-dev"))?.globalTiming.tempoBpm).toBe(140);
    expect(await repo.listProjects()).toHaveLength(2);
  });

  it("Save Project As creates a new active ID while preserving the original semantic project", async () => {
    const source = createRichProjectFixture();
    const { controller, repo, store } = createHarness(source);
    await controller.flush();
    addHistory(store);

    const copy = await controller.saveProjectAs("Copied Song");
    const original = await repo.loadProject(source.id);

    expect(copy.id).toBe("project-b");
    expect(copy.name).toBe("Copied Song");
    expect(store.project).toEqual(copy);
    expect(store.history.undoDepth).toBe(0);
    expect(original?.id).toBe(source.id);
    expect(original?.name).toBe(source.name);
    expect(original?.progression).toEqual(source.progression);
    expect(copy.temporaryBranch).toEqual(source.temporaryBranch);
    expect(await repo.getLastActiveProjectId()).toBe(copy.id);
  });

  it("exports the canonical codec output and preserves history", async () => {
    const source = createRichProjectFixture();
    const { controller, store } = createHarness(source);
    addHistory(store);

    const exported = controller.exportProject();

    expect(exported.text).toBe(encodePortableProject(store.project));
    expect(exported.filename).toBe("Rich US8 Acceptance Project.cadenceflow");
    expect(store.history.undoDepth).toBe(1);
    expect(exported.text).not.toContain("history");
    expect(exported.text).not.toContain("audioContext");
  });

  it("imports a valid portable project and resets session history while retaining the branch", async () => {
    const source = createRichProjectFixture();
    const { controller, store } = createHarness();
    await controller.flush();
    addHistory(store);

    await controller.openPortableProject(encodePortableProject(source));

    expect(store.project.id).toBe(source.id);
    expect(store.project.temporaryBranch?.id).toBe(source.temporaryBranch?.id);
    expect(store.history.undoDepth).toBe(0);
    expect(store.history.redoDepth).toBe(0);
  });

  it("imports an ID collision as a copy without overwriting local data", async () => {
    const source = createRichProjectFixture();
    const { controller, repo, store } = createHarness(source);
    await controller.flush();

    const imported = await controller.openPortableProject(encodePortableProject(source));

    expect(imported.id).toBe("project-b");
    expect(imported.name).toBe("Rich US8 Acceptance Project (Imported Copy)");
    expect(await repo.loadProject(source.id)).toEqual(source);
    expect(store.project.id).toBe("project-b");
  });

  it("rejects malformed and future-version files without changing project, history, or pointer", async () => {
    const source = createRichProjectFixture();
    const { controller, repo, store } = createHarness(source);
    await controller.flush();
    addHistory(store);
    const before = store.project;
    const pointer = await repo.getLastActiveProjectId();
    const future = JSON.stringify({
      ...JSON.parse(encodePortableProject(source)),
      schemaVersion: 99,
    });
    const schemaInvalid = JSON.stringify({ schemaVersion: 1 });

    await expect(controller.openPortableProject("{not json")).rejects.toThrow("Malformed JSON");
    await expect(controller.openPortableProject(future)).rejects.toThrow(
      "Unsupported project schema version",
    );
    await expect(controller.openPortableProject(schemaInvalid)).rejects.toThrow(
      "Schema validation failed",
    );

    expect(store.project).toBe(before);
    expect(store.history.undoDepth).toBe(1);
    expect(await repo.getLastActiveProjectId()).toBe(pointer);
  });
});
