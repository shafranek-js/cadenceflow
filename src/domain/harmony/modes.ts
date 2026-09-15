import {
  type BaseChordQuality,
  type ChordDefinition,
  type HarmonicVariant,
  EMPTY_HARMONIC_VARIANT,
} from "./chord";
import type { HarmonicFunctionIdentity } from "./functions";
import {
  normalizePitchClass,
  type DiatonicStep,
  type ExactPitch,
  type PitchClassIdentity,
  type PitchSpelling,
  exactPitch,
} from "./pitch";
import {
  formatPitchSpelling,
} from "./spelling";

export type DiatonicMode =
  | "ionian"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"
  | "locrian";

export type ExtendedScaleId =
  | DiatonicMode
  | "harmonic-minor"
  | "melodic-minor"
  | "blues"
  | "major-pentatonic"
  | "minor-pentatonic";

export type ScaleFamily = "diatonic" | "minor-variants" | "pentatonic-blues";

export interface ScaleDefinition {
  readonly id: ExtendedScaleId;
  readonly name: string;
  readonly family: ScaleFamily;
  readonly intervals: readonly number[]; // semitone offsets from tonic
  readonly formulaTextRu: string;
  readonly formulaTextEn: string;
  readonly characterRu: string;
  readonly characterEn: string;
  readonly characteristicDegree?: number; // 1-indexed degree (e.g. 6 for Dorian)
  readonly characteristicInterval?: string; // e.g. "♮6", "♭2", "♯4", "♭7", "♭5"
  readonly characteristicDescriptionRu?: string;
  readonly genreExamples: readonly string[];
}

export const SCALE_DEFINITIONS: readonly ScaleDefinition[] = Object.freeze([
  // 7 Church / Diatonic Modes
  {
    id: "ionian",
    name: "Ionian (Major)",
    family: "diatonic",
    intervals: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
    formulaTextRu: "Т–Т–П–Т–Т–Т–П",
    formulaTextEn: "W–W–H–W–W–W–H",
    characterRu: "Светлый, устойчивый, оптимистичный, классический мажор.",
    characterEn: "Bright, triumphant, stable, classical major tonality.",
    characteristicDegree: 1,
    characteristicInterval: "1",
    characteristicDescriptionRu: "Фундаментальный мажорный лад западной музыки.",
    genreExamples: Object.freeze(["Pop", "Classical", "Ballads", "Folk"]),
  },
  {
    id: "dorian",
    name: "Dorian",
    family: "diatonic",
    intervals: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
    formulaTextRu: "Т–П–Т–Т–Т–П–Т",
    formulaTextEn: "W–H–W–W–W–H–W",
    characterRu: "Благородный, джазово-фанковый, светлый минор без трагизма.",
    characterEn: "Soulful, jazzy, melancholic without sadness, funky groove.",
    characteristicDegree: 6,
    characteristicInterval: "♮6",
    characteristicDescriptionRu: "Высокая 6-я ступень (♮6) превращает субдоминанту в мажорный аккорд IV.",
    genreExamples: Object.freeze(["Funk", "Neo-Soul", "Jazz Fusion", "Pink Floyd", "Daft Punk"]),
  },
  {
    id: "phrygian",
    name: "Phrygian",
    family: "diatonic",
    intervals: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
    formulaTextRu: "П–Т–Т–Т–П–Т–Т",
    formulaTextEn: "H–W–W–W–H–W–W",
    characterRu: "Темный, тревожный, испанский колорит, экзотическое напряжение.",
    characterEn: "Dark, tense, flamenco, heavy metal, exotic Middle Eastern drama.",
    characteristicDegree: 2,
    characteristicInterval: "♭2",
    characteristicDescriptionRu: "Низкая 2-я ступень (♭2) создает яркий неаполитанский аккорд ♭II.",
    genreExamples: Object.freeze(["Flamenco", "Heavy Metal", "Cinematic Suspense", "Spanish Classical"]),
  },
  {
    id: "lydian",
    name: "Lydian",
    family: "diatonic",
    intervals: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
    formulaTextRu: "Т–Т–Т–П–Т–Т–П",
    formulaTextEn: "W–W–W–H–W–W–H",
    characterRu: "Космический, парящий, мистический, загадочный мажор.",
    characterEn: "Dreamy, ethereal, space-like, mysterious open major sound.",
    characteristicDegree: 4,
    characteristicInterval: "♯4",
    characteristicDescriptionRu: "Высокая 4-я ступень (♯4, тритон) дарит мажорную ступень II и ощущение полета.",
    genreExamples: Object.freeze(["Film Scores (E.T., Jurassic Park)", "Ambient", "Prog Rock", "Steve Vai"]),
  },
  {
    id: "mixolydian",
    name: "Mixolydian",
    family: "diatonic",
    intervals: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
    formulaTextRu: "Т–Т–П–Т–Т–П–Т",
    formulaTextEn: "W–W–H–W–W–H–W",
    characterRu: "Блюзовый, роковый, раскованный, фолковый мажор.",
    characterEn: "Bluesy, laid-back, classic rock anthem, Celtic folk harmony.",
    characteristicDegree: 7,
    characteristicInterval: "♭7",
    characteristicDescriptionRu: "Низкая 7-я ступень (♭7) делает тонику доминантовой и открывает аккорд ♭VII.",
    genreExamples: Object.freeze(["Classic Rock", "Blues-Rock", "Folk", "Beatles", "AC/DC"]),
  },
  {
    id: "aeolian",
    name: "Aeolian (Natural Minor)",
    family: "diatonic",
    intervals: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
    formulaTextRu: "Т–П–Т–Т–П–Т–Т",
    formulaTextEn: "W–H–W–W–H–W–W",
    characterRu: "Грустный, задумчивый, эпический, натуральный минор.",
    characterEn: "Somber, sad, epic minor ballad, contemplative mood.",
    characteristicDegree: 6,
    characteristicInterval: "♭6",
    characteristicDescriptionRu: "Классический натуральный минор со ступенью ♭VI.",
    genreExamples: Object.freeze(["Rock Ballads", "Soundtracks", "Indie", "Folk"]),
  },
  {
    id: "locrian",
    name: "Locrian",
    family: "diatonic",
    intervals: Object.freeze([0, 1, 3, 5, 6, 8, 10]),
    formulaTextRu: "П–Т–Т–П–Т–Т–Т",
    formulaTextEn: "H–W–W–H–W–W–W",
    characterRu: "Предельное напряжение, диссонанс, уменьшенная тоника.",
    characterEn: "Extreme instability, unresolved tension, diminished tonic.",
    characteristicDegree: 5,
    characteristicInterval: "♭5",
    characteristicDescriptionRu: "Уменьшенная квинта (♭5) делает даже тоническое трезвучие нестабильным.",
    genreExamples: Object.freeze(["Horror Soundtracks", "Extreme Metal", "Jazz Transitions"]),
  },

  // Extended & Color Scales
  {
    id: "harmonic-minor",
    name: "Harmonic Minor",
    family: "minor-variants",
    intervals: Object.freeze([0, 2, 3, 5, 7, 8, 11]),
    formulaTextRu: "Т–П–Т–Т–П–1.5Т–П",
    formulaTextEn: "W–H–W–W–H–1.5W–H",
    characterRu: "Неоклассический, барочный, драматичный восточный минор.",
    characterEn: "Neoclassical, baroque drama, Spanish/Arabic dramatic color.",
    characteristicDegree: 7,
    characteristicInterval: "♯7",
    characteristicDescriptionRu: "Повышенная 7-я ступень создает сильный вводный тон и мажорную доминанту V.",
    genreExamples: Object.freeze(["Neoclassical Metal", "Flamenco", "Baroque", "Yngwie Malmsteen"]),
  },
  {
    id: "melodic-minor",
    name: "Melodic Minor (Jazz Minor)",
    family: "minor-variants",
    intervals: Object.freeze([0, 2, 3, 5, 7, 9, 11]),
    formulaTextRu: "Т–П–Т–Т–Т–Т–П",
    formulaTextEn: "W–H–W–W–W–W–H",
    characterRu: "Джазовый, утонченный, современный плавный минор.",
    characterEn: "Jazz minor, sophisticated, smooth leading tones.",
    characteristicDegree: 6,
    characteristicInterval: "♮6, ♯7",
    characteristicDescriptionRu: "Высокие 6 и 7 ступени дают богатые джазовые надстройки.",
    genreExamples: Object.freeze(["Modern Jazz", "Fusion", "Cinema"]),
  },
  {
    id: "blues",
    name: "Blues Scale",
    family: "pentatonic-blues",
    intervals: Object.freeze([0, 3, 5, 6, 7, 10]),
    formulaTextRu: "1.5Т–Т–П–П–1.5Т–Т",
    formulaTextEn: "1.5W–W–H–H–1.5W–W",
    characterRu: "Сырой, эмоциональный, с характерной «блюзовой нотой» (♭5).",
    characterEn: "Raw, gritty, expressive with the signature blue note (♭5).",
    characteristicDegree: 4,
    characteristicInterval: "♭5",
    characteristicDescriptionRu: "Тритоновая blue note (♭5) создает культовый эффект блюзового стона.",
    genreExamples: Object.freeze(["Delta Blues", "Chicago Blues", "Hard Rock", "Funk"]),
  },
  {
    id: "major-pentatonic",
    name: "Major Pentatonic",
    family: "pentatonic-blues",
    intervals: Object.freeze([0, 2, 4, 7, 9]),
    formulaTextRu: "Т–Т–1.5Т–Т–1.5Т",
    formulaTextEn: "W–W–1.5W–W–1.5W",
    characterRu: "Чистый, душевный, без диссонансов, фолк и кантри.",
    characterEn: "Pure, open, dissonance-free, universal folk and country sound.",
    genreExamples: Object.freeze(["Country", "Folk", "Pop", "Gospel"]),
  },
  {
    id: "minor-pentatonic",
    name: "Minor Pentatonic",
    family: "pentatonic-blues",
    intervals: Object.freeze([0, 3, 5, 7, 10]),
    formulaTextRu: "1.5Т–Т–Т–1.5Т–Т",
    formulaTextEn: "1.5W–W–W–1.5W–W",
    characterRu: "Мощный, роковый, фундаментальный риффовый звукоряд.",
    characterEn: "Rock backbone, hard-hitting, ubiquitous guitar riff scale.",
    genreExamples: Object.freeze(["Rock", "Blues", "Funk", "Pop"]),
  },
]);

const STEPS: readonly DiatonicStep[] = Object.freeze(["C", "D", "E", "F", "G", "A", "B"]);
const NATURAL_PC: Readonly<Record<DiatonicStep, number>> = Object.freeze({
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
});

// Major scale intervals for comparison
const MAJOR_SCALE_INTERVALS = Object.freeze([0, 2, 4, 5, 7, 9, 11]);

export function getScaleDefinition(scaleId: ExtendedScaleId): ScaleDefinition {
  const found = SCALE_DEFINITIONS.find((s) => s.id === scaleId);
  if (!found) {
    throw new RangeError(`Unknown scale ID: ${scaleId}`);
  }
  return found;
}

export interface ScaleDegreePitch {
  readonly degree: number; // 1-indexed
  readonly pitchClass: PitchClassIdentity;
  readonly spelling: PitchSpelling;
  readonly intervalFromTonic: number;
  readonly isCharacteristic: boolean;
}

export interface ModalChordDefinition {
  readonly degree: number; // 1-indexed (1..7)
  readonly romanNumeral: string;
  readonly chordSymbol: string;
  readonly chord: ChordDefinition;
  readonly isCharacteristicChord: boolean;
  readonly pitches: readonly ExactPitch[];
}

export interface ModalFormulaStep {
  readonly degree: number;
  readonly symbol: string;
  readonly quality: BaseChordQuality;
  readonly seventh?: HarmonicVariant["seventh"] | undefined;
  readonly durationBeats?: number | undefined;
}

export interface ModalCadenceFormula {
  readonly id: string;
  readonly title: string;
  readonly modeId: ExtendedScaleId;
  readonly genreTag: string;
  readonly description: string;
  readonly romanProgression: string;
  readonly steps: readonly ModalFormulaStep[];
}

function spellTonicRoot(tonic: PitchClassIdentity): PitchSpelling {
  const norm = normalizePitchClass(tonic);
  const COMMON_TONICS: Readonly<Record<number, PitchSpelling>> = {
    0: { step: "C", alter: 0 },
    1: { step: "D", alter: -1 },
    2: { step: "D", alter: 0 },
    3: { step: "E", alter: -1 },
    4: { step: "E", alter: 0 },
    5: { step: "F", alter: 0 },
    6: { step: "F", alter: 1 },
    7: { step: "G", alter: 0 },
    8: { step: "A", alter: -1 },
    9: { step: "A", alter: 0 },
    10: { step: "B", alter: -1 },
    11: { step: "B", alter: 0 },
  };
  return COMMON_TONICS[norm] ?? { step: "C", alter: 0 };
}

function spellBestPitchClass(pc: PitchClassIdentity): PitchSpelling {
  return spellTonicRoot(pc);
}

/**
 * Computes exact pitch spellings and degrees for a scale starting on tonic.
 * Uses heptatonic consecutive letter naming for 7-note scales to avoid duplicate letter names.
 */
export function computeScalePitches(
  tonic: PitchClassIdentity,
  scaleId: ExtendedScaleId,
): readonly ScaleDegreePitch[] {
  const scale = getScaleDefinition(scaleId);
  const isHeptatonic = scale.intervals.length === 7;

  // Resolve tonic spelling: default to standard major spelling
  const tonicSpelling = spellTonicRoot(tonic);
  const tonicStepIndex = STEPS.indexOf(tonicSpelling.step);

  return Object.freeze(
    scale.intervals.map((interval, index) => {
      const pc = normalizePitchClass(tonic + interval);
      let spelling: PitchSpelling;

      if (isHeptatonic) {
        // Strict letter cycling: 1 -> C, 2 -> D, 3 -> E, etc.
        const step = STEPS[(tonicStepIndex + index) % 7]!;
        const naturalPc = NATURAL_PC[step];
        let alter = pc - naturalPc;
        while (alter > 6) alter -= 12;
        while (alter < -6) alter += 12;
        spelling = { step, alter };
      } else {
        // Pentatonic / Blues: best match spelling
        spelling = spellBestPitchClass(pc);
      }

      return Object.freeze({
        degree: index + 1,
        pitchClass: pc,
        spelling: Object.freeze(spelling),
        intervalFromTonic: interval,
        isCharacteristic: scale.characteristicDegree === index + 1,
      });
    }),
  );
}

/**
 * Derives the 7 diatonic triads and 7th chords for a 7-note scale.
 */
export function computeModalChords(
  tonic: PitchClassIdentity,
  scaleId: ExtendedScaleId,
): readonly ModalChordDefinition[] {
  const scale = getScaleDefinition(scaleId);
  if (scale.intervals.length !== 7) {
    // For non-7 note scales, return chords derived from root tonic
    return Object.freeze([]);
  }

  const scalePitches = computeScalePitches(tonic, scaleId);
  const characteristicDegree = scale.characteristicDegree;

  return Object.freeze(
    scalePitches.map((rootPitch, degreeIdx) => {
      const degree = degreeIdx + 1;
      const rootPc = rootPitch.pitchClass;
      const rootSpelling = rootPitch.spelling;

      // 3rd, 5th, 7th by skipping steps
      const thirdPitch = scalePitches[(degreeIdx + 2) % 7]!;
      const fifthPitch = scalePitches[(degreeIdx + 4) % 7]!;
      const seventhPitch = scalePitches[(degreeIdx + 6) % 7]!;

      const thirdInterval = normalizePitchClass(thirdPitch.pitchClass - rootPc);
      const fifthInterval = normalizePitchClass(fifthPitch.pitchClass - rootPc);
      const seventhInterval = normalizePitchClass(seventhPitch.pitchClass - rootPc);

      // Determine quality
      let quality: BaseChordQuality;
      let seventhVariant: HarmonicVariant["seventh"] | undefined;

      if (thirdInterval === 3 && fifthInterval === 6) {
        quality = "diminished";
        seventhVariant = seventhInterval === 10 ? "half-diminished7" : seventhInterval === 9 ? "diminished7" : undefined;
      } else if (thirdInterval === 3 && fifthInterval === 7) {
        quality = "minor";
        seventhVariant = seventhInterval === 10 ? "minor7" : seventhInterval === 11 ? "major7" : undefined;
      } else if (thirdInterval === 4 && fifthInterval === 7) {
        if (seventhInterval === 10) {
          quality = "dominant";
          seventhVariant = undefined;
        } else {
          quality = "major";
          seventhVariant = seventhInterval === 11 ? "major7" : undefined;
        }
      } else if (thirdInterval === 4 && fifthInterval === 8) {
        quality = "augmented";
      } else {
        quality = "major";
      }

      // Build Roman numeral:
      // Compare degree's interval to major scale degree interval
      const majorInterval = MAJOR_SCALE_INTERVALS[degreeIdx]!;
      const degreeInterval = scale.intervals[degreeIdx]!;
      let prefix = "";
      if (degreeInterval === majorInterval - 1) prefix = "♭";
      else if (degreeInterval === majorInterval + 1) prefix = "♯";

      const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;
      const baseNumeral = ROMAN_NUMERALS[degreeIdx]!;
      let romanNumeral: string;
      if (quality === "minor") {
        romanNumeral = `${prefix}${baseNumeral.toLowerCase()}${seventhVariant === "minor7" ? "⁷" : ""}`;
      } else if (quality === "diminished") {
        romanNumeral = `${prefix}${baseNumeral.toLowerCase()}°${seventhVariant === "half-diminished7" ? "ø⁷" : ""}`;
      } else if (quality === "dominant") {
        romanNumeral = `${prefix}${baseNumeral}⁷`;
      } else {
        romanNumeral = `${prefix}${baseNumeral}${seventhVariant === "major7" ? "maj⁷" : ""}`;
      }

      // Chord symbol (e.g. Dm7, G7, Fmaj7)
      const rootName = formatPitchSpelling(rootSpelling);
      let chordSymbol = rootName;
      if (quality === "minor") chordSymbol += seventhVariant === "minor7" ? "m7" : "m";
      else if (quality === "diminished") chordSymbol += seventhVariant === "half-diminished7" ? "m7♭5" : "°";
      else if (quality === "dominant") chordSymbol += "7";
      else if (quality === "major") chordSymbol += seventhVariant === "major7" ? "maj7" : "";
      else if (quality === "augmented") chordSymbol += "aug";

      // Does this chord contain the characteristic note?
      const chordDegrees = [degreeIdx + 1, ((degreeIdx + 2) % 7) + 1, ((degreeIdx + 4) % 7) + 1];
      const isCharacteristicChord = Boolean(
        characteristicDegree && chordDegrees.includes(characteristicDegree),
      );

      const variant: HarmonicVariant = Object.freeze({
        ...(seventhVariant ? { seventh: seventhVariant } : {}),
        extensions: Object.freeze([]),
        suspensions: Object.freeze([]),
        alterations: Object.freeze([]),
      });

      const functionIdentity: HarmonicFunctionIdentity = Object.freeze({
        moduleId: "progressions",
        functionId: `mode-${scaleId}-${degree}`,
        category: "core",
      });

      const chord: ChordDefinition = Object.freeze({
        harmonicFunction: functionIdentity,
        rootPitchClass: rootPc,
        baseQuality: quality,
        variant,
        spelling: Object.freeze({
          root: rootSpelling,
          symbol: chordSymbol,
        }),
      });

      // Construct audition exact pitches in octave 4
      const baseMidi = 48 + rootPc;
      const pitches: ExactPitch[] = [
        exactPitch(baseMidi, rootSpelling),
        exactPitch(baseMidi + thirdInterval, thirdPitch.spelling),
        exactPitch(baseMidi + fifthInterval, fifthPitch.spelling),
        ...(seventhInterval ? [exactPitch(baseMidi + seventhInterval, seventhPitch.spelling)] : []),
      ];

      return Object.freeze({
        degree,
        romanNumeral,
        chordSymbol,
        chord,
        isCharacteristicChord,
        pitches: Object.freeze(pitches),
      });
    }),
  );
}

function fStep(
  degree: number,
  symbol: string,
  quality: BaseChordQuality,
  seventh?: HarmonicVariant["seventh"],
  durationBeats = 4,
): ModalFormulaStep {
  return Object.freeze({
    degree,
    symbol,
    quality,
    ...(seventh ? { seventh } : {}),
    durationBeats,
  });
}

export const CANONICAL_MODAL_FORMULAS: readonly ModalCadenceFormula[] = Object.freeze([
  // Dorian
  {
    id: "dorian-funk-vamp",
    title: "Dorian Funk Vamp",
    modeId: "dorian",
    genreTag: "Funk / Neo-Soul",
    description: "Classic two-chord groove powered by the major IV with natural 6th. Signature sound of Daft Punk, Santana, and Stevie Wonder.",
    romanProgression: "i⁷ → IV⁷ → i⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(4, "IV7", "dominant"),
      fStep(1, "i7", "minor", "minor7"),
    ]),
  },
  {
    id: "dorian-extended-turnaround",
    title: "Dorian Extended Groove",
    modeId: "dorian",
    genreTag: "Modern Jazz / R&B",
    description: "Smooth stepwise chord movement incorporating the ♭VII and major IV before returning to minor tonic.",
    romanProgression: "i⁷ → ♭VIImaj⁷ → IV⁷ → i⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(7, "♭VIImaj7", "major", "major7"),
      fStep(4, "IV7", "dominant"),
      fStep(1, "i7", "minor", "minor7"),
    ]),
  },

  // Phrygian
  {
    id: "phrygian-flamenco",
    title: "Phrygian Flamenco Cadence",
    modeId: "phrygian",
    genreTag: "Flamenco / Spanish",
    description: "Iconic Spanish half-step resolution between the Neapolitan ♭II and the dark minor tonic i.",
    romanProgression: "i → ♭II → i",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(2, "♭II", "major"),
      fStep(1, "i", "minor"),
    ]),
  },
  {
    id: "phrygian-metal-descent",
    title: "Phrygian Heavy Descent",
    modeId: "phrygian",
    genreTag: "Heavy Metal / Cinematic",
    description: "Tense descending drama shifting between minor tonic, subtonic ♭vii, submediant ♭VI, and flat second ♭II.",
    romanProgression: "i → ♭VII → ♭VI → ♭II",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(7, "♭vii", "minor"),
      fStep(6, "♭VI", "major"),
      fStep(2, "♭II", "major"),
    ]),
  },

  // Lydian
  {
    id: "lydian-space-lift",
    title: "Lydian Cinematic Space (E.T. Lift)",
    modeId: "lydian",
    genreTag: "Cinematic Sci-Fi",
    description: "Pure flight and wonder. The major II chord containing the ♯4 creates an uplifting, weightless ascent.",
    romanProgression: "Imaj⁷ → II → Imaj⁷",
    steps: Object.freeze([
      fStep(1, "Imaj7", "major", "major7"),
      fStep(2, "II", "major"),
      fStep(1, "Imaj7", "major", "major7"),
    ]),
  },
  {
    id: "lydian-flying-voyage",
    title: "Lydian Flying Voyage",
    modeId: "lydian",
    genreTag: "Fantasy / Ambient",
    description: "Expanding the Lydian dreamscape through major II and dominant Vmaj7 before resolving softly to tonic.",
    romanProgression: "Imaj⁷ → II → Vmaj⁷ → Imaj⁷",
    steps: Object.freeze([
      fStep(1, "Imaj7", "major", "major7"),
      fStep(2, "II", "major"),
      fStep(5, "Vmaj7", "major", "major7"),
      fStep(1, "Imaj7", "major", "major7"),
    ]),
  },

  // Mixolydian
  {
    id: "mixolydian-rock-anthem",
    title: "Mixolydian Rock Anthem",
    modeId: "mixolydian",
    genreTag: "Classic Rock",
    description: "The lifeblood of classic rock and stadium anthems. Lynyrd Skynyrd, The Beatles, AC/DC, Guns N' Roses.",
    romanProgression: "I → ♭VII → IV → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(7, "♭VII", "major"),
      fStep(4, "IV", "major"),
      fStep(1, "I", "major"),
    ]),
  },
  {
    id: "mixolydian-blues-vamp",
    title: "Mixolydian Dominant Groove",
    modeId: "mixolydian",
    genreTag: "Blues / Jam Band",
    description: "Dominant 7th tonic anchoring a relaxed groove alongside the flat-seventh subtonic chord.",
    romanProgression: "I⁷ → ♭VII → I⁷",
    steps: Object.freeze([
      fStep(1, "I7", "dominant"),
      fStep(7, "♭VII", "major"),
      fStep(1, "I7", "dominant"),
    ]),
  },

  // Aeolian
  {
    id: "aeolian-epic-ballad",
    title: "Aeolian Epic Ballad",
    modeId: "aeolian",
    genreTag: "Epic Rock / Pop",
    description: "Grand natural minor emotional trajectory through flat submediant and subtonic.",
    romanProgression: "i → ♭VI → ♭III → ♭VII",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(6, "♭VI", "major"),
      fStep(3, "♭III", "major"),
      fStep(7, "♭VII", "major"),
    ]),
  },

  // Harmonic Minor
  {
    id: "harmonic-minor-baroque",
    title: "Harmonic Minor Baroque Drama",
    modeId: "harmonic-minor",
    genreTag: "Neoclassical / Metal",
    description: "Authentic minor cadence elevated by the dramatic leading tone in the major dominant V7.",
    romanProgression: "i → iv → V⁷ → i",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(4, "iv", "minor"),
      fStep(5, "V7", "dominant"),
      fStep(1, "i", "minor"),
    ]),
  },

  // Blues
  {
    id: "blues-quick-change",
    title: "12-Bar Blues Quick Change",
    modeId: "blues",
    genreTag: "Traditional Blues",
    description: "Fundamental 12-bar blues progression with dominant tonic and quick change to subdominant IV7.",
    romanProgression: "I⁷ → IV⁷ → I⁷ → V⁷ → IV⁷ → I⁷",
    steps: Object.freeze([
      fStep(1, "I7", "dominant"),
      fStep(4, "IV7", "dominant"),
      fStep(1, "I7", "dominant"),
      fStep(5, "V7", "dominant"),
      fStep(4, "IV7", "dominant"),
      fStep(1, "I7", "dominant"),
    ]),
  },
]);

const DIATONIC_MODE_PARENT_OFFSETS: Readonly<Record<DiatonicMode, number>> = Object.freeze({
  ionian: 0,
  dorian: 2,
  phrygian: 4,
  lydian: 5,
  mixolydian: 7,
  aeolian: 9,
  locrian: 11,
});

const DIATONIC_MODE_FUNCTION_MAP: Readonly<Record<DiatonicMode, readonly string[]>> = Object.freeze({
  ionian: Object.freeze(["I", "ii", "iii", "IV", "V", "vi", "vii°"]),
  dorian: Object.freeze(["ii", "iii", "IV", "V", "vi", "vii°", "I"]),
  phrygian: Object.freeze(["iii", "IV", "V", "vi", "vii°", "I", "ii"]),
  lydian: Object.freeze(["IV", "V", "vi", "vii°", "I", "ii", "iii"]),
  mixolydian: Object.freeze(["V", "vi", "vii°", "I", "ii", "iii", "IV"]),
  aeolian: Object.freeze(["vi", "vii°", "I", "ii", "iii", "IV", "V"]),
  locrian: Object.freeze(["vii°", "I", "ii", "iii", "IV", "V", "vi"]),
});

export function getModalParentKeyAndFunction(
  modalTonic: PitchClassIdentity,
  modeId: ExtendedScaleId,
  degree: number, // 1-indexed (1..7)
): {
  readonly parentTonic: PitchClassIdentity;
  readonly functionId: string;
  readonly moduleId: "progressions" | "dark-harmony";
} {
  const normTonic = normalizePitchClass(modalTonic);
  if (modeId in DIATONIC_MODE_PARENT_OFFSETS) {
    const diatonicMode = modeId as DiatonicMode;
    const parentOffset = DIATONIC_MODE_PARENT_OFFSETS[diatonicMode];
    const parentTonic = normalizePitchClass(normTonic - parentOffset);
    const functionList = DIATONIC_MODE_FUNCTION_MAP[diatonicMode];
    const functionId = functionList[(degree - 1) % 7] ?? "I";
    return {
      parentTonic,
      functionId,
      moduleId: "progressions",
    };
  }

  // Fallback for non-diatonic: relative mapping
  return {
    parentTonic: normTonic,
    functionId: degree === 1 ? "I" : degree === 4 ? "IV" : degree === 5 ? "V" : "vi",
    moduleId: "progressions",
  };
}

