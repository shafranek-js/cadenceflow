import { useMemo } from "react";
import type { ChordDefinition } from "../../domain/harmony/chord";
import type { PianoArticulation } from "../../domain/progression/step";
import type { MusicalDuration } from "../../domain/timing/duration";
import { formatMusicalDuration } from "../../domain/timing/duration";
import {
  resolveGuitarTabEntry,
  type GuitarTabEntry,
} from "../../domain/instruments/guitar/tablature";
import type { LabelHierarchyMode } from "../progression/labelHierarchy";
import { ProgressionChordLabel } from "../progression/ProgressionChordLabel";

export interface TabCardViewProps {
  readonly chord: ChordDefinition;
  readonly chordLabel: string;
  readonly labelMode?: LabelHierarchyMode;
  readonly functionLabel?: string;
  readonly duration?: MusicalDuration | undefined;
  readonly articulation?: PianoArticulation | undefined;
  readonly playing?: boolean | undefined;
  readonly showClef?: boolean | undefined;
  readonly className?: string | undefined;
}

// 6 strings Y positions: string 1 (high E) at top (y=20) down to string 6 (low E) at bottom (y=90)
const STRING_Y = [20, 34, 48, 62, 76, 90] as const;
const STRING_GAUGES = [1, 1, 1, 1, 1, 1] as const;

function formatArticulationGlyph(articulation?: PianoArticulation): string | null {
  if (!articulation) return null;
  if (articulation === "arp-up" || articulation === "broken-chord") return "∿";
  if (articulation === "arp-down") return "∿";
  if (articulation === "humanized") return "≈";
  return null;
}

export function TabCardView({
  chord,
  chordLabel,
  labelMode,
  functionLabel,
  duration,
  articulation,
  playing = false,
  showClef = true,
  className = "",
}: TabCardViewProps) {
  const tabEntry: GuitarTabEntry = useMemo(
    () => resolveGuitarTabEntry(chord, chordLabel, chord.bassPitchClass),
    [chord, chordLabel],
  );

  const durationLabel = duration ? formatMusicalDuration(duration) : undefined;
  const articulationGlyph = formatArticulationGlyph(articulation);

  return (
    <div
      className={`mini-tab-card-visual ${playing ? "is-playing" : ""} ${className}`.trim()}
      data-testid="mini-tab-card-visual"
      data-chord-symbol={chordLabel}
      data-base-fret={tabEntry.baseFret}
      data-frets={tabEntry.fretSummary}
      data-playing={playing ? "true" : undefined}
    >
      <div className="mini-tab-heading">
        {labelMode && functionLabel ? (
          <ProgressionChordLabel
            mode={labelMode}
            functionLabel={functionLabel}
            chordLabel={tabEntry.chordSymbol}
            className="mini-tab-chord-name"
          />
        ) : (
          <strong className="mini-tab-chord-name">{tabEntry.chordSymbol}</strong>
        )}
        <div className="mini-tab-meta">
          {tabEntry.positionLabel ? (
            <span className="mini-tab-position" aria-label={`Position fret ${tabEntry.baseFret}`}>
              {tabEntry.positionLabel}
            </span>
          ) : null}
          {durationLabel ? <span className="mini-tab-duration">{durationLabel}</span> : null}
          {articulationGlyph ? (
            <span
              className="mini-tab-articulation"
              title={`Articulation: ${articulation}`}
              aria-label={articulation}
            >
              {articulationGlyph}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mini-tab-fretboard-wrap">
        <svg
          className="guitar-tab-svg"
          viewBox="0 0 120 106"
          width="120"
          height="106"
          role="img"
          aria-label={`${chordLabel} guitar tablature`}
          data-testid="guitar-tab-svg"
        >
          {/* Card background */}
          <rect x="8" y="8" width="104" height="90" rx="4" className="guitar-tab-bg" />

          {/* TAB clef on the left */}
          {showClef ? (
            <g className="guitar-tab-clef" aria-hidden="true">
              <text x="17" y="38" className="guitar-tab-clef-text">
                T
              </text>
              <text x="17" y="58" className="guitar-tab-clef-text">
                A
              </text>
              <text x="17" y="78" className="guitar-tab-clef-text">
                B
              </text>
            </g>
          ) : null}

          {/* 6 Horizontal String lines */}
          {STRING_Y.map((y, idx) => (
            <line
              key={`string-${idx}`}
              x1={showClef ? "28" : "14"}
              y1={y}
              x2="106"
              y2={y}
              className={`guitar-tab-line guitar-tab-string-${idx + 1}`}
              strokeWidth={STRING_GAUGES[idx]}
            />
          ))}

          {/* Fret values on each string (strings[0] is high e, strings[5] is low E) */}
          {tabEntry.strings.map((strPos, idx) => {
            const y = STRING_Y[idx] ?? 20;
            const fretX = 66;

            if (strPos.isMuted) {
              return (
                <g key={`fret-${strPos.stringNumber}`} className="guitar-tab-fret-group is-muted">
                  <rect
                    x={fretX - 6}
                    y={y - 6}
                    width="12"
                    height="12"
                    rx="2"
                    className="guitar-tab-fret-plate"
                  />
                  <text
                    x={fretX}
                    y={y + 3.5}
                    textAnchor="middle"
                    className="guitar-tab-fret-num is-muted"
                  >
                    ×
                  </text>
                </g>
              );
            }

            const isDoubleDigit = strPos.fret >= 10;
            const plateWidth = isDoubleDigit ? 18 : 13;
            const plateX = fretX - plateWidth / 2;

            return (
              <g
                key={`fret-${strPos.stringNumber}`}
                className={`guitar-tab-fret-group ${strPos.isOpen ? "is-open" : "is-fretted"}`}
                data-string={strPos.stringNumber}
                data-fret={strPos.fret}
              >
                <rect
                  x={plateX}
                  y={y - 6.5}
                  width={plateWidth}
                  height="13"
                  rx="2"
                  className="guitar-tab-fret-plate"
                />
                <text
                  x={fretX}
                  y={y + 3.5}
                  textAnchor="middle"
                  className={`guitar-tab-fret-num ${strPos.isOpen ? "is-open" : "is-fretted"}`}
                >
                  {strPos.fret}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
