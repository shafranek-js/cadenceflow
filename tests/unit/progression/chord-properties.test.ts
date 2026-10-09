import { describe, expect, it } from "vitest";
import {
  EMPTY_HARMONIC_VARIANT,
  formatChordSymbol,
  withHarmonicVariant,
} from "../../../src/domain/harmony/chord";
import { resolveChordTones } from "../../../src/domain/harmony/chordTones";
import { computeModalChords } from "../../../src/domain/harmony/modes";
import { realizeChord } from "../../../src/domain/harmony/realization";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { harmonicFunctionLabel } from "../../../src/domain/harmony/functions";
import {
  applyChordPropertiesEdit,
  chordTonesForStep,
  resetChordProperties,
  secondaryChoiceForFunction,
  SECONDARY_FUNCTION_CHOICES,
} from "../../../src/domain/progression/chordProperties";
import { DEFAULT_PIANO_PERFORMANCE } from "../../../src/domain/project/factory";
import type { ChordStep } from "../../../src/domain/progression/step";
import { rational } from "../../../src/domain/timing/rational";

function makeStep(overrides: Partial<ChordStep> = {}): ChordStep {
  return {
    id: "step-1",
    kind: "chord",
    harmonicFunction: { moduleId: "progressions", functionId: "I", category: "core" },
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: { beats: rational(3, 2) },
    performance: DEFAULT_PIANO_PERFORMANCE,
    cardView: "piano",
    ...overrides,
  };
}

const tonic = 0;

describe("selected chord property semantics", () => {
  it("normalizes Type 9/11/13 into extension chains and clears only a promoted add tone", () => {
    const add9 = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "added-tone",
      degree: 9,
      enabled: true,
    });
    expect(
      formatChordSymbol(
        withHarmonicVariant(realizeChord(add9.harmonicFunction, tonic), add9.harmonicVariant),
      ),
    ).toBe("Cadd9");
    expect(chordTonesForStep(add9, tonic).map((tone) => tone.pitchClass)).toEqual([0, 4, 7, 2]);

    const ninth = applyChordPropertiesEdit(add9, tonic, "progressions", {
      type: "type",
      value: "9",
    });
    expect(ninth.harmonicVariant).toMatchObject({
      seventh: "major7",
      extensions: [9],
    });
    expect(ninth.harmonicVariant.add9).toBeUndefined();
    expect(chordTonesForStep(ninth, tonic).map((tone) => tone.pitchClass)).toEqual([
      0, 4, 7, 11, 2,
    ]);

    const thirteenth = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "type",
      value: "13",
    });
    expect(thirteenth.harmonicVariant).toMatchObject({
      seventh: "major7",
      extensions: [9, 11, 13],
    });
    expect(chordTonesForStep(thirteenth, tonic).map((tone) => tone.pitchClass)).toEqual([
      0, 4, 7, 11, 2, 5, 9,
    ]);
  });

  it("formats an altered added eleventh as one tone and one add#11 symbol", () => {
    const added = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "added-tone",
      degree: 11,
      enabled: true,
    });
    const sharpAdded = applyChordPropertiesEdit(added, tonic, "progressions", {
      type: "alteration",
      degree: 11,
      semitones: 1,
    });
    const chord = withHarmonicVariant(
      realizeChord(sharpAdded.harmonicFunction, tonic),
      sharpAdded.harmonicVariant,
    );

    expect(formatChordSymbol(chord)).toBe("Cadd#11");
    expect(
      chordTonesForStep(sharpAdded, tonic).filter((tone) => tone.diatonicDegree === 11),
    ).toEqual([expect.objectContaining({ pitchClass: 6, semitoneInterval: 18 })]);
  });

  it.each([
    { degree: 9 as const, semitones: -1 as const, symbol: "Caddb9", pitchClass: 1 },
    { degree: 11 as const, semitones: 1 as const, symbol: "Cadd#11", pitchClass: 6 },
    { degree: 13 as const, semitones: -1 as const, symbol: "Caddb13", pitchClass: 8 },
  ])("formats add$degree alterations once and realizes one matching tone", (testCase) => {
    const added = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "added-tone",
      degree: testCase.degree,
      enabled: true,
    });
    const altered = applyChordPropertiesEdit(added, tonic, "progressions", {
      type: "alteration",
      degree: testCase.degree,
      semitones: testCase.semitones,
    });
    const chord = withHarmonicVariant(
      realizeChord(altered.harmonicFunction, tonic),
      altered.harmonicVariant,
    );

    expect(formatChordSymbol(chord)).toBe(testCase.symbol);
    expect(
      chordTonesForStep(altered, tonic).filter((tone) => tone.diatonicDegree === testCase.degree),
    ).toEqual([expect.objectContaining({ pitchClass: testCase.pitchClass })]);
  });

  it("keeps a dominant triad a triad when Type is set to Triad", () => {
    const secondaryV = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "secondary",
      kind: "dominant",
      targetFunctionId: "I",
    });
    const triad = applyChordPropertiesEdit(secondaryV, tonic, "progressions", {
      type: "type",
      value: "triad",
    });

    expect(triad.harmonicVariant).toMatchObject({ baseQualityOverride: "major" });
    expect(triad.harmonicVariant.seventh).toBeUndefined();
    expect(
      formatChordSymbol(
        withHarmonicVariant(realizeChord(triad.harmonicFunction, tonic), triad.harmonicVariant),
      ),
    ).toBe("G");
    expect(chordTonesForStep(triad, tonic).map((tone) => tone.pitchClass)).toEqual([7, 11, 2]);
  });

  it("resolves omissions, alterations and suspensions into one canonical pitch set", () => {
    const noThird = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "omission",
      degree: 3,
      enabled: true,
    });
    expect(chordTonesForStep(noThird, tonic).map((tone) => tone.diatonicDegree)).toEqual([1, 5]);
    expect(() =>
      applyChordPropertiesEdit(noThird, tonic, "progressions", {
        type: "suspension",
        value: "sus4",
      }),
    ).toThrow(/no3/i);

    const noFifth = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "omission",
      degree: 5,
      enabled: true,
    });
    expect(chordTonesForStep(noFifth, tonic).map((tone) => tone.diatonicDegree)).toEqual([1, 3]);
    expect(() =>
      applyChordPropertiesEdit(noFifth, tonic, "progressions", {
        type: "alteration",
        degree: 5,
        semitones: -1,
      }),
    ).toThrow(/omitted/i);

    const sus = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "suspension",
      value: "sus4",
    });
    expect(chordTonesForStep(sus, tonic).map((tone) => tone.diatonicDegree)).toEqual([1, 4, 5]);
  });

  it("keeps b5/#5 labels aligned with their absolute fifth intervals", () => {
    const diminished = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "quality",
      value: "diminished",
    });
    const explicitFlatFifth = applyChordPropertiesEdit(diminished, tonic, "progressions", {
      type: "alteration",
      degree: 5,
      semitones: -1,
    });
    expect(
      chordTonesForStep(explicitFlatFifth, tonic).find((tone) => tone.diatonicDegree === 5)
        ?.semitoneInterval,
    ).toBe(6);
    expect(
      formatChordSymbol(
        withHarmonicVariant(
          realizeChord(explicitFlatFifth.harmonicFunction, tonic),
          explicitFlatFifth.harmonicVariant,
        ),
      ),
    ).toBe("C°b5");

    const augmented = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "quality",
      value: "augmented",
    });
    const explicitSharpFifth = applyChordPropertiesEdit(augmented, tonic, "progressions", {
      type: "alteration",
      degree: 5,
      semitones: 1,
    });
    expect(
      chordTonesForStep(explicitSharpFifth, tonic).find((tone) => tone.diatonicDegree === 5)
        ?.semitoneInterval,
    ).toBe(8);
  });

  it("normalizes half-diminished seventh when quality changes away from diminished", () => {
    const diminishedNinth = applyChordPropertiesEdit(
      applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
        type: "quality",
        value: "diminished",
      }),
      tonic,
      "progressions",
      { type: "type", value: "7" },
    );
    expect(diminishedNinth.harmonicVariant.seventh).toBe("half-diminished7");

    const majorSeventh = applyChordPropertiesEdit(diminishedNinth, tonic, "progressions", {
      type: "quality",
      value: "major",
    });
    expect(majorSeventh.harmonicVariant.seventh).toBe("minor7");
    expect(
      formatChordSymbol(
        withHarmonicVariant(
          realizeChord(majorSeventh.harmonicFunction, tonic),
          majorSeventh.harmonicVariant,
        ),
      ),
    ).toBe("C7");
  });

  it("maps inversions to the matching available bass chord tone", () => {
    const thirteenth = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "type",
      value: "13",
    });
    const inversion = applyChordPropertiesEdit(thirteenth, tonic, "progressions", {
      type: "inversion",
      value: 6,
    });
    expect(inversion.performance.inversion).toBe(6);
    expect(inversion.performance.bass.choice).toBe("thirteenth");

    expect(() =>
      applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
        type: "inversion",
        value: 3,
      }),
    ).toThrow(/unavailable/i);
  });

  it("restores the source function for Secondary None, then borrows its original degree", () => {
    const source = makeStep();
    const secondary = applyChordPropertiesEdit(source, tonic, "progressions", {
      type: "secondary",
      kind: "dominant",
      targetFunctionId: "vi",
    });
    expect(secondary.harmonicFunction.functionId).toBe("V7/vi");
    expect(SECONDARY_FUNCTION_CHOICES.some((choice) => choice.targetFunctionId === "vi")).toBe(
      true,
    );

    const restored = applyChordPropertiesEdit(secondary, tonic, "progressions", {
      type: "secondary",
      kind: "none",
    });
    expect(restored.harmonicFunction).toEqual(source.harmonicFunction);

    const borrowed = applyChordPropertiesEdit(restored, tonic, "progressions", {
      type: "borrow",
      mode: "dorian",
    });
    expect(borrowed.harmonicFunction.borrowedDegree).toBe(1);
    expect(borrowed.harmonicFunction.borrowedFromMode).toBe("dorian");
    const canonicalDorianTonic = computeModalChords(tonic, "dorian").find(
      (item) => item.degree === 1,
    )!.chord;
    expect(chordTonesForStep(borrowed, tonic)).toEqual(resolveChordTones(canonicalDorianTonic));
  });

  it("exposes each Secondary V and vii target as one selectable canonical option", () => {
    const optionValues = SECONDARY_FUNCTION_CHOICES.map(
      (choice) => `${choice.kind}:${choice.targetFunctionId}`,
    );
    expect(new Set(optionValues).size).toBe(optionValues.length);
    expect(
      SECONDARY_FUNCTION_CHOICES.find(
        (choice) => choice.kind === "dominant" && choice.targetFunctionId === "I",
      )?.functionId,
    ).toBe("V7");
    expect(SECONDARY_FUNCTION_CHOICES.some((choice) => choice.functionId === "subV7")).toBe(false);
  });

  it("does not misidentify subV7 as V7/I or treat a replacement as a no-op", () => {
    const subV7 = makeStep({
      harmonicFunction: {
        moduleId: "progressions",
        functionId: "subV7",
        category: "secondary-dominant",
        targetFunctionId: "I",
        targetId: "I",
      },
    });
    expect(secondaryChoiceForFunction(subV7.harmonicFunction)).toBeUndefined();

    const replaced = applyChordPropertiesEdit(subV7, tonic, "progressions", {
      type: "secondary",
      kind: "dominant",
      targetFunctionId: "I",
    });
    expect(replaced).not.toBe(subV7);
    expect(replaced.harmonicFunction.functionId).toBe("V7");
  });

  it.each(["ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"] as const)(
    "uses the canonical same-tonic %s degree chord when borrowing",
    (mode) => {
      const borrowed = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
        type: "borrow",
        mode,
      });
      const canonical = computeModalChords(tonic, mode).find((item) => item.degree === 1)!.chord;
      expect(chordTonesForStep(borrowed, tonic)).toEqual(resolveChordTones(canonical));
    },
  );

  it("labels borrowed degrees with their canonical Roman numeral and readable provenance", () => {
    const borrowed = applyChordPropertiesEdit(makeStep(), tonic, "progressions", {
      type: "borrow",
      mode: "dorian",
    });
    const roman = computeModalChords(tonic, "dorian").find(
      (item) => item.degree === 1,
    )!.romanNumeral;
    const label = harmonicFunctionLabel(borrowed.harmonicFunction);
    expect(label).toBe(`${roman} (borrowed from Dorian)`);
    expect(label).not.toContain("mode-");
  });

  it("Reset restores the first-edit snapshot and leaves unrelated step data intact", () => {
    const source = makeStep({
      performance: {
        ...DEFAULT_PIANO_PERFORMANCE,
        inversion: 1,
        bass: { choice: "third", octaveOffset: -1 },
        masterVelocity: 103,
      },
    });
    const edited = applyChordPropertiesEdit(source, tonic, "progressions", {
      type: "quality",
      value: "minor",
    });
    const withInversion = applyChordPropertiesEdit(edited, tonic, "progressions", {
      type: "inversion",
      value: 2,
    });
    const reset = resetChordProperties(withInversion);

    expect(reset.harmonicFunction).toEqual(source.harmonicFunction);
    expect(reset.harmonicVariant).toEqual(source.harmonicVariant);
    expect(reset.performance.inversion).toBe(1);
    expect(reset.performance.bass).toEqual(source.performance.bass);
    expect(reset.performance.masterVelocity).toBe(103);
    expect(reset.id).toBe(source.id);
    expect(reset.duration).toEqual(source.duration);
    expect(reset.cardView).toBe(source.cardView);
    expect(reset.chordPropertiesOrigin).toBeUndefined();
  });

  it("returns the same object for a semantic no-op", () => {
    const source = makeStep();
    expect(
      applyChordPropertiesEdit(source, tonic, "progressions", { type: "type", value: "triad" }),
    ).toBe(source);
    expect(
      applyChordPropertiesEdit(source, tonic, "progressions", {
        type: "inversion",
        value: "auto",
      }),
    ).toBe(source);
  });

  it("does not change tone set or harmonic function while Manual voicing owns exact pitches", () => {
    const source = makeStep({
      performance: {
        ...DEFAULT_PIANO_PERFORMANCE,
        voicingMode: "manual",
        manualVoicing: [exactPitch(60, { step: "C", alter: 0 })],
      },
    });

    expect(
      applyChordPropertiesEdit(source, tonic, "progressions", {
        type: "quality",
        value: "minor",
      }),
    ).toBe(source);
    expect(
      applyChordPropertiesEdit(source, tonic, "progressions", {
        type: "added-tone",
        degree: 9,
        enabled: true,
      }),
    ).toBe(source);
    expect(
      applyChordPropertiesEdit(source, tonic, "progressions", {
        type: "borrow",
        mode: "dorian",
      }),
    ).toBe(source);
  });

  it("keeps suspended chords unchanged when a diminished quality or borrowed degree would be invalid", () => {
    const suspended = makeStep({
      harmonicVariant: { ...EMPTY_HARMONIC_VARIANT, suspensions: ["sus4"] },
    });

    expect(
      applyChordPropertiesEdit(suspended, tonic, "progressions", {
        type: "quality",
        value: "diminished",
      }),
    ).toBe(suspended);
    expect(
      applyChordPropertiesEdit(suspended, tonic, "progressions", {
        type: "borrow",
        mode: "locrian",
      }),
    ).toBe(suspended);
  });
});
