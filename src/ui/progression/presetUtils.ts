import type { FunctionalPreset } from "../../domain/progression/presets";
import { realizePresetSteps } from "../../domain/progression/presets";
import type { Project } from "../../domain/project/project";
import type { MusicalDuration } from "../../domain/timing/duration";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import { realizeChord } from "../../domain/harmony/realization";
import { defaultTonicSpelling, formatPitchSpelling } from "../../domain/harmony/spelling";

export function formatPresetStepDuration(duration: MusicalDuration): string {
  const { numerator: n, denominator: d } = duration.beats;
  if (n === 4 && d === 1) return "Whole";
  if (n === 2 && d === 1) return "Half";
  if (n === 1 && d === 1) return "Quarter";
  if (n === 1 && d === 2) return "Eighth";
  if (n === 1 && d === 4) return "Sixteenth";
  if (n === 3 && d === 1) return "Dotted Half";
  if (n === 3 && d === 2) return "Dotted Quarter";
  if (n === 3 && d === 4) return "Dotted Eighth";
  if (n === 2 && d === 3) return "Quarter Triplet";
  if (n === 1 && d === 3) return "Eighth Triplet";
  return d === 1 ? `${n} beats` : `${n}/${d} beats`;
}

export function formatContextLabel(project: Project): string {
  const mode = project.activeModule === "dark-harmony" ? "tonal-minor" : "major";
  const tonicLetter = formatPitchSpelling(defaultTonicSpelling(project.tonic, mode));
  const modeName = mode === "tonal-minor" ? "Tonal Minor" : "Major";
  return `${tonicLetter} ${modeName}`;
}

export function resolveHarmonicContext(project: Project): HarmonicContext {
  const mode = project.activeModule === "dark-harmony" ? "tonal-minor" : "major";
  return {
    tonic: project.tonic,
    moduleId: project.activeModule,
    mode,
    spellingContext: {
      tonic: project.tonic,
      mode,
    },
  };
}

export interface PresetRealizationSummary {
  readonly kind: "success" | "ambiguous" | "incompatible";
  readonly chordSymbols?: readonly string[];
  readonly ambiguousAlternatives?: readonly string[];
  readonly unsupportedFunctionIds?: readonly string[];
  readonly text: string;
}

export function getPresetRealizationSummary(
  preset: FunctionalPreset,
  project: Project,
): PresetRealizationSummary {
  const context = resolveHarmonicContext(project);
  const realization = realizePresetSteps(preset, context, project.defaults);

  if (realization.kind === "success") {
    const chordSymbols = realization.steps.map(
      (step) => realizeChord(step.harmonicFunction, project.tonic).spelling.symbol,
    );
    return {
      kind: "success",
      chordSymbols,
      text: chordSymbols.join(" · "),
    };
  }

  if (realization.kind === "ambiguous") {
    const alternatives = realization.ambiguousSteps.flatMap((step) =>
      step.resolution.alternatives.map((alt) => alt.functionId),
    );
    return {
      kind: "ambiguous",
      ambiguousAlternatives: alternatives,
      text: `Ambiguous mapping in current context (candidates: ${alternatives.join(", ")})`,
    };
  }

  const unsupportedFunctionIds = realization.unsupportedFunctions.map((fn) => fn.functionId);
  return {
    kind: "incompatible",
    unsupportedFunctionIds,
    text: `Incompatible with current context (unsupported: ${unsupportedFunctionIds.join(", ")})`,
  };
}
