import { exactPitch, type ExactPitch } from "../../domain/harmony/pitch";
import type { RegisterOffset, StepPerformance } from "../../domain/progression/step";

export type StaffOctaveDirection = -1 | 1;

export function shiftPitchesByOctave(
  pitches: readonly ExactPitch[],
  direction: StaffOctaveDirection,
): readonly ExactPitch[] | null {
  const semitones = direction * 12;
  if (
    pitches.some((pitch) => pitch.midiNumber + semitones < 0 || pitch.midiNumber + semitones > 127)
  ) {
    return null;
  }
  return Object.freeze(
    pitches.map((pitch) => exactPitch(pitch.midiNumber + semitones, pitch.spelling)),
  );
}

export function nextRegisterOffset(
  register: RegisterOffset,
  direction: StaffOctaveDirection,
): RegisterOffset | null {
  const current = register === "auto" ? 0 : register;
  const next = current + direction;
  return next < -2 || next > 2 ? null : (next as RegisterOffset);
}

export function canShiftPerformanceOctave(
  performance: StepPerformance,
  direction: StaffOctaveDirection,
): boolean {
  if (performance.voicingMode === "manual" && performance.manualVoicing?.length) {
    return shiftPitchesByOctave(performance.manualVoicing, direction) !== null;
  }
  return nextRegisterOffset(performance.register, direction) !== null;
}
