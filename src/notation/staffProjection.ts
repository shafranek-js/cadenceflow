import type { ExactPitch } from "../domain/harmony/pitch";

export interface StaffNoteDto {
  readonly midiNumber: number;
  readonly step: string;
  readonly alter: number;
  readonly octave: number;
  readonly vexKey: string;
}

export interface StaffProjectionDto { readonly notes: readonly StaffNoteDto[]; }

export function projectPitchesToStaff(pitches: readonly ExactPitch[]): StaffProjectionDto {
  return Object.freeze({
    notes: Object.freeze(pitches.map((pitch) => Object.freeze({
      midiNumber: pitch.midiNumber,
      step: pitch.spelling.step,
      alter: pitch.spelling.alter,
      octave: pitch.octave,
      vexKey: `${pitch.spelling.step.toLowerCase()}/${pitch.octave}`,
    }))),
  });
}
