export type DiatonicStep = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type PitchClassIdentity = number;

export interface PitchSpelling {
  readonly step: DiatonicStep;
  readonly alter: number;
}

export interface ExactPitch {
  readonly midiNumber: number;
  readonly pitchClassIdentity: PitchClassIdentity;
  readonly octave: number;
  readonly spelling: PitchSpelling;
}

export function normalizePitchClass(value: number): PitchClassIdentity {
  if (!Number.isInteger(value)) throw new RangeError("pitch class must be an integer");
  return ((value % 12) + 12) % 12;
}

export function assertMidiNumber(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new RangeError("MIDI note number must be an integer in 0..127");
  }
  return value;
}

export function midiToPitchClass(midiNumber: number): PitchClassIdentity {
  return normalizePitchClass(assertMidiNumber(midiNumber));
}

export function midiToOctave(midiNumber: number): number {
  return Math.floor(assertMidiNumber(midiNumber) / 12) - 1;
}

export function exactPitch(midiNumber: number, spelling: PitchSpelling): ExactPitch {
  const midi = assertMidiNumber(midiNumber);
  return Object.freeze({
    midiNumber: midi,
    pitchClassIdentity: midiToPitchClass(midi),
    octave: midiToOctave(midi),
    spelling: Object.freeze({ ...spelling }),
  });
}
