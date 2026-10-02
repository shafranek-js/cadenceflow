import { describe, expect, it } from "vitest";
import {
  createPianoRollPitchGeometry,
  derivePianoRollScalePitchBounds,
  pianoRollPitchRows,
} from "../../../src/ui/melody/pianoRollGeometry";
import { pianoRollScaleGuideTones } from "../../../src/ui/melody/pianoRollProjection";

function centerFraction(
  pitch: number,
  geometry: ReturnType<typeof createPianoRollPitchGeometry>,
): number {
  return (geometry.rowStart(pitch) + geometry.rowSpan(pitch) / 2) / geometry.unitCount;
}

describe("Piano Roll pitch geometry", () => {
  it("centers full-height altered pitches on the boundaries between full-height scale rows", () => {
    const geometry = createPianoRollPitchGeometry(59, 72, 0, "major", "degrees");
    expect(geometry.rowSpan(60)).toBe(1); // C
    expect(geometry.rowSpan(61)).toBe(1); // C sharp / D flat
    expect(geometry.rowSpan(62)).toBe(1); // D
    expect(geometry.rowStart(61) + 0.5).toBe(
      (geometry.rowStart(60) + geometry.rowStart(62)) / 2 + 0.5,
    );
    expect(geometry.pitchCoordinate(61) - geometry.pitchCoordinate(60)).toBe(0.5);
    expect(geometry.rowSpan(64)).toBe(1); // E
    expect(geometry.rowSpan(65)).toBe(1); // F: adjacent semitone, no intervening row
    expect(geometry.unitCount).toBe(pianoRollPitchRows(59, 72, geometry).length);
    expect(pianoRollPitchRows(59, 72, geometry)).not.toContain(61);
    for (let pitch = 59; pitch <= 72; pitch += 1) {
      expect(geometry.pitchAtYFraction(centerFraction(pitch, geometry))).toBe(pitch);
    }
  });

  it("uses minor-scale gaps and octave-consistent enharmonic pitch positions", () => {
    const geometry = createPianoRollPitchGeometry(58, 72, 0, "minor", "degrees");
    expect(geometry.rowSpan(63)).toBe(1); // E flat is diatonic in C minor
    expect(geometry.rowSpan(64)).toBe(1); // E natural sits between E-flat and F rows
    expect(geometry.pitchCoordinate(64) - geometry.pitchCoordinate(63)).toBe(0.5);
    expect(geometry.pitchCoordinate(61)).toBe(geometry.pitchCoordinate(73) - 7);
    for (let pitch = 58; pitch <= 72; pitch += 1) {
      expect(geometry.pitchAtYFraction(centerFraction(pitch, geometry))).toBe(pitch);
    }
  });

  it("keeps Chromatic semitone rows full height and gives Degrees one scale-row margin", () => {
    const chromatic = createPianoRollPitchGeometry(60, 72, 0, "major", "chromatic");
    expect(chromatic.unitCount).toBe(13);
    expect(chromatic.rowSpan(61)).toBe(1);
    expect(derivePianoRollScalePitchBounds([60], 0, "major")).toEqual({ min: 59, max: 62 });
    expect(derivePianoRollScalePitchBounds([60], 0, "minor")).toEqual({ min: 58, max: 62 });
    expect(derivePianoRollScalePitchBounds([], 0, "major", 0, 1)).toEqual({ min: 47, max: 74 });
  });

  it("highlights exact diatonic rows only when their pitch class is in the actual chord", () => {
    const a7PitchClasses = new Set([9, 1, 4, 7]); // A7 in C major: A, C sharp, E, G
    expect(pianoRollScaleGuideTones(0, a7PitchClasses)).toEqual([]); // C does not match C sharp
    expect(pianoRollScaleGuideTones(2, a7PitchClasses)).toEqual([]); // D is not chord tone
    expect(pianoRollScaleGuideTones(4, a7PitchClasses)).toEqual([{ pitchClass: 4, half: null }]);
    expect(pianoRollScaleGuideTones(7, a7PitchClasses)).toEqual([{ pitchClass: 7, half: null }]);
    expect(pianoRollScaleGuideTones(9, a7PitchClasses)).toEqual([{ pitchClass: 9, half: null }]);
    const c7PitchClasses = new Set([0, 4, 7, 10]);
    expect(pianoRollScaleGuideTones(9, c7PitchClasses)).toEqual([]); // A does not match B flat
    expect(pianoRollScaleGuideTones(11, c7PitchClasses)).toEqual([]); // B does not match B flat
    expect(pianoRollScaleGuideTones(0, c7PitchClasses)).toEqual([{ pitchClass: 0, half: null }]);
  });
});
