/**
 * Pure schema-version migration chain and version validation (T125/T168).
 */

import { createDefaultMelodyTrackSettings } from "../melody/types";

export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

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

  if (version === 1) {
    return migrateV1ToV2(record);
  }

  // A shallow root copy keeps v2 decoding pure while preserving every supported
  // v2 field exactly as supplied. Future migrations can be appended above.
  return { ...record };
}

function migrateV1ToV2(record: Record<string, unknown>): Record<string, unknown> {
  const cloneSteps = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map((step) =>
          step && typeof step === "object" && !Array.isArray(step)
            ? { ...(step as Record<string, unknown>) }
            : step,
        )
      : value;

  const progression = record["progression"];
  const migratedProgression =
    progression && typeof progression === "object" && !Array.isArray(progression)
      ? {
          ...(progression as Record<string, unknown>),
          steps: cloneSteps((progression as Record<string, unknown>)["steps"]),
        }
      : progression;
  const temporaryBranch = record["temporaryBranch"];
  const migratedTemporaryBranch =
    temporaryBranch && typeof temporaryBranch === "object" && !Array.isArray(temporaryBranch)
      ? {
          ...(temporaryBranch as Record<string, unknown>),
          steps: cloneSteps((temporaryBranch as Record<string, unknown>)["steps"]),
        }
      : temporaryBranch;

  return {
    ...record,
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    melodyTrack: createDefaultMelodyTrackSettings(),
    ...(migratedProgression !== undefined ? { progression: migratedProgression } : {}),
    ...(migratedTemporaryBranch !== undefined
      ? { temporaryBranch: migratedTemporaryBranch }
      : {}),
  };
}
