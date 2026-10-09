import { requireValue } from "../../fixtures/assertions";
import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import type { EffectiveMelodyNote } from "../../../src/domain/melody/effectiveTimeline";
import { createProgressionMeasureLayout } from "../../../src/domain/timing/measureLayout";
import { rational } from "../../../src/domain/timing/rational";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { meter } from "../../../src/domain/timing/meter";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { realizeProgressionStepRealization } from "../../../src/instruments/piano/profile";
import {
  isPianoRollNoteAuthored,
  pianoRollPlayheadPercent,
  pianoRollDegreeLabel,
  pianoRollPaletteColor,
  pianoRollPaletteDegrees,
  projectPianoRollChordToneGuide,
  NOTE_VALUE_SNAPS,
  PIANO_ROLL_SNAPS,
  PULSE_SNAPS,
  pianoRollSnapBeats,
  pianoRollSnapLabel,
  pianoRollSnapOffsets,
  pianoRollMoveStart,
  pianoRollResolvedGestureIntent,
  pianoRollGestureIntent,
  projectPianoRollNoteFragment,
} from "../../../src/ui/melody/pianoRollProjection";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";

const note = (start: [number, number], duration: [number, number]): EffectiveMelodyNote => ({
  sourceStepId: "owner",
  stepIndex: 0,
  eventKey: "phrase-local-id",
  eventIndex: 0,
  eventCount: 1,
  pitch: exactPitch(67, { step: "G", alter: 0 }),
  sourcePitchMidi: 67,
  startBeats: rational(...start),
  durationBeats: rational(...duration),
  instrument: "flute",
});

const project = createDefaultProject("piano-roll", "Piano Roll", "2026-09-30T00:00:00.000Z");
const layout = createProgressionMeasureLayout(
  [createMatrixChordStep(project, "I", "owner"), createMatrixChordStep(project, "V", "next")],
  project.globalTiming.meter,
);

describe("Piano Roll measure projection", () => {
  it("waits for a clearly dominant drag axis before enabling horizontal Snap", () => {
    expect(pianoRollGestureIntent(7, 2)).toBeNull();
    expect(pianoRollGestureIntent(13, 4)).toBe("horizontal");
    expect(pianoRollGestureIntent(7, 13)).toBe("vertical");
    expect(pianoRollGestureIntent(-5, -14)).toBe("vertical");
    expect(pianoRollResolvedGestureIntent(null, 13, 1)).toBe("horizontal");
    expect(pianoRollResolvedGestureIntent("horizontal", 14, -23)).toBe("vertical");
    expect(pianoRollResolvedGestureIntent("vertical", 15, -18)).toBe("vertical");
  });
  it("preserves an off-grid onset for vertical drags and snaps horizontal moves deterministically", () => {
    const original = rational(1, 3);
    const grabOffset = rational(1, 12);
    expect(
      pianoRollMoveStart(original, rational(5, 12), grabOffset, rational(1, 2), false),
    ).toEqual(original);
    const moved = pianoRollMoveStart(original, rational(23, 12), grabOffset, rational(1, 2), true);
    expect(moved).toEqual(rational(2));
    expect(
      pianoRollMoveStart(original, rational(23, 12), grabOffset, rational(1, 2), true),
    ).toEqual(moved);
    expect(pianoRollMoveStart(original, rational(7, 4), grabOffset, rational(1, 3), true)).toEqual(
      rational(5, 3),
    );
  });
  it("shares tonic-relative degree colors and pairs chromatic enharmonics deterministically", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(pianoRollPaletteColor)).toEqual([
      "#f60100",
      "#fbaf01",
      "#efe700",
      "#3ed700",
      "#3f00ff",
      "#b100e7",
      "#f700cd",
    ]);
    expect(pianoRollPaletteDegrees(0, 0, "progressions")).toEqual([1]);
    expect(pianoRollPaletteDegrees(2, 0, "progressions")).toEqual([2]);
    expect(pianoRollPaletteDegrees(1, 0, "progressions")).toEqual([1, 2]);
    expect(pianoRollPaletteDegrees(6, 0, "progressions")).toEqual([4, 5]);
    expect(pianoRollPaletteDegrees(1, 2, "progressions")).toEqual([7]);
    expect(pianoRollPaletteDegrees(5, 2, "progressions")).toEqual([2, 3]);
    expect(pianoRollPaletteDegrees(0, 9, "dark-harmony")).toEqual([3]);
    expect(pianoRollPaletteDegrees(8, 9, "dark-harmony")).toEqual([7]);
    expect(pianoRollPaletteDegrees(7, 9, "dark-harmony")).toEqual([7]);
    expect(pianoRollPaletteDegrees(10, 9, "dark-harmony")).toEqual([1, 2]);
  });

  it("keeps guide segments aligned to changing, altered Harmony and leaves Rest uncolored", () => {
    const firstBase = createMatrixChordStep(project, "I", "guide-altered");
    const alteredFirst = {
      ...firstBase,
      duration: musicalDuration(rational(2)),
      harmonicVariant: {
        ...firstBase.harmonicVariant,
        extensions: [9] as const,
        alterations: [{ degree: 5, semitones: -1 }] as const,
      },
      performance: { ...firstBase.performance, inversion: 1 as const },
    };
    const secondChord = {
      ...createMatrixChordStep(project, "V", "guide-next"),
      duration: musicalDuration(rational(1)),
    };
    const restStep: RestStep = {
      id: "guide-rest",
      kind: "rest",
      duration: musicalDuration(rational(1)),
    };
    const guideLayout = createProgressionMeasureLayout(
      [alteredFirst, secondChord, restStep],
      project.globalTiming.meter,
    );
    const alteredRealization = realizeProgressionStepRealization(alteredFirst, project.tonic);
    const alteredPitchClasses = new Set(
      [
        ...alteredRealization.pitches,
        ...(alteredRealization.bassPitch ? [alteredRealization.bassPitch] : []),
      ].map((pitch) => pitch.pitchClassIdentity),
    );
    const nextPitchClasses = new Set(
      realizeProgressionStepRealization(secondChord, project.tonic).pitches.map(
        (pitch) => pitch.pitchClassIdentity,
      ),
    );
    const harmonyPitchClasses = new Map([
      [alteredFirst.id, alteredPitchClasses],
      [secondChord.id, nextPitchClasses],
    ]);
    const measure = guideLayout.measures[0]!;
    const alteredFifthGuide = projectPianoRollChordToneGuide(measure, 6, harmonyPitchClasses);
    expect(alteredFifthGuide.map(({ item, chordTone }) => [item.startBeats, chordTone])).toEqual([
      [rational(0), true],
      [rational(2), false],
      [rational(3), false],
    ]);
    expect(projectPianoRollChordToneGuide(measure, 2, harmonyPitchClasses)[0]?.chordTone).toBe(
      true,
    );
    const changedChordGuide = projectPianoRollChordToneGuide(measure, 7, harmonyPitchClasses);
    expect(changedChordGuide.map(({ chordTone }) => chordTone)).toEqual([false, true, false]);
    expect(changedChordGuide[2]?.item).toMatchObject({ step: { kind: "rest" } });
  });

  it("projects chord-tone guides over exact chord boundaries, including altered extensions, inversions, and Rest", () => {
    const alteredFirst = {
      ...createMatrixChordStep(project, "I", "guide-altered"),
      duration: musicalDuration(rational(2)),
      harmonicVariant: {
        ...createMatrixChordStep(project, "I", "guide-altered-base").harmonicVariant,
        extensions: [9] as const,
        alterations: [{ degree: 5, semitones: -1 }] as const,
      },
      performance: {
        ...createMatrixChordStep(project, "I", "guide-altered-performance").performance,
        inversion: 1 as const,
      },
    };
    const secondChord = {
      ...createMatrixChordStep(project, "V", "guide-next"),
      duration: musicalDuration(rational(1)),
    };
    const restStep: RestStep = {
      id: "guide-rest",
      kind: "rest",
      duration: musicalDuration(rational(1)),
    };
    const guideLayout = createProgressionMeasureLayout(
      [alteredFirst, secondChord, restStep],
      project.globalTiming.meter,
    );
    const realized = realizeProgressionStepRealization(alteredFirst, project.tonic);
    const alteredPitchClasses = new Set(
      [...realized.pitches, realized.bassPitch].map(
        (pitch) => requireValue(pitch).pitchClassIdentity,
      ),
    );
    const nextPitchClasses = new Set(
      [...realizeProgressionStepRealization(secondChord, project.tonic).pitches].map(
        (pitch) => pitch.pitchClassIdentity,
      ),
    );
    const harmonyPitchClasses = new Map([
      [alteredFirst.id, alteredPitchClasses],
      [secondChord.id, nextPitchClasses],
    ]);
    const measure = guideLayout.measures[0]!;
    const alteredFifthGuide = projectPianoRollChordToneGuide(measure, 6, harmonyPitchClasses);
    expect(alteredFifthGuide.map(({ item, chordTone }) => [item.startBeats, chordTone])).toEqual([
      [rational(0), true],
      [rational(2), false],
      [rational(3), false],
    ]);
    const ninthGuide = projectPianoRollChordToneGuide(measure, 2, harmonyPitchClasses);
    expect(ninthGuide[0]?.chordTone).toBe(true);
    const changedChordGuide = projectPianoRollChordToneGuide(measure, 7, harmonyPitchClasses);
    expect(changedChordGuide[0]?.chordTone).toBe(false);
    expect(changedChordGuide[1]?.chordTone).toBe(true);
    expect(changedChordGuide[2]?.chordTone).toBe(false);
    expect(changedChordGuide[2]?.item).toMatchObject({ step: { kind: "rest" } });
  });

  it("clips display fragments at exact bar edges without changing the note interval", () => {
    const event = note([1, 2], [6, 1]);
    const first = projectPianoRollNoteFragment(event, layout.measures[0]!, layout.barLengthBeats)!;
    const second = projectPianoRollNoteFragment(event, layout.measures[1]!, layout.barLengthBeats)!;
    expect(first).toMatchObject({
      startBeats: rational(1, 2),
      durationBeats: rational(7, 2),
      leftPercent: 12.5,
      widthPercent: 87.5,
      continuesFromPrevious: false,
    });
    expect(second).toMatchObject({
      startBeats: rational(4),
      durationBeats: rational(5, 2),
      leftPercent: 0,
      widthPercent: 62.5,
      continuesFromPrevious: true,
    });
    expect(event).toMatchObject({ startBeats: rational(1, 2), durationBeats: rational(6) });
  });

  it("keeps triplet timing exact and excludes notes outside the measure", () => {
    const triplet = projectPianoRollNoteFragment(
      note([5, 6], [1, 3]),
      layout.measures[0]!,
      layout.barLengthBeats,
    )!;
    expect(triplet.startBeats).toEqual(rational(5, 6));
    expect(triplet.durationBeats).toEqual(rational(1, 3));
    expect(
      projectPianoRollNoteFragment(
        note([4, 1], [1, 1]),
        layout.measures[0]!,
        layout.barLengthBeats,
      ),
    ).toBeNull();
  });

  it("projects every display snap, including triplets, on exact Rational beats", () => {
    expect(pianoRollSnapOffsets(rational(4), "1/1", meter(4, 4))).toEqual([
      rational(0),
      rational(4),
    ]);
    expect(pianoRollSnapOffsets(rational(4), "1/16", meter(4, 4))).toHaveLength(17);
    expect(pianoRollSnapOffsets(rational(4), "1/4 triplet", meter(4, 4))).toEqual([
      rational(0),
      rational(2, 3),
      rational(4, 3),
      rational(2),
      rational(8, 3),
      rational(10, 3),
      rational(4),
    ]);
    expect(pianoRollSnapOffsets(rational(1), "1/4 triplet", meter(4, 4), rational(3))).toEqual([
      rational(1, 3),
      rational(1),
    ]);
    expect(pianoRollSnapOffsets(rational(4), "1/1 triplet", meter(4, 4))).toEqual([
      rational(0),
      rational(8, 3),
    ]);
    expect(pianoRollSnapOffsets(rational(4), "1/2 triplet", meter(4, 4))).toEqual([
      rational(0),
      rational(4, 3),
      rational(8, 3),
      rational(4),
    ]);
    expect(pianoRollSnapOffsets(rational(4), "1/8 triplet", meter(4, 4))).toHaveLength(13);
    expect(pianoRollSnapOffsets(rational(4), "1/16 triplet", meter(4, 4))).toHaveLength(25);
  });

  it("offers a 32nd-triplet snap fine enough for six cells on an eighth-note pulse", () => {
    // A 6/8 pulse is an eighth, so one pulse needs a 1/12-of-a-quarter step for six cells. The finest
    // triplet used to be 1/16 triplet (1/6 of a quarter), which put only three cells on the pulse.
    expect(pianoRollSnapBeats("1/32 triplet", meter(4, 4))).toEqual(rational(1, 12));
    expect(pianoRollSnapOffsets(rational(1, 2), "1/32 triplet", meter(4, 4))).toHaveLength(7);
    expect(pianoRollSnapOffsets(rational(1, 2), "1/16 triplet", meter(4, 4))).toHaveLength(4);

    expect(pianoRollSnapBeats("1/16 triplet", meter(4, 4))).toEqual(rational(1, 6));
    // A whole 6/8 bar is three quarters: 36 cells at the finer step.
    expect(pianoRollSnapOffsets(rational(3), "1/32 triplet", meter(4, 4))).toHaveLength(37);

    // The binary 32nd is the same step without the triplet: four cells on an eighth pulse.
    expect(pianoRollSnapBeats("1/32", meter(4, 4))).toEqual(rational(1, 8));
    expect(pianoRollSnapOffsets(rational(1, 2), "1/32", meter(4, 4))).toHaveLength(5);
    expect(pianoRollSnapOffsets(rational(4), "1/32", meter(4, 4))).toHaveLength(33);
  });

  it("derives cells-per-pulse snaps from the meter, so six cells work in any meter", () => {
    // The note-value family stops at a fixed finest value, so a /16 meter could only show three cells
    // on a pulse however small that pulse was. Deriving the step from the pulse makes the count exact
    // for every meter.
    const cases: Array<[ReturnType<typeof meter>, ReturnType<typeof rational>]> = [
      [meter(6, 8), rational(1, 12)],
      [meter(4, 4), rational(1, 6)],
      [meter(3, 2), rational(1, 3)],
      [meter(6, 16), rational(1, 24)],
      [meter(6, 32), rational(1, 48)],
    ];
    for (const [value, expected] of cases) {
      expect(
        pianoRollSnapBeats("pulse/6", value),
        `${value.numerator}/${value.denominator}`,
      ).toEqual(expected);
    }

    // A 6/8 bar is three quarters, so 36 cells at six per eighth pulse.
    expect(pianoRollSnapOffsets(rational(3), "pulse/6", meter(6, 8))).toHaveLength(37);
    expect(pianoRollSnapBeats("pulse/1", meter(6, 8))).toEqual(rational(1, 2));
    expect(pianoRollSnapBeats("pulse/3", meter(6, 8))).toEqual(rational(1, 6));
  });

  it("offers both Snap families together", () => {
    // Both systems are available so the more convenient one can be chosen later; the control groups
    // them by optgroup.
    expect(NOTE_VALUE_SNAPS).toContain("1/32");
    expect(NOTE_VALUE_SNAPS).toContain("1/16 triplet");
    expect(PULSE_SNAPS).toEqual(["pulse/1", "pulse/2", "pulse/3", "pulse/4", "pulse/6", "pulse/8"]);
    expect(PIANO_ROLL_SNAPS).toEqual([...NOTE_VALUE_SNAPS, ...PULSE_SNAPS]);
    expect(pianoRollSnapLabel("pulse/6")).toBe("6 per beat");
    expect(pianoRollSnapLabel("pulse/1")).toBe("1 per beat");
    expect(pianoRollSnapLabel("1/16 triplet")).toBe("1/16 triplet");
  });

  it("spells natural minor degrees correctly after tonic transposition", () => {
    expect(pianoRollDegreeLabel(0, 0, true)).toBe("1");
    expect(pianoRollDegreeLabel(3, 0, true)).toBe("3");
    expect(pianoRollDegreeLabel(4, 0, true)).toBe("♯3");
    expect(pianoRollDegreeLabel(8, 0, true)).toBe("6");
    expect(pianoRollDegreeLabel(9, 0, true)).toBe("♯6");
    expect(pianoRollDegreeLabel(10, 0, true)).toBe("7");
    expect(pianoRollDegreeLabel(11, 0, true)).toBe("♯7");
    expect(pianoRollDegreeLabel(2, 2, true)).toBe("1");
    expect(pianoRollDegreeLabel(5, 2, true)).toBe("3");
    expect(pianoRollDegreeLabel(10, 2, true)).toBe("6");
    expect(pianoRollDegreeLabel(11, 2, true)).toBe("♯6");
  });

  it("keeps major scale degrees and chromatic alterations tonic-relative", () => {
    const majorScale = [0, 2, 4, 5, 7, 9, 11];
    expect(majorScale.map((offset) => pianoRollDegreeLabel(offset, 0, false))).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(pianoRollDegreeLabel(1, 0, false)).toBe("♭2");
    expect(pianoRollDegreeLabel(6, 0, false)).toBe("♭5");
    expect(pianoRollDegreeLabel(11, 2, false)).toBe("6");
    expect(pianoRollDegreeLabel(1, 2, false)).toBe("7");
  });

  it("moves the playhead through clipped cross-measure tails and hides it after the end", () => {
    const eventStart = rational(1, 2);
    const duration = rational(6);
    expect(pianoRollPlayheadPercent(eventStart, duration, layout.measures[0]!, 1750, 120)).toBe(
      100,
    );
    expect(pianoRollPlayheadPercent(eventStart, duration, layout.measures[1]!, 2000, 120)).toBe(
      12.5,
    );
    expect(
      pianoRollPlayheadPercent(eventStart, duration, layout.measures[0]!, 2000, 120),
    ).toBeNull();
    expect(
      pianoRollPlayheadPercent(eventStart, duration, layout.measures[1]!, 3001, 120),
    ).toBeNull();
  });

  it("keeps authored Rest notes selectable and generated chord notes visually locked", () => {
    const generated = {
      ...createMatrixChordStep(project, "I", "generated"),
      melody: { mode: "generated" as const, recipe: {} },
    } as unknown as ChordStep;
    const authoredChord = {
      ...createMatrixChordStep(project, "I", "authored"),
      melody: { mode: "authored" as const, phrase: { notes: [] } },
    } as ChordStep;
    const restDuration = musicalDuration(rational(4));
    const authoredRest = {
      id: "rest",
      kind: "rest",
      duration: restDuration,
      authoredMelody: { notes: [] },
    } as RestStep;
    const emptyRest = { id: "empty-rest", kind: "rest", duration: restDuration } as RestStep;
    expect(isPianoRollNoteAuthored(authoredChord)).toBe(true);
    expect(isPianoRollNoteAuthored(authoredRest)).toBe(true);
    expect(isPianoRollNoteAuthored(generated)).toBe(false);
    expect(isPianoRollNoteAuthored(emptyRest)).toBe(false);
  });
});
