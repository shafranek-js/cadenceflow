import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import type { DiatonicStep, ExactPitch } from "../../domain/harmony/pitch";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { formatMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import { renderStaffProjection } from "../../notation/vexflowAdapter";
import { Icon } from "../common/Icon";
import type { StaffOctaveDirection } from "./staffOctave";

function formatPitch(pitch: ExactPitch): string {
  return `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`;
}

export function StaffCardView({
  pitches,
  chordPitches = pitches,
  chordLabel,
  duration,
  className = "",
  selected,
  playing = false,
  selectionAriaLabel,
  selectionTitle,
  selectionDescribedBy,
  stepId,
  canShiftUp = true,
  canShiftDown = true,
  onSelect,
  onOctaveChange,
  hasContextMenu = false,
}: {
  readonly pitches: readonly ExactPitch[];
  readonly chordPitches?: readonly ExactPitch[];
  readonly chordLabel: string;
  readonly duration: MusicalDuration;
  readonly className?: string;
  readonly selected: boolean;
  readonly playing?: boolean;
  readonly selectionAriaLabel: string;
  readonly selectionTitle?: string;
  readonly selectionDescribedBy?: string;
  readonly stepId?: string;
  readonly canShiftUp?: boolean;
  readonly canShiftDown?: boolean;
  readonly onSelect: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onOctaveChange: (direction: StaffOctaveDirection) => void;
  readonly hasContextMenu?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const projection = useMemo(() => projectPitchesToStaff(pitches), [pitches]);
  const accessibleNotes = projection.notes
    .map(
      (note) =>
        `${formatPitchSpelling({ step: note.step as DiatonicStep, alter: note.alter })}${note.octave}`,
    )
    .join(", ");
  const visibleNoteLabels = pitches.map(formatPitch);
  const chordOctave = chordPitches[0]?.octave ?? 4;
  const durationLabel = formatMusicalDuration(duration);

  useEffect(() => {
    if (!ref.current) return;
    return renderStaffProjection(ref.current, projection, duration);
  }, [duration, projection]);

  const shift = (direction: StaffOctaveDirection) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOctaveChange(direction);
  };

  return (
    <div className={`mini-staff-card-visual ${className}`.trim()}>
      <div className="mini-staff-heading">
        <strong className="mini-staff-chord-name">{chordLabel}</strong>
        <span className="mini-staff-octave" aria-label={`Chord starts in octave ${chordOctave}`}>
          {`Oct ${chordOctave}`}
        </span>
      </div>
      <button
        type="button"
        className="staff-octave-button staff-octave-up"
        aria-label={`Raise ${chordLabel} one octave`}
        title="Raise chord one octave"
        disabled={!canShiftUp}
        onClick={shift(1)}
      >
        <Icon name="arrow-up" />
      </button>
      <button
        type="button"
        className="staff-card-preview-button"
        data-progression-step-select={stepId ? "" : undefined}
        data-step-id={stepId}
        onClick={onSelect}
        aria-label={selectionAriaLabel}
        aria-pressed={selected}
        aria-current={playing ? "step" : undefined}
        aria-haspopup={hasContextMenu ? "menu" : undefined}
        aria-describedby={selectionDescribedBy}
        title={selectionTitle}
      >
        <div
          ref={ref}
          className="mini-staff"
          role="img"
          aria-label={`${chordLabel} staff realization: ${accessibleNotes}; duration ${durationLabel} beats`}
          data-duration-beats={durationLabel}
        />
      </button>
      <button
        type="button"
        className="staff-octave-button staff-octave-down"
        aria-label={`Lower ${chordLabel} one octave`}
        title="Lower chord one octave"
        disabled={!canShiftDown}
        onClick={shift(-1)}
      >
        <Icon name="arrow-down" />
      </button>
      <div className="mini-staff-note-labels" aria-label={`Visible notes: ${accessibleNotes}`}>
        {visibleNoteLabels.map((label, index) => (
          <span key={`${pitches[index]?.midiNumber ?? label}-${index}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}
