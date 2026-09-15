import { normalizePitchClass, type PitchClassIdentity } from "../../harmony/pitch";
import { GUITAR_STANDARD_TUNING, getFretPitchClass, getGuitarPitch } from "./tuning";
import type { GuitarChordVoicing, GuitarFretItem } from "./voicings";

export interface ComputeScaleTonesOptions {
  /** Maximum number of scale tones to display per string to avoid visual crowding */
  readonly maxPerString?: number;
}

/**
 * Computes in-position scale tones within the active chord fretboard box.
 * ChordFiles signature feature: displays the diatonic scale context surrounding
 * the chord shape for melodic fills and improvisation in that position.
 */
export function getInPositionScaleTones(
  voicing: GuitarChordVoicing,
  scalePitchClasses: readonly PitchClassIdentity[],
  options?: ComputeScaleTonesOptions,
): readonly GuitarFretItem[] {
  const normalizedScale = new Set(scalePitchClasses.map(normalizePitchClass));
  const maxPerString = options?.maxPerString ?? 2;
  const startFret = voicing.baseFret;
  const endFret = startFret + voicing.fretSpan - 1;

  const scaleToneItems: GuitarFretItem[] = [];

  for (let stringIdx = 0; stringIdx < 6; stringIdx++) {
    const stringInfo = GUITAR_STANDARD_TUNING[stringIdx]!;
    const chordFretOnString = voicing.frets[stringIdx];
    let stringCount = 0;

    for (let fret = startFret; fret <= endFret; fret++) {
      // Don't duplicate the fret already played in the chord on this string
      if (fret === chordFretOnString) continue;

      const pc = getFretPitchClass(stringIdx, fret);
      if (normalizedScale.has(pc)) {
        const pitch = getGuitarPitch(stringIdx, fret);
        scaleToneItems.push({
          stringIndex: stringIdx,
          stringNumber: stringInfo.stringNumber,
          fret,
          role: "scale-tone",
          pitchClass: pc,
          pitch,
        });

        stringCount++;
        if (stringCount >= maxPerString) break;
      }
    }
  }

  return Object.freeze(scaleToneItems);
}
