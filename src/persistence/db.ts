import { Dexie, type EntityTable } from "dexie";

/**
 * Dexie database schema definitions and types (T121).
 * Accepted v1 architecture:
 * - One canonical `projects` store containing latest valid Project snapshot.
 * - One small `metadata` store containing recovery and session UI pointers.
 */

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly payload: string; // Canonical portable semantic .cadenceflow JSON payload
}

export interface MetadataRecord {
  readonly key: string;
  readonly value: unknown;
}

export interface CadenceFlowDatabase extends Dexie {
  projects: EntityTable<ProjectRecord, "id">;
  metadata: EntityTable<MetadataRecord, "key">;
}

export class CadenceFlowDexie extends Dexie implements CadenceFlowDatabase {
  projects!: EntityTable<ProjectRecord, "id">;
  metadata!: EntityTable<MetadataRecord, "key">;

  constructor(dbName = "CadenceFlowDB") {
    super(dbName);
    this.version(1).stores({
      projects: "id, name, updatedAt, schemaVersion, revision",
      metadata: "key",
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
