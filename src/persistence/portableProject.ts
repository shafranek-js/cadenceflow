import type {
  MatrixCardTemplateState,
  ModuleTemplateState,
  PresentationState,
  Project,
} from "../domain/project/project";
import type { ProjectDefaults, StepCreationOverrides } from "../domain/project/defaults";
import { DEFAULT_PIANO_PERFORMANCE } from "../domain/project/factory";
import type { DurationDisplayHint, MusicalDuration } from "../domain/timing/duration";
import { musicalDuration } from "../domain/timing/duration";
import { rational, type Rational } from "../domain/timing/rational";
import type {
  CardViewId,
  ChordStep,
  ProgressionStep,
  RestStep,
  StepPerformance,
} from "../domain/progression/step";
import { snapshotStepPerformance } from "../domain/progression/step";
import type { ExactPitch, PitchClassIdentity } from "../domain/harmony/pitch";
import type { HarmonicVariant } from "../domain/harmony/chord";
import type { HarmonicFunctionIdentity, HarmonicModuleId } from "../domain/harmony/functions";
import type { CompositionIntent, TemporaryBranch } from "../domain/progression/branch";
import {
  snapshotChordMelodyRecipe,
  snapshotMelodyTrackSettings,
  validateChordMelodyRecipe,
  validateMelodyTrackSettings,
  type ChordMelodyRecipe,
  type MelodyTrackSettings,
} from "../domain/melody/types";
import {
  snapshotHarmonyTrackSettings,
  validateHarmonyTrackSettings,
  type HarmonyTrackSettings,
} from "../domain/harmony/track";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  InvalidProjectDataError,
  migrateProjectData,
  UnsupportedProjectVersionError,
} from "../domain/project/migrations";
import projectSchema from "../../specs/001-cadenceflow-core-studio/contracts/cadenceflow-project.schema.json";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/**
 * Custom error thrown when a portable .cadenceflow file fails schema or domain validation.
 */
export class InvalidPortableProjectError extends Error {
  constructor(
    message: string,
    public readonly errors?: readonly string[],
  ) {
    super(message);
    this.name = "InvalidPortableProjectError";
  }
}

/**
 * Derives a filesystem-safe presentation filename for a portable project.
 * This never changes the user-visible Project.name stored in the semantic model.
 */
export function sanitizePortableProjectFilename(name: string): string {
  const withoutExtension = name.replace(/\.cadenceflow$/i, "");
  const sanitized = [...withoutExtension]
    .map((character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character,
    )
    .join("")
    .replace(/[. ]+$/g, "")
    .trim();
  const base = sanitized || "Untitled Project";
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  const safeBase = reserved.test(base) ? `Project-${base}` : base;
  return `${safeBase}.cadenceflow`;
}

/**
 * Pure deterministic encoder for DurationDisplayHint into strict schema wire string.
 */
export function encodeDurationDisplayHint(hint?: DurationDisplayHint): string | undefined {
  if (!hint) return undefined;
  switch (hint.kind) {
    case "bars":
      if (!Number.isInteger(hint.bars) || hint.bars < 1) {
        throw new InvalidPortableProjectError(
          `Invalid DurationDisplayHint bars: must be a positive integer, received ${hint.bars}`,
        );
      }
      return `bars:${hint.bars}`;
    case "beats":
      return hint.label !== undefined ? `beats:${hint.label}` : "beats";
    case "dotted":
      if (
        !Number.isInteger(hint.baseBeats.numerator) ||
        hint.baseBeats.numerator < 1 ||
        !Number.isInteger(hint.baseBeats.denominator) ||
        hint.baseBeats.denominator < 1
      ) {
        throw new InvalidPortableProjectError(
          `Invalid DurationDisplayHint dotted baseBeats: must be positive integers, received ${hint.baseBeats.numerator}/${hint.baseBeats.denominator}`,
        );
      }
      return `dotted:${hint.baseBeats.numerator}/${hint.baseBeats.denominator}`;
    case "triplet":
      if (
        !Number.isInteger(hint.baseBeats.numerator) ||
        hint.baseBeats.numerator < 1 ||
        !Number.isInteger(hint.baseBeats.denominator) ||
        hint.baseBeats.denominator < 1
      ) {
        throw new InvalidPortableProjectError(
          `Invalid DurationDisplayHint triplet baseBeats: must be positive integers, received ${hint.baseBeats.numerator}/${hint.baseBeats.denominator}`,
        );
      }
      return `triplet:${hint.baseBeats.numerator}/${hint.baseBeats.denominator}`;
  }
}

/**
 * Pure deterministic decoder for DurationDisplayHint from strict schema wire string.
 * Strictly enforces v1 grammar:
 * - "beats"
 * - "beats:<label>"
 * - "bars:<positive-integer>"
 * - "dotted:<positive-integer>/<positive-integer>"
 * - "triplet:<positive-integer>/<positive-integer>"
 *
 * Any unknown, malformed, or legacy format throws InvalidPortableProjectError.
 */
export function decodeDurationDisplayHint(raw?: string): DurationDisplayHint | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new InvalidPortableProjectError(
      `Invalid DurationDisplayHint wire value: expected non-empty string, received ${String(raw)}`,
    );
  }

  if (raw === "beats") {
    return { kind: "beats" };
  }

  if (raw.startsWith("beats:")) {
    const label = raw.slice(6);
    return { kind: "beats", label };
  }

  const barsMatch = /^bars:([1-9]\d*)$/.exec(raw);
  if (barsMatch && barsMatch[1]) {
    return { kind: "bars", bars: Number(barsMatch[1]) };
  }

  const dottedMatch = /^dotted:([1-9]\d*)\/([1-9]\d*)$/.exec(raw);
  if (dottedMatch && dottedMatch[1] && dottedMatch[2]) {
    return {
      kind: "dotted",
      baseBeats: rational(Number(dottedMatch[1]), Number(dottedMatch[2])),
    };
  }

  const tripletMatch = /^triplet:([1-9]\d*)\/([1-9]\d*)$/.exec(raw);
  if (tripletMatch && tripletMatch[1] && tripletMatch[2]) {
    return {
      kind: "triplet",
      baseBeats: rational(Number(tripletMatch[1]), Number(tripletMatch[2])),
    };
  }

  throw new InvalidPortableProjectError(
    `Invalid or unrecognized DurationDisplayHint wire string: "${raw}"`,
  );
}

// Wire duration representation matching cadenceflow-project.schema.json
interface WireDuration {
  readonly beats: Rational;
  readonly displayHint?: string;
}

function encodeDuration(d: MusicalDuration): WireDuration {
  const wire: { beats: Rational; displayHint?: string } = {
    beats: {
      numerator: d.beats.numerator,
      denominator: d.beats.denominator,
    },
  };
  const hintStr = encodeDurationDisplayHint(d.displayHint);
  if (hintStr !== undefined) {
    wire.displayHint = hintStr;
  }
  return wire;
}

function decodeDuration(wire: WireDuration): MusicalDuration {
  const hint = decodeDurationDisplayHint(wire.displayHint);
  return musicalDuration(rational(wire.beats.numerator, wire.beats.denominator), hint);
}

function encodeMelodyRecipe(recipe: ChordMelodyRecipe): Record<string, unknown> {
  const snapshot = snapshotChordMelodyRecipe(recipe);
  return {
    pattern: snapshot.pattern,
    grid: snapshot.grid,
    octaveOffset: snapshot.octaveOffset,
  };
}

function decodeMelodyRecipe(raw: unknown): ChordMelodyRecipe {
  return validateChordMelodyRecipe(raw);
}

function encodeMelodyTrackSettings(settings: MelodyTrackSettings): Record<string, unknown> {
  const snapshot = snapshotMelodyTrackSettings(settings);
  return {
    instrument: snapshot.instrument,
    muted: snapshot.muted,
    solo: snapshot.solo,
    volume: snapshot.volume,
  };
}

function decodeMelodyTrackSettings(raw: unknown): MelodyTrackSettings {
  return validateMelodyTrackSettings(raw);
}

function encodeHarmonyTrackSettings(settings: HarmonyTrackSettings): Record<string, unknown> {
  const snapshot = snapshotHarmonyTrackSettings(settings);
  return {
    instrument: snapshot.instrument,
    muted: snapshot.muted,
    solo: snapshot.solo,
    volume: snapshot.volume,
  };
}

function decodeHarmonyTrackSettings(raw: unknown): HarmonyTrackSettings {
  return validateHarmonyTrackSettings(raw);
}

// Wire step representations
function encodeStep(step: ProgressionStep): Record<string, unknown> {
  if (step.kind === "rest") {
    return {
      id: step.id,
      kind: "rest",
      duration: encodeDuration(step.duration),
    };
  }
  return {
    id: step.id,
    kind: "chord",
    harmonicFunction: step.harmonicFunction,
    harmonicVariant: step.harmonicVariant,
    duration: encodeDuration(step.duration),
    performance: step.performance,
    cardView: step.cardView,
    ...(step.melody !== undefined ? { melody: encodeMelodyRecipe(step.melody) } : {}),
  };
}

function decodeStep(raw: Record<string, unknown>): ProgressionStep {
  const duration = decodeDuration(raw["duration"] as WireDuration);
  if (raw["kind"] === "rest") {
    const rest: RestStep = Object.freeze({
      id: String(raw["id"]),
      kind: "rest",
      duration,
    });
    return rest;
  }
  const chord: ChordStep = Object.freeze({
    id: String(raw["id"]),
    kind: "chord",
    harmonicFunction: raw["harmonicFunction"] as HarmonicFunctionIdentity,
    harmonicVariant: raw["harmonicVariant"] as HarmonicVariant,
    duration,
    performance: raw["performance"] as StepPerformance,
    cardView: (raw["cardView"] as CardViewId | undefined) ?? "harmonic",
    ...(raw["melody"] !== undefined ? { melody: decodeMelodyRecipe(raw["melody"]) } : {}),
  });
  return chord;
}

// Setup JSON Schema validator (Ajv 2020)
const ajv = new Ajv2020({ allErrors: true, strict: false });
const applyFormats =
  typeof addFormats === "function"
    ? addFormats
    : (addFormats as { default?: (a: unknown) => void }).default;
if (typeof applyFormats === "function") {
  applyFormats(ajv);
}
const validateProjectSchema = ajv.compile(projectSchema);

/**
 * Encodes a Project into a portable, schema-compliant .cadenceflow JSON string.
 * Strictly excludes session Undo/Redo history and audio/transport playback runtime state.
 */
export function encodePortableProject(project: Project): string {
  // Encode steps in progression
  const steps = project.progression.steps.map(encodeStep);

  // Encode progression object
  const progression: Record<string, unknown> = {
    steps,
  };
  if (project.progression.selectedStepId !== undefined) {
    progression["selectedStepId"] = project.progression.selectedStepId;
  }
  if (project.progression.loopRegion !== undefined) {
    progression["loopRegion"] = project.progression.loopRegion;
  }

  // Encode temporary branch if present
  let temporaryBranch: Record<string, unknown> | null = null;
  if (project.temporaryBranch) {
    temporaryBranch = {
      id: project.temporaryBranch.id,
      originStepId: project.temporaryBranch.originStepId,
      originAtEnd: project.temporaryBranch.originAtEnd,
      ...(project.temporaryBranch.rejoinStepId !== undefined
        ? { rejoinStepId: project.temporaryBranch.rejoinStepId }
        : {}),
      compositionIntent: project.temporaryBranch.compositionIntent,
      steps: project.temporaryBranch.steps.map(encodeStep),
    };
  }

  // Encode custom presets
  const customPresets = project.customPresets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    source: preset.source,
    ...(preset.description !== undefined ? { description: preset.description } : {}),
    steps: preset.steps.map((st) => ({
      harmonicFunction: st.harmonicFunction,
      duration: encodeDuration(st.duration),
    })),
  }));

  // Encode defaults (preserving duration displayHint bridge)
  const defaults: Record<string, unknown> = {};
  if (project.defaults.piano) {
    defaults["piano"] = {
      ...project.defaults.piano,
      duration: encodeDuration(project.defaults.piano.duration),
    };
  }

  // Encode moduleTemplateStates (preserving duration displayHint bridge on overrides)
  const moduleTemplateStates: Record<string, unknown> = {};
  for (const [modId, modState] of Object.entries(project.moduleTemplateStates)) {
    const cards: Record<string, unknown> = {};
    for (const [cardKey, card] of Object.entries(modState.cards)) {
      const explicitOverrides: Record<string, unknown> = {
        ...card.explicitOverrides,
      };
      if (card.explicitOverrides.duration) {
        explicitOverrides["duration"] = encodeDuration(card.explicitOverrides.duration);
      }
      cards[cardKey] = {
        ...card,
        explicitOverrides,
      };
    }
    moduleTemplateStates[modId] = { cards };
  }

  // Construct canonical wire payload in fixed order matching schema
  const wireDoc: Record<string, unknown> = {
    schemaVersion: project.schemaVersion,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    activeModule: project.activeModule,
    tonic: { semitone: project.tonic },
    globalTiming: {
      tempoBpm: project.globalTiming.tempoBpm,
      meter: {
        numerator: project.globalTiming.meter.numerator,
        denominator: project.globalTiming.meter.denominator,
        grouping: [...project.globalTiming.meter.grouping],
      },
    },
    groove: {
      feel: project.groove.feel,
      swingAmount: project.groove.swingAmount,
    },
    presentation: {
      expertiseMode: project.presentation.expertiseMode,
      theme: project.presentation.theme,
      globalMatrixCardView: project.presentation.globalMatrixCardView,
      showBassInStaff: project.presentation.showBassInStaff,
    },
    harmonyTrack: encodeHarmonyTrackSettings(project.harmonyTrack),
    melodyTrack: encodeMelodyTrackSettings(project.melodyTrack),
    defaults,
    moduleTemplateStates,
    progression,
    ...(temporaryBranch !== null ? { temporaryBranch } : {}),
    customPresets,
  };

  const valid = validateProjectSchema(wireDoc);
  if (!valid) {
    const errorMessages = (validateProjectSchema.errors || []).map(
      (e) => `${e.instancePath || "/"} ${e.message}`,
    );
    throw new InvalidPortableProjectError(
      `Schema validation failed on encode: ${errorMessages.join("; ")}`,
      errorMessages,
    );
  }

  return JSON.stringify(wireDoc, null, 2);
}

/**
 * Decodes a portable .cadenceflow JSON string into a validated Project.
 * Pipeline:
 * 1. JSON.parse
 * 2. Plain-object / envelope check
 * 3. Read schemaVersion (validate integer >= 1)
 * 4. Future-version check
 * 5. Migration chain (migrateProjectData)
 * 6. JSON Schema validation
 * 7. Domain invariant validation & decoding
 */
export function decodePortableProject(jsonString: string): Project {
  // 1. JSON.parse
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (err) {
    throw new InvalidPortableProjectError("Malformed JSON syntax", [
      err instanceof Error ? err.message : String(err),
    ]);
  }

  // 2. Plain-object / envelope check
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidPortableProjectError("Project JSON payload must be an object");
  }

  const rawDoc = raw as Record<string, unknown>;

  // 3 & 4. Read schemaVersion and future-version check
  const version = rawDoc["schemaVersion"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new InvalidPortableProjectError(`Invalid or missing schemaVersion: ${String(version)}`);
  }
  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectVersionError(version, CURRENT_PROJECT_SCHEMA_VERSION);
  }

  // 5. Migration chain
  let migrated: Record<string, unknown>;
  try {
    migrated = migrateProjectData(rawDoc);
  } catch (err) {
    if (err instanceof UnsupportedProjectVersionError) {
      throw err;
    }
    if (err instanceof InvalidProjectDataError) {
      throw new InvalidPortableProjectError(err.message, [err.message]);
    }
    throw err;
  }

  // 6. JSON Schema validation
  const valid = validateProjectSchema(migrated);
  if (!valid) {
    const errorMessages = (validateProjectSchema.errors || []).map(
      (e) => `${e.instancePath || "/"} ${e.message}`,
    );
    throw new InvalidPortableProjectError(
      `Schema validation failed: ${errorMessages.join("; ")}`,
      errorMessages,
    );
  }

  // 7. Domain invariant validation & decoding
  // Validate tonic
  const tonicRaw = migrated["tonic"] as { semitone: number };
  const tonic = tonicRaw.semitone as PitchClassIdentity;

  // Validate progression steps
  const progressionRaw = migrated["progression"] as {
    steps: Record<string, unknown>[];
    selectedStepId?: string | null;
    loopRegion?: { startStepId: string; endStepId: string } | null;
  };
  const steps = progressionRaw.steps.map(decodeStep);

  // Validate temporary branch if present
  let temporaryBranch: TemporaryBranch | undefined = undefined;
  if (migrated["temporaryBranch"] && typeof migrated["temporaryBranch"] === "object") {
    const tbRaw = migrated["temporaryBranch"] as Record<string, unknown>;
    temporaryBranch = Object.freeze({
      id: String(tbRaw["id"]),
      originStepId: String(tbRaw["originStepId"]),
      originAtEnd: Boolean(tbRaw["originAtEnd"]),
      ...(tbRaw["rejoinStepId"] ? { rejoinStepId: String(tbRaw["rejoinStepId"]) } : {}),
      compositionIntent: (tbRaw["compositionIntent"] as CompositionIntent | undefined) ?? "neutral",
      steps: Object.freeze((tbRaw["steps"] as Record<string, unknown>[]).map(decodeStep)),
    });
  }

  // Validate custom presets
  const customPresetsRaw = (migrated["customPresets"] as Record<string, unknown>[]) || [];
  const customPresets = customPresetsRaw.map((p) =>
    Object.freeze({
      id: String(p["id"]),
      name: String(p["name"]),
      source: "custom" as const,
      ...(p["description"] ? { description: String(p["description"]) } : {}),
      steps: Object.freeze(
        (p["steps"] as Record<string, unknown>[]).map((st) =>
          Object.freeze({
            harmonicFunction: st["harmonicFunction"] as HarmonicFunctionIdentity,
            duration: decodeDuration(st["duration"] as WireDuration),
          }),
        ),
      ),
    }),
  );

  // Decode defaults
  const defaultsRaw = (migrated["defaults"] as Record<string, unknown>) || {};
  const rawPiano = defaultsRaw["piano"] as
    { duration: WireDuration; performance: StepPerformance } | undefined;
  const decodedDefaultPerformance = rawPiano
    ? snapshotStepPerformance(rawPiano.performance)
    : DEFAULT_PIANO_PERFORMANCE;
  // Projects saved before Humanized became the product default stored Block
  // in this inherited-default slot. Keep explicit per-step/card overrides
  // untouched while upgrading the inherited default on load.
  const defaultPerformance =
    decodedDefaultPerformance.articulation === "block"
      ? Object.freeze({
          ...decodedDefaultPerformance,
          articulation: DEFAULT_PIANO_PERFORMANCE.articulation,
        })
      : decodedDefaultPerformance;
  const defaults: ProjectDefaults = {
    piano: rawPiano
      ? {
          duration: decodeDuration(rawPiano.duration),
          performance: defaultPerformance,
        }
      : {
          duration: musicalDuration(rational(4, 1)),
          performance: defaultPerformance,
        },
  };

  // Decode moduleTemplateStates
  const moduleTemplateStatesRaw =
    (migrated["moduleTemplateStates"] as Record<string, unknown>) || {};
  const progressionsCards: Record<string, MatrixCardTemplateState> = {};
  const darkHarmonyCards: Record<string, MatrixCardTemplateState> = {};

  const decodeCards = (
    rawModState: { cards?: Record<string, Record<string, unknown>> } | undefined,
    target: Record<string, MatrixCardTemplateState>,
  ) => {
    for (const [cardKey, card] of Object.entries(rawModState?.cards || {})) {
      const explicitOverridesRaw = (card["explicitOverrides"] as Record<string, unknown>) || {};
      const explicitOverrides: StepCreationOverrides = {
        ...(explicitOverridesRaw as unknown as StepCreationOverrides),
        ...(explicitOverridesRaw["duration"]
          ? {
              duration: decodeDuration(explicitOverridesRaw["duration"] as WireDuration),
            }
          : {}),
      };
      target[cardKey] = {
        harmonicFunctionId: String(card["harmonicFunctionId"]),
        explicitOverrides,
        ...(card["harmonicVariantOverride"]
          ? { harmonicVariantOverride: card["harmonicVariantOverride"] as HarmonicVariant }
          : {}),
        ...(card["manualPreviewVoicing"]
          ? { manualPreviewVoicing: card["manualPreviewVoicing"] as readonly ExactPitch[] }
          : {}),
        ...(card["cardViewOverride"]
          ? { cardViewOverride: card["cardViewOverride"] as CardViewId }
          : {}),
      };
    }
  };

  decodeCards(
    moduleTemplateStatesRaw["progressions"] as
      { cards?: Record<string, Record<string, unknown>> } | undefined,
    progressionsCards,
  );
  decodeCards(
    moduleTemplateStatesRaw["dark-harmony"] as
      { cards?: Record<string, Record<string, unknown>> } | undefined,
    darkHarmonyCards,
  );

  const moduleTemplateStates: Readonly<Record<HarmonicModuleId, ModuleTemplateState>> = {
    progressions: { cards: progressionsCards },
    "dark-harmony": { cards: darkHarmonyCards },
  };

  const harmonyTrack = decodeHarmonyTrackSettings(migrated["harmonyTrack"]);
  const melodyTrack = decodeMelodyTrackSettings(migrated["melodyTrack"]);

  const project: Project = Object.freeze({
    id: String(migrated["id"]),
    schemaVersion: Number(migrated["schemaVersion"]),
    name: String(migrated["name"]),
    createdAt: String(migrated["createdAt"]),
    updatedAt: String(migrated["updatedAt"]),
    activeModule: migrated["activeModule"] as HarmonicModuleId,
    tonic,
    globalTiming: migrated["globalTiming"] as Project["globalTiming"],
    groove: migrated["groove"] as Project["groove"],
    presentation: (() => {
      const presentation = migrated["presentation"] as Record<string, unknown>;
      return Object.freeze({
        expertiseMode: presentation["expertiseMode"] as PresentationState["expertiseMode"],
        theme: presentation["theme"] as PresentationState["theme"],
        globalMatrixCardView: presentation[
          "globalMatrixCardView"
        ] as PresentationState["globalMatrixCardView"],
        // Portable projects created before this preference default to chord notes only.
        showBassInStaff: presentation["showBassInStaff"] === true,
      });
    })(),
    harmonyTrack,
    melodyTrack,
    defaults,
    moduleTemplateStates,
    progression: Object.freeze({
      steps: Object.freeze(steps),
      ...(progressionRaw.selectedStepId !== null && progressionRaw.selectedStepId !== undefined
        ? { selectedStepId: progressionRaw.selectedStepId }
        : {}),
      ...(progressionRaw.loopRegion !== null && progressionRaw.loopRegion !== undefined
        ? { loopRegion: progressionRaw.loopRegion }
        : {}),
    }),
    ...(temporaryBranch !== undefined ? { temporaryBranch } : {}),
    customPresets: Object.freeze(customPresets),
  });

  return project;
}
