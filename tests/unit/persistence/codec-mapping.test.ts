import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  decodeDurationDisplayHint,
  encodeDurationDisplayHint,
} from "../../../src/persistence/portableProject";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  InvalidProjectDataError,
  migrateProjectData,
  UnsupportedProjectVersionError,
} from "../../../src/domain/project/migrations";
import { rational } from "../../../src/domain/timing/rational";
import { createCadenceFlowDb } from "../../../src/persistence/db";
import { createProjectRepository } from "../../../src/persistence/projectRepository";
import { createDefaultProject } from "../../../src/domain/project/factory";

describe("T124 & T125 — Codec Mapping and Persistence Infrastructure Tests", () => {
  describe("DurationDisplayHint Deterministic Mapping", () => {
    it("maps undefined bidirectionally", () => {
      expect(encodeDurationDisplayHint(undefined)).toBeUndefined();
      expect(decodeDurationDisplayHint(undefined)).toBeUndefined();
    });

    it("maps beats hint without label bidirectionally", () => {
      const hint = { kind: "beats" as const };
      const encoded = encodeDurationDisplayHint(hint);
      expect(encoded).toBe("beats");
      expect(decodeDurationDisplayHint(encoded)).toEqual(hint);
    });

    it("maps beats hint with custom label bidirectionally", () => {
      const hint = { kind: "beats" as const, label: "dotted-quarter-feel" };
      const encoded = encodeDurationDisplayHint(hint);
      expect(encoded).toBe("beats:dotted-quarter-feel");
      expect(decodeDurationDisplayHint(encoded)).toEqual(hint);
    });

    it("maps bars hint bidirectionally", () => {
      const hint = { kind: "bars" as const, bars: 4 };
      const encoded = encodeDurationDisplayHint(hint);
      expect(encoded).toBe("bars:4");
      expect(decodeDurationDisplayHint(encoded)).toEqual(hint);
    });

    it("maps dotted hint with Rational baseBeats bidirectionally", () => {
      const hint = { kind: "dotted" as const, baseBeats: rational(3, 4) };
      const encoded = encodeDurationDisplayHint(hint);
      expect(encoded).toBe("dotted:3/4");
      expect(decodeDurationDisplayHint(encoded)).toEqual(hint);
    });

    it("maps triplet hint with Rational baseBeats bidirectionally", () => {
      const hint = { kind: "triplet" as const, baseBeats: rational(1, 3) };
      const encoded = encodeDurationDisplayHint(hint);
      expect(encoded).toBe("triplet:1/3");
      expect(decodeDurationDisplayHint(encoded)).toEqual(hint);
    });

    it("gracefully decodes unknown format strings as beats label fallback", () => {
      const decoded = decodeDurationDisplayHint("legacy-label");
      expect(decoded).toEqual({ kind: "beats", label: "legacy-label" });
    });
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

  describe("Metadata Pointer & Atomic Delete Lifecycle", () => {
    it("manages lastActiveProjectId pointer correctly across project deletion", async () => {
      const db = createCadenceFlowDb("MetadataTestDB");
      const repo = createProjectRepository(db);

      const p1 = createDefaultProject("p1-id", "Project 1");
      const p2 = createDefaultProject("p2-id", "Project 2");

      await repo.saveProject(p1);
      await repo.saveProject(p2);

      // Initially no active project pointer
      expect(await repo.getLastActiveProjectId()).toBeNull();

      // Set active pointer to p1
      await repo.setLastActiveProjectId("p1-id");
      expect(await repo.getLastActiveProjectId()).toBe("p1-id");

      // Deleting p2 does not clear active pointer p1
      await repo.deleteProject("p2-id");
      expect(await repo.getLastActiveProjectId()).toBe("p1-id");

      // Deleting p1 atomically clears active pointer
      await repo.deleteProject("p1-id");
      expect(await repo.getLastActiveProjectId()).toBeNull();

      // Explicit clear works
      await repo.setLastActiveProjectId("some-id");
      await repo.clearLastActiveProjectId();
      expect(await repo.getLastActiveProjectId()).toBeNull();

      await db.delete();
    });
  });
});
