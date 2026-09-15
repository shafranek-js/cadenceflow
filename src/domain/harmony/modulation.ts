/**
 * Modulation Master & Key Transition Navigator Domain Engine.
 *
 * Implements classical, jazz, and modern songwriting transition mechanics:
 * 1. Common Chord (Pivot) Modulation: Computes shared diatonic & modal interchange chords.
 * 2. Jazz Turnarounds: Target key ii-V-I cadential preparation.
 * 3. Tritone Substitution Bridges: subV7 chromatic half-step bass approach into target tonic.
 * 4. Chromatic Mediant Transitions: Cinematic third-related key voice leading.
 * 5. Direct Truck-Driver Lifts: +1 / +2 semitones anthemic chorus modulations with lead-in dominants.
 */

import {
  type BaseChordQuality,
  type HarmonicVariant,
} from "./chord";
import type { HarmonicModuleId } from "./functions";
import { normalizePitchClass, type PitchClassIdentity } from "./pitch";
import {
  defaultTonicSpelling,
  formatPitchSpelling,
  spellScaleDegree,
} from "./spelling";

export type ModulationStyle =
  | "pivot"
  | "jazz-turnaround"
  | "tritone-sub"
  | "chromatic-mediant"
  | "direct-lift";

export interface KeyRelationship {
  readonly intervalSemitones: number;
  readonly relationName: string;
  readonly description: string;
  readonly circleOfFifthsDistance: number;
  readonly isParallel: boolean;
  readonly isRelative: boolean;
  readonly isDominant: boolean;
  readonly isSubdominant: boolean;
  readonly isMediant: boolean;
  readonly isDirectLift: boolean;
}

export interface ModulationFunctionRef {
  readonly moduleId: HarmonicModuleId;
  readonly functionId: string;
  readonly roman: string;
}

export interface ModulationBridgeStep {
  readonly id: string;
  readonly chordSymbol: string;
  readonly role: "pivot" | "preparation" | "dominant" | "arrival";
  readonly rootPitchClass: number;
  readonly baseQuality: BaseChordQuality;
  readonly sourceFunction: ModulationFunctionRef;
  readonly targetFunction: ModulationFunctionRef;
  readonly harmonicVariant?: HarmonicVariant;
}

export interface ModulationPath {
  readonly id: string;
  readonly name: string;
  readonly category: ModulationStyle;
  readonly sourceTonic: PitchClassIdentity;
  readonly sourceModule: HarmonicModuleId;
  readonly targetTonic: PitchClassIdentity;
  readonly targetModule: HarmonicModuleId;
  readonly bridgeSteps: readonly ModulationBridgeStep[];
  readonly description: string;
  readonly smoothnessScore: number;
  readonly tags: readonly string[];
}

/**
 * Computes circle of fifths position for a key (0 for C, 1 for G, 2 for D, etc.).
 */
export function getCircleOfFifthsPosition(
  tonic: PitchClassIdentity,
  mode: HarmonicModuleId,
): number {
  const norm = normalizePitchClass(tonic);
  // For minor keys, the relative major is 3 semitones above
  const majorTonic = mode === "dark-harmony" ? normalizePitchClass(norm + 3) : norm;
  return (majorTonic * 7) % 12;
}

/**
 * Calculates distance on the circle of fifths between two keys (0 to 6).
 */
export function getCircleOfFifthsDistance(
  sourceTonic: PitchClassIdentity,
  sourceModule: HarmonicModuleId,
  targetTonic: PitchClassIdentity,
  targetModule: HarmonicModuleId,
): number {
  const p1 = getCircleOfFifthsPosition(sourceTonic, sourceModule);
  const p2 = getCircleOfFifthsPosition(targetTonic, targetModule);
  const diff = Math.abs(p1 - p2);
  return Math.min(diff, 12 - diff);
}

/**
 * Classifies musical relationship between source and target keys.
 */
export function getKeyRelationship(
  sourceTonic: PitchClassIdentity,
  sourceModule: HarmonicModuleId,
  targetTonic: PitchClassIdentity,
  targetModule: HarmonicModuleId,
): KeyRelationship {
  const sTonic = normalizePitchClass(sourceTonic);
  const tTonic = normalizePitchClass(targetTonic);
  const interval = (tTonic - sTonic + 12) % 12;
  const distance = getCircleOfFifthsDistance(sTonic, sourceModule, tTonic, targetModule);

  const isParallel = interval === 0 && sourceModule !== targetModule;
  const isRelative =
    (sourceModule === "progressions" && targetModule === "dark-harmony" && interval === 9) ||
    (sourceModule === "dark-harmony" && targetModule === "progressions" && interval === 3);
  const isDominant = interval === 7;
  const isSubdominant = interval === 5;
  const isMediant = interval === 3 || interval === 4 || interval === 8 || interval === 9;
  const isDirectLift = interval === 1 || interval === 2;

  let relationName = "Distant Key";
  let description = `Distant harmonic relationship (${distance} steps on circle of fifths).`;

  if (interval === 0) {
    if (isParallel) {
      relationName = targetModule === "progressions" ? "Parallel Major" : "Parallel Minor";
      description = "Shares identical tonic root with opposite modal quality.";
    } else {
      relationName = "Identical Key";
      description = "Same tonic and mode.";
    }
  } else if (isRelative) {
    relationName = targetModule === "progressions" ? "Relative Major" : "Relative Minor";
    description = "Shares identical key signature with 0 accidentals difference.";
  } else if (isDominant) {
    relationName = "Dominant (+7 semitones / 5th)";
    description = "Fifth above source tonic (+1 sharp / -1 flat difference).";
  } else if (isSubdominant) {
    relationName = "Subdominant (+5 semitones / 4th)";
    description = "Fourth above source tonic (+1 flat / -1 sharp difference).";
  } else if (isDirectLift) {
    relationName =
      interval === 1
        ? "Half-step Lift (+1 semitone)"
        : "Whole-step Lift (+2 semitones)";
    description =
      "Direct upward modulation common for high-energy final chorus transitions.";
  } else if (isMediant) {
    relationName =
      interval === 3 || interval === 4
        ? "Chromatic Mediant (Up)"
        : "Chromatic Mediant (Down)";
    description =
      "Third-related key shift producing expansive, cinematic emotional color.";
  }

  return Object.freeze({
    intervalSemitones: interval,
    relationName,
    description,
    circleOfFifthsDistance: distance,
    isParallel,
    isRelative,
    isDominant,
    isSubdominant,
    isMediant,
    isDirectLift,
  });
}

interface DiatonicChordSpec {
  readonly degree: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly interval: number; // semitones from tonic
  readonly quality: BaseChordQuality;
  readonly functionId: string;
  readonly roman: string;
  readonly isModal?: boolean;
}

const MAJOR_DIATONIC_SPECS: readonly DiatonicChordSpec[] = Object.freeze([
  { degree: 1, interval: 0, quality: "major", functionId: "I", roman: "I" },
  { degree: 2, interval: 2, quality: "minor", functionId: "ii", roman: "ii" },
  { degree: 3, interval: 4, quality: "minor", functionId: "iii", roman: "iii" },
  { degree: 4, interval: 5, quality: "major", functionId: "IV", roman: "IV" },
  { degree: 5, interval: 7, quality: "major", functionId: "V", roman: "V" },
  { degree: 6, interval: 9, quality: "minor", functionId: "vi", roman: "vi" },
  // Modal interchange chords
  { degree: 3, interval: 3, quality: "major", functionId: "bIII", roman: "♭III", isModal: true },
  { degree: 4, interval: 5, quality: "minor", functionId: "iv", roman: "iv", isModal: true },
  { degree: 6, interval: 8, quality: "major", functionId: "bVI", roman: "♭VI", isModal: true },
  { degree: 7, interval: 10, quality: "major", functionId: "bVII", roman: "♭VII", isModal: true },
]);

const MINOR_DIATONIC_SPECS: readonly DiatonicChordSpec[] = Object.freeze([
  { degree: 1, interval: 0, quality: "minor", functionId: "i", roman: "i" },
  { degree: 2, interval: 2, quality: "diminished", functionId: "ii°", roman: "ii°" },
  { degree: 3, interval: 3, quality: "major", functionId: "III", roman: "III" },
  { degree: 4, interval: 5, quality: "minor", functionId: "iv", roman: "iv" },
  { degree: 5, interval: 7, quality: "major", functionId: "V", roman: "V" },
  { degree: 5, interval: 7, quality: "minor", functionId: "v", roman: "v" },
  { degree: 6, interval: 8, quality: "major", functionId: "VI", roman: "VI" },
  { degree: 7, interval: 10, quality: "major", functionId: "VII", roman: "VII" },
]);

function getDiatonicSpecs(module: HarmonicModuleId): readonly DiatonicChordSpec[] {
  return module === "progressions" ? MAJOR_DIATONIC_SPECS : MINOR_DIATONIC_SPECS;
}

/**
 * Returns formatted key display string, e.g. "C Major" or "A Minor".
 */
export function formatKeyName(tonic: PitchClassIdentity, module: HarmonicModuleId): string {
  const spelling = defaultTonicSpelling(
    tonic,
    module === "progressions" ? "major" : "tonal-minor",
  );
  return `${formatPitchSpelling(spelling)} ${module === "progressions" ? "Major" : "Minor"}`;
}

/**
 * Computes root pitch class and chord symbol for a diatonic chord in a key.
 */
function realizeDiatonicChord(
  tonic: PitchClassIdentity,
  module: HarmonicModuleId,
  spec: DiatonicChordSpec,
): { readonly rootPitchClass: number; readonly symbol: string } {
  const rootPc = normalizePitchClass(tonic + spec.interval);
  const spelling = spellScaleDegree(
    tonic,
    module === "progressions" ? "major" : "tonal-minor",
    spec.degree,
    spec.isModal && (spec.degree === 3 || spec.degree === 6 || spec.degree === 7) ? -1 : 0,
  );
  const rootName = formatPitchSpelling(spelling);
  let suffix = "";
  if (spec.quality === "minor") suffix = "m";
  else if (spec.quality === "diminished") suffix = "°";
  else if (spec.quality === "dominant") suffix = "7";
  return {
    rootPitchClass: rootPc,
    symbol: `${rootName}${suffix}`,
  };
}

/**
 * Creates a dominant seventh chord step targeting a given pitch class.
 */
function createDominantStep(
  targetTonic: PitchClassIdentity,
  targetModule: HarmonicModuleId,
  sourceTonic: PitchClassIdentity,
  sourceModule: HarmonicModuleId,
  idSuffix: string,
): ModulationBridgeStep {
  const dominantRootPc = normalizePitchClass(targetTonic + 7);
  const dominantSpelling = spellScaleDegree(
    targetTonic,
    targetModule === "progressions" ? "major" : "tonal-minor",
    5,
  );
  const symbol = `${formatPitchSpelling(dominantSpelling)}7`;

  // Calculate source function if possible
  const diffFromSource = (dominantRootPc - normalizePitchClass(sourceTonic) + 12) % 12;
  let sourceRoman = "V7(new)";
  let sourceFuncId = "V7";
  if (sourceModule === "progressions") {
    if (diffFromSource === 7) {
      sourceRoman = "V7";
      sourceFuncId = "V7";
    } else if (diffFromSource === 2) {
      sourceRoman = "V7/V";
      sourceFuncId = "V7/V";
    } else if (diffFromSource === 9) {
      sourceRoman = "V7/ii";
      sourceFuncId = "V7/ii";
    } else if (diffFromSource === 4) {
      sourceRoman = "V7/vi";
      sourceFuncId = "V7/vi";
    } else if (diffFromSource === 0) {
      sourceRoman = "V7/IV";
      sourceFuncId = "V7/IV";
    } else if (diffFromSource === 11) {
      sourceRoman = "V7/iii";
      sourceFuncId = "V7/iii";
    } else {
      sourceRoman = `V7/(${symbol.replace("7", "")})`;
      sourceFuncId = "V7";
    }
  }

  return Object.freeze({
    id: `mod-dom-${idSuffix}`,
    chordSymbol: symbol,
    role: "dominant",
    rootPitchClass: dominantRootPc,
    baseQuality: "dominant",
    sourceFunction: Object.freeze({
      moduleId: sourceModule,
      functionId: sourceFuncId,
      roman: sourceRoman,
    }),
    targetFunction: Object.freeze({
      moduleId: targetModule,
      functionId: "V7",
      roman: "V7",
    }),
  });
}

/**
 * Creates the target arrival chord step.
 */
function createArrivalStep(
  targetTonic: PitchClassIdentity,
  targetModule: HarmonicModuleId,
  sourceTonic: PitchClassIdentity,
  sourceModule: HarmonicModuleId,
  idSuffix: string,
): ModulationBridgeStep {
  const arrivalTonic = normalizePitchClass(targetTonic);
  const spelling = defaultTonicSpelling(
    arrivalTonic,
    targetModule === "progressions" ? "major" : "tonal-minor",
  );
  const symbol = `${formatPitchSpelling(spelling)}${targetModule === "progressions" ? "" : "m"}`;
  const diffFromSource = (arrivalTonic - normalizePitchClass(sourceTonic) + 12) % 12;

  let sourceRoman = targetModule === "progressions" ? "I(new)" : "i(new)";
  let sourceFuncId = targetModule === "progressions" ? "I" : "i";
  if (sourceModule === "progressions") {
    if (diffFromSource === 0) {
      sourceRoman = targetModule === "progressions" ? "I" : "i";
      sourceFuncId = "I";
    } else if (diffFromSource === 7) {
      sourceRoman = "V";
      sourceFuncId = "V";
    } else if (diffFromSource === 5) {
      sourceRoman = "IV";
      sourceFuncId = "IV";
    } else if (diffFromSource === 9) {
      sourceRoman = "vi";
      sourceFuncId = "vi";
    } else if (diffFromSource === 2) {
      sourceRoman = "ii";
      sourceFuncId = "ii";
    } else if (diffFromSource === 4) {
      sourceRoman = "iii";
      sourceFuncId = "iii";
    } else if (diffFromSource === 3) {
      sourceRoman = "♭III";
      sourceFuncId = "bIII";
    } else if (diffFromSource === 8) {
      sourceRoman = "♭VI";
      sourceFuncId = "bVI";
    } else if (diffFromSource === 10) {
      sourceRoman = "♭VII";
      sourceFuncId = "bVII";
    }
  }

  return Object.freeze({
    id: `mod-arrival-${idSuffix}`,
    chordSymbol: symbol,
    role: "arrival",
    rootPitchClass: arrivalTonic,
    baseQuality: targetModule === "progressions" ? "major" : "minor",
    sourceFunction: Object.freeze({
      moduleId: sourceModule,
      functionId: sourceFuncId,
      roman: sourceRoman,
    }),
    targetFunction: Object.freeze({
      moduleId: targetModule,
      functionId: targetModule === "progressions" ? "I" : "i",
      roman: targetModule === "progressions" ? "I" : "i",
    }),
  });
}

/**
 * Generates all musically sound modulation paths from Source Key to Target Key.
 */
export function getAvailableModulations(
  sourceTonic: PitchClassIdentity,
  sourceModule: HarmonicModuleId,
  targetTonic: PitchClassIdentity,
  targetModule: HarmonicModuleId,
): readonly ModulationPath[] {
  const sTonic = normalizePitchClass(sourceTonic);
  const tTonic = normalizePitchClass(targetTonic);

  // If source and target are completely identical, return empty list
  if (sTonic === tTonic && sourceModule === targetModule) {
    return Object.freeze([]);
  }

  const relationship = getKeyRelationship(sTonic, sourceModule, tTonic, targetModule);
  const targetKeyName = formatKeyName(tTonic, targetModule);
  const sourceKeyName = formatKeyName(sTonic, sourceModule);
  const paths: ModulationPath[] = [];

  const sourceSpecs = getDiatonicSpecs(sourceModule);
  const targetSpecs = getDiatonicSpecs(targetModule);

  // -------------------------------------------------------------
  // 1. Common Chord (Pivot) Modulations
  // -------------------------------------------------------------
  const pivotMatches: Array<{
    readonly sourceSpec: DiatonicChordSpec;
    readonly targetSpec: DiatonicChordSpec;
    readonly chordSymbol: string;
    readonly rootPitchClass: number;
  }> = [];

  for (const sSpec of sourceSpecs) {
    const sChord = realizeDiatonicChord(sTonic, sourceModule, sSpec);
    for (const tSpec of targetSpecs) {
      const tChord = realizeDiatonicChord(tTonic, targetModule, tSpec);
      if (
        sChord.rootPitchClass === tChord.rootPitchClass &&
        sSpec.quality === tSpec.quality
      ) {
        // Avoid trivial match where the pivot is the arrival tonic itself unless needed
        pivotMatches.push({
          sourceSpec: sSpec,
          targetSpec: tSpec,
          chordSymbol: sChord.symbol,
          rootPitchClass: sChord.rootPitchClass,
        });
      }
    }
  }

  // Filter and sort pivot chords (prefer subdominant group: ii, IV, iv in target key)
  const sortedPivots = [...pivotMatches].sort((a, b) => {
    // Prefer target degrees 2, 4 (predominant functions)
    const scoreA =
      (a.targetSpec.degree === 2 ? 10 : 0) +
      (a.targetSpec.degree === 4 ? 8 : 0) +
      (a.targetSpec.degree === 6 ? 5 : 0) -
      (a.sourceSpec.isModal ? 2 : 0);
    const scoreB =
      (b.targetSpec.degree === 2 ? 10 : 0) +
      (b.targetSpec.degree === 4 ? 8 : 0) +
      (b.targetSpec.degree === 6 ? 5 : 0) -
      (b.sourceSpec.isModal ? 2 : 0);
    return scoreB - scoreA;
  });

  for (let i = 0; i < Math.min(sortedPivots.length, 3); i++) {
    const match = sortedPivots[i]!;
    const pivotStep: ModulationBridgeStep = Object.freeze({
      id: `mod-pivot-${i}`,
      chordSymbol: match.chordSymbol,
      role: "pivot",
      rootPitchClass: match.rootPitchClass,
      baseQuality: match.sourceSpec.quality,
      sourceFunction: Object.freeze({
        moduleId: sourceModule,
        functionId: match.sourceSpec.functionId,
        roman: match.sourceSpec.roman,
      }),
      targetFunction: Object.freeze({
        moduleId: targetModule,
        functionId: match.targetSpec.functionId,
        roman: match.targetSpec.roman,
      }),
    });

    const dominantStep = createDominantStep(tTonic, targetModule, sTonic, sourceModule, `pivot-${i}`);
    const arrivalStep = createArrivalStep(tTonic, targetModule, sTonic, sourceModule, `pivot-${i}`);

    const isModalBorrow = match.sourceSpec.isModal;
    const pathName = isModalBorrow
      ? `Modal Pivot (${match.chordSymbol} = ${match.sourceSpec.roman} / ${match.targetSpec.roman}) → V7 → ${arrivalStep.chordSymbol}`
      : `Common Chord Pivot (${match.chordSymbol} = ${match.sourceSpec.roman} / ${match.targetSpec.roman}) → V7 → ${arrivalStep.chordSymbol}`;

    const score = Math.max(78, 98 - relationship.circleOfFifthsDistance * 4 - (isModalBorrow ? 5 : 0));

    paths.push(
      Object.freeze({
        id: `pivot-${match.sourceSpec.functionId}-${match.targetSpec.functionId}`,
        name: pathName,
        category: "pivot",
        sourceTonic: sTonic,
        sourceModule,
        targetTonic: tTonic,
        targetModule,
        bridgeSteps: Object.freeze([pivotStep, dominantStep, arrivalStep]),
        description: isModalBorrow
          ? `Uses borrowed modal chord ${match.chordSymbol} (${match.sourceSpec.roman} in ${sourceKeyName}) as a smooth diatonic ${match.targetSpec.roman} in ${targetKeyName}, followed by authentic dominant resolution.`
          : `The pivot chord ${match.chordSymbol} belongs natively to both keys (${match.sourceSpec.roman} in ${sourceKeyName} and ${match.targetSpec.roman} in ${targetKeyName}), masking the key boundary with zero harmonic friction.`,
        smoothnessScore: score,
        tags: Object.freeze(["Pivot Chord", "Smooth", "Classical", "Pop"]),
      }),
    );
  }

  // -------------------------------------------------------------
  // 2. Jazz Turnaround (ii - V7 - I)
  // -------------------------------------------------------------
  const targetDegree2 = 2;
  const targetDegree2Quality = targetModule === "progressions" ? "minor" : "diminished";
  const targetDegree2Roman = targetModule === "progressions" ? "ii" : "ii°";
  const targetDegree2FuncId = targetModule === "progressions" ? "ii" : "ii°";

  const iiSpelling = spellScaleDegree(
    tTonic,
    targetModule === "progressions" ? "major" : "tonal-minor",
    targetDegree2 as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  );
  const iiPc = normalizePitchClass(tTonic + 2);
  const iiSymbol = `${formatPitchSpelling(iiSpelling)}${targetDegree2Quality === "minor" ? "m" : "°"}`;

  const iiStep: ModulationBridgeStep = Object.freeze({
    id: "mod-turnaround-ii",
    chordSymbol: iiSymbol,
    role: "preparation",
    rootPitchClass: iiPc,
    baseQuality: targetDegree2Quality,
    sourceFunction: Object.freeze({
      moduleId: sourceModule,
      functionId: "ii",
      roman: `${targetDegree2Roman}(new)`,
    }),
    targetFunction: Object.freeze({
      moduleId: targetModule,
      functionId: targetDegree2FuncId,
      roman: targetDegree2Roman,
    }),
  });

  const turnaroundDom = createDominantStep(tTonic, targetModule, sTonic, sourceModule, "turnaround");
  const turnaroundArrival = createArrivalStep(tTonic, targetModule, sTonic, sourceModule, "turnaround");

  paths.push(
    Object.freeze({
      id: "jazz-turnaround-ii-v-i",
      name: `Jazz Turnaround (${iiSymbol} → ${turnaroundDom.chordSymbol} → ${turnaroundArrival.chordSymbol})`,
      category: "jazz-turnaround",
      sourceTonic: sTonic,
      sourceModule,
      targetTonic: tTonic,
      targetModule,
      bridgeSteps: Object.freeze([iiStep, turnaroundDom, turnaroundArrival]),
      description: `Announces ${targetKeyName} using its native authentic turnaround (${targetDegree2Roman} → V7 → ${turnaroundArrival.targetFunction.roman}), firmly establishing the new tonic center.`,
      smoothnessScore: 88,
      tags: Object.freeze(["Jazz", "Neo-Soul", "Authentic Cadence", "Turnaround"]),
    }),
  );

  // -------------------------------------------------------------
  // 3. Tritone Substitution Bridge (subV7 -> Target)
  // -------------------------------------------------------------
  const subV7Pc = normalizePitchClass(tTonic + 1);
  const subV7Spelling = spellScaleDegree(
    tTonic,
    targetModule === "progressions" ? "major" : "tonal-minor",
    2,
    -1,
  );
  const subV7Symbol = `${formatPitchSpelling(subV7Spelling)}7`;

  const subV7Step: ModulationBridgeStep = Object.freeze({
    id: "mod-tritone-sub",
    chordSymbol: subV7Symbol,
    role: "dominant",
    rootPitchClass: subV7Pc,
    baseQuality: "dominant",
    sourceFunction: Object.freeze({
      moduleId: sourceModule,
      functionId: "subV7",
      roman: "subV7",
    }),
    targetFunction: Object.freeze({
      moduleId: targetModule,
      functionId: "subV7",
      roman: "subV7",
    }),
  });

  const tritoneArrival = createArrivalStep(tTonic, targetModule, sTonic, sourceModule, "tritone");

  paths.push(
    Object.freeze({
      id: "tritone-sub-bridge",
      name: `Tritone Substitution (${subV7Symbol} → ${tritoneArrival.chordSymbol})`,
      category: "tritone-sub",
      sourceTonic: sTonic,
      sourceModule,
      targetTonic: tTonic,
      targetModule,
      bridgeSteps: Object.freeze([subV7Step, tritoneArrival]),
      description: `Replaces target V7 with its chromatic tritone substitute (${subV7Symbol}), creating an ultra-smooth chromatic half-step bassline descent (♭II7 → I) into ${targetKeyName}.`,
      smoothnessScore: 85,
      tags: Object.freeze(["Tritone Sub", "Chromatic Bass", "Modern Jazz", "Gospel"]),
    }),
  );

  // -------------------------------------------------------------
  // 4. Chromatic Mediant & Direct Lift
  // -------------------------------------------------------------
  if (relationship.isMediant) {
    // Chromatic Mediant direct path
    const mediantArrival = createArrivalStep(tTonic, targetModule, sTonic, sourceModule, "mediant");
    paths.push(
      Object.freeze({
        id: "chromatic-mediant-cinematic",
        name: `Cinematic Mediant Lift (→ ${mediantArrival.chordSymbol})`,
        category: "chromatic-mediant",
        sourceTonic: sTonic,
        sourceModule,
        targetTonic: tTonic,
        targetModule,
        bridgeSteps: Object.freeze([mediantArrival]),
        description: `Direct third-related shift into ${targetKeyName}. Shares a common harmonic pivot note while shifting the surrounding voices by half-step, evoking cinematic grandeur.`,
        smoothnessScore: 82,
        tags: Object.freeze(["Cinematic", "Film Score", "Chromatic Mediant", "Wonder"]),
      }),
    );
  }

  if (relationship.isDirectLift || relationship.intervalSemitones === 1 || relationship.intervalSemitones === 2) {
    // Truck-driver gear change lift
    const liftDom = createDominantStep(tTonic, targetModule, sTonic, sourceModule, "lift");
    const liftArrival = createArrivalStep(tTonic, targetModule, sTonic, sourceModule, "lift");

    paths.push(
      Object.freeze({
        id: "direct-truck-driver-lift",
        name: `Anthemic Lift (+${relationship.intervalSemitones} semitone${relationship.intervalSemitones > 1 ? "s" : ""}) (${liftDom.chordSymbol} → ${liftArrival.chordSymbol})`,
        category: "direct-lift",
        sourceTonic: sTonic,
        sourceModule,
        targetTonic: tTonic,
        targetModule,
        bridgeSteps: Object.freeze([liftDom, liftArrival]),
        description: `Classic anthemic pop key modulation ("truck driver's gear shift"). The preparatory dominant ${liftDom.chordSymbol} creates irresistible forward momentum into the high-energy chorus in ${targetKeyName}.`,
        smoothnessScore: 80,
        tags: Object.freeze(["Truck Driver", "Pop Anthem", "High Energy", "Chorus Lift"]),
      }),
    );
  }

  // Ensure paths are sorted by smoothness score descending
  return Object.freeze(paths.sort((a, b) => b.smoothnessScore - a.smoothnessScore));
}

/**
 * Returns a human-friendly category badge for a ModulationStyle.
 */
export function getModulationCategoryBadge(category: ModulationStyle): {
  readonly label: string;
  readonly className: string;
} {
  switch (category) {
    case "pivot":
      return Object.freeze({ label: "Common Chord", className: "mod-badge-pivot" });
    case "jazz-turnaround":
      return Object.freeze({ label: "Jazz Turnaround", className: "mod-badge-turnaround" });
    case "tritone-sub":
      return Object.freeze({ label: "Tritone Bridge", className: "mod-badge-tritone" });
    case "chromatic-mediant":
      return Object.freeze({ label: "Chromatic Mediant", className: "mod-badge-mediant" });
    case "direct-lift":
      return Object.freeze({ label: "Anthemic Lift", className: "mod-badge-lift" });
  }
}
