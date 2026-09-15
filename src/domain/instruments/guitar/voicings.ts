import {
  normalizePitchClass,
  type ExactPitch,
  type PitchClassIdentity,
} from "../../harmony/pitch";
import type { ChordDefinition } from "../../harmony/chord";
import {
  GUITAR_STANDARD_TUNING,
  getFretPitchClass,
  getGuitarPitch,
} from "./tuning";

export type GuitarFretRole = "root" | "chord-tone" | "scale-tone";

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
    frets: [-1, 3, 2, 3, 1, 0],
    fingers: [0, 3, 2, 4, 1, 0],
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
      relativeFrets: [-1, 0, 2, 0, 2, 0] as const,
      relativeFingers: [0, 1, 3, 1, 4, 1] as const,
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
  },
};

export interface ResolveVoicingOptions {
  readonly preferOpen?: boolean;
  readonly bassPitchClass?: PitchClassIdentity;
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
 * Resolves the optimal, ergonomic guitar chord voicing for any chord definition or root/quality pair.
 */
export function resolveGuitarChordVoicing(
  chord: Pick<ChordDefinition, "rootPitchClass" | "baseQuality" | "spelling"> & {
    readonly isSeventh?: boolean;
    readonly isMajor7?: boolean;
    readonly bassPitchClass?: PitchClassIdentity;
  },
  options?: ResolveVoicingOptions,
): GuitarChordVoicing {
  const rootPc = normalizePitchClass(chord.rootPitchClass);
  const bassPc = options?.bassPitchClass ?? chord.bassPitchClass ?? rootPc;
  const chordSymbol = chord.spelling.symbol;

  let quality = chord.baseQuality as string;
  if (chord.isMajor7) quality = "major7";
  else if (chord.isSeventh || quality === "dominant") quality = "dominant";

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
  }

  // 1. Try matching canonical open shape
  const openMatch = CANONICAL_OPEN_SHAPES.find(
    (shape) => shape.rootPc === rootPc && shape.quality === quality,
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
  const chosenTemplate = useEShape ? MOVABLE_TEMPLATES.eShape : MOVABLE_TEMPLATES.aShape;
  const fretOffset = useEShape ? eFret : aFret;

  // Map quality to template key
  const templateConfig =
    quality === "minor"
      ? chosenTemplate.minor
      : quality === "dominant"
        ? chosenTemplate.dominant
        : quality === "major7"
          ? chosenTemplate.major7
          : quality === "diminished" || quality === "augmented"
            ? chosenTemplate.diminished
            : chosenTemplate.major;

  const frets = templateConfig.relativeFrets.map((f) => (f === -1 ? -1 : f + fretOffset));
  const fingers = [...templateConfig.relativeFingers];

  const barres: GuitarBarre[] = [];
  if (fretOffset > 0) {
    barres.push({
      fret: fretOffset,
      fromStringIndex: chosenTemplate.stringRootIndex,
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
