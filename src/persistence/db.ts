import { Dexie, type EntityTable } from "dexie";

/**
 * Dexie database schema definitions and types (T121).
 */

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly payload: string;
}

export interface MetadataRecord {
  readonly key: string;
  readonly value: unknown;
}

export interface AutosaveRecord {
  readonly id: string;
  readonly projectId: string;
  readonly updatedAt: string;
  readonly payload: unknown;
}

export interface CadenceFlowDatabase extends Dexie {
  projects: EntityTable<ProjectRecord, "id">;
  metadata: EntityTable<MetadataRecord, "key">;
  autosaves: EntityTable<AutosaveRecord, "id">;
}

export class CadenceFlowDexie extends Dexie implements CadenceFlowDatabase {
  projects!: EntityTable<ProjectRecord, "id">;
  metadata!: EntityTable<MetadataRecord, "key">;
  autosaves!: EntityTable<AutosaveRecord, "id">;

  constructor(dbName = "CadenceFlowDB") {
    super(dbName);
    this.version(1).stores({
      projects: "id, name, updatedAt, schemaVersion, revision",
      metadata: "key",
      autosaves: "id, projectId, updatedAt",
    });
  }
}

let activeDb: CadenceFlowDatabase | null = null;

/**
 * Creates or retrieves a CadenceFlow Dexie database instance.
 */
export function createCadenceFlowDb(dbName = "CadenceFlowDB"): CadenceFlowDatabase {
  const db = new CadenceFlowDexie(dbName);
  activeDb = db;
  db.on("close", () => {
    if (activeDb === db) {
      activeDb = null;
    }
  });
  return db;
}

/**
 * Returns the currently active CadenceFlow database instance, creating a default one if none is active.
 */
export function getActiveDb(): CadenceFlowDatabase {
  if (!activeDb) {
    activeDb = createCadenceFlowDb();
  }
  return activeDb;
}
