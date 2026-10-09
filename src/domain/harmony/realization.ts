import type { ChordDefinition } from "./chord";
import type { HarmonicFunctionIdentity } from "./functions";
import type { PitchClassIdentity } from "./pitch";
import { realizeDarkHarmonyChord } from "./modules/darkHarmony";
import { realizeProgressionsChord } from "./modules/progressions";
import { computeModalChords } from "./modes";

const BORROWED_MODE_FUNCTION_ID =
  /^mode-(ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian)-([1-7])$/;

export function realizeChord(
  identity: HarmonicFunctionIdentity,
  tonic: PitchClassIdentity,
): ChordDefinition {
  const encodedBorrow = identity.functionId.match(BORROWED_MODE_FUNCTION_ID);
  const mode =
    identity.borrowedFromMode ??
    (encodedBorrow?.[1] as HarmonicFunctionIdentity["borrowedFromMode"] | undefined);
  const degree =
    identity.borrowedDegree ?? (encodedBorrow?.[2] ? Number(encodedBorrow[2]) : undefined);
  if (mode !== undefined && degree !== undefined) {
    const borrowed = computeModalChords(tonic, mode).find((chord) => chord.degree === degree);
    if (!borrowed) {
      throw new RangeError(`Unsupported borrowed chord degree ${degree} in ${mode}`);
    }
    return Object.freeze({
      ...borrowed.chord,
      harmonicFunction: Object.freeze({
        ...identity,
        borrowedFromMode: mode,
        borrowedDegree: degree as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      }),
    });
  }
  return identity.moduleId === "progressions"
    ? realizeProgressionsChord(identity.functionId, tonic)
    : realizeDarkHarmonyChord(identity.functionId, tonic);
}
