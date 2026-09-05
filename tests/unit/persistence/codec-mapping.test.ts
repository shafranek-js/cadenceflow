import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeDurationDisplayHint,
  encodeDurationDisplayHint,
  encodePortableProject,
  InvalidPortableProjectError,
} from "../../../src/persistence/portableProject";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  InvalidProjectDataError,
  migrateProjectData,
  UnsupportedProjectVersionError,
} from "../../../src/domain/project/migrations";
import { rational } from "../../../src/domain/timing/rational";
import type { DurationDisplayHint } from "../../../src/domain/timing/duration";
import { createCadenceFlowDb } from "../../../src/persistence/db";
import {
  createProjectRepository,
  type ProjectRepository,
} from "../../../src/persistence/projectRepository";
import { createAutosaveEngine } from "../../../src/persistence/autosave";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import type { Project } from "../../../src/domain/project/project";

describe("T121–T125 — US8 Persistence & Codec Verification Suite", () => {
  describe("DurationDisplayHint Strict Grammar & Exhaustive Round-Trip (Items 3, 4)", () => {
    const validVariants: Array<{
      name: string;
      hint?: DurationDisplayHint;
      expectedWire?: string;
    }> = [
      { name: "undefined", hint: undefined, expectedWire: undefined },
      { name: "beats without label", hint: { kind: "beats" }, expectedWire: "beats" },
      {
        name: "beats with simple label",
        hint: { kind: "beats", label: "quarter" },
        expectedWire: "beats:quarter",
      },
      {
        name: "beats with label containing symbols, colons, and spaces",
        hint: { kind: "beats", label: "dotted-quarter feel: custom (1.5x)" },
        expectedWire: "beats:dotted-quarter feel: custom (1.5x)",
      },
      {
        name: "beats with fractional label",
        hint: { kind: "beats", label: "3/2 beats" },
        expectedWire: "beats:3/2 beats",
      },
      { name: "bars = 1", hint: { kind: "bars", bars: 1 }, expectedWire: "bars:1" },
      { name: "bars = 4", hint: { kind: "bars", bars: 4 }, expectedWire: "bars:4" },
      {
        name: "dotted baseBeats = 1/1",
        hint: { kind: "dotted", baseBeats: rational(1, 1) },
        expectedWire: "dotted:1/1",
      },
      {
        name: "dotted baseBeats = 3/2",
        hint: { kind: "dotted", baseBeats: rational(3, 2) },
        expectedWire: "dotted:3/2",
      },
      {
        name: "triplet baseBeats = 2/3",
        hint: { kind: "triplet", baseBeats: rational(2, 3) },
        expectedWire: "triplet:2/3",
      },
      {
        name: "triplet baseBeats = 1/4",
        hint: { kind: "triplet", baseBeats: rational(1, 4) },
        expectedWire: "triplet:1/4",
      },
    ];

    it.each(validVariants)("round-trips $name deterministically", ({ hint, expectedWire }) => {
      const encoded1 = encodeDurationDisplayHint(hint);
      const encoded2 = encodeDurationDisplayHint(hint);
      expect(encoded1).toBe(expectedWire);
      expect(encoded1).toBe(encoded2);

      const decoded = decodeDurationDisplayHint(encoded1);
      expect(decoded).toEqual(hint);
    });

    const malformedInputs = [
      "foo",
      "bars:nope",
      "bars:0",
      "bars:-1",
      "bars:1.5",
      "dotted:abc",
      "dotted:1/0",
      "dotted:-1/2",
      "dotted:0/1",
      "triplet:1/0",
      "triplet:abc/1",
      "triplet:0/2",
      "legacy-whatever",
      "",
    ];

    it.each(malformedInputs)(
      "strictly rejects malformed wire input '%s' without silent fallback",
      (malformed) => {
        expect(() => decodeDurationDisplayHint(malformed)).toThrow(InvalidPortableProjectError);
      },
    );
  });

  describe("Schema Migration Chain (T125)", () => {
    it("passes through valid schemaVersion 1 data", () => {
      const data = { schemaVersion: 1, name: "Test" };
      const migrated = migrateProjectData(data);
      expect(migrated).toEqual(data);
      expect(migrated.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    });

    it("rejects non-object payloads with InvalidProjectDataError", () => {
      expect(() => migrateProjectData(null)).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData(undefined)).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData("hello")).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData(42)).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData([])).toThrow(InvalidProjectDataError);
    });

    it("rejects missing or non-integer schemaVersion with InvalidProjectDataError", () => {
      expect(() => migrateProjectData({})).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData({ schemaVersion: "1" })).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData({ schemaVersion: 1.5 })).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData({ schemaVersion: 0 })).toThrow(InvalidProjectDataError);
      expect(() => migrateProjectData({ schemaVersion: -5 })).toThrow(InvalidProjectDataError);
    });

    it("rejects future schemaVersion with UnsupportedProjectVersionError", () => {
      expect(() => migrateProjectData({ schemaVersion: 2 })).toThrow(
        UnsupportedProjectVersionError,
      );
      expect(() => migrateProjectData({ schemaVersion: 100 })).toThrow(
        UnsupportedProjectVersionError,
      );
    });
  });

  describe("Dexie Uses Exactly the Portable Semantic Document (Item 7)", () => {
    it("stores the exact canonical portable document in projects[id] and excludes revision from export", async () => {
      const db = createCadenceFlowDb("ExactPayloadDB");
      const repo = createProjectRepository(db);
      const project = createRichProjectFixture();

      await repo.saveProject(project);

      // Load raw record directly from Dexie
      const record = await db.projects.get(project.id);
      expect(record).toBeDefined();
      expect(record?.id).toBe(project.id);
      expect(record?.revision).toBe(1);

      // Semantic payload in Dexie must match encodePortableProject bit-for-bit
      const portableJson = encodePortableProject(project);
      expect(record?.payload).toBe(portableJson);

      // Verify the parsed payload in Dexie matches parsed portable JSON
      const parsedStored = JSON.parse(record!.payload);
      const parsedPortable = JSON.parse(portableJson);
      expect(parsedStored).toEqual(parsedPortable);

      // Assert persistence-only 'revision' does NOT appear in portable file output
      expect(portableJson).not.toContain('"revision"');
      expect(parsedPortable).not.toHaveProperty("revision");

      await db.delete();
    });
  });

  describe("Stale Pointer Recovery Behavior (Item 9)", () => {
    it("returns null, clears stale pointer, and avoids arbitrary resurrection", async () => {
      const db = createCadenceFlowDb("StalePointerDB");
      const repo = createProjectRepository(db);
      const autosave = createAutosaveEngine({ db, repo });

      // Save a project and set active pointer
      const project = createDefaultProject("p-existing", "Existing");
      await repo.saveProject(project);
      await repo.setLastActiveProjectId("p-existing");

      // Intentionally corrupt pointer to non-existent ID
      await repo.setLastActiveProjectId("missing-project-id");
      expect(await repo.getLastActiveProjectId()).toBe("missing-project-id");

      // Recovery attempt
      const recovered = await autosave.loadAutosavedProject();

      // Must return null, not resurrect another project, and must clear stale pointer
      expect(recovered).toBeNull();
      expect(await repo.getLastActiveProjectId()).toBeNull();

      autosave.dispose();
      await db.delete();
    });
  });

  describe("Rename + Pointer Stability (Item 10)", () => {
    it("updates metadata while maintaining single record and pointer identity", async () => {
      const db = createCadenceFlowDb("RenamePointerDB");
      const repo = createProjectRepository(db);

      // 1. Save project ID p1, name Old
      const p1 = createDefaultProject("p1", "Old");
      await repo.saveProject(p1);

      // 2. Set lastActiveProjectId = p1
      await repo.setLastActiveProjectId("p1");

      // 3. Save same ID with name New
      const p1Renamed = { ...p1, name: "New" };
      await repo.saveProject(p1Renamed);

      // 4. List and load return New
      const list = await repo.listProjects();
      expect(list).toHaveLength(1);
      expect(list[0]?.name).toBe("New");

      const loaded = await repo.loadProject("p1");
      expect(loaded?.name).toBe("New");

      // 5. Only one p1 record exists
      const allRecords = await db.projects.toArray();
      expect(allRecords).toHaveLength(1);
      expect(allRecords[0]?.id).toBe("p1");
      expect(allRecords[0]?.revision).toBe(2);

      // 6. Pointer still equals p1
      expect(await repo.getLastActiveProjectId()).toBe("p1");

      await db.delete();
    });
  });

  describe("Delete Pointer Atomicity across Fresh Instances (Item 11)", () => {
    it("atomically deletes project and pointer and recovers nothing from fresh repository", async () => {
      const db = createCadenceFlowDb("DeleteAtomicDB");
      const repo1 = createProjectRepository(db);

      const p = createDefaultProject("p-delete", "To Delete");
      await repo1.saveProject(p);
      await repo1.setLastActiveProjectId("p-delete");

      // Delete project
      await repo1.deleteProject("p-delete");

      // Re-instantiate fresh repository and autosave engine on same DB
      const repo2 = createProjectRepository(db);
      const autosave2 = createAutosaveEngine({ db, repo: repo2 });

      expect(await repo2.loadProject("p-delete")).toBeNull();
      expect(await repo2.getLastActiveProjectId()).toBeNull();
      expect(await autosave2.loadAutosavedProject()).toBeNull();

      autosave2.dispose();
      await db.delete();
    });
  });

  describe("Validation-Before-Write Isolation (Item 12)", () => {
    it("does not increment revision, replace record, or mutate metadata on invalid write", async () => {
      const db = createCadenceFlowDb("ValidationIsolationDB");
      const repo = createProjectRepository(db);
      const validProject = createRichProjectFixture();

      await repo.saveProject(validProject);

      const recordBefore = await db.projects.get(validProject.id);
      expect(recordBefore?.revision).toBe(1);

      // Attempt invalid write with corrupted schemaVersion
      const invalidProject = { ...validProject, schemaVersion: -999 } as unknown as Project;
      await expect(repo.saveProject(invalidProject)).rejects.toThrow();

      // Verify Dexie state bit-for-bit unchanged
      const recordAfter = await db.projects.get(validProject.id);
      expect(recordAfter?.revision).toBe(1);
      expect(recordAfter?.payload).toBe(recordBefore?.payload);
      expect(recordAfter?.updatedAt).toBe(recordBefore?.updatedAt);

      // Loading returns exact previous valid project
      const loaded = await repo.loadProject(validProject.id);
      expect(loaded?.schemaVersion).toBe(1);
      expect(loaded?.name).toBe(validProject.name);

      await db.delete();
    });
  });

  describe("Autosave Debounce Write Count (Item 14)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("invokes repository save exactly once for rapid bursts of A, B, C with payload C", async () => {
      let saveCount = 0;
      let lastSavedProject: Project | null = null;

      const mockRepo: ProjectRepository = {
        async listProjects() {
          return [];
        },
        async loadProject(id: string) {
          return lastSavedProject?.id === id ? lastSavedProject : null;
        },
        async saveProject(project: Project) {
          saveCount++;
          lastSavedProject = project;
        },
        async deleteProject() {},
        async getLastActiveProjectId() {
          return lastSavedProject?.id ?? null;
        },
        async setLastActiveProjectId() {},
        async clearLastActiveProjectId() {},
      };

      const autosave = createAutosaveEngine({ repo: mockRepo, debounceMs: 100 });

      const pA = createDefaultProject("p-burst", "Version A");
      const pB = createDefaultProject("p-burst", "Version B");
      const pC = createDefaultProject("p-burst", "Version C");

      autosave.scheduleAutosave(pA);
      vi.advanceTimersByTime(30);
      autosave.scheduleAutosave(pB);
      vi.advanceTimersByTime(30);
      autosave.scheduleAutosave(pC);

      expect(saveCount).toBe(0);

      // Advance past debounce threshold
      vi.advanceTimersByTime(110);
      await Promise.resolve(); // flush microtasks

      expect(saveCount).toBe(1);
      expect(lastSavedProject?.name).toBe("Version C");

      autosave.dispose();
    });
  });

  describe("Completion-Inversion & Latest-Write Race Protection (Item 13)", () => {
    it("guarantees newest snapshot wins even when prior write resolves later", async () => {
      let resolveGateA: () => void = () => {};
      const gateAPromise = new Promise<void>((res) => {
        resolveGateA = res;
      });

      const saveOrder: string[] = [];
      let finalCommittedProject: Project | null = null;

      const mockRepo: ProjectRepository = {
        async listProjects() {
          return [];
        },
        async loadProject() {
          return finalCommittedProject;
        },
        async saveProject(project: Project) {
          if (project.name === "Version A") {
            // Delay save of A
            await gateAPromise;
          }
          saveOrder.push(project.name);
          finalCommittedProject = project;
        },
        async deleteProject() {},
        async getLastActiveProjectId() {
          return finalCommittedProject?.id ?? null;
        },
        async setLastActiveProjectId() {},
        async clearLastActiveProjectId() {},
      };

      const autosave = createAutosaveEngine({ repo: mockRepo, debounceMs: 0 });

      const pA = createDefaultProject("race-id", "Version A");
      const pB = createDefaultProject("race-id", "Version B");

      // 1. Schedule A (enters saveProject and blocks on gateA)
      autosave.scheduleAutosave(pA);

      // 2. Schedule B while A is in flight
      autosave.scheduleAutosave(pB);

      // 3. Complete A
      resolveGateA();
      await autosave.flush();

      // Both writes executed sequentially without tearing, and B was committed last
      expect(saveOrder).toEqual(["Version A", "Version B"]);
      expect(finalCommittedProject?.name).toBe("Version B");

      const loaded = await autosave.loadAutosavedProject();
      expect(loaded?.name).toBe("Version B");

      autosave.dispose();
    });
  });

  describe("flush() and dispose() Contracts (Items 15, 16, 2)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("flush() immediately persists pending snapshot, clears timer, and prevents duplicate later writes", async () => {
      let saveCount = 0;
      const mockRepo: ProjectRepository = {
        async listProjects() {
          return [];
        },
        async loadProject() {
          return null;
        },
        async saveProject() {
          saveCount++;
        },
        async deleteProject() {},
        async getLastActiveProjectId() {
          return null;
        },
        async setLastActiveProjectId() {},
        async clearLastActiveProjectId() {},
      };

      const autosave = createAutosaveEngine({ repo: mockRepo, debounceMs: 500 });
      const p = createDefaultProject("flush-p", "Flush Test");

      autosave.scheduleAutosave(p);
      expect(saveCount).toBe(0);

      // Flush before timer fires
      await autosave.flush();
      expect(saveCount).toBe(1);

      // Timer duration expires: no duplicate save should occur
      vi.advanceTimersByTime(1000);
      expect(saveCount).toBe(1);

      autosave.dispose();
    });

    it("dispose() cancels pending timer and does not trigger unpersisted writes", () => {
      let saveCount = 0;
      const mockRepo: ProjectRepository = {
        async listProjects() {
          return [];
        },
        async loadProject() {
          return null;
        },
        async saveProject() {
          saveCount++;
        },
        async deleteProject() {},
        async getLastActiveProjectId() {
          return null;
        },
        async setLastActiveProjectId() {},
        async clearLastActiveProjectId() {},
      };

      const autosave = createAutosaveEngine({ repo: mockRepo, debounceMs: 200 });
      const p = createDefaultProject("dispose-p", "Dispose Test");

      autosave.scheduleAutosave(p);
      autosave.dispose();

      // Advancing time past debounce must NOT trigger save
      vi.advanceTimersByTime(500);
      expect(saveCount).toBe(0);
    });
  });

  describe("clearAutosave() Contract (Item 2)", () => {
    it("cancels timer and clears pointer without deleting the Project record", async () => {
      const db = createCadenceFlowDb("ClearAutosaveDB");
      const repo = createProjectRepository(db);
      const autosave = createAutosaveEngine({ db, repo });

      const p = createDefaultProject("p-retain", "Retained Project");
      await repo.saveProject(p);
      await repo.setLastActiveProjectId("p-retain");

      await autosave.clearAutosave();

      // Pointer cleared
      expect(await repo.getLastActiveProjectId()).toBeNull();

      // But project record is NOT deleted!
      expect(await repo.loadProject("p-retain")).not.toBeNull();

      autosave.dispose();
      await db.delete();
    });
  });
});
