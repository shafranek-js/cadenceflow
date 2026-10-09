import type { Project } from "../../src/domain/project/project";
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import { selectStep } from "../../src/app/commands/progressionCommands";
import { setTempo, type SetTempoCommand } from "../../src/app/commands/timingCommands";
import { ProjectController, ProjectRecoveryCancelledError } from "../../src/app/projectController";
import { createDefaultProject } from "../../src/domain/project/factory";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";
import { createAutosaveEngine } from "../../src/persistence/autosave";
import { createCadenceFlowDb } from "../../src/persistence/db";
import {
  createProjectRepository,
  type ProjectRepository,
} from "../../src/persistence/projectRepository";
import {
  decodePortableProjectWithDiagnostics,
  encodePortableProject,
} from "../../src/persistence/portableProject";

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

/**
 * Normalises a progression for round-trip comparison.
 *
 * `sections` is optional on the type but the wire format always carries the key (the JSON schema
 * requires it), so a project that never had Song Sections comes back from storage with
 * `sections: []`. Absent and empty mean the same thing; comparing without normalising them asserts
 * a structural detail the codec is not meant to preserve.
 */
function progressionForComparison(progression: Project["progression"]) {
  return { ...progression, sections: progression.sections ?? [] };
}
function addHistory(store: AppStore): void {
  const command: SetTempoCommand = {
    type: "timing/set-tempo",
    payload: { tempoBpm: 128, nowIso: "2026-09-07T12:01:00.000Z" },
  };
  store.dispatch(command, setTempo);
}

async function installRecoverableSnapshot(
  repo: ProjectRepository,
  db: ReturnType<typeof createCadenceFlowDb>,
  project: Project,
): Promise<string> {
  const withChord = Object.freeze({
    ...project,
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([createMatrixChordStep(project, "I", "recovery-step")]),
    }),
  });
  await repo.saveProject(withChord);
  const document = JSON.parse(encodePortableProject(withChord)) as {
    schemaVersion: number;
    progression: { steps: Array<Record<string, unknown>> };
  };
  document.schemaVersion = 6;
  document.progression.steps[0]!.melody = { pitchMotion: "corrupt" };
  const payload = JSON.stringify(document);
  await db.projects.update(project.id, { payload, schemaVersion: 6 });
  return payload;
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
    expect({
      ...store.project,
      progression: progressionForComparison(store.project.progression),
    }).toEqual({ ...created, progression: progressionForComparison(created.progression) });
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

    // `sections` is optional on `Progression`: the encoder always writes the key (the JSON schema
    // requires it) and the decoder omits it again when there are none, so a project with no Song
    // Sections comes back without the field. Absent and empty mean the same thing, so compare the
    // progression with that normalised rather than asserting a structure the codec is not meant to
    // preserve.
    const { sections: sourceSections, ...sourceRest } = projectB.progression;
    const { sections: loadedSections, ...loadedRest } = store.project.progression;
    expect(sourceSections ?? []).toEqual(loadedSections ?? []);
    expect(loadedRest).toEqual(sourceRest);
    expect({ ...store.project, progression: undefined }).toEqual({
      ...projectB,
      progression: undefined,
    });
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

  it("recovers without throwing when the stored recovery pointer is stale", async () => {
    const { controller, repo, store } = createHarness();
    await repo.setLastActiveProjectId("missing-project");

    // The engine flushes any pending save before reading the pointer, and a save writes the project
    // it stored as the active one (`autosave.ts` sets `lastActiveProjectId` on every save). So a
    // stale pointer is replaced by a pointer to a project that genuinely exists, and recovery
    // returns that project rather than `null`. Either way it must not throw and must not resurrect
    // the missing id.
    const recovered = await controller.recoverLastSession();

    expect(recovered).not.toBeNull();
    expect(recovered?.id).not.toBe("missing-project");
    expect(store.project.id).toBe(recovered?.id);
    // The pointer now names an existing project -- never the stale one.
    const pointer = await repo.getLastActiveProjectId();
    expect(pointer).not.toBe("missing-project");
    expect(pointer).toBe(recovered?.id);
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

  it("startup recovery cancel leaves the stored payload, pointer, project, and history intact", async () => {
    const { controller, repo, store, db } = createHarness(
      createDefaultProject("placeholder", "Placeholder"),
      { startAutosave: false },
    );
    const saved = createDefaultProject("legacy-recovery", "Legacy recovery");
    const payload = await installRecoverableSnapshot(repo, db, saved);
    await repo.setLastActiveProjectId(saved.id);
    addHistory(store);
    const current = store.project;
    const undoDepth = store.history.undoDepth;
    let decide = (_open: boolean) => {};
    let reportPrompt!: (result: ReturnType<typeof decodePortableProjectWithDiagnostics>) => void;
    const promptShown = new Promise<ReturnType<typeof decodePortableProjectWithDiagnostics>>(
      (resolve) => {
        reportPrompt = resolve;
      },
    );

    const startup = controller.initializeSession("CadenceFlow", (result) => {
      reportPrompt(result);
      return new Promise<boolean>((resolve) => {
        decide = resolve;
      });
    });
    const result = await promptShown;
    expect(result.diagnostics.some((diagnostic) => diagnostic.field === "melody")).toBe(true);
    expect(store.editingSuspended).toBe(true);
    expect(store.project).toBe(current);
    expect(store.history.undoDepth).toBe(undoDepth);
    expect(await repo.getLastActiveProjectId()).toBe(saved.id);
    expect((await db.projects.get(saved.id))?.payload).toBe(payload);

    decide(false);
    await expect(startup).rejects.toBeInstanceOf(ProjectRecoveryCancelledError);
    expect(store.editingSuspended).toBe(false);
    expect(store.project).toBe(current);
    expect(store.history.undoDepth).toBe(undoDepth);
    expect(await repo.getLastActiveProjectId()).toBe(saved.id);
    expect((await db.projects.get(saved.id))?.payload).toBe(payload);
  });

  it("startup recovery persists the migrated snapshot only after confirmation and autosave", async () => {
    const { controller, repo, store, db } = createHarness(
      createDefaultProject("placeholder", "Placeholder"),
      { startAutosave: false },
    );
    const saved = createDefaultProject("legacy-confirmed", "Legacy confirmed");
    const payload = await installRecoverableSnapshot(repo, db, saved);
    await repo.setLastActiveProjectId(saved.id);
    let decide = (_open: boolean) => {};
    let reportPrompt!: (result: ReturnType<typeof decodePortableProjectWithDiagnostics>) => void;
    const promptShown = new Promise<ReturnType<typeof decodePortableProjectWithDiagnostics>>(
      (resolve) => {
        reportPrompt = resolve;
      },
    );

    const startup = controller.initializeSession("CadenceFlow", (result) => {
      reportPrompt(result);
      return new Promise<boolean>((resolve) => {
        decide = resolve;
      });
    });
    const result = await promptShown;
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(store.project.id).toBe("placeholder");
    expect((await db.projects.get(saved.id))?.payload).toBe(payload);

    decide(true);
    await expect(startup).resolves.toMatchObject({ id: saved.id });
    expect(store.project.id).toBe(saved.id);
    expect((await db.projects.get(saved.id))?.payload).toBe(payload);

    controller.startAutosave();
    await controller.flush();
    const persisted = await repo.loadProjectWithDiagnostics?.(saved.id);
    expect(persisted?.diagnostics).toEqual([]);
  });

  it("cancelled named recovery leaves current state and the legacy record untouched", async () => {
    const { controller, repo, store, db } = createHarness();
    await controller.flush();
    const target = createDefaultProject("legacy-named", "Legacy named");
    const payload = await installRecoverableSnapshot(repo, db, target);
    const pointer = await repo.getLastActiveProjectId();
    addHistory(store);
    const current = store.project;
    const undoDepth = store.history.undoDepth;
    let decide = (_open: boolean) => {};
    let reportPrompt!: (result: ReturnType<typeof decodePortableProjectWithDiagnostics>) => void;
    const promptShown = new Promise<ReturnType<typeof decodePortableProjectWithDiagnostics>>(
      (resolve) => {
        reportPrompt = resolve;
      },
    );

    const opening = controller.openNamedProject(target.id, (result) => {
      reportPrompt(result);
      return new Promise<boolean>((resolve) => {
        decide = resolve;
      });
    });
    await promptShown;
    expect(store.project).toBe(current);
    expect(store.history.undoDepth).toBe(undoDepth);
    expect((await db.projects.get(target.id))?.payload).toBe(payload);
    decide(false);
    await opening;

    expect(store.project).toBe(current);
    expect(store.history.undoDepth).toBe(undoDepth);
    expect(await repo.getLastActiveProjectId()).toBe(pointer);
    expect((await db.projects.get(target.id))?.payload).toBe(payload);
  });

  it("does not delete the active project when a recovered replacement is declined", async () => {
    const { controller, repo, store, db } = createHarness();
    await controller.flush();
    addHistory(store);
    const active = store.project;
    const fallback = createDefaultProject("legacy-fallback", "Legacy fallback");
    const payload = await installRecoverableSnapshot(repo, db, fallback);
    const undoDepth = store.history.undoDepth;
    let decide = (_open: boolean) => {};
    let reportPrompt!: (result: ReturnType<typeof decodePortableProjectWithDiagnostics>) => void;
    const promptShown = new Promise<ReturnType<typeof decodePortableProjectWithDiagnostics>>(
      (resolve) => {
        reportPrompt = resolve;
      },
    );

    const deletion = controller.deleteProject(active.id, (result) => {
      reportPrompt(result);
      return new Promise<boolean>((resolve) => {
        decide = resolve;
      });
    });
    await promptShown;
    expect(await repo.loadProject(active.id)).not.toBeNull();
    expect(store.project).toBe(active);
    decide(false);
    await expect(deletion).rejects.toBeInstanceOf(ProjectRecoveryCancelledError);

    expect(await repo.loadProject(active.id)).not.toBeNull();
    expect(store.project).toBe(active);
    expect(store.history.undoDepth).toBe(undoDepth);
    expect((await db.projects.get(fallback.id))?.payload).toBe(payload);
  });

  it("keeps the active record and recovery pointer when creating a delete fallback fails", async () => {
    const { repo, store } = createHarness(undefined, { startAutosave: false });
    addHistory(store);
    const active = store.project;
    await repo.saveProject(active);
    await repo.setLastActiveProjectId(active.id);
    const undoDepth = store.history.undoDepth;
    const failingRepo: ProjectRepository = {
      listProjects: () => repo.listProjects(),
      loadProject: (id) => repo.loadProject(id),
      loadProjectWithDiagnostics: (id) => repo.loadProjectWithDiagnostics!(id),
      saveProject: (project) =>
        project.name === "Untitled"
          ? Promise.reject(new Error("injected fallback save failure"))
          : repo.saveProject(project),
      deleteProject: (id) => repo.deleteProject(id),
      getLastActiveProjectId: () => repo.getLastActiveProjectId(),
      setLastActiveProjectId: (id) => repo.setLastActiveProjectId(id),
      clearLastActiveProjectId: () => repo.clearLastActiveProjectId(),
    };
    const fallbackController = new ProjectController({
      store,
      repo: failingRepo,
      autosave: createAutosaveEngine({ repo: failingRepo, debounceMs: 0 }),
      createId: () => "fresh-fallback",
    });
    controllers.push(fallbackController);

    await expect(fallbackController.deleteProject(active.id)).rejects.toThrow(
      "injected fallback save failure",
    );

    expect(await repo.loadProject(active.id)).not.toBeNull();
    expect(await repo.getLastActiveProjectId()).toBe(active.id);
    expect(store.project).toBe(active);
    expect(store.history.undoDepth).toBe(undoDepth);
    expect(await repo.loadProject("fresh-fallback")).toBeNull();
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
    expect({
      ...store.project,
      progression: progressionForComparison(store.project.progression),
    }).toEqual({ ...copy, progression: progressionForComparison(copy.progression) });
    expect(store.history.undoDepth).toBe(0);
    expect(original?.id).toBe(source.id);
    expect(original?.name).toBe(source.name);
    expect(original && progressionForComparison(original.progression)).toEqual(
      progressionForComparison(source.progression),
    );
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
    expect(progressionForComparison((await repo.loadProject(source.id))!.progression)).toEqual(
      progressionForComparison(source.progression),
    );
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

describe("autosave failure during project replacement", () => {
  it("keeps the current project and history when flushing fails, then allows retry", async () => {
    const { controller, store, repo } = createHarness(undefined, { debounceMs: 60_000 });
    addHistory(store);
    const current = store.project;
    const save = repo.saveProject.bind(repo);
    repo.saveProject = async () => {
      throw new Error("storage unavailable");
    };
    await expect(controller.createNewProject("Next")).rejects.toThrow("storage unavailable");
    expect(store.project).toBe(current);
    expect(store.editingSuspended).toBe(false);
    expect(store.canUndo).toBe(true);
    repo.saveProject = save;
    await controller.createNewProject("Next");
    expect(store.project.name).toBe("Next");
    expect((await repo.loadProject(current.id))?.globalTiming.tempoBpm).toBe(
      current.globalTiming.tempoBpm,
    );
    expect(await repo.getLastActiveProjectId()).toBe(store.project.id);
  });
});

it("switch waits for both outgoing revisions and restart restores the new project", async () => {
  const { controller, store, repo } = createHarness(undefined, {
    debounceMs: 0,
    startAutosave: false,
  });
  await repo.saveProject(createDefaultProject("target", "Target"));
  const save = repo.saveProject.bind(repo);
  const releases: Array<() => void> = [];
  repo.saveProject = async (project) => {
    if (project.id === "project-a") await new Promise<void>((resolve) => releases.push(resolve));
    await save(project);
  };
  controller.startAutosave();
  addHistory(store);
  let switched = false;
  const switching = controller.openNamedProject("target").then(() => {
    switched = true;
  });
  releases.shift()?.();
  for (let i = 0; i < 100 && releases.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(releases).toHaveLength(1);
  expect(switched).toBe(false);
  expect(store.project.id).toBe("project-a");
  releases.shift()?.();
  await switching;
  await controller.flush();
  expect(await repo.getLastActiveProjectId()).toBe("target");
  expect((await repo.loadProject("project-a"))?.globalTiming.tempoBpm).toBe(128);
  const restartedStore = new AppStore(createDefaultProject("placeholder"));
  const restarted = new ProjectController({ store: restartedStore, repo });
  controllers.push(restarted);
  await restarted.recoverLastSession();
  expect(restartedStore.project.id).toBe("target");
});

it("disposed controller cannot activate a project after a delayed durable write", async () => {
  const { controller, store, repo } = createHarness(undefined, { startAutosave: false });
  const original = store.project;
  let release = () => {};
  let writing = false;
  const save = repo.saveProject.bind(repo);
  repo.saveProject = async (project) => {
    writing = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await save(project);
  };
  const creating = controller.createNewProject("Next");
  const rejected = expect(creating).rejects.toThrow("session was closed");
  for (let i = 0; i < 100 && !writing; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  expect(writing).toBe(true);
  controller.dispose();
  release();
  await rejected;
  expect(store.project).toBe(original);
  expect(await repo.getLastActiveProjectId()).toBeNull();
});

it.each(["load", "save"] as const)("blocks edits while a target %s is delayed", async (phase) => {
  const { controller, store, repo } = createHarness(undefined, { startAutosave: false });
  await repo.saveProject(createDefaultProject("target", "Target"));
  addHistory(store);
  const outgoing = store.project;
  controller.autosave.scheduleAutosave(outgoing);
  let entered = false;
  let release = () => {};
  const gate = () =>
    new Promise<void>((resolve) => {
      entered = true;
      release = resolve;
    });
  const load = repo.loadProject.bind(repo);
  const loadWithDiagnostics = repo.loadProjectWithDiagnostics?.bind(repo);
  const save = repo.saveProject.bind(repo);
  repo.loadProject = async (id) => {
    if (phase === "load" && id === "target") await gate();
    return load(id);
  };
  if (loadWithDiagnostics) {
    repo.loadProjectWithDiagnostics = async (id) => {
      if (phase === "load" && id === "target") await gate();
      return loadWithDiagnostics(id);
    };
  }
  repo.saveProject = async (project) => {
    if (phase === "save" && project.id !== outgoing.id) await gate();
    return save(project);
  };
  const switching =
    phase === "load"
      ? controller.openNamedProject("target")
      : controller.createNewProject("Target");
  for (let i = 0; i < 100 && !entered; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  expect(entered).toBe(true);
  store.dispatch(
    { type: "timing/set-tempo", payload: { tempoBpm: 175, nowIso: "2026-10-07T12:00:00Z" } },
    setTempo,
  );
  expect(store.undo()).toBe(false);
  expect(store.redo()).toBe(false);
  expect(store.project).toBe(outgoing);
  release();
  await switching;
  await controller.flush();
  expect(await repo.getLastActiveProjectId()).toBe(store.project.id);
  expect((await repo.loadProject(outgoing.id))?.globalTiming.tempoBpm).toBe(128);
  store.dispatch(
    { type: "timing/set-tempo", payload: { tempoBpm: 175, nowIso: "2026-10-07T12:00:00Z" } },
    setTempo,
  );
  expect(store.project.globalTiming.tempoBpm).toBe(175);
});

it("recovered import waits for confirmation without touching history or recovery", async () => {
  const { controller, store, repo } = createHarness(undefined, { startAutosave: false });
  addHistory(store);
  const original = store.project;
  const doc = JSON.parse(encodePortableProject(createRichProjectFixture()));
  doc.schemaVersion = 6;
  doc.progression.steps[0].melody = { pitchMotion: "corrupt" };
  const text = JSON.stringify(doc);
  const prepared = decodePortableProjectWithDiagnostics(text);
  expect(prepared.diagnostics.some((item) => item.field === "melody")).toBe(true);
  await expect(controller.openPreparedPortableProject(prepared)).rejects.toThrow(
    "Confirm the recovered project",
  );
  let decide = (_open: boolean) => {};
  const opening = controller.openPortableProject(
    text,
    () =>
      new Promise<boolean>((resolve) => {
        decide = resolve;
      }),
  );
  expect(store.project).toBe(original);
  expect(store.canUndo).toBe(true);
  expect(store.editingSuspended).toBe(false);
  expect(await repo.getLastActiveProjectId()).toBeNull();
  decide(false);
  await opening;
  expect(store.project).toBe(original);
  expect(await repo.loadProject(prepared.project.id)).toBeNull();
  expect(await repo.getLastActiveProjectId()).toBeNull();
  expect(JSON.stringify(doc)).toBe(text);
  await controller.openPortableProject(text, async () => true);
  expect(store.project.id).toBe(prepared.project.id);
  expect(await repo.getLastActiveProjectId()).toBe(prepared.project.id);
  expect(store.canUndo).toBe(false);
  await controller.openPortableProject(text, async () => true);
  expect(store.project.id).not.toBe(prepared.project.id);
  expect(store.project.name).toContain("Imported Copy");
  expect((await repo.loadProject(prepared.project.id))?.name).toBe(prepared.project.name);
  expect(await repo.getLastActiveProjectId()).toBe(store.project.id);
  expect(JSON.stringify(doc)).toBe(text);
});
