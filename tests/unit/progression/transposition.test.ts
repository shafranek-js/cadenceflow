import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { realizeChord } from "../../../src/domain/harmony/realization";
import { createDefaultProject } from "../../../src/domain/project/factory";
import {
  assertStepTranspositionSemitones,
  pitchToConcertFrame,
  pitchToSourceFrame,
  realizeProgressionStepChord,
  transposeChordDefinition,
  transposeExactPitch,
} from "../../../src/domain/progression/transposition";

const now = "2026-10-03T10:00:00.000Z";

describe("Step-local transposition", () => {
  it("accumulates exact semitones and rejects invalid offsets", () => {
    const source = exactPitch(60, { step: "C", alter: 0 });
    expect(transposeExactPitch(source, 2)).toMatchObject({
      midiNumber: 62,
      spelling: { step: "D", alter: 0 },
    });
    expect(transposeExactPitch(transposeExactPitch(source, 2), -5).midiNumber).toBe(57);
    expect(transposeExactPitch(source, 0)).toBe(source);
    expect(() => assertStepTranspositionSemitones(1.5)).toThrow(RangeError);
    expect(() => assertStepTranspositionSemitones(128)).toThrow(RangeError);
  });

  it("round-trips concert MIDI 0 and 127 through offsets without clamping", () => {
    const project = createDefaultProject("boundary", "Boundary", now);
    const lowStep = Object.freeze({
      ...createMatrixChordStep(project, "I", "low"),
      transpositionSemitones: 12,
    });
    const highStep = Object.freeze({
      ...createMatrixChordStep(project, "I", "high"),
      transpositionSemitones: -12,
    });
    const lowSource = pitchToSourceFrame(exactPitch(0, { step: "C", alter: 0 }), lowStep);
    const highSource = pitchToSourceFrame(exactPitch(127, { step: "G", alter: 0 }), highStep);

    expect(lowSource).toMatchObject({ midiNumber: 0, transpositionCompensationSemitones: -12 });
    expect(highSource).toMatchObject({ midiNumber: 127, transpositionCompensationSemitones: 12 });
    expect(pitchToConcertFrame(lowSource, lowStep)).toMatchObject({ midiNumber: 0 });
    expect(pitchToConcertFrame(highSource, highStep)).toMatchObject({ midiNumber: 127 });
  });

  it("transposes roots, slash basses, and manual enharmonic overrides", () => {
    const project = createDefaultProject("chord", "Chord", now);
    const identity = createMatrixChordStep(project, "I", "source").harmonicFunction;
    const source = realizeChord(identity, project.tonic);
    const overridden = Object.freeze({
      ...source,
      bassPitchClass: 9,
      spelling: Object.freeze({
        ...source.spelling,
        manualEnharmonicOverrides: Object.freeze({ "upper:64": { step: "F" as const, alter: -1 } }),
      }),
    });

    const shifted = transposeChordDefinition(overridden, 2);
    expect(shifted.rootPitchClass).toBe((source.rootPitchClass + 2) % 12);
    expect(shifted.bassPitchClass).toBe(11);
    expect(shifted.spelling.manualEnharmonicOverrides?.["upper:64"]).toEqual({
      step: "F",
      alter: 1,
    });
    const step = Object.freeze({
      ...createMatrixChordStep(project, "I", "shifted"),
      transpositionSemitones: 2,
    });
    expect(realizeProgressionStepChord(step, project.tonic).rootPitchClass).toBe(
      (source.rootPitchClass + 2) % 12,
    );
  });
});
