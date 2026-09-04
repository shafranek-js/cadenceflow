import type { HarmonicModuleId } from "../harmony/functions";
import type { CompositionIntent } from "../progression/branch";

export interface IntentAdjustment {
  readonly amount: number;
  readonly code: string;
}

const TONICS: Readonly<Record<HarmonicModuleId, readonly string[]>> = {
  progressions: ["I"],
  "dark-harmony": ["i"],
};

export function intentAdjustment(
  intent: CompositionIntent,
  moduleId: HarmonicModuleId,
  _from: string,
  to: string,
): IntentAdjustment | null {
  if (intent === "neutral") return null;
  if (intent === "resolve") {
    if (TONICS[moduleId].includes(to)) return { amount: 18, code: "intent-resolve" };
    if (to === "V" || to === "vii°") return { amount: 6, code: "intent-resolve-setup" };
    return null;
  }
  if (intent === "build-tension") {
    if (
      to === "V" ||
      to === "vii°" ||
      to.startsWith("V7/") ||
      to.startsWith("vii°7/") ||
      to === "N6"
    )
      return { amount: 16, code: "intent-build-tension" };
    return null;
  }
  if (intent === "darken-emotional") {
    if (["iv", "bVI", "bVII", "N6", "CT°7", "Pass°7", "ChrMed+M3", "ChrMed-m3↓"].includes(to))
      return { amount: 14, code: "intent-darken" };
    return null;
  }
  if (intent === "surprise") {
    if (["vi", "VI", "bIII", "bVI", "bVII", "ChrMed+M3", "ChrMed-m3↓"].includes(to))
      return { amount: 13, code: "intent-surprise" };
    if (TONICS[moduleId].includes(to)) return { amount: -6, code: "intent-surprise-avoid-obvious" };
    return null;
  }
  if (intent === "smooth-voice-leading") {
    if (["ii", "iii", "IV", "vi", "ii°", "III", "iv", "VI"].includes(to))
      return { amount: 8, code: "intent-smooth-voice-leading" };
    return null;
  }
  return null;
}
