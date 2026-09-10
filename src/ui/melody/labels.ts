import type { MelodyGrid, MelodyInstrument, MelodyPattern } from "../../domain/melody/types";

export const MELODY_INSTRUMENT_LABELS: Readonly<Record<MelodyInstrument, string>> = Object.freeze({
  flute: "Flute",
  violin: "Violin",
  clarinet: "Clarinet",
  oboe: "Oboe",
  cello: "Cello",
  "synth-lead": "Synth Lead",
});

export const MELODY_PATTERN_LABELS: Readonly<Record<MelodyPattern, string>> = Object.freeze({
  up: "Up",
  down: "Down",
  "up-down": "Up then down",
  "down-up": "Down then up",
  "outside-in": "Outside in",
  "inside-out": "Inside out",
});

export const MELODY_GRID_LABELS: Readonly<Record<MelodyGrid, string>> = Object.freeze({
  quarter: "Quarter note (1 beat)",
  eighth: "Eighth note (1/2 beat)",
  sixteenth: "Sixteenth note (1/4 beat)",
  "eighth-triplet": "Eighth-note triplet (1/3 beat)",
  "sixteenth-triplet": "Sixteenth-note triplet (1/6 beat)",
});

export function melodyInstrumentLabel(instrument: MelodyInstrument): string {
  return MELODY_INSTRUMENT_LABELS[instrument];
}
