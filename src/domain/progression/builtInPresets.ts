import { rational } from "../timing/rational";
import { musicalDuration } from "../timing/duration";
import { createFunctionalPreset, type FunctionalPreset } from "./presets";

/**
 * Curated built-in functional preset catalog (FR-148).
 * Stores purely harmonic functions + exact musical durations (FR-150),
 * completely free of performance, voicing, or harmonic variant data (FR-151).
 * Uses neutral functional naming without genre or authenticity labels.
 */
export const BUILT_IN_PRESETS: readonly FunctionalPreset[] = Object.freeze([
  // --- Major Presets (progressions module) ---
  createFunctionalPreset(
    "builtin-major-i-vi-iv-v",
    "Major I–vi–IV–V",
    "builtIn",
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
    ],
    "Functional I - vi - IV - V progression.",
  ),

  createFunctionalPreset(
    "builtin-major-i-iv-v-i",
    "Major I–IV–V–I",
    "builtIn",
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
    "Functional I - IV - V - I cadential progression.",
  ),

  createFunctionalPreset(
    "builtin-major-ii-v-i",
    "Major ii–V–I",
    "builtIn",
    [
      {
        harmonicFunction: { moduleId: "progressions", functionId: "ii", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
    "Functional ii - V - I cadential progression.",
  ),

  // --- Tonal Minor Presets (dark-harmony module) ---
  createFunctionalPreset(
    "builtin-minor-i-iv-v-i",
    "Minor i–iv–V–i",
    "builtIn",
    [
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "iv", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
    "Functional minor i - iv - V - i cadential progression.",
  ),

  createFunctionalPreset(
    "builtin-minor-i-vii-vi-v",
    "Minor i–VII–VI–V",
    "builtIn",
    [
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "VII", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "VI", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
    "Functional minor i - VII - VI - V descending progression.",
  ),

  createFunctionalPreset(
    "builtin-minor-iio-v-i",
    "Minor ii°–V–i",
    "builtIn",
    [
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "ii°", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(2, 1), { kind: "beats" }),
      },
      {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
        duration: musicalDuration(rational(4, 1), { kind: "bars", bars: 1 }),
      },
    ],
    "Functional minor ii° - V - i cadential progression.",
  ),
]);

export function getBuiltInPresets(): readonly FunctionalPreset[] {
  return BUILT_IN_PRESETS;
}

export function getBuiltInPresetById(id: string): FunctionalPreset | undefined {
  return BUILT_IN_PRESETS.find((preset) => preset.id === id);
}
