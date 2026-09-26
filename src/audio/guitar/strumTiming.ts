/** Total onset spread from the first to the last string in a guitar chord. */
export const GUITAR_STRUM_SPREAD_SECONDS = 0.03;

/** Return a string's onset offset while keeping the complete chord spread bounded. */
export function guitarStrumOffsetSeconds(
  stringIndex: number,
  stringCount: number,
  totalSpreadSeconds = GUITAR_STRUM_SPREAD_SECONDS,
): number {
  if (stringCount <= 1) return 0;
  const boundedIndex = Math.max(0, Math.min(stringIndex, stringCount - 1));
  return (boundedIndex / (stringCount - 1)) * Math.max(0, totalSpreadSeconds);
}
