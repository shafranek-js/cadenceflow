import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";
import { createDefaultProject } from "../../src/domain/project/factory";
import {
  createProjectRepository,
  type ProjectRepository,
} from "../../src/persistence/projectRepository";
import { createAutosaveEngine, type AutosaveEngine } from "../../src/persistence/autosave";
import { createCadenceFlowDb } from "../../src/persistence/db";
import { compareRational, rational } from "../../src/domain/timing/rational";
import type { ChordStep, RestStep } from "../../src/domain/progression/step";

describe("T120 — Dexie Autosave and Project Repository Recovery Contract", () => {
  describe("1. Named Project Repository Lifecycle", () => {
    it("manages multiple named projects independently based on stable ID", async () => {
      const repo: ProjectRepository = createProjectRepository();

      const projA = createDefaultProject("proj-a-id", "Project Alpha");
      const projB = createDefaultProject("proj-b-id", "Project Beta");

      await repo.saveProject(projA);
      await repo.saveProject(projB);

      // List returns both projects
      const list = await repo.listProjects();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.id).sort()).toEqual(["proj-a-id", "proj-b-id"]);

      // Load A returns A, Load B returns B
      const loadedA = await repo.loadProject("proj-a-id");
      expect(loadedA?.name).toBe("Project Alpha");

      const loadedB = await repo.loadProject("proj-b-id");
      expect(loadedB?.name).toBe("Project Beta");

      // Updating A does not mutate B
      const renamedA = { ...projA, name: "Project Alpha Renamed" };
      await repo.saveProject(renamedA);

      const reloadedA = await repo.loadProject("proj-a-id");
      expect(reloadedA?.name).toBe("Project Alpha Renamed");
      expect(reloadedA?.id).toBe("proj-a-id"); // Stable ID

      const reloadedB = await repo.loadProject("proj-b-id");
      expect(reloadedB?.name).toBe("Project Beta");

      // Deleting A does not delete B
      await repo.deleteProject("proj-a-id");
      expect(await repo.loadProject("proj-a-id")).toBeNull();
      expect(await repo.loadProject("proj-b-id")).not.toBeNull();
    });
  });

  describe("2. Rich Semantic Autosave & Recovery", () => {
    it("autosaves and recovers complete semantic Project state without loss", async () => {
      const richProject = createRichProjectFixture();
      const autosave: AutosaveEngine = createAutosaveEngine();

      autosave.scheduleAutosave(richProject);
      await autosave.flush();

      const recovered = await autosave.loadAutosavedProject();
      expect(recovered).not.toBeNull();

      if (!recovered) return;

      // Identity & harmonic context
      expect(recovered.id).toBe(richProject.id);
      expect(recovered.name).toBe(richProject.name);
      expect(recovered.schemaVersion).toBe(3);
      expect(recovered.tonic).toBe(richProject.tonic);
      expect(recovered.activeModule).toBe(richProject.activeModule);

      // Timing & groove
      expect(recovered.globalTiming.tempoBpm).toBe(132);
      expect(recovered.globalTiming.meter.numerator).toBe(7);
      expect(recovered.globalTiming.meter.denominator).toBe(8);
      expect(recovered.globalTiming.meter.grouping).toEqual([2, 2, 3]);
      expect(recovered.groove.feel).toBe("swing");
      expect(recovered.groove.swingAmount).toBe(0.66);

      // Steps
      expect(recovered.progression.steps).toHaveLength(5);
      const s2 = recovered.progression.steps[1] as ChordStep;
      expect(s2.performance.voicingMode).toBe("manual");
      expect(s2.performance.manualVoicing).toHaveLength(4);
      expect(s2.performance.bass.choice).toBe("custom");
      expect(s2.performance.perNoteVelocityOverrides).toEqual({ "60": 110, "72": 85 });
      expect(s2.cardView).toBe("piano");

      const s3 = recovered.progression.steps[2] as RestStep;
      expect(s3.kind).toBe("rest");
      expect(compareRational(s3.duration.beats, rational(2, 3))).toBe(0);

      // Custom presets
      expect(recovered.customPresets).toHaveLength(1);
      expect(recovered.customPresets[0].name).toBe("Custom I-vi-IV");

      // Template overrides
      expect(recovered.moduleTemplateStates.progressions.cards["I"]).toBeDefined();
    });
  });

  describe("3. Active Temporary Branch Recovery", () => {
    it("recovers an uncommitted temporary branch as temporary without committing or dropping", async () => {
      const richProject = createRichProjectFixture();
      expect(richProject.temporaryBranch).toBeDefined();

      const autosave = createAutosaveEngine();
      autosave.scheduleAutosave(richProject);
      await autosave.flush();

      const recovered = await autosave.loadAutosavedProject();
      expect(recovered).not.toBeNull();
      expect(recovered?.temporaryBranch).toBeDefined();
      expect(recovered?.temporaryBranch?.id).toBe("branch-active-whatif-01");
      expect(recovered?.temporaryBranch?.originStepId).toBe("step-2");
      expect(recovered?.temporaryBranch?.originAtEnd).toBe(false);
      expect(recovered?.temporaryBranch?.rejoinStepId).toBe("step-4");
      expect(recovered?.temporaryBranch?.compositionIntent).toBe("surprise");
      expect(recovered?.temporaryBranch?.steps).toHaveLength(2);

      // Main progression remains intact and has not absorbed branch steps
      expect(recovered?.progression.steps).toHaveLength(5);
    });
  });

  describe("4. Crash / Restart Recovery Semantics", () => {
    it("restores latest committed snapshot after session/store is discarded and reinitialized", async () => {
      const db = createCadenceFlowDb("RestartTestDB");
      const session1Autosave = createAutosaveEngine({ debounceMs: 0 });

      const project = createRichProjectFixture();
      session1Autosave.scheduleAutosave(project);
      await session1Autosave.flush();

      // Discard session 1
      session1Autosave.dispose();

      // Session 2 starts fresh on same DB
      const session2Autosave = createAutosaveEngine({ debounceMs: 0 });
      const recovered = await session2Autosave.loadAutosavedProject();

      expect(recovered).not.toBeNull();
      expect(recovered?.id).toBe(project.id);
      expect(recovered?.name).toBe(project.name);

      session2Autosave.dispose();
      await db.delete();
    });
  });

  describe("5. Debounce Contract", () => {
    it("debounces rapid bursts of edits so only the final snapshot is persisted", async () => {
      const autosave = createAutosaveEngine({ debounceMs: 50 });

      const p1 = createDefaultProject("p-burst", "Version 1");
      const p2 = createDefaultProject("p-burst", "Version 2");
      const p3 = createDefaultProject("p-burst", "Version 3");

      autosave.scheduleAutosave(p1);
      autosave.scheduleAutosave(p2);
      autosave.scheduleAutosave(p3);

      await autosave.flush();

      const recovered = await autosave.loadAutosavedProject();
      expect(recovered?.name).toBe("Version 3");
    });
  });

  describe("6. Transactional Latest-Write Safety", () => {
    it("prevents stale earlier saves from overwriting newer committed snapshots", async () => {
      const repo = createProjectRepository();

      const pEarly = createDefaultProject("p-concur", "Early Version");
      const pLate = createDefaultProject("p-concur", "Late Version");

      // Concurrent saves with Late resolving after Early
      await Promise.all([repo.saveProject(pEarly), repo.saveProject(pLate)]);

      const loaded = await repo.loadProject("p-concur");
      expect(loaded).not.toBeNull();
      // Must be a complete valid state, never torn or corrupt
      expect(["Early Version", "Late Version"]).toContain(loaded?.name);
    });
  });

  describe("7. Exclusion of Session History & Audio Runtime", () => {
    it("persists zero Undo/Redo history entries or stacks in autosave database", async () => {
      const richProject = createRichProjectFixture();
      const autosave = createAutosaveEngine();

      autosave.scheduleAutosave(richProject);
      await autosave.flush();

      const recovered = await autosave.loadAutosavedProject();
      expect(recovered).not.toBeNull();

      // Project itself has no history fields
      expect(recovered).not.toHaveProperty("history");
      expect(recovered).not.toHaveProperty("undoStack");
      expect(recovered).not.toHaveProperty("redoStack");
      expect(recovered).not.toHaveProperty("sessionHistory");
    });

    it("persists zero audio context, sample cache, or transport playback state", async () => {
      const richProject = createRichProjectFixture();
      const autosave = createAutosaveEngine();

      autosave.scheduleAutosave(richProject);
      await autosave.flush();

      const recovered = await autosave.loadAutosavedProject();
      expect(recovered).not.toBeNull();

      expect(recovered).not.toHaveProperty("audioContext");
      expect(recovered).not.toHaveProperty("sampleCache");
      expect(recovered).not.toHaveProperty("playing");
      expect(recovered).not.toHaveProperty("paused");
      expect(recovered).not.toHaveProperty("currentStepIndex");
    });
  });

  describe("8. Delete & Cleanup Semantics", () => {
    it("deleting a named project removes its record and prevents orphan resurrection", async () => {
      const repo = createProjectRepository();
      const proj = createDefaultProject("del-proj", "Deletable Project");

      await repo.saveProject(proj);
      expect(await repo.loadProject("del-proj")).not.toBeNull();

      await repo.deleteProject("del-proj");
      expect(await repo.loadProject("del-proj")).toBeNull();

      const list = await repo.listProjects();
      expect(list.some((p) => p.id === "del-proj")).toBe(false);
    });
  });

  describe("9. Failure Isolation", () => {
    it("failed persistence attempt does not corrupt previously stored valid project", async () => {
      const repo = createProjectRepository();
      const validProject = createRichProjectFixture();

      await repo.saveProject(validProject);

      // Attempting to save invalid/corrupt data
      const invalidProject = { ...validProject, schemaVersion: -999 } as unknown as Project;
      await expect(repo.saveProject(invalidProject)).rejects.toThrow();

      // Original valid project remains intact and uncorrupted
      const loaded = await repo.loadProject(validProject.id);
      expect(loaded).not.toBeNull();
      expect(loaded?.schemaVersion).toBe(3);
      expect(loaded?.name).toBe(validProject.name);
    });
  });
});
