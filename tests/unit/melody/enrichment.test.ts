import { describe, expect, it } from "vitest";
import { exactPitch, type ExactPitch } from "../../../src/domain/harmony/pitch";
import { rational } from "../../../src/domain/timing/rational";
import { realizeChordMelody } from "../../../src/domain/melody/projection";
import {
  validateChordMelodyRecipe,
  type ChordMelodyRecipe,
  type MelodyPitchMotion,
} from "../../../src/domain/melody/types";

const PITCHES: readonly ExactPitch[] = Object.freeze<readonly ExactPitch[]>([
  exactPitch(60, { step: "C", alter: 0 }),
  exactPitch(64, { step: "E", alter: 0 }),
  exactPitch(67, { step: "G", alter: 0 }),
  exactPitch(71, { step: "B", alter: 0 }),
  exactPitch(74, { step: "D", alter: 0 }),
]);

const BASE_RECIPE: ChordMelodyRecipe = Object.freeze<ChordMelodyRecipe>({
  pitchMotion: "up",
  rhythm: "even",
  connection: "retrigger",
  grid: "quarter",
  octaveOffset: 0,
});

function phraseFor(
  pitchMotion: MelodyPitchMotion,
  count: number,
  patch: Partial<ChordMelodyRecipe> = {},
) {
  const recipe = { ...BASE_RECIPE, ...patch, pitchMotion };
  return realizeChordMelody({
    sourceStepId: `motion-${pitchMotion}-${count}`,
    upperPitches: PITCHES.slice(0, count),
    durationBeats: rational(expectedCycleLength(pitchMotion, count)),
    recipe,
  });
}

function expectedCycleLength(pitchMotion: MelodyPitchMotion, count: number): number {
  if (count === 1 || pitchMotion === "repeat-root" || pitchMotion === "repeat-top") return 1;
  if (pitchMotion === "alternate-root-up" || pitchMotion === "alternate-top-down") {
    return count * 2 - 2;
  }
  return {
    up: count,
    down: count,
    "up-down": count * 2 - 2,
    "down-up": count * 2 - 2,
    "outside-in": count,
    "inside-out": count,
  }[pitchMotion];
}

describe("T186 Batch A — independent Melody recipe axes", () => {
  it.each([
    ["up", [60, 64, 67, 71, 74]],
    ["down", [74, 71, 67, 64, 60]],
    ["up-down", [60, 64, 67, 71, 74, 71, 67, 64]],
    ["down-up", [74, 71, 67, 64, 60, 64, 67, 71]],
    ["outside-in", [60, 74, 64, 71, 67]],
    ["inside-out", [67, 64, 71, 60, 74]],
    ["repeat-root", [60]],
    ["repeat-top", [74]],
    ["alternate-root-up", [60, 64, 60, 67, 60, 71, 60, 74]],
    ["alternate-top-down", [74, 71, 74, 67, 74, 64, 74, 60]],
  ] as const)("orders %s deterministically for five-note voicings", (motion, expected) => {
    expect(phraseFor(motion, 5).events.map((event) => event.pitch.midiNumber)).toEqual(expected);
  });

  it.each([1, 3, 4, 5] as const)("covers all pitch motions for %s-note voicings", (count) => {
    const motions: readonly MelodyPitchMotion[] = [
      "up",
      "down",
      "up-down",
      "down-up",
      "outside-in",
      "inside-out",
      "repeat-root",
      "repeat-top",
      "alternate-root-up",
      "alternate-top-down",
    ];
    for (const pitchMotion of motions) {
      const phrase = phraseFor(pitchMotion, count);
      expect(phrase.events.length).toBeGreaterThan(0);
      expect(phrase.events.at(-1)?.startOffsetBeats).toBeDefined();
    }
  });

  it.each([
    ["even", [rational(1), rational(1), rational(1), rational(1)]],
    ["dotted", [rational(3), rational(1)]],
    ["reverse-dotted", [rational(1), rational(3)]],
    ["tresillo", [rational(3), rational(3), rational(2)]],
  ] as const)("uses exact %s rhythm weights from the selected Grid", (rhythm, durations) => {
    const phrase = realizeChordMelody({
      sourceStepId: `rhythm-${rhythm}`,
      upperPitches: PITCHES.slice(0, 4),
      durationBeats: rational(durations.reduce((total, value) => total + value.numerator, 0)),
      recipe: { ...BASE_RECIPE, rhythm },
    });
    expect(phrase.events.map((event) => event.durationBeats)).toEqual(durations);
  });

  it("repeats rhythm cycles, clips only the final event, and handles short Steps", () => {
    const repeated = realizeChordMelody({
      sourceStepId: "rhythm-cycle",
      upperPitches: PITCHES.slice(0, 3),
      durationBeats: rational(5),
      recipe: { ...BASE_RECIPE, rhythm: "tresillo", grid: "eighth" },
    });
    expect(repeated.events.map((event) => event.durationBeats)).toEqual([
      rational(3, 2),
      rational(3, 2),
      rational(1),
      rational(1),
    ]);

    const clipped = realizeChordMelody({
      sourceStepId: "rhythm-clipped",
      upperPitches: PITCHES.slice(0, 2),
      durationBeats: rational(7, 2),
      recipe: { ...BASE_RECIPE, rhythm: "dotted" },
    });
    expect(clipped.events.map((event) => event.durationBeats)).toEqual([
      rational(3),
      rational(1, 2),
    ]);

    const short = realizeChordMelody({
      sourceStepId: "rhythm-short",
      upperPitches: PITCHES.slice(0, 2),
      durationBeats: rational(1, 4),
      recipe: { ...BASE_RECIPE, rhythm: "tresillo" },
    });
    expect(short.events).toHaveLength(1);
    expect(short.events[0]?.durationBeats).toEqual(rational(1, 4));
  });

  it("merges only adjacent equal-pitch attacks for tie-repeated", () => {
    const repeated = realizeChordMelody({
      sourceStepId: "connection-repeat",
      upperPitches: [PITCHES[0]!],
      durationBeats: rational(5, 2),
      recipe: { ...BASE_RECIPE, connection: "tie-repeated", grid: "quarter" },
    });
    expect(repeated.events).toHaveLength(1);
    expect(repeated.events[0]?.durationBeats).toEqual(rational(5, 2));

    const different = realizeChordMelody({
      sourceStepId: "connection-different",
      upperPitches: PITCHES.slice(0, 2),
      durationBeats: rational(3),
      recipe: { ...BASE_RECIPE, connection: "tie-repeated", grid: "quarter" },
    });
    expect(different.events.map((event) => event.pitch.midiNumber)).toEqual([60, 64, 60]);
    expect(different.events).toHaveLength(3);
  });

  it("maps legacy recipes to even retrigger semantics and round-trips new axes", () => {
    expect(
      validateChordMelodyRecipe({
        pitchMotion: "outside-in",
        grid: "eighth",
        octaveOffset: 1,
        rhythm: "even",
        connection: "retrigger",
      }),
    ).toEqual({
      pitchMotion: "outside-in",
      rhythm: "even",
      connection: "retrigger",
      grid: "eighth",
      octaveOffset: 1,
    });

    const recipe = {
      pitchMotion: "alternate-root-up" as const,
      rhythm: "tresillo" as const,
      connection: "tie-repeated" as const,
      grid: "sixteenth" as const,
      octaveOffset: -1 as const,
    };
    expect(validateChordMelodyRecipe(recipe)).toEqual(recipe);
    expect(() => validateChordMelodyRecipe({ ...recipe, rhythm: "random" })).toThrow();
    // An unknown motion is rejected...
    expect(() => validateChordMelodyRecipe({ ...recipe, pitchMotion: "not-a-motion" })).toThrow();
    // ...but a motion that is merely *unsupported by the legacy shape* is still a valid canonical
    // one. `alternate-root-up` is canonical-only, and `up` is valid in both, so neither is an
    // error here: the combined `pattern` + `pitchMotion` object is what the validator rejects,
    // because it matches neither the canonical nor the legacy key set.
    expect(validateChordMelodyRecipe({ ...recipe, pitchMotion: "up" })).toEqual({
      ...recipe,
      pitchMotion: "up",
    });
    expect(() => validateChordMelodyRecipe({ ...recipe, pattern: "up" })).toThrow();
    // The legacy shape is still accepted and resolves to the canonical axes. Only the six original
    // motions belong to that shape — `repeat-root` and the alternates are canonical-only — so the
    // legacy form is exercised with one of the six.
    expect(
      validateChordMelodyRecipe({ pattern: "up-down", grid: "eighth", octaveOffset: 0 }),
    ).toEqual({
      pitchMotion: "up-down",
      rhythm: "even",
      connection: "retrigger",
      grid: "eighth",
      octaveOffset: 0,
    });
    // A canonical-only motion cannot be expressed in the legacy shape.
    expect(() =>
      validateChordMelodyRecipe({ pattern: "repeat-root", grid: "eighth", octaveOffset: 0 }),
    ).toThrow();
  });
});
