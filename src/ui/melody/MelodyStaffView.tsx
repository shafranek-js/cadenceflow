import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Project } from "../../domain/project/project";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeProgressionStepChord } from "../../domain/progression/transposition";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { rational, rationalToNumber } from "../../domain/timing/rational";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import type {
  MelodyInstrumentLane,
  MelodyStaffEntry,
  MelodyStaffMeasure,
  MelodyTimeline,
} from "../../notation/melodyStaffProjection";
import {
  renderStaffSequence,
  type StaffSequenceEntry,
  type StaffSequencePosition,
} from "../../notation/vexflowAdapter";
import { melodyInstrumentLabel } from "./labels";

function exact(value: { readonly numerator: number; readonly denominator: number }): string {
  return `${value.numerator}/${value.denominator}`;
}

function formatPitch(entry: Extract<MelodyStaffEntry, { kind: "note" }>): string {
  return `${formatPitchSpelling(entry.pitch.spelling)}${entry.pitch.octave}`;
}

function roleLabel(entry: Extract<MelodyStaffEntry, { kind: "note" }>): string {
  const primary = entry.harmonicRole.primary.replace("-", " ");
  return `role ${primary}${entry.harmonicRole.targetNext ? ", target for next chord" : ""}`;
}

function roleMarker(
  primary: Extract<MelodyStaffEntry, { kind: "note" }>["harmonicRole"]["primary"],
): string {
  switch (primary) {
    case "root":
      return "●";
    case "chord-tone":
      return "◆";
    case "scale-tone":
      return "○";
    case "altered":
      return "△";
  }
}

function sourceChordLabel(project: Project, stepId: string): string {
  const step = project.progression.steps.find(
    (candidate) => candidate.id === stepId && candidate.kind === "chord",
  );
  if (!step || step.kind !== "chord") return stepId;
  return formatChordSymbol(realizeProgressionStepChord(step, project.tonic));
}

function positionRecord(
  positions: readonly StaffSequencePosition[],
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(positions.map((position) => [position.key, position.ratio])),
  );
}

export interface MelodyStaffViewProps {
  readonly project: Project;
  readonly timeline: MelodyTimeline;
  readonly lane?: MelodyInstrumentLane;
  readonly measure: MelodyStaffMeasure;
  readonly selectedStepId?: string;
  readonly activeMelodyEventKey?: string;
  readonly onSelectStep: (stepId: string) => void;
}

export function MelodyStaffView({
  project,
  timeline,
  lane,
  measure,
  selectedStepId,
  activeMelodyEventKey,
  onSelectStep,
}: MelodyStaffViewProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [renderedPositions, setRenderedPositions] = useState<Readonly<Record<string, number>>>({});
  const sequence = useMemo<readonly StaffSequenceEntry[]>(
    () =>
      measure.entries.map((entry) => {
        if (entry.kind === "rest") {
          return {
            key: entry.key,
            kind: "rest",
            duration: { beats: entry.durationBeats },
            startOffsetBeats: entry.startOffsetBeats,
          };
        }
        return {
          key: entry.key,
          kind: "note",
          projection: projectPitchesToStaff(Object.freeze([entry.pitch])),
          duration: { beats: entry.durationBeats },
          startOffsetBeats: entry.startOffsetBeats,
          continuesFromPrevious: entry.continuesFromPrevious,
          continuesToNext: entry.continuesToNext,
          highlighted: entry.eventKey === activeMelodyEventKey,
        };
      }),
    [activeMelodyEventKey, measure.entries],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cleanup: () => void = () => undefined;
    const draw = () => {
      cleanup();
      cleanup = renderStaffSequence(
        canvas,
        sequence,
        project.globalTiming.meter,
        (positions) => {
          const next = positionRecord(positions);
          setRenderedPositions((current) =>
            JSON.stringify(current) === JSON.stringify(next) ? current : next,
          );
        },
        {
          clef: lane?.clef ?? timeline.clef,
          suzukiColors: project.presentation.noteColorMode === "suzuki",
        },
      );
    };
    draw();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    return () => {
      observer?.disconnect();
      cleanup();
    };
  }, [
    lane?.clef,
    project.globalTiming.meter,
    project.presentation.noteColorMode,
    sequence,
    timeline.clef,
  ]);

  const barLength = rationalToNumber(
    rational(project.globalTiming.meter.numerator * 4, project.globalTiming.meter.denominator),
  );
  const instrumentId = lane?.instrumentId ?? timeline.instrument;
  const instrument = melodyInstrumentLabel(instrumentId);
  const noteSummary = measure.entries
    .map((entry) =>
      entry.kind === "note"
        ? `${formatPitch(entry)} at ${exact(entry.startBeats)} for ${exact(entry.durationBeats)} beats`
        : `Rest at ${exact(entry.startBeats)} for ${exact(entry.durationBeats)} beats`,
    )
    .join(", ");

  return (
    <section
      className="melody-staff-view"
      data-testid="melody-staff-measure"
      data-measure-index={measure.measureIndex}
      aria-label={`Melody staff, ${instrument}, measure ${measure.number}: ${noteSummary}`}
    >
      <header className="melody-staff-header">
        <strong>Melody</strong>
        <span>{instrument}</span>
        <span>{(lane?.clef ?? timeline.clef) === "bass" ? "Bass clef" : "Treble clef"}</span>
      </header>
      <div className="melody-staff-paper">
        <div
          ref={canvasRef}
          className="melody-staff-canvas"
          role="img"
          aria-label={`Melody notation: ${instrument}, ${noteSummary}`}
        />
        <div className="melody-staff-annotations">
          {measure.entries.map((entry) => {
            if (entry.kind !== "note") return null;
            const xRatio =
              renderedPositions[entry.key] ?? rationalToNumber(entry.startOffsetBeats) / barLength;
            const selected = selectedStepId === entry.sourceStepId;
            const active = activeMelodyEventKey === entry.eventKey;
            const pitch = formatPitch(entry);
            const source = sourceChordLabel(project, entry.sourceStepId);
            const entryInstrument = melodyInstrumentLabel(entry.instrument);
            const label = `Melody ${entryInstrument}, ${pitch}, ${roleLabel(entry)}, onset ${exact(entry.startBeats)} beats, duration ${exact(entry.durationBeats)} beats, source chord ${source}`;
            const harmonicRoleMode = project.presentation.noteColorMode === "harmonic-role";
            const style = {
              "--melody-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
            } as CSSProperties;
            return (
              <button
                key={entry.key}
                type="button"
                className={`melody-staff-note ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${entry.startsHere ? "" : "is-continuation"} ${harmonicRoleMode ? `role-${entry.harmonicRole.primary}` : ""} ${harmonicRoleMode && entry.harmonicRole.targetNext ? "is-target-next" : ""}`.trim()}
                style={style}
                data-harmonic-role={entry.harmonicRole.primary}
                data-target-next={entry.harmonicRole.targetNext ? "true" : "false"}
                data-melody-event-key={entry.eventKey}
                data-melody-fragment-key={entry.key}
                aria-label={label}
                aria-pressed={selected}
                aria-current={active ? "step" : undefined}
                title={label}
                onClick={() => onSelectStep(entry.sourceStepId)}
              >
                {harmonicRoleMode ? (
                  <span className="melody-staff-role-marker" aria-hidden="true">
                    {roleMarker(entry.harmonicRole.primary)}
                    {entry.harmonicRole.targetNext ? <span>→</span> : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
