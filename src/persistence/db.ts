import { Dexie, type EntityTable } from "dexie";

/**
 * Dexie database schema definitions and types (T121 stub).
 */

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly payload: unknown;
}

export interface AutosaveRecord {
  readonly id: string; // e.g. "latest" or project ID
  readonly projectId: string;
  readonly updatedAt: string;
  readonly payload: unknown;
}

export interface CadenceFlowDatabase extends Dexie {
  projects: EntityTable<ProjectRecord, "id">;
  autosaves: EntityTable<AutosaveRecord, "id">;
}

export function createCadenceFlowDb(_dbName = "CadenceFlowDB"): CadenceFlowDatabase {
  throw new Error("Not implemented: T121");
}
