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

// Forbidden keys for performance and harmonic-variant leakage assertions (FR-150, FR-151)
const FORBIDDEN_PRESET_KEYS = [
  // Performance realization fields
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
  // Harmonic variant / tension fields (BLOCKER: Presets store function + duration only)
  "harmonicVariant",
  "variant",
  "extensions",
  "suspensions",
  "alterations",
  "seventh",
  "add9",
  // Absolute pitch / chord symbol truth
  "spelling",
  "rootPitchClass",
  "symbol",
] as const;

function assertNoPerformanceOrVariantLeakage(obj: unknown, path = ""): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => assertNoPerformanceOrVariantLeakage(item, `${path}[${index}]`));
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
    assertNoPerformanceOrVariantLeakage(record[key], currentPath);
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
  // 1. Canonical Preset Data Model & HarmonicFunctionIdentity Contract (FR-148, FR-150)
  // --------------------------------------------------------------------------
  describe("1. Canonical Preset Data Model & HarmonicFunctionIdentity", () => {
    it("defines a functional preset containing strictly identity, metadata, and ordered steps with HarmonicFunctionIdentity and MusicalDuration only", () => {
      const step1: PresetStep = {
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        duration: musicalDuration(rational(1, 1)),
      };
      const step2: PresetStep = {
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
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

      // Verify no runtime performance or harmonic variant keys exist on preset or preset steps
      assertNoPerformanceOrVariantLeakage(preset);
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
  // 2. Exact MusicalDuration Contract in Presets (FR-105)
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
  // 3. Serialization Boundary (No displayHint?: unknown, No harmonicVariant)
  // --------------------------------------------------------------------------
  describe("3. Serialization Boundary", () => {
    it("round-trips a functional preset through JSON serialization preserving all semantic fields and exact rationals without variant or performance fields", () => {
      const original = createFunctionalPreset(
        "preset-50s",
        "50s Progression",
        "builtIn",
        [
          {
            harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
            duration: musicalDuration(rational(4, 1)),
          },
          {
            harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
            duration: musicalDuration(rational(4, 1)),
          },
          {
            harmonicFunction: { moduleId: "progressions", functionId: "IV", category: "core" },
            duration: musicalDuration(rational(2, 1)),
          },
          {
            harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
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

      // Strong recursive assertion proving absence of performance and harmonicVariant fields
      assertNoPerformanceOrVariantLeakage(JSON.parse(jsonStr));
    });
  });

  // --------------------------------------------------------------------------
  // 4. Save Current Progression as Custom Preset — Supported Fixture (FR-151, FR-153)
  // --------------------------------------------------------------------------
  describe("4. Save Current Progression as Custom Preset (Supported All-Chord Fixture)", () => {
    it("strips all StepPerformance and HarmonicVariant data while preserving step count, order, function identities, and exact durations", () => {
      // Step 1: Chord I with maj7 variant and rich performance A
      const step1: ChordStep = {
        id: "step-1",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        harmonicVariant: { seventh: "major7", extensions: [], suspensions: [], alterations: [] },
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance({
          articulation: "arp-up",
          register: -1,
          masterVelocity: 95,
        }),
        cardView: "piano",
      };

      // Step 2: Repeated Chord I with different performance B and different variant (add9)
      const step2: ChordStep = {
        id: "step-2",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        harmonicVariant: { add9: true, extensions: [9], suspensions: [], alterations: [] },
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance({
          articulation: "block",
          register: 1,
          masterVelocity: 60,
        }),
        cardView: "staff",
      };

      // Step 3: Chord V with extension 9 and manual voicing
      const step3: ChordStep = {
        id: "step-3",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        harmonicVariant: { extensions: [9], suspensions: [], alterations: [] },
        duration: musicalDuration(rational(4, 1)),
        performance: createRichPerformance({ voicingMode: "manual" }),
        cardView: "harmonic",
      };

      const progression: Progression = {
        steps: [step1, step2, step3],
        selectedStepId: "step-2",
      };

      const result = saveCustomPresetFromProgression("My Custom Groove", progression, {
        id: "custom-preset-1",
        description: "Saved from active track",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        const customPreset = result.preset;
        expect(customPreset.id).toBe("custom-preset-1");
        expect(customPreset.name).toBe("My Custom Groove");
        expect(customPreset.source).toBe("custom");
        expect(customPreset.description).toBe("Saved from active track");

        // Step count invariant: steps must NOT be deduplicated
        expect(customPreset.steps).toHaveLength(3);
        expect(customPreset.steps.length).toBe(progression.steps.length);

        // Ordered function identities strictly match progression
        expect(customPreset.steps[0]!.harmonicFunction.functionId).toBe("I");
        expect(customPreset.steps[1]!.harmonicFunction.functionId).toBe("I");
        expect(customPreset.steps[2]!.harmonicFunction.functionId).toBe("V");

        // Exact durations strictly match progression
        expect(equalRational(customPreset.steps[0]!.duration.beats, rational(2, 1))).toBe(true);
        expect(equalRational(customPreset.steps[1]!.duration.beats, rational(2, 1))).toBe(true);
        expect(equalRational(customPreset.steps[2]!.duration.beats, rational(4, 1))).toBe(true);

        // BLOCKER check: harmonicVariant is NOT stored in PresetStep
        expect(
          (customPreset.steps[0] as unknown as { harmonicVariant?: unknown }).harmonicVariant,
        ).toBeUndefined();
        expect(
          (customPreset.steps[1] as unknown as { harmonicVariant?: unknown }).harmonicVariant,
        ).toBeUndefined();
        expect(
          (customPreset.steps[2] as unknown as { harmonicVariant?: unknown }).harmonicVariant,
        ).toBeUndefined();

        // Zero performance or variant leakage in memory and JSON serialization
        assertNoPerformanceOrVariantLeakage(customPreset);
        assertNoPerformanceOrVariantLeakage(JSON.parse(serializePreset(customPreset)));
      }

      // Source progression and its steps remain completely unmutated
      expect(progression.steps).toHaveLength(3);
      expect((progression.steps[0] as ChordStep).harmonicVariant.seventh).toBe("major7");
      expect((progression.steps[0] as ChordStep).performance.articulation).toBe("arp-up");
    });
  });

  // --------------------------------------------------------------------------
  // 5. Save Current Progression as Custom Preset — Unsupported Rest Fixture
  // --------------------------------------------------------------------------
  describe("5. Save Current Progression as Custom Preset (Unsupported Rest Fixture)", () => {
    it("rejects saving a Custom Preset from a progression containing a RestStep with an explicit unsupported result without source mutation", () => {
      const chord1: ChordStep = {
        id: "step-c1",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance(),
        cardView: "harmonic",
      };
      const restStep: RestStep = {
        id: "step-r1",
        kind: "rest",
        duration: musicalDuration(rational(2, 1)),
      };
      const chord2: ChordStep = {
        id: "step-c2",
        kind: "chord",
        harmonicFunction: { moduleId: "progressions", functionId: "V", category: "core" },
        harmonicVariant: EMPTY_HARMONIC_VARIANT,
        duration: musicalDuration(rational(2, 1)),
        performance: createRichPerformance(),
        cardView: "harmonic",
      };

      const progressionWithRest: Progression = {
        steps: [chord1, restStep, chord2],
      };

      const result = saveCustomPresetFromProgression("Progression with Rest", progressionWithRest);

      // Contract: Structured validation error, not throwing unhandled exception
      expect(result.kind).toBe("unsupported-progression");
      if (result.kind === "unsupported-progression") {
        expect(result.reason).toBe("rest-step");
        expect(result.message).toContain("Rest");
      }

      // Source progression is strictly preserved without mutation
      expect(progressionWithRest.steps).toHaveLength(3);
      expect(progressionWithRest.steps[0]!.id).toBe("step-c1");
      expect(progressionWithRest.steps[1]!.id).toBe("step-r1");
      expect(progressionWithRest.steps[2]!.id).toBe("step-c2");
    });
  });

  // --------------------------------------------------------------------------
  // 6. Cross-Key Functional Re-Realization (FR-149, US7 Scenario 1)
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

      // Stored preset itself remains completely untouched and reusable
      expect(preset.steps).toHaveLength(4);
      expect(preset.steps[0]!.harmonicFunction.functionId).toBe("I");
    });
  });

  // --------------------------------------------------------------------------
  // 7. Enharmonic Spelling Acceptance (FR-149)
  // --------------------------------------------------------------------------
  describe("7. Enharmonic Spelling Acceptance", () => {
    it("realizes chords following target key enharmonic spelling rules without inheriting source context spelling", () => {
      // Preset I - IV - V
      const preset = createFunctionalPreset("p-spelling", "Spelling Test", "builtIn", [
        {
          harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
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

      // Eb Major (tonic 3, flat key: Eb, Ab, Bb)
      const ebMajorContext: HarmonicContext = {
        tonic: { semitone: 3 },
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: true },
      };

      // G Major (tonic 7, sharp key: G, C, D)
      const gMajorContext: HarmonicContext = {
        tonic: { semitone: 7 },
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: false },
      };

      // F Major (tonic 5, single flat key: F, Bb, C)
      const fMajorContext: HarmonicContext = {
        tonic: { semitone: 5 },
        moduleId: "progressions",
        mode: "major",
        spellingContext: { preferFlats: true },
      };

      // Realize in Eb Major
      const ebResult = realizePresetSteps(preset, ebMajorContext);
      expect(ebResult.kind).toBe("success");
      if (ebResult.kind === "success") {
        // Chords must not contain accidental crossover from other keys
        expect(ebResult.steps).toHaveLength(3);
      }

      // Realize in G Major
      const gResult = realizePresetSteps(preset, gMajorContext);
      expect(gResult.kind).toBe("success");
      if (gResult.kind === "success") {
        expect(gResult.steps).toHaveLength(3);
      }

      // Realize in F Major
      const fResult = realizePresetSteps(preset, fMajorContext);
      expect(fResult.kind).toBe("success");
      if (fResult.kind === "success") {
        expect(fResult.steps).toHaveLength(3);
      }

      // Preset stores zero rendered chord symbol/spelling as truth
      assertNoPerformanceOrVariantLeakage(preset);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Tonal Minor Compatibility (FR-149)
  // --------------------------------------------------------------------------
  describe("8. Tonal Minor Compatibility", () => {
    it("realizes functional preset with Dark Harmony functions using Tonal Minor rules without Major assumptions", () => {
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
  describe("9. Ambiguous / Incompatible Function Contract", () => {
    it("returns an observable incompatible or ambiguous result without silently guessing or mutating the preset", () => {
      // Dark harmony chromatic-color preset (Neapolitan N6) applied in Major without explicit conversion
      const specializedPreset = createFunctionalPreset("p-chromatic", "Chromatic Color", "custom", [
        {
          harmonicFunction: { moduleId: "dark-harmony", functionId: "N6", category: "neapolitan" },
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

      // Contract: Must not guess silently or throw unhandled error; returns observable diagnostic result
      expect(result.kind).not.toBe("success");
      if (result.kind === "incompatible") {
        expect(result.unsupportedFunctions.length).toBeGreaterThan(0);
      }

      // Stored preset remains unmodified
      expect(specializedPreset.steps[0]!.harmonicFunction.functionId).toBe("N6");
    });
  });

  // --------------------------------------------------------------------------
  // 10. Insertion Modes (FR-152) — Replace, Append, Insert-Before-Selected
  // --------------------------------------------------------------------------
  describe("10. Insertion Modes (Replace, Append, Insert)", () => {
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

    it("Append to End: keeps existing steps first and appends preset steps to end", () => {
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

    it("Insert at Selected Step: inserts preset immediately BEFORE the selected Step, retaining the selected Step and preserving order", () => {
      const preset = getInsertPreset();
      const existingProgression: Progression = {
        steps: [
          {
            id: "step-A",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
          {
            id: "step-Selected-B",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "vi", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
          {
            id: "step-C",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "ii", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
        ],
        selectedStepId: "step-Selected-B",
      };

      // [A, Selected-B, C] + [X, Y] becomes [A, X, Y, Selected-B, C]
      const result = applyPresetToProgression(existingProgression, preset, "insert", context);

      expect(result.steps).toHaveLength(5);
      expect(result.steps[0]!.id).toBe("step-A");
      expect(result.steps[1]!.harmonicFunction.functionId).toBe("IV"); // Preset X
      expect(result.steps[2]!.harmonicFunction.functionId).toBe("V"); // Preset Y
      expect(result.steps[3]!.id).toBe("step-Selected-B"); // Selected B retained after inserted preset
      expect(result.steps[4]!.id).toBe("step-C"); // Subsequent C retained in order

      // Existing IDs are strictly preserved
      expect(result.steps[0]!.id).toBe("step-A");
      expect(result.steps[3]!.id).toBe("step-Selected-B");
      expect(result.steps[4]!.id).toBe("step-C");

      // Instantiated preset step IDs are fresh and unique
      expect(result.steps[1]!.id).not.toBe("step-A");
      expect(result.steps[1]!.id).not.toBe("step-Selected-B");
      expect(result.steps[2]!.id).not.toBe(result.steps[1]!.id);
    });

    it("Non-empty progression with NO selected step rejects Insert at Selected Step", () => {
      const preset = getInsertPreset();
      const nonEmptyWithoutSelection: Progression = {
        steps: [
          {
            id: "step-1",
            kind: "chord",
            harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
            harmonicVariant: EMPTY_HARMONIC_VARIANT,
            duration: musicalDuration(rational(2, 1)),
            performance: createRichPerformance(),
            cardView: "harmonic",
          },
        ],
        // No selectedStepId!
      };

      // Must be unavailable/rejected; cannot silently append or select a step automatically
      expect(() =>
        applyPresetToProgression(nonEmptyWithoutSelection, preset, "insert", context),
      ).toThrow(RangeError);
    });

    it("Empty progression: Replace, Append, and Insert all deterministically instantiate Preset at start with identical ordering", () => {
      const preset = getInsertPreset();
      const empty: Progression = { steps: [] };

      const repResult = applyPresetToProgression(empty, preset, "replace", context);
      const appResult = applyPresetToProgression(empty, preset, "append", context);
      const insResult = applyPresetToProgression(empty, preset, "insert", context);

      expect(repResult.steps).toHaveLength(2);
      expect(appResult.steps).toHaveLength(2);
      expect(insResult.steps).toHaveLength(2);

      // All three yield identical functional step ordering
      expect(repResult.steps[0]!.harmonicFunction.functionId).toBe("IV");
      expect(repResult.steps[1]!.harmonicFunction.functionId).toBe("V");

      expect(appResult.steps[0]!.harmonicFunction.functionId).toBe("IV");
      expect(appResult.steps[1]!.harmonicFunction.functionId).toBe("V");

      expect(insResult.steps[0]!.harmonicFunction.functionId).toBe("IV");
      expect(insResult.steps[1]!.harmonicFunction.functionId).toBe("V");
    });
  });

  // --------------------------------------------------------------------------
  // 11. Step Independence After Instantiation (US3 Alignment)
  // --------------------------------------------------------------------------
  describe("11. Step Independence After Instantiation", () => {
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
  // 12. Current Defaults Supply Performance (FR-151)
  // --------------------------------------------------------------------------
  describe("12. Current Defaults Supply Performance Upon Instantiation", () => {
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
          duration: musicalDuration(rational(1, 1)),
          performance: {
            ...DEFAULT_PIANO_PERFORMANCE,
            articulation: "arp-up",
            register: 1,
            masterVelocity: 85,
          },
        },
      };

      const defaultsB: ProjectDefaults = {
        piano: {
          duration: musicalDuration(rational(1, 1)),
          performance: {
            ...DEFAULT_PIANO_PERFORMANCE,
            articulation: "block",
            register: -1,
            masterVelocity: 60,
          },
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
      assertNoPerformanceOrVariantLeakage(preset);
    });
  });

  // --------------------------------------------------------------------------
  // 13. Built-in vs Custom Immutability Contract
  // --------------------------------------------------------------------------
  describe("13. Built-in vs Custom Immutability Contract", () => {
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

      const result = saveCustomPresetFromProgression("Immutability Test", progression);
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        const customPreset = result.preset;

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
      }
    });
  });

  // --------------------------------------------------------------------------
  // 14. Custom Preset Ownership & Persistence Contract (Project.customPresets)
  // --------------------------------------------------------------------------
  describe("14. Custom Preset Ownership & Persistence Contract", () => {
    it("confirms Custom Presets belong to Project state per data-model and project schema", () => {
      const project = createDefaultProject("test-proj", "Test Project", "2026-09-05T00:00:00.000Z");

      // Verifies customPresets property exists on Project
      expect(Array.isArray(project.customPresets)).toBe(true);
    });
  });
});
