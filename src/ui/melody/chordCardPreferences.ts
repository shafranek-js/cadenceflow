export interface ChordCardVisibility {
  readonly piano: boolean;
  readonly guitar: boolean;
}
const STORAGE_KEY = "cadenceflow.pianoRollChordCards";
export function readChordCardVisibility(): ChordCardVisibility {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return { piano: value?.piano === true, guitar: value?.guitar === true };
  } catch {
    return { piano: false, guitar: false };
  }
}
export function saveChordCardVisibility(value: ChordCardVisibility): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Optional storage. */
  }
}
