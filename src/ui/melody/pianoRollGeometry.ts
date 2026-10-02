import type { PianoRollPitchBounds } from "./pianoRollPitchRange";

export type PianoRollPitchGridMode = "degrees" | "chromatic";
export type PianoRollScaleMode = "major" | "minor";

const SCALE_STEPS: Record<PianoRollScaleMode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const CHROMATIC_STEPS = Array.from({ length: 12 }, (_, index) => index);

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function isScalePitch(midi: number, tonic: number, mode: PianoRollScaleMode): boolean {
  return SCALE_STEPS[mode].includes(mod12(midi - tonic));
}

function scaleCoordinate(midi: number, tonic: number, mode: PianoRollScaleMode): number {
  const relative = midi - mod12(tonic);
  const octave = Math.floor(relative / 12);
  const pitchClass = mod12(relative);
  const steps = SCALE_STEPS[mode];
  const exactIndex = steps.indexOf(pitchClass);
  if (exactIndex >= 0) return octave * steps.length + exactIndex;
  const lowerIndex = steps.findLastIndex((step) => step < pitchClass);
  return octave * steps.length + lowerIndex + 0.5;
}

function adjacentScalePitch(
  midi: number,
  tonic: number,
  mode: PianoRollScaleMode,
  direction: -1 | 1,
): number {
  for (let distance = 1; distance <= 2; distance += 1) {
    const candidate = midi + distance * direction;
    if (candidate >= 0 && candidate <= 127 && isScalePitch(candidate, tonic, mode))
      return candidate;
  }
  return Math.max(0, Math.min(127, midi + direction));
}

export function derivePianoRollScalePitchBounds(
  pitches: readonly number[],
  tonic: number,
  mode: PianoRollScaleMode,
  manualOctaves = 0,
  gestureExpansionOctaves = 0,
): PianoRollPitchBounds {
  const fallback = 60 + mod12(tonic);
  const low = pitches.length ? Math.min(...pitches) : fallback;
  const high = pitches.length ? Math.max(...pitches) : fallback;
  const lowAnchor = adjacentScalePitch(low, tonic, mode, -1);
  const highAnchor = adjacentScalePitch(high, tonic, mode, 1);
  const expansion = Math.max(0, manualOctaves + gestureExpansionOctaves) * 12;
  return {
    min: Math.max(0, lowAnchor - expansion),
    max: Math.min(127, highAnchor + expansion),
  };
}

export interface PianoRollPitchGeometry {
  readonly minPitch: number;
  readonly maxPitch: number;
  readonly unitCount: number;
  readonly unitsPerOctave: number;
  pitchCoordinate(midi: number): number;
  isDiatonicPitch(midi: number): boolean;
  rowStart(midi: number): number;
  rowSpan(midi: number): number;
  pitchAtYFraction(fraction: number): number;
}

export function createPianoRollPitchGeometry(
  minPitch: number,
  maxPitch: number,
  tonic: number,
  mode: PianoRollScaleMode,
  gridMode: PianoRollPitchGridMode,
): PianoRollPitchGeometry {
  const clampedMin = Math.max(0, Math.min(127, minPitch));
  const clampedMax = Math.max(clampedMin, Math.min(127, maxPitch));
  const coordinate = (midi: number): number => {
    if (gridMode === "chromatic") return midi;
    return scaleCoordinate(midi, tonic, mode);
  };
  const span = (_midi: number): number => 1;
  const topCoordinate = coordinate(clampedMax);
  const bottomCoordinate = coordinate(clampedMin);
  const unitCount = Math.max(1, topCoordinate - bottomCoordinate + span(clampedMin));
  const rowStart = (midi: number) => topCoordinate - coordinate(midi);
  const pitchAtYFraction = (fraction: number): number => {
    const targetY = fraction * unitCount;
    let nearest = clampedMin;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let midi = 0; midi <= 127; midi += 1) {
      const centerY = topCoordinate - coordinate(midi) + span(midi) / 2;
      const distance = Math.abs(centerY - targetY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = midi;
      }
    }
    return nearest;
  };
  return {
    minPitch: clampedMin,
    maxPitch: clampedMax,
    unitCount,
    unitsPerOctave: gridMode === "degrees" ? SCALE_STEPS[mode].length : 12,
    pitchCoordinate: coordinate,
    isDiatonicPitch: (midi) => gridMode === "chromatic" || isScalePitch(midi, tonic, mode),
    rowStart,
    rowSpan: span,
    pitchAtYFraction,
  };
}

export function pianoRollPitchRows(
  minPitch: number,
  maxPitch: number,
  geometry: PianoRollPitchGeometry,
): readonly number[] {
  return Array.from({ length: maxPitch - minPitch + 1 }, (_, index) => maxPitch - index).filter(
    (pitch) => pitch >= geometry.minPitch && geometry.isDiatonicPitch(pitch),
  );
}

export function pianoRollPitchScaleSteps(mode: PianoRollScaleMode): readonly number[] {
  return SCALE_STEPS[mode] ?? CHROMATIC_STEPS;
}
