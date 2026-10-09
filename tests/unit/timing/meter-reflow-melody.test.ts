import { describe, expect, it } from "vitest";
import { applyMeterChange, meter } from "../../../src/domain/timing/meter";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational, type Rational } from "../../../src/domain/timing/rational";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { snapshotAuthoredMelodyPhrase } from "../../../src/domain/melody/types";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";

/**
 * Meter reflow must move an authored melody with its Step.
 *
 * Regression context: `applyMeterChange` scaled only `step.duration`. A phrase's `onset` and
 * `duration` are stored in beats *local to their Step*, so after 4/4 -> 3/4 the Step lasted three
 * beats while its melody still occupied four. Notes spilled past the end of the chord that owned
 * them — audible as the previous chord's melody sounding over the next one, and visible in the
 * notation as notes drawn outside their bar.
 *
 * `preserve-beat-lengths` is deliberately unaffected: it does not rescale durations at all.
 */

const pitch = (midiNumber: number) => exactPitch(midiNumber, { step: "C", alter: 0 });

/** Note onsets/durations that exactly fill a four-beat step. */
function fourBeatPhrase() {
  return snapshotAuthoredMelodyPhrase({
    notes: [
      { id: "n1", pitch: pitch(60), onset: rational(0, 1), duration: rational(1, 1) },
      { id: "n2", pitch: pitch(62), onset: rational(3, 2), duration: rational(1, 2) },
      { id: "n3", pitch: pitch(64), onset: rational(5, 2), duration: rational(3, 2) },
    ],
  });
}

function chordStepWithMelody(id: string): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(4, 1)),
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "harmonic",
    melody: { mode: "authored" as const, phrase: fourBeatPhrase() },
  };
}

function restStepWithMelody(id: string): RestStep {
  return {
    id,
    kind: "rest",
    duration: musicalDuration(rational(4, 1)),
    authoredMelody: fourBeatPhrase(),
  };
}

const asNumber = (value: Rational) => value.numerator / value.denominator;

/** End of the last note, in Step-local beats. */
function lastNoteEnd(notes: readonly { onset: Rational; duration: Rational }[]): number {
  const last = notes[notes.length - 1]!;
  return asNumber(last.onset) + asNumber(last.duration);
}

function notesOf(step: ChordStep | RestStep) {
  if (step.kind === "rest") return step.authoredMelody?.notes;
  // `ChordMelody` is a union; only the authored arm carries a phrase.
  return step.melody?.mode === "authored" ? step.melody.phrase.notes : undefined;
}

describe("meter reflow scales authored melody with its step", () => {
  it("scales chord-step melody onsets and durations by the bar ratio", () => {
    const [reflowed] = applyMeterChange(
      [chordStepWithMelody("s1")],
      meter(4, 4, [4]),
      meter(3, 4, [3]),
      "reflow",
    );

    const notes = notesOf(reflowed as ChordStep)!;
    expect(notes).toHaveLength(3);
    // x3/4 of [0, 1], [3/2, 1/2], [5/2, 3/2]
    expect(notes[0]!.onset).toEqual(rational(0, 1));
    expect(notes[0]!.duration).toEqual(rational(3, 4));
    expect(notes[1]!.onset).toEqual(rational(9, 8));
    expect(notes[1]!.duration).toEqual(rational(3, 8));
    expect(notes[2]!.onset).toEqual(rational(15, 8));
    expect(notes[2]!.duration).toEqual(rational(9, 8));
  });

  it("keeps every note inside its step after reflow", () => {
    const steps = [chordStepWithMelody("s1"), restStepWithMelody("s2")];
    const reflowed = applyMeterChange(steps, meter(4, 4, [4]), meter(3, 4, [3]), "reflow");

    for (const step of reflowed) {
      const notes = notesOf(step as ChordStep | RestStep)!;
      const stepBeats = asNumber(step.duration.beats);
      // This is the property that was violated: the melody used to end a beat after its chord.
      expect(
        lastNoteEnd(notes),
        `step ${step.id}: melody must not outlive its step`,
      ).toBeLessThanOrEqual(stepBeats);
      expect(lastNoteEnd(notes)).toBeCloseTo(stepBeats, 10);
    }
  });

  it("scales rest-step melody too", () => {
    const [reflowed] = applyMeterChange(
      [restStepWithMelody("s1")],
      meter(4, 4, [4]),
      meter(3, 4, [3]),
      "reflow",
    );

    const notes = (reflowed as RestStep).authoredMelody!.notes;
    expect(notes[2]!.onset).toEqual(rational(15, 8));
    expect(notes[2]!.duration).toEqual(rational(9, 8));
  });

  it("scales up when the bar grows", () => {
    const [reflowed] = applyMeterChange(
      [chordStepWithMelody("s1")],
      meter(3, 4, [3]),
      meter(4, 4, [4]),
      "reflow",
    );

    // x4/3 of a three-beat phrase would grow; assert the ratio held rather than a literal.
    const notes = notesOf(reflowed as ChordStep)!;
    expect(asNumber(reflowed!.duration.beats)).toBeCloseTo(16 / 3, 10);
    expect(lastNoteEnd(notes)).toBeCloseTo(asNumber(reflowed!.duration.beats), 10);
  });

  it("leaves melody untouched under preserve-beat-lengths", () => {
    const steps = [chordStepWithMelody("s1"), restStepWithMelody("s2")];
    const preserved = applyMeterChange(
      steps,
      meter(4, 4, [4]),
      meter(3, 4, [3]),
      "preserve-beat-lengths",
    );

    // Durations are not rescaled by this policy, so neither is the melody.
    expect(asNumber(preserved[0]!.duration.beats)).toBeCloseTo(4, 10);
    const notes = notesOf(preserved[0] as ChordStep)!;
    expect(notes[2]!.onset).toEqual(rational(5, 2));
    expect(notes[2]!.duration).toEqual(rational(3, 2));
  });

  it("does not add melody to steps that have none", () => {
    // `exactOptionalPropertyTypes` is on, so the key must be omitted rather than set to undefined.
    const { melody: _withoutMelody, ...stepWithoutMelody } = chordStepWithMelody("s1");
    const [reflowed] = applyMeterChange(
      [stepWithoutMelody],
      meter(4, 4, [4]),
      meter(3, 4, [3]),
      "reflow",
    );

    expect(reflowed!.kind).toBe("chord");
    expect((reflowed as ChordStep).melody).toBeUndefined();
    expect(asNumber(reflowed!.duration.beats)).toBeCloseTo(3, 10);
  });
});
