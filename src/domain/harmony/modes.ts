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
    characteristicDegree: 7,
    characteristicInterval: "♮7",
    characteristicDescriptionRu: "Вводный тон (♮7) создает сильное тяготение в тонику и формирует мажорную доминанту V⁷.",
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
    characteristicDegree: 5,
    characteristicInterval: "6",
    characteristicDescriptionRu: "Мажорная секста (6) без полутонов и тритона придает открытую, теплую народную певучесть.",
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
    characteristicDegree: 5,
    characteristicInterval: "♭7",
    characteristicDescriptionRu: "Малая септима (♭7) без вводного тона и шестой ступени создает мощный, бескомпромиссный роковый и блюзовый напор.",
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
interface CustomScaleChordSpec {
  readonly degree: number;
  readonly romanNumeral: string;
  readonly quality: BaseChordQuality;
  readonly seventh?: HarmonicVariant["seventh"];
  readonly isCharacteristic?: boolean;
}

const CUSTOM_SCALE_CHORD_SPECS: Record<
  "major-pentatonic" | "minor-pentatonic" | "blues",
  readonly CustomScaleChordSpec[]
> = {
  "major-pentatonic": [
    { degree: 1, romanNumeral: "Imaj⁷", quality: "major", seventh: "major7" },
    { degree: 2, romanNumeral: "ii⁷", quality: "minor", seventh: "minor7", isCharacteristic: true },
    { degree: 3, romanNumeral: "iii⁷", quality: "minor", seventh: "minor7" },
    { degree: 4, romanNumeral: "V⁷", quality: "dominant" },
    { degree: 5, romanNumeral: "vi⁷", quality: "minor", seventh: "minor7", isCharacteristic: true },
  ],
  "minor-pentatonic": [
    { degree: 1, romanNumeral: "i⁷", quality: "minor", seventh: "minor7", isCharacteristic: true },
    { degree: 2, romanNumeral: "♭IIImaj⁷", quality: "major", seventh: "major7" },
    { degree: 3, romanNumeral: "iv⁷", quality: "minor", seventh: "minor7" },
    { degree: 4, romanNumeral: "v⁷", quality: "minor", seventh: "minor7" },
    { degree: 5, romanNumeral: "♭VII⁷", quality: "dominant", isCharacteristic: true },
  ],
  blues: [
    { degree: 1, romanNumeral: "I⁷", quality: "dominant", isCharacteristic: true },
    { degree: 2, romanNumeral: "♭III⁷", quality: "dominant" },
    { degree: 3, romanNumeral: "IV⁷", quality: "dominant" },
    { degree: 4, romanNumeral: "♭v°⁷", quality: "diminished", seventh: "diminished7", isCharacteristic: true },
    { degree: 5, romanNumeral: "V⁷", quality: "dominant" },
    { degree: 6, romanNumeral: "♭VII⁷", quality: "dominant", isCharacteristic: true },
  ],
};

/**
 * Computes diatonic or characteristic chords for any of the 12 scales.
 */
export function computeModalChords(
  tonic: PitchClassIdentity,
  scaleId: ExtendedScaleId,
): readonly ModalChordDefinition[] {
  if (scaleId in CUSTOM_SCALE_CHORD_SPECS) {
    const specs = CUSTOM_SCALE_CHORD_SPECS[scaleId as keyof typeof CUSTOM_SCALE_CHORD_SPECS];
    const scalePitches = computeScalePitches(tonic, scaleId);

    return Object.freeze(
      specs.map((spec) => {
        const rootPitch = scalePitches[spec.degree - 1]!;
        const rootPc = rootPitch.pitchClass;
        const rootSpelling = rootPitch.spelling;
        const quality = spec.quality;
        const seventhVariant = spec.seventh;

        const thirdInterval = quality === "minor" || quality === "diminished" ? 3 : 4;
        const fifthInterval = quality === "diminished" ? 6 : quality === "augmented" ? 8 : 7;
        const seventhInterval =
          seventhVariant === "major7"
            ? 11
            : seventhVariant === "minor7" || quality === "dominant"
              ? 10
              : seventhVariant === "diminished7"
                ? 9
                : undefined;

        const rootName = formatPitchSpelling(rootSpelling);
        let chordSymbol = rootName;
        if (quality === "minor") chordSymbol += seventhVariant === "minor7" ? "m7" : "m";
        else if (quality === "diminished") chordSymbol += seventhVariant === "diminished7" ? "°7" : "°";
        else if (quality === "dominant") chordSymbol += "7";
        else if (quality === "major") chordSymbol += seventhVariant === "major7" ? "maj7" : "";
        else if (quality === "augmented") chordSymbol += "aug";

        const variant: HarmonicVariant = Object.freeze({
          ...(seventhVariant ? { seventh: seventhVariant } : {}),
          extensions: Object.freeze([]),
          suspensions: Object.freeze([]),
          alterations: Object.freeze([]),
        });

        const functionIdentity: HarmonicFunctionIdentity = Object.freeze({
          moduleId: "progressions",
          functionId: `mode-${scaleId}-${spec.degree}`,
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

        const baseMidi = 48 + rootPc;
        const pitches: ExactPitch[] = [
          exactPitch(baseMidi, rootSpelling),
          exactPitch(baseMidi + thirdInterval, spellTonicRoot(normalizePitchClass(rootPc + thirdInterval))),
          exactPitch(baseMidi + fifthInterval, spellTonicRoot(normalizePitchClass(rootPc + fifthInterval))),
          ...(seventhInterval !== undefined
            ? [exactPitch(baseMidi + seventhInterval, spellTonicRoot(normalizePitchClass(rootPc + seventhInterval)))]
            : []),
        ];

        return Object.freeze({
          degree: spec.degree,
          romanNumeral: spec.romanNumeral,
          chordSymbol,
          chord,
          isCharacteristicChord: Boolean(spec.isCharacteristic),
          pitches: Object.freeze(pitches),
        });
      }),
    );
  }

  const scale = getScaleDefinition(scaleId);
  if (scale.intervals.length !== 7) {
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
  // 1. Ionian (Major)
  {
    id: "ionian-authentic-cadence",
    title: "Ionian Authentic Cadence",
    modeId: "ionian",
    genreTag: "Classical / Hymn",
    description: "The foundational cadence of Western harmony: subdominant preparation, dominant leading-tone tension, and triumphant tonic resolution.",
    romanProgression: "I → IV → V⁷ → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(4, "IV", "major"),
      fStep(5, "V7", "dominant"),
      fStep(1, "I", "major"),
    ]),
  },
  {
    id: "ionian-doo-wop",
    title: "Ionian 50s Doo-Wop Progression",
    modeId: "ionian",
    genreTag: "Pop / Doo-Wop / Ballad",
    description: "The most celebrated turnaround in popular music history, driving timeless ballads and sweet nostalgic vocal melodies.",
    romanProgression: "I → vi → IV → V⁷",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(6, "vi", "minor", "minor7"),
      fStep(4, "IV", "major"),
      fStep(5, "V7", "dominant"),
    ]),
  },
  {
    id: "ionian-pop-anthem",
    title: "Ionian Four-Chord Anthem",
    modeId: "ionian",
    genreTag: "Modern Pop / Rock",
    description: "The ubiquitous modern radio progression behind hundreds of global stadium anthems and uplifting hooks.",
    romanProgression: "I → V → vi → IV",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(5, "V", "major"),
      fStep(6, "vi", "minor"),
      fStep(4, "IV", "major"),
    ]),
  },
  {
    id: "ionian-pachelbel-descent",
    title: "Ionian Pachelbel Descent (Canon Line)",
    modeId: "ionian",
    genreTag: "Baroque / Classical",
    description: "The legendary Canon in D sequence: an eight-chord descending bass journey that underpins both Baroque counterpoint and modern pop.",
    romanProgression: "I → V → vi → iii → IV → I → IV → V",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(5, "V", "major"),
      fStep(6, "vi", "minor"),
      fStep(3, "iii", "minor"),
      fStep(4, "IV", "major"),
      fStep(1, "I", "major"),
      fStep(4, "IV", "major"),
      fStep(5, "V", "major"),
    ]),
  },
  {
    id: "ionian-jazz-turnaround",
    title: "Ionian Jazz Rhythm Turnaround",
    modeId: "ionian",
    genreTag: "Jazz Standard / Swing",
    description: "The classic American Songbook circle-of-fifths turnaround anchoring jazz standards, swing themes, and Broadway melodies.",
    romanProgression: "Imaj⁷ → vi⁷ → ii⁷ → V⁷",
    steps: Object.freeze([
      fStep(1, "Imaj7", "major", "major7"),
      fStep(6, "vi7", "minor", "minor7"),
      fStep(2, "ii7", "minor", "minor7"),
      fStep(5, "V7", "dominant"),
    ]),
  },

  // 2. Dorian
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
  {
    id: "dorian-modal-jazz-so-what",
    title: "Dorian Modal Jazz Step (So What)",
    modeId: "dorian",
    genreTag: "Modal Jazz / Cool Jazz",
    description: "Miles Davis' and Bill Evans' revolutionary modal movement: cool parallel minor movement highlighting the Dorian ♮6.",
    romanProgression: "i⁷ → ii⁷ → i⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(2, "ii7", "minor", "minor7"),
      fStep(1, "i7", "minor", "minor7"),
    ]),
  },
  {
    id: "dorian-psychedelic-breathe",
    title: "Dorian Psychedelic Drift (Breathe)",
    modeId: "dorian",
    genreTag: "Psychedelic Rock",
    description: "Hypnotic Pink Floyd cosmic atmosphere: spacious minor tonic floating into the luminous major IV.",
    romanProgression: "i → IV → i → IV",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(4, "IV", "major"),
      fStep(1, "i", "minor"),
      fStep(4, "IV", "major"),
    ]),
  },
  {
    id: "dorian-folk-scarborough",
    title: "Dorian Folk Ballad (Scarborough)",
    modeId: "dorian",
    genreTag: "Celtic / English Folk",
    description: "Ancient modal folk progression evoking medieval troubadour tales and timeless acoustic ballads.",
    romanProgression: "i → ♭VII → i → IV",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(7, "♭VII", "major"),
      fStep(1, "i", "minor"),
      fStep(4, "IV", "major"),
    ]),
  },

  // 3. Phrygian
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
  {
    id: "phrygian-metal-chug",
    title: "Phrygian Metal Chug",
    modeId: "phrygian",
    genreTag: "Thrash Metal / Djent",
    description: "Brutal palm-muted half-step riffing engine used across thrash, death metal, and modern aggressive scoring.",
    romanProgression: "i → ♭II → i → ♭II",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(2, "♭II", "major"),
      fStep(1, "i", "minor"),
      fStep(2, "♭II", "major"),
    ]),
  },
  {
    id: "phrygian-desert-caravan",
    title: "Phrygian Desert Caravan",
    modeId: "phrygian",
    genreTag: "World / Cinematic Suspense",
    description: "Exotic Middle Eastern desert journey emphasizing the dark ♭2 and wandering minor ♭vii.",
    romanProgression: "i → ♭II → ♭vii → i",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(2, "♭II", "major"),
      fStep(7, "♭vii", "minor"),
      fStep(1, "i", "minor"),
    ]),
  },

  // 4. Lydian
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
  {
    id: "lydian-dream-pop-shimmer",
    title: "Lydian Dream Pop Shimmer",
    modeId: "lydian",
    genreTag: "Shoegaze / Dream Pop",
    description: "Lush, chorus-drenched ethereal movement between tonic and the soft minor vii.",
    romanProgression: "Imaj⁷ → vii⁷ → Imaj⁷",
    steps: Object.freeze([
      fStep(1, "Imaj7", "major", "major7"),
      fStep(7, "vii7", "minor", "minor7"),
      fStep(1, "Imaj7", "major", "major7"),
    ]),
  },
  {
    id: "lydian-heroic-ascent",
    title: "Lydian Heroic Whimsy",
    modeId: "lydian",
    genreTag: "Animation / Film Theme",
    description: "Danny Elfman and Pixar-style bright, whimsical harmonic lift with vibrant tonal curiosity.",
    romanProgression: "I → II → IV → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(2, "II", "major"),
      fStep(4, "IV", "major"),
      fStep(1, "I", "major"),
    ]),
  },
  {
    id: "lydian-satriani-flight",
    title: "Lydian Virtuoso Flight (Satriani)",
    modeId: "lydian",
    genreTag: "Instrumental Rock",
    description: "Inspired by Joe Satriani's 'Flying in a Blue Dream', combining the energetic ♯4 with smooth submediant resolution.",
    romanProgression: "I → II → vi → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(2, "II", "major"),
      fStep(6, "vi", "minor"),
      fStep(1, "I", "major"),
    ]),
  },

  // 5. Mixolydian
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
  {
    id: "mixolydian-celtic-reel",
    title: "Mixolydian Celtic Reel",
    modeId: "mixolydian",
    genreTag: "Celtic / Epic Fantasy",
    description: "Heroic highland melody incorporating the minor dominant v, beloved in Celtic fiddle reels and Lord of the Rings themes.",
    romanProgression: "I → v → ♭VII → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(5, "v", "minor"),
      fStep(7, "♭VII", "major"),
      fStep(1, "I", "major"),
    ]),
  },
  {
    id: "mixolydian-folk-norwegian",
    title: "Mixolydian 60s Folk (Norwegian Wood)",
    modeId: "mixolydian",
    genreTag: "60s Folk-Rock",
    description: "Acoustic modal storytelling made legendary by The Beatles, balancing bright major tonic with low subtonic warmth.",
    romanProgression: "I → ♭VII → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(7, "♭VII", "major"),
      fStep(1, "I", "major"),
    ]),
  },
  {
    id: "mixolydian-southern-rock-turn",
    title: "Mixolydian Southern Rock Turn",
    modeId: "mixolydian",
    genreTag: "Southern Rock",
    description: "Driving Tom Petty and Creedence Clearwater Revival progression cycling through subdominant and subtonic.",
    romanProgression: "I → IV → ♭VII → IV",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(4, "IV", "major"),
      fStep(7, "♭VII", "major"),
      fStep(4, "IV", "major"),
    ]),
  },

  // 6. Aeolian
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
  {
    id: "aeolian-andalusian-descent",
    title: "Natural Minor Stepwise Descent",
    modeId: "aeolian",
    genreTag: "Rock / Cinematic Folk",
    description: "Timeless driving minor progression heard across countless classic rock tracks and epic game soundtracks.",
    romanProgression: "i → ♭VII → ♭VI → ♭VII",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(7, "♭VII", "major"),
      fStep(6, "♭VI", "major"),
      fStep(7, "♭VII", "major"),
    ]),
  },
  {
    id: "aeolian-passacaglia",
    title: "Aeolian Passacaglia (Handel)",
    modeId: "aeolian",
    genreTag: "Baroque / Neoclassical",
    description: "Pure stepwise bassline descent down the natural minor tetrachord to the minor dominant v.",
    romanProgression: "i → ♭VII → ♭VI → v",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(7, "♭VII", "major"),
      fStep(6, "♭VI", "major"),
      fStep(5, "v", "minor"),
    ]),
  },
  {
    id: "aeolian-cinematic-ostinato",
    title: "Aeolian Cinematic Ostinato (Zimmer)",
    modeId: "aeolian",
    genreTag: "Cinematic Drama",
    description: "Hans Zimmer-style expansive dramatic arch building massive tension across the subdominant and flat submediant.",
    romanProgression: "i → ♭VI → iv → ♭VII",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(6, "♭VI", "major"),
      fStep(4, "iv", "minor"),
      fStep(7, "♭VII", "major"),
    ]),
  },
  {
    id: "aeolian-synthwave-drive",
    title: "Aeolian Synthwave Drive",
    modeId: "aeolian",
    genreTag: "Synthwave / Cyberpunk",
    description: "Pulsing arpeggiated 80s neon night drive progression linking dark minor tonic to bright parallel major.",
    romanProgression: "i → ♭III → ♭VII → iv",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(3, "♭III", "major"),
      fStep(7, "♭VII", "major"),
      fStep(4, "iv", "minor"),
    ]),
  },

  // 7. Locrian
  {
    id: "locrian-tension-cadence",
    title: "Locrian Tension Cadence",
    modeId: "locrian",
    genreTag: "Cinematic Horror / Dark Ambient",
    description: "Dark, eerie oscillation between the diminished tonic and the Neapolitan-like major ♭II chord.",
    romanProgression: "i° → ♭II → i°",
    steps: Object.freeze([
      fStep(1, "i°", "diminished"),
      fStep(2, "♭II", "major"),
      fStep(1, "i°", "diminished"),
    ]),
  },
  {
    id: "locrian-heavy-descent",
    title: "Locrian Heavy Tritone Descent",
    modeId: "locrian",
    genreTag: "Extreme Metal / Djent",
    description: "Brutal dissonance exploiting the characteristic ♭5 degree and harsh tritone relationships.",
    romanProgression: "i° → ♭V → ♭II → i°",
    steps: Object.freeze([
      fStep(1, "i°", "diminished"),
      fStep(5, "♭V", "major"),
      fStep(2, "♭II", "major"),
      fStep(1, "i°", "diminished"),
    ]),
  },
  {
    id: "locrian-creeping-shadow",
    title: "Locrian Creeping Shadow",
    modeId: "locrian",
    genreTag: "Psychological Thriller",
    description: "Unsettling slow harmonic crawl moving through the minor ♭iii and collapsing back onto the diminished tonic.",
    romanProgression: "i° → ♭iii → ♭II → i°",
    steps: Object.freeze([
      fStep(1, "i°", "diminished"),
      fStep(3, "♭iii", "minor"),
      fStep(2, "♭II", "major"),
      fStep(1, "i°", "diminished"),
    ]),
  },
  {
    id: "locrian-asymmetrical-groove",
    title: "Locrian Asymmetrical Groove",
    modeId: "locrian",
    genreTag: "Prog Metal / Avant-Garde",
    description: "Angular, jagged chord shifts favored in complex progressive metal and dark experimental jazz.",
    romanProgression: "i° → ♭VII → ♭V → ♭II",
    steps: Object.freeze([
      fStep(1, "i°", "diminished"),
      fStep(7, "♭vii", "minor"),
      fStep(5, "♭V", "major"),
      fStep(2, "♭II", "major"),
    ]),
  },

  // 8. Major Pentatonic
  {
    id: "major-pentatonic-country-road",
    title: "Country Folk Open Road",
    modeId: "major-pentatonic",
    genreTag: "Country / Folk",
    description: "Open, soulful country-folk progression emphasizing the singing 6th degree without harsh tritones.",
    romanProgression: "I → vi⁷ → V⁷ → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(5, "vi7", "minor", "minor7"),
      fStep(4, "V7", "dominant"),
      fStep(1, "I", "major"),
    ]),
  },
  {
    id: "major-pentatonic-soul-turnaround",
    title: "Soul Pentatonic Turnaround",
    modeId: "major-pentatonic",
    genreTag: "R&B / Soul",
    description: "Velvety circular turnaround moving through both characteristic modal chords (vi⁷ and ii⁷).",
    romanProgression: "Imaj⁷ → vi⁷ → ii⁷ → V⁷",
    steps: Object.freeze([
      fStep(1, "Imaj7", "major", "major7"),
      fStep(5, "vi7", "minor", "minor7"),
      fStep(2, "ii7", "minor", "minor7"),
      fStep(4, "V7", "dominant"),
    ]),
  },
  {
    id: "major-pentatonic-gospel-hymn",
    title: "Gospel & Pop Pentatonic Hymn",
    modeId: "major-pentatonic",
    genreTag: "Pop / Gospel",
    description: "Uplifting stepwise descending pentatonic harmony creating an open, spiritual atmosphere.",
    romanProgression: "I → vi⁷ → iii⁷ → V",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(5, "vi7", "minor", "minor7"),
      fStep(3, "iii7", "minor", "minor7"),
      fStep(4, "V", "dominant"),
    ]),
  },
  {
    id: "major-pentatonic-pastoral-drift",
    title: "Pure Pastoral Drift",
    modeId: "major-pentatonic",
    genreTag: "Acoustic Indie / Folk",
    description: "Gentle two-chord campfire drift highlighting the pure vocal resonance between major tonic and relative minor.",
    romanProgression: "I → vi⁷ → I → vi⁷",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(5, "vi7", "minor", "minor7"),
      fStep(1, "I", "major"),
      fStep(5, "vi7", "minor", "minor7"),
    ]),
  },
  {
    id: "major-pentatonic-appalachian-air",
    title: "Appalachian Mountain Air",
    modeId: "major-pentatonic",
    genreTag: "Bluegrass / Americana",
    description: "Brisk, cheerful acoustic bounce powered by the characteristic ii⁷ chord.",
    romanProgression: "I → ii⁷ → V → I",
    steps: Object.freeze([
      fStep(1, "I", "major"),
      fStep(2, "ii7", "minor", "minor7"),
      fStep(4, "V", "dominant"),
      fStep(1, "I", "major"),
    ]),
  },

  // 9. Minor Pentatonic
  {
    id: "minor-pentatonic-rock-riff",
    title: "Hard Rock Pentatonic Riff",
    modeId: "minor-pentatonic",
    genreTag: "Hard Rock / Classic Rock",
    description: "The ultimate rock guitar backbone: unyielding minor tonic powered by the punching subtonic ♭VII.",
    romanProgression: "i⁷ → ♭VII⁷ → iv⁷ → i⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(5, "♭VII7", "dominant"),
      fStep(3, "iv7", "minor", "minor7"),
      fStep(1, "i7", "minor", "minor7"),
    ]),
  },
  {
    id: "minor-pentatonic-blues-vamp",
    title: "Blues-Rock Pentatonic Groove",
    modeId: "minor-pentatonic",
    genreTag: "Blues-Rock / Grunge",
    description: "Driving minor vamp pivoting from subdominant iv to characteristic subtonic ♭VII and resolving hard on tonic.",
    romanProgression: "i⁷ → iv⁷ → ♭VII⁷ → i⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(3, "iv7", "minor", "minor7"),
      fStep(5, "♭VII7", "dominant"),
      fStep(1, "i7", "minor", "minor7"),
    ]),
  },
  {
    id: "minor-pentatonic-nordic-ballad",
    title: "Nordic Minor Pentatonic Ballad",
    modeId: "minor-pentatonic",
    genreTag: "Folk / Ambient",
    description: "Atmospheric folk descent linking the characteristic ♭VII to the resonant relative major ♭III.",
    romanProgression: "i⁷ → ♭VII⁷ → ♭IIImaj⁷ → iv⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(5, "♭VII7", "dominant"),
      fStep(2, "♭IIImaj7", "major", "major7"),
      fStep(3, "iv7", "minor", "minor7"),
    ]),
  },
  {
    id: "minor-pentatonic-funk-slap",
    title: "Funk-Rock Slap Groove",
    modeId: "minor-pentatonic",
    genreTag: "Funk-Rock / 90s Alternative",
    description: "In the vein of Red Hot Chili Peppers: tight rhythmic engine bouncing between tonic minor and subdominant.",
    romanProgression: "i⁷ → iv⁷ → i⁷ → ♭VII⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(3, "iv7", "minor", "minor7"),
      fStep(1, "i7", "minor", "minor7"),
      fStep(5, "♭VII7", "dominant"),
    ]),
  },
  {
    id: "minor-pentatonic-desert-drone",
    title: "Desert Stoner Rock Drone",
    modeId: "minor-pentatonic",
    genreTag: "Stoner Rock / Desert Rock",
    description: "Heavy, low-tuned power drone cycling endlessly with uncompromising attitude.",
    romanProgression: "i⁷ → ♭VII⁷ → i⁷",
    steps: Object.freeze([
      fStep(1, "i7", "minor", "minor7"),
      fStep(5, "♭VII7", "dominant"),
      fStep(1, "i7", "minor", "minor7"),
    ]),
  },

  // 10. Blues
  {
    id: "blues-quick-change",
    title: "12-Bar Blues Quick Change",
    modeId: "blues",
    genreTag: "Traditional Blues",
    description: "Fundamental 12-bar blues progression with dominant tonic and quick change to subdominant IV7.",
    romanProgression: "I⁷ → IV⁷ → I⁷ → V⁷ → IV⁷ → I⁷",
    steps: Object.freeze([
      fStep(1, "I7", "dominant"),
      fStep(3, "IV7", "dominant"),
      fStep(1, "I7", "dominant"),
      fStep(5, "V7", "dominant"),
      fStep(3, "IV7", "dominant"),
      fStep(1, "I7", "dominant"),
    ]),
  },
  {
    id: "blues-slow-turnaround",
    title: "Slow Blues 8-Bar Turnaround",
    modeId: "blues",
    genreTag: "Electric Blues",
    description: "Expressive slow blues progression incorporating the characteristic subtonic ♭VII⁷ turnaround.",
    romanProgression: "I⁷ → IV⁷ → I⁷ → V⁷ → ♭VII⁷ → I⁷",
    steps: Object.freeze([
      fStep(1, "I7", "dominant"),
      fStep(3, "IV7", "dominant"),
      fStep(1, "I7", "dominant"),
      fStep(5, "V7", "dominant"),
      fStep(6, "♭VII7", "dominant"),
      fStep(1, "I7", "dominant"),
    ]),
  },
  {
    id: "blues-texas-shuffle",
    title: "Texas Shuffle Groove (SRV)",
    modeId: "blues",
    genreTag: "Texas Blues / Shuffle",
    description: "Stevie Ray Vaughan-style driving shuffle pacing the three dominant cornerstones with electric fire.",
    romanProgression: "I⁷ → IV⁷ → I⁷ → V⁷",
    steps: Object.freeze([
      fStep(1, "I7", "dominant"),
      fStep(3, "IV7", "dominant"),
      fStep(1, "I7", "dominant"),
      fStep(5, "V7", "dominant"),
    ]),
  },
  {
    id: "blues-diminished-pass",
    title: "Blue Note Diminished Pass (B.B. King)",
    modeId: "blues",
    genreTag: "Chicago Blues / Jazz Blues",
    description: "Sophisticated passing diminished chord rooted on the ♭5 blue note resolving cleanly back to tonic.",
    romanProgression: "I⁷ → IV⁷ → ♭v°⁷ → I⁷",
    steps: Object.freeze([
      fStep(1, "I7", "dominant"),
      fStep(3, "IV7", "dominant"),
      fStep(4, "♭v°7", "diminished", "diminished7"),
      fStep(1, "I7", "dominant"),
    ]),
  },
  {
    id: "blues-delta-boogie",
    title: "Delta One-Chord Boogie",
    modeId: "blues",
    genreTag: "Delta Blues / Boogie",
    description: "John Lee Hooker-style hypnotic boogie locked into an unstoppable single-chord blues trance.",
    romanProgression: "I⁷ → I⁷ → IV⁷ → I⁷",
    steps: Object.freeze([
      fStep(1, "I7", "dominant"),
      fStep(1, "I7", "dominant"),
      fStep(3, "IV7", "dominant"),
      fStep(1, "I7", "dominant"),
    ]),
  },

  // 11. Harmonic Minor
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
  {
    id: "harmonic-minor-flamenco-descent",
    title: "Harmonic Minor Flamenco Descent",
    modeId: "harmonic-minor",
    genreTag: "Flamenco / Classical",
    description: "Dramatic Andalusian cadence crowned with the sharp tension of the harmonic minor major dominant V7.",
    romanProgression: "i → ♭VII → ♭VI → V⁷",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(7, "♭VII", "major"),
      fStep(6, "♭VI", "major"),
      fStep(5, "V7", "dominant"),
    ]),
  },
  {
    id: "harmonic-minor-tango-passion",
    title: "Tango Nuevo Passion (Piazzolla)",
    modeId: "harmonic-minor",
    genreTag: "Tango / Klezmer",
    description: "Sensual and brooding Argentine tango cadence leading from the diminished supertonic ii° into the dominant V⁷.",
    romanProgression: "i → ii° → V⁷ → i",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(2, "ii°", "diminished"),
      fStep(5, "V7", "dominant"),
      fStep(1, "i", "minor"),
    ]),
  },
  {
    id: "harmonic-minor-gothic-arch",
    title: "Gothic Cathedral Arch",
    modeId: "harmonic-minor",
    genreTag: "Gothic / Choral Epic",
    description: "Monumental sacred minor arch used in pipe organ fantasias, requiems, and dark cinematic climaxes.",
    romanProgression: "i → ♭VI → ii° → V⁷",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(6, "♭VI", "major"),
      fStep(2, "ii°", "diminished"),
      fStep(5, "V7", "dominant"),
    ]),
  },
  {
    id: "harmonic-minor-speed-engine",
    title: "Neoclassical Speed Engine (Malmsteen)",
    modeId: "harmonic-minor",
    genreTag: "Neoclassical Metal",
    description: "High-voltage oscillating two-chord engine propelling blistering harmonic minor sweeps and pedal arpeggios.",
    romanProgression: "i → V⁷ → i → V⁷",
    steps: Object.freeze([
      fStep(1, "i", "minor"),
      fStep(5, "V7", "dominant"),
      fStep(1, "i", "minor"),
      fStep(5, "V7", "dominant"),
    ]),
  },

  // 12. Melodic Minor (Jazz Minor)
  {
    id: "melodic-minor-jazz-tonic",
    title: "Jazz Minor Modal Cadence",
    modeId: "melodic-minor",
    genreTag: "Modern Jazz / Film Noir",
    description: "Sophisticated modern jazz cadence combining the minor third with the dominant IV⁷ and major 7th tonic.",
    romanProgression: "im(maj⁷) → IV⁷ → V⁷ → im(maj⁷)",
    steps: Object.freeze([
      fStep(1, "im(maj7)", "minor", "major7"),
      fStep(4, "IV7", "dominant"),
      fStep(5, "V7", "dominant"),
      fStep(1, "im(maj7)", "minor", "major7"),
    ]),
  },
  {
    id: "melodic-minor-fusion-turnaround",
    title: "Melodic Minor Fusion Turnaround",
    modeId: "melodic-minor",
    genreTag: "Jazz Fusion",
    description: "Sleek fusion turnaround utilizing the natural 6th and 7th degrees over a rich minor root.",
    romanProgression: "im(maj⁷) → ii⁷ → IV⁷ → im(maj⁷)",
    steps: Object.freeze([
      fStep(1, "im(maj7)", "minor", "major7"),
      fStep(2, "ii7", "minor", "minor7"),
      fStep(4, "IV7", "dominant"),
      fStep(1, "im(maj7)", "minor", "major7"),
    ]),
  },
  {
    id: "melodic-minor-bebop-resolution",
    title: "Bebop Minor Resolution (iiø-V-i)",
    modeId: "melodic-minor",
    genreTag: "Bebop / Hard Bop",
    description: "The quintessential modern jazz minor turnaround resolving cleanly into the bittersweet minor-major tonic.",
    romanProgression: "ii⁷ → V⁷ → im(maj⁷)",
    steps: Object.freeze([
      fStep(2, "ii7", "minor", "minor7"),
      fStep(5, "V7", "dominant"),
      fStep(1, "im(maj7)", "minor", "major7"),
    ]),
  },
  {
    id: "melodic-minor-lydian-dominant",
    title: "Lydian Dominant Pivot (George Russell)",
    modeId: "melodic-minor",
    genreTag: "Contemporary Jazz",
    description: "Acoustic overtone harmony where the dominant IV⁷ functions as a luminous color chord rather than a tension point.",
    romanProgression: "im(maj⁷) → IV⁷ → ♭IIImaj⁷ → im(maj⁷)",
    steps: Object.freeze([
      fStep(1, "im(maj7)", "minor", "major7"),
      fStep(4, "IV7", "dominant"),
      fStep(3, "♭IIImaj7", "major", "major7"),
      fStep(1, "im(maj7)", "minor", "major7"),
    ]),
  },
  {
    id: "melodic-minor-noir-mystery",
    title: "Noir Detective Mystery",
    modeId: "melodic-minor",
    genreTag: "Cinematic Noir / Spy",
    description: "Stealthy, rainy midnight atmosphere with the distinctive major 6th in IV⁷ illuminating the dark minor root.",
    romanProgression: "im(maj⁷) → IV⁷ → im(maj⁷)",
    steps: Object.freeze([
      fStep(1, "im(maj7)", "minor", "major7"),
      fStep(4, "IV7", "dominant"),
      fStep(1, "im(maj7)", "minor", "major7"),
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

  if (modeId === "major-pentatonic") {
    // Degrees: 1: I, 2: ii, 3: iii, 4: V, 5: vi (or 6: vi)
    const PENTATONIC_MAJOR_MAP = ["I", "ii", "iii", "V", "vi"] as const;
    const functionId =
      degree === 6 ? "vi" : PENTATONIC_MAJOR_MAP[(degree - 1) % PENTATONIC_MAJOR_MAP.length] ?? "I";
    return {
      parentTonic: normTonic,
      functionId,
      moduleId: "progressions",
    };
  }

  if (modeId === "minor-pentatonic") {
    // Relative major parent key (+3 semitones)
    const parentTonic = normalizePitchClass(normTonic + 3);
    const PENTATONIC_MINOR_MAP = ["vi", "I", "ii", "iii", "V"] as const;
    let functionId: string;
    if (degree === 7) functionId = "V";
    else if (degree === 6) functionId = "IV";
    else {
      functionId = PENTATONIC_MINOR_MAP[(degree - 1) % PENTATONIC_MINOR_MAP.length] ?? "vi";
    }
    return {
      parentTonic,
      functionId,
      moduleId: "progressions",
    };
  }

  if (modeId === "blues") {
    // Blues: 1 -> I, 2 -> bIII, 3 -> IV, 4 -> vii° (blue note passing diminished), 5 -> V, 6 -> bVII
    let functionId: string;
    if (degree === 1) functionId = "I";
    else if (degree === 2) functionId = "bIII";
    else if (degree === 3) functionId = "IV";
    else if (degree === 4) functionId = "vii°";
    else if (degree === 5) functionId = "V";
    else if (degree === 6) functionId = "bVII";
    else functionId = "I";

    return {
      parentTonic: normTonic,
      functionId,
      moduleId: "progressions",
    };
  }

  if (modeId === "harmonic-minor" || modeId === "melodic-minor") {
    // Relative major parent key (+3 semitones)
    const parentTonic = normalizePitchClass(normTonic + 3);
    const MINOR_SCALE_MAP = ["vi", "vii°", "I", "ii", "iii", "IV", "V"] as const;
    const functionId = MINOR_SCALE_MAP[(degree - 1) % 7] ?? "vi";
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

