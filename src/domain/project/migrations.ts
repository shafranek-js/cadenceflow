/**
 * Pure schema-version migration chain and version validation (T125/T168).
 */

import { createDefaultMelodyTrackSettings, validateChordMelodyRecipe } from "../melody/types";
import { validateMelodyInstrumentId } from "../melody/instrumentCatalog";
import { createDefaultHarmonyTrackSettings } from "../harmony/track";
import {
  DARK_HARMONY_COLOR_FUNCTIONS,
  DARK_HARMONY_CORE_FUNCTIONS,
  DARK_HARMONY_NATURAL_VARIANTS,
} from "../harmony/modules/darkHarmony";
import { PROGRESSIONS_FUNCTIONS } from "../harmony/modules/progressions";
import { backfillPresentationDefaults } from "./presentationDefaults";

export const CURRENT_PROJECT_SCHEMA_VERSION = 11;

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
 * A field that a migration could not carry forward.
 *
 * Migrations salvage rather than abort: one unreadable melody recipe used to make an entire
 * legacy project unopenable, so the offending field is dropped and reported here instead. The
 * caller surfaces these to the user so nothing disappears silently.
 */
export interface MigrationDiagnostic {
  readonly path: string;
  readonly field: string;
  readonly reason: string;
}

export interface MigrationResult {
  readonly project: Record<string, unknown>;
  readonly diagnostics: readonly MigrationDiagnostic[];
}

/**
 * Collector for the duration of one `migrateProjectData` call.
 *
 * The migration functions keep their single-argument signatures; this scopes the diagnostics to
 * the call rather than threading a parameter through nine of them. It is safe because the chain
 * is synchronous and pure aside from this collector.
 */
let activeDiagnostics: MigrationDiagnostic[] | null = null;

function reportDroppedField(diagnostic: MigrationDiagnostic): void {
  activeDiagnostics?.push(diagnostic);
}

/**
 * Validates schema version and applies sequential schema migrations.
 *
 * Throws `UnsupportedProjectVersionError` if `schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION`.
 * Throws `InvalidProjectDataError` if the payload is not an object or `schemaVersion` is invalid.
 *
 * A field a migration cannot read is **dropped and reported**, not fatal: previously one bad
 * melody recipe made an otherwise valid legacy project unopenable. Use this overload when the
 * caller can show the user what was lost.
 */
export function migrateProjectData(data: unknown): Record<string, unknown>;
export function migrateProjectData(data: unknown, withDiagnostics: true): MigrationResult;
export function migrateProjectData(
  data: unknown,
  withDiagnostics?: true,
): Record<string, unknown> | MigrationResult {
  const project = runMigrationChain(data);
  return withDiagnostics === true
    ? { project, diagnostics: Object.freeze(lastDiagnostics) }
    : project;
}

let lastDiagnostics: MigrationDiagnostic[] = [];

function runMigrationChain(data: unknown): Record<string, unknown> {
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

  activeDiagnostics = [];
  try {
    const migrated = migrateV10ToV11(applyVersionChainThroughV10(record, version));
    lastDiagnostics = activeDiagnostics;
    return migrated;
  } finally {
    activeDiagnostics = null;
  }
}

function applyVersionChainThroughV10(
  record: Record<string, unknown>,
  version: number,
): Record<string, unknown> {
  if (version === 1) {
    return migrateV9ToV10(
      migrateV8ToV9(
        migrateV7ToV8(
          migrateV6ToV7(
            migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(record))))),
          ),
        ),
      ),
    );
  }

  if (version === 2)
    return migrateV9ToV10(
      migrateV8ToV9(
        migrateV7ToV8(
          migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(record))))),
        ),
      ),
    );

  if (version === 3)
    return migrateV9ToV10(
      migrateV8ToV9(
        migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(record))))),
      ),
    );

  if (version === 4)
    return migrateV9ToV10(
      migrateV8ToV9(migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(record))))),
    );

  if (version === 5)
    return migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(migrateV6ToV7(migrateV5ToV6(record)))));
  if (version === 6) return migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(migrateV6ToV7(record))));
  if (version === 7) return migrateV9ToV10(migrateV8ToV9(migrateV7ToV8(record)));
  if (version === 8) return migrateV9ToV10(migrateV8ToV9(record));
  if (version === 9) return migrateV9ToV10(record);

  // A shallow root copy keeps current decoding pure while preserving every supported
  // current field exactly as supplied. Future migrations can be appended above.
  return { ...record };
}

/**
 * Schema v11 tightens the current Chord Properties wire shape. Older valid files used legacy
 * harmonic-function categories and could omit the three arrays introduced by the canonical
 * variant model, so normalize those values at the version boundary while preserving every other
 * authored property. Current-v11 payloads are left untouched and remain subject to strict schema
 * validation.
 */
function migrateV10ToV11(record: Record<string, unknown>): Record<string, unknown> {
  if (record["schemaVersion"] !== 10) return { ...record, schemaVersion: 11 };

  const canonicalCategoryForLegacyIdentity = (
    identity: Record<string, unknown>,
  ): string | undefined => {
    const functionId = identity["functionId"];
    if (typeof functionId !== "string") return undefined;
    if (identity["moduleId"] === "progressions") {
      return PROGRESSIONS_FUNCTIONS.find((item) => item.id === functionId)?.category;
    }
    if (identity["moduleId"] === "dark-harmony") {
      const catalogCategory = [
        ...DARK_HARMONY_CORE_FUNCTIONS,
        ...DARK_HARMONY_NATURAL_VARIANTS,
        ...DARK_HARMONY_COLOR_FUNCTIONS,
      ].find((item) => item.id === functionId)?.category;
      if (catalogCategory) return catalogCategory;
      if (functionId.startsWith("vii°7/")) {
        const target = functionId.slice("vii°7/".length);
        return DARK_HARMONY_CORE_FUNCTIONS.some((item) => item.id === target)
          ? "secondary-diminished"
          : undefined;
      }
    }
    return undefined;
  };

  const migrateContainer = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const container = value as Record<string, unknown>;
    if (!Array.isArray(container["steps"])) return value;
    return {
      ...container,
      steps: container["steps"].map((rawStep) => {
        if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) return rawStep;
        const step = rawStep as Record<string, unknown>;
        if (step["kind"] !== "chord") return rawStep;

        let harmonicFunction = step["harmonicFunction"];
        if (
          harmonicFunction &&
          typeof harmonicFunction === "object" &&
          !Array.isArray(harmonicFunction)
        ) {
          const identity = harmonicFunction as Record<string, unknown>;
          const legacyCategory = identity["category"];
          if (
            legacyCategory === "tonic" ||
            legacyCategory === "subdominant" ||
            legacyCategory === "dominant"
          ) {
            const canonicalCategory = canonicalCategoryForLegacyIdentity(identity);
            if (canonicalCategory) {
              harmonicFunction = { ...identity, category: canonicalCategory };
            }
          }
        }

        const rawVariant = step["harmonicVariant"];
        const harmonicVariant =
          rawVariant === undefined
            ? { extensions: [], suspensions: [], alterations: [] }
            : rawVariant && typeof rawVariant === "object" && !Array.isArray(rawVariant)
              ? {
                  ...(rawVariant as Record<string, unknown>),
                  extensions:
                    (rawVariant as Record<string, unknown>)["extensions"] === undefined
                      ? []
                      : (rawVariant as Record<string, unknown>)["extensions"],
                  suspensions:
                    (rawVariant as Record<string, unknown>)["suspensions"] === undefined
                      ? []
                      : (rawVariant as Record<string, unknown>)["suspensions"],
                  alterations:
                    (rawVariant as Record<string, unknown>)["alterations"] === undefined
                      ? []
                      : (rawVariant as Record<string, unknown>)["alterations"],
                }
              : rawVariant;

        return {
          ...step,
          ...(harmonicFunction !== step["harmonicFunction"] ? { harmonicFunction } : {}),
          harmonicVariant,
        };
      }),
    };
  };

  return {
    ...record,
    schemaVersion: 11,
    independentBassEnabled:
      typeof record["independentBassEnabled"] === "boolean"
        ? record["independentBassEnabled"]
        : false,
    progression: migrateContainer(record["progression"]),
    ...(record["temporaryBranch"] !== undefined
      ? { temporaryBranch: migrateContainer(record["temporaryBranch"]) }
      : {}),
  };
}

function migrateV9ToV10(record: Record<string, unknown>): Record<string, unknown> {
  const migrateContainer = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const container = value as Record<string, unknown>;
    if (!Array.isArray(container.steps)) return value;
    return {
      ...container,
      steps: container.steps.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const step = raw as Record<string, unknown>;
        return { ...step, transpositionSemitones: 0 };
      }),
    };
  };
  return {
    ...record,
    schemaVersion: 10,
    progression: migrateContainer(record.progression),
    ...(record.temporaryBranch !== undefined
      ? { temporaryBranch: migrateContainer(record.temporaryBranch) }
      : {}),
  };
}

function migrateV8ToV9(record: Record<string, unknown>): Record<string, unknown> {
  const migrateContainer = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const container = value as Record<string, unknown>;
    if (!Array.isArray(container.steps)) return value;
    return {
      ...container,
      steps: container.steps.map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const step = raw as Record<string, unknown>;
        return { ...step };
      }),
    };
  };
  const progression = migrateContainer(record.progression) as Record<string, unknown> | undefined;
  const presentation =
    record.presentation && typeof record.presentation === "object"
      ? (record.presentation as Record<string, unknown>)
      : {};
  return {
    ...record,
    schemaVersion: 9,
    progression,
    ...(record.temporaryBranch !== undefined
      ? { temporaryBranch: migrateContainer(record.temporaryBranch) }
      : {}),
    // Backfill the presentation defaults that the project schema requires. Files written before
    // this version simply did not contain these keys (the decoder has always tolerated that), but
    // the schema requires them, so without this a legacy project is rejected at the validation
    // boundary. Values already present are preserved — this only fills gaps.
    //
    // `progressionView` and `measuresPerSystem` are deliberately excluded. Both have a legacy
    // derivation in the decoder (`decodeProgressionView` infers the view from the Steps' own
    // `cardView` values; `decodeMeasuresPerSystem` reads the old `measureLayoutColumns` alias), and
    // the decoder only consults those when the key is absent. Filling them in here would silently
    // discard the real legacy information and pin every migrated project to the current default.
    presentation: {
      ...backfillPresentationDefaults(),
      ...presentation,
    },
  };
}

function migrateV7ToV8(record: Record<string, unknown>): Record<string, unknown> {
  const progression = record.progression;
  const migratedProgression =
    progression && typeof progression === "object" && !Array.isArray(progression)
      ? { ...(progression as Record<string, unknown>), sections: [] }
      : progression;
  return { ...record, schemaVersion: 8, progression: migratedProgression };
}

function migrateV6ToV7(record: Record<string, unknown>): Record<string, unknown> {
  const migrateContainer = (value: unknown, path: string): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const container = value as Record<string, unknown>;
    return {
      ...container,
      ...(Array.isArray(container.steps)
        ? {
            steps: container.steps.map((step, index) => {
              if (!step || typeof step !== "object" || Array.isArray(step)) return step;
              const item = step as Record<string, unknown>;
              if (
                item.kind !== "chord" ||
                item.melody === undefined ||
                (item.melody &&
                  typeof item.melody === "object" &&
                  "mode" in (item.melody as object))
              )
                return { ...item };
              try {
                return {
                  ...item,
                  melody: { mode: "generated", recipe: validateChordMelodyRecipe(item.melody) },
                };
              } catch (error) {
                // Salvage: drop the unreadable recipe and keep the Step. Aborting here made one
                // corrupt melody render the whole legacy project unopenable.
                const { melody: _dropped, ...rest } = item;
                reportDroppedField({
                  path: `${path}.steps[${index}]`,
                  field: "melody",
                  reason: error instanceof Error ? error.message : String(error),
                });
                return rest;
              }
            }),
          }
        : {}),
    };
  };
  return {
    ...record,
    schemaVersion: 7,
    progression: migrateContainer(record.progression, "progression"),
    ...(record.temporaryBranch !== undefined
      ? { temporaryBranch: migrateContainer(record.temporaryBranch, "temporaryBranch") }
      : {}),
  };
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
        // Salvage: drop the unreadable recipe instead of failing the whole import.
        const { melody: _dropped, ...rest } = stepRecord;
        reportDroppedField({
          path: `${path}[${index}]`,
          field: "melody",
          reason: error instanceof Error ? error.message : String(error),
        });
        return rest;
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
          // Salvage: drop an unrecognized instrument id and fall back to track inheritance
          // rather than refusing to open the project.
          delete stepRecord["melodyInstrumentOverride"];
          reportDroppedField({
            path: `${path}[${index}]`,
            field: "melodyInstrumentOverride",
            reason: error instanceof Error ? error.message : String(error),
          });
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

function migrateV5ToV6(record: Record<string, unknown>): Record<string, unknown> {
  const harmonyTrack =
    record["harmonyTrack"] &&
    typeof record["harmonyTrack"] === "object" &&
    !Array.isArray(record["harmonyTrack"])
      ? (record["harmonyTrack"] as Record<string, unknown>)
      : {};
  const rawPresentation =
    record["presentation"] &&
    typeof record["presentation"] === "object" &&
    !Array.isArray(record["presentation"])
      ? (record["presentation"] as Record<string, unknown>)
      : {};
  const { suzukiColors, ...presentation } = rawPresentation;
  const noteColorMode =
    rawPresentation["noteColorMode"] === "standard" ||
    rawPresentation["noteColorMode"] === "suzuki" ||
    rawPresentation["noteColorMode"] === "harmonic-role"
      ? rawPresentation["noteColorMode"]
      : suzukiColors === true
        ? "suzuki"
        : "standard";

  return {
    ...record,
    schemaVersion: 6,
    harmonyTrack: {
      ...createDefaultHarmonyTrackSettings(),
      ...harmonyTrack,
    },
    presentation: {
      ...presentation,
      noteColorMode,
    },
  };
}
