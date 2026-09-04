import { describe, expect, it } from "vitest";
import { realizeChord as realizeHarmonyChord } from "../../../../src/domain/harmony/realization";
import { pianoProfile } from "../../../../src/instruments/piano/profile";
import { PIANO_RANGE_MIN_MIDI, PIANO_RANGE_MAX_MIDI } from "../../../../src/instruments/contracts";
import { exactPitch, type ExactPitch } from "../../../../src/domain/harmony/pitch";
import type { HarmonicContext } from "../../../../src/domain/harmony/modules/types";
import type {
  StepPerformance,
  RegisterOffset,
  BassChoice,
  BassOctaveOffset,
} from "../../../../src/domain/progression/step";

const C_MAJOR_CONTEXT: HarmonicContext = Object.freeze({
  tonic: 0,
  mode: "major",
  activeModuleId: "progressions",
});

function createDefaultPerformance(overrides?: Partial<StepPerformance>): StepPerformance {
  return Object.freeze({
    articulation: "block",
    register: "auto",
    voicingMode: "auto",
    bass: Object.freeze({
      choice: "auto",
      octaveOffset: "auto",
    }),
    masterVelocity: 80,
    perNoteVelocityOverrides: Object.freeze({}),
    dynamicsViewPreference: "musical",
    ...overrides,
  });
}

describe("T078 — Piano manual voicing, bass, register, and range contract", () => {
  it("round-trips manual exact pitches and octaves unchanged", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0);
    const manualPitches: readonly ExactPitch[] = Object.freeze([
      exactPitch(48, { step: "C", alter: 0 }), // C3
      exactPitch(64, { step: "E", alter: 0 }), // E4
      exactPitch(67, { step: "G", alter: 0 }), // G4
      exactPitch(72, { step: "C", alter: 0 }), // C5
    ]);

    const performance = createDefaultPerformance({
      voicingMode: "manual",
      manualVoicing: manualPitches,
    });

    const realization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance,
    });

    // Realization must preserve exact pitches, octaves, and ordering without recalculation
    expect(realization.pitches).toHaveLength(manualPitches.length);
    expect(realization.pitches.map((p) => p.midiNumber)).toEqual([48, 64, 67, 72]);
    expect(realization.pitches.map((p) => p.octave)).toEqual([3, 4, 4, 5]);
    expect(realization.pitches.map((p) => p.spelling.step)).toEqual(["C", "E", "G", "C"]);
  });

  it("keeps manual pitches strictly step-local without cross-step mutation", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0);

    const manualPitchesStep1: readonly ExactPitch[] = Object.freeze([
      exactPitch(52, { step: "E", alter: 0 }),
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ]);

    const perfStep1 = createDefaultPerformance({
      voicingMode: "manual",
      manualVoicing: manualPitchesStep1,
    });

    const perfStep2 = createDefaultPerformance({
      voicingMode: "auto",
    });

    const realization1 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: perfStep1,
    });

    const realization2 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: perfStep2,
    });

    // Step 2 auto-voicing must not be polluted by step 1's manual voicing
    expect(realization1.pitches.map((p) => p.midiNumber)).toEqual([52, 60, 67]);
    expect(realization2.pitches.map((p) => p.midiNumber)).not.toEqual(
      realization1.pitches.map((p) => p.midiNumber),
    );
  });

  it("does not shift manual exact pitches by a step register preference", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0);
    const manualPitches: readonly ExactPitch[] = Object.freeze([
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ]);

    // Step has manual voicing AND explicit register offset (+1)
    const performanceWithRegister = createDefaultPerformance({
      voicingMode: "manual",
      manualVoicing: manualPitches,
      register: 1,
    });

    const realization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: performanceWithRegister,
    });

    // Manual exact pitches MUST NOT be implicitly shifted by register offset
    expect(realization.pitches.map((p) => p.midiNumber)).toEqual([60, 64, 67]);

    // Negative register offset (-2) also must not alter manual pitches
    const perfNegativeRegister = createDefaultPerformance({
      voicingMode: "manual",
      manualVoicing: manualPitches,
      register: -2,
    });
    const realizationNeg = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: perfNegativeRegister,
    });
    expect(realizationNeg.pitches.map((p) => p.midiNumber)).toEqual([60, 64, 67]);
  });

  it("keeps bass realization independent from upper voicing", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0);

    const perfWithRootBass = createDefaultPerformance({
      bass: { choice: "root", octaveOffset: "auto" },
    });

    const perfWithThirdBass = createDefaultPerformance({
      bass: { choice: "third", octaveOffset: "auto" },
    });

    const realizationRoot = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: perfWithRootBass,
    });

    const realizationThird = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: perfWithThirdBass,
    });

    expect(realizationRoot.pitches.length).toBeGreaterThan(0);
    // Upper voicings remain identical
    expect(realizationRoot.pitches.map((p) => p.midiNumber)).toEqual(
      realizationThird.pitches.map((p) => p.midiNumber),
    );

    // Bass notes are distinct
    expect(realizationRoot.bassPitch).toBeDefined();
    expect(realizationThird.bassPitch).toBeDefined();
    expect(realizationRoot.bassPitch!.midiNumber % 12).toBe(0); // C
    expect(realizationThird.bassPitch!.midiNumber % 12).toBe(4); // E
    expect(realizationRoot.bassPitch!.midiNumber).not.toBe(realizationThird.bassPitch!.midiNumber);
  });

  it("distinguishes Auto bass from explicit Root bass as separate contract concepts", () => {
    const autoPerf = createDefaultPerformance({ bass: { choice: "auto", octaveOffset: "auto" } });
    const rootPerf = createDefaultPerformance({ bass: { choice: "root", octaveOffset: "auto" } });

    // Distinct choices in performance configuration
    expect(autoPerf.bass.choice).toBe("auto");
    expect(rootPerf.bass.choice).toBe("root");
    expect(autoPerf.bass.choice).not.toBe(rootPerf.bass.choice);

    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0);

    // Root bass MUST resolve strictly to the chord's root pitch class
    const rootRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: rootPerf,
    });
    expect(rootRealization.bassPitch).toBeDefined();
    expect(rootRealization.bassPitch!.pitchClassIdentity).toBe(chord.rootPitchClass);

    // Auto bass contract permits contextual bass engine (T084) to choose inversion or root
    const autoRealization = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: autoPerf,
    });
    expect(autoRealization.bassPitch).toBeDefined();
  });

  it("supports Auto / Root / 3rd / 5th / Custom bass semantics", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0); // C Major: C, E, G

    const autoBass = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ bass: { choice: "auto", octaveOffset: "auto" } }),
    }).bassPitch;

    const rootBass = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ bass: { choice: "root", octaveOffset: "auto" } }),
    }).bassPitch;

    const thirdBass = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ bass: { choice: "third", octaveOffset: "auto" } }),
    }).bassPitch;

    const fifthBass = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ bass: { choice: "fifth", octaveOffset: "auto" } }),
    }).bassPitch;

    const customPitch = exactPitch(42, { step: "F", alter: 1 }); // F#2
    const customBass = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({
        bass: { choice: "custom", octaveOffset: "auto", customPitch },
      }),
    }).bassPitch;

    expect(autoBass).toBeDefined();
    expect(rootBass?.midiNumber % 12).toBe(0); // C
    expect(thirdBass?.midiNumber % 12).toBe(4); // E
    expect(fifthBass?.midiNumber % 12).toBe(7); // G
    expect(customBass?.midiNumber).toBe(42); // F#
    expect(customBass?.spelling.step).toBe("F");
    expect(customBass?.spelling.alter).toBe(1);
  });

  it("keeps bass octave offset (Auto / -1 / -2) independent from upper register", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "V" }, 0); // G Major

    const bassAuto = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({
        register: 0,
        bass: { choice: "root", octaveOffset: "auto" },
      }),
    });

    const bassDown1 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({
        register: 0,
        bass: { choice: "root", octaveOffset: -1 },
      }),
    });

    const bassDown2 = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({
        register: 0,
        bass: { choice: "root", octaveOffset: -2 },
      }),
    });

    expect(bassAuto.pitches.length).toBeGreaterThan(0);

    // Upper pitches are unaffected by bass octave changes
    expect(bassDown1.pitches.map((p) => p.midiNumber)).toEqual(
      bassAuto.pitches.map((p) => p.midiNumber),
    );
    expect(bassDown2.pitches.map((p) => p.midiNumber)).toEqual(
      bassAuto.pitches.map((p) => p.midiNumber),
    );

    // Bass pitches are transposed by -12 and -24 semitones
    expect(bassDown1.bassPitch!.midiNumber).toBe(bassAuto.bassPitch!.midiNumber - 12);
    expect(bassDown2.bassPitch!.midiNumber).toBe(bassAuto.bassPitch!.midiNumber - 24);

    // Conversely, changing upper register offset does not move bass pitch
    const upperShifted = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({
        register: 1,
        bass: { choice: "root", octaveOffset: "auto" },
      }),
    });
    expect(upperShifted.bassPitch!.midiNumber).toBe(bassAuto.bassPitch!.midiNumber);
    expect(upperShifted.pitches[0]!.midiNumber).toBe(bassAuto.pitches[0]!.midiNumber + 12);
  });

  it("shifts realization with register offset (Auto / -2 / -1 / 0 / +1 / +2) without changing harmony", () => {
    const chord = realizeHarmonyChord({ moduleId: "progressions", functionId: "IV" }, 0); // F Major

    const offsets: readonly RegisterOffset[] = [-2, -1, 0, 1, 2];
    const basePitches = pianoProfile.realizeChord({
      context: C_MAJOR_CONTEXT,
      chord,
      performance: createDefaultPerformance({ register: 0 }),
    }).pitches;

    expect(basePitches.length).toBeGreaterThan(0);

    for (const offset of offsets) {
      const realization = pianoProfile.realizeChord({
        context: C_MAJOR_CONTEXT,
        chord,
        performance: createDefaultPerformance({ register: offset }),
      });

      expect(realization.pitches).toHaveLength(basePitches.length);

      const numericOffset = typeof offset === "number" ? offset : 0;
      for (let i = 0; i < basePitches.length; i++) {
        expect(realization.pitches[i]!.midiNumber).toBe(
          basePitches[i]!.midiNumber + numericOffset * 12,
        );
        expect(realization.pitches[i]!.pitchClassIdentity).toBe(basePitches[i]!.pitchClassIdentity);
      }
    }
  });

  it("returns validation errors for out-of-range/invalid manual pitches without silent mutation", () => {
    // Empty array validation
    const emptyResult = pianoProfile.validateManualVoicing([]);
    expect(emptyResult.valid).toBe(false);
    expect(emptyResult.messages.length).toBeGreaterThan(0);

    // Valid pitches within 21..108
    const validVoicing = [
      exactPitch(48, { step: "C", alter: 0 }), // C3
      exactPitch(60, { step: "C", alter: 0 }), // C4
      exactPitch(84, { step: "C", alter: 0 }), // C6
    ];
    const validResult = pianoProfile.validateManualVoicing(validVoicing);
    expect(validResult.valid).toBe(true);
    expect(validResult.messages).toHaveLength(0);

    // Pitch below A0 (MIDI 20)
    const tooLowVoicing = [exactPitch(20, { step: "G", alter: 1 })];
    const tooLowResult = pianoProfile.validateManualVoicing(tooLowVoicing);
    expect(tooLowResult.valid).toBe(false);
    expect(tooLowResult.messages[0]).toContain("outside piano range");

    // Pitch above C8 (MIDI 109)
    const tooHighVoicing = [exactPitch(109, { step: "C", alter: 1 })];
    const tooHighResult = pianoProfile.validateManualVoicing(tooHighVoicing);
    expect(tooHighResult.valid).toBe(false);
    expect(tooHighResult.messages[0]).toContain("outside piano range");
  });

  it("ensures produced auto-voicing and bass realizations never produce pitches outside acoustic-piano range (21..108)", () => {
    const chords = [
      realizeHarmonyChord({ moduleId: "progressions", functionId: "I" }, 0),
      realizeHarmonyChord({ moduleId: "progressions", functionId: "vii°" }, 0),
      realizeHarmonyChord({ moduleId: "progressions", functionId: "V" }, 0),
    ];

    const extremeRegisters: readonly RegisterOffset[] = [-2, -1, 0, 1, 2, "auto"];
    const bassChoices: readonly BassChoice[] = ["auto", "root", "third", "fifth"];
    const bassOctaves: readonly BassOctaveOffset[] = ["auto", -1, -2];

    for (const chord of chords) {
      for (const register of extremeRegisters) {
        for (const choice of bassChoices) {
          for (const octaveOffset of bassOctaves) {
            const realization = pianoProfile.realizeChord({
              context: C_MAJOR_CONTEXT,
              chord,
              performance: createDefaultPerformance({
                register,
                bass: { choice, octaveOffset },
              }),
            });

            expect(realization.pitches.length).toBeGreaterThan(0);

            // All realized upper voices must be within 21..108
            for (const pitch of realization.pitches) {
              expect(pitch.midiNumber).toBeGreaterThanOrEqual(PIANO_RANGE_MIN_MIDI);
              expect(pitch.midiNumber).toBeLessThanOrEqual(PIANO_RANGE_MAX_MIDI);
            }

            // Realized bass pitch (if present) must be within 21..108
            if (realization.bassPitch) {
              expect(realization.bassPitch.midiNumber).toBeGreaterThanOrEqual(PIANO_RANGE_MIN_MIDI);
              expect(realization.bassPitch.midiNumber).toBeLessThanOrEqual(PIANO_RANGE_MAX_MIDI);
            }
          }
        }
      }
    }
  });
});
