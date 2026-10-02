import type { PianoRollColorMode } from "./PianoRollView";

export interface PianoRollPreferences {
  readonly gridMode: "degrees" | "chromatic";
  readonly paletteMode: "degrees" | "chromatic";
  readonly prospectiveDuration: "4/1" | "2/1" | "1/1" | "1/2" | "1/4";
  readonly prospectiveTriplet: boolean;
  readonly colorMode: PianoRollColorMode;
  readonly guidesEnabled: boolean;
  readonly zoom: number;
  readonly snap: string;
  readonly pitchRange: number;
}

export const DEFAULT_PIANO_ROLL_PREFERENCES: PianoRollPreferences = {
  gridMode: "degrees",
  paletteMode: "degrees",
  prospectiveDuration: "1/2",
  prospectiveTriplet: false,
  colorMode: "hookpad",
  guidesEnabled: false,
  zoom: 100,
  snap: "1/8",
  pitchRange: 0,
};

const STORAGE_KEY = "cadenceflow.pianoRollPreferences";
const COLOR_MODES: readonly PianoRollColorMode[] = [
  "hookpad",
  "project",
  "standard",
  "suzuki",
  "harmonic-role",
];
const SNAPS = [
  "1/1",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/1 triplet",
  "1/2 triplet",
  "1/4 triplet",
  "1/8 triplet",
  "1/16 triplet",
] as const;

export function validatePianoRollPreferences(value: unknown): PianoRollPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PIANO_ROLL_PREFERENCES;
  }
  const candidate = value as Record<string, unknown>;
  const { zoom, pitchRange } = candidate;
  return {
    gridMode: candidate.gridMode === "chromatic" ? "chromatic" : "degrees",
    paletteMode: candidate.paletteMode === "chromatic" ? "chromatic" : "degrees",
    prospectiveDuration: ["4/1", "2/1", "1/1", "1/2", "1/4"].includes(
      candidate.prospectiveDuration as string,
    )
      ? (candidate.prospectiveDuration as PianoRollPreferences["prospectiveDuration"])
      : DEFAULT_PIANO_ROLL_PREFERENCES.prospectiveDuration,
    prospectiveTriplet:
      typeof candidate.prospectiveTriplet === "boolean"
        ? candidate.prospectiveTriplet
        : DEFAULT_PIANO_ROLL_PREFERENCES.prospectiveTriplet,
    colorMode: COLOR_MODES.includes(candidate.colorMode as PianoRollColorMode)
      ? (candidate.colorMode as PianoRollColorMode)
      : DEFAULT_PIANO_ROLL_PREFERENCES.colorMode,
    guidesEnabled:
      typeof candidate.guidesEnabled === "boolean"
        ? candidate.guidesEnabled
        : DEFAULT_PIANO_ROLL_PREFERENCES.guidesEnabled,
    zoom:
      typeof zoom === "number" &&
      Number.isFinite(zoom) &&
      zoom >= 70 &&
      zoom <= 180 &&
      zoom % 10 === 0
        ? zoom
        : DEFAULT_PIANO_ROLL_PREFERENCES.zoom,
    snap: SNAPS.includes(candidate.snap as (typeof SNAPS)[number])
      ? (candidate.snap as string)
      : DEFAULT_PIANO_ROLL_PREFERENCES.snap,
    pitchRange:
      typeof pitchRange === "number" &&
      Number.isInteger(pitchRange) &&
      pitchRange >= 0 &&
      pitchRange <= 2
        ? pitchRange
        : DEFAULT_PIANO_ROLL_PREFERENCES.pitchRange,
  };
}

export function readPianoRollPreferences(): PianoRollPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? validatePianoRollPreferences(JSON.parse(raw)) : DEFAULT_PIANO_ROLL_PREFERENCES;
  } catch {
    return DEFAULT_PIANO_ROLL_PREFERENCES;
  }
}

export function writePianoRollPreferences(value: PianoRollPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validatePianoRollPreferences(value)));
  } catch {
    // Browser storage is optional; keep current session controls usable.
  }
}
