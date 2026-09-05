/**
 * Pure schema-version migration chain and version validation (T125).
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

/**
 * Validates schema version and applies sequential schema migrations.
 * Throws UnsupportedProjectVersionError if schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION.
 * Throws InvalidProjectDataError if data is not an object or schemaVersion is invalid.
 */
export function migrateProjectData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new InvalidProjectDataError("Project payload must be a non-null object");
  }

  const record = data as Record<string, unknown>;
  const version = record["schemaVersion"];

  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new InvalidProjectDataError(`Invalid or missing schemaVersion: ${String(version)}`);
  }

  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectVersionError(version, CURRENT_PROJECT_SCHEMA_VERSION);
  }

  // Schema version 1 is current; no migrations needed yet.
  // Sequential migration chains (v1 -> v2, v2 -> v3) will be appended here.
  return record;
}
