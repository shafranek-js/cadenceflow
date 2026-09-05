import { describe, expect, it } from "vitest";
import {
  groove,
  projectSwingTiming,
  quantizeSwingAmount,
  SWING_QUANTIZATION_BASE,
  type TimedEvent,
} from "../../../src/domain/timing/swing";
import {
  addRational,
  compareRational,
  equalRational,
  rational,
} from "../../../src/domain/timing/rational";

interface MockPlaybackNote extends TimedEvent {
  readonly id: string;
  readonly pitch: string;
  readonly velocity: number;
}

function createNote(
  id: string,
  startNum: number,
  startDen: number,
  durNum: number,
  durDen: number,
  pitch = "C4",
): MockPlaybackNote {
  return {
    id,
    pitch,
    velocity: 80,
    startBeats: rational(startNum, startDen),
    durationBeats: rational(durNum, durDen),
  };
}

describe("T099 — Swing Feel Timing Projection Contract", () => {
  describe("1. Straight Projection", () => {
    it("leaves timing unmodified when groove feel is 'straight'", () => {
      const gStraight = groove("straight", 0);
      const notes: MockPlaybackNote[] = [
        createNote("n1", 0, 1, 1, 2),
        createNote("n2", 1, 2, 1, 2),
        createNote("n3", 1, 1, 1, 2),
        createNote("n4", 3, 2, 1, 2),
      ];

      const projected = projectSwingTiming(notes, gStraight);

      expect(projected).toHaveLength(4);
      for (let i = 0; i < notes.length; i++) {
        expect(equalRational(projected[i].startBeats, notes[i].startBeats)).toBe(true);
        expect(equalRational(projected[i].durationBeats, notes[i].durationBeats)).toBe(true);
      }
    });

    it("leaves timing unmodified when groove feel is 'swing' but swingAmount is 0", () => {
      const gZero = groove("swing", 0);
      const notes: MockPlaybackNote[] = [
        createNote("n1", 0, 1, 1, 2),
        createNote("n2", 1, 2, 1, 2),
      ];

      const projected = projectSwingTiming(notes, gZero);

      expect(equalRational(projected[0].startBeats, rational(0, 1))).toBe(true);
      expect(equalRational(projected[0].durationBeats, rational(1, 2))).toBe(true);
      expect(equalRational(projected[1].startBeats, rational(1, 2))).toBe(true);
      expect(equalRational(projected[1].durationBeats, rational(1, 2))).toBe(true);
    });

    it("leaves timing unmodified when groove feel is 'straight' even with a non-zero stored swingAmount", () => {
      // Switching Swing -> Straight preserves remembered amount in project/UI, but feel controls active projection
      const gStraightWithAmount = groove("straight", 0.75);
      const notes: MockPlaybackNote[] = [
        createNote("n1", 0, 1, 1, 2),
        createNote("n2", 1, 2, 1, 2),
      ];

      const projected = projectSwingTiming(notes, gStraightWithAmount);

      expect(equalRational(projected[0].startBeats, rational(0, 1))).toBe(true);
      expect(equalRational(projected[0].durationBeats, rational(1, 2))).toBe(true);
      expect(equalRational(projected[1].startBeats, rational(1, 2))).toBe(true);
      expect(equalRational(projected[1].durationBeats, rational(1, 2))).toBe(true);
    });
  });

  describe("2. Swing Projection and Pair Invariance", () => {
    it("lengthens on-beat 8th note and shortens off-beat 8th note with later boundary", () => {
      // Standard 8th pair on beat 0
      const notes: MockPlaybackNote[] = [
        createNote("on-beat", 0, 1, 1, 2),
        createNote("off-beat", 1, 2, 1, 2),
      ];

      const gSwing = groove("swing", 0.5);
      const projected = projectSwingTiming(notes, gSwing);

      expect(projected).toHaveLength(2);

      // On-beat note starts at 0, but duration is lengthened (> 1/2 beat)
      expect(equalRational(projected[0].startBeats, rational(0, 1))).toBe(true);
      expect(compareRational(projected[0].durationBeats, rational(1, 2))).toBeGreaterThan(0);

      // Off-beat note starts at the boundary after the lengthened first note
      expect(equalRational(projected[1].startBeats, projected[0].durationBeats)).toBe(true);
      expect(compareRational(projected[1].startBeats, rational(1, 2))).toBeGreaterThan(0);

      // Off-beat note duration is shortened (< 1/2 beat)
      expect(compareRational(projected[1].durationBeats, rational(1, 2))).toBeLessThan(0);
    });

    it("strictly preserves the total sum of duration across paired subdivisions (pair invariance)", () => {
      const notes: MockPlaybackNote[] = [
        createNote("n1", 0, 1, 1, 2),
        createNote("n2", 1, 2, 1, 2),
      ];

      for (const amount of [0.1, 0.25, 0.5, 0.75, 1.0]) {
        const g = groove("swing", amount);
        const projected = projectSwingTiming(notes, g);

        const totalOriginal = addRational(notes[0].durationBeats, notes[1].durationBeats);
        const totalSwung = addRational(projected[0].durationBeats, projected[1].durationBeats);

        expect(equalRational(totalSwung, totalOriginal)).toBe(true);
        expect(equalRational(totalSwung, rational(1, 1))).toBe(true);
      }
    });
  });

  describe("3. Swing Amount Ordering and Progression", () => {
    it("creates greater asymmetry for stronger amounts than moderate amounts without locking an arbitrary formula", () => {
      const notes: MockPlaybackNote[] = [
        createNote("n1", 0, 1, 1, 2),
        createNote("n2", 1, 2, 1, 2),
      ];

      const moderate = projectSwingTiming(notes, groove("swing", 0.3));
      const stronger = projectSwingTiming(notes, groove("swing", 0.7));

      // Moderate amount creates measurable asymmetry
      expect(compareRational(moderate[0].durationBeats, rational(1, 2))).toBeGreaterThan(0);
      expect(compareRational(moderate[1].durationBeats, rational(1, 2))).toBeLessThan(0);

      // Stronger amount produces strictly greater asymmetry than moderate
      expect(compareRational(stronger[0].durationBeats, moderate[0].durationBeats)).toBeGreaterThan(
        0,
      );
      expect(compareRational(stronger[1].durationBeats, moderate[1].durationBeats)).toBeLessThan(0);
    });

    it("ensures both projected subdivisions remain strictly positive even at maximum swing amount (1.0)", () => {
      const notes: MockPlaybackNote[] = [
        createNote("n1", 0, 1, 1, 2),
        createNote("n2", 1, 2, 1, 2),
      ];

      const maxSwing = projectSwingTiming(notes, groove("swing", 1.0));

      // First note lengthened, second note shortened but strictly positive (> 0)
      expect(compareRational(maxSwing[0].durationBeats, rational(0, 1))).toBeGreaterThan(0);
      expect(compareRational(maxSwing[1].durationBeats, rational(0, 1))).toBeGreaterThan(0);
      expect(compareRational(maxSwing[0].durationBeats, rational(1, 2))).toBeGreaterThan(0);
      expect(compareRational(maxSwing[1].durationBeats, rational(1, 2))).toBeLessThan(0);

      // Invariance still holds
      const sum = addRational(maxSwing[0].durationBeats, maxSwing[1].durationBeats);
      expect(equalRational(sum, rational(1, 1))).toBe(true);
    });

    it("validates swingAmount bounds [0, 1]", () => {
      expect(() => groove("swing", -0.1)).toThrow(RangeError);
      expect(() => groove("swing", 1.1)).toThrow(RangeError);
      expect(() => groove("swing", Number.NaN)).toThrow(RangeError);
    });
  });

  describe("4. Semantic and Non-Destructive Preservation", () => {
    it("preserves non-timing note attributes (id, pitch, velocity)", () => {
      const note = createNote("unique-123", 0, 1, 1, 2, "E4");
      const projected = projectSwingTiming([note], groove("swing", 0.5));

      expect(projected[0].id).toBe("unique-123");
      expect(projected[0].pitch).toBe("E4");
      expect(projected[0].velocity).toBe(80);
    });

    it("does not mutate original input objects (pure projection)", () => {
      const origStart = rational(0, 1);
      const origDur = rational(1, 2);
      const notes: MockPlaybackNote[] = [
        { id: "test", pitch: "C4", velocity: 80, startBeats: origStart, durationBeats: origDur },
      ];

      projectSwingTiming(notes, groove("swing", 0.5));

      expect(notes[0].startBeats).toBe(origStart);
      expect(notes[0].durationBeats).toBe(origDur);
    });
  });

  describe("5. Ineligible Subdivisions", () => {
    it("does not swing whole notes or half notes", () => {
      const wholeNote = createNote("whole", 0, 1, 4, 1);
      const halfNote = createNote("half", 0, 1, 2, 1);

      const projected = projectSwingTiming([wholeNote, halfNote], groove("swing", 0.5));

      expect(equalRational(projected[0].startBeats, rational(0, 1))).toBe(true);
      expect(equalRational(projected[0].durationBeats, rational(4, 1))).toBe(true);

      expect(equalRational(projected[1].startBeats, rational(0, 1))).toBe(true);
      expect(equalRational(projected[1].durationBeats, rational(2, 1))).toBe(true);
    });

    it("does not swing quarter notes on the beat", () => {
      const quarterNotes: MockPlaybackNote[] = [
        createNote("q1", 0, 1, 1, 1),
        createNote("q2", 1, 1, 1, 1),
        createNote("q3", 2, 1, 1, 1),
        createNote("q4", 3, 1, 1, 1),
      ];

      const projected = projectSwingTiming(quarterNotes, groove("swing", 0.5));

      for (let i = 0; i < quarterNotes.length; i++) {
        expect(equalRational(projected[i].startBeats, quarterNotes[i].startBeats)).toBe(true);
        expect(equalRational(projected[i].durationBeats, quarterNotes[i].durationBeats)).toBe(true);
      }
    });

    it("does not swing triplet subdivisions", () => {
      // Triplet 8ths: 1/3 beat each
      const triplets: MockPlaybackNote[] = [
        createNote("t1", 0, 1, 1, 3),
        createNote("t2", 1, 3, 1, 3),
        createNote("t3", 2, 3, 1, 3),
      ];

      const projected = projectSwingTiming(triplets, groove("swing", 0.5));

      for (let i = 0; i < triplets.length; i++) {
        expect(equalRational(projected[i].startBeats, triplets[i].startBeats)).toBe(true);
        expect(equalRational(projected[i].durationBeats, triplets[i].durationBeats)).toBe(true);
      }
    });
  });

  describe("6. Determinism and Zero Jitter", () => {
    it("produces bit-identical results across repeated runs", () => {
      const notes: MockPlaybackNote[] = [
        createNote("n1", 0, 1, 1, 2),
        createNote("n2", 1, 2, 1, 2),
        createNote("n3", 1, 1, 1, 2),
        createNote("n4", 3, 2, 1, 2),
      ];

      const g = groove("swing", 0.55);
      const run1 = projectSwingTiming(notes, g);
      const run2 = projectSwingTiming(notes, g);

      expect(run1).toEqual(run2);
      for (let i = 0; i < run1.length; i++) {
        expect(run1[i].startBeats.numerator).toBe(run2[i].startBeats.numerator);
        expect(run1[i].startBeats.denominator).toBe(run2[i].startBeats.denominator);
        expect(run1[i].durationBeats.numerator).toBe(run2[i].durationBeats.numerator);
        expect(run1[i].durationBeats.denominator).toBe(run2[i].durationBeats.denominator);
      }
    });
  });

  describe("7. Deterministic Amount Rationalization", () => {
    it("quantizes representative swingAmount values to exact deterministic Rationals", () => {
      expect(SWING_QUANTIZATION_BASE).toBe(10000);

      // 0.1 -> 1000/10000 = 1/10
      const r01 = quantizeSwingAmount(0.1);
      expect(r01).toEqual(rational(1, 10));

      // 0.3 -> 3000/10000 = 3/10
      const r03 = quantizeSwingAmount(0.3);
      expect(r03).toEqual(rational(3, 10));

      // 0.55 -> 5500/10000 = 11/20
      const r055 = quantizeSwingAmount(0.55);
      expect(r055).toEqual(rational(11, 20));

      // 0.7 -> 7000/10000 = 7/10
      const r07 = quantizeSwingAmount(0.7);
      expect(r07).toEqual(rational(7, 10));

      // 1.0 -> 10000/10000 = 1/1
      const r10 = quantizeSwingAmount(1.0);
      expect(r10).toEqual(rational(1, 1));
    });

    it("produces identical numerators and denominators on repeated calls with same input", () => {
      for (const val of [0.1, 0.3, 0.55, 0.7, 1.0]) {
        const first = quantizeSwingAmount(val);
        const second = quantizeSwingAmount(val);
        expect(first.numerator).toBe(second.numerator);
        expect(first.denominator).toBe(second.denominator);
      }
    });
  });

  describe("8. Polyphonic Simultaneous Notes and Grid-Based Independence", () => {
    it("preserves exact simultaneity for chords on the same subdivision regardless of input order", () => {
      // First subdivision (start 0, dur 1/2): C4 and E4
      const c4 = createNote("c4", 0, 1, 1, 2, "C4");
      const e4 = createNote("e4", 0, 1, 1, 2, "E4");

      // Second subdivision (start 1/2, dur 1/2): D4 and F4
      const d4 = createNote("d4", 1, 2, 1, 2, "D4");
      const f4 = createNote("f4", 1, 2, 1, 2, "F4");

      const gSwing = groove("swing", 0.6);

      // Order A: standard chronological order [C4, E4, D4, F4]
      const notesOrderA = [c4, e4, d4, f4];
      const projectedA = projectSwingTiming(notesOrderA, gSwing);

      // Both first-subdivision notes remain simultaneous
      expect(equalRational(projectedA[0].startBeats, projectedA[1].startBeats)).toBe(true);
      expect(equalRational(projectedA[0].durationBeats, projectedA[1].durationBeats)).toBe(true);
      expect(equalRational(projectedA[0].startBeats, rational(0, 1))).toBe(true);

      // Both second-subdivision notes remain simultaneous with delayed start
      expect(equalRational(projectedA[2].startBeats, projectedA[3].startBeats)).toBe(true);
      expect(equalRational(projectedA[2].durationBeats, projectedA[3].durationBeats)).toBe(true);
      expect(equalRational(projectedA[2].startBeats, projectedA[0].durationBeats)).toBe(true);

      // Shuffled orders:
      // Order B: interleaved [C4, D4, E4, F4]
      const notesOrderB = [c4, d4, e4, f4];
      const projectedB = projectSwingTiming(notesOrderB, gSwing);

      // Order C: reverse [F4, D4, E4, C4]
      const notesOrderC = [f4, d4, e4, c4];
      const projectedC = projectSwingTiming(notesOrderC, gSwing);

      // Find projected note by ID across orders and verify bit-for-bit identical timing
      for (const id of ["c4", "e4", "d4", "f4"]) {
        const noteA = projectedA.find((n) => n.id === id);
        const noteB = projectedB.find((n) => n.id === id);
        const noteC = projectedC.find((n) => n.id === id);
        expect(noteA).toBeDefined();
        expect(noteB).toBeDefined();
        expect(noteC).toBeDefined();

        expect(equalRational(noteA!.startBeats, noteB!.startBeats)).toBe(true);
        expect(equalRational(noteA!.durationBeats, noteB!.durationBeats)).toBe(true);
        expect(equalRational(noteA!.startBeats, noteC!.startBeats)).toBe(true);
        expect(equalRational(noteA!.durationBeats, noteC!.durationBeats)).toBe(true);
      }
    });

    it("leaves isolated/unpaired events untouched so they do not acquire duration from neighboring unrelated events", () => {
      // Event 1: isolated note on beat 0 with no offbeat note at 1/2
      const isolatedBeat0 = createNote("iso0", 0, 1, 1, 2, "C4");

      // Event 2: quarter note on beat 1 (duration 1, not eligible for 8th swing)
      const quarterNote = createNote("q1", 1, 1, 1, 1, "G4");

      // Event 3: isolated offbeat note at 2.5 (5/2) with no onbeat note at 2 (4/2)
      const isolatedOffbeat = createNote("isoOff", 5, 2, 1, 2, "B4");

      const notes = [isolatedBeat0, quarterNote, isolatedOffbeat];
      const projected = projectSwingTiming(notes, groove("swing", 0.6));

      expect(projected).toHaveLength(3);
      for (let i = 0; i < notes.length; i++) {
        expect(equalRational(projected[i].startBeats, notes[i].startBeats)).toBe(true);
        expect(equalRational(projected[i].durationBeats, notes[i].durationBeats)).toBe(true);
      }
    });
  });
});
