export interface PianoRollPitchBounds {
  readonly min: number;
  readonly max: number;
}

export function derivePianoRollPitchBounds(
  pitches: readonly number[],
  tonicPitchClass: number,
  manualOctaves = 0,
  gestureExpansionOctaves = 0,
): PianoRollPitchBounds {
  const fallback = 60 + (((tonicPitchClass % 12) + 12) % 12);
  const low = pitches.length ? Math.min(...pitches) : fallback;
  const high = pitches.length ? Math.max(...pitches) : fallback;
  const expansion = Math.max(0, manualOctaves + gestureExpansionOctaves) * 12;
  return {
    min: Math.max(0, low - 1 - expansion),
    max: Math.min(127, high + 1 + expansion),
  };
}

export function requiredPianoRollPitchExpansion(
  pitch: number,
  baseBounds: PianoRollPitchBounds,
  currentExpansion: number,
): number {
  const distance = Math.max(baseBounds.min - pitch, pitch - baseBounds.max, 0);
  return Math.min(10, Math.max(currentExpansion, Math.ceil(distance / 12)));
}
