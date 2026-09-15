import type { ChordDefinition } from "../../domain/harmony/chord";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import { resolveGuitarChordVoicing, type GuitarChordVoicing } from "../../domain/instruments/guitar/voicings";
import { getInPositionScaleTones } from "../../domain/instruments/guitar/scaleTones";
import { GuitarFretboard } from "./GuitarFretboard";

export interface GuitarCardViewProps {
  readonly chord: ChordDefinition;
  readonly chordLabel: string;
  readonly scalePitchClasses?: readonly PitchClassIdentity[];
  readonly showScaleTones?: boolean;
}

export function GuitarCardView({
  chord,
  chordLabel,
  scalePitchClasses,
  showScaleTones = false,
}: GuitarCardViewProps) {
  const isSeventh =
    chord.baseQuality === "dominant" || chord.variant?.seventh !== undefined;
  const isMajor7 = chord.variant?.seventh === "major7";

  const voicing: GuitarChordVoicing = resolveGuitarChordVoicing({
    rootPitchClass: chord.rootPitchClass,
    baseQuality: chord.baseQuality,
    spelling: chord.spelling,
    isSeventh,
    isMajor7,
  });

  const scaleTones =
    showScaleTones && scalePitchClasses && scalePitchClasses.length > 0
      ? getInPositionScaleTones(voicing, scalePitchClasses)
      : [];

  const fretStringSummary = voicing.frets
    .map((f) => (f === -1 ? "x" : String(f)))
    .join(" ");

  return (
    <div
      className="mini-guitar-card-visual"
      data-testid="mini-guitar-card-visual"
      data-chord-symbol={chordLabel}
      data-base-fret={voicing.baseFret}
      data-frets={fretStringSummary}
    >
      <div className="mini-guitar-heading">
        <strong className="mini-guitar-chord-name">{chordLabel}</strong>
        <span
          className="mini-guitar-position"
          aria-label={`Position fret ${voicing.baseFret}`}
        >
          {voicing.baseFret === 1 ? "Open" : `Fret ${voicing.baseFret}`}
        </span>
      </div>

      <div className="mini-guitar-fretboard-wrap">
        <GuitarFretboard
          voicing={voicing}
          scaleTones={scaleTones}
          showScaleTones={showScaleTones}
          showFingerings={true}
          width={104}
          height={118}
        />
      </div>

      <div className="mini-guitar-frets-tab" aria-hidden="true">
        <span>{fretStringSummary}</span>
      </div>
    </div>
  );
}
