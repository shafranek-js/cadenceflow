import type { Project } from "../domain/project/project";
import { type CadenceFlowDatabase, getActiveDb, type ProjectRecord } from "./db";
import { decodePortableProject, encodePortableProject } from "./portableProject";

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

export interface ProjectRepository {
  listProjects(): Promise<readonly ProjectMetadata[]>;
  loadProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getLastActiveProjectId(): Promise<string | null>;
  setLastActiveProjectId(id: string): Promise<void>;
  clearLastActiveProjectId(): Promise<void>;
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
    const record = await this.db.projects.get(id);
    if (!record) {
      return null;
    }
    const payloadStr =
      typeof record.payload === "string" ? record.payload : JSON.stringify(record.payload);
    return decodePortableProject(payloadStr);
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
}

export function createProjectRepository(db?: unknown): ProjectRepository {
  return new DexieProjectRepository(db as CadenceFlowDatabase | undefined);
}
