import type { CSSProperties } from "react";
import type { ChordDefinition } from "../../domain/harmony/chord";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import {
  resolveGuitarChordVoicing,
  type GuitarChordVoicing,
} from "../../domain/instruments/guitar/voicings";
import { getInPositionScaleTones } from "../../domain/instruments/guitar/scaleTones";
import { GuitarFretboard } from "./GuitarFretboard";
import type { LabelHierarchyMode } from "../progression/labelHierarchy";
import { ProgressionChordLabel } from "../progression/ProgressionChordLabel";
import type { GuitarChordColorMode } from "../../domain/project/project";
import {
  GUITAR_FINGER_COLORS,
  GUITAR_FINGER_NAMES,
  type GuitarFingerNumber,
} from "../../domain/instruments/guitar/fingerColors";

export interface GuitarCardViewProps {
  readonly chord: ChordDefinition;
  readonly chordLabel: string;
  readonly labelMode?: LabelHierarchyMode;
  readonly functionLabel?: string;
  readonly scalePitchClasses?: readonly PitchClassIdentity[];
  readonly showScaleTones?: boolean;
  readonly orientation?: "vertical" | "horizontal";
  readonly colorMode?: GuitarChordColorMode;
}

export function GuitarCardView({
  chord,
  chordLabel,
  labelMode,
  functionLabel,
  scalePitchClasses,
  showScaleTones = false,
  orientation = "vertical",
  colorMode = "chord-roles",
}: GuitarCardViewProps) {
  const voicing: GuitarChordVoicing = resolveGuitarChordVoicing(chord);

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
      data-color-mode={colorMode}
    >
      <div className="mini-guitar-heading">
        {labelMode && functionLabel ? (
          <ProgressionChordLabel
            mode={labelMode}
            functionLabel={functionLabel}
            chordLabel={chordLabel}
            className="mini-guitar-chord-name"
          />
        ) : (
          <strong className="mini-guitar-chord-name">{chordLabel}</strong>
        )}
        {voicing.unsupportedReason ? (
          <span className="mini-guitar-position">No matching fingering</span>
        ) : (
          <span className="mini-guitar-position" aria-label={`Position fret ${voicing.baseFret}`}>
            {voicing.baseFret === 1 ? "Open" : `Fret ${voicing.baseFret}`}
          </span>
        )}
      </div>

      {voicing.unsupportedReason ? (
        <p role="status" className="guitar-no-matching-fingering">
          {voicing.unsupportedReason}
        </p>
      ) : (
        <>
          <div className="mini-guitar-fretboard-wrap">
            <GuitarFretboard
              voicing={voicing}
              scaleTones={scaleTones}
              showScaleTones={showScaleTones}
              showFingerings={true}
              orientation={orientation}
              colorMode={colorMode}
              width={isHorizontal ? 172 : 124}
              height={isHorizontal ? 116 : 142}
            />
          </div>
          {colorMode === "fingering" ? <GuitarFingeringLegend /> : null}
        </>
      )}
    </div>
  );
}

function GuitarFingeringLegend() {
  const fingers: readonly GuitarFingerNumber[] = [1, 2, 3, 4];
  return (
    <div className="guitar-fingering-legend" role="group" aria-label="Guitar finger color legend">
      {fingers.map((finger) => (
        <span
          key={finger}
          className={`guitar-finger-legend-item finger-${finger}`}
          role="img"
          aria-label={`Finger ${finger}, ${GUITAR_FINGER_NAMES[finger].en}`}
        >
          <span
            className="guitar-finger-legend-dot"
            aria-hidden="true"
            style={{ "--guitar-finger-color": GUITAR_FINGER_COLORS[finger] } as CSSProperties}
          >
            {finger}
          </span>
          <span aria-hidden="true">{GUITAR_FINGER_NAMES[finger].en}</span>
        </span>
      ))}
    </div>
  );
}
