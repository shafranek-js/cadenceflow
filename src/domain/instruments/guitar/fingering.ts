import type { ExactPitch } from "../../harmony/pitch";
import type { GuitarTabPosition } from "./tablature";

export const GUITAR_OPEN_MIDI: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, number>> = Object.freeze({
  1: 64, // E4 (highest pitch)
  2: 59, // B3
  3: 55, // G3
  4: 50, // D3
  5: 45, // A2
  6: 40, // E2 (lowest pitch)
});

export interface FretCandidate {
  readonly str: 1 | 2 | 3 | 4 | 5 | 6;
  readonly fret: number;
  readonly finger: 0 | 1 | 2 | 3 | 4;
  readonly handPosition: number;
}

export interface GuitarMelodyInputNote {
  readonly key: string;
  readonly pitch: ExactPitch | number;
  readonly startOffsetBeats?: number;
  readonly durationBeats?: number;
  readonly measureIndex?: number;
}

/**
 * Finds all playable (string, fret) coordinates for a MIDI pitch on a standard guitar.
 * Wraps into playable guitar register (E2=40 to E6=88) if needed.
 */
export function findPossibleFretPositions(
  pitch: ExactPitch | number,
  maxFret = 20,
): readonly { readonly str: 1 | 2 | 3 | 4 | 5 | 6; readonly fret: number }[] {
  let midi = typeof pitch === "number" ? pitch : pitch.midiNumber;
  while (midi < 40) midi += 12;
  while (midi > 88) midi -= 12;

  const positions: { str: 1 | 2 | 3 | 4 | 5 | 6; fret: number }[] = [];
  const strings: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];

  for (const str of strings) {
    const open = GUITAR_OPEN_MIDI[str];
    const fret = midi - open;
    if (fret >= 0 && fret <= maxFret) {
      positions.push({ str, fret });
    }
  }

  return positions;
}

/**
 * Expands physical (str, fret) positions into finger/hand-position candidate states.
 */
export function generateFretCandidates(
  positions: readonly { readonly str: 1 | 2 | 3 | 4 | 5 | 6; readonly fret: number }[],
): readonly FretCandidate[] {
  const candidates: FretCandidate[] = [];

  for (const pos of positions) {
    if (pos.fret === 0) {
      // Open string: finger 0, handPosition neutral (1)
      candidates.push({
        str: pos.str,
        fret: 0,
        finger: 0,
        handPosition: 1,
      });
      continue;
    }

    // For fretted notes, four fingers correspond to a 4-fret box:
    // finger 1 -> handPos = fret
    // finger 2 -> handPos = fret - 1
    // finger 3 -> handPos = fret - 2
    // finger 4 -> handPos = fret - 3
    const fingerOptions: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];
    for (const finger of fingerOptions) {
      const handPos = pos.fret - finger + 1;
      if (handPos >= 1) {
        // Exclude unnatural extreme assignments on first frets
        if (pos.fret === 1 && finger > 2) continue;
        if (pos.fret === 2 && finger === 4) continue;
        candidates.push({
          str: pos.str,
          fret: pos.fret,
          finger,
          handPosition: handPos,
        });
      }
    }
  }

  return candidates;
}

/**
 * Calculates internal ergonomic difficulty cost of a single fret state.
 */
export function getInternalNodeCost(
  candidate: FretCandidate,
  chordBaseFret?: number,
): number {
  let cost = 0;

  // 1. Open string bonus: effortless left-hand production
  if (candidate.fret === 0) {
    cost -= 2.0;
  } else {
    // 2. Proximity to nut bonus: lower frets are easier and closer to hand resting position
    cost += candidate.fret * 0.15;

    // 3. High fret penalty (frets > 12 are cramped and less resonant)
    if (candidate.fret > 12) {
      cost += Math.pow(candidate.fret - 12, 2) * 0.25;
    }

    // 4. First & comfortable middle position bonus (frets 1..7)
    if (candidate.fret >= 1 && candidate.fret <= 7) {
      cost -= 0.5;
    }

    // 5. Strings 1, 2, 3 are more comfortable for melody than thick strings 5, 6
    if (candidate.str >= 5 && candidate.fret > 7) {
      cost += 2.0;
    }
  }

  // 6. Harmony gravity: reward playing within the active chord's box
  if (chordBaseFret !== undefined && chordBaseFret > 0 && candidate.fret > 0) {
    if (candidate.handPosition === chordBaseFret) {
      cost -= 2.0; // Exact match with chord box
    } else if (
      candidate.fret >= chordBaseFret &&
      candidate.fret <= chordBaseFret + 4
    ) {
      cost -= 1.0; // Within chord span
    } else {
      cost += Math.abs(candidate.handPosition - chordBaseFret) * 0.8;
    }
  }

  return cost;
}

/**
 * Calculates transition cost between consecutive note states.
 */
export function getTransitionCost(
  prev: FretCandidate,
  next: FretCandidate,
  deltaTimeBeats = 1,
): number {
  let cost = 0;

  const bothFretted = prev.fret > 0 && next.fret > 0;

  if (bothFretted) {
    const handShift = Math.abs(next.handPosition - prev.handPosition);
    if (handShift === 0) {
      // Same position box: 0 position shift cost!
    } else if (handShift === 1) {
      // 1-fret micro-shift: very easy
      cost += 0.8;
    } else {
      // Hand shift along neck
      cost += handShift * 2.6;
    }

    // Stretch penalty inside same position
    const fretDiff = Math.abs(next.fret - prev.fret);
    if (fretDiff > 4 && handShift === 0) {
      cost += 35.0; // Anatomically impossible without shift
    }

    // Same finger slide penalty (playing consecutive different frets with same finger)
    if (prev.finger === next.finger && prev.fret !== next.fret) {
      cost += 9.0;
    }

    // Anatomical finger crossing penalty on adjacent/same strings:
    // Higher fret with lower finger (e.g. fret 3 finger 3 -> fret 4 finger 1)
    if (
      next.fret > prev.fret &&
      next.finger < prev.finger &&
      handShift <= 1
    ) {
      cost += 14.0;
    } else if (
      next.fret < prev.fret &&
      next.finger > prev.finger &&
      handShift <= 1
    ) {
      cost += 14.0;
    }

    // String skip penalty: adjacent strings are easier than large skips
    const stringDiff = Math.abs(next.str - prev.str);
    if (stringDiff > 1) {
      cost += (stringDiff - 1) * 0.8;
    }
  }

  // Speed factor: fast notes penalize hand shifts and large string skips more heavily
  const tempoWeight = Math.min(2.5, 1.0 / Math.max(0.25, deltaTimeBeats));
  return cost * tempoWeight;
}

/**
 * Optimizes a sequence of melody notes for guitar tablature using the Viterbi algorithm.
 * Finds the globally minimal physical exertion path across strings, frets, and fingers.
 */
export function optimizeGuitarMelodyTab(
  notes: readonly GuitarMelodyInputNote[],
  chordBaseFretByMeasure?: ReadonlyMap<number, number>,
): readonly GuitarTabPosition[] {
  if (notes.length === 0) return [];

  // Step 1: Generate candidates for each note
  const layers: readonly (readonly FretCandidate[])[] = notes.map((note) => {
    const positions = findPossibleFretPositions(note.pitch);
    const candidates = generateFretCandidates(positions);
    if (candidates.length === 0) {
      // Fallback to open string 1 if extreme pitch
      return [
        {
          str: 1,
          fret: 0,
          finger: 0,
          handPosition: 1,
        },
      ];
    }
    return candidates;
  });

  // Step 2: Viterbi forward pass
  const costs: number[][] = [];
  const backpointers: number[][] = [];

  const firstChordBase =
    notes[0]?.measureIndex !== undefined
      ? chordBaseFretByMeasure?.get(notes[0].measureIndex)
      : undefined;

  costs.push(
    layers[0]!.map((candidate) => getInternalNodeCost(candidate, firstChordBase)),
  );
  backpointers.push(new Array(layers[0]!.length).fill(0));

  for (let t = 1; t < layers.length; t++) {
    const prevLayer = layers[t - 1]!;
    const currLayer = layers[t]!;
    const prevCosts = costs[t - 1]!;

    const currentMeasure = notes[t]?.measureIndex;
    const chordBase =
      currentMeasure !== undefined
        ? chordBaseFretByMeasure?.get(currentMeasure)
        : undefined;

    const dt =
      notes[t]?.startOffsetBeats !== undefined &&
      notes[t - 1]?.startOffsetBeats !== undefined
        ? Math.max(0.125, notes[t]!.startOffsetBeats! - notes[t - 1]!.startOffsetBeats!)
        : 1.0;

    const layerCosts: number[] = [];
    const layerBackpointers: number[] = [];

    for (let i = 0; i < currLayer.length; i++) {
      const nextNode = currLayer[i]!;
      const internalCost = getInternalNodeCost(nextNode, chordBase);

      let minCost = Infinity;
      let bestPrev = 0;

      for (let j = 0; j < prevLayer.length; j++) {
        const prevNode = prevLayer[j]!;
        const transition = getTransitionCost(prevNode, nextNode, dt);
        const total = prevCosts[j]! + transition + internalCost;
        if (total < minCost) {
          minCost = total;
          bestPrev = j;
        }
      }

      layerCosts.push(minCost);
      layerBackpointers.push(bestPrev);
    }

    costs.push(layerCosts);
    backpointers.push(layerBackpointers);
  }

  // Step 3: Viterbi backward pass (find optimal path)
  const lastCosts = costs[costs.length - 1]!;
  let bestEndIndex = 0;
  let minEndCost = Infinity;
  for (let i = 0; i < lastCosts.length; i++) {
    if (lastCosts[i]! < minEndCost) {
      minEndCost = lastCosts[i]!;
      bestEndIndex = i;
    }
  }

  const optimalIndices: number[] = new Array(layers.length);
  optimalIndices[layers.length - 1] = bestEndIndex;
  let currentIndex = bestEndIndex;

  for (let t = layers.length - 2; t >= 0; t--) {
    currentIndex = backpointers[t + 1]![currentIndex]!;
    optimalIndices[t] = currentIndex;
  }

  // Step 4: Map optimal states to GuitarTabPosition
  return optimalIndices.map((candidateIndex, t) => {
    const candidate = layers[t]![candidateIndex]!;
    return Object.freeze({
      str: candidate.str,
      fret: candidate.fret,
      finger: candidate.finger,
    });
  });
}
