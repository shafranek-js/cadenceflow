import type { ProgressionStep } from "./step";
import type { PitchClassIdentity } from "../harmony/pitch";
import type { DerivedMode } from "../harmony/functions";
import { realizeChord } from "../harmony/realization";
import { normalizePitchClass, exactPitch } from "../harmony/pitch";
import { defaultTonicSpelling } from "../harmony/spelling";
import type { StepPatch } from "../../app/commands/progressionCommands";
import type { BassChoice } from "./step";

export type VoiceLeadingStrategy =
  | "smooth-all"
  | "smooth-upper"
  | "pedal-tonic"
  | "pedal-dominant"
  | "reset-root";

export interface VoiceLeadingOptimizationResult {
  readonly updates: ReadonlyArray<{
    readonly stepId: string;
    readonly patch: StepPatch;
  }>;
  readonly description: string;
}

interface BassCandidate {
  readonly choice: BassChoice;
  readonly pitchClass: PitchClassIdentity;
  readonly inversionIndex: number;
}

function getBassCandidates(
  rootPc: PitchClassIdentity,
  baseQuality: string,
  seventhKind?: string,
): readonly BassCandidate[] {
  const candidates: BassCandidate[] = [
    { choice: "root", pitchClass: rootPc, inversionIndex: 0 },
  ];

  // 3rd
  const thirdInterval = baseQuality === "minor" || baseQuality === "diminished" ? 3 : 4;
  candidates.push({
    choice: "third",
    pitchClass: normalizePitchClass(rootPc + thirdInterval),
    inversionIndex: 1,
  });

  // 5th
  let fifthInterval = 7;
  if (baseQuality === "diminished") fifthInterval = 6;
  if (baseQuality === "augmented") fifthInterval = 8;
  candidates.push({
    choice: "fifth",
    pitchClass: normalizePitchClass(rootPc + fifthInterval),
    inversionIndex: 2,
  });

  // 7th
  let seventhInterval: number | null = null;
  if (seventhKind) {
    switch (seventhKind) {
      case "minor7":
      case "half-diminished7":
        seventhInterval = 10;
        break;
      case "major7":
        seventhInterval = 11;
        break;
      case "diminished7":
        seventhInterval = 9;
        break;
    }
  } else if (baseQuality === "dominant") {
    seventhInterval = 10;
  }

  if (seventhInterval !== null) {
    candidates.push({
      choice: "seventh",
      pitchClass: normalizePitchClass(rootPc + seventhInterval),
      inversionIndex: 3,
    });
  }

  return candidates;
}

function computeBassDistance(pcA: PitchClassIdentity, pcB: PitchClassIdentity): number {
  const diff = Math.abs(pcA - pcB);
  return Math.min(diff, 12 - diff);
}

/**
 * Optimizes chord progressions for voice leading and bassline continuity.
 */
export function optimizeProgressionVoiceLeading(
  steps: readonly ProgressionStep[],
  tonic: PitchClassIdentity,
  mode: DerivedMode = "major",
  strategy: VoiceLeadingStrategy = "smooth-all",
): VoiceLeadingOptimizationResult {
  const chordSteps = steps.filter((s): s is Extract<ProgressionStep, { kind: "chord" }> => s.kind === "chord");
  if (chordSteps.length === 0) {
    return { updates: [], description: "No chords to optimize" };
  }

  const updates: Array<{ stepId: string; patch: StepPatch }> = [];

  if (strategy === "reset-root") {
    for (const step of chordSteps) {
      updates.push({
        stepId: step.id,
        patch: {
          performance: {
            ...step.performance,
            inversion: 0,
            bass: {
              ...step.performance.bass,
              choice: "root",
            },
          },
        },
      });
    }
    return {
      updates: Object.freeze(updates),
      description: "Reset all chords to root position",
    };
  }

  if (strategy === "smooth-upper") {
    for (const step of chordSteps) {
      updates.push({
        stepId: step.id,
        patch: {
          performance: {
            ...step.performance,
            inversion: "auto",
            bass: {
              ...step.performance.bass,
              choice: "root",
            },
          },
        },
      });
    }
    return {
      updates: Object.freeze(updates),
      description: "Applied smooth upper voice leading with root bass",
    };
  }

  if (strategy === "pedal-tonic") {
    const tonicSpelling = defaultTonicSpelling(tonic, mode);
    const pedalPitch = exactPitch(36 + tonic, tonicSpelling); // Octave 2
    for (const step of chordSteps) {
      updates.push({
        stepId: step.id,
        patch: {
          performance: {
            ...step.performance,
            inversion: "auto",
            bass: {
              ...step.performance.bass,
              choice: "custom",
              customPitch: pedalPitch,
            },
          },
        },
      });
    }
    return {
      updates: Object.freeze(updates),
      description: "Applied tonic pedal point across progression",
    };
  }

  if (strategy === "pedal-dominant") {
    const dominantPc = normalizePitchClass(tonic + 7);
    const dominantSpelling = defaultTonicSpelling(dominantPc, "major");
    const pedalPitch = exactPitch(36 + dominantPc, dominantSpelling); // Octave 2
    for (const step of chordSteps) {
      updates.push({
        stepId: step.id,
        patch: {
          performance: {
            ...step.performance,
            inversion: "auto",
            bass: {
              ...step.performance.bass,
              choice: "custom",
              customPitch: pedalPitch,
            },
          },
        },
      });
    }
    return {
      updates: Object.freeze(updates),
      description: "Applied dominant pedal point across progression",
    };
  }

  // Strategy: "smooth-all" (Smooth Stepwise Bassline & Voice Leading)
  let prevBassPc: PitchClassIdentity | null = null;

  for (let i = 0; i < chordSteps.length; i++) {
    const step = chordSteps[i]!;
    const chord = realizeChord(step.harmonicFunction, tonic);
    const candidates = getBassCandidates(
      chord.rootPitchClass,
      chord.baseQuality,
      step.harmonicVariant.seventh,
    );

    let chosenCandidate: BassCandidate;

    if (i === 0 || prevBassPc === null) {
      // Step 0 starts on root bass to establish the harmonic anchor
      chosenCandidate = candidates.find((c) => c.choice === "root") ?? candidates[0]!;
    } else {
      // Evaluate best bass candidate for smooth stepwise motion
      let bestScore = Number.POSITIVE_INFINITY;
      let bestChoice = candidates[0]!;

      for (const cand of candidates) {
        const dist = computeBassDistance(cand.pitchClass, prevBassPc);
        let score: number;

        if (dist === 1 || dist === 2) {
          // Smooth stepwise motion (half step or whole step)
          score = dist;
        } else if (dist === 0) {
          // Common tone retention
          score = 2.5;
        } else if (dist === 3) {
          score = 5;
        } else if (dist === 4) {
          score = 7.5;
        } else {
          // Large leap
          score = 10 + dist;
        }

        // Bias towards root position when distances are comparable
        if (cand.choice === "root") {
          score -= 1.5;
        }
        // 2nd inversion (fifth in bass) is unstable in functional harmony, add slight penalty
        if (cand.choice === "fifth") {
          score += 3.0;
        }

        if (score < bestScore) {
          bestScore = score;
          bestChoice = cand;
        }
      }

      chosenCandidate = bestChoice;
    }

    prevBassPc = chosenCandidate.pitchClass;

    updates.push({
      stepId: step.id,
      patch: {
        performance: {
          ...step.performance,
          inversion: "auto",
          bass: {
            ...step.performance.bass,
            choice: chosenCandidate.choice,
          },
        },
      },
    });
  }

  return {
    updates: Object.freeze(updates),
    description: "Applied smooth stepwise bassline and voice leading",
  };
}
