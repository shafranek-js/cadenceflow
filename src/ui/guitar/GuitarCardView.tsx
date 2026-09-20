import type { ChordDefinition } from "../../domain/harmony/chord";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import {
  resolveGuitarChordVoicing,
  type GuitarChordVoicing,
} from "../../domain/instruments/guitar/voicings";
import { getInPositionScaleTones } from "../../domain/instruments/guitar/scaleTones";
import { GuitarFretboard } from "./GuitarFretboard";

export interface GuitarCardViewProps {
  readonly chord: ChordDefinition;
  readonly chordLabel: string;
  readonly scalePitchClasses?: readonly PitchClassIdentity[];
  readonly showScaleTones?: boolean;
  readonly orientation?: "vertical" | "horizontal";
}

export function GuitarCardView({
  chord,
  chordLabel,
  scalePitchClasses,
  showScaleTones = false,
  orientation = "vertical",
}: GuitarCardViewProps) {
  const isSeventh = chord.baseQuality === "dominant" || chord.variant?.seventh !== undefined;
  const isMajor7 = chord.variant?.seventh === "major7";

  const voicing: GuitarChordVoicing = resolveGuitarChordVoicing({
    rootPitchClass: chord.rootPitchClass,
    baseQuality: chord.baseQuality,
    spelling: chord.spelling,
    ...(chord.bassPitchClass !== undefined ? { bassPitchClass: chord.bassPitchClass } : {}),
    isSeventh,
    isMajor7,
  });

  const scaleTones =
    showScaleTones && scalePitchClasses && scalePitchClasses.length > 0
      ? getInPositionScaleTones(voicing, scalePitchClasses)
      : [];

  const fretStringSummary = voicing.frets.map((f) => (f === -1 ? "x" : String(f))).join(" ");

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={`mini-guitar-card-visual ${isHorizontal ? "is-horizontal" : "is-vertical"}`}
      data-testid="mini-guitar-card-visual"
      data-chord-symbol={chordLabel}
      data-base-fret={voicing.baseFret}
      data-frets={fretStringSummary}
      data-orientation={orientation}
    >
      <div className="mini-guitar-heading">
        <strong className="mini-guitar-chord-name">{chordLabel}</strong>
        <span className="mini-guitar-position" aria-label={`Position fret ${voicing.baseFret}`}>
          {voicing.baseFret === 1 ? "Open" : `Fret ${voicing.baseFret}`}
        </span>
      </div>

      <div className="mini-guitar-fretboard-wrap">
        <GuitarFretboard
          voicing={voicing}
          scaleTones={scaleTones}
          showScaleTones={showScaleTones}
          showFingerings={true}
          orientation={orientation}
          width={isHorizontal ? 172 : 124}
          height={isHorizontal ? 116 : 142}
        />
      </div>
    </div>
  );
}
