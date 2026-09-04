import type { ChordDefinition } from "./chord";
import type { HarmonicFunctionIdentity } from "./functions";
import type { PitchClassIdentity } from "./pitch";
import { realizeDarkHarmonyChord } from "./modules/darkHarmony";
import { realizeProgressionsChord } from "./modules/progressions";

export function realizeChord(
  identity: HarmonicFunctionIdentity,
  tonic: PitchClassIdentity,
): ChordDefinition {
  return identity.moduleId === "progressions"
    ? realizeProgressionsChord(identity.functionId, tonic)
    : realizeDarkHarmonyChord(identity.functionId, tonic);
}
