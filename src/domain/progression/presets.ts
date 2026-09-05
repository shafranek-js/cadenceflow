import type { HarmonicFunctionCategory, HarmonicFunctionIdentity } from "../harmony/functions";
import type { DurationDisplayHint, MusicalDuration } from "../timing/duration";
import { musicalDuration } from "../timing/duration";
import { compareRational, rational } from "../timing/rational";
import type { Progression } from "./progression";
import type { ChordStep } from "./step";
import { snapshotStepPerformance } from "./step";
import type { HarmonicContext } from "../harmony/modules/types";
import type { ProjectDefaults } from "../project/defaults";
import { DEFAULT_PIANO_PERFORMANCE } from "../project/factory";
import { EMPTY_HARMONIC_VARIANT } from "../harmony/chord";
import { realizeChord } from "../harmony/realization";
import { mapFunctionAcrossModules, type ModuleSwitchResolution } from "../harmony/moduleSwitch";

export type PresetSource = "builtIn" | "custom";

export interface PresetStep {
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly duration: MusicalDuration;
}

export interface FunctionalPreset {
  readonly id: string;
  readonly name: string;
  readonly source: PresetSource;
  readonly description?: string;
  readonly steps: readonly PresetStep[];
}

export type PresetApplyMode = "replace" | "append" | "insert";

export interface SerializablePresetStep {
  readonly harmonicFunction: HarmonicFunctionIdentity;
  readonly duration: {
    readonly beats: { readonly numerator: number; readonly denominator: number };
    readonly displayHint?: DurationDisplayHint;
  };
}

export interface SerializablePreset {
  readonly id: string;
  readonly name: string;
  readonly source: PresetSource;
  readonly description?: string;
  readonly steps: readonly SerializablePresetStep[];
}

export type SaveCustomPresetResult =
  | { readonly kind: "success"; readonly preset: FunctionalPreset }
  | {
      readonly kind: "unsupported-progression";
      readonly reason: "rest-step";
      readonly message: string;
    };

export type PresetRealizationResult =
  | { readonly kind: "success"; readonly steps: readonly ChordStep[] }
  | {
      readonly kind: "incompatible";
      readonly unsupportedFunctions: readonly HarmonicFunctionIdentity[];
    }
  | {
      readonly kind: "ambiguous";
      readonly ambiguousSteps: readonly {
        readonly stepIndex: number;
        readonly resolution: ModuleSwitchResolution;
      }[];
    };

export function createFunctionalPreset(
  id: string,
  name: string,
  source: PresetSource,
  steps: readonly PresetStep[],
  description?: string,
): FunctionalPreset {
  if (typeof id !== "string" || !id.trim()) {
    throw new TypeError("Preset id must be a non-empty string");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("Preset name must be a non-empty string");
  }
  if (source !== "builtIn" && source !== "custom") {
    throw new TypeError('Preset source must be "builtIn" or "custom"');
  }
  if (!Array.isArray(steps)) {
    throw new TypeError("Preset steps must be an array");
  }

  // Strictly sanitize steps to prevent any performance, voicing, or harmonicVariant leakage
  const sanitizedSteps: readonly PresetStep[] = Object.freeze(
    steps.map((step, index) => {
      if (!step || typeof step !== "object") {
        throw new TypeError(`Invalid preset step at index ${index}`);
      }
      const hf = step.harmonicFunction;
      if (!hf || typeof hf !== "object") {
        throw new TypeError(`Invalid harmonicFunction at preset step index ${index}`);
      }
      const dur = step.duration;
      if (!dur || typeof dur !== "object" || !dur.beats) {
        throw new TypeError(`Invalid duration at preset step index ${index}`);
      }

      const sanitizedFunction: HarmonicFunctionIdentity = Object.freeze({
        moduleId: hf.moduleId,
        functionId: hf.functionId,
        category: hf.category,
        ...(typeof hf.targetFunctionId === "string"
          ? { targetFunctionId: hf.targetFunctionId }
          : {}),
      });

      const sanitizedDuration: MusicalDuration = Object.freeze({
        beats: Object.freeze({
          numerator: dur.beats.numerator,
          denominator: dur.beats.denominator,
        }),
        ...(dur.displayHint ? { displayHint: Object.freeze({ ...dur.displayHint }) } : {}),
      });

      return Object.freeze({
        harmonicFunction: sanitizedFunction,
        duration: sanitizedDuration,
      });
    }),
  );

  return Object.freeze({
    id: id.trim(),
    name: name.trim(),
    source,
    ...(typeof description === "string" && description.trim()
      ? { description: description.trim() }
      : {}),
    steps: sanitizedSteps,
  });
}

export function serializePreset(preset: FunctionalPreset): string {
  const sanitized = createFunctionalPreset(
    preset.id,
    preset.name,
    preset.source,
    preset.steps,
    preset.description,
  );
  return JSON.stringify(sanitized, null, 2);
}

export function deserializePreset(json: string): FunctionalPreset {
  if (typeof json !== "string" || !json.trim()) {
    throw new TypeError("Invalid JSON: input must be a non-empty string");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new TypeError(`Malformed JSON string: ${String(err)}`, { cause: err });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Invalid preset JSON: expected root object");
  }
  const record = parsed as Record<string, unknown>;

  if (typeof record.id !== "string" || !record.id.trim()) {
    throw new TypeError("Invalid preset: id must be a non-empty string");
  }
  if (typeof record.name !== "string" || !record.name.trim()) {
    throw new TypeError("Invalid preset: name must be a non-empty string");
  }
  if (record.source !== "builtIn" && record.source !== "custom") {
    throw new TypeError('Invalid preset: source must be "builtIn" or "custom"');
  }
  if (record.description !== undefined && typeof record.description !== "string") {
    throw new TypeError("Invalid preset: description must be a string if present");
  }
  if (!Array.isArray(record.steps)) {
    throw new TypeError("Invalid preset: steps must be an array");
  }

  const steps: PresetStep[] = record.steps.map((rawStep, index) => {
    if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) {
      throw new TypeError(`Invalid preset step at index ${index}: expected object`);
    }
    const stepRec = rawStep as Record<string, unknown>;
    const hf = stepRec.harmonicFunction as Record<string, unknown> | undefined;
    if (!hf || typeof hf !== "object") {
      throw new TypeError(`Invalid harmonicFunction at step index ${index}`);
    }
    if (hf.moduleId !== "progressions" && hf.moduleId !== "dark-harmony") {
      throw new TypeError(`Invalid moduleId at step index ${index}: ${hf.moduleId}`);
    }
    if (typeof hf.functionId !== "string" || !hf.functionId) {
      throw new TypeError(`Invalid functionId at step index ${index}`);
    }
    if (typeof hf.category !== "string" || !hf.category) {
      throw new TypeError(`Invalid category at step index ${index}`);
    }

    const dur = stepRec.duration as Record<string, unknown> | undefined;
    if (!dur || typeof dur !== "object") {
      throw new TypeError(`Invalid duration at step index ${index}`);
    }
    const beats = dur.beats as Record<string, unknown> | undefined;
    if (!beats || typeof beats !== "object") {
      throw new TypeError(`Invalid duration beats at step index ${index}`);
    }
    const num = beats.numerator;
    const den = beats.denominator;
    if (
      typeof num !== "number" ||
      typeof den !== "number" ||
      !Number.isInteger(num) ||
      !Number.isInteger(den) ||
      den <= 0
    ) {
      throw new TypeError(`Invalid duration rational at step index ${index}`);
    }
    const rat = rational(num, den);
    if (compareRational(rat, rational(0)) <= 0) {
      throw new RangeError(`Duration beats must be positive at step index ${index}`);
    }

    let displayHint: DurationDisplayHint | undefined = undefined;
    if (dur.displayHint !== undefined) {
      if (
        typeof dur.displayHint !== "object" ||
        dur.displayHint === null ||
        Array.isArray(dur.displayHint)
      ) {
        throw new TypeError(`Invalid displayHint at step index ${index}`);
      }
      const hintRec = dur.displayHint as Record<string, unknown>;
      const allowedKinds = ["beats", "bars", "dotted", "triplet"];
      if (typeof hintRec.kind !== "string" || !allowedKinds.includes(hintRec.kind)) {
        throw new TypeError(`Invalid displayHint kind at step index ${index}: ${hintRec.kind}`);
      }
      displayHint = dur.displayHint as DurationDisplayHint;
    }

    return {
      harmonicFunction: {
        moduleId: hf.moduleId,
        functionId: hf.functionId,
        category: hf.category as HarmonicFunctionCategory,
        ...(typeof hf.targetFunctionId === "string"
          ? { targetFunctionId: hf.targetFunctionId }
          : {}),
      },
      duration: musicalDuration(rat, displayHint),
    };
  });

  return createFunctionalPreset(
    record.id,
    record.name,
    record.source,
    steps,
    record.description as string | undefined,
  );
}

export function saveCustomPresetFromProgression(
  name: string,
  progression: Progression,
  options?: { readonly id?: string; readonly description?: string },
): SaveCustomPresetResult {
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("Custom preset name must be a non-empty string");
  }
  const hasRest = progression.steps.some((step) => step.kind === "rest");
  if (hasRest) {
    return Object.freeze({
      kind: "unsupported-progression",
      reason: "rest-step",
      message: "Progressions containing Rest steps cannot be saved as Custom Presets in v1.",
    });
  }

  const id = options?.id ?? `custom-${crypto.randomUUID()}`;
  const steps: PresetStep[] = progression.steps.map((step) => {
    if (step.kind !== "chord") {
      throw new Error("Only chord steps can be saved into functional presets in v1");
    }
    return {
      harmonicFunction: {
        moduleId: step.harmonicFunction.moduleId,
        functionId: step.harmonicFunction.functionId,
        category: step.harmonicFunction.category,
        ...(step.harmonicFunction.targetFunctionId
          ? { targetFunctionId: step.harmonicFunction.targetFunctionId }
          : {}),
      },
      duration: step.duration,
    };
  });

  const preset = createFunctionalPreset(id, name.trim(), "custom", steps, options?.description);

  return Object.freeze({
    kind: "success",
    preset,
  });
}

function resolveTonicNumber(tonic: unknown): number {
  if (typeof tonic === "number") return ((tonic % 12) + 12) % 12;
  if (tonic && typeof (tonic as { semitone?: unknown }).semitone === "number") {
    const val = (tonic as { semitone: number }).semitone;
    return ((val % 12) + 12) % 12;
  }
  return 0;
}

export function realizePresetSteps(
  preset: FunctionalPreset,
  context: HarmonicContext,
  defaults?: ProjectDefaults,
): PresetRealizationResult {
  const unsupportedFunctions: HarmonicFunctionIdentity[] = [];
  const realizedSteps: ChordStep[] = [];

  const defaultPerformance = defaults?.piano?.performance ?? DEFAULT_PIANO_PERFORMANCE;
  const tonicNumber = resolveTonicNumber(context.tonic);

  for (let i = 0; i < preset.steps.length; i++) {
    const step = preset.steps[i]!;
    const sourceFn = step.harmonicFunction;

    const targetFn =
      sourceFn.moduleId === context.moduleId
        ? sourceFn
        : mapFunctionAcrossModules(sourceFn, context.moduleId);

    if (!targetFn) {
      unsupportedFunctions.push(sourceFn);
      continue;
    }

    try {
      realizeChord(targetFn, tonicNumber);
      realizedSteps.push(
        Object.freeze({
          id: `step-${crypto.randomUUID()}`,
          kind: "chord",
          harmonicFunction: Object.freeze({ ...targetFn }),
          harmonicVariant: EMPTY_HARMONIC_VARIANT,
          duration: step.duration,
          performance: snapshotStepPerformance(defaultPerformance),
          cardView: "harmonic",
        }),
      );
    } catch {
      unsupportedFunctions.push(sourceFn);
    }
  }

  if (unsupportedFunctions.length > 0) {
    return Object.freeze({
      kind: "incompatible",
      unsupportedFunctions: Object.freeze(unsupportedFunctions),
    });
  }

  return Object.freeze({
    kind: "success",
    steps: Object.freeze(realizedSteps),
  });
}

export function applyPresetToProgression(
  progression: Progression,
  preset: FunctionalPreset,
  mode: PresetApplyMode,
  context: HarmonicContext,
  defaults?: ProjectDefaults,
): Progression {
  const realization = realizePresetSteps(preset, context, defaults);
  if (realization.kind !== "success") {
    throw new Error(
      `Cannot apply preset "${preset.name}": contains incompatible harmonic functions for module ${context.moduleId}`,
    );
  }

  const realizedSteps = realization.steps;

  if (progression.steps.length === 0) {
    return Object.freeze({
      steps: Object.freeze([...realizedSteps]),
    });
  }

  switch (mode) {
    case "replace":
      return Object.freeze({
        steps: Object.freeze([...realizedSteps]),
      });

    case "append":
      return Object.freeze({
        steps: Object.freeze([...progression.steps, ...realizedSteps]),
        ...(progression.selectedStepId !== undefined
          ? { selectedStepId: progression.selectedStepId }
          : {}),
      });

    case "insert": {
      if (!progression.selectedStepId) {
        throw new RangeError("Cannot insert preset: no step is selected in non-empty progression");
      }
      const selectedIndex = progression.steps.findIndex(
        (step) => step.id === progression.selectedStepId,
      );
      if (selectedIndex < 0) {
        throw new RangeError(
          `Selected step id "${progression.selectedStepId}" not found in progression`,
        );
      }
      const before = progression.steps.slice(0, selectedIndex);
      const after = progression.steps.slice(selectedIndex);
      return Object.freeze({
        steps: Object.freeze([...before, ...realizedSteps, ...after]),
        selectedStepId: progression.selectedStepId,
      });
    }

    default: {
      const exhaustiveCheck: never = mode;
      throw new Error(`Unsupported preset apply mode: ${exhaustiveCheck}`);
    }
  }
}
