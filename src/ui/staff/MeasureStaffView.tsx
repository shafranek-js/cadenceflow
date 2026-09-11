import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { ExactPitch } from "../../domain/harmony/pitch";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { formatMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import type { Meter } from "../../domain/timing/meter";
import { rationalToNumber, type Rational } from "../../domain/timing/rational";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import {
  renderStaffSequence,
  type StaffSequenceEntry,
  type StaffSequencePosition,
} from "../../notation/vexflowAdapter";
import { Icon } from "../common/Icon";
import type { StaffOctaveDirection } from "./staffOctave";

interface MeasureStaffItemBase {
  readonly key: string;
  readonly duration: MusicalDuration;
  readonly startOffsetBeats: Rational;
}

export interface MeasureStaffChordItem extends MeasureStaffItemBase {
  readonly kind: "chord";
  readonly stepId: string;
  readonly label: string;
  readonly pitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch;
  readonly chordPitches: readonly ExactPitch[];
  readonly startsHere: boolean;
  readonly continuesFromPrevious: boolean;
  readonly continuesToNext: boolean;
  readonly canShiftUp: boolean;
  readonly canShiftDown: boolean;
}

export interface MeasureStaffRestItem extends MeasureStaffItemBase {
  readonly kind: "rest";
  readonly stepId: string;
  readonly label: "Rest";
}

export interface MeasureStaffGapItem extends MeasureStaffItemBase {
  readonly kind: "gap";
}

export type MeasureStaffItem = MeasureStaffChordItem | MeasureStaffRestItem | MeasureStaffGapItem;

function formatPitch(pitch: ExactPitch): string {
  return `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`;
}

function positionRecord(
  positions: readonly StaffSequencePosition[],
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(positions.map((position) => [position.key, position.ratio])),
  );
}

/** Shared, time-proportional paper staff for one progression measure. */
export function MeasureStaffView({
  items,
  meter,
  barLengthBeats,
  selectedStepId,
  playingStepId,
  onSelect,
  onOctaveChange,
  onOpenMelodyMenu,
}: {
  readonly items: readonly MeasureStaffItem[];
  readonly meter: Meter;
  readonly barLengthBeats: Rational;
  readonly selectedStepId: string | undefined;
  readonly playingStepId: string | undefined;
  readonly onSelect: (stepId: string) => void;
  readonly onOctaveChange: (stepId: string, direction: StaffOctaveDirection) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: { readonly x: number; readonly y: number },
  ) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [renderedPositions, setRenderedPositions] = useState<Readonly<Record<string, number>>>({});
  const [useBassStaff, setUseBassStaff] = useState(false);
  const hasVisibleBass = items.some((item) => item.kind === "chord" && item.bassPitch);
  const sequence = useMemo<readonly StaffSequenceEntry[]>(
    () =>
      items.map((item) => {
        if (item.kind === "gap") {
          return {
            key: item.key,
            kind: "gap",
            duration: item.duration,
            startOffsetBeats: item.startOffsetBeats,
          };
        }
        if (item.kind === "rest") {
          return {
            key: item.key,
            kind: "rest",
            duration: item.duration,
            startOffsetBeats: item.startOffsetBeats,
          };
        }
        const treblePitches =
          item.bassPitch && !useBassStaff
            ? Object.freeze([item.bassPitch, ...item.pitches])
            : item.pitches;
        return {
          key: item.key,
          kind: "chord",
          projection: projectPitchesToStaff(treblePitches),
          ...(useBassStaff && item.bassPitch
            ? { bassProjection: projectPitchesToStaff(Object.freeze([item.bassPitch])) }
            : {}),
          duration: item.duration,
          startOffsetBeats: item.startOffsetBeats,
          continuesFromPrevious: item.continuesFromPrevious,
          continuesToNext: item.continuesToNext,
          highlighted: item.stepId === playingStepId,
        };
      }),
    [items, playingStepId, useBassStaff],
  );

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let cleanup: () => void = () => undefined;
    const draw = () => {
      cleanup();
      cleanup = renderStaffSequence(container, sequence, meter, (positions) => {
        const next = positionRecord(positions);
        setRenderedPositions((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next,
        );
      });
    };
    draw();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const nextUseBassStaff = hasVisibleBass && container.clientWidth >= 720;
            setUseBassStaff((current) =>
              current === nextUseBassStaff ? current : nextUseBassStaff,
            );
            draw();
          });
    setUseBassStaff(hasVisibleBass && container.clientWidth >= 720);
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      cleanup();
    };
  }, [hasVisibleBass, meter, sequence]);

  const visibleItems = items.filter((item) => item.kind !== "gap");
  const noteSummary = visibleItems
    .map((item) => {
      const continuation = item.kind === "chord" && !item.startsHere ? " continuation" : "";
      return `${item.kind === "rest" ? "Rest" : item.label}${continuation} ${formatMusicalDuration(item.duration)}`;
    })
    .join(", ");
  const barLength = rationalToNumber(barLengthBeats);

  return (
    <div
      className={`measure-staff-view ${useBassStaff ? "has-bass-staff" : ""}`}
      data-testid="measure-staff-view"
      role="group"
      aria-label={`Measure staff: ${noteSummary}`}
    >
      <header className="measure-staff-header">
        <strong>Harmony</strong>
        <span>Treble clef</span>
        {useBassStaff ? <span>Bass staff</span> : null}
      </header>
      <div className="measure-staff-paper">
        <div
          ref={ref}
          className="measure-staff"
          role="img"
          aria-label={`Staff notation: ${noteSummary}`}
        />
        <div className="measure-staff-annotations">
          {visibleItems.map((item) => {
            const exactRatio = rationalToNumber(item.startOffsetBeats) / barLength;
            const xRatio = renderedPositions[item.key] ?? exactRatio;
            const durationRatio = rationalToNumber(item.duration.beats) / barLength;
            const selected = selectedStepId === item.stepId;
            const playing = playingStepId === item.stepId;
            const chord = item.kind === "chord" ? item : null;
            const visibleLabel = item.kind === "rest" ? "Rest" : item.startsHere ? item.label : "↪";
            const displayPitches = chord
              ? chord.bassPitch
                ? Object.freeze([chord.bassPitch, ...chord.pitches])
                : chord.pitches
              : Object.freeze([]);
            const notes = displayPitches.map(formatPitch).join(" ");
            const chordOctave = chord?.chordPitches[0]?.octave;
            const title = chord
              ? `${chord.label}: ${notes}; Oct ${chordOctave ?? 4}; ${formatMusicalDuration(chord.duration)} beats${chord.startsHere ? "" : "; continuation"}`
              : `Rest: ${formatMusicalDuration(item.duration)} beats`;
            const style = {
              "--measure-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
              "--measure-staff-event-span": `${Math.max(durationRatio, 0) * 100}%`,
            } as CSSProperties;

            return (
              <div
                key={item.key}
                className={`measure-staff-event ${selected ? "is-selected" : ""} ${playing ? "is-playing" : ""} ${item.kind === "rest" ? "is-rest" : ""} ${chord && !chord.startsHere ? "is-continuation" : ""}`}
                style={style}
                data-staff-item-key={item.key}
                data-start-ratio={exactRatio.toFixed(6)}
              >
                <div className="measure-staff-event-top">
                  {selected && chord ? (
                    <button
                      type="button"
                      className="measure-staff-octave-button"
                      aria-label={`Raise ${chord.label} one octave`}
                      title="Raise chord one octave"
                      disabled={!chord.canShiftUp}
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        onOctaveChange(chord.stepId, 1);
                      }}
                    >
                      <Icon name="arrow-up" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="measure-staff-event-select"
                    title={title}
                    aria-label={`Select ${title}`}
                    aria-pressed={selected}
                    aria-current={playing ? "step" : undefined}
                    aria-haspopup={chord && onOpenMelodyMenu ? "menu" : undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(item.stepId);
                    }}
                    onContextMenu={(event) => {
                      if (!chord || !onOpenMelodyMenu) return;
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenMelodyMenu(chord.stepId, event.currentTarget, {
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (
                        !chord ||
                        !onOpenMelodyMenu ||
                        (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey))
                      ) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      onOpenMelodyMenu(chord.stepId, event.currentTarget, {
                        x: rect.left,
                        y: rect.bottom,
                      });
                    }}
                  >
                    {visibleLabel}
                  </button>
                </div>
                {chord && chord.startsHere ? (
                  <div
                    className="measure-staff-event-details"
                    aria-label={`Visible notes: ${notes}`}
                  >
                    <span>{notes}</span>
                    <span>{`Oct ${chordOctave ?? 4}`}</span>
                  </div>
                ) : null}
                {selected && chord ? (
                  <button
                    type="button"
                    className="measure-staff-octave-button measure-staff-octave-down"
                    aria-label={`Lower ${chord.label} one octave`}
                    title="Lower chord one octave"
                    disabled={!chord.canShiftDown}
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onOctaveChange(chord.stepId, -1);
                    }}
                  >
                    <Icon name="arrow-down" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
