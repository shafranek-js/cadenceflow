import { beforeAll, describe, expect, it } from "vitest";
import { realizeChord as realizeHarmonyChord } from "../../src/domain/harmony/realization";
import { pianoProfile } from "../../src/instruments/piano/profile";
import { exactPitch, type ExactPitch } from "../../src/domain/harmony/pitch";
import { projectPitchesToStaff } from "../../src/notation/staffProjection";
import { realizeStepAudioEvents } from "../../src/audio/eventRealizer";
import { HqSamplePianoProvider } from "../../src/audio/hq-sample-piano/provider";
import { mapVelocityToLayer } from "../../src/audio/hq-sample-piano/velocityLayers";
import {
  applyDynamicsPreset,
  resolveEffectiveNoteVelocity,
} from "../../src/instruments/piano/dynamics";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import type { ChordStep, StepPerformance } from "../../src/domain/progression/step";
import type { HarmonicContext } from "../../src/domain/harmony/modules/types";
import { EMPTY_HARMONIC_VARIANT } from "../../src/domain/harmony/chord";
import type { HqPianoManifest } from "../../src/audio/hq-sample-piano/manifest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const C_MAJOR_CONTEXT: HarmonicContext = Object.freeze({
  tonic: 0,
  mode: "major",
  activeModuleId: "progressions",
});

const C_MINOR_DARK_CONTEXT: HarmonicContext = Object.freeze({
  tonic: 0,
  mode: "minor",
  activeModuleId: "dark-harmony",
});

function createStep(overrides: Partial<ChordStep> = {}): ChordStep {
  const defaultPerformance: StepPerformance = Object.freeze({
    articulation: "block",
    register: "auto",
    voicingMode: "auto",
    bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
    masterVelocity: 80,
    perNoteVelocityOverrides: Object.freeze({}),
    dynamicsViewPreference: "musical",
  });

  return Object.freeze({
    id: "step-consistency-1",
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId: "I" }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(4, 4), "whole"),
    cardView: "piano",
    performance: defaultPerformance,
    ...overrides,
  });
}

describe("T095 — Canonical projection consistency integration test", () => {
  let provider: HqSamplePianoProvider;

  beforeAll(async () => {
    const manifestPath = resolve("public/audio/piano-hq/manifest.json");
    const manifestData = JSON.parse(readFileSync(manifestPath, "utf-8")) as HqPianoManifest;
    provider = new HqSamplePianoProvider({
      manifestData,
    });
    await provider.prepare();
  });

  // Helper verifying 7-point consistency for a given step
  function verifyStepProjections(
    step: ChordStep,
    tonic: number,
    context: HarmonicContext,
    previousPitches?: readonly ExactPitch[],
    previousBassPitch?: ExactPitch,
  ) {
    // 1. Stored / Piano profile canonical realization
    const harmonyChord = realizeHarmonyChord(step.harmonicFunction, tonic);
    const chord = { ...harmonyChord, variant: step.harmonicVariant };
    const realization = pianoProfile.realizeChord({
      context,
      chord,
      performance: step.performance,
      ...(previousPitches ? { previousPitches } : {}),
      ...(previousBassPitch ? { previousBassPitch } : {}),
    });

    const canonicalUpperPitches = realization.pitches;
    const canonicalBassPitch = realization.bassPitch;
    const allPitches = canonicalBassPitch
      ? [canonicalBassPitch, ...canonicalUpperPitches]
      : canonicalUpperPitches;

    // 2. Piano View Projection: chord tones only; independent bass is audio-only.
    const pianoViewMidi = canonicalUpperPitches.map((p) => p.midiNumber);

    // 3. Staff View Projection
    const staffProjection = projectPitchesToStaff(allPitches);
    const staffViewMidi = staffProjection.notes.map((n) => n.midiNumber);

    // 4. eventRealizer canonical AudioNoteEvents
    const realizedStep = realizeStepAudioEvents({
      step,
      tonic,
      context,
      tempoBpm: 120,
      ...(previousPitches ? { previousPitches } : {}),
      ...(previousBassPitch ? { previousBassPitch } : {}),
    });

    const audioEventPitches = realizedStep.events.map((e) => e.pitch);

    // 5. HQ Provider requested MIDI pitches & velocities
    const hqRequestedPitches: number[] = [];
    const hqResolvedLayers: number[] = [];

    for (const evt of realizedStep.events) {
      const mapping = provider.inspectEventMapping(evt.pitch, evt.velocity);
      hqRequestedPitches.push(mapping.midiPitch);
      hqResolvedLayers.push(mapping.velocityLayer);

      // Verify exact velocity pipeline
      const noteKey = String(evt.pitch);
      const expectedVelocity = resolveEffectiveNoteVelocity(
        step.performance.masterVelocity,
        noteKey,
        step.performance.perNoteVelocityOverrides,
      );

      // Assert Step effective velocity == AudioNoteEvent.velocity == HQ input velocity
      expect(evt.velocity).toBe(expectedVelocity);
      expect(mapping.midiPitch).toBe(evt.pitch);

      // Assert HQ provider selects the authoritative manifest velocity region layer
      const expectedLayer = mapVelocityToLayer(evt.velocity);
      expect(mapping.velocityLayer).toBe(expectedLayer);
    }

    // Exact Pitch Identity Assertions across the projection layers. Piano is intentionally
    // upper-only, while Staff/audio/HQ retain the complete realization including bass.
    const canonicalMidiNumbers = allPitches.map((p) => p.midiNumber);
    expect(pianoViewMidi).toEqual(canonicalUpperPitches.map((p) => p.midiNumber));
    expect(staffViewMidi).toEqual(canonicalMidiNumbers);
    expect(audioEventPitches).toEqual(canonicalMidiNumbers);
    expect(hqRequestedPitches).toEqual(canonicalMidiNumbers);

    return {
      realization,
      staffProjection,
      realizedStep,
    };
  }

  // --- Fixture A: Automatic Major Voicing ---
  it("A. Automatic Major voicing preserves exact MIDI pitches across all projections", () => {
    const stepI = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "I" }, // C Major
    });
    const realizationI = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: realizeHarmonyChord(stepI.harmonicFunction, 0),
      performance: stepI.performance,
    });

    // Step IV with auto voice leading from Step I
    const stepIV = createStep({
      id: "step-iv",
      harmonicFunction: { moduleId: "progressions", functionId: "IV" }, // F Major
    });

    const result = verifyStepProjections(
      stepIV,
      0,
      C_MAJOR_CONTEXT,
      realizationI.pitches,
      realizationI.bassPitch,
    );

    // Check voice leading: common tone C (MIDI 60) should be retained
    const upperMidi = result.realization.pitches.map((p) => p.midiNumber);
    expect(upperMidi).toContain(60); // Common tone C
    expect(result.realizedStep.events.length).toBeGreaterThanOrEqual(4); // Upper voices + bass
  });

  // --- Fixture B: Manual Exact Voicing ---
  it("B. Manual exact voicing round-trips exact MIDI pitches, octaves, and ignores register offset", () => {
    // Non-trivial 4-note open voicing: C3 (48), G3 (55), E4 (64), B4 (71)
    const manualPitches: readonly ExactPitch[] = Object.freeze([
      exactPitch(48, { step: "C", alter: 0 }),
      exactPitch(55, { step: "G", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(71, { step: "B", alter: 0 }),
    ]);

    const manualStep = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "I" },
      performance: {
        articulation: "block",
        register: 1, // +1 register offset MUST be ignored for manual exact voicing
        voicingMode: "manual",
        manualVoicing: manualPitches,
        bass: { choice: "auto", octaveOffset: "auto" },
        masterVelocity: 85,
        perNoteVelocityOverrides: {},
        dynamicsViewPreference: "midi",
      },
    });

    const result = verifyStepProjections(manualStep, 0, C_MAJOR_CONTEXT);

    // Stored manual exact pitches survive completely unchanged
    expect(result.realization.pitches.map((p) => p.midiNumber)).toEqual([48, 55, 64, 71]);
    expect(result.realization.pitches.map((p) => p.octave)).toEqual([3, 3, 4, 4]);

    // Staff projection preserves both MIDI and correct notation spelling
    expect(result.staffProjection.notes.map((n) => `${n.step}${n.octave}`)).toEqual([
      "C3",
      "C3",
      "G3",
      "E4",
      "B4",
    ]); // Includes auto bass C3 + upper 4
  });

  // --- Fixture C: Independent Bass ---
  it("C. Independent bass is distinct from upper voices with channelRole='bass' leaving upper set unchanged", () => {
    // C Major chord with Custom bass F#2 (MIDI 42)
    const customBassPitch = exactPitch(42, { step: "F", alter: 1 });
    const stepWithCustomBass = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "I" },
      performance: {
        articulation: "block",
        register: "auto",
        voicingMode: "auto",
        bass: { choice: "custom", octaveOffset: "auto", customPitch: customBassPitch },
        masterVelocity: 80,
        perNoteVelocityOverrides: {},
        dynamicsViewPreference: "musical",
      },
    });

    // Step with root bass for comparison
    const stepWithRootBass = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "I" },
      performance: {
        articulation: "block",
        register: "auto",
        voicingMode: "auto",
        bass: { choice: "root", octaveOffset: "auto" },
        masterVelocity: 80,
        perNoteVelocityOverrides: {},
        dynamicsViewPreference: "musical",
      },
    });

    const customResult = verifyStepProjections(stepWithCustomBass, 0, C_MAJOR_CONTEXT);
    const rootResult = verifyStepProjections(stepWithRootBass, 0, C_MAJOR_CONTEXT);

    // 1. Piano realization sees bass separately
    expect(customResult.realization.bassPitch?.midiNumber).toBe(42);
    expect(customResult.realization.bassPitch?.spelling.step).toBe("F");
    expect(customResult.realization.bassPitch?.spelling.alter).toBe(1);

    // 2. Audio event has channelRole = 'bass'
    const bassAudioEvent = customResult.realizedStep.events.find((e) => e.channelRole === "bass");
    expect(bassAudioEvent).toBeDefined();
    expect(bassAudioEvent?.pitch).toBe(42);

    const upperAudioEvents = customResult.realizedStep.events.filter(
      (e) => e.channelRole === "upper",
    );
    expect(upperAudioEvents.length).toBe(customResult.realization.pitches.length);

    // 3. Upper voice set is completely unchanged by bass selection
    expect(customResult.realization.pitches.map((p) => p.midiNumber)).toEqual(
      rootResult.realization.pitches.map((p) => p.midiNumber),
    );
  });

  // --- Fixture D: Per-note Velocities ---
  it("D. Per-note velocities project exact effective values to AudioNoteEvent and HQ provider", () => {
    // C Major chord with Master Velocity 78, note 64 overridden to 110, note 60 inheriting
    const step = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "I" },
      performance: {
        articulation: "block",
        register: 0,
        voicingMode: "auto",
        bass: { choice: "root", octaveOffset: "auto" },
        masterVelocity: 78, // mf -> Layer 10
        perNoteVelocityOverrides: {
          "64": 110, // Override E4 to ff -> Layer 14
        },
        dynamicsViewPreference: "midi",
      },
    });

    const result = verifyStepProjections(step, 0, C_MAJOR_CONTEXT);

    const event64 = result.realizedStep.events.find((e) => e.pitch === 64);
    const eventOther = result.realizedStep.events.find(
      (e) => e.pitch !== 64 && e.channelRole === "upper",
    );

    expect(event64).toBeDefined();
    expect(event64?.velocity).toBe(110);

    expect(eventOther).toBeDefined();
    expect(eventOther?.velocity).toBe(78);

    // Check HQ layer resolution
    const mapping64 = provider.inspectEventMapping(64, 110);
    const mappingOther = provider.inspectEventMapping(eventOther!.pitch, 78);

    expect(mapping64.velocityLayer).toBe(14); // Layer 14 (105..112)
    expect(mappingOther.velocityLayer).toBe(10); // Layer 10 (73..80)
  });

  // --- Fixture E: Dynamics Preset ---
  it("E. Dynamics preset projects identical velocity profiles through eventRealizer and HQ provider", () => {
    const baseStep = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "I" },
      performance: {
        articulation: "block",
        register: 0,
        voicingMode: "auto",
        bass: { choice: "root", octaveOffset: "auto" },
        masterVelocity: 80,
        perNoteVelocityOverrides: {},
        dynamicsViewPreference: "musical",
      },
    });

    const initRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord: realizeHarmonyChord(baseStep.harmonicFunction, 0),
      performance: baseStep.performance,
    });

    // Apply "top-voice-emphasis" preset: boost highest pitch by +15, lower others by -5
    const overrides = applyDynamicsPreset(
      "top-voice-emphasis",
      initRealization.pitches,
      baseStep.performance.masterVelocity,
      undefined,
      initRealization.bassPitch,
    );

    const presetPerf: StepPerformance = {
      ...baseStep.performance,
      perNoteVelocityOverrides: overrides,
    };

    const presetStep = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "I" },
      performance: presetPerf,
    });

    const result = verifyStepProjections(presetStep, 0, C_MAJOR_CONTEXT);

    // Verify melody note received boost
    const highestPitch = Math.max(...initRealization.pitches.map((p) => p.midiNumber));
    const melodyEvent = result.realizedStep.events.find((e) => e.pitch === highestPitch);
    expect(melodyEvent?.velocity).toBe(95); // 80 + 15 = 95 -> Layer 12 (89..96)

    const mapping = provider.inspectEventMapping(melodyEvent!.pitch, melodyEvent!.velocity);
    expect(mapping.velocityLayer).toBe(12);
  });

  // --- Fixture F: HarmonicVariant (7th/9th) ---
  it("F. HarmonicVariant (e.g. 7th) retains all chord tones without loss in Piano, Staff, or audio", () => {
    const stepV7 = createStep({
      harmonicFunction: { moduleId: "progressions", functionId: "V" }, // G7 in C Major
      harmonicVariant: {
        ...EMPTY_HARMONIC_VARIANT,
        seventh: "minor7",
      },
    });

    const result = verifyStepProjections(stepV7, 0, C_MAJOR_CONTEXT);

    // G7 upper tones: G, B, D, F -> 4 upper pitches
    expect(result.realization.pitches.length).toBeGreaterThanOrEqual(4);
    const pitches = result.realization.pitches.map((p) => p.midiNumber % 12);

    // All 4 pitch classes of G7 (7, 11, 2, 5) must be present
    expect(pitches).toContain(7); // G
    expect(pitches).toContain(11); // B
    expect(pitches).toContain(2); // D
    expect(pitches).toContain(5); // F

    // Audio events must match exactly
    const eventPitchClasses = result.realizedStep.events.map((e) => e.pitch % 12);
    expect(eventPitchClasses).toContain(7);
    expect(eventPitchClasses).toContain(11);
    expect(eventPitchClasses).toContain(2);
    expect(eventPitchClasses).toContain(5);
  });

  // --- Fixture G: Dark Harmony / Tonal Minor ---
  it("G. Dark Harmony / Tonal Minor preserves consistency without hardcoding Major", () => {
    const stepDim = createStep({
      harmonicFunction: { moduleId: "dark-harmony", functionId: "vii°7/V" }, // F#°7 in C Minor
    });

    const result = verifyStepProjections(stepDim, 0, C_MINOR_DARK_CONTEXT);

    // Root is F# (MIDI 6 or 42/54/66)
    expect(result.realizedStep.events.length).toBeGreaterThanOrEqual(4);
    const bass = result.realizedStep.events.find((e) => e.channelRole === "bass");
    expect(bass).toBeDefined();

    // Verify staff notation spelling reflects correct accidental
    const staffNote = result.staffProjection.notes.find((n) => n.midiNumber === bass?.pitch);
    expect(staffNote?.step).toBe("F");
    expect(staffNote?.alter).toBe(1); // F#
  });

  // --- Fixture H: Chromatic Sample-Root Interpolation ---
  it("H. Chromatic sample-root interpolation never alters canonical musical pitch identity", () => {
    // Note C#4 (MIDI 61) is not a native Salamander root sample (roots are C4=60, D#4=63)
    const requestedPitch = 61;
    const requestedVelocity = 78;

    const mapping = provider.inspectEventMapping(requestedPitch, requestedVelocity);

    // Canonical musical pitch identity remains strictly C# (61)
    expect(mapping.midiPitch).toBe(61);

    // Selected sample root is C4 (MIDI 60)
    expect(mapping.sampleRoot).toBe(60);

    // Playback rate transposes by +1 semitone: 2 ** (1/12) ≈ 1.059463
    const expectedPlaybackRate = Math.pow(2, (61 - 60) / 12);
    expect(mapping.playbackRate).toBeCloseTo(expectedPlaybackRate, 4);

    // Velocity layer maps to Layer 10 (73..80)
    expect(mapping.velocityLayer).toBe(10);
    expect(mapping.assetPath).toBe("samples/C4v10.ogg");
  });
});
