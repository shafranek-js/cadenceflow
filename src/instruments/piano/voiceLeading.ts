import type { ExactPitch } from "../../domain/harmony/pitch";

/**
 * Metric computing voice leading distance between two pitch collections.
 * Uses voice-by-voice sorted MIDI pitch distances, and heavily penalizes
 * voice count differences so transitions between triads and 7th/9th chords
 * cannot artificially lower distance by ignoring extra voices.
 */
export function computeVoiceLeadingDistance(
  fromPitches: readonly ExactPitch[] | readonly number[],
  toPitches: readonly ExactPitch[] | readonly number[],
): number {
  if (!fromPitches.length || !toPitches.length) return Number.POSITIVE_INFINITY;

  const fromSorted = [...fromPitches]
    .map((p) => (typeof p === "number" ? p : p.midiNumber))
    .sort((a, b) => a - b);
  const toSorted = [...toPitches]
    .map((p) => (typeof p === "number" ? p : p.midiNumber))
    .sort((a, b) => a - b);

  let distance = 0;
  const sharedCount = Math.min(fromSorted.length, toSorted.length);
  for (let i = 0; i < sharedCount; i++) {
    distance += Math.abs(fromSorted[i]! - toSorted[i]!);
  }

  const countDiff = Math.abs(fromSorted.length - toSorted.length);
  if (countDiff > 0) {
    const penaltyPerVoice = 12; // Octave penalty weight for added/dropped voices
    distance += countDiff * penaltyPerVoice;
  }

  return distance;
}

export interface VoicingCandidate {
  readonly pitches: readonly ExactPitch[];
  readonly inversionIndex: number;
}

/**
 * Evaluates and scores candidate piano voicings against previous pitch context.
 *
 * Scoring factors:
 * 1. Exact repeated chord match (-1000): Identical pitches are strongly favored for repeated chords.
 * 2. Voice-leading movement distance: Sum of voice movements between sorted pitches.
 * 3. Common-tone retention bonus (-8 per retained pitch at identical MIDI note):
 *    Rewards retaining common tones without displacement.
 * 4. Leap penalty: Penalizes large leaps across individual voices (> 7 semitones).
 * 5. Center-register deviation: Gently penalizes drifting too far from piano middle register (~60..70).
 * 6. Deterministic tie-breaking: Ensures deterministic output for identical inputs.
 */
export function scoreVoicingCandidate(
  candidate: VoicingCandidate,
  previousPitches?: readonly ExactPitch[],
): number {
  const candidateMidis = candidate.pitches.map((p) => p.midiNumber);

  // Independent auto-voicing (no previous context)
  if (!previousPitches || previousPitches.length === 0) {
    const avg = candidateMidis.reduce((sum, m) => sum + m, 0) / candidateMidis.length;
    // Prefer voicings comfortably centered around C4/E4 (MIDI 60..64)
    const centerCost = Math.abs(avg - 62);
    // Slight preference for root position (inversion 0)
    const inversionCost = candidate.inversionIndex === 0 ? 0 : 3;
    return centerCost + inversionCost;
  }

  const prevMidis = previousPitches.map((p) => p.midiNumber);

  // 1. Exact match for repeated chord
  if (
    candidateMidis.length === prevMidis.length &&
    candidateMidis.every((m, idx) => m === prevMidis[idx])
  ) {
    return -1000;
  }

  // 2. Base voice-leading distance
  let score = computeVoiceLeadingDistance(prevMidis, candidateMidis);

  // 3. Common-tone retention bonus
  let retainedCommonTones = 0;
  for (const m of candidateMidis) {
    if (prevMidis.includes(m)) {
      retainedCommonTones++;
    }
  }
  score -= retainedCommonTones * 8;

  // 4. Leap penalty for individual voice movement
  const fromSorted = [...prevMidis].sort((a, b) => a - b);
  const toSorted = [...candidateMidis].sort((a, b) => a - b);
  const sharedCount = Math.min(fromSorted.length, toSorted.length);
  for (let i = 0; i < sharedCount; i++) {
    const leap = Math.abs(fromSorted[i]! - toSorted[i]!);
    if (leap > 7) {
      score += (leap - 7) * 3;
    }
  }

  // 5. Centering penalty (avoid extreme drift)
  const avg = candidateMidis.reduce((sum, m) => sum + m, 0) / candidateMidis.length;
  if (avg < 54) score += (54 - avg) * 2;
  if (avg > 74) score += (avg - 74) * 2;

  return score;
}

/**
 * Deterministically selects the best candidate voicing from a pool of candidates.
 */
export function selectBestVoicing(
  candidates: readonly VoicingCandidate[],
  previousPitches?: readonly ExactPitch[],
): VoicingCandidate {
  if (candidates.length === 0) {
    throw new Error("No candidate voicings available to select from.");
  }

  let bestCandidate = candidates[0]!;
  let lowestScore = scoreVoicingCandidate(bestCandidate, previousPitches);

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const score = scoreVoicingCandidate(candidate, previousPitches);
    if (score < lowestScore) {
      lowestScore = score;
      bestCandidate = candidate;
    } else if (score === lowestScore) {
      // Deterministic tie-breaker: prefer candidate with average pitch closer to middle C (60)
      const currentAvg =
        bestCandidate.pitches.reduce((sum, p) => sum + p.midiNumber, 0) /
        bestCandidate.pitches.length;
      const candidateAvg =
        candidate.pitches.reduce((sum, p) => sum + p.midiNumber, 0) / candidate.pitches.length;
      if (Math.abs(candidateAvg - 60) < Math.abs(currentAvg - 60)) {
        bestCandidate = candidate;
      }
    }
  }

  return bestCandidate;
}
