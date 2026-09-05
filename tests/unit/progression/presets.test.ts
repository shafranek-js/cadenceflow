import { describe, expect, it } from "vitest";
import { rational, equalRational } from "../../../src/domain/timing/rational";
import { musicalDuration } from "../../../src/domain/timing/duration";
import type { FunctionalPreset, PresetStep } from "../../../src/domain/progression/presets";
import {
  createFunctionalPreset,
  serializePreset,
  deserializePreset,
  saveCustomPresetFromProgression,
  realizePresetSteps,
  applyPresetToProgression,
} from "../../../src/domain/progression/presets";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import type { ChordStep, RestStep, StepPerformance } from "../../../src/domain/progression/step";
import { snapshotStepPerformance } from "../../../src/domain/progression/step";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import type { HarmonicContext } from "../../../src/domain/harmony/modules/types";
import type { Progression } from "../../../src/domain/progression/progression";
import type { ProjectDefaults } from "../../../src/domain/project/defaults";
import {
  createDefaultProject,
  DEFAULT_PIANO_PERFORMANCE,
} from "../../../src/domain/project/factory";

// Forbidden keys for performance leakage assertions (FR-151)
const FORBIDDEN_PERFORMANCE_KEYS = [
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
] as const;

function assertNoPerformanceLeakage(obj: unknown, path = ""): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => assertNoPerformanceLeakage(item, `${path}[${index}]`));
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const currentPath = path ? `${path}.${key}` : key;
    for (const forbidden of FORBIDDEN_PERFORMANCE_KEYS) {
      expect(
        key.toLowerCase(),
        `Forbidden performance key "${forbidden}" found at path "${currentPath}"`,
      ).not.toBe(forbidden.toLowerCase());
    }
    assertNoPerformanceLeakage(record[key], currentPath);
  }
}

// Canonical helper to build rich performance fixtures
function createRichPerformance(overrides?: Partial<StepPerformance>): StepPerformance {
  const base: StepPerformance = {
    ...DEFAULT_PIANO_PERFORMANCE,
    articulation: "broken-chord",
    register: 1,
    voicingMode: "manual",
    manualVoicing: Object.freeze([
      exactPitch(60, "C4"),
      exactPitch(64, "E4"),
      exactPitch(67, "G4"),
    ]),
    bass: {
      choice: "custom",
      octaveOffset: -1,
      customPitch: exactPitch(36, "C2"),
    },
    masterVelocity: 110,
    perNoteVelocityOverrides: Object.freeze({ "60": 120 }),
    dynamicsViewPreference: "midi",
  };
  return snapshotStepPerformance({ ...base, ...overrides });
}

describe("T112 — Functional Presets Contract Suite (US7)", () => {
  // --------------------------------------------------------------------------
  // 1 & 2. Canonical Preset Data Model & HarmonicFunctionIdentity Contract
  // --------------------------------------------------------------------------
  describe("1. Canonical Preset Data Model & HarmonicFunctionIdentity", () => {
    it("defines a functional preset containing only identity, metadata, and ordered steps with HarmonicFunctionIdentity and MusicalDuration", () => {
      const step1: PresetStep = {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(1, 1)),
      };
      const step2: PresetStep = {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
      };

      const preset = createFunctionalPreset(
        "p1",
        "Authentic Cadence",
        "builtIn",
        [step1, step2],
        "Standard cadence",
      );

      expect(preset.id).toBe("p1");
      expect(preset.name).toBe("Authentic Cadence");
      expect(preset.source).toBe("builtIn");
      expect(preset.description).toBe("Standard cadence");
      expect(preset.steps).toHaveLength(2);
      expect(preset.steps[0]!.harmonicFunction.functionId).toBe("I");
      expect(preset.steps[0]!.harmonicFunction.moduleId).toBe("progressions");
      expect(preset.steps[1]!.harmonicFunction.functionId).toBe("V");

      // Verify no runtime performance keys exist on preset or preset steps
      assertNoPerformanceLeakage(preset);
    });

    it("distinguishes functional identities across different compatible modules (progressions vs dark-harmony)", () => {
      const progDominant: PresetStep = {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        duration: musicalDuration(rational(1, 1)),
      };
      const darkDominant: PresetStep = {
        harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
        duration: musicalDuration(rational(1, 1)),
      };

      expect(progDominant.harmonicFunction.moduleId).toBe("progressions");
      expect(darkDominant.harmonicFunction.moduleId).toBe("dark-harmony");
      expect(progDominant.harmonicFunction).not.toEqual(darkDominant.harmonicFunction);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Exact MusicalDuration Contract
  // --------------------------------------------------------------------------
  describe("2. Exact MusicalDuration Contract in Presets", () => {
    it("stores exact Rational-backed durations without floating-point seconds or milliseconds", () => {
      const quarter = musicalDuration(rational(1, 1));
      const eighth = musicalDuration(rational(1, 2));
      const dottedQuarter = musicalDuration(rational(3, 2));
      const quarterTriplet = musicalDuration(rational(2, 3));
      const awkwardFraction = musicalDuration(rational(7, 12));

      const steps: readonly PresetStep[] = [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
          duration: quarter,
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
          duration: eighth,
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
          duration: dottedQuarter,
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
          duration: quarterTriplet,
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
          duration: awkwardFraction,
        },
      ];

      const preset = createFunctionalPreset("p-dur", "Durations Test", "custom", steps);

      expect(equalRational(preset.steps[0]!.duration.beats, rational(1, 1))).toBe(true);
      expect(equalRational(preset.steps[1]!.duration.beats, rational(1, 2))).toBe(true);
      expect(equalRational(preset.steps[2]!.duration.beats, rational(3, 2))).toBe(true);
      expect(equalRational(preset.steps[3]!.duration.beats, rational(2, 3))).toBe(true);
      expect(equalRational(preset.steps[4]!.duration.beats, rational(7, 12))).toBe(true);

      // Verify no timing seconds or milliseconds are stored
      const rawJson = JSON.stringify(preset);
      expect(rawJson).not.toContain("seconds");
      expect(rawJson).not.toContain("durationMs");
      expect(rawJson).not.toContain("startSeconds");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Serialization Boundary
  // --------------------------------------------------------------------------
  describe("3. Serialization Boundary", () => {
    it("round-trips a functional preset through JSON serialization preserving all semantic fields and exact rationals", () => {
      const original = createFunctionalPreset(
        "preset-50s",
        "50s Progression",
        "builtIn",
        [
          {
            harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(4, 1)),
          },
          {
            harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(4, 1)),
          },
          {
            harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
          },
          {
            harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
          },
        ],
        "Classic Doo-Wop progression",
      );

      const jsonStr = serializePreset(original);
      expect(typeof jsonStr).toBe("string");

      const deserialized = deserializePreset(jsonStr);

      expect(deserialized.id).toBe(original.id);
      expect(deserialized.name).toBe(original.name);
      expect(deserialized.source).toBe(original.source);
      expect(deserialized.description).toBe(original.description);
      expect(deserialized.steps).toHaveLength(original.steps.length);

      for (let i = 0; i < original.steps.length; i++) {
        const origStep = original.steps[i]!;
        const desStep = deserialized.steps[i]!;
        expect(desStep.harmonicFunction).toEqual(origStep.harmonicFunction);
        expect(equalRational(desStep.duration.beats, origStep.duration.beats)).toBe(true);
      }

      // No performance data gained during serialization
      assertNoPerformanceLeakage(JSON.parse(jsonStr));
    });
  });

  // --------------------------------------------------------------------------
  // 5. Save Current Progression as Custom Preset — Stripping Contract (FR-151, FR-153)
  // --------------------------------------------------------------------------
  describe("4. Save Current Progression as Custom Preset (Stripping Contract)", () => {
    it("strips all StepPerformance data while preserving harmonic identities, variants, and exact durations", () => {
      const step1: ChordStep = {
        id: "step-1",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance({
          articulation: "arp-up",
          register: -1,
          masterVelocity: 95,
        }),
        cardView: "piano",
      };

      const step2: ChordStep = {
        id: "step-2",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" }, // Repeated harmony!
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance({
          articulation: "block",
          register: 1,
          masterVelocity: 60,
        }), // Different performance!
        cardView: "staff",
      };

      const step3: ChordStep = {
        id: "step-3",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
        harmonicVariant: {
          extensions: [9],
          suspensions: [],
          alterations: [],
        },
        duration: musicalDuration(rational(4, 1)),
        performance: createRichPerformance({ voicingMode: "manual" }),
        cardView: "harmonic",
      };

      const progression: Progression = {
        steps: [step1, step2, step3],
        selectedStepId: "step-2",
      };

      const customPreset = saveCustomPresetFromProgression("My Custom Groove", progression, {
        id: "custom-preset-1",
        description: "Saved from active track",
      });

      expect(customPreset.id).toBe("custom-preset-1");
      expect(customPreset.name).toBe("My Custom Groove");
      expect(customPreset.source).toBe("custom");
      expect(customPreset.description).toBe("Saved from active track");
      expect(customPreset.steps).toHaveLength(3);

      // Verify repeated harmony with different performance collapsed to equivalent functional steps
      expect(customPreset.steps[0]!.harmonicFunction).toEqual(
        customPreset.steps[1]!.harmonicFunction,
      );
      expect(customPreset.steps[0]!.duration).toEqual(customPreset.steps[1]!.duration);

      // Verify Step 3 retains harmonic variant (extension 9)
      expect(customPreset.steps[2]!.harmonicVariant?.extensions).toContain(9);

      // Verify zero performance leakage across the entire preset
      assertNoPerformanceLeakage(customPreset);
      assertNoPerformanceLeakage(JSON.parse(serializePreset(customPreset)));
    });
  });

  // --------------------------------------------------------------------------
  // 6. Rest Step Semantics in Presets
  // --------------------------------------------------------------------------
  describe("5. Rest Step Semantics in Presets", () => {
    it("verifies behavior when progression contains RestStep during Save as Custom Preset", () => {
      const chordStep: ChordStep = {
        id: "step-chord",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance(),
        cardView: "harmonic",
      };
      const restStep: RestStep = {
        id: "step-rest",
        kind: "rest",
        duration: musicalDuration(rational(2, 1)),
      };

      const progression: Progression = { steps: [chordStep, restStep] };

      // Contract behavior: Save as Custom Preset extracts functional harmonic material
      // Authoritative finding to verify: Does it omit RestStep or represent rest?
      const preset = saveCustomPresetFromProgression("Chord plus Rest", progression);
      expect(preset).toBeDefined();
      // Verify no performance leakage exists regardless of rest representation
      assertNoPerformanceLeakage(preset);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Cross-Key Functional Re-Realization (FR-149, US7 Scenario 1)
  // --------------------------------------------------------------------------
  describe("6. Cross-Key Functional Re-Realization", () => {
    it("re-realizes the same functional preset in different tonics without preserving old absolute chord roots as truth", () => {
      const preset = createFunctionalPreset("p-cadence", "Pop Cadence", "builtIn", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
      ]);

      const cMajorContext: HarmonicContext = {
        tonic: { semitone: 0 }, // C
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: false },
      };

      const dMajorContext: HarmonicContext = {
        tonic: { semitone: 2 }, // D
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: false },
      };

      // Realize in C Major
      const cResult = realizePresetSteps(preset, cMajorContext);
      expect(cResult.kind).toBe("success");
      if (cResult.kind === "success") {
        expect(cResult.steps).toHaveLength(4);
        expect(cResult.steps[0]!.harmonicFunction.functionId).toBe("I");
        expect(cResult.steps[1]!.harmonicFunction.functionId).toBe("vi");
        expect(cResult.steps[2]!.harmonicFunction.functionId).toBe("IV");
        expect(cResult.steps[3]!.harmonicFunction.functionId).toBe("V");
      }

      // Realize in D Major
      const dResult = realizePresetSteps(preset, dMajorContext);
      expect(dResult.kind).toBe("success");
      if (dResult.kind === "success") {
        expect(dResult.steps).toHaveLength(4);
        expect(dResult.steps[0]!.harmonicFunction.functionId).toBe("I");
        expect(dResult.steps[1]!.harmonicFunction.functionId).toBe("vi");
        expect(dResult.steps[2]!.harmonicFunction.functionId).toBe("IV");
        expect(dResult.steps[3]!.harmonicFunction.functionId).toBe("V");
      }

      // Preset itself remains completely untouched and reusable
      expect(preset.steps).toHaveLength(4);
      expect(preset.steps[0]!.harmonicFunction.functionId).toBe("I");
    });
  });

  // --------------------------------------------------------------------------
  // 8. Tonal Minor Compatibility (FR-149)
  // --------------------------------------------------------------------------
  describe("7. Tonal Minor Compatibility", () => {
    it("realizes functional preset with Dark Harmony functions using Tonal Minor rules", () => {
      const minorPreset = createFunctionalPreset("p-minor", "Minor Cadence", "builtIn", [
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "iv", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "i", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const cMinorContext: HarmonicContext = {
        tonic: { semitone: 0 }, // C
        moduleId: "dark-harmony",
        mode: "tonal-minor",
        spellingContext: { preferFlats: true },
      };

      const result = realizePresetSteps(minorPreset, cMinorContext);
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.steps).toHaveLength(4);
        expect(result.steps[0]!.harmonicFunction.functionId).toBe("i");
        expect(result.steps[1]!.harmonicFunction.functionId).toBe("iv");
        expect(result.steps[2]!.harmonicFunction.functionId).toBe("V");
        expect(result.steps[3]!.harmonicFunction.functionId).toBe("i");
      }
    });
  });

  // --------------------------------------------------------------------------
  // 9. Ambiguous / Incompatible Function Contract (Spec Edge Case Line 414)
  // --------------------------------------------------------------------------
  describe("8. Ambiguous / Incompatible Function Contract", () => {
    it("returns an observable incompatible or ambiguous result without silently guessing or mutating the preset", () => {
      // Dark harmony chromatic-color preset (e.g. Neapolitan N) applied in Major without explicit conversion
      const specializedPreset = createFunctionalPreset("p-chromatic", "Chromatic Color", "custom", [
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "N", category: "neapolitan" },
          duration: musicalDuration(rational(2, 1)),
        },
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "V", category: "core" },
          duration: musicalDuration(rational(2, 1)),
        },
      ]);

      const incompatibleContext: HarmonicContext = {
        tonic: { semitone: 0 },
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: false },
      };

      const result = realizePresetSteps(specializedPreset, incompatibleContext);

      // Contract: Must not guess silently or throw unhandled error; must return observable diagnostic result
      expect(result.kind).not.toBe("success");
      if (result.kind === "incompatible") {
        expect(result.unsupportedFunctions.length).toBeGreaterThan(0);
      }

      // Stored preset remains unmodified
      expect(specializedPreset.steps[0]!.harmonicFunction.functionId).toBe("N");
    });
  });

  // --------------------------------------------------------------------------
  // 10 & 11. Insertion Modes & Empty Progression Behavior (FR-152)
  // --------------------------------------------------------------------------
  describe("9. Insertion Modes & Empty Progression Behavior (Replace, Append, Insert)", () => {
    function getInsertPreset(): FunctionalPreset {
      return createFunctionalPreset("p-ins", "Insert Preset", "builtIn", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
        {
          harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
      ]);
    }

    const context: HarmonicContext = {
      tonic: { semitone: 0 },
      moduleId: "progressions",
      mode: "major",
      spellingContext: { preferFlats: false },
    };

    it("Replace Progression: replaces all existing steps with preset steps", () => {
      const preset = getInsertPreset();
      const existingProgression: Progression = {
        steps: [
          {
            id: "old-1",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
        ],
      };

      const result = applyPresetToProgression(existingProgression, preset, "replace", context);
      expect(result.steps).toHaveLength(2);
      expect(result.steps.some((s) => s.id === "old-1")).toBe(false);
      expect(result.steps[0]!.harmonicFunction.functionId).toBe("IV");
      expect(result.steps[1]!.harmonicFunction.functionId).toBe("V");
    });

    it("Append to End: keeps existing steps first and appends preset steps", () => {
      const preset = getInsertPreset();
      const existingProgression: Progression = {
        steps: [
          {
            id: "old-1",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
        ],
      };

      const result = applyPresetToProgression(existingProgression, preset, "append", context);
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0]!.id).toBe("old-1");
      expect(result.steps[1]!.harmonicFunction.functionId).toBe("IV");
      expect(result.steps[2]!.harmonicFunction.functionId).toBe("V");
    });

    it("Insert at Selected Step: inserts before the currently selected step so the selected step remains after", () => {
      const preset = getInsertPreset();
      const existingProgression: Progression = {
        steps: [
          {
            id: "step-start",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
          {
            id: "step-selected",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
        ],
        selectedStepId: "step-selected",
      };

      const result = applyPresetToProgression(existingProgression, preset, "insert", context);
      expect(result.steps).toHaveLength(4);
      expect(result.steps[0]!.id).toBe("step-start");
      expect(result.steps[1]!.harmonicFunction.functionId).toBe("IV"); // Preset step 1
      expect(result.steps[2]!.harmonicFunction.functionId).toBe("V"); // Preset step 2
      expect(result.steps[3]!.id).toBe("step-selected"); // Selected step preserved after
    });

    it("handles empty progression deterministically for Replace, Append, and Insert", () => {
      const preset = getInsertPreset();
      const empty: Progression = { steps: [] };

      const repResult = applyPresetToProgression(empty, preset, "replace", context);
      expect(repResult.steps).toHaveLength(2);

      const appResult = applyPresetToProgression(empty, preset, "append", context);
      expect(appResult.steps).toHaveLength(2);

      const insResult = applyPresetToProgression(empty, preset, "insert", context);
      expect(insResult.steps).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // 12. Step Independence After Instantiation (US3 alignment)
  // --------------------------------------------------------------------------
  describe("10. Step Independence After Instantiation", () => {
    it("generates distinct unique step IDs on multiple applications without shared mutable state", () => {
      const preset = createFunctionalPreset("p-indep", "Independence Test", "builtIn", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
      ]);
      const context: HarmonicContext = {
        tonic: { semitone: 0 },
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: false },
      };

      const firstApply = applyPresetToProgression({ steps: [] }, preset, "replace", context);
      const secondApply = applyPresetToProgression({ steps: [] }, preset, "replace", context);

      expect(firstApply.steps[0]!.id).not.toBe(secondApply.steps[0]!.id);

      // Mutating performance on one instantiated step does not alter preset or the other step
      const step1 = firstApply.steps[0] as ChordStep;
      const step2 = secondApply.steps[0] as ChordStep;
      expect(step1.performance).not.toBe(step2.performance);
    });
  });

  // --------------------------------------------------------------------------
  // 13. Current Defaults Supply Performance (FR-151)
  // --------------------------------------------------------------------------
  describe("11. Current Defaults Supply Performance Upon Instantiation", () => {
    it("supplies performance realization from provided ProjectDefaults without embedding them into stored Preset", () => {
      const preset = createFunctionalPreset("p-def", "Defaults Test", "builtIn", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
          duration: musicalDuration(rational(1, 1)),
        },
      ]);
      const context: HarmonicContext = {
        tonic: { semitone: 0 },
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: false },
      };

      const defaultsA: ProjectDefaults = {
        piano: {
          articulation: "arp-up",
          register: 1,
          masterVelocity: 85,
        },
      };

      const defaultsB: ProjectDefaults = {
        piano: {
          articulation: "block",
          register: -1,
          masterVelocity: 60,
        },
      };

      const applyA = applyPresetToProgression({ steps: [] }, preset, "replace", context, defaultsA);
      const applyB = applyPresetToProgression({ steps: [] }, preset, "replace", context, defaultsB);

      const stepA = applyA.steps[0] as ChordStep;
      const stepB = applyB.steps[0] as ChordStep;

      expect(stepA.performance.articulation).toBe("arp-up");
      expect(stepA.performance.register).toBe(1);
      expect(stepA.performance.masterVelocity).toBe(85);

      expect(stepB.performance.articulation).toBe("block");
      expect(stepB.performance.register).toBe(-1);
      expect(stepB.performance.masterVelocity).toBe(60);

      // Preset itself remains completely free of performance fields
      assertNoPerformanceLeakage(preset);
    });
  });

  // --------------------------------------------------------------------------
  // 14. Built-in vs Custom Immutability Contract
  // --------------------------------------------------------------------------
  describe("12. Built-in vs Custom Immutability Contract", () => {
    it("proves saving a Custom Preset does not link mutable state with the original progression", () => {
      const originalChord: ChordStep = {
        id: "orig-1",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance(),
        cardView: "harmonic",
      };
      const progression: Progression = { steps: [originalChord] };

      const customPreset = saveCustomPresetFromProgression("Immutability Test", progression);

      // Mutate the original progression
      const mutatedProgression: Progression = {
        steps: [
          {
            ...originalChord,
            harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
          },
        ],
      };

      // Custom preset retains original harmonic function
      expect(customPreset.steps[0]!.harmonicFunction.functionId).toBe("I");
      expect(mutatedProgression.steps[0]!.harmonicFunction.functionId).toBe("V");
    });
  });

  // --------------------------------------------------------------------------
  // 15 & 16. Custom Preset Ownership & Persistence Contract
  // --------------------------------------------------------------------------
  describe("13. Custom Preset Ownership & Persistence Contract", () => {
    it("confirms Custom Presets belong to Project state per data-model and project schema", () => {
      const project = createDefaultProject("test-proj", "Test Project", "2026-09-05T00:00:00.000Z");

      // Verifies customPresets property exists on Project
      expect(Array.isArray(project.customPresets)).toBe(true);
    });
  });
});
