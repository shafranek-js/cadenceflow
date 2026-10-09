import type { Project } from "../domain/project/project";
import type { CadenceFlowDatabase } from "./db";
import type { PortableProjectDecodeResult } from "./portableProject";
import { createProjectRepository, type ProjectRepository } from "./projectRepository";

/**
 * Debounced transactional autosave engine interface and implementation (T123).
 *
 * Failure handling: a rejected write must never be silent. The engine reports it through
 * `onSaveError`, keeps the unsaved Project so a later attempt can retry it, and recovers
 * through a bounded exponential backoff. Previously `executeSave` had no `catch` and
 * cleared `pendingProject` *before* writing, so any failure (IndexedDB quota, an encode
 * error, a closed database) produced an unhandled rejection, discarded the pending state,
 * and left the user with no signal that their work had not been saved.
 *
 * Concurrency: one promise owns the entire sequential drain, including revisions queued
 * during a write. Background callers handle rejection; explicit flush callers observe it.
 */

export interface AutosaveOptions {
  readonly db?: CadenceFlowDatabase;
  readonly repo?: ProjectRepository;
  readonly debounceMs?: number;
  readonly clock?: { now(): number };
  readonly onSaveScheduled?: (project: Project) => void;
  readonly onSaveComplete?: (project: Project) => void;
  readonly onSaveError?: (error: unknown, project: Project) => void;
  /** Base delay for the first retry; doubles per attempt up to `maxRetryDelayMs`. */
  readonly retryDelayMs?: number;
  /**
   * Ceiling for the retry backoff. Retries continue indefinitely at this interval rather
   * than giving up after a fixed number of attempts: a transient failure (IndexedDB quota,
   * a locked database) can outlast any attempt budget, and abandoning the retry would
   * silently lose every edit made afterwards. A new edit resets the backoff and retries
   * promptly, so a persistent failure costs one write attempt per interval.
   */
  readonly maxRetryDelayMs?: number;
}

export interface AutosaveEngine {
  scheduleAutosave(project: Project): void;
  flush(): Promise<void>;
  loadAutosavedProject(): Promise<Project | null>;
  loadAutosavedProjectWithDiagnostics(): Promise<PortableProjectDecodeResult | null>;
  clearRecoveryTarget(): Promise<void>;
  dispose(): void;
}

/** Prevents callers that cannot show a recovery prompt from silently accepting field loss. */
export class AutosaveRecoveryConfirmationRequiredError extends Error {
  constructor(public readonly result: PortableProjectDecodeResult) {
    super("Confirm the recovered project before opening it.");
    this.name = "AutosaveRecoveryConfirmationRequiredError";
  }
}

const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

export class DebouncedAutosaveEngine implements AutosaveEngine {
  private readonly repo: ProjectRepository;
  private readonly debounceMs: number;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly onSaveScheduled: ((project: Project) => void) | undefined;
  private readonly onSaveComplete: ((project: Project) => void) | undefined;
  private readonly onSaveError: ((error: unknown, project: Project) => void) | undefined;

  private pendingProject: Project | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  /** Settles only when the complete drain succeeds or one write fails. */
  private inFlightPromise: Promise<void> | null = null;
  private isDisposed = false;

  constructor(options?: AutosaveOptions) {
    this.repo = options?.repo ?? createProjectRepository(options?.db);
    this.debounceMs = options?.debounceMs ?? 300;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.maxRetryDelayMs = options?.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.onSaveScheduled = options?.onSaveScheduled;
    this.onSaveComplete = options?.onSaveComplete;
    this.onSaveError = options?.onSaveError;
  }

  scheduleAutosave(project: Project): void {
    if (this.isDisposed) {
      return;
    }
    this.pendingProject = project;
    this.onSaveScheduled?.(project);
    this.start(project);
  }

  private start(_project: Project): void {
    // A fresh change supersedes any scheduled retry: it is newer state and should be
    // written promptly rather than waiting out the previous failure's backoff.
    this.clearRetryTimer();
    this.retryAttempt = 0;
    this.clearDebounceTimer();

    if (this.debounceMs <= 0) {
      void this.processPending().catch(() => {});
      return;
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.processPending().catch(() => {});
    }, this.debounceMs);
  }

  /** A single owner drains all revisions; a failed write stops until a paced retry. */
  private processPending(): Promise<void> {
    if (this.inFlightPromise) return this.inFlightPromise;
    if (!this.pendingProject || this.isDisposed) return Promise.resolve();

    const promise = this.drainPending().then(
      () => {
        this.inFlightPromise = null;
        // Also cover a revision queued in a microtask between the final write and
        // settlement of the drain promise. Successful drains can continue immediately.
        return this.processPending();
      },
      (error: unknown) => {
        this.inFlightPromise = null;
        throw error;
      },
    );
    this.inFlightPromise = promise;
    return promise;
  }

  private async drainPending(): Promise<void> {
    while (this.pendingProject && !this.isDisposed) {
      const toSave = this.pendingProject;
      try {
        await this.repo.saveProject(toSave);
        // A disposed session may finish its durable write, but cannot publish recovery
        // metadata or notify the UI belonging to a replacement session.
        if (this.isDisposed) return;
        await this.repo.setLastActiveProjectId(toSave.id);
        if (this.isDisposed) return;
        if (this.pendingProject === toSave) this.pendingProject = null;
        this.retryAttempt = 0;
        this.clearRetryTimer();
        this.onSaveComplete?.(toSave);
      } catch (error) {
        if (!this.isDisposed) {
          this.pendingProject = this.pendingProject ?? toSave;
          this.onSaveError?.(error, this.pendingProject);
          this.scheduleRetry();
        }
        throw error;
      }
    }
  }

  private scheduleRetry(): void {
    if (this.isDisposed) {
      return;
    }
    this.clearRetryTimer();
    const delay = Math.min(this.retryDelayMs * 2 ** this.retryAttempt, this.maxRetryDelayMs);
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.processPending().catch(() => {});
    }, delay);
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async flush(): Promise<void> {
    this.clearDebounceTimer();
    this.clearRetryTimer();
    this.retryAttempt = 0;
    await this.processPending();
  }

  async loadAutosavedProject(): Promise<Project | null> {
    const result = await this.loadAutosavedProjectWithDiagnostics();
    if (result && result.diagnostics.length > 0) {
      throw new AutosaveRecoveryConfirmationRequiredError(result);
    }
    return result?.project ?? null;
  }

  async loadAutosavedProjectWithDiagnostics(): Promise<PortableProjectDecodeResult | null> {
    if (this.pendingProject) {
      await this.flush();
    }
    const lastActiveId = await this.repo.getLastActiveProjectId();
    if (!lastActiveId) {
      return null;
    }
    const result = this.repo.loadProjectWithDiagnostics
      ? await this.repo.loadProjectWithDiagnostics(lastActiveId)
      : await this.repo
          .loadProject(lastActiveId)
          .then((project) =>
            project ? Object.freeze({ project, diagnostics: Object.freeze([]) }) : null,
          );
    if (result) return result;
    // Stale pointer detected: referenced project does not exist in store.
    // Deterministically clear stale pointer and return null (no arbitrary resurrection).
    await this.repo.clearLastActiveProjectId();
    return null;
  }

  /**
   * Clears the `lastActiveProjectId` recovery pointer in metadata so that subsequent
   * sessions do not automatically resume the last project.
   * NOTE: Does NOT cancel pending saves, mutate Project payloads, or delete any Project record.
   */
  async clearRecoveryTarget(): Promise<void> {
    await this.repo.clearLastActiveProjectId();
  }

  /**
   * Disposes the autosave engine, canceling any pending debounce/retry timers
   * and discarding unpersisted pending memory state without scheduling new persistence.
   * NOTE: Call `flush()` prior to `dispose()` if pending state must be guaranteed saved.
   */
  dispose(): void {
    this.isDisposed = true;
    this.clearDebounceTimer();
    this.clearRetryTimer();
    this.pendingProject = null;
  }
}

export function createAutosaveEngine(options?: AutosaveOptions): AutosaveEngine {
  return new DebouncedAutosaveEngine(options);
}
