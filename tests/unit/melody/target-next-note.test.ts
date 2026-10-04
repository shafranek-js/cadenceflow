import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { rational } from "../../../src/domain/timing/rational";
import { realizeChordMelody } from "../../../src/domain/melody/projection";

describe("Target Notes melody realization", () => {
  it("changes only the final generated note to the nearest matching next-chord pitch", () => {
    const phrase = realizeChordMelody({
      sourceStepId: "source",
      upperPitches: [
        exactPitch(60, { step: "C", alter: 0 }),
        exactPitch(64, { step: "E", alter: 0 }),
        exactPitch(67, { step: "G", alter: 0 }),
      ],
      durationBeats: rational(1),
      recipe: {
        pitchMotion: "up",
        rhythm: "even",
        connection: "retrigger",
        grid: "eighth",
        octaveOffset: 0,
        targetNextPitchClass: 2,
      },
      targetPitches: [
        exactPitch(62, { step: "D", alter: 0 }),
        exactPitch(74, { step: "D", alter: 0 }),
      ],
    });

    expect(phrase.events).toHaveLength(2);
    expect(phrase.events[0]!.pitch.midiNumber).toBe(60);
    expect(phrase.events[1]!.pitch.midiNumber).toBe(62);
    expect(Object.keys(phrase.events[1]!).sort()).toEqual([
      "durationBeats",
      "eventKey",
      "index",
      "pitch",
      "sourcePitchMidi",
      "sourceStepId",
      "startOffsetBeats",
    ]);
  });

  it("leaves the generated phrase intact when the selected target is absent from the next chord", () => {
    const phrase = realizeChordMelody({
      sourceStepId: "source",
      upperPitches: [exactPitch(60, { step: "C", alter: 0 })],
      durationBeats: rational(1),
      recipe: {
        pitchMotion: "up",
        rhythm: "even",
        connection: "retrigger",
        grid: "quarter",
        octaveOffset: 0,
        targetNextPitchClass: 2,
      },
      targetPitches: [exactPitch(65, { step: "F", alter: 0 })],
    });

    expect(phrase.events[0]!.pitch.midiNumber).toBe(60);
  });
});
