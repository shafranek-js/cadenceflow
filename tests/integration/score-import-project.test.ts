import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectController } from "../../src/app/projectController";
import { AppStore } from "../../src/app/appStore";
import { createDefaultProject } from "../../src/domain/project/factory";
import { createCadenceFlowDb } from "../../src/persistence/db";
import { createProjectRepository } from "../../src/persistence/projectRepository";
import { createImportedProject } from "../../src/import/importedProject";
import { parseMidi } from "../../src/import/scoreFile";
import { simpleMidi } from "../fixtures/score-import.fixture";
import { setTempo } from "../../src/app/commands/timingCommands";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function harness() {
  const db = createCadenceFlowDb(`score-import-${crypto.randomUUID()}`),
    repo = createProjectRepository(db),
    original = createDefaultProject("original", "Original"),
    store = new AppStore(original);
  await repo.saveProject(original);
  await repo.setLastActiveProjectId(original.id);
  const controller = new ProjectController({ store, repo, createId: () => "imported-active" });
  controller.startAutosave();
  const score = parseMidi(simpleMidi()),
    imported = createImportedProject(score, score.instruments[0]!, "new.mid", "draft-import");
  cleanups.push(async () => {
    await controller.flush().catch(() => {});
    controller.dispose();
    db.close();
    await db.delete();
  });
  return { db, repo, store, controller, original, imported };
}
describe("imported score project activation", () => {
  it("preserves original edits and history when outgoing autosave flush fails", async () => {
    const { repo, store, controller, original, imported } = await harness();
    const save = repo.saveProject.bind(repo);
    repo.saveProject = async (project) => {
      if (project.id === original.id) throw new Error("outgoing autosave failed");
      return save(project);
    };
    store.dispatch(
      { type: "timing/set-tempo", payload: { tempoBpm: 128, nowIso: "2026-10-09T12:00:00.000Z" } },
      setTempo,
    );
    await expect(controller.openImportedScoreProject(imported)).rejects.toThrow(
      "outgoing autosave failed",
    );
    expect(store.project.id).toBe(original.id);
    expect(store.project.globalTiming.tempoBpm).toBe(128);
    expect(store.history.canUndo).toBe(true);
    expect(store.editingSuspended).toBe(false);
    expect(await repo.loadProject("imported-active")).toBeNull();
    expect(await repo.getLastActiveProjectId()).toBe(original.id);
    repo.saveProject = save;
  });
  it("flushes the original project and atomically saves a separate named project", async () => {
    const { repo, store, controller, original, imported } = await harness();
    store.dispatch(
      { type: "timing/set-tempo", payload: { tempoBpm: 128, nowIso: "2026-10-09T12:00:00.000Z" } },
      setTempo,
    );
    const active = await controller.openImportedScoreProject(imported);
    expect(active.id).toBe("imported-active");
    expect(store.project.id).toBe(active.id);
    expect((await repo.loadProject(original.id))?.globalTiming.tempoBpm).toBe(128);
    expect((await repo.loadProject(active.id))?.name).toBe("new");
    expect(await repo.getLastActiveProjectId()).toBe(active.id);
    expect(await repo.listProjects()).toHaveLength(2);
    expect(store.history.canUndo).toBe(false);
  });
  it("rolls back the new record when activating its pointer fails", async () => {
    const { db, repo, store, controller, original, imported } = await harness();
    const rejectPointer = (changes: object) => {
      if ((changes as { value?: unknown }).value === "imported-active")
        throw new Error("pointer write failed");
    };
    db.metadata.hook("updating", rejectPointer);
    await expect(controller.openImportedScoreProject(imported)).rejects.toThrow(
      "pointer write failed",
    );
    db.metadata.hook("updating").unsubscribe(rejectPointer);
    expect(store.project.id).toBe(original.id);
    expect(await repo.loadProject("imported-active")).toBeNull();
    expect(await repo.getLastActiveProjectId()).toBe(original.id);
    expect(store.editingSuspended).toBe(false);
    await controller.openImportedScoreProject(imported);
    expect(store.project.id).toBe("imported-active");
  });
  it("leaves the original project active if saving the new record fails", async () => {
    const { db, repo, store, controller, original, imported } = await harness();
    const rejectSave = (_key: unknown, record: { id: string }) => {
      if (record.id === "imported-active") throw new Error("project write failed");
    };
    db.projects.hook("creating", rejectSave);
    await expect(controller.openImportedScoreProject(imported)).rejects.toThrow(
      "project write failed",
    );
    db.projects.hook("creating").unsubscribe(rejectSave);
    expect(store.project.id).toBe(original.id);
    expect(await repo.loadProject("imported-active")).toBeNull();
    expect(await repo.getLastActiveProjectId()).toBe(original.id);
  });
});
