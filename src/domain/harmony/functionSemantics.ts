/**
 * Harmonic Function Semantics and Style Guidance.
 *
 * Implements the theoretical classifications, emotional descriptors, style associations,
 * and movement rules from the CadenceFlow harmonic reference.
 */

export interface HarmonicFunctionSemantics {
  readonly functionId: string;
  readonly title: string;
  readonly description: string;
  readonly emotionalColor: string;
  readonly styleHints: readonly string[];
  readonly rule: string;
  readonly tendencyType:
    | "dominant-resolution"
    | "free-combinatorial"
    | "modal-color"
    | "diminished-tension";
}

const FUNCTION_SEMANTICS: Readonly<Record<string, HarmonicFunctionSemantics>> = Object.freeze({
  // --- Progressions Secondary Dominants (Row 0) ---
  V7: Object.freeze({
    functionId: "V7",
    title: "Первичный доминантсептаккорд к тонике I",
    description: "Создает максимальное доминантовое напряжение, требующее прямого разрешения в тонику I.",
    emotionalColor: "Напряжённое ожидание опоры (Expectant pull)",
    styleHints: Object.freeze(["Blues", "Jazz", "Classical", "Pop Standard"]),
    rule: "Don't Mix (⊘): Разрешается строго вниз в тонику I",
    tendencyType: "dominant-resolution",
  }),
  "V7/vi": Object.freeze({
    functionId: "V7/vi",
    title: "Вторичная доминанта к параллельному минору vi",
    description: "Подготавливает параллельный минор vi, создавая мягкий романтический или ностальгический переход.",
    emotionalColor: "Теплота, ностальгия, лирика (Warm nostalgia)",
    styleHints: Object.freeze(["Pop Ballad", "Neo-Soul", "R&B", "Classical"]),
    rule: "Don't Mix (⊘): Разрешается строго вниз в vi",
    tendencyType: "dominant-resolution",
  }),
  "V7/IV": Object.freeze({
    functionId: "V7/IV",
    title: "Вторичная доминанта к субдоминанте IV",
    description: "Тонизирует субдоминанту IV через мажорный септаккорд на 1-й ступени (I7), создавая яркий гармонический подъём.",
    emotionalColor: "Яркий подъём, предвкушение кульминации (Bright lift)",
    styleHints: Object.freeze(["Gospel", "Blues", "Soul", "Classic Rock"]),
    rule: "Don't Mix (⊘): Разрешается строго вниз в IV",
    tendencyType: "dominant-resolution",
  }),
  "V7/ii": Object.freeze({
    functionId: "V7/ii",
    title: "Вторичная доминанта ко второй ступени ii",
    description: "Мажорный аккорд на 6-й ступени (VI7) с хроматическим движением в субдоминантовую пре-доминанту ii.",
    emotionalColor: "Элегантный джазовый разворот (Sophisticated turnaround)",
    styleHints: Object.freeze(["Jazz Standard", "Bossa Nova", "Lo-Fi", "Neo-Soul"]),
    rule: "Don't Mix (⊘): Разрешается строго вниз в ii",
    tendencyType: "dominant-resolution",
  }),
  "V7/V": Object.freeze({
    functionId: "V7/V",
    title: "Двойная доминанта (доминанта к V)",
    description: "Мажорный аккорд на 2-й ступени (II7), создающий мощный хроматический импульс в доминанту V.",
    emotionalColor: "Энергичный разгон, решительность (Energetic drive)",
    styleHints: Object.freeze(["Rock", "Classical", "Pop", "Country"]),
    rule: "Don't Mix (⊘): Разрешается строго вниз в V",
    tendencyType: "dominant-resolution",
  }),
  "V7/iii": Object.freeze({
    functionId: "V7/iii",
    title: "Вторичная доминанта к третьей ступени iii",
    description: "Подготавливает минорную медианту iii, обостряя гармонический драматизм и ладовое напряжение.",
    emotionalColor: "Драматический мистицизм (Dramatic tension)",
    styleHints: Object.freeze(["Cinematic", "Progressive Rock", "Neo-Soul"]),
    rule: "Don't Mix (⊘): Разрешается строго вниз в iii",
    tendencyType: "dominant-resolution",
  }),

  // --- Diatonic Core (Row 1) ---
  I: Object.freeze({
    functionId: "I",
    title: "Главная тоническая опора мажора",
    description: "Центральный узел стабильности и покоя, окончательный пункт назначения всех тяготений.",
    emotionalColor: "Полная стабильность и покой (Tonic resolution)",
    styleHints: Object.freeze(["All Genres", "Pop", "Classical", "Acoustic"]),
    rule: "Mix Chords (∞): Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  }),
  vi: Object.freeze({
    functionId: "vi",
    title: "Параллельный минор тоники",
    description: "Мягкий минорный центр, идеально подходящий для куплетов и элегических контрастов.",
    emotionalColor: "Меланхоличная глубина (Elegiac warmth)",
    styleHints: Object.freeze(["Pop", "Indie Rock", "Folk", "Ballad"]),
    rule: "Mix Chords (∞): Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  }),
  IV: Object.freeze({
    functionId: "IV",
    title: "Субдоминанта (гармонический подъём)",
    description: "Создает ощущение движения вперед, раскрытия пространства и эмоционального подъема.",
    emotionalColor: "Светлый оптимизм, полёт (Uplifting breath)",
    styleHints: Object.freeze(["Pop Rock", "Anthem", "Country", "Worship"]),
    rule: "Mix Chords (∞): Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  }),
  ii: Object.freeze({
    functionId: "ii",
    title: "Параллельный минор субдоминанты",
    description: "Классическая пре-доминанта, формирующая безупречную связку ii–V–I.",
    emotionalColor: "Мягкое подготовительное движение (Gentle motion)",
    styleHints: Object.freeze(["Jazz", "Lo-Fi", "Neo-Soul", "Pop"]),
    rule: "Mix Chords (∞): Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  }),
  V: Object.freeze({
    functionId: "V",
    title: "Доминанта (тяготение в тонику)",
    description: "Квинтэссенция функционального тяготения, максимально стремящаяся разрешиться в тонику I.",
    emotionalColor: "Энергичное ожидание разрешения (Culmination)",
    styleHints: Object.freeze(["All Genres", "Classical", "Rock", "Pop"]),
    rule: "Mix Chords (∞): Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  }),
  iii: Object.freeze({
    functionId: "iii",
    title: "Параллельный минор доминанты",
    description: "Мягкая минорная ступень, часто используемая в шагах баса вниз (I – iii – IV).",
    emotionalColor: "Задумчивая созерцательность (Contemplative calm)",
    styleHints: Object.freeze(["Indie Folk", "Cinematic", "Dream Pop"]),
    rule: "Mix Chords (∞): Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  }),
  "vii°": Object.freeze({
    functionId: "vii°",
    title: "Вводное уменьшенное трезвучие",
    description: "Неустойчивое уменьшенное трезвучие на 7-й ступени, остро тяготеющее в тонику I.",
    emotionalColor: "Острое вводное напряжение (Unstable pull)",
    styleHints: Object.freeze(["Classical", "Baroque"]),
    rule: "Don't Mix (⊘): Разрешается в I",
    tendencyType: "diminished-tension",
  }),

  // --- Modal Interchange (Row 2) ---
  bIII: Object.freeze({
    functionId: "bIII",
    title: "Низкая терция (заимствование из параллельного минора)",
    description: "Эпический мажорный аккорд параллельного минора, создающий мощный эмоциональный взлёт.",
    emotionalColor: "Эпический подъём, героизм (Epic lift)",
    styleHints: Object.freeze(["Cinematic", "Alternative Rock", "Post-Rock", "Epic Pop"]),
    rule: "Modal Color (≈): Вход из I, IV, V; выход обратно в I, IV, V",
    tendencyType: "modal-color",
  }),
  bVI: Object.freeze({
    functionId: "bVI",
    title: "Низкая секста (заимствование из параллельного минора)",
    description: "Драматический аккорд параллельного минора, создающий мощный хроматический контраст перед V или I.",
    emotionalColor: "Драматическая глубина, тайна (Dramatic grandeur)",
    styleHints: Object.freeze(["Cinematic", "Film Score", "Neo-Soul", "Dark Pop", "Synthwave"]),
    rule: "Modal Color (≈): Вход из I, IV, V; выход обратно в I, IV, V",
    tendencyType: "modal-color",
  }),
  iv: Object.freeze({
    functionId: "iv",
    title: "Минорная субдоминанта (ностальгический окрас)",
    description: "Золотой стандарт романтической меланхолии и разрешения в тонику (цепочка IV – iv – I).",
    emotionalColor: "Ностальгия, щемящая грусть (Bitter-sweet nostalgia)",
    styleHints: Object.freeze(["Beatles-style", "Lo-Fi Hip-Hop", "Indie Pop", "Ballad", "Gospel"]),
    rule: "Modal Color (≈): Вход из I, IV, V; выход обратно в I, IV, V",
    tendencyType: "modal-color",
  }),
  bVII: Object.freeze({
    functionId: "bVII",
    title: "Миксолидийская септима (Backdoor Dominant)",
    description: "Символ классического рока и миксолидийской энергии; разрешается в IV или I.",
    emotionalColor: "Драйв, независимость, полёт (Rock energy)",
    styleHints: Object.freeze(["Classic Rock", "Grunge", "Synthwave", "Power Pop"]),
    rule: "Modal Color (≈): Вход из I, IV, V; выход обратно в I, IV, V",
    tendencyType: "modal-color",
  }),

  // --- Dark Harmony Specials ---
  N6: Object.freeze({
    functionId: "N6",
    title: "Неаполитанский секстаккорд (♭II с басом на 4 ступени)",
    description: "Хроматическая субдоминанта в первом обращении (B♭/D в Am), мягко ведущая бас в доминанту V.",
    emotionalColor: "Трагическое величие (Tragic elegance)",
    styleHints: Object.freeze(["Classical", "Cinematic", "Gothic", "Metal"]),
    rule: "Don't Mix (⊘): Разрешается в V",
    tendencyType: "diminished-tension",
  }),
  i: Object.freeze({
    functionId: "i",
    title: "Тонический минорный центр",
    description: "Главная устойчивая опора минорной тональности.",
    emotionalColor: "Тёмная глубина и устойчивость (Dark stability)",
    styleHints: Object.freeze(["All Minor Genres", "Synthwave", "Metal", "Classical"]),
    rule: "Mix Chords (∞): Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  }),
});

/**
 * Fallback semantics generator for secondary diminished or unusual extensions.
 */
function createFallbackSemantics(functionId: string): HarmonicFunctionSemantics {
  const dimMatch = functionId.match(/^(?:vii°7|vii°|viio7|viio)\/(.+)$/);
  if (dimMatch && dimMatch[1]) {
    const target = dimMatch[1];
    return {
      functionId,
      title: `Вводный уменьшенный септаккорд к ${target}`,
      description: `Симметричный уменьшенный вводный септаккорд, тонизирующий целевую ступень ${target}.`,
      emotionalColor: "Острое драматическое тяготение (High drama)",
      styleHints: ["Romantic Classical", "Film Noir", "Progressive Metal"],
      rule: `Don't Mix (⊘): Разрешается строго в ${target}`,
      tendencyType: "diminished-tension",
    };
  }

  return {
    functionId,
    title: `Гармоническая функция ${functionId}`,
    description: "Гармонический узел системы CadenceFlow.",
    emotionalColor: "Гармонический оттенок (Harmonic color)",
    styleHints: ["Eclectic", "Modern"],
    rule: "Свободная гармоническая комбинаторика",
    tendencyType: "free-combinatorial",
  };
}

/**
 * Returns comprehensive semantic and style metadata for any harmonic function ID.
 */
export function getFunctionSemantics(functionId: string): HarmonicFunctionSemantics {
  const normalized = functionId === "V7/I" ? "V7" : functionId;
  return FUNCTION_SEMANTICS[normalized] ?? createFallbackSemantics(functionId);
}

export type GenreFocusId =
  | "all"
  | "neo-soul"
  | "jazz"
  | "gospel"
  | "pop-ballad"
  | "cinematic"
  | "rock";

export interface GenreFocusOption {
  readonly id: GenreFocusId;
  readonly label: string;
  readonly tags: readonly string[];
  readonly description: string;
}

export const GENRE_FOCUS_OPTIONS: readonly GenreFocusOption[] = Object.freeze([
  {
    id: "all",
    label: "All Styles",
    tags: Object.freeze([]),
    description: "Full harmonic matrix without genre filtering",
  },
  {
    id: "neo-soul",
    label: "Neo-Soul",
    tags: Object.freeze(["Neo-Soul", "R&B", "Soul", "Lo-Fi", "Bossa Nova"]),
    description: "Rich extensions, secondary dominants (V7/ii, V7/vi), and warm minor substitutions",
  },
  {
    id: "jazz",
    label: "Jazz",
    tags: Object.freeze(["Jazz", "Jazz Standard", "Bossa Nova", "Lo-Fi"]),
    description: "Dominant turnarounds (ii-V-I), secondary dominants, and chromatic tension",
  },
  {
    id: "gospel",
    label: "Gospel",
    tags: Object.freeze(["Gospel", "Soul", "Blues"]),
    description: "Bright subdominant lifts (V7/IV -> IV), minor plagal (iv -> I), and blues drive",
  },
  {
    id: "pop-ballad",
    label: "Pop / Ballad",
    tags: Object.freeze(["Pop", "Pop Ballad", "Pop Standard", "Country", "Folk"]),
    description: "Emotional diatonic cores (I-V-vi-IV), warm deceptive resolutions, and acoustic balance",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    tags: Object.freeze(["Cinematic", "Film Noir", "Romantic Classical", "Epic Pop", "Classical"]),
    description: "Epic modal interchange (bIII, bVI), Neapolitan color (N6), and diminished drama",
  },
  {
    id: "rock",
    label: "Rock",
    tags: Object.freeze(["Rock", "Classic Rock", "Alternative Rock", "Metal", "Post-Rock", "Synthwave"]),
    description: "Powerful borrowed modal chords (bVII, bVI, bIII), double dominant (V7/V), and minor roots",
  },
]);

/**
 * Checks whether a given harmonic function aligns with a selected musical style focus.
 */
export function isFunctionRelevantToGenre(functionId: string, genre: GenreFocusId): boolean {
  if (genre === "all") return true;
  const option = GENRE_FOCUS_OPTIONS.find((opt) => opt.id === genre);
  if (!option || option.tags.length === 0) return true;

  const semantics = getFunctionSemantics(functionId);
  return semantics.styleHints.some((hint) => {
    const lowerHint = hint.toLowerCase();
    return option.tags.some((tag) => {
      const lowerTag = tag.toLowerCase();
      return lowerHint.includes(lowerTag) || lowerTag.includes(lowerHint);
    });
  });
}
