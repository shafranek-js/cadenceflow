import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import type { ExactPitch } from "../../domain/harmony/pitch";
import { formatMusicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import { renderStaffSequence, type StaffSequenceEntry } from "../../notation/vexflowAdapter";

export interface MeasureStaffEvent {
  readonly stepId: string;
  readonly label: string;
  readonly pitches: readonly ExactPitch[];
  readonly duration: MusicalDuration;
  readonly rest?: boolean;
}

/** Shared staff surface used when a measure contains more than one onset. */
export function MeasureStaffView({
  events,
  onSelect,
}: {
  readonly events: readonly MeasureStaffEvent[];
  readonly onSelect: (stepId: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const projections = useMemo<readonly StaffSequenceEntry[]>(
    () =>
      events.map((event) => ({
        projection: projectPitchesToStaff(event.pitches),
        duration: event.duration,
        ...(event.rest ? { rest: true } : {}),
      })),
    [events],
  );

  useEffect(() => {
    if (!ref.current) return;
    return renderStaffSequence(ref.current, projections);
  }, [projections]);

  const noteSummary = events
    .map((event) => `${event.label} ${formatMusicalDuration(event.duration)}`)
    .join(", ");

  return (
    <div
      className="measure-staff-view"
      data-testid="measure-staff-view"
      role="group"
      aria-label={`Measure staff: ${noteSummary}`}
    >
      <div
        ref={ref}
        className="measure-staff"
        role="img"
        aria-label={`Staff notation: ${noteSummary}`}
      />
      <div className="measure-staff-event-labels">
        {events.map((event) => (
          <button
            key={event.stepId}
            type="button"
            className="measure-staff-event-button"
            onClick={(mouseEvent: MouseEvent<HTMLButtonElement>) => {
              mouseEvent.stopPropagation();
              onSelect(event.stepId);
            }}
            aria-label={`Select ${event.label}, duration ${formatMusicalDuration(event.duration)} beats`}
          >
            {event.label}
            <span>{formatMusicalDuration(event.duration)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
