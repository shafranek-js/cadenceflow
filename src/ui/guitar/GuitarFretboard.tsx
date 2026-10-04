import type { GuitarChordVoicing, GuitarFretItem } from "../../domain/instruments/guitar/voicings";
import {
  GUITAR_FINGER_COLORS,
  GUITAR_FINGER_NAMES,
  isGuitarFingerNumber,
} from "../../domain/instruments/guitar/fingerColors";
import type { GuitarChordColorMode } from "../../domain/project/project";

export interface GuitarFretboardProps {
  readonly voicing: GuitarChordVoicing;
  readonly scaleTones?: readonly GuitarFretItem[];
  readonly showScaleTones?: boolean;
  readonly showFingerings?: boolean;
  readonly className?: string;
  readonly width?: number | string;
  readonly height?: number | string;
  readonly orientation?: "vertical" | "horizontal";
  readonly colorMode?: GuitarChordColorMode;
}

function markerLabel(item: GuitarFretItem, colorMode: GuitarChordColorMode): string {
  const role = item.role === "root" ? "chord root" : "chord tone";
  const finger = isGuitarFingerNumber(item.finger)
    ? `finger ${item.finger} (${GUITAR_FINGER_NAMES[item.finger].en})`
    : colorMode === "fingering"
      ? "fingering unavailable"
      : undefined;
  return `String ${item.stringNumber}, fret ${item.fret}, ${role}${finger ? `, ${finger}` : ""}`;
}

function diagramLabel(
  voicing: GuitarChordVoicing,
  orientation: "vertical" | "horizontal",
  colorMode: GuitarChordColorMode,
): string {
  const modeDescription =
    colorMode === "fingering"
      ? "Fingering colors; visible numbers identify fingers 1 Index, 2 Middle, 3 Ring, and 4 Pinky."
      : "Chord-role colors; red marks the chord root and blue marks other chord tones.";
  const markers = voicing.items
    .filter((item) => item.fret > 0)
    .map((item) => markerLabel(item, colorMode));
  const openStrings = voicing.items
    .filter((item) => item.fret === 0)
    .map(
      (item) =>
        `String ${item.stringNumber} open${item.role === "root" ? ", chord root" : ", chord tone"}; no fretting finger`,
    );
  return `${voicing.chordSymbol}, ${orientation} guitar chord diagram, starting at fret ${voicing.baseFret}. ${modeDescription} ${[...markers, ...openStrings].join("; ")}`;
}

function GuitarFretMarker({
  item,
  cx,
  cy,
  colorMode,
  showFingerings,
}: {
  readonly item: GuitarFretItem;
  readonly cx: number;
  readonly cy: number;
  readonly colorMode: GuitarChordColorMode;
  readonly showFingerings: boolean;
}) {
  const isRoot = item.role === "root";
  const fingerNumber = isGuitarFingerNumber(item.finger) ? item.finger : undefined;
  const hasFinger = fingerNumber !== undefined;
  const useFingerColor = colorMode === "fingering";
  const markerClass = useFingerColor
    ? `guitar-fret-dot guitar-dot-finger${hasFinger ? "" : " is-finger-unknown"}`
    : `guitar-fret-dot ${isRoot ? "guitar-dot-root" : "guitar-dot-chord"}`;
  const groupClass = [
    "guitar-fret-dot-group",
    isRoot ? "is-root" : "is-chord-tone",
    ...(useFingerColor ? [hasFinger ? `is-finger-${fingerNumber}` : "is-finger-unknown"] : []),
  ].join(" ");

  return (
    <g
      className={groupClass}
      data-guitar-role={item.role}
      data-finger={fingerNumber}
      aria-label={markerLabel(item, colorMode)}
    >
      <circle
        cx={cx}
        cy={cy}
        r="5.5"
        className={markerClass}
        data-finger={fingerNumber}
        style={
          useFingerColor && fingerNumber ? { fill: GUITAR_FINGER_COLORS[fingerNumber] } : undefined
        }
      />
      {hasFinger && (showFingerings || useFingerColor) ? (
        <text
          x={cx}
          y={cy + 3}
          className={`guitar-dot-finger-text${useFingerColor ? " is-fingering-color" : ""}`}
          textAnchor="middle"
          aria-hidden="true"
        >
          {fingerNumber}
        </text>
      ) : null}
    </g>
  );
}

const VERT_STRING_X = [20, 36, 52, 68, 84, 100] as const; // stringIndex 0 (low E) to 5 (high E)
const STRING_GAUGES = [2.4, 2.0, 1.6, 1.3, 1.0, 0.8] as const;
const VERT_Y_TOP = 26;
const VERT_FRET_HEIGHT = 22;

const HORIZ_STRING_Y = [95, 80, 65, 50, 35, 20] as const; // stringIndex 0 (low E at bottom) to 5 (high E at top)
const HORIZ_X_NUT = 28;
const HORIZ_FRET_WIDTH = 22;

export function GuitarFretboard({
  voicing,
  scaleTones = [],
  showScaleTones = false,
  showFingerings = true,
  className = "",
  width,
  height,
  orientation = "vertical",
  colorMode = "chord-roles",
}: GuitarFretboardProps) {
  const fretSpan = Math.max(4, voicing.fretSpan);
  const isNut = voicing.baseFret === 1;
  const isHorizontal = orientation === "horizontal";
  const accessibleLabel = diagramLabel(voicing, orientation, colorMode);

  if (isHorizontal) {
    const fretboardRight = HORIZ_X_NUT + fretSpan * HORIZ_FRET_WIDTH;
    const fretNumbersX = fretboardRight + 13;
    const totalWidth = fretNumbersX + 11;
    const totalHeight = 114;
    const svgWidth = width ?? 160;
    const svgHeight = height ?? 116;

    return (
      <svg
        className={`guitar-fretboard-svg is-horizontal ${className}`.trim()}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label={accessibleLabel}
        data-testid="guitar-fretboard-svg"
        data-orientation="horizontal"
        data-color-mode={colorMode}
      >
        {/* Background container for neck */}
        <rect
          x="6"
          y="10"
          width={fretboardRight - 4}
          height="94"
          rx="4"
          className="guitar-fretboard-bg"
        />

        {/* Nut (vertical bar) if base fret is 1, otherwise regular fret line */}
        {isNut ? (
          <rect x={HORIZ_X_NUT - 3.5} y="19" width="4" height="78" rx="1" className="guitar-nut" />
        ) : (
          <>
            <line
              x1={HORIZ_X_NUT}
              y1="20"
              x2={HORIZ_X_NUT}
              y2="95"
              className="guitar-fret-line is-first"
            />
            {/* Position label above first fret (e.g. "3fr") */}
            <text
              x={HORIZ_X_NUT + HORIZ_FRET_WIDTH * 0.5}
              y="9"
              className="guitar-position-label"
              textAnchor="middle"
            >
              {`${voicing.baseFret}fr`}
            </text>
          </>
        )}

        {/* Vertical Fret Lines */}
        {Array.from({ length: fretSpan }).map((_, idx) => {
          const x = HORIZ_X_NUT + (idx + 1) * HORIZ_FRET_WIDTH;
          return (
            <line
              key={`fret-${idx + 1}`}
              x1={x}
              y1="20"
              x2={x}
              y2="95"
              className="guitar-fret-line"
            />
          );
        })}

        {/* Horizontal Strings (High E on top to Low E on bottom) */}
        {HORIZ_STRING_Y.map((y, idx) => (
          <line
            key={`string-${idx}`}
            x1={HORIZ_X_NUT}
            y1={y}
            x2={fretboardRight}
            y2={y}
            className="guitar-string"
            strokeWidth={STRING_GAUGES[idx]}
          />
        ))}

        {/* Muted ('X') and Open ('O') String Indicators before the nut on left */}
        {voicing.frets.map((fret, stringIdx) => {
          const y = HORIZ_STRING_Y[stringIdx]!;
          const x = 14;
          if (fret === -1) {
            return (
              <text
                key={`mute-${stringIdx}`}
                x={x}
                y={y + 3.5}
                className="guitar-string-marker is-muted"
                textAnchor="middle"
                aria-label={`String ${6 - stringIdx} muted`}
              >
                ×
              </text>
            );
          }
          if (fret === 0) {
            const isRoot = voicing.items[stringIdx]?.role === "root";
            return (
              <circle
                key={`open-${stringIdx}`}
                cx={x}
                cy={y}
                r="3.5"
                className={`guitar-string-marker is-open${isRoot && colorMode === "chord-roles" ? " is-root" : colorMode === "fingering" ? " is-neutral" : ""}`}
                aria-label={`String ${6 - stringIdx} open${isRoot ? ", chord root" : ", chord tone"}; no fretting finger`}
              />
            );
          }
          return null;
        })}

        {/* Barre indicators in horizontal orientation */}
        {voicing.barres.map((barre, idx) => {
          const relFret = barre.fret - voicing.baseFret + 1;
          if (relFret < 1 || relFret > fretSpan) return null;
          const x = HORIZ_X_NUT + (relFret - 0.5) * HORIZ_FRET_WIDTH;
          const fromY = HORIZ_STRING_Y[barre.fromStringIndex]!;
          const toY = HORIZ_STRING_Y[barre.toStringIndex]!;
          return (
            <rect
              key={`barre-${idx}`}
              x={x - 5.5}
              y={Math.min(fromY, toY) - 5}
              width="11"
              height={Math.abs(toY - fromY) + 10}
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
            const cx = HORIZ_X_NUT + (relFret - 0.5) * HORIZ_FRET_WIDTH;
            const cy = HORIZ_STRING_Y[item.stringIndex]!;
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
          .map((item) => {
            const relFret = item.fret - voicing.baseFret + 1;
            if (relFret < 1 || relFret > fretSpan) return null;
            const cx = HORIZ_X_NUT + (relFret - 0.5) * HORIZ_FRET_WIDTH;
            const cy = HORIZ_STRING_Y[item.stringIndex]!;
            return (
              <GuitarFretMarker
                key={`dot-${item.stringIndex}`}
                item={item}
                cx={cx}
                cy={cy}
                colorMode={colorMode}
                showFingerings={showFingerings}
              />
            );
          })}

        {/* Exact string-aligned fret numbers on the right side */}
        {voicing.frets.map((fret, stringIdx) => {
          const y = HORIZ_STRING_Y[stringIdx]!;
          const text = fret === -1 ? "x" : String(fret);
          return (
            <text
              key={`fret-num-${stringIdx}`}
              x={fretNumbersX}
              y={y + 3.5}
              className="guitar-fret-number"
              textAnchor="middle"
              aria-label={`String ${6 - stringIdx} fret ${text}`}
            >
              {text}
            </text>
          );
        })}
      </svg>
    );
  }

  // --- Vertical Orientation (Default) ---
  const fretboardBottom = VERT_Y_TOP + fretSpan * VERT_FRET_HEIGHT;
  const fretNumbersY = fretboardBottom + 16;
  const totalHeight = fretNumbersY + 5;
  const svgWidth = width ?? 120;
  const svgHeight = height ?? 140;

  return (
    <svg
      className={`guitar-fretboard-svg is-vertical ${className}`.trim()}
      viewBox={`0 0 120 ${totalHeight}`}
      width={svgWidth}
      height={svgHeight}
      role="img"
      aria-label={accessibleLabel}
      data-testid="guitar-fretboard-svg"
      data-orientation="vertical"
      data-color-mode={colorMode}
    >
      {/* Background container */}
      <rect
        x="12"
        y="6"
        width="96"
        height={fretboardBottom - 4}
        rx="4"
        className="guitar-fretboard-bg"
      />

      {/* Nut (fret 0 bar) if base fret is 1, otherwise regular fret line */}
      {isNut ? (
        <rect x="19" y={VERT_Y_TOP - 3.5} width="82" height="4" rx="1" className="guitar-nut" />
      ) : (
        <>
          <line
            x1="20"
            y1={VERT_Y_TOP}
            x2="100"
            y2={VERT_Y_TOP}
            className="guitar-fret-line is-first"
          />
          {/* Position label for higher frets (e.g. "3fr", "5fr") */}
          <text
            x="105"
            y={VERT_Y_TOP + VERT_FRET_HEIGHT * 0.65}
            className="guitar-position-label"
            textAnchor="start"
          >
            {`${voicing.baseFret}fr`}
          </text>
        </>
      )}

      {/* Horizontal Fret Lines */}
      {Array.from({ length: fretSpan }).map((_, idx) => {
        const y = VERT_Y_TOP + (idx + 1) * VERT_FRET_HEIGHT;
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
      {VERT_STRING_X.map((x, idx) => (
        <line
          key={`string-${idx}`}
          x1={x}
          y1={VERT_Y_TOP}
          x2={x}
          y2={fretboardBottom}
          className="guitar-string"
          strokeWidth={STRING_GAUGES[idx]}
        />
      ))}

      {/* Muted ('X') and Open ('O') String Indicators above the nut */}
      {voicing.frets.map((fret, stringIdx) => {
        const x = VERT_STRING_X[stringIdx]!;
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
          const isRoot = voicing.items[stringIdx]?.role === "root";
          return (
            <circle
              key={`open-${stringIdx}`}
              cx={x}
              cy={y}
              r="3.5"
              className={`guitar-string-marker is-open${isRoot && colorMode === "chord-roles" ? " is-root" : colorMode === "fingering" ? " is-neutral" : ""}`}
              aria-label={`String ${6 - stringIdx} open${isRoot ? ", chord root" : ", chord tone"}; no fretting finger`}
            />
          );
        }
        return null;
      })}

      {/* Barre indicators */}
      {voicing.barres.map((barre, idx) => {
        const relFret = barre.fret - voicing.baseFret + 1;
        if (relFret < 1 || relFret > fretSpan) return null;
        const fromX = VERT_STRING_X[barre.fromStringIndex]!;
        const toX = VERT_STRING_X[barre.toStringIndex]!;
        const y = VERT_Y_TOP + (relFret - 0.5) * VERT_FRET_HEIGHT;
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
          const cx = VERT_STRING_X[item.stringIndex]!;
          const cy = VERT_Y_TOP + (relFret - 0.5) * VERT_FRET_HEIGHT;
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
        .map((item) => {
          const relFret = item.fret - voicing.baseFret + 1;
          if (relFret < 1 || relFret > fretSpan) return null;
          const cx = VERT_STRING_X[item.stringIndex]!;
          const cy = VERT_Y_TOP + (relFret - 0.5) * VERT_FRET_HEIGHT;
          return (
            <GuitarFretMarker
              key={`dot-${item.stringIndex}`}
              item={item}
              cx={cx}
              cy={cy}
              colorMode={colorMode}
              showFingerings={showFingerings}
            />
          );
        })}

      {/* Exact string-aligned fret numbers at bottom under each string */}
      {voicing.frets.map((fret, stringIdx) => {
        const x = VERT_STRING_X[stringIdx]!;
        const text = fret === -1 ? "x" : String(fret);
        return (
          <text
            key={`fret-num-${stringIdx}`}
            x={x}
            y={fretNumbersY}
            className="guitar-fret-number"
            textAnchor="middle"
            aria-label={`String ${6 - stringIdx} fret ${text}`}
          >
            {text}
          </text>
        );
      })}
    </svg>
  );
}
