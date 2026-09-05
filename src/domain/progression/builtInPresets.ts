import { rational } from "../timing/rational";
import { musicalDuration } from "../timing/duration";
import { createFunctionalPreset, type FunctionalPreset } from "./presets";

/**
 * Curated built-in functional preset catalog (FR-148).
 * Stores purely harmonic functions + exact musical durations (FR-150),
 * completely free of performance, voicing, or harmonic variant data (FR-151).
 */
export const BUILT_IN_PRESETS: readonly FunctionalPreset[] = Object.freeze([
  // --- Major Presets (progressions module) ---
  createFunctionalPreset(
    "builtin-major-pop-50s",
    "50s / Doo-Wop Progression",
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
    "Classic I - vi - IV - V progression used in Doo-Wop and popular music.",
  ),

  createFunctionalPreset(
    "builtin-major-authentic-cadence",
    "Authentic Cadence",
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
    "Foundational I - IV - V - I cadential cycle.",
  ),

  createFunctionalPreset(
    "builtin-major-jazz-ii-v-i",
    "Jazz ii - V - I",
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
    "Essential jazz turnaround and cadential movement.",
  ),

  // --- Tonal Minor Presets (dark-harmony module) ---
  createFunctionalPreset(
    "builtin-minor-classic-cadence",
    "Minor Cadence",
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
    "Standard tonal minor i - iv - V - i cadence.",
  ),

  createFunctionalPreset(
    "builtin-minor-andalusian",
    "Andalusian Cadence",
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
    "Descending tetrachord i - VII - VI - V progression.",
  ),

  createFunctionalPreset(
    "builtin-minor-ii-v-i",
    "Minor ii° - V - i",
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
    "Minor-key cadential resolution using diminished supertonic.",
  ),
]);

export function getBuiltInPresets(): readonly FunctionalPreset[] {
  return BUILT_IN_PRESETS;
}

export function getBuiltInPresetById(id: string): FunctionalPreset | undefined {
  return BUILT_IN_PRESETS.find((preset) => preset.id === id);
}
