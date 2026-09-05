/**
 * Pure schema-version migration chain and version validation (T125 stub).
 */

export const CURRENT_PROJECT_SCHEMA_VERSION = 1;

export class UnsupportedProjectVersionError extends Error {
  constructor(
    public readonly version: number,
    public readonly supportedVersion: number = CURRENT_PROJECT_SCHEMA_VERSION,
  ) {
    super(
      `Unsupported project schema version: ${version} (current supported version is ${supportedVersion})`,
    );
    this.name = "UnsupportedProjectVersionError";
  }
}

export class InvalidProjectDataError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "InvalidProjectDataError";
  }
}

export function migrateProjectData(_data: unknown): unknown {
  throw new Error("Not implemented: T125");
}
