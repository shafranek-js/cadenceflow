import type { Project } from "../domain/project/project";
import { type CadenceFlowDatabase, getActiveDb, type ProjectRecord } from "./db";
import {
  decodePortableProjectWithDiagnostics,
  encodePortableProject,
  type PortableProjectDecodeResult,
} from "./portableProject";

/**
 * Named project repository interface and implementation (T122).
 */

export interface ProjectMetadata {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: number;
}

export type OpenProjectTabsSource = "initial" | "user";

export interface OpenProjectTabsState {
  readonly ids: readonly string[];
  readonly source: OpenProjectTabsSource;
  readonly updatedAt: number;
}

export interface ProjectRepository {
  listProjects(): Promise<readonly ProjectMetadata[]>;
  loadProject(id: string): Promise<Project | null>;
  /** Loads the exact project snapshot together with any migration losses. */
  loadProjectWithDiagnostics?(id: string): Promise<PortableProjectDecodeResult | null>;
  /** Atomically deletes the active record, switches its pointer, and writes a fresh fallback if needed. */
  replaceActiveProject?(activeId: string, replacement: Project): Promise<void>;
  saveProject(project: Project): Promise<void>;
  /** Persists a newly imported project and its active pointer in one transaction. */
  saveNewActiveProject?(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getLastActiveProjectId(): Promise<string | null>;
  setLastActiveProjectId(id: string): Promise<void>;
  clearLastActiveProjectId(): Promise<void>;
  getOpenProjectTabsState?(): Promise<OpenProjectTabsState | null>;
  setOpenProjectTabsState?(state: OpenProjectTabsState): Promise<void>;
}

// v8 deliberately avoids adopting the incomplete snapshots written while the
// first localStorage/IDB implementations were being corrected.
const OPEN_PROJECT_TABS_METADATA_KEY = "openProjectTabs.v8";

function normalizeOpenProjectIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  return [...new Set(ids)];
}

export class DexieProjectRepository implements ProjectRepository {
  private readonly db: CadenceFlowDatabase;

  constructor(db?: CadenceFlowDatabase) {
    this.db = db ?? getActiveDb();
  }

  async listProjects(): Promise<readonly ProjectMetadata[]> {
    const records = await this.db.projects.toArray();
    return records.map((record) =>
      Object.freeze({
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        schemaVersion: record.schemaVersion,
      }),
    );
  }

  async loadProject(id: string): Promise<Project | null> {
    const result = await this.loadProjectWithDiagnostics(id);
    return result?.project ?? null;
  }

  async loadProjectWithDiagnostics(id: string): Promise<PortableProjectDecodeResult | null> {
    const record = await this.db.projects.get(id);
    if (!record) {
      return null;
    }
    const payloadStr =
      typeof record.payload === "string" ? record.payload : JSON.stringify(record.payload);
    return decodePortableProjectWithDiagnostics(payloadStr);
  }

  async saveProject(project: Project): Promise<void> {
    // 1. Validation before write: encode and validate against schema
    const payload = encodePortableProject(project);

    // 2. Transactional save with revision increment
    await this.db.transaction("rw", this.db.projects, async () => {
      const existing = await this.db.projects.get(project.id);
      const revision = (existing?.revision ?? 0) + 1;
      const record: ProjectRecord = {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        schemaVersion: project.schemaVersion,
        revision,
        payload,
      };
      await this.db.projects.put(record);
    });
  }

  async deleteProject(id: string): Promise<void> {
    // Atomic delete: removes project record and clears pointer if it was active
    await this.db.transaction("rw", [this.db.projects, this.db.metadata], async () => {
      await this.db.projects.delete(id);
      const activeMeta = await this.db.metadata.get("lastActiveProjectId");
      if (activeMeta && activeMeta.value === id) {
        await this.db.metadata.delete("lastActiveProjectId");
      }
    });
  }
  async saveNewActiveProject(project: Project): Promise<void> {
    const payload = encodePortableProject(project);
    await this.db.transaction("rw", [this.db.projects, this.db.metadata], async () => {
      if (await this.db.projects.get(project.id))
        throw new Error("An imported project must have a new identity.");
      await this.db.projects.add({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        schemaVersion: project.schemaVersion,
        revision: 1,
        payload,
      });
      await this.db.metadata.put({ key: "lastActiveProjectId", value: project.id });
    });
  }

  async replaceActiveProject(activeId: string, replacement: Project): Promise<void> {
    const payload = encodePortableProject(replacement);
    await this.db.transaction("rw", [this.db.projects, this.db.metadata], async () => {
      const existing = await this.db.projects.get(replacement.id);
      if (!existing) {
        const record: ProjectRecord = {
          id: replacement.id,
          name: replacement.name,
          createdAt: replacement.createdAt,
          updatedAt: replacement.updatedAt,
          schemaVersion: replacement.schemaVersion,
          revision: 1,
          payload,
        };
        await this.db.projects.put(record);
      }
      await this.db.projects.delete(activeId);
      await this.db.metadata.put({ key: "lastActiveProjectId", value: replacement.id });
    });
  }

  async getLastActiveProjectId(): Promise<string | null> {
    const meta = await this.db.metadata.get("lastActiveProjectId");
    return meta && typeof meta.value === "string" ? meta.value : null;
  }

  async setLastActiveProjectId(id: string): Promise<void> {
    await this.db.metadata.put({ key: "lastActiveProjectId", value: id });
  }

  async clearLastActiveProjectId(): Promise<void> {
    await this.db.metadata.delete("lastActiveProjectId");
  }

  async getOpenProjectTabsState(): Promise<OpenProjectTabsState | null> {
    const meta = await this.db.metadata.get(OPEN_PROJECT_TABS_METADATA_KEY);
    if (!meta || typeof meta.value !== "object" || meta.value === null) return null;

    const saved = meta.value as { ids?: unknown; source?: unknown; updatedAt?: unknown };
    const ids = normalizeOpenProjectIds(saved.ids);
    if (
      !ids ||
      (saved.source !== "initial" && saved.source !== "user") ||
      typeof saved.updatedAt !== "number" ||
      !Number.isFinite(saved.updatedAt)
    ) {
      return null;
    }
    return { ids, source: saved.source, updatedAt: saved.updatedAt };
  }

  async setOpenProjectTabsState(state: OpenProjectTabsState): Promise<void> {
    await this.db.metadata.put({
      key: OPEN_PROJECT_TABS_METADATA_KEY,
      value: {
        ids: normalizeOpenProjectIds(state.ids) ?? [],
        source: state.source,
        updatedAt: state.updatedAt,
      },
    });
  }
}

export function createProjectRepository(db?: unknown): ProjectRepository {
  return new DexieProjectRepository(db as CadenceFlowDatabase | undefined);
}
