import { describe, expect, it } from "vitest";
import { exactPitch, type ExactPitch } from "../../../src/domain/harmony/pitch";
import { equalRational, rational } from "../../../src/domain/timing/rational";
import {
  MelodyValidationError,
  realizeChordMelody,
  type ChordMelodyRecipe,
  type MelodyGrid,
  type MelodyPattern,
} from "../../../src/domain/melody/projection";

const PATTERNS: readonly MelodyPattern[] = [
  "up",
  "down",
  "up-down",
  "down-up",
  "outside-in",
  "inside-out",
];

const SOURCE_PITCHES: readonly ExactPitch[] = [
  exactPitch(60, { step: "C", alter: 0 }),
  exactPitch(64, { step: "E", alter: 0 }),
  exactPitch(67, { step: "G", alter: 0 }),
  exactPitch(71, { step: "B", alter: 0 }),
  exactPitch(74, { step: "D", alter: 0 }),
];

function recipe(
  pattern: MelodyPattern,
  grid: MelodyGrid = "quarter",
  octaveOffset: -2 | -1 | 0 | 1 | 2 = 0,
): ChordMelodyRecipe {
  return { pattern, grid, octaveOffset };
}

function midiOrder(
  pattern: MelodyPattern,
  pitches: readonly ExactPitch[],
  expectedCycle: readonly number[],
) {
  const phrase = realizeChordMelody({
    sourceStepId: "step-pattern",
    upperPitches: pitches,
    durationBeats: rational(expectedCycle.length),
    recipe: recipe(pattern),
  });

  return phrase.events.map((event) => event.pitch.midiNumber);
}

describe("T167 — deterministic Chord Step melody projection", () => {
  it("uses literal expected MIDI order for every pattern and source pitch count", () => {
    const cases: readonly {
      readonly name: string;
      readonly pitches: readonly ExactPitch[];
      readonly expected: Readonly<Record<MelodyPattern, readonly number[]>>;
    }[] = [
      {
        name: "three pitches",
        pitches: SOURCE_PITCHES.slice(0, 3),
        expected: {
          up: [60, 64, 67],
          down: [67, 64, 60],
          "up-down": [60, 64, 67, 64],
          "down-up": [67, 64, 60, 64],
          "outside-in": [60, 67, 64],
          "inside-out": [64, 60, 67],
        },
      },
      {
        name: "four pitches",
        pitches: SOURCE_PITCHES.slice(0, 4),
        expected: {
          up: [60, 64, 67, 71],
          down: [71, 67, 64, 60],
          "up-down": [60, 64, 67, 71, 67, 64],
          "down-up": [71, 67, 64, 60, 64, 67],
          "outside-in": [60, 71, 64, 67],
          "inside-out": [64, 67, 60, 71],
        },
      },
      {
        name: "five pitches",
        pitches: SOURCE_PITCHES,
        expected: {
          up: [60, 64, 67, 71, 74],
          down: [74, 71, 67, 64, 60],
          "up-down": [60, 64, 67, 71, 74, 71, 67, 64],
          "down-up": [74, 71, 67, 64, 60, 64, 67, 71],
          "outside-in": [60, 74, 64, 71, 67],
          "inside-out": [67, 64, 71, 60, 74],
        },
      },
    ];

    for (const testCase of cases) {
      for (const pattern of PATTERNS) {
        expect(midiOrder(pattern, testCase.pitches, testCase.expected[pattern])).toEqual(
          testCase.expected[pattern],
        );
      }
    }
  });

  it("sorts by MIDI number, preserves duplicates and octave doublings, and cycles one pitch", () => {
    const unsorted = [
      SOURCE_PITCHES[2]!,
      SOURCE_PITCHES[0]!,
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(72, { step: "C", alter: 0 }),
    ];
    const phrase = realizeChordMelody({
      sourceStepId: "step-duplicates",
      upperPitches: unsorted,
      durationBeats: rational(4),
      recipe: recipe("up"),
    });

    expect(phrase.events.map((event) => event.pitch.midiNumber)).toEqual([60, 60, 67, 72]);

    const singlePitch = realizeChordMelody({
      sourceStepId: "step-single",
      upperPitches: [SOURCE_PITCHES[1]!],
      durationBeats: rational(5, 2),
      recipe: recipe("up", "eighth"),
    });
    expect(singlePitch.events.map((event) => event.pitch.midiNumber)).toEqual([64, 64, 64, 64, 64]);
  });

  it("uses all five exact grid durations", () => {
    const expected: readonly {
      readonly grid: MelodyGrid;
      readonly duration: ReturnType<typeof rational>;
      readonly count: number;
    }[] = [
      { grid: "quarter", duration: rational(1), count: 2 },
      { grid: "eighth", duration: rational(1, 2), count: 4 },
      { grid: "sixteenth", duration: rational(1, 4), count: 8 },
      { grid: "eighth-triplet", duration: rational(1, 3), count: 6 },
      { grid: "sixteenth-triplet", duration: rational(1, 6), count: 12 },
    ];

    for (const testCase of expected) {
      const phrase = realizeChordMelody({
        sourceStepId: "step-grids",
        upperPitches: SOURCE_PITCHES.slice(0, 2),
        durationBeats: rational(2),
        recipe: recipe("up", testCase.grid),
      });

      expect(phrase.events).toHaveLength(testCase.count);
      expect(
        phrase.events.every((event) => equalRational(event.durationBeats, testCase.duration)),
      ).toBe(true);
    }
  });

  it("fits exact durations and truncates the final event with custom Rationals", () => {
    const exact = realizeChordMelody({
      sourceStepId: "step-exact",
      upperPitches: SOURCE_PITCHES.slice(0, 2),
      durationBeats: rational(2),
      recipe: recipe("up", "eighth"),
    });
    expect(exact.events.map((event) => event.sourceStepId)).toEqual([
      "step-exact",
      "step-exact",
      "step-exact",
      "step-exact",
    ]);
    expect(exact.events.map((event) => event.index)).toEqual([0, 1, 2, 3]);
    expect(exact.events.map((event) => event.startOffsetBeats)).toEqual([
      rational(0),
      rational(1, 2),
      rational(1),
      rational(3, 2),
    ]);
    expect(exact.events.map((event) => event.durationBeats)).toEqual([
      rational(1, 2),
      rational(1, 2),
      rational(1, 2),
      rational(1, 2),
    ]);

    const fiveSixths = realizeChordMelody({
      sourceStepId: "step-five-sixths",
      upperPitches: SOURCE_PITCHES.slice(0, 2),
      durationBeats: rational(5, 6),
      recipe: recipe("up", "eighth"),
    });
    expect(fiveSixths.events.map((event) => event.durationBeats)).toEqual([
      rational(1, 2),
      rational(1, 3),
    ]);

    const sevenEighths = realizeChordMelody({
      sourceStepId: "step-seven-eighths",
      upperPitches: SOURCE_PITCHES.slice(0, 2),
      durationBeats: rational(7, 8),
      recipe: recipe("down", "quarter"),
    });
    expect(sevenEighths.events.map((event) => event.durationBeats)).toEqual([rational(7, 8)]);

    const custom = realizeChordMelody({
      sourceStepId: "step-custom-rational",
      upperPitches: SOURCE_PITCHES.slice(0, 2),
      durationBeats: rational(7, 5),
      recipe: recipe("up", "eighth"),
    });
    expect(custom.events.map((event) => event.durationBeats)).toEqual([
      rational(1, 2),
      rational(1, 2),
      rational(2, 5),
    ]);
  });

  it("creates one full-duration event when the duration is shorter than the grid", () => {
    const phrase = realizeChordMelody({
      sourceStepId: "step-short",
      upperPitches: SOURCE_PITCHES.slice(0, 2),
      durationBeats: rational(1, 6),
      recipe: recipe("up", "quarter"),
    });

    expect(phrase.events).toHaveLength(1);
    expect(phrase.events[0]!.startOffsetBeats).toEqual(rational(0));
    expect(phrase.events[0]!.durationBeats).toEqual(rational(1, 6));
  });

  it("applies octave offsets without changing spelling and rejects MIDI overflow", () => {
    const offsetExpectations: readonly {
      readonly offset: -2 | -1 | 0 | 1 | 2;
      readonly midi: number;
      readonly octave: number;
    }[] = [
      { offset: -2, midi: 36, octave: 2 },
      { offset: -1, midi: 48, octave: 3 },
      { offset: 0, midi: 60, octave: 4 },
      { offset: 1, midi: 72, octave: 5 },
      { offset: 2, midi: 84, octave: 6 },
    ];

    for (const testCase of offsetExpectations) {
      const phrase = realizeChordMelody({
        sourceStepId: "step-offset",
        upperPitches: [exactPitch(60, { step: "C", alter: 0 })],
        durationBeats: rational(1),
        recipe: recipe("up", "quarter", testCase.offset),
      });

      expect(phrase.events[0]!.pitch.midiNumber).toBe(testCase.midi);
      expect(phrase.events[0]!.pitch.octave).toBe(testCase.octave);
      expect(phrase.events[0]!.pitch.spelling).toEqual({ step: "C", alter: 0 });
    }

    expect(() =>
      realizeChordMelody({
        sourceStepId: "step-low-overflow",
        upperPitches: [exactPitch(0, { step: "C", alter: 0 })],
        durationBeats: rational(1),
        recipe: recipe("up", "quarter", -1),
      }),
    ).toThrow(MelodyValidationError);

    expect(() =>
      realizeChordMelody({
        sourceStepId: "step-high-overflow",
        upperPitches: [exactPitch(127, { step: "G", alter: 0 })],
        durationBeats: rational(1),
        recipe: recipe("up", "quarter", 1),
      }),
    ).toThrow(MelodyValidationError);
  });

  it("rejects empty pitches and non-positive durations with typed errors", () => {
    expect(() =>
      realizeChordMelody({
        sourceStepId: "step-empty",
        upperPitches: [],
        durationBeats: rational(1),
        recipe: recipe("up"),
      }),
    ).toThrow(MelodyValidationError);

    for (const durationBeats of [rational(0), rational(-1), rational(-1, 2)]) {
      expect(() =>
        realizeChordMelody({
          sourceStepId: "step-invalid-duration",
          upperPitches: SOURCE_PITCHES.slice(0, 2),
          durationBeats,
          recipe: recipe("up"),
        }),
      ).toThrow(MelodyValidationError);
    }
  });

  it("does not mutate inputs and returns a deeply frozen deterministic projection", () => {
    const upperPitches = [SOURCE_PITCHES[2]!, SOURCE_PITCHES[0]!, SOURCE_PITCHES[1]!];
    const originalPitches = upperPitches.slice();
    const melodyRecipe = {
      pattern: "outside-in" as const,
      grid: "eighth-triplet" as const,
      octaveOffset: 1 as const,
    };
    const originalRecipe = { ...melodyRecipe };

    const first = realizeChordMelody({
      sourceStepId: "step-immutable",
      upperPitches,
      durationBeats: rational(7, 3),
      recipe: melodyRecipe,
    });
    const second = realizeChordMelody({
      sourceStepId: "step-immutable",
      upperPitches,
      durationBeats: rational(7, 3),
      recipe: melodyRecipe,
    });

    expect(first).toEqual(second);
    expect(upperPitches).toEqual(originalPitches);
    expect(melodyRecipe).toEqual(originalRecipe);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.events)).toBe(true);
    expect(Object.isFrozen(first.events[0])).toBe(true);
    expect(Object.isFrozen(first.events[0]!.pitch)).toBe(true);
    expect(Object.isFrozen(first.events[0]!.pitch.spelling)).toBe(true);
    expect(Object.isFrozen(first.events[0]!.startOffsetBeats)).toBe(true);
    expect(Object.isFrozen(first.events[0]!.durationBeats)).toBe(true);
  });
});
