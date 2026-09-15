import { useId } from "react";
import type { GuitarChordVoicing, GuitarFretItem } from "../../domain/instruments/guitar/voicings";

export interface GuitarFretboardProps {
  readonly voicing: GuitarChordVoicing;
  readonly scaleTones?: readonly GuitarFretItem[];
  readonly showScaleTones?: boolean;
  readonly showFingerings?: boolean;
  readonly className?: string;
  readonly width?: number | string;
  readonly height?: number | string;
}

const STRING_X = [20, 36, 52, 68, 84, 100] as const; // stringIndex 0 (low E) to 5 (high E)
const STRING_GAUGES = [2.4, 2.0, 1.6, 1.3, 1.0, 0.8] as const;
const Y_TOP = 26;
const FRET_HEIGHT = 22;

export function GuitarFretboard({
  voicing,
  scaleTones = [],
  showScaleTones = false,
  showFingerings = true,
  className = "",
  width = 120,
  height = 136,
}: GuitarFretboardProps) {
  const fretSpan = Math.max(4, voicing.fretSpan);
  const totalHeight = Y_TOP + fretSpan * FRET_HEIGHT + 10;
  const isNut = voicing.baseFret === 1;
  const maskId = useId();

  return (
    <svg
      className={`guitar-fretboard-svg ${className}`.trim()}
      viewBox={`0 0 120 ${totalHeight}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${voicing.chordSymbol} guitar chord diagram starting at fret ${voicing.baseFret}`}
      data-testid="guitar-fretboard-svg"
    >
      {/* Background container */}
      <rect
        x="12"
        y="6"
        width="96"
        height={totalHeight - 8}
        rx="4"
        className="guitar-fretboard-bg"
      />

      {/* Nut (fret 0 bar) if base fret is 1, otherwise regular fret line */}
      {isNut ? (
        <rect
          x="19"
          y={Y_TOP - 3.5}
          width="82"
          height="4"
          rx="1"
          className="guitar-nut"
        />
      ) : (
        <>
          <line
            x1="20"
            y1={Y_TOP}
            x2="100"
            y2={Y_TOP}
            className="guitar-fret-line is-first"
          />
          {/* Position label for higher frets (e.g. "3fr", "5fr") */}
          <text
            x="105"
            y={Y_TOP + FRET_HEIGHT * 0.65}
            className="guitar-position-label"
            textAnchor="start"
          >
            {`${voicing.baseFret}fr`}
          </text>
        </>
      )}

      {/* Horizontal Fret Lines */}
      {Array.from({ length: fretSpan }).map((_, idx) => {
        const y = Y_TOP + (idx + 1) * FRET_HEIGHT;
        return (
          <line
            key={`fret-${idx + 1}`}
            x1="20"
            y1={y}
            x2="100"
            y2={y}
            className="guitar-fret-line"
          />
        );
      })}

      {/* Vertical Strings (from Low E on left to High E on right) */}
      {STRING_X.map((x, idx) => (
        <line
          key={`string-${idx}`}
          x1={x}
          y1={Y_TOP}
          x2={x}
          y2={Y_TOP + fretSpan * FRET_HEIGHT}
          className="guitar-string"
          strokeWidth={STRING_GAUGES[idx]}
        />
      ))}

      {/* Muted ('X') and Open ('O') String Indicators above the nut */}
      {voicing.frets.map((fret, stringIdx) => {
        const x = STRING_X[stringIdx]!;
        const y = 14;
        if (fret === -1) {
          // Muted string 'X'
          return (
            <text
              key={`mute-${stringIdx}`}
              x={x}
              y={y + 3}
              className="guitar-string-marker is-muted"
              textAnchor="middle"
              aria-label={`String ${6 - stringIdx} muted`}
            >
              ×
            </text>
          );
        }
        if (fret === 0) {
          // Open string 'O'
          return (
            <circle
              key={`open-${stringIdx}`}
              cx={x}
              cy={y}
              r="3.5"
              className="guitar-string-marker is-open"
              aria-label={`String ${6 - stringIdx} open`}
            />
          );
        }
        return null;
      })}

      {/* Barre indicators */}
      {voicing.barres.map((barre, idx) => {
        const relFret = barre.fret - voicing.baseFret + 1;
        if (relFret < 1 || relFret > fretSpan) return null;
        const fromX = STRING_X[barre.fromStringIndex]!;
        const toX = STRING_X[barre.toStringIndex]!;
        const y = Y_TOP + (relFret - 0.5) * FRET_HEIGHT;
        return (
          <rect
            key={`barre-${idx}`}
            x={Math.min(fromX, toX) - 5}
            y={y - 5.5}
            width={Math.abs(toX - fromX) + 10}
            height="11"
            rx="5.5"
            className="guitar-barre"
            aria-label={`Barre fret ${barre.fret}`}
          />
        );
      })}

      {/* In-position Scale Tone Overlay (ghost dots) */}
      {showScaleTones &&
        scaleTones.map((item, idx) => {
          const relFret = item.fret - voicing.baseFret + 1;
          if (relFret < 1 || relFret > fretSpan) return null;
          const cx = STRING_X[item.stringIndex]!;
          const cy = Y_TOP + (relFret - 0.5) * FRET_HEIGHT;
          return (
            <circle
              key={`scale-tone-${idx}`}
              cx={cx}
              cy={cy}
              r="3.5"
              className="guitar-dot-scale-tone"
            />
          );
        })}

      {/* Fretted Chord Notes (finger dots) */}
      {voicing.items
        .filter((item) => item.fret > 0)
        .map((item, idx) => {
          const relFret = item.fret - voicing.baseFret + 1;
          if (relFret < 1 || relFret > fretSpan) return null;
          const cx = STRING_X[item.stringIndex]!;
          const cy = Y_TOP + (relFret - 0.5) * FRET_HEIGHT;
          const isRoot = item.role === "root";

          return (
            <g
              key={`dot-${idx}`}
              className={`guitar-fret-dot-group ${isRoot ? "is-root" : "is-chord-tone"}`}
            >
              <circle
                cx={cx}
                cy={cy}
                r="5.5"
                className={`guitar-fret-dot ${isRoot ? "guitar-dot-root" : "guitar-dot-chord"}`}
              />
              {showFingerings && item.finger ? (
                <text
                  x={cx}
                  y={cy + 3}
                  className="guitar-dot-finger-text"
                  textAnchor="middle"
                >
                  {item.finger}
                </text>
              ) : null}
            </g>
          );
        })}
    </svg>
  );
}
