import { describe, expect, it } from "vitest";
import { realizeProgressionMelodyPerformance } from "../../../src/audio/melodyPerformance";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { realizeOrderedPianoProgression } from "../../../src/instruments/piano/progressionRealization";
import { groove } from "../../../src/domain/timing/swing";
import { equalRational, rational } from "../../../src/domain/timing/rational";
import { musicalDuration } from "../../../src/domain/timing/duration";
import type { ChordMelodyRecipe, MelodyTrackSettings } from "../../../src/domain/melody/types";
import type { ChordStep, StepPerformance } from "../../../src/domain/progression/step";

const DEFAULT_PERFORMANCE: StepPerformance = Object.freeze({
  articulation: "block",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

const DEFAULT_TRACK: MelodyTrackSettings = Object.freeze({
  instrument: "flute",
  muted: false,
  solo: false,
  volume: 100,
});

function makeChord(
  id: string,
  functionId: string,
  durationBeats = rational(2),
  melody: ChordMelodyRecipe = { pattern: "up", grid: "eighth", octaveOffset: 0 },
  performance: StepPerformance = DEFAULT_PERFORMANCE,
): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(durationBeats),
    cardView: "harmonic",
    performance,
    melody,
  });
}

const baseInput = {
  tonic: 0 as const,
  context: "major" as const,
  tempoBpm: 120,
};

describe("T173 — live Melody performance projection", () => {
  it("retains stable source identity, exact timing, and pre-offset source velocity", () => {
    const sourceStep = makeChord("step-1", "I");
    const sourceRealization = realizeOrderedPianoProgression({
      steps: [sourceStep],
      tonic: 0,
      context: "major",
    })[0]!;
    const sourcePitch = sourceRealization.upperPitches[0]!.midiNumber;
    const step = makeChord(
      "step-1",
      "I",
      rational(1),
      { pattern: "up", grid: "quarter", octaveOffset: 1 },
      Object.freeze({
        ...DEFAULT_PERFORMANCE,
        masterVelocity: 61,
        perNoteVelocityOverrides: Object.freeze({ [String(sourcePitch)]: 119 }),
      }),
    );

    const projection = realizeProgressionMelodyPerformance({
      ...baseInput,
      steps: [step],
      groove: groove("straight"),
      melodyTrack: DEFAULT_TRACK,
    });
    const event = projection.events[0]!;

    expect(event.eventKey).toBe("step-1:0");
    expect(event.sourceStepId).toBe("step-1");
    expect(event.eventIndex).toBe(0);
    expect(event.stepIndex).toBe(0);
    expect(event.pitch).toBe(sourcePitch + 12);
    expect(event.velocity).toBe(119);
    expect(event.startBeats).toEqual(rational(0));
    expect(event.durationBeats).toEqual(rational(1));
    expect(event.startSeconds).toBe(0);
    expect(event.durationSeconds).toBe(0.5);
  });

  it("swings straight melody grids but leaves triplet grids unchanged", () => {
    const straightStep = makeChord("straight", "I", rational(2));
    const tripletStep = makeChord("triplet", "I", rational(2), {
      pattern: "up",
      grid: "eighth-triplet",
      octaveOffset: 0,
    });
    const straight = realizeProgressionMelodyPerformance({
      ...baseInput,
      steps: [straightStep],
      groove: groove("swing", 0.75),
      melodyTrack: DEFAULT_TRACK,
    }).events;
    const tripletSwung = realizeProgressionMelodyPerformance({
      ...baseInput,
      steps: [tripletStep],
      groove: groove("swing", 0.75),
      melodyTrack: DEFAULT_TRACK,
    }).events;
    const tripletStraight = realizeProgressionMelodyPerformance({
      ...baseInput,
      steps: [tripletStep],
      groove: groove("straight"),
      melodyTrack: DEFAULT_TRACK,
    }).events;

    expect(straight[0]!.durationBeats).toEqual(rational(5, 8));
    expect(straight[1]!.startBeats).toEqual(rational(5, 8));
    expect(straight[1]!.durationBeats).toEqual(rational(3, 8));
    expect(tripletSwung.map((event) => event.startBeats)).toEqual(
      tripletStraight.map((event) => event.startBeats),
    );
    expect(tripletSwung.map((event) => event.durationBeats)).toEqual(
      tripletStraight.map((event) => event.durationBeats),
    );
  });

  it("carries contextual realization through preceding steps and omits muted output", () => {
    const steps = [makeChord("step-1", "I"), makeChord("step-2", "IV")];
    const expected = realizeOrderedPianoProgression({ steps, tonic: 0, context: "major" })[1]!;
    const projection = realizeProgressionMelodyPerformance({
      ...baseInput,
      steps,
      melodyTrack: DEFAULT_TRACK,
    });
    const secondStepEvent = projection.events.find((event) => event.stepIndex === 1)!;

    expect(secondStepEvent.sourcePitchMidi).toBe(expected.upperPitches[0]!.midiNumber);

    const muted = realizeProgressionMelodyPerformance({
      ...baseInput,
      steps,
      melodyTrack: Object.freeze({ ...DEFAULT_TRACK, muted: true }),
    });
    expect(muted.events).toHaveLength(0);
    expect(equalRational(muted.totalDurationBeats, rational(4))).toBe(true);
  });
});
