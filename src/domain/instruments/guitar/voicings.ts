import { normalizePitchClass, type ExactPitch, type PitchClassIdentity } from "../../harmony/pitch";
import {
  EMPTY_HARMONIC_VARIANT,
  effectiveChordQuality,
  formatChordSymbol,
  type ChordDefinition,
  type SeventhKind,
} from "../../harmony/chord";
import { resolveChordTones } from "../../harmony/chordTones";
import type { BassChoice, ChordStep, StepPerformance } from "../../progression/step";
import { pitchToConcertFrame } from "../../progression/transposition";
import { GUITAR_STANDARD_TUNING, getFretPitchClass, getGuitarPitch } from "./tuning";

export type GuitarFretRole = "root" | "chord-tone" | "scale-tone";

/** Applies an explicit chord inversion when the authored bass choice is Auto. */
export function withGuitarChordInversion(
  chord: ChordDefinition,
  performance: Pick<StepPerformance, "inversion" | "voicingMode">,
): ChordDefinition {
  const inversion = performance.inversion ?? "auto";
  if (performance.voicingMode === "manual" || inversion === "auto") return chord;

  const tone = inversion === 0 ? undefined : resolveChordTones(chord)[inversion];
  const bassPitchClass = tone?.pitchClass ?? chord.rootPitchClass;
  const bassSpelling = tone?.spelling ?? chord.spelling.root;
  const bassScaleDegree = tone?.diatonicDegree ?? 1;
  if (
    chord.bassPitchClass === bassPitchClass &&
    chord.bassSpelling?.step === bassSpelling.step &&
    chord.bassSpelling?.alter === bassSpelling.alter &&
    chord.bassScaleDegree === bassScaleDegree
  )
    return chord;
  return Object.freeze({
    ...chord,
    bassPitchClass,
    bassSpelling,
    bassScaleDegree,
  });
}

/**
 * Applies a Step's authored slash-bass semantics to Guitar's chord shape. The global
 * independent-bass switch controls a separate piano voice; it must not change this chord.
 */
export function withGuitarStepBass(
  chord: ChordDefinition,
  step: ChordStep,
  pitchFrame: "concert" | "source",
): ChordDefinition {
  const { performance } = step;
  const customBassPitch =
    performance.bass.choice === "custom" && performance.bass.customPitch
      ? pitchFrame === "concert"
        ? pitchToConcertFrame(performance.bass.customPitch, step)
        : performance.bass.customPitch
      : undefined;
  return withGuitarBassSettings(chord, performance, customBassPitch);
}

/** Applies the saved slash-bass choice in the same pitch frame as the chord. */
export function withGuitarBassSettings(
  chord: ChordDefinition,
  performance: Pick<StepPerformance, "bass" | "inversion" | "voicingMode">,
  customBassPitch = performance.bass.customPitch,
): ChordDefinition {
  const { bass } = performance;
  if (bass.choice === "auto") return withGuitarChordInversion(chord, performance);

  let bassPitchClass: PitchClassIdentity;
  let bassSpelling: ChordDefinition["spelling"]["root"];
  let bassScaleDegree: number | undefined;

  if (bass.choice === "custom") {
    if (!customBassPitch) return chord;
    bassPitchClass = customBassPitch.pitchClassIdentity;
    bassSpelling = customBassPitch.spelling;
    bassScaleDegree = resolveChordTones(chord).find(
      (tone) => tone.pitchClass === bassPitchClass,
    )?.diatonicDegree;
  } else if (bass.choice === "root") {
    bassPitchClass = chord.rootPitchClass;
    bassSpelling = chord.spelling.root;
    bassScaleDegree = 1;
  } else {
    const bassDegrees: Readonly<Partial<Record<BassChoice, number>>> = {
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
      seventh: 7,
      ninth: 9,
      eleventh: 11,
      thirteenth: 13,
    };
    const tone = resolveChordTones(chord).find(
      (candidate) => candidate.diatonicDegree === bassDegrees[bass.choice],
    );
    if (!tone) {
      bassPitchClass = chord.rootPitchClass;
      bassSpelling = chord.spelling.root;
      bassScaleDegree = 1;
    } else {
      bassPitchClass = tone.pitchClass;
      bassSpelling = tone.spelling;
      bassScaleDegree = tone.diatonicDegree;
    }
  }

  const {
    bassScaleDegree: _previousBassScaleDegree,
    bassPitchClass: _previousBassPitchClass,
    bassSpelling: _previousBassSpelling,
    ...chordWithoutBass
  } = chord;
  if (bassPitchClass === chord.rootPitchClass) return Object.freeze(chordWithoutBass);
  return Object.freeze({
    ...chordWithoutBass,
    bassPitchClass,
    bassSpelling,
    ...(bassScaleDegree !== undefined ? { bassScaleDegree } : {}),
  });
}

export interface GuitarFretItem {
  readonly stringIndex: number; // 0 = low E, 5 = high E
  readonly stringNumber: number; // 6 = low E, 1 = high E
  readonly fret: number; // -1 = muted, 0 = open, 1..24 = fretted
  readonly finger?: number; // 1 = index, 2 = middle, 3 = ring, 4 = pinky
  readonly role: GuitarFretRole;
  readonly pitchClass?: PitchClassIdentity;
  readonly pitch?: ExactPitch;
}

export interface GuitarBarre {
  readonly fret: number;
  readonly fromStringIndex: number; // e.g. 0 for low E
  readonly toStringIndex: number; // e.g. 5 for high E
  readonly finger?: number;
}

export interface GuitarChordVoicing {
  readonly chordSymbol: string;
  readonly rootPitchClass: PitchClassIdentity;
  readonly bassPitchClass: PitchClassIdentity;
  /** Lowest fret shown on the diagram (1 for open chords, or position offset >= 2) */
  readonly baseFret: number;
  /** Number of frets displayed in the diagram box (typically 4 or 5) */
  readonly fretSpan: number;
  /** Array of 6 frets for string indices 0 (low E) to 5 (high E). -1 means muted string. */
  readonly frets: readonly number[];
  /** Optional finger numbers for each string (0 for none/open, 1..4) */
  readonly fingers?: readonly number[];
  readonly barres: readonly GuitarBarre[];
  readonly items: readonly GuitarFretItem[];
  readonly pitches: readonly ExactPitch[];
  readonly voicingStyle: "open" | "barre-e" | "barre-a" | "shell" | "slash" | "movable";
  readonly unsupportedReason?: string;
}

interface PredefinedShape {
  readonly rootPc: PitchClassIdentity;
  readonly quality: string;
  readonly chordSymbol: string;
  readonly baseFret: number;
  readonly frets: readonly [number, number, number, number, number, number];
  readonly fingers?: readonly [number, number, number, number, number, number];
  readonly barres?: readonly GuitarBarre[];
  readonly voicingStyle: "open" | "barre-e" | "barre-a" | "shell" | "slash" | "movable";
  readonly bassPc?: PitchClassIdentity;
}

// Canonical open and foundational guitar shapes
const CANONICAL_OPEN_SHAPES: readonly PredefinedShape[] = Object.freeze([
  // C Major (0)
  {
    rootPc: 0,
    quality: "major",
    chordSymbol: "C",
    baseFret: 1,
    frets: [-1, 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    voicingStyle: "open",
  },
  // C7 (0)
  {
    rootPc: 0,
    quality: "dominant",
    chordSymbol: "C7",
    baseFret: 1,
    // x32310 = C, E, Bb, C, E: the standard open C7, which omits the perfect fifth. The
    // low E string is muted because fret 3 there is G, which would replace the third.
    frets: [-1, 3, 2, 3, 1, 0],
    fingers: [0, 4, 2, 3, 1, 0],
    voicingStyle: "open",
  },
  // Cmaj7 (0)
  {
    rootPc: 0,
    quality: "major7",
    chordSymbol: "Cmaj7",
    baseFret: 1,
    frets: [-1, 3, 2, 0, 0, 0],
    fingers: [0, 3, 2, 0, 0, 0],
    voicingStyle: "open",
  },
  // D Major (2)
  {
    rootPc: 2,
    quality: "major",
    chordSymbol: "D",
    baseFret: 1,
    frets: [-1, -1, 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    voicingStyle: "open",
  },
  // D Minor (2)
  {
    rootPc: 2,
    quality: "minor",
    chordSymbol: "Dm",
    baseFret: 1,
    frets: [-1, -1, 0, 2, 3, 1],
    fingers: [0, 0, 0, 2, 3, 1],
    voicingStyle: "open",
  },
  // D7 (2)
  {
    rootPc: 2,
    quality: "dominant",
    chordSymbol: "D7",
    baseFret: 1,
    frets: [-1, -1, 0, 2, 1, 2],
    fingers: [0, 0, 0, 2, 1, 3],
    voicingStyle: "open",
  },
  // E Major (4)
  {
    rootPc: 4,
    quality: "major",
    chordSymbol: "E",
    baseFret: 1,
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [0, 2, 3, 1, 0, 0],
    voicingStyle: "open",
  },
  // E Minor (4)
  {
    rootPc: 4,
    quality: "minor",
    chordSymbol: "Em",
    baseFret: 1,
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
    voicingStyle: "open",
  },
  // E7 (4)
  {
    rootPc: 4,
    quality: "dominant",
    chordSymbol: "E7",
    baseFret: 1,
    frets: [0, 2, 0, 1, 0, 0],
    fingers: [0, 2, 0, 1, 0, 0],
    voicingStyle: "open",
  },
  // F Major (5)
  {
    rootPc: 5,
    quality: "major",
    chordSymbol: "F",
    baseFret: 1,
    frets: [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barres: [{ fret: 1, fromStringIndex: 0, toStringIndex: 5, finger: 1 }],
    voicingStyle: "barre-e",
  },
  // F Minor (5)
  {
    rootPc: 5,
    quality: "minor",
    chordSymbol: "Fm",
    baseFret: 1,
    frets: [1, 3, 3, 1, 1, 1],
    fingers: [1, 3, 4, 1, 1, 1],
    barres: [{ fret: 1, fromStringIndex: 0, toStringIndex: 5, finger: 1 }],
    voicingStyle: "barre-e",
  },
  // G Major (7)
  {
    rootPc: 7,
    quality: "major",
    chordSymbol: "G",
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    voicingStyle: "open",
  },
  // G7 (7)
  {
    rootPc: 7,
    quality: "dominant",
    chordSymbol: "G7",
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 1],
    fingers: [3, 2, 0, 0, 0, 1],
    voicingStyle: "open",
  },
  // A Major (9)
  {
    rootPc: 9,
    quality: "major",
    chordSymbol: "A",
    baseFret: 1,
    frets: [-1, 0, 2, 2, 2, 0],
    fingers: [0, 0, 1, 2, 3, 0],
    voicingStyle: "open",
  },
  // A Minor (9)
  {
    rootPc: 9,
    quality: "minor",
    chordSymbol: "Am",
    baseFret: 1,
    frets: [-1, 0, 2, 2, 1, 0],
    fingers: [0, 0, 2, 3, 1, 0],
    voicingStyle: "open",
  },
  // A7 (9)
  {
    rootPc: 9,
    quality: "dominant",
    chordSymbol: "A7",
    baseFret: 1,
    frets: [-1, 0, 2, 0, 2, 0],
    fingers: [0, 0, 2, 0, 3, 0],
    voicingStyle: "open",
  },
  // B7 (11)
  {
    rootPc: 11,
    quality: "dominant",
    chordSymbol: "B7",
    baseFret: 1,
    frets: [-1, 2, 1, 2, 0, 2],
    fingers: [0, 2, 1, 3, 0, 4],
    voicingStyle: "open",
  },
  // B Minor (11)
  {
    rootPc: 11,
    quality: "minor",
    chordSymbol: "Bm",
    baseFret: 2,
    frets: [-1, 2, 4, 4, 3, 2],
    fingers: [0, 1, 3, 4, 2, 1],
    barres: [{ fret: 2, fromStringIndex: 1, toStringIndex: 5, finger: 1 }],
    voicingStyle: "barre-a",
  },
  // B Diminished / Bm7b5 (11)
  {
    rootPc: 11,
    quality: "diminished",
    chordSymbol: "Bdim",
    baseFret: 1,
    frets: [-1, 2, 3, 4, 3, -1],
    fingers: [0, 1, 2, 4, 3, 0],
    voicingStyle: "movable",
  },
]);

/**
 * A movable (barre/movable) chord shape, expressed as fret offsets from the root fret.
 * -1 mutes the string.
 */
interface MovableTemplate {
  readonly relativeFrets: readonly number[];
  readonly relativeFingers: readonly number[];
  readonly voicingStyle: "open" | "barre-e" | "barre-a" | "shell" | "slash" | "movable";
}

/**
 * Movable templates based on E-shape (string 6 root) and A-shape (string 5 root).
 */
const MOVABLE_TEMPLATES = {
  // E-Shape (root on 6th string, index 0). Base offset 0 is E (pc 4).
  eShape: {
    rootOffsetPc: 4, // E is pc 4
    stringRootIndex: 0,
    major: {
      relativeFrets: [0, 2, 2, 1, 0, 0] as const,
      relativeFingers: [1, 3, 4, 2, 1, 1] as const,
      voicingStyle: "barre-e" as const,
    },
    minor: {
      relativeFrets: [0, 2, 2, 0, 0, 0] as const,
      relativeFingers: [1, 3, 4, 1, 1, 1] as const,
      voicingStyle: "barre-e" as const,
    },
    dominant: {
      // Root, fifth, flat seventh, major third, fifth, root. Verified for all 12 roots.
      relativeFrets: [0, 2, 0, 1, 0, 0] as const,
      relativeFingers: [1, 3, 1, 2, 1, 1] as const,
      voicingStyle: "barre-e" as const,
    },
    major7: {
      relativeFrets: [0, 2, 1, 1, 0, 0] as const,
      relativeFingers: [1, 4, 2, 3, 1, 1] as const,
      voicingStyle: "barre-e" as const,
    },
    diminished: {
      relativeFrets: [0, 1, 2, 0, -1, -1] as const,
      relativeFingers: [1, 2, 4, 1, 0, 0] as const,
      voicingStyle: "movable" as const,
    },
    // The extended qualities below are only ever requested for the A-shape (see the
    // template selector), because the A-shape keeps the root on string 5 as the bass
    // across the whole neck. E-shape analogues are intentionally absent rather than
    // present and wrong.
  },
  // A-Shape (root on 5th string, index 1). Base offset 0 is A (pc 9).
  aShape: {
    rootOffsetPc: 9, // A is pc 9
    stringRootIndex: 1,
    major: {
      relativeFrets: [-1, 0, 2, 2, 2, 0] as const,
      relativeFingers: [0, 1, 2, 3, 4, 1] as const,
      voicingStyle: "barre-a" as const,
    },
    minor: {
      relativeFrets: [-1, 0, 2, 2, 1, 0] as const,
      relativeFingers: [0, 1, 3, 4, 2, 1] as const,
      voicingStyle: "barre-a" as const,
    },
    dominant: {
      // Root, flat seventh, major third, fifth, flat seventh. The previous shape rang the
      // G string at the same fret as the root, producing a root/third/fifth triad with the
      // seventh missing entirely (audible on C#7, D#7 and A#7).
      relativeFrets: [-1, 0, 0, 2, 0, 2] as const,
      relativeFingers: [0, 1, 0, 3, 0, 4] as const,
      voicingStyle: "barre-a" as const,
    },
    major7: {
      relativeFrets: [-1, 0, 2, 1, 2, 0] as const,
      relativeFingers: [0, 1, 3, 2, 4, 1] as const,
      voicingStyle: "barre-a" as const,
    },
    diminished: {
      relativeFrets: [-1, 0, 1, 2, 1, -1] as const,
      relativeFingers: [0, 1, 2, 4, 3, 0] as const,
      voicingStyle: "movable" as const,
    },
    minor7: {
      relativeFrets: [-1, 0, 2, 0, 1, 0] as const,
      relativeFingers: [0, 1, 3, 1, 2, 1] as const,
      voicingStyle: "barre-a" as const,
    },
    minorMajor7: {
      relativeFrets: [-1, 0, 2, 1, 1, 0] as const,
      relativeFingers: [0, 1, 4, 2, 3, 1] as const,
      voicingStyle: "barre-a" as const,
    },
    "half-diminished7": {
      // Root, flat fifth, flat seventh, minor third, minor seventh.
      relativeFrets: [-1, 0, 1, 0, 1, 3] as const,
      relativeFingers: [0, 1, 2, 1, 3, 4] as const,
      voicingStyle: "movable" as const,
    },
    diminished7: {
      // Root, flat fifth, flat seventh, minor third, flat seventh.
      relativeFrets: [-1, 0, 1, 2, 1, 2] as const,
      relativeFingers: [0, 1, 2, 4, 3, 4] as const,
      voicingStyle: "movable" as const,
    },
    augmented: {
      // Root, augmented fifth (+8), major third (+4). Verified for all 12 roots.
      // The previous mapping resolved every augmented chord to the diminished shape.
      relativeFrets: [-1, 0, 3, 2, 2, 1] as const,
      relativeFingers: [0, 1, 4, 2, 3, 1] as const,
      voicingStyle: "movable" as const,
    },
  },
};

export interface ResolveVoicingOptions {
  readonly preferOpen?: boolean;
  readonly bassPitchClass?: PitchClassIdentity;
}

interface VariantVoicingState {
  readonly frets: readonly number[];
  readonly pitchClasses: readonly PitchClassIdentity[];
}

function variantVoicingScore(
  state: VariantVoicingState,
  targetPitchClasses: readonly PitchClassIdentity[],
  rootPc: PitchClassIdentity,
): number {
  const present = new Set(state.pitchClasses);
  const roleWeight = (pitchClass: PitchClassIdentity): number =>
    pitchClass === rootPc ? 5 : pitchClass === targetPitchClasses[1] ? 4 : 2;
  const missingWeight = targetPitchClasses
    .filter((pitchClass) => !present.has(pitchClass))
    .reduce((sum, pitchClass) => sum + roleWeight(pitchClass), 0);
  const fretted = state.frets.filter((fret) => fret > 0);
  const span = fretted.length > 0 ? Math.max(...fretted) - Math.min(...fretted) : 0;
  const fretCost = fretted.reduce((sum, fret) => sum + fret, 0);
  const muted = state.frets.filter((fret) => fret < 0).length;
  const duplicateCount = state.pitchClasses.length - present.size;
  return missingWeight * 10 + muted * 2 + span * 0.7 + fretCost * 0.08 + duplicateCount * 1.5;
}

/**
 * Makes a playable guitar voicing from the canonical chord pitch set when a predefined shape
 * cannot represent every authored option. Every sounding string is a chord tone (plus an explicit
 * slash bass, if present), so omissions and extensions survive Guitar, TAB, and guitar audio.
 */
function resolveVariantGuitarVoicing(
  chord: ChordDefinition,
  options: ResolveVoicingOptions | undefined,
): GuitarChordVoicing {
  const rootPc = normalizePitchClass(chord.rootPitchClass);
  const chordPitchClasses = [...new Set(resolveChordTones(chord).map((tone) => tone.pitchClass))];
  if (chordPitchClasses.length === 0) throw new RangeError("Chord has no sounding tones");
  const targetPitchClasses = [...chordPitchClasses];
  const requestedBassPc = options?.bassPitchClass ?? chord.bassPitchClass ?? rootPc;
  if (!targetPitchClasses.includes(requestedBassPc)) targetPitchClasses.push(requestedBassPc);
  if (targetPitchClasses.length > 6) {
    const empty = buildVoicing(
      formatChordSymbol(chord),
      rootPc,
      requestedBassPc,
      [-1, -1, -1, -1, -1, -1],
      undefined,
      [],
      "movable",
    );
    return Object.freeze({
      ...empty,
      unsupportedReason: `No matching fingering: this chord needs ${targetPitchClasses.length} distinct pitch classes, but a guitar has six strings.`,
    });
  }
  const targetSet = new Set(targetPitchClasses);

  let beam: VariantVoicingState[] = [{ frets: [], pitchClasses: [] }];
  for (let stringIndex = 0; stringIndex < GUITAR_STANDARD_TUNING.length; stringIndex += 1) {
    const candidates: Array<{ readonly fret: number; readonly pitchClass?: PitchClassIdentity }> = [
      { fret: -1 },
    ];
    for (let fret = 0; fret <= 12; fret += 1) {
      const pitchClass = getFretPitchClass(stringIndex, fret);
      if (targetSet.has(pitchClass)) candidates.push({ fret, pitchClass });
    }

    const expanded: VariantVoicingState[] = [];
    for (const state of beam) {
      for (const candidate of candidates) {
        expanded.push({
          frets: [...state.frets, candidate.fret],
          pitchClasses:
            candidate.pitchClass === undefined
              ? state.pitchClasses
              : [...state.pitchClasses, candidate.pitchClass],
        });
      }
    }
    beam = expanded
      .sort(
        (left, right) =>
          variantVoicingScore(left, targetPitchClasses, rootPc) -
          variantVoicingScore(right, targetPitchClasses, rootPc),
      )
      .slice(0, 256);
  }

  const candidates = beam.map((state) => {
    const frets = ensureLowestBassPitch(state.frets, requestedBassPc);
    const pitchClasses = frets
      .map((fret, stringIndex) => (fret < 0 ? undefined : getFretPitchClass(stringIndex, fret)))
      .filter((value): value is PitchClassIdentity => value !== undefined);
    const adjusted = { frets, pitchClasses };
    return {
      state: adjusted,
      score: variantVoicingScore(adjusted, targetPitchClasses, rootPc),
    };
  });
  candidates.sort((left, right) => left.score - right.score);
  const selected = candidates[0]?.state;
  if (!selected) throw new RangeError("No playable guitar voicing for the current chord tones");

  const selectedPitchClasses = new Set(selected.pitchClasses);
  const missingTones = targetPitchClasses.filter(
    (pitchClass) => !selectedPitchClasses.has(pitchClass),
  );
  if (missingTones.length > 0) {
    const empty = buildVoicing(
      formatChordSymbol(chord),
      rootPc,
      requestedBassPc,
      [-1, -1, -1, -1, -1, -1],
      undefined,
      [],
      "movable",
    );
    return Object.freeze({
      ...empty,
      unsupportedReason: `No matching fingering: all ${targetPitchClasses.length} chord pitch classes cannot be represented together in a playable position.`,
    });
  }

  const pitches = selected.frets
    .map((fret, stringIndex) => (fret < 0 ? undefined : getGuitarPitch(stringIndex, fret)))
    .filter((pitch): pitch is ExactPitch => pitch !== undefined);
  const lowest = pitches.reduce<ExactPitch | undefined>(
    (current, pitch) => (current && current.midiNumber <= pitch.midiNumber ? current : pitch),
    undefined,
  );
  const bassPc = lowest?.pitchClassIdentity ?? requestedBassPc;
  return buildVoicing(
    formatChordSymbol(chord),
    rootPc,
    bassPc,
    selected.frets,
    undefined,
    [],
    "movable",
  );
}

/**
 * Builds a complete GuitarChordVoicing with pitches and roles from a frets array and position.
 */
function buildVoicing(
  chordSymbol: string,
  rootPc: PitchClassIdentity,
  bassPc: PitchClassIdentity,
  frets: readonly number[],
  fingers: readonly number[] | undefined,
  barres: readonly GuitarBarre[],
  voicingStyle: "open" | "barre-e" | "barre-a" | "shell" | "slash" | "movable",
): GuitarChordVoicing {
  const soundingFrets = frets.filter((f) => f > 0);
  const minFret = soundingFrets.length > 0 ? Math.min(...soundingFrets) : 1;
  const maxFret = soundingFrets.length > 0 ? Math.max(...soundingFrets) : 1;
  const hasOpenStrings = frets.some((f) => f === 0);

  // If there are open strings or frets start at 1, baseFret is 1 (nut position)
  const baseFret = hasOpenStrings || minFret <= 1 ? 1 : minFret;
  const fretSpan = Math.max(4, maxFret - baseFret + 1);

  const items: GuitarFretItem[] = [];
  const pitches: ExactPitch[] = [];

  for (let stringIdx = 0; stringIdx < 6; stringIdx++) {
    const fret = frets[stringIdx] ?? -1;
    const stringInfo = GUITAR_STANDARD_TUNING[stringIdx]!;
    if (fret === -1) {
      items.push({
        stringIndex: stringIdx,
        stringNumber: stringInfo.stringNumber,
        fret: -1,
        role: "chord-tone",
      });
      continue;
    }

    const pc = getFretPitchClass(stringIdx, fret);
    const pitch = getGuitarPitch(stringIdx, fret);
    pitches.push(pitch);

    const isRoot = pc === rootPc;
    const role: GuitarFretRole = isRoot ? "root" : "chord-tone";
    const finger = fingers ? fingers[stringIdx] : undefined;

    items.push({
      stringIndex: stringIdx,
      stringNumber: stringInfo.stringNumber,
      fret,
      role,
      pitchClass: pc,
      pitch,
      ...(finger && finger > 0 ? { finger } : {}),
    });
  }

  return Object.freeze({
    chordSymbol,
    rootPitchClass: rootPc,
    bassPitchClass: bassPc,
    baseFret,
    fretSpan,
    frets: Object.freeze([...frets]),
    ...(fingers ? { fingers: Object.freeze([...fingers]) } : {}),
    barres: Object.freeze([...barres]),
    items: Object.freeze(items),
    pitches: Object.freeze(pitches),
    voicingStyle,
  });
}

/**
 * Ensures an authored slash-bass is the actual lowest sounding guitar pitch.
 *
 * Movable shapes do not have a canonical low-string inversion for every root,
 * so the semantic bass is placed on the low-E string and any lower sounding
 * strings are muted. This preserves the existing upper shape while making the
 * returned pitches truthful instead of relying on bass metadata alone.
 */
function ensureLowestBassPitch(
  frets: readonly number[],
  bassPitchClass: PitchClassIdentity,
): readonly number[] {
  const currentPitches = frets
    .map((fret, stringIndex) => (fret >= 0 ? getGuitarPitch(stringIndex, fret) : undefined))
    .filter((pitch): pitch is ExactPitch => pitch !== undefined);
  const currentLowest = currentPitches.reduce<ExactPitch | undefined>(
    (lowest, pitch) => (lowest && lowest.midiNumber <= pitch.midiNumber ? lowest : pitch),
    undefined,
  );
  if (currentLowest?.pitchClassIdentity === bassPitchClass) return frets;

  const lowString = GUITAR_STANDARD_TUNING[0]!;
  const bassFret = (bassPitchClass - lowString.openPitchClass + 12) % 12;
  const bassMidi = lowString.openMidi + bassFret;
  const adapted = [...frets];
  adapted[0] = bassFret;

  // A higher string can still sound below a high low-E fret (for example
  // A2 below D#2), so mute every competing pitch below the authored bass.
  for (let stringIndex = 1; stringIndex < adapted.length; stringIndex += 1) {
    const fret = adapted[stringIndex]!;
    if (fret >= 0 && GUITAR_STANDARD_TUNING[stringIndex]!.openMidi + fret < bassMidi) {
      adapted[stringIndex] = -1;
    }
  }
  return Object.freeze(adapted);
}

/**
 * Resolves the voicing template key for a chord.
 *
 * Regression context: this used to be
 * `if (isMajor7) "major7" else if (isSeventh || quality === "dominant") "dominant"`,
 * where callers computed `isSeventh = baseQuality === "dominant" || variant.seventh !== undefined`.
 * That made `isSeventh` true for *every* seventh chord, so the base quality was overwritten:
 * Cm7 resolved through the dominant template and produced a major third (C-E-G-Bb read as C7).
 * All minor-family sevenths were affected: Am7 → A7, Dm7 → D7, Bm7b5 → B7.
 *
 * The seventh kind now decides the template, and the base quality decides the triad, so the
 * two cannot contradict each other.
 */
function resolveVoicingQuality(
  chord: Pick<ChordDefinition, "baseQuality"> & {
    readonly isSeventh?: boolean;
    readonly isMajor7?: boolean;
    readonly seventh?: SeventhKind;
  },
): string {
  const baseQuality = chord.baseQuality;

  // `seventh` is the canonical signal. The legacy booleans remain supported for callers
  // that have not been migrated, but they can only ever express "dominant" or "major7",
  // which is exactly why they must not override a minor or diminished base quality.
  const seventh: SeventhKind | undefined =
    chord.seventh ??
    (chord.isMajor7
      ? "major7"
      : chord.isSeventh || baseQuality === "dominant"
        ? "minor7"
        : undefined);

  if (seventh === undefined) {
    return baseQuality === "dominant" ? "dominant" : baseQuality;
  }

  if (baseQuality === "minor") {
    // i7  → minor7 (minor triad + minor seventh). Never the dominant template.
    return seventh === "major7" ? "minor-major7" : "minor7";
  }

  if (baseQuality === "diminished") {
    if (seventh === "diminished7") return "diminished7";
    // Half-diminished is the diminished triad plus a minor seventh: Bm7b5.
    return seventh === "minor7" || seventh === "half-diminished7"
      ? "half-diminished7"
      : "diminished";
  }

  if (baseQuality === "augmented") {
    // Augmented sevenths have no reliable movable shape; keep the augmented triad
    // rather than silently substituting a different quality.
    return "augmented";
  }

  // Major triad with a seventh: dominant (minor7) or major7.
  return seventh === "major7" ? "major7" : "dominant";
}

/**
 * Qualities that have a canonical open shape. A quality absent from this set must be
 * served by a movable template even when a same-root open shape exists for another
 * quality, because open shapes cannot be transposed or re-voiced.
 */
const OPEN_SHAPE_QUALITIES: ReadonlySet<string> = new Set([
  "major",
  "minor",
  "dominant",
  "major7",
  "diminished",
]);

/**
 * Resolves the optimal, ergonomic guitar chord voicing for any chord definition or root/quality pair.
 */
export function resolveGuitarChordVoicing(
  chord: Pick<ChordDefinition, "rootPitchClass" | "baseQuality" | "spelling"> & {
    readonly variant?: ChordDefinition["variant"];
    /** @deprecated Prefer `seventh`; a boolean cannot distinguish minor7 from dominant. */
    readonly isSeventh?: boolean;
    /** @deprecated Prefer `seventh`. */
    readonly isMajor7?: boolean;
    readonly seventh?: SeventhKind;
    readonly bassPitchClass?: PitchClassIdentity;
  },
  options?: ResolveVoicingOptions,
): GuitarChordVoicing {
  const rootPc = normalizePitchClass(chord.rootPitchClass);
  const bassPc = options?.bassPitchClass ?? chord.bassPitchClass ?? rootPc;
  const rawChord = chord as ChordDefinition;
  const fullChord = rawChord.variant ? rawChord : { ...rawChord, variant: EMPTY_HARMONIC_VARIANT };
  const chordSymbol = rawChord.variant ? formatChordSymbol(fullChord) : chord.spelling.symbol;

  const variant = fullChord.variant;
  const isComplexVariant = Boolean(
    variant &&
    (variant.baseQualityOverride !== undefined ||
      variant.extensions.length > 0 ||
      variant.suspensions.length > 0 ||
      variant.alterations.length > 0 ||
      variant.add9 ||
      variant.add11 ||
      variant.add13 ||
      variant.no3 ||
      variant.no5),
  );
  if (isComplexVariant) return resolveVariantGuitarVoicing(fullChord, options);

  const quality = resolveVoicingQuality({
    ...chord,
    baseQuality: effectiveChordQuality(fullChord),
    ...(variant?.seventh ? { seventh: variant.seventh } : {}),
  });

  // Check if there is an exact slash chord variation if bass differs from root
  if (bassPc !== rootPc) {
    // Special slash voicings (e.g. C/E, C/G, D/F#, G/B)
    if (rootPc === 0 && bassPc === 4) {
      // C/E
      return buildVoicing("C/E", 0, 4, [0, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0], [], "slash");
    }
    if (rootPc === 0 && bassPc === 7) {
      // C/G
      return buildVoicing("C/G", 0, 7, [3, 3, 2, 0, 1, 0], [3, 4, 2, 0, 1, 0], [], "slash");
    }
    if (rootPc === 7 && bassPc === 11) {
      // G/B
      return buildVoicing("G/B", 7, 11, [-1, 2, 0, 0, 0, 3], [0, 1, 0, 0, 0, 3], [], "slash");
    }
    if (rootPc === 2 && bassPc === 6) {
      // D/F#
      return buildVoicing("D/F#", 2, 6, [2, 0, 0, 2, 3, 2], [1, 0, 0, 2, 4, 3], [], "slash");
    }

    // General slash chord: adapt bass note on 6th string or 5th string
    const fret6 = (bassPc - 4 + 12) % 12; // low E (PC 4)
    const fret5 = (bassPc - 9 + 12) % 12; // A (PC 9)
    const useString6 = fret6 <= 3 || (fret6 <= 5 && fret5 > 3);
    const bassStringIndex = useString6 ? 0 : 1;
    const bassFret = useString6 ? fret6 : fret5;

    const baseShape = CANONICAL_OPEN_SHAPES.find(
      (shape) => shape.rootPc === rootPc && shape.quality === quality,
    );
    if (baseShape) {
      const adaptedFrets: [number, number, number, number, number, number] = [...baseShape.frets];
      if (bassStringIndex === 0) {
        adaptedFrets[0] = bassFret;
      } else {
        adaptedFrets[0] = -1;
        adaptedFrets[1] = bassFret;
      }
      const slashFrets = ensureLowestBassPitch(adaptedFrets, bassPc);
      const slashFingers = [...(baseShape.fingers ?? [])];
      if (slashFrets[0]! > 0 && slashFrets[0] !== adaptedFrets[0]) slashFingers[0] = 1;
      return buildVoicing(
        chordSymbol,
        rootPc,
        bassPc,
        slashFrets,
        slashFingers.length > 0 ? slashFingers : undefined,
        baseShape.barres ?? [],
        "slash",
      );
    }
  }

  // 1. Try matching canonical open shape.
  //
  // Only a shape whose quality matches *exactly* may be used. The canonical open shapes
  // are all triads or dominant sevenths, so matching a seventh quality against the
  // "dominant" entry would silently drop the seventh (or, worse, substitute a major third
  // for a minor one) while looking like a successful open-chord match.
  const openShapeQuality = OPEN_SHAPE_QUALITIES.has(quality) ? quality : undefined;
  const openMatch =
    openShapeQuality === undefined
      ? undefined
      : CANONICAL_OPEN_SHAPES.find(
          (shape) => shape.rootPc === rootPc && shape.quality === openShapeQuality,
        );
  if (openMatch && (options?.preferOpen !== false || openMatch.baseFret === 1)) {
    return buildVoicing(
      chordSymbol,
      rootPc,
      bassPc,
      openMatch.frets,
      openMatch.fingers,
      openMatch.barres ?? [],
      openMatch.voicingStyle,
    );
  }

  // 2. Select between E-shape and A-shape movable barre based on minimal fret distance
  const eFret = (rootPc - MOVABLE_TEMPLATES.eShape.rootOffsetPc + 12) % 12;
  const aFret = (rootPc - MOVABLE_TEMPLATES.aShape.rootOffsetPc + 12) % 12;

  // Choose the template that results in a comfortable lower fret position (preferring fret <= 7)
  const useEShape = eFret <= aFret ? eFret <= 7 : aFret > 7;

  // The extended seventh qualities are served by the A-shape, which keeps the root on
  // string 5 as the bass across the whole neck. The E-shape covers the diatonic
  // qualities. Choosing a shape that lacks the quality would silently substitute
  // different notes, so the shape is chosen by quality first.
  let templateConfig: MovableTemplate;
  let fretOffset: number;
  let rootStringIndex: number;

  if (
    quality === "minor7" ||
    quality === "minor-major7" ||
    quality === "half-diminished7" ||
    quality === "diminished7" ||
    quality === "augmented"
  ) {
    // These qualities have no E-shape template; the A-shape is their only movable shape.
    fretOffset = aFret;
    rootStringIndex = MOVABLE_TEMPLATES.aShape.stringRootIndex;
    templateConfig =
      quality === "minor7"
        ? MOVABLE_TEMPLATES.aShape.minor7
        : quality === "minor-major7"
          ? MOVABLE_TEMPLATES.aShape.minorMajor7
          : quality === "half-diminished7"
            ? MOVABLE_TEMPLATES.aShape["half-diminished7"]
            : quality === "diminished7"
              ? MOVABLE_TEMPLATES.aShape.diminished7
              : MOVABLE_TEMPLATES.aShape.augmented;
  } else {
    // Dominant sevenths are always voiced from the E-shape: the A-shape cannot place the
    // root in the bass together with a reachable minor seventh, so using it silently drops
    // the seventh (audible on C#7, D#7 and A#7 before this was fixed).
    const forceEShape = quality === "dominant";
    const useEShapeForQuality = forceEShape ? true : useEShape;

    fretOffset = useEShapeForQuality ? eFret : aFret;
    rootStringIndex = useEShapeForQuality
      ? MOVABLE_TEMPLATES.eShape.stringRootIndex
      : MOVABLE_TEMPLATES.aShape.stringRootIndex;
    templateConfig = useEShapeForQuality
      ? quality === "minor"
        ? MOVABLE_TEMPLATES.eShape.minor
        : quality === "dominant"
          ? MOVABLE_TEMPLATES.eShape.dominant
          : quality === "major7"
            ? MOVABLE_TEMPLATES.eShape.major7
            : quality === "diminished"
              ? MOVABLE_TEMPLATES.eShape.diminished
              : MOVABLE_TEMPLATES.eShape.major
      : quality === "minor"
        ? MOVABLE_TEMPLATES.aShape.minor
        : quality === "dominant"
          ? MOVABLE_TEMPLATES.aShape.dominant
          : quality === "major7"
            ? MOVABLE_TEMPLATES.aShape.major7
            : quality === "diminished"
              ? MOVABLE_TEMPLATES.aShape.diminished
              : MOVABLE_TEMPLATES.aShape.major;
  }

  // Exhaustiveness guard: a quality that reaches this point without a matching template
  // would otherwise borrow `major` and sound wrong notes with no signal.
  const ROUTED_QUALITIES = new Set([
    "major",
    "minor",
    "dominant",
    "major7",
    "minor7",
    "minor-major7",
    "half-diminished7",
    "diminished7",
    "diminished",
    "augmented",
  ]);
  if (!ROUTED_QUALITIES.has(quality)) {
    throw new RangeError(`Unsupported guitar voicing quality: ${quality}`);
  }

  const rootFrets = templateConfig.relativeFrets.map((f) => (f === -1 ? -1 : f + fretOffset));
  const frets = bassPc !== rootPc ? ensureLowestBassPitch(rootFrets, bassPc) : rootFrets;
  const fingers = [...templateConfig.relativeFingers];
  if (frets[0]! > 0 && frets[0] !== rootFrets[0]) fingers[0] = 1;

  const barres: GuitarBarre[] = [];
  if (fretOffset > 0) {
    barres.push({
      fret: fretOffset,
      fromStringIndex: rootStringIndex,
      toStringIndex: 5,
      finger: 1,
    });
  }

  return buildVoicing(
    chordSymbol,
    rootPc,
    bassPc,
    frets,
    fingers,
    barres,
    templateConfig.voicingStyle,
  );
}
