import { describe, expect, it } from "vitest";
import { pianoProfile } from "../../../../src/instruments/piano/profile";
import {
  DEFAULT_MUSICAL_DYNAMIC_VELOCITIES,
  PIANO_DYNAMICS_PRESETS,
  type MusicalDynamicLabel,
} from "../../../../src/instruments/contracts";
import {
  applyDynamicsPreset,
  musicalDynamicToVelocity,
  resolveEffectiveNoteVelocity,
  velocityToMusicalDynamic,
} from "../../../../src/instruments/piano/dynamics";
import { assertVelocity, type StepPerformance } from "../../../../src/domain/progression/step";
import { exactPitch, type ExactPitch } from "../../../../src/domain/harmony/pitch";

describe("T079 — Piano articulation, dynamics, and velocity contract", () => {
  it("supports Block, Arp Up, Arp Down, Broken Chord, and Humanized articulations", () => {
    const articulations = pianoProfile.supportedArticulations();
    const ids = articulations.map((a) => a.id);
    const labels = articulations.map((a) => a.label);

    expect(ids).toContain("block");
    expect(ids).toContain("arp-up");
    expect(ids).toContain("arp-down");
    expect(ids).toContain("broken-chord");
    expect(ids).toContain("humanized");

    expect(labels).toContain("Block");
    expect(labels).toContain("Arp Up");
    expect(labels).toContain("Arp Down");
    expect(labels).toContain("Broken Chord");
    expect(labels).toContain("Humanized");
  });

  it("does not include Strum in the Piano profile articulations (FR-141)", () => {
    const articulations = pianoProfile.supportedArticulations();
    const hasStrum = articulations.some(
      (a) => a.id.toLowerCase().includes("strum") || a.label.toLowerCase().includes("strum"),
    );
    expect(hasStrum).toBe(false);
  });

  it("maintains Master Velocity source of truth as exact numeric 1..127 (FR-142)", () => {
    expect(assertVelocity(1)).toBe(1);
    expect(assertVelocity(64)).toBe(64);
    expect(assertVelocity(127)).toBe(127);

    expect(() => assertVelocity(0)).toThrow(RangeError);
    expect(() => assertVelocity(128)).toThrow(RangeError);
    expect(() => assertVelocity(-10)).toThrow(RangeError);
    expect(() => assertVelocity(64.5)).toThrow(RangeError);
  });

  it("maps musical dynamic labels to defaults without destroying a previously entered exact MIDI velocity (FR-143)", () => {
    const labels: readonly MusicalDynamicLabel[] = ["pp", "p", "mp", "mf", "f", "ff"];

    // Default mappings match musical dynamic constants
    expect(musicalDynamicToVelocity("pp")).toBe(DEFAULT_MUSICAL_DYNAMIC_VELOCITIES.pp);
    expect(musicalDynamicToVelocity("p")).toBe(DEFAULT_MUSICAL_DYNAMIC_VELOCITIES.p);
    expect(musicalDynamicToVelocity("mp")).toBe(DEFAULT_MUSICAL_DYNAMIC_VELOCITIES.mp);
    expect(musicalDynamicToVelocity("mf")).toBe(DEFAULT_MUSICAL_DYNAMIC_VELOCITIES.mf);
    expect(musicalDynamicToVelocity("f")).toBe(DEFAULT_MUSICAL_DYNAMIC_VELOCITIES.f);
    expect(musicalDynamicToVelocity("ff")).toBe(DEFAULT_MUSICAL_DYNAMIC_VELOCITIES.ff);

    // Monotonic progression: pp < p < mp < mf < f < ff
    for (let i = 0; i < labels.length - 1; i++) {
      expect(musicalDynamicToVelocity(labels[i]!)).toBeLessThan(
        musicalDynamicToVelocity(labels[i + 1]!),
      );
    }

    const stepPerformance: StepPerformance = {
      articulation: "block",
      register: "auto",
      voicingMode: "auto",
      bass: { choice: "auto", octaveOffset: "auto" },
      masterVelocity: 85, // Exact custom velocity within 'mf' range
      perNoteVelocityOverrides: {},
      dynamicsViewPreference: "midi",
    };

    expect(velocityToMusicalDynamic(stepPerformance.masterVelocity)).toBe("mf");

    // Switching preference to musical view preserves exact 85
    const switchedToMusical: StepPerformance = {
      ...stepPerformance,
      dynamicsViewPreference: "musical",
    };
    expect(switchedToMusical.masterVelocity).toBe(85);

    // Switching back to numeric view preserves 85 intact
    const switchedToMidi: StepPerformance = {
      ...switchedToMusical,
      dynamicsViewPreference: "midi",
    };
    expect(switchedToMidi.masterVelocity).toBe(85);
  });

  it("inherits Master Velocity for notes without per-note velocity overrides (FR-144, FR-145)", () => {
    const masterVelocity = 76;
    const overrides = {
      "60": 110, // C4 override
    };

    expect(resolveEffectiveNoteVelocity(masterVelocity, "60", overrides)).toBe(110);
    expect(resolveEffectiveNoteVelocity(masterVelocity, "64", overrides)).toBe(76);
    expect(resolveEffectiveNoteVelocity(masterVelocity, "67", overrides)).toBe(76);

    expect(resolveEffectiveNoteVelocity(masterVelocity, "60", {})).toBe(76);
    expect(resolveEffectiveNoteVelocity(masterVelocity, "60", undefined)).toBe(76);
  });

  it("supports Balanced, Top Voice Emphasis, Bass Emphasis, Inner Voices Soft, and Humanized Dynamics presets (FR-146)", () => {
    const presetIds = PIANO_DYNAMICS_PRESETS.map((p) => p.id);
    expect(presetIds).toEqual([
      "balanced",
      "top-voice-emphasis",
      "bass-emphasis",
      "inner-voices-soft",
      "humanized-dynamics",
    ]);

    const testPitches: readonly ExactPitch[] = [
      exactPitch(48, { step: "C", alter: 0 }), // C3 (lowest)
      exactPitch(55, { step: "G", alter: 0 }), // G3 (inner)
      exactPitch(60, { step: "C", alter: 0 }), // C4 (inner)
      exactPitch(64, { step: "E", alter: 0 }), // E4 (highest)
    ];

    const masterVel = 80;

    // 1. Balanced: represents no note-level dynamic deviation; returns empty overrides
    const balancedOverrides = applyDynamicsPreset("balanced", testPitches, masterVel);
    expect(balancedOverrides).toEqual({});

    // Effective note velocity for all notes comes directly from Master Velocity
    for (const pitch of testPitches) {
      const noteKey = String(pitch.midiNumber);
      expect(resolveEffectiveNoteVelocity(masterVel, noteKey, balancedOverrides)).toBe(masterVel);
    }

    // Changing Master Velocity dynamically updates effective note velocity without touching overrides
    const updatedMasterVel = 95;
    for (const pitch of testPitches) {
      const noteKey = String(pitch.midiNumber);
      expect(resolveEffectiveNoteVelocity(updatedMasterVel, noteKey, balancedOverrides)).toBe(
        updatedMasterVel,
      );
    }

    // 2. Top Voice Emphasis
    const topOverrides = applyDynamicsPreset("top-voice-emphasis", testPitches, masterVel);
    expect(topOverrides["64"]).toBeGreaterThan(topOverrides["48"]!);
    expect(topOverrides["64"]).toBeGreaterThan(topOverrides["55"]!);
    expect(topOverrides["64"]).toBeGreaterThan(topOverrides["60"]!);

    // 3. Bass Emphasis
    const bassOverrides = applyDynamicsPreset("bass-emphasis", testPitches, masterVel);
    expect(bassOverrides["48"]).toBeGreaterThan(bassOverrides["55"]!);
    expect(bassOverrides["48"]).toBeGreaterThan(bassOverrides["60"]!);
    expect(bassOverrides["48"]).toBeGreaterThan(bassOverrides["64"]!);

    // 4. Inner Voices Soft
    const innerSoftOverrides = applyDynamicsPreset("inner-voices-soft", testPitches, masterVel);
    expect(innerSoftOverrides["48"]).toBeGreaterThan(innerSoftOverrides["55"]!);
    expect(innerSoftOverrides["64"]).toBeGreaterThan(innerSoftOverrides["60"]!);
  });

  it("ensures humanization dynamics are bounded and testable with an injected deterministic source", () => {
    const testPitches: readonly ExactPitch[] = [
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ];

    const masterVel = 80;
    const sequence = [0.2, 0.8, 0.5];
    let seqIdx = 0;
    const deterministicRandom = (): number => {
      const val = sequence[seqIdx % sequence.length]!;
      seqIdx++;
      return val;
    };

    const firstRun = applyDynamicsPreset("humanized-dynamics", testPitches, masterVel, {
      randomSource: deterministicRandom,
    });

    seqIdx = 0;
    const secondRun = applyDynamicsPreset("humanized-dynamics", testPitches, masterVel, {
      randomSource: deterministicRandom,
    });

    expect(firstRun).toEqual(secondRun);

    for (const vel of Object.values(firstRun)) {
      expect(vel).toBeGreaterThanOrEqual(1);
      expect(vel).toBeLessThanOrEqual(127);
      expect(Math.abs(vel - masterVel)).toBeLessThanOrEqual(10);
    }
  });

  it("targets Bass Emphasis specifically to the independent bass without confusing lowest upper voice", () => {
    const upperPitches: readonly ExactPitch[] = [
      exactPitch(60, { step: "C", alter: 0 }), // lowest upper voice
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ];
    const independentBass: ExactPitch = exactPitch(36, { step: "C", alter: 0 }); // C2 (MIDI 36)
    const masterVel = 80;

    const overrides = applyDynamicsPreset(
      "bass-emphasis",
      upperPitches,
      masterVel,
      undefined,
      independentBass,
    );

    // Independent bass receives the elevated velocity
    expect(overrides["36"]).toBe(95); // 80 + 15
    // Lowest upper voice is NOT given the bass emphasis
    expect(overrides["60"]).toBe(75); // 80 - 5
    expect(overrides["64"]).toBe(75);
    expect(overrides["67"]).toBe(75);

    expect(overrides["36"]).toBeGreaterThan(overrides["60"]!);
  });

  it("ensures humanized-dynamics is deterministic even without an injected source", () => {
    const testPitches = [
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ];
    const run1 = applyDynamicsPreset("humanized-dynamics", testPitches, 80);
    const run2 = applyDynamicsPreset("humanized-dynamics", testPitches, 80);
    expect(run1).toEqual(run2);
  });
});
