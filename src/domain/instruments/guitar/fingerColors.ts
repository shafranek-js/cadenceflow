export type GuitarFingerNumber = 1 | 2 | 3 | 4;

export const GUITAR_FINGER_COLORS: Readonly<Record<GuitarFingerNumber, string>> = Object.freeze({
  1: "#f7aa06",
  2: "#c920ff",
  3: "#00affe",
  4: "#f56e50",
});

export const GUITAR_FINGER_NAMES: Readonly<Record<GuitarFingerNumber, { ru: string; en: string }>> =
  Object.freeze({
    1: { ru: "Указательный", en: "Index" },
    2: { ru: "Средний", en: "Middle" },
    3: { ru: "Безымянный", en: "Ring" },
    4: { ru: "Мизинец", en: "Pinky" },
  });

export function isGuitarFingerNumber(value: number | undefined): value is GuitarFingerNumber {
  return value === 1 || value === 2 || value === 3 || value === 4;
}
