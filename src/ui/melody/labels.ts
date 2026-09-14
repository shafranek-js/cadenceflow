import type {
  MelodyConnection,
  MelodyGrid,
  MelodyPitchMotion,
  MelodyRhythm,
  MelodyPattern,
} from "../../domain/melody/types";
import {
  MELODY_INSTRUMENT_CATALOG,
  type MelodyInstrumentId,
} from "../../domain/melody/instrumentCatalog";

export const MELODY_INSTRUMENT_LABELS: Readonly<Record<MelodyInstrumentId, string>> = Object.freeze(
  Object.fromEntries(MELODY_INSTRUMENT_CATALOG.map((entry) => [entry.id, entry.label])) as Record<
    MelodyInstrumentId,
    string
  >,
);

export const MELODY_PATTERN_LABELS: Readonly<Record<MelodyPattern, string>> = Object.freeze({
  up: "Up",
  down: "Down",
  "up-down": "Up then down",
  "down-up": "Down then up",
  "outside-in": "Outside in",
  "inside-out": "Inside out",
});

export const MELODY_PITCH_MOTION_LABELS: Readonly<Record<MelodyPitchMotion, string>> =
  Object.freeze({
    ...MELODY_PATTERN_LABELS,
    "repeat-root": "Repeat root",
    "repeat-top": "Repeat top",
    "alternate-root-up": "Alternate root / up",
    "alternate-top-down": "Alternate top / down",
  });

export type MelodyPitchMotionGalleryGroupId = "directional" | "shapes" | "pedal-and-alternating";

export interface MelodyPitchMotionGalleryGroup {
  readonly id: MelodyPitchMotionGalleryGroupId;
  readonly label: string;
  readonly motions: readonly MelodyPitchMotion[];
}

/** Stable UI grouping for the canonical motion vocabulary; not persisted. */
export const MELODY_PITCH_MOTION_GALLERY_GROUPS: readonly MelodyPitchMotionGalleryGroup[] =
  Object.freeze([
    Object.freeze({
      id: "directional",
      label: "Directional",
      motions: Object.freeze(["up", "down", "up-down", "down-up"] as const),
    }),
    Object.freeze({
      id: "shapes",
      label: "Shapes",
      motions: Object.freeze(["outside-in", "inside-out"] as const),
    }),
    Object.freeze({
      id: "pedal-and-alternating",
      label: "Pedal & Alternating",
      motions: Object.freeze([
        "repeat-root",
        "repeat-top",
        "alternate-root-up",
        "alternate-top-down",
      ] as const),
    }),
  ]);

export const MELODY_RHYTHM_LABELS: Readonly<Record<MelodyRhythm, string>> = Object.freeze({
  even: "Even",
  dotted: "Dotted",
  "reverse-dotted": "Reverse dotted",
  tresillo: "Tresillo",
});

export const MELODY_CONNECTION_LABELS: Readonly<Record<MelodyConnection, string>> = Object.freeze({
  retrigger: "Retrigger",
  "tie-repeated": "Tie repeated pitches",
});

export const MELODY_GRID_LABELS: Readonly<Record<MelodyGrid, string>> = Object.freeze({
  quarter: "Quarter note (1 beat)",
  eighth: "Eighth note (1/2 beat)",
  sixteenth: "Sixteenth note (1/4 beat)",
  "eighth-triplet": "Eighth-note triplet (1/3 beat)",
  "sixteenth-triplet": "Sixteenth-note triplet (1/6 beat)",
});

export function melodyInstrumentLabel(instrument: MelodyInstrumentId): string {
  return MELODY_INSTRUMENT_LABELS[instrument] ?? instrument;
}
