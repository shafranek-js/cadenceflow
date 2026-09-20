import type { ChordDefinition } from "../harmony/chord";
import type { ExactPitch } from "../harmony/pitch";

/**
 * Applies the bass actually selected by a progression step to its chord
 * projection. Authored performance settings are authoritative over a module's
 * semantic default (for example N6 auto = Db/F, root override = Db).
 */
export function withEffectiveBass(
  chord: ChordDefinition,
  bassPitch: ExactPitch | undefined,
): ChordDefinition {
  if (!bassPitch) return chord;

  const isRootBass = bassPitch.pitchClassIdentity === chord.rootPitchClass;
  const {
    bassScaleDegree: _bassScaleDegree,
    bassPitchClass: _bassPitchClass,
    bassSpelling: _bassSpelling,
    ...chordWithoutBass
  } = chord;
  return Object.freeze({
    ...chordWithoutBass,
    ...(isRootBass
      ? {}
      : {
          bassPitchClass: bassPitch.pitchClassIdentity,
          bassSpelling: bassPitch.spelling,
        }),
  });
}
