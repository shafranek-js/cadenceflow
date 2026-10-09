import { describe, expect, it, vi } from "vitest";
import { DebouncedAutosaveEngine } from "../../../src/persistence/autosave";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";
import type { ProjectRepository } from "../../../src/persistence/projectRepository";

/**
 * Autosave failure-handling regression tests.
 *
 * Regression context: `executeSave` had no `catch` and cleared `pendingProject` *before*
 * attempting the write. Any rejection — an IndexedDB quota error, a schema-encode failure,
 * a closed database — therefore produced an unhandled promise rejection, discarded the
 * pending state, and left the user with no indication that their work was not saved.
 *
 * While fixing that, an intermediate implementation drained its queue on *failure* too,
 * which re-ran the failing write immediately and bypassed the backoff entirely (an
 * unbounded retry loop). The "retries without spinning" test guards that specifically.
 */

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

interface Harness {
  readonly repo: ProjectRepository;
  readonly saveAttempts: () => number;
  readonly savedIds: readonly string[];
  readonly setShouldFail: (value: boolean) => void;
}

function createHarness(): Harness {
  let shouldFail = true;
  let attempts = 0;
  const savedIds: string[] = [];

  const repo: ProjectRepository = {
    async saveProject(project: Project) {
      attempts += 1;
      if (shouldFail) throw new Error("QuotaExceededError: simulated");
      savedIds.push(project.id);
    },
    async setLastActiveProjectId() {},
    async getLastActiveProjectId() {
      return null;
    },
    async loadProject() {
      return null;
    },
    async listProjects() {
      return [];
    },
    async deleteProject() {},
    async clearLastActiveProjectId() {},
  };

  return {
    repo,
    saveAttempts: () => attempts,
    savedIds,
    setShouldFail: (value) => {
      shouldFail = value;
    },
  };
}

describe("autosave failure handling", () => {
  it("reports a failed write and keeps the unsaved Project", async () => {
    const harness = createHarness();
    const errors: { message: string; projectId: string }[] = [];
    const completions: string[] = [];

    const engine = new DebouncedAutosaveEngine({
      repo: harness.repo,
      debounceMs: 0,
      retryDelayMs: 100_000,
      maxRetryDelayMs: 100_000,
      onSaveError: (error, project) => {
        errors.push({
          message: error instanceof Error ? error.message : String(error),
          projectId: project.id,
        });
      },
      onSaveComplete: (project) => completions.push(project.id),
    });

    engine.scheduleAutosave(createDefaultProject("unsaved-project"));
    await settle(20);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.projectId).toBe("unsaved-project");
    expect(errors[0]?.message).toContain("QuotaExceededError");
    expect(completions).toEqual([]);

    engine.dispose();
  });

  it("never rejects out of scheduleAutosave (no unhandled rejection)", async () => {
    const harness = createHarness();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const engine = new DebouncedAutosaveEngine({
      repo: harness.repo,
      debounceMs: 0,
      retryDelayMs: 100_000,
      maxRetryDelayMs: 100_000,
      onSaveError: () => {},
    });

    engine.scheduleAutosave(createDefaultProject("p"));
    await settle(20);

    expect(unhandled).not.toHaveBeenCalled();
    process.off("unhandledRejection", unhandled);
    engine.dispose();
  });

  it("retries without spinning, then persists once the repository recovers", async () => {
    let attemptCount = 0;
    const savedIds: string[] = [];

    const repo: ProjectRepository = {
      async saveProject(project: Project) {
        attemptCount += 1;
        // Fail the first few attempts, then behave. The pending Project must survive the
        // failures and be written by a later retry.
        if (attemptCount <= 3) throw new Error("temporarily unavailable");
        savedIds.push(project.id);
      },
      async setLastActiveProjectId() {},
      async getLastActiveProjectId() {
        return null;
      },
      async loadProject() {
        return null;
      },
      async listProjects() {
        return [];
      },
      async deleteProject() {},
      async clearLastActiveProjectId() {},
    };

    const engine = new DebouncedAutosaveEngine({
      repo,
      debounceMs: 0,
      retryDelayMs: 10,
      maxRetryDelayMs: 20,
      onSaveError: () => {},
    });

    engine.scheduleAutosave(createDefaultProject("recovered-project"));
    await settle(120);

    // Retries must be paced by the backoff rather than run in a tight loop: a 10-20 ms
    // backoff inside 120 ms allows only a handful of attempts. An earlier implementation
    // drained its queue on failure too and produced thousands of attempts here.
    expect(attemptCount).toBeGreaterThan(1);
    expect(attemptCount).toBeLessThan(20);

    // The pending Project survived the failures and was eventually written.
    expect(savedIds).toContain("recovered-project");

    engine.dispose();
  });

  it("flush persists a Project that is still inside the debounce window", async () => {
    const harness = createHarness();
    harness.setShouldFail(false);

    const engine = new DebouncedAutosaveEngine({
      repo: harness.repo,
      debounceMs: 60_000,
      onSaveError: () => {},
    });

    engine.scheduleAutosave(createDefaultProject("flushed-project"));
    expect(harness.savedIds).toEqual([]);

    await engine.flush();

    expect(harness.savedIds).toContain("flushed-project");
    engine.dispose();
  });

  it("writes the newest Project when one is queued during a failed write", async () => {
    const harness = createHarness();
    const attempted: string[] = [];
    let firstCall = true;

    const engine = new DebouncedAutosaveEngine({
      repo: {
        ...harness.repo,
        async saveProject(project: Project) {
          attempted.push(project.id);
          if (firstCall) {
            firstCall = false;
            throw new Error("first write fails");
          }
        },
      },
      debounceMs: 0,
      retryDelayMs: 10,
      maxRetryDelayMs: 20,
      onSaveError: () => {},
    });

    engine.scheduleAutosave(createDefaultProject("older-state"));
    engine.scheduleAutosave(createDefaultProject("newer-state"));
    await settle(80);

    expect(attempted).toContain("newer-state");
    engine.dispose();
  });

  it("stops retrying after dispose", async () => {
    const harness = createHarness();
    const engine = new DebouncedAutosaveEngine({
      repo: harness.repo,
      debounceMs: 0,
      retryDelayMs: 10,
      maxRetryDelayMs: 20,
      onSaveError: () => {},
    });

    engine.scheduleAutosave(createDefaultProject("p"));
    await settle(30);
    engine.dispose();
    const attemptsAtDispose = harness.saveAttempts();

    await settle(60);

    expect(harness.saveAttempts()).toBe(attemptsAtDispose);
  });
});

describe("autosave drain boundary", () => {
  it("flush waits for every revision queued during an in-flight write", async () => {
    const harness = createHarness();
    const releases: Array<() => void> = [];
    const saved: Project[] = [];
    let active: string | null = null;
    const repo: ProjectRepository = {
      ...harness.repo,
      saveProject: async (project) => {
        await new Promise<void>((resolve) => releases.push(resolve));
        saved.push(project);
      },
      setLastActiveProjectId: async (id) => {
        active = id;
      },
      getLastActiveProjectId: async () => active,
      loadProject: async (id) => saved.findLast((project) => project.id === id) ?? null,
    };
    const engine = new DebouncedAutosaveEngine({ repo, debounceMs: 0 });
    const first = createDefaultProject("old", "First");
    const latest = { ...first, name: "Latest" };
    engine.scheduleAutosave(first);
    engine.scheduleAutosave(latest);
    let flushed = false;
    const flush = engine.flush().then(() => {
      flushed = true;
    });
    releases.shift()?.();
    await settle();
    expect(flushed).toBe(false);
    expect(releases).toHaveLength(1);
    releases.shift()?.();
    await flush;
    expect(saved).toEqual([first, latest]);
    await repo.setLastActiveProjectId("new");
    await settle();
    expect(active).toBe("new");
    await repo.setLastActiveProjectId("old");
    const restarted = new DebouncedAutosaveEngine({ repo });
    expect((await restarted.loadAutosavedProject())?.name).toBe("Latest");
    engine.dispose();
    restarted.dispose();
  });

  it("explicit flush rejects a failed drain, preserves the newest state, and can retry", async () => {
    const harness = createHarness();
    const engine = new DebouncedAutosaveEngine({
      repo: harness.repo,
      debounceMs: 60_000,
      retryDelayMs: 60_000,
    });
    engine.scheduleAutosave(createDefaultProject("unsaved"));
    await expect(engine.flush()).rejects.toThrow("QuotaExceededError");
    expect(harness.saveAttempts()).toBe(1);
    harness.setShouldFail(false);
    await engine.flush();
    expect(harness.savedIds).toEqual(["unsaved"]);
    engine.dispose();
  });

  it("disposal prevents late writes from publishing recovery metadata or callbacks", async () => {
    const harness = createHarness();
    let release = () => {};
    const complete = vi.fn();
    const setActive = vi.fn();
    const engine = new DebouncedAutosaveEngine({
      repo: {
        ...harness.repo,
        saveProject: () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        setLastActiveProjectId: setActive,
      },
      debounceMs: 0,
      onSaveComplete: complete,
    });
    engine.scheduleAutosave(createDefaultProject("old"));
    const flush = engine.flush();
    engine.dispose();
    release();
    await flush;
    expect(setActive).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});
