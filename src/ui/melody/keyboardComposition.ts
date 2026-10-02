import { exactPitch } from "../../domain/harmony/pitch";
import type { ExactPitch } from "../../domain/harmony/pitch";

export interface KeyboardScalePitch {
  readonly pitchClass: number;
  readonly spelling: ExactPitch["spelling"];
}
const CHROMATIC_SPELLING = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
] as const;

function spellingFor(midiNumber: number): ExactPitch["spelling"] {
  return CHROMATIC_SPELLING[midiNumber % 12]!;
}

export function pitchForScaleDegree(
  degree: number,
  scale: readonly KeyboardScalePitch[],
  referenceMidi: number,
): ExactPitch {
  const scalePitch = scale[degree - 1]!;
  const candidates = Array.from({ length: 11 }, (_, octave) => octave * 12 + scalePitch.pitchClass)
    .filter((midi) => midi <= 127)
    .sort((a, b) => Math.abs(a - referenceMidi) - Math.abs(b - referenceMidi) || a - b);
  const midiNumber = candidates[0]!;
  return exactPitch(midiNumber, scalePitch.spelling);
}

export function movePitchDiatonically(
  pitch: ExactPitch,
  direction: -1 | 1,
  scale: readonly KeyboardScalePitch[],
): ExactPitch {
  for (let distance = 1; distance <= 3; distance += 1) {
    const candidate = pitch.midiNumber + direction * distance;
    if (candidate >= 0 && candidate <= 127) {
      const scalePitch = scale.find((entry) => entry.pitchClass === candidate % 12);
      if (scalePitch) return exactPitch(candidate, scalePitch.spelling);
    }
  }
  return pitch;
}

export function movePitchBySemitone(
  pitch: ExactPitch,
  direction: -1 | 1,
  scale: readonly KeyboardScalePitch[] = [],
): ExactPitch {
  const bounded = Math.max(0, Math.min(127, pitch.midiNumber + direction));
  return exactPitch(
    bounded,
    scale.find((entry) => entry.pitchClass === bounded % 12)?.spelling ?? spellingFor(bounded),
  );
}
