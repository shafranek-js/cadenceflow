import { describe, expect, it } from "vitest";
import {
  decodePortableProject,
  encodePortableProject,
  InvalidPortableProjectError,
} from "../../../src/persistence/portableProject";
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  UnsupportedProjectVersionError,
} from "../../../src/domain/project/migrations";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { compareRational, rational } from "../../../src/domain/timing/rational";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";

describe("T119 — Portable Project (.cadenceflow) Contract", () => {
  describe("1. Canonical Semantic Round-Trip", () => {
    it("preserves complete semantic Project state across serialization and deserialization", () => {
      const original = createRichProjectFixture();
      const serialized = encodePortableProject(original);

      expect(typeof serialized).toBe("string");
      const restored = decodePortableProject(serialized);

      // Identity & schema
      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.schemaVersion).toBe(original.schemaVersion);
      expect(restored.createdAt).toBe(original.createdAt);
      expect(restored.updatedAt).toBe(original.updatedAt);

      // Harmonic Context
      expect(restored.activeModule).toBe(original.activeModule);
      expect(restored.tonic).toBe(original.tonic);

      // Timing & Groove
      expect(restored.globalTiming.tempoBpm).toBe(original.globalTiming.tempoBpm);
      expect(restored.globalTiming.meter.numerator).toBe(original.globalTiming.meter.numerator);
      expect(restored.globalTiming.meter.denominator).toBe(original.globalTiming.meter.denominator);
      expect(restored.globalTiming.meter.grouping).toEqual(original.globalTiming.meter.grouping);
      expect(restored.groove.feel).toBe(original.groove.feel);
      expect(restored.groove.swingAmount).toBe(original.groove.swingAmount);

      // Presentation & Defaults
      expect(restored.presentation).toEqual(original.presentation);
      expect(restored.defaults).toEqual(original.defaults);

      // Matrix/Card overrides
      expect(restored.moduleTemplateStates).toEqual(original.moduleTemplateStates);

      // Progression Steps & exact ordering
      expect(restored.progression.steps.length).toBe(original.progression.steps.length);
      expect(restored.progression.selectedStepId).toBe(original.progression.selectedStepId);
      expect(restored.progression.loopRegion).toEqual(original.progression.loopRegion);

      // Step 1: Normal chord step
      const s1 = restored.progression.steps[0] as ChordStep;
      expect(s1.kind).toBe("chord");
      expect(s1.id).toBe("step-1");
      expect(s1.harmonicFunction.functionId).toBe("I");
      expect(compareRational(s1.duration.beats, rational(4, 1))).toBe(0);

      // Step 2: Repeated function + manual voicing + bass + per-note velocities
      const s2 = restored.progression.steps[1] as ChordStep;
      expect(s2.kind).toBe("chord");
      expect(s2.id).toBe("step-2");
      expect(s2.harmonicFunction.functionId).toBe("I");
      expect(compareRational(s2.duration.beats, rational(3, 2))).toBe(0);
      expect(s2.performance.voicingMode).toBe("manual");
      expect(s2.performance.manualVoicing).toHaveLength(4);
      expect(s2.performance.manualVoicing?.[0].midiNumber).toBe(60);
      expect(s2.performance.manualVoicing?.[3].midiNumber).toBe(72);
      expect(s2.performance.bass.choice).toBe("custom");
      expect(s2.performance.bass.octaveOffset).toBe(-1);
      expect(s2.performance.bass.customPitch?.midiNumber).toBe(36);
      expect(s2.performance.masterVelocity).toBe(95);
      expect(s2.performance.perNoteVelocityOverrides).toEqual({ "60": 110, "72": 85 });
      expect(s2.performance.articulation).toBe("broken-chord");
      expect(s2.cardView).toBe("piano");

      // Step 3: Rest step with fractional duration 2/3
      const s3 = restored.progression.steps[2] as RestStep;
      expect(s3.kind).toBe("rest");
      expect(s3.id).toBe("step-3");
      expect(compareRational(s3.duration.beats, rational(2, 3))).toBe(0);

      // Step 4: Chord step with 1/3 duration and staff view
      const s4 = restored.progression.steps[3] as ChordStep;
      expect(s4.kind).toBe("chord");
      expect(s4.id).toBe("step-4");
      expect(compareRational(s4.duration.beats, rational(1, 3))).toBe(0);
      expect(s4.cardView).toBe("staff");

      // Step 5: Chord step with 7/2 duration
      const s5 = restored.progression.steps[4] as ChordStep;
      expect(s5.kind).toBe("chord");
      expect(s5.id).toBe("step-5");
      expect(compareRational(s5.duration.beats, rational(7, 2))).toBe(0);

      // Active Temporary Branch
      expect(restored.temporaryBranch).toBeDefined();
      expect(restored.temporaryBranch?.id).toBe("branch-active-whatif-01");
      expect(restored.temporaryBranch?.originStepId).toBe("step-2");
      expect(restored.temporaryBranch?.originAtEnd).toBe(false);
      expect(restored.temporaryBranch?.rejoinStepId).toBe("step-4");
      expect(restored.temporaryBranch?.compositionIntent).toBe("surprise");
      expect(restored.temporaryBranch?.steps).toHaveLength(2);

      // Custom Presets
      expect(restored.customPresets).toHaveLength(1);
      const cp = restored.customPresets[0];
      expect(cp.id).toBe("custom-preset-us8-rich");
      expect(cp.source).toBe("custom");
      expect(cp.steps).toHaveLength(2);
      expect(compareRational(cp.steps[0].duration.beats, rational(4, 1))).toBe(0);
    });

    it("defaults legacy portable projects to a hidden Staff bass", () => {
      const serialized = JSON.parse(encodePortableProject(createRichProjectFixture())) as Record<
        string,
        unknown
      >;
      const presentation = serialized["presentation"] as Record<string, unknown>;
      delete presentation["showBassInStaff"];

      const restored = decodePortableProject(JSON.stringify(serialized));
      expect(restored.presentation.showBassInStaff).toBe(false);
    });
  });

  describe("2. JSON-Safe Rational Representation", () => {
    it("stores exact Rational arithmetic without float approximation", () => {
      const original = createRichProjectFixture();
      const jsonText = encodePortableProject(original);
      const parsed = JSON.parse(jsonText);

      // Verify JSON contains plain { numerator, denominator } objects for beats
      const step2Beats = parsed.progression.steps[1].duration.beats;
      expect(step2Beats).toEqual({ numerator: 3, denominator: 2 });

      const step3Beats = parsed.progression.steps[2].duration.beats;
      expect(step3Beats).toEqual({ numerator: 2, denominator: 3 });

      const step4Beats = parsed.progression.steps[3].duration.beats;
      expect(step4Beats).toEqual({ numerator: 1, denominator: 3 });

      const step5Beats = parsed.progression.steps[4].duration.beats;
      expect(step5Beats).toEqual({ numerator: 7, denominator: 2 });
    });

    it("rejects non-plain objects, Map, Set, functions, or BigInt in portable JSON payload", () => {
      const original = createRichProjectFixture();
      const jsonText = encodePortableProject(original);

      // Must be purely valid JSON
      expect(() => JSON.parse(jsonText)).not.toThrow();

      // No BigInt serialization syntax
      expect(jsonText).not.toMatch(/\d+n\b/);
      expect(jsonText).not.toContain("[object Map]");
      expect(jsonText).not.toContain("[object Set]");
      expect(jsonText).not.toContain("[object Function]");
    });
  });

  describe("2a. Legacy inherited performance defaults", () => {
    it("upgrades a saved Block default to Humanized without changing step overrides", () => {
      const raw = JSON.parse(encodePortableProject(createRichProjectFixture())) as {
        defaults: { piano: { performance: { articulation: string } } };
      };
      raw.defaults.piano.performance.articulation = "block";

      const restored = decodePortableProject(JSON.stringify(raw));

      expect(restored.defaults.piano.performance.articulation).toBe("humanized");
      expect((restored.progression.steps[1] as ChordStep).performance.articulation).toBe(
        "broken-chord",
      );
    });
  });

  describe("3. Strict Exclusion of Session Undo/Redo History", () => {
    it("contains zero session Undo/Redo or command history fields", () => {
      const original = createRichProjectFixture();
      const jsonText = encodePortableProject(original);
      const parsed = JSON.parse(jsonText);

      // Recursive key checker for forbidden history keys
      const forbiddenKeys = [
        "history",
        "undoStack",
        "redoStack",
        "commands",
        "undoCommands",
        "redoCommands",
        "cursor",
        "depth",
        "sessionHistory",
      ];

      function checkNoForbiddenKeys(obj: unknown, path = ""): void {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => checkNoForbiddenKeys(item, `${path}[${index}]`));
          return;
        }
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          expect(
            forbiddenKeys,
            `Portable file must not contain history key '${key}' at ${path}.${key}`,
          ).not.toContain(key);
          checkNoForbiddenKeys(value, `${path}.${key}`);
        }
      }

      checkNoForbiddenKeys(parsed);
    });
  });

  describe("4. Strict Exclusion of Audio and Transport Runtime State", () => {
    it("excludes all ephemeral audio and transport playback runtime state", () => {
      const original = createRichProjectFixture();
      const jsonText = encodePortableProject(original);
      const parsed = JSON.parse(jsonText);

      const forbiddenRuntimeKeys = [
        "audioContext",
        "audioBuffer",
        "sampleCache",
        "decodedSamples",
        "audioProvider",
        "providerReadiness",
        "scheduledEvents",
        "timerHandles",
        "audioClock",
        "playing",
        "paused",
        "currentStepIndex",
        "countInActive",
      ];

      function checkNoRuntimeKeys(obj: unknown, path = ""): void {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => checkNoRuntimeKeys(item, `${path}[${index}]`));
          return;
        }
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          expect(
            forbiddenRuntimeKeys,
            `Portable file must not contain runtime key '${key}' at ${path}.${key}`,
          ).not.toContain(key);
          checkNoRuntimeKeys(value, `${path}.${key}`);
        }
      }

      checkNoRuntimeKeys(parsed);
    });
  });

  describe("5. Active Temporary Branch Preservation", () => {
    it("preserves active temporary branch as temporary without committing or discarding", () => {
      const original = createRichProjectFixture();
      expect(original.temporaryBranch).toBeDefined();

      const jsonText = encodePortableProject(original);
      const restored = decodePortableProject(jsonText);

      expect(restored.temporaryBranch).toBeDefined();
      expect(restored.temporaryBranch?.id).toBe(original.temporaryBranch?.id);
      expect(restored.temporaryBranch?.originStepId).toBe(original.temporaryBranch?.originStepId);
      expect(restored.temporaryBranch?.originAtEnd).toBe(false);
      expect(restored.temporaryBranch?.rejoinStepId).toBe(original.temporaryBranch?.rejoinStepId);
      expect(restored.temporaryBranch?.compositionIntent).toBe("surprise");
      expect(restored.temporaryBranch?.steps).toHaveLength(2);

      // Main progression still has original steps and is NOT mutated by branch steps
      expect(restored.progression.steps).toHaveLength(5);
    });
  });

  describe("6. Custom Presets Boundary", () => {
    it("round-trips custom presets storing functional identities and durations only", () => {
      const original = createRichProjectFixture();
      const jsonText = encodePortableProject(original);
      const restored = decodePortableProject(jsonText);

      expect(restored.customPresets).toHaveLength(1);
      const preset = restored.customPresets[0];
      expect(preset.id).toBe("custom-preset-us8-rich");
      expect(preset.name).toBe("Custom I-vi-IV");
      expect(preset.source).toBe("custom");
      expect(preset.steps).toHaveLength(2);

      // Ensure no performance or variant data leaked into custom preset steps
      for (const step of preset.steps) {
        expect(step).toHaveProperty("harmonicFunction");
        expect(step).toHaveProperty("duration");
        expect(step).not.toHaveProperty("performance");
        expect(step).not.toHaveProperty("harmonicVariant");
      }
    });
  });

  describe("7. Matrix and Card Customization Overrides", () => {
    it("round-trips Project-owned matrix card template customizations", () => {
      const original = createRichProjectFixture();
      const jsonText = encodePortableProject(original);
      const restored = decodePortableProject(jsonText);

      const card = restored.moduleTemplateStates.progressions.cards["I"];
      expect(card).toBeDefined();
      expect(card.harmonicFunctionId).toBe("I");
      expect(card.cardViewOverride).toBe("piano");
      expect(card.explicitOverrides.performance?.articulation).toBe("broken-chord");
      expect(compareRational(card.explicitOverrides.duration!.beats, rational(2, 1))).toBe(0);
    });
  });

  describe("8. Schema Version & Migration Contract", () => {
    it("accepts currently supported schemaVersion 2", () => {
      const original = createRichProjectFixture();
      expect(original.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);

      const jsonText = encodePortableProject(original);
      const restored = decodePortableProject(jsonText);
      expect(restored.schemaVersion).toBe(2);
    });

    it("rejects unsupported future schemaVersion explicitly with UnsupportedProjectVersionError", () => {
      const original = createRichProjectFixture();
      const rawObj = JSON.parse(encodePortableProject(original));
      rawObj.schemaVersion = 99; // Future version

      const futureJson = JSON.stringify(rawObj);

      expect(() => decodePortableProject(futureJson)).toThrow(UnsupportedProjectVersionError);
    });

    it("distinguishes future version rejection from malformed JSON syntax errors", () => {
      const original = createRichProjectFixture();
      const rawObj = JSON.parse(encodePortableProject(original));
      rawObj.schemaVersion = 3; // Future version

      expect(() => decodePortableProject(JSON.stringify(rawObj))).toThrow(
        UnsupportedProjectVersionError,
      );
      expect(() => decodePortableProject("not valid json {{{")).toThrow(
        InvalidPortableProjectError,
      );
    });
  });

  describe("9. Invalid JSON & Schema Validation Contract", () => {
    it("rejects syntactically invalid JSON", () => {
      expect(() => decodePortableProject("{ malformed json }")).toThrow(
        InvalidPortableProjectError,
      );
    });

    it("rejects JSON primitives and arrays instead of Project object", () => {
      expect(() => decodePortableProject("123")).toThrow(InvalidPortableProjectError);
      expect(() => decodePortableProject('"a string"')).toThrow(InvalidPortableProjectError);
      expect(() => decodePortableProject("true")).toThrow(InvalidPortableProjectError);
      expect(() => decodePortableProject("null")).toThrow(InvalidPortableProjectError);
      expect(() => decodePortableProject("[]")).toThrow(InvalidPortableProjectError);
    });

    it("rejects projects missing required identity fields", () => {
      const original = createRichProjectFixture();
      const rawObj = JSON.parse(encodePortableProject(original));

      delete rawObj.id;
      expect(() => decodePortableProject(JSON.stringify(rawObj))).toThrow(
        InvalidPortableProjectError,
      );

      const rawObj2 = JSON.parse(encodePortableProject(original));
      delete rawObj2.name;
      expect(() => decodePortableProject(JSON.stringify(rawObj2))).toThrow(
        InvalidPortableProjectError,
      );
    });

    it("rejects invalid Rational denominator 0", () => {
      const original = createRichProjectFixture();
      const rawObj = JSON.parse(encodePortableProject(original));
      rawObj.progression.steps[0].duration.beats.denominator = 0;

      expect(() => decodePortableProject(JSON.stringify(rawObj))).toThrow(
        InvalidPortableProjectError,
      );
    });

    it("rejects invalid step kinds", () => {
      const original = createRichProjectFixture();
      const rawObj = JSON.parse(encodePortableProject(original));
      rawObj.progression.steps[0].kind = "unknown-kind";

      expect(() => decodePortableProject(JSON.stringify(rawObj))).toThrow(
        InvalidPortableProjectError,
      );
    });

    it("rejects unknown top-level additional properties per additionalProperties: false schema policy", () => {
      const original = createRichProjectFixture();
      const rawObj = JSON.parse(encodePortableProject(original));
      rawObj.unexpectedTopLevelProperty = "illegal-field";

      expect(() => decodePortableProject(JSON.stringify(rawObj))).toThrow(
        InvalidPortableProjectError,
      );
    });
  });

  describe("10. Deterministic Serialization", () => {
    it("produces deterministic serialization without mutating source project", () => {
      const original = createRichProjectFixture();
      const originalCopy = JSON.parse(JSON.stringify(original));

      const run1 = encodePortableProject(original);
      const run2 = encodePortableProject(original);

      expect(run1).toBe(run2);
      expect(original).toEqual(originalCopy);
    });
  });
});
