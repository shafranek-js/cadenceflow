import type { ChordDefinition } from "../../domain/harmony/chord";
import type { ChordStep } from "../../domain/progression/step";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import { realizeChord } from "../../domain/harmony/realization";
import { exactPitch, normalizePitchClass, type DiatonicStep, type ExactPitch, type PitchSpelling } from "../../domain/harmony/pitch";

const STEPS: readonly DiatonicStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PC: Readonly<Record<DiatonicStep, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY_INTERVALS: Readonly<Record<ChordDefinition["baseQuality"], readonly number[]>> = {
  major: [0, 4, 7], minor: [0, 3, 7], diminished: [0, 3, 6], augmented: [0, 4, 8], dominant: [0, 4, 7, 10],
};

function spellChordTone(root: PitchSpelling, semitone: number, toneIndex: number): PitchSpelling {
  const rootIndex = STEPS.indexOf(root.step);
  const letterOffset = toneIndex === 3 ? 6 : toneIndex * 2;
  const step = STEPS[(rootIndex + letterOffset) % 7]!;
  const targetPc = normalizePitchClass(NATURAL_PC[root.step] + root.alter + semitone);
  let alter = targetPc - NATURAL_PC[step];
  while (alter > 6) alter -= 12;
  while (alter < -6) alter += 12;
  return { step, alter };
}

export interface PreviewPianoRealization { readonly pitches: readonly ExactPitch[]; }

export function realizeBasicPreview(chord: ChordDefinition): PreviewPianoRealization {
  const intervals = QUALITY_INTERVALS[chord.baseQuality];
  const rootMidi = 60 + ((chord.rootPitchClass - 0 + 12) % 12);
  const pitches = intervals.map((semitone, index) => {
    const midi = rootMidi + semitone;
    return exactPitch(midi, spellChordTone(chord.spelling.root, semitone, index));
  });
  return Object.freeze({ pitches: Object.freeze(pitches) });
}

export function realizeProgressionStepPitches(step: ChordStep, tonic: PitchClassIdentity): readonly ExactPitch[] {
  if (step.performance.voicingMode === "manual" && step.performance.manualVoicing?.length) return step.performance.manualVoicing;
  return realizeBasicPreview(realizeChord(step.harmonicFunction, tonic)).pitches;
}
