import { describe, expect, it } from "vitest";
import {
  CADENCE_FORMULAS,
  getCadenceFormulas,
  getCadenceFormulaById,
  getFormulasForModule,
  getFormulasForGenre,
  getQuickStartersForModule,
} from "../../../src/domain/progression/cadenceFormulas";
import { realizePresetSteps, applyPresetToProgression } from "../../../src/domain/progression/presets";
import type { HarmonicContext } from "../../../src/domain/harmony/modules/types";
import type { Progression } from "../../../src/domain/progression/progression";

// Forbidden keys for performance and harmonic-variant leakage assertions
const FORBIDDEN_PRESET_KEYS = [
  "performance",
  "voicing",
  "manualVoicing",
  "midiPitches",
  "articulation",
  "register",
  "bass",
  "masterVelocity",
  "perNoteVelocityOverrides",
  "dynamics",
  "dynamicsViewPreference",
  "cardView",
  "audio",
  "sample",
  "provider",
  "explicitSpellingOverrides",
  "harmonicVariant",
  "variant",
  "extensions",
  "suspensions",
  "alterations",
  "seventh",
  "add9",
  "spelling",
  "rootPitchClass",
  "symbol",
] as const;

function assertNoLeakage(obj: unknown, path = ""): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => assertNoLeakage(item, `${path}[${index}]`));
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const currentPath = path ? `${path}.${key}` : key;
    for (const forbidden of FORBIDDEN_PRESET_KEYS) {
      expect(
        key.toLowerCase(),
        `Forbidden key "${forbidden}" found at path "${currentPath}"`,
      ).not.toBe(forbidden.toLowerCase());
    }
    assertNoLeakage(record[key], currentPath);
  }
}

describe("Cadence Formulas & Quick Starters Domain Contract", () => {
  it("provides 10 curated canonical cadence formulas", () => {
    expect(CADENCE_FORMULAS).toHaveLength(10);
    expect(Object.isFrozen(CADENCE_FORMULAS)).toBe(true);

    for (const formula of CADENCE_FORMULAS) {
      expect(formula.id).toMatch(/^formula-/);
      expect(formula.name.length).toBeGreaterThan(0);
      expect(formula.source).toBe("builtIn");
      expect(formula.steps.length).toBeGreaterThanOrEqual(3);
      expect(formula.theoreticalRationale.length).toBeGreaterThan(0);
      expect(formula.tags.length).toBeGreaterThan(0);
      expect(Object.isFrozen(formula)).toBe(true);
      expect(Object.isFrozen(formula.steps)).toBe(true);
      expect(Object.isFrozen(formula.tags)).toBe(true);
    }
  });

  it("ensures zero performance, voicing, or harmonic variant leakage in any formula", () => {
    for (const formula of CADENCE_FORMULAS) {
      assertNoLeakage(formula);
    }
  });

  it("retrieves formulas by id via getCadenceFormulaById", () => {
    const gospel = getCadenceFormulaById("formula-gospel-lift");
    expect(gospel).toBeDefined();
    expect(gospel?.name).toBe("Gospel Lift");
    expect(gospel?.genre).toBe("gospel");

    const neapolitan = getCadenceFormulaById("formula-neapolitan-path");
    expect(neapolitan).toBeDefined();
    expect(neapolitan?.name).toBe("Neapolitan Path");
    expect(neapolitan?.recommendedModule).toBe("dark-harmony");

    expect(getCadenceFormulaById("unknown-id")).toBeUndefined();
  });

  it("filters formulas by module correctly", () => {
    const majorFormulas = getFormulasForModule("progressions");
    expect(majorFormulas.length).toBe(6);
    expect(majorFormulas.map((f) => f.id)).toContain("formula-gospel-lift");
    expect(majorFormulas.map((f) => f.id)).toContain("formula-neosoul-turnaround");
    expect(majorFormulas.map((f) => f.id)).toContain("formula-backdoor-cadence");
    expect(majorFormulas.map((f) => f.id)).toContain("formula-deceptive-drama");
    expect(majorFormulas.map((f) => f.id)).toContain("formula-cinematic-hero");
    expect(majorFormulas.map((f) => f.id)).toContain("formula-pop-ballad-axis");

    const darkFormulas = getFormulasForModule("dark-harmony");
    expect(darkFormulas.length).toBe(4);
    expect(darkFormulas.map((f) => f.id)).toContain("formula-neapolitan-path");
    expect(darkFormulas.map((f) => f.id)).toContain("formula-flamenco-descent");
    expect(darkFormulas.map((f) => f.id)).toContain("formula-dark-passing-drama");
    expect(darkFormulas.map((f) => f.id)).toContain("formula-secondary-dim-subdominant");
  });

  it("filters formulas by genre correctly", () => {
    const gospelFormulas = getFormulasForGenre("gospel");
    expect(gospelFormulas.length).toBeGreaterThanOrEqual(1);
    expect(gospelFormulas[0]?.id).toBe("formula-gospel-lift");

    const neoSoulFormulas = getFormulasForGenre("neo-soul");
    expect(neoSoulFormulas.map((f) => f.id)).toContain("formula-neosoul-turnaround");

    const allFormulas = getFormulasForGenre("all");
    expect(allFormulas).toHaveLength(10);
  });

  it("prioritizes active genre in getQuickStartersForModule", () => {
    const startersWithGospel = getQuickStartersForModule("progressions", "gospel");
    expect(startersWithGospel[0]?.id).toBe("formula-gospel-lift");

    const startersWithNeoSoul = getQuickStartersForModule("progressions", "neo-soul");
    expect(startersWithNeoSoul[0]?.id).toBe("formula-neosoul-turnaround");
  });

  it("realizes all Major formulas across multiple keys without errors", () => {
    const majorFormulas = getFormulasForModule("progressions");
    const testTonics = [0, 5, 7, 2, 8]; // C, F, G, D, Ab

    for (const tonicPc of testTonics) {
      const context: HarmonicContext = {
        tonic: { semitone: tonicPc },
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: tonicPc === 5 || tonicPc === 8 },
      };

      for (const formula of majorFormulas) {
        const result = realizePresetSteps(formula, context);
        expect(result.kind, `Formula ${formula.name} failed realization in tonic ${tonicPc}`).toBe("success");
        if (result.kind === "success") {
          expect(result.steps).toHaveLength(formula.steps.length);
          for (const step of result.steps) {
            expect(step.kind).toBe("chord");
            expect(step.id).toBeDefined();
          }
        }
      }
    }
  });

  it("realizes all Dark Harmony formulas across multiple keys without errors", () => {
    const darkFormulas = getFormulasForModule("dark-harmony");
    const testTonics = [0, 9, 2, 4]; // C minor, A minor, D minor, E minor

    for (const tonicPc of testTonics) {
      const context: HarmonicContext = {
        tonic: { semitone: tonicPc },
        moduleId: "dark-harmony",
        mode: "tonal-minor",
        spellingContext: { preferFlats: tonicPc === 0 || tonicPc === 2 },
      };

      for (const formula of darkFormulas) {
        const result = realizePresetSteps(formula, context);
        expect(result.kind, `Formula ${formula.name} failed realization in dark tonic ${tonicPc}`).toBe("success");
        if (result.kind === "success") {
          expect(result.steps).toHaveLength(formula.steps.length);
          for (const step of result.steps) {
            expect(step.kind).toBe("chord");
            expect(step.id).toBeDefined();
          }
        }
      }
    }
  });

  it("applies a formula cleanly to an empty progression", () => {
    const gospel = getCadenceFormulaById("formula-gospel-lift")!;
    const context: HarmonicContext = {
      tonic: { semitone: 0 },
      moduleId: "progressions",
      mode: "major",
      spellingContext: { preferFlats: false },
    };

    const emptyProgression: Progression = { steps: [] };
    const applied = applyPresetToProgression(emptyProgression, gospel, "replace", context);

    expect(applied.steps).toHaveLength(5);
    expect(applied.steps[0]?.harmonicFunction.functionId).toBe("I");
    expect(applied.steps[1]?.harmonicFunction.functionId).toBe("V7/IV");
    expect(applied.steps[2]?.harmonicFunction.functionId).toBe("IV");
    expect(applied.steps[3]?.harmonicFunction.functionId).toBe("iv");
    expect(applied.steps[4]?.harmonicFunction.functionId).toBe("I");
  });
});
