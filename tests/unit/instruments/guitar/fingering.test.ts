import { describe, expect, it } from "vitest";
import {
  findPossibleFretPositions,
  generateFretCandidates,
  optimizeGuitarMelodyTab,
  type GuitarMelodyInputNote,
} from "../../../../src/domain/instruments/guitar/fingering";

describe("Guitar Fingering Engine (Viterbi Optimization)", () => {
  it("finds all valid physical fretboard positions for a pitch", () => {
    // C4 (MIDI 60) can be played on strings 2 (fret 1), 3 (fret 5), 4 (fret 10), 5 (fret 15), 6 (fret 20)
    const positions = findPossibleFretPositions(60);
    expect(positions).toHaveLength(5);
    expect(positions).toContainEqual({ str: 2, fret: 1 });
    expect(positions).toContainEqual({ str: 3, fret: 5 });
    expect(positions).toContainEqual({ str: 4, fret: 10 });
    expect(positions).toContainEqual({ str: 5, fret: 15 });
    expect(positions).toContainEqual({ str: 6, fret: 20 });
  });

  it("generates natural finger candidates and assigns finger 0 to open strings", () => {
    // E4 (MIDI 64) has open string on string 1 (fret 0)
    const positions = findPossibleFretPositions(64);
    const candidates = generateFretCandidates(positions);
    const openCandidate = candidates.find((c) => c.str === 1 && c.fret === 0);
    expect(openCandidate).toBeDefined();
    expect(openCandidate!.finger).toBe(0);
    expect(openCandidate!.handPosition).toBe(1);
  });

  it("optimizes a scalar melody to stay in 1st position without erratic jumping", () => {
    // C4 (60), D4 (62), E4 (64), F4 (65), G4 (67)
    const notes: GuitarMelodyInputNote[] = [
      { key: "n1", pitch: 60, startOffsetBeats: 0, durationBeats: 1, measureIndex: 0 },
      { key: "n2", pitch: 62, startOffsetBeats: 1, durationBeats: 1, measureIndex: 0 },
      { key: "n3", pitch: 64, startOffsetBeats: 2, durationBeats: 1, measureIndex: 0 },
      { key: "n4", pitch: 65, startOffsetBeats: 3, durationBeats: 1, measureIndex: 0 },
      { key: "n5", pitch: 67, startOffsetBeats: 4, durationBeats: 1, measureIndex: 0 },
    ];

    const chordBaseFrets = new Map<number, number>([[0, 1]]);
    const result = optimizeGuitarMelodyTab(notes, chordBaseFrets);

    expect(result).toHaveLength(5);

    // C4 on string 2 fret 1
    expect(result[0]!.str).toBe(2);
    expect(result[0]!.fret).toBe(1);
    expect(result[0]!.finger).toBe(1);

    // D4 on string 2 fret 3
    expect(result[1]!.str).toBe(2);
    expect(result[1]!.fret).toBe(3);

    // E4 on open 1st string
    expect(result[2]!.str).toBe(1);
    expect(result[2]!.fret).toBe(0);
    expect(result[2]!.finger).toBe(0);

    // F4 on string 1 fret 1
    expect(result[3]!.str).toBe(1);
    expect(result[3]!.fret).toBe(1);
    expect(result[3]!.finger).toBe(1);

    // G4 on string 1 fret 3
    expect(result[4]!.str).toBe(1);
    expect(result[4]!.fret).toBe(3);

    // All notes remain in 1st position (frets 0..3)
    for (const pos of result) {
      expect(pos.fret).toBeLessThanOrEqual(4);
    }
  });

  it("gravitates toward 5th position when chord is barred at 5th fret", () => {
    // A melody around A4/C5/D5: A4 (69), B4 (71), C5 (72)
    const notes: GuitarMelodyInputNote[] = [
      { key: "m1", pitch: 69, startOffsetBeats: 0, durationBeats: 1, measureIndex: 0 },
      { key: "m2", pitch: 71, startOffsetBeats: 1, durationBeats: 1, measureIndex: 0 },
      { key: "m3", pitch: 72, startOffsetBeats: 2, durationBeats: 1, measureIndex: 0 },
    ];

    // Measure 0 has chord with baseFret 5 (e.g. Am barre at fret 5)
    const chordBaseFrets = new Map<number, number>([[0, 5]]);
    const result = optimizeGuitarMelodyTab(notes, chordBaseFrets);

    expect(result).toHaveLength(3);
    // A4 (MIDI 69): in 5th position it is string 1, fret 5
    expect(result[0]!.str).toBe(1);
    expect(result[0]!.fret).toBe(5);
    expect(result[0]!.finger).toBe(1);

    // B4 (MIDI 71): string 1, fret 7
    expect(result[1]!.str).toBe(1);
    expect(result[1]!.fret).toBe(7);

    // C5 (MIDI 72): string 1, fret 8
    expect(result[2]!.str).toBe(1);
    expect(result[2]!.fret).toBe(8);
  });

  it("handles empty and single note inputs gracefully", () => {
    expect(optimizeGuitarMelodyTab([])).toEqual([]);

    const single = optimizeGuitarMelodyTab([{ key: "one", pitch: 60 }]);
    expect(single).toHaveLength(1);
    expect(single[0]!.fret).toBeGreaterThanOrEqual(0);
  });
});
