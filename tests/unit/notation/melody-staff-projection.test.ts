import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIANO_PERFORMANCE,
  createDefaultProject,
} from "../../../src/domain/project/factory";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import type { ChordStep, ProgressionStep } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import {
  createMelodyTimeline,
  melodyClefForInstrument,
} from "../../../src/notation/melodyStaffProjection";

function chordStep(
  id: string,
  duration: ReturnType<typeof musicalDuration>,
  melody?: ChordStep["melody"],
): ChordStep {
  return {
    id,
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId: "I" },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration,
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "staff",
    ...(melody ? { melody } : {}),
  };
}

function withSteps(steps: readonly ProgressionStep[], meter: [number, number] = [4, 4]) {
  const base = createDefaultProject("melody-staff", "Melody Staff");
  return {
    ...base,
    globalTiming: {
      ...base.globalTiming,
      meter: {
        numerator: meter[0],
        denominator: meter[1],
        grouping: [meter[0]],
      },
    },
    progression: {
      ...base.progression,
      steps: Object.freeze([...steps]),
    },
  };
}

describe("T171 — Melody Staff projection", () => {
  it("derives upper-voicing notes only and leaves the project immutable", () => {
    const step = chordStep("source-c", musicalDuration(rational(2)), {
      pattern: "up",
      grid: "quarter",
      octaveOffset: 0,
    });
    const project = withSteps([step]);
    const before = JSON.stringify(project);

    const result = createMelodyTimeline(project);
    const pitches = result.events.map((event) => event.pitch.midiNumber);

    expect(pitches).toEqual([60, 64]);
    expect(pitches).not.toContain(48);
    expect(result.events.map((event) => event.eventKey)).toEqual(["source-c:0", "source-c:1"]);
    expect(JSON.stringify(project)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(result).toEqual(createMelodyTimeline(project));
  });

  it("fills no-melody spans and the virtual tail with exact rests", () => {
    const steps = [
      chordStep("resting-chord", musicalDuration(rational(1))),
      {
        id: "authored-rest",
        kind: "rest" as const,
        duration: musicalDuration(rational(1)),
      },
      chordStep("melody-chord", musicalDuration(rational(1)), {
        pattern: "up",
        grid: "quarter",
        octaveOffset: 0,
      }),
    ];
    const result = createMelodyTimeline(withSteps(steps));
    const entries = result.measures[0]?.entries ?? [];

    expect(entries.map((entry) => entry.kind)).toEqual(["rest", "rest", "note", "rest"]);
    expect(
      entries.map((entry) => `${entry.startBeats.numerator}/${entry.startBeats.denominator}`),
    ).toEqual(["0/1", "1/1", "2/1", "3/1"]);
    expect(
      entries.map((entry) => `${entry.durationBeats.numerator}/${entry.durationBeats.denominator}`),
    ).toEqual(["1/1", "1/1", "1/1", "1/1"]);
    expect(result.measures[0]?.entries.at(-1)).toMatchObject({
      kind: "rest",
      sourceKind: "virtual-gap",
    });
  });

  it("returns a complete rest timeline when no step has a melody recipe", () => {
    const result = createMelodyTimeline(
      withSteps([
        chordStep("silent-chord", musicalDuration(rational(1))),
        { id: "silent-rest", kind: "rest", duration: musicalDuration(rational(1)) },
      ]),
    );

    expect(result.events).toEqual([]);
    expect(result.measures[0]?.entries.map((entry) => entry.kind)).toEqual([
      "rest",
      "rest",
      "rest",
    ]);
    expect(result.measures[0]?.entries.map((entry) => entry.durationBeats)).toEqual([
      rational(1),
      rational(1),
      rational(2),
    ]);
  });

  it("splits a cross-bar event into tied display fragments without a new attack", () => {
    const result = createMelodyTimeline(
      withSteps([
        chordStep("lead-in", musicalDuration(rational(7, 2))),
        chordStep("cross-bar-source", musicalDuration(rational(1)), {
          pattern: "up",
          grid: "quarter",
          octaveOffset: 0,
        }),
      ]),
    );
    const fragments = result.measures.flatMap((measure) =>
      measure.entries.filter(
        (entry) => entry.kind === "note" && entry.eventKey === "cross-bar-source:0",
      ),
    );

    expect(fragments).toHaveLength(2);
    expect(fragments[0]).toMatchObject({
      startsHere: true,
      continuesFromPrevious: false,
      continuesToNext: true,
      durationBeats: rational(1, 2),
    });
    expect(fragments[1]).toMatchObject({
      startsHere: false,
      continuesFromPrevious: true,
      continuesToNext: false,
      durationBeats: rational(1, 2),
    });
    expect(fragments[0]?.eventIndex).toBe(fragments[1]?.eventIndex);
    expect(fragments[0]?.sourceStepId).toBe(fragments[1]?.sourceStepId);
  });

  it("preserves exact triplet timing in 3/4 and 7/8 measures", () => {
    const triplet = chordStep("triplets", musicalDuration(rational(1)), {
      pattern: "up",
      grid: "eighth-triplet",
      octaveOffset: 0,
    });
    const threeFour = createMelodyTimeline(withSteps([triplet], [3, 4]));
    expect(threeFour.measures[0]?.entries).toHaveLength(4);
    expect(threeFour.measures[0]?.entries.slice(0, 3).map((entry) => entry.durationBeats)).toEqual([
      rational(1, 3),
      rational(1, 3),
      rational(1, 3),
    ]);
    expect(threeFour.measures[0]?.entries.at(-1)).toMatchObject({
      kind: "rest",
      durationBeats: rational(2),
    });

    const sevenEight = createMelodyTimeline(
      withSteps(
        [
          chordStep("seven-eight", musicalDuration(rational(1)), {
            pattern: "up",
            grid: "sixteenth-triplet",
            octaveOffset: 0,
          }),
        ],
        [7, 8],
      ),
    );
    expect(sevenEight.measures[0]?.entries.filter((entry) => entry.kind === "note")).toHaveLength(
      6,
    );
    expect(sevenEight.measures[0]?.entries.at(-1)).toMatchObject({
      kind: "rest",
      durationBeats: rational(5, 2),
    });
  });

  it("maps every supported instrument to the requested concert-pitch clef", () => {
    expect(melodyClefForInstrument("flute")).toBe("treble");
    expect(melodyClefForInstrument("violin")).toBe("treble");
    expect(melodyClefForInstrument("clarinet")).toBe("treble");
    expect(melodyClefForInstrument("oboe")).toBe("treble");
    expect(melodyClefForInstrument("synth-lead")).toBe("treble");
    expect(melodyClefForInstrument("cello")).toBe("bass");
  });
});
