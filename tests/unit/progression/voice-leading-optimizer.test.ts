import { describe, expect, it } from "vitest";
import { optimizeProgressionVoiceLeading } from "../../../src/domain/progression/voiceLeadingOptimizer";
import type { ChordStep, StepPerformance } from "../../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { pitchToConcertFrame } from "../../../src/domain/progression/transposition";

function createPerformance(): StepPerformance {
  return {
    articulation: "block",
    register: "auto",
    voicingMode: "auto",
    bass: { choice: "root", octaveOffset: "auto" },
    masterVelocity: 80,
    perNoteVelocityOverrides: {},
    dynamicsViewPreference: "musical",
  };
}

function makeChord(
  id: string,
  functionId: string,
  seventh?: "minor7" | "major7",
  transpositionSemitones = 0,
): ChordStep {
  return {
    id,
    kind: "chord",
    ...(transpositionSemitones === 0 ? {} : { transpositionSemitones }),
    harmonicFunction: { moduleId: "progressions", functionId },
    harmonicVariant: seventh ? { ...EMPTY_HARMONIC_VARIANT, seventh } : EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(4, 4)),
    performance: createPerformance(),
    cardView: "harmonic",
  };
}

describe("Voice Leading & Bassline Optimizer", () => {
  it("returns empty updates when progression has no chords", () => {
    const res = optimizeProgressionVoiceLeading([], 0, "major", "smooth-all");
    expect(res.updates).toHaveLength(0);
    expect(res.description).toContain("No chords");
  });

  it("resets all chords to root position under reset-root strategy", () => {
    const steps = [
      makeChord("step-1", "I"),
      makeChord("step-2", "V"),
      makeChord("step-3", "vi"),
    ];

    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "reset-root");
    expect(res.updates).toHaveLength(3);
    for (const update of res.updates) {
      expect(update.patch.performance?.inversion).toBe(0);
      expect(update.patch.performance?.bass?.choice).toBe("root");
    }
  });

  it("applies smooth upper voice leading with root bass under smooth-upper strategy", () => {
    const steps = [
      makeChord("step-1", "I"),
      makeChord("step-2", "IV"),
      makeChord("step-3", "V"),
    ];

    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "smooth-upper");
    expect(res.updates).toHaveLength(3);
    for (const update of res.updates) {
      expect(update.patch.performance?.inversion).toBe("auto");
      expect(update.patch.performance?.bass?.choice).toBe("root");
    }
  });

  it("applies tonic pedal point under pedal-tonic strategy", () => {
    const steps = [
      makeChord("step-1", "I"),
      makeChord("step-2", "IV"),
      makeChord("step-3", "V"),
    ];

    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "pedal-tonic"); // Tonic: C (0)
    expect(res.updates).toHaveLength(3);
    for (const update of res.updates) {
      expect(update.patch.performance?.bass?.choice).toBe("custom");
      expect(update.patch.performance?.bass?.customPitch?.midiNumber % 12).toBe(0); // C
    }
  });

  it("keeps tonic pedal sounding in concert pitch across different owner offsets", () => {
    const steps = [
      makeChord("step-1", "I", undefined, 2),
      makeChord("step-2", "IV", undefined, -3),
    ];
    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "pedal-tonic");

    expect(
      res.updates.map((update, index) => {
        const step = steps[index]!;
        const stored = update.patch.performance?.bass?.customPitch;
        return stored ? pitchToConcertFrame(stored, step).midiNumber : undefined;
      }),
    ).toEqual([36, 36]);
    expect(
      res.updates.map((update) => update.patch.performance?.bass?.customPitch?.midiNumber),
    ).toEqual([34, 39]);
  });

  it("applies dominant pedal point under pedal-dominant strategy", () => {
    const steps = [
      makeChord("step-1", "I"),
      makeChord("step-2", "IV"),
      makeChord("step-3", "V"),
    ];

    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "pedal-dominant"); // Dominant: G (7)
    expect(res.updates).toHaveLength(3);
    for (const update of res.updates) {
      expect(update.patch.performance?.bass?.choice).toBe("custom");
      expect(update.patch.performance?.bass?.customPitch?.midiNumber % 12).toBe(7); // G
    }
  });

  it("keeps dominant pedal sounding in concert pitch across different owner offsets", () => {
    const steps = [makeChord("step-1", "I", undefined, -2), makeChord("step-2", "V", undefined, 4)];
    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "pedal-dominant");

    expect(
      res.updates.map((update, index) => {
        const step = steps[index]!;
        const stored = update.patch.performance?.bass?.customPitch;
        return stored ? pitchToConcertFrame(stored, step).midiNumber : undefined;
      }),
    ).toEqual([43, 43]);
    expect(
      res.updates.map((update) => update.patch.performance?.bass?.customPitch?.midiNumber),
    ).toEqual([45, 39]);
  });

  it("chooses smooth-all bass candidates from each Step's concert chord", () => {
    const steps = [makeChord("step-1", "I"), makeChord("step-2", "V", undefined, 5)];
    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "smooth-all");

    expect(res.updates.map((update) => update.patch.performance?.bass?.choice)).toEqual([
      "root",
      "root",
    ]);
  });

  it("produces a smooth stepwise bassline for canonical C -> G -> Am -> F under smooth-all", () => {
    // In C major:
    // C (I) -> bass C (0)
    // G (V) -> root G (7) is 5 away, 3rd B (11) is 1 away from C! Should pick 'third' (B)
    // Am (vi) -> root A (9) is 2 away from B! Should pick 'root' (A)
    const steps = [
      makeChord("step-1", "I"),
      makeChord("step-2", "V"),
      makeChord("step-3", "vi"),
      makeChord("step-4", "IV"),
    ];

    const res = optimizeProgressionVoiceLeading(steps, 0, "major", "smooth-all");
    expect(res.updates).toHaveLength(4);

    // Step 1: Root anchor
    expect(res.updates[0]?.patch.performance?.bass?.choice).toBe("root");

    // Step 2: G/B (3rd in bass connects C to B by a half-step)
    expect(res.updates[1]?.patch.performance?.bass?.choice).toBe("third");

    // Step 3: Am (root A in bass connects B to A by a whole-step)
    expect(res.updates[2]?.patch.performance?.bass?.choice).toBe("root");
  });
});
