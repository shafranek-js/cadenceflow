import { useRef, type KeyboardEvent } from "react";
import { exactPitch } from "../../domain/harmony/pitch";
import { orderMelodyPitches } from "../../domain/melody/patterns";
import type { MelodyPitchMotion } from "../../domain/melody/types";
import {
  MELODY_PITCH_MOTION_GALLERY_GROUPS,
  MELODY_PITCH_MOTION_LABELS,
  type MelodyPitchMotionGalleryGroup,
} from "./labels";

const CONTOUR_PITCHES = Object.freeze([
  exactPitch(60, { step: "C", alter: 0 }),
  exactPitch(64, { step: "E", alter: 0 }),
  exactPitch(67, { step: "G", alter: 0 }),
  exactPitch(72, { step: "C", alter: 0 }),
]);

const CONTOUR_POSITION_LABELS = Object.freeze(["low", "low-mid", "high-mid", "high"]);

export interface MelodyPitchMotionGalleryItem {
  readonly pitchMotion: MelodyPitchMotion;
  readonly group: MelodyPitchMotionGalleryGroup["id"];
  readonly label: string;
  readonly contour: readonly number[];
  readonly contourText: string;
}

/**
 * Build the small gallery projection from the same canonical motion ordering
 * used by melody generation. These sample pitches are presentation-only.
 */
function melodyPitchMotionContour(pitchMotion: MelodyPitchMotion): readonly number[] {
  return Object.freeze(
    orderMelodyPitches(CONTOUR_PITCHES, pitchMotion).map((pitch) => pitch.midiNumber),
  );
}

function contourText(contour: readonly number[]): string {
  const minimum = CONTOUR_PITCHES[0]!.midiNumber;
  const maximum = CONTOUR_PITCHES.at(-1)!.midiNumber;
  const range = maximum - minimum;
  return contour
    .map((midiNumber) => {
      const position = Math.round(((midiNumber - minimum) / range) * 3);
      return CONTOUR_POSITION_LABELS[position] ?? "mid";
    })
    .join(" → ");
}

function createMelodyPitchMotionGalleryItems(): readonly MelodyPitchMotionGalleryItem[] {
  return Object.freeze(
    MELODY_PITCH_MOTION_GALLERY_GROUPS.flatMap((group) =>
      group.motions.map((pitchMotion) => {
        const contour = melodyPitchMotionContour(pitchMotion);
        return Object.freeze({
          pitchMotion,
          group: group.id,
          label: MELODY_PITCH_MOTION_LABELS[pitchMotion],
          contour,
          contourText: contourText(contour),
        });
      }),
    ),
  );
}

const MELODY_PITCH_MOTION_GALLERY_ITEMS = createMelodyPitchMotionGalleryItems();

export interface MelodyPitchMotionGalleryProps {
  readonly value: MelodyPitchMotion;
  readonly onChange: (pitchMotion: MelodyPitchMotion) => void;
  readonly onClose: () => void;
}

function contourPoints(contour: readonly number[]): readonly string[] {
  const minimum = CONTOUR_PITCHES[0]!.midiNumber;
  const maximum = CONTOUR_PITCHES.at(-1)!.midiNumber;
  const range = maximum - minimum;
  return contour.map((midiNumber, index) => {
    const x = contour.length === 1 ? 50 : (index / (contour.length - 1)) * 100;
    const y = 27 - ((midiNumber - minimum) / range) * 20;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
}

function nextIndex(index: number, delta: number): number {
  return (
    (index + delta + MELODY_PITCH_MOTION_GALLERY_ITEMS.length) %
    MELODY_PITCH_MOTION_GALLERY_ITEMS.length
  );
}

export function MelodyPitchMotionGallery({
  value,
  onChange,
  onClose,
}: MelodyPitchMotionGalleryProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusItem = (index: number) => {
    itemRefs.current[index]?.focus();
  };

  const handleTileKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let targetIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetIndex = nextIndex(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetIndex = nextIndex(index, -1);
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = MELODY_PITCH_MOTION_GALLERY_ITEMS.length - 1;
    }

    if (targetIndex !== null) {
      event.preventDefault();
      const nextMotion = MELODY_PITCH_MOTION_GALLERY_ITEMS[targetIndex]!.pitchMotion;
      onChange(nextMotion);
      focusItem(targetIndex);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(MELODY_PITCH_MOTION_GALLERY_ITEMS[index]!.pitchMotion);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="melody-pitch-motion-gallery"
      id="melody-pitch-motion-gallery"
      data-testid="melody-pitch-motion-gallery"
      aria-label="Pitch Motion browser"
    >
      <div className="melody-pitch-motion-gallery-heading">
        <strong>Browse Pitch Motions</strong>
        <span id="melody-pitch-motion-gallery-current">
          Current: {MELODY_PITCH_MOTION_LABELS[value]}
        </span>
      </div>
      <div
        className="melody-pitch-motion-gallery-options"
        role="radiogroup"
        aria-label="Pitch Motion choices"
        aria-describedby="melody-pitch-motion-gallery-current"
      >
        {MELODY_PITCH_MOTION_GALLERY_GROUPS.map((group) => (
          <section
            className="melody-pitch-motion-gallery-group"
            key={group.id}
            aria-labelledby={`melody-pitch-motion-group-${group.id}`}
          >
            <h3 id={`melody-pitch-motion-group-${group.id}`}>{group.label}</h3>
            <div className="melody-pitch-motion-gallery-grid">
              {group.motions.map((pitchMotion) => {
                const item = MELODY_PITCH_MOTION_GALLERY_ITEMS.find(
                  (candidate) => candidate.pitchMotion === pitchMotion,
                )!;
                const itemIndex = MELODY_PITCH_MOTION_GALLERY_ITEMS.indexOf(item);
                const points = contourPoints(item.contour);
                const isSelected = value === pitchMotion;
                return (
                  <button
                    type="button"
                    className={`melody-pitch-motion-tile${isSelected ? " is-selected" : ""}`}
                    key={pitchMotion}
                    ref={(element) => {
                      itemRefs.current[itemIndex] = element;
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${item.label}. Contour: ${item.contourText}`}
                    aria-posinset={itemIndex + 1}
                    aria-setsize={MELODY_PITCH_MOTION_GALLERY_ITEMS.length}
                    data-testid="melody-motion-tile"
                    data-pitch-motion={pitchMotion}
                    data-contour={item.contour.join(",")}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => onChange(pitchMotion)}
                    onKeyDown={(event) => handleTileKeyDown(event, itemIndex)}
                  >
                    <span className="melody-pitch-motion-tile-label">{item.label}</span>
                    <svg
                      className="melody-pitch-motion-contour"
                      viewBox="0 0 100 32"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      {points.length > 1 ? <polyline points={points.join(" ")} /> : null}
                      {points.map((point) => {
                        const [cx, cy] = point.split(",");
                        return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" />;
                      })}
                    </svg>
                    <span className="melody-pitch-motion-contour-copy">
                      Contour: {item.contourText}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
