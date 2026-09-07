import type { Project } from "../domain/project/project";

export interface PersistenceTestState {
  readonly autosaveCount: number;
  readonly lastScheduledProjectSnapshot: string;
  readonly lastCompletedProjectSnapshot: string;
  readonly lastAutosavedProjectId: string;
  readonly lastAutosavedProjectName: string;
}

interface PersistenceTestWindow extends Window {
  __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
  __cadenceflow_persistence__?: PersistenceTestState;
}

function testWindow(): PersistenceTestWindow | null {
  if (typeof window === "undefined") return null;
  const candidate = window as PersistenceTestWindow;
  if (!candidate.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__) {
    return null;
  }
  return candidate;
}

/**
 * Reports production autosave lifecycle events without exposing a mutation API.
 * This is intentionally inert unless explicitly enabled by automated tests.
 */
export function reportAutosaveScheduled(project: Project): void {
  const candidate = testWindow();
  if (!candidate) return;
  const previous = candidate.__cadenceflow_persistence__;
  candidate.__cadenceflow_persistence__ = Object.freeze({
    autosaveCount: previous?.autosaveCount ?? 0,
    lastScheduledProjectSnapshot: JSON.stringify(project),
    lastCompletedProjectSnapshot: previous?.lastCompletedProjectSnapshot ?? "",
    lastAutosavedProjectId: previous?.lastAutosavedProjectId ?? "",
    lastAutosavedProjectName: previous?.lastAutosavedProjectName ?? "",
  });
}

export function reportAutosaveComplete(project: Project): void {
  const candidate = testWindow();
  if (!candidate) return;
  const previous = candidate.__cadenceflow_persistence__;
  candidate.__cadenceflow_persistence__ = Object.freeze({
    autosaveCount: (previous?.autosaveCount ?? 0) + 1,
    lastScheduledProjectSnapshot: previous?.lastScheduledProjectSnapshot ?? JSON.stringify(project),
    lastCompletedProjectSnapshot: JSON.stringify(project),
    lastAutosavedProjectId: project.id,
    lastAutosavedProjectName: project.name,
  });
}
