/**
 * Pure schema-version migration chain and version validation (T125/T168).
 */

import { createDefaultMelodyTrackSettings, validateChordMelodyRecipe } from "../melody/types";
import { validateMelodyInstrumentId } from "../melody/instrumentCatalog";
import { createDefaultHarmonyTrackSettings } from "../harmony/track";

export const CURRENT_PROJECT_SCHEMA_VERSION = 5;

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
    return migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(record))));
  }

  if (version === 2) return migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(record)));

  if (version === 3) return migrateV4ToV5(migrateV3ToV4(record));

  if (version === 4) return migrateV4ToV5(record);

  // A shallow root copy keeps current decoding pure while preserving every supported
  // current field exactly as supplied. Future migrations can be appended above.
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
    schemaVersion: 2,
    melodyTrack: createDefaultMelodyTrackSettings(),
    ...(migratedProgression !== undefined ? { progression: migratedProgression } : {}),
    ...(migratedTemporaryBranch !== undefined ? { temporaryBranch: migratedTemporaryBranch } : {}),
  };
}

function migrateV2ToV3(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    schemaVersion: 3,
    harmonyTrack: createDefaultHarmonyTrackSettings(),
  };
}

function migrateV3ToV4(record: Record<string, unknown>): Record<string, unknown> {
  const migrateSteps = (value: unknown, path: string): unknown => {
    if (!Array.isArray(value)) return value;
    return value.map((step, index) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return step;
      const stepRecord = step as Record<string, unknown>;
      if (!("melody" in stepRecord)) return { ...stepRecord };

      try {
        const recipe = validateChordMelodyRecipe(stepRecord["melody"]);
        return {
          ...stepRecord,
          melody: {
            pitchMotion: recipe.pitchMotion,
            rhythm: recipe.rhythm,
            connection: recipe.connection,
            grid: recipe.grid,
            octaveOffset: recipe.octaveOffset,
          },
        };
      } catch (error) {
        throw new InvalidProjectDataError(
          `Invalid Melody recipe at ${path}[${index}].melody: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  };

  const progression = record["progression"];
  const migratedProgression =
    progression && typeof progression === "object" && !Array.isArray(progression)
      ? {
          ...(progression as Record<string, unknown>),
          steps: migrateSteps(
            (progression as Record<string, unknown>)["steps"],
            "progression.steps",
          ),
        }
      : progression;

  const temporaryBranch = record["temporaryBranch"];
  const migratedTemporaryBranch =
    temporaryBranch && typeof temporaryBranch === "object" && !Array.isArray(temporaryBranch)
      ? {
          ...(temporaryBranch as Record<string, unknown>),
          steps: migrateSteps(
            (temporaryBranch as Record<string, unknown>)["steps"],
            "temporaryBranch.steps",
          ),
        }
      : temporaryBranch;

  return {
    ...record,
    schemaVersion: 4,
    ...(migratedProgression !== undefined ? { progression: migratedProgression } : {}),
    ...(migratedTemporaryBranch !== undefined ? { temporaryBranch: migratedTemporaryBranch } : {}),
  };
}

function migrateV4ToV5(record: Record<string, unknown>): Record<string, unknown> {
  const migrateSteps = (value: unknown, path: string): unknown => {
    if (!Array.isArray(value)) return value;
    return value.map((step, index) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) return step;
      const stepRecord = { ...(step as Record<string, unknown>) };
      if (stepRecord["kind"] === "chord" && stepRecord["melodyInstrumentOverride"] !== undefined) {
        try {
          stepRecord["melodyInstrumentOverride"] = validateMelodyInstrumentId(
            stepRecord["melodyInstrumentOverride"],
          );
        } catch (error) {
          throw new InvalidProjectDataError(
            `Invalid Melody instrument override at ${path}[${index}].melodyInstrumentOverride: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return stepRecord;
    });
  };

  const migrateContainer = (value: unknown, path: string): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const container = value as Record<string, unknown>;
    return {
      ...container,
      steps: migrateSteps(container["steps"], `${path}.steps`),
    };
  };

  return {
    ...record,
    schemaVersion: 5,
    progression: migrateContainer(record["progression"], "progression"),
    ...(record["temporaryBranch"] !== undefined
      ? { temporaryBranch: migrateContainer(record["temporaryBranch"], "temporaryBranch") }
      : {}),
  };
}
