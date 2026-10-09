import type { MelodyPitchMotion } from "../../domain/melody/types";

/**
 * Melody contour catalogue, shared by the score-system and progression context menus.
 *
 * Lives in its own module rather than beside `ScoreSystemContextMenu`: a component module that
 * also exports data breaks React Fast Refresh (`react-refresh/only-export-components`), because
 * editing the module cannot be a component-only update.
 */

export interface MelodyContourItem {
  readonly id: MelodyPitchMotion;
  readonly label: string;
}

export interface MelodyContourGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly MelodyContourItem[];
}

export const MELODY_CONTOUR_GROUPS: readonly MelodyContourGroup[] = [
  {
    id: "directional",
    label: "Directional",
    items: [
      { id: "up", label: "Ascending (Up)" },
      { id: "down", label: "Descending (Down)" },
      { id: "up-down", label: "Up & Down" },
      { id: "down-up", label: "Down & Up" },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    items: [
      { id: "outside-in", label: "Outside In" },
      { id: "inside-out", label: "Inside Out" },
    ],
  },
  {
    id: "pedal-and-alternating",
    label: "Pedal & Alternating",
    items: [
      { id: "repeat-root", label: "Repeat Root" },
      { id: "repeat-top", label: "Repeat Top" },
      { id: "alternate-root-up", label: "Alternate Root / Up" },
      { id: "alternate-top-down", label: "Alternate Top / Down" },
    ],
  },
];
