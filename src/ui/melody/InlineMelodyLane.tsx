import type { CSSProperties, MouseEvent } from "react";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { Project } from "../../domain/project/project";
import type { ProgressionMeasure } from "../../domain/timing/measureLayout";
import {
  addRational,
  compareRational,
  rationalToNumber,
  subtractRational,
} from "../../domain/timing/rational";
import type {
  MelodyInstrumentLane,
  MelodyStaffEntry,
  MelodyStaffMeasure,
  MelodyTimeline,
} from "../../notation/melodyStaffProjection";
import { melodyInstrumentLabel } from "./labels";

function exact(value: { readonly numerator: number; readonly denominator: number }): string {
  return `${value.numerator}/${value.denominator}`;
}

function formatPitch(entry: Extract<MelodyStaffEntry, { kind: "note" }>): string {
  return `${formatPitchSpelling(entry.pitch.spelling)}${entry.pitch.octave}`;
}

function roleLabel(entry: Extract<MelodyStaffEntry, { kind: "note" }>): string {
  return entry.harmonicRole.primary.replace("-", " ");
}

function sourceChordLabel(project: Project, stepId: string): string {
  const step = project.progression.steps.find(
    (candidate) => candidate.id === stepId && candidate.kind === "chord",
  );
  if (!step || step.kind !== "chord") return stepId;
  return formatChordSymbol({
    ...realizeChord(step.harmonicFunction, project.tonic),
    variant: step.harmonicVariant,
  });
}

function laneForMeasure(
  lane: MelodyInstrumentLane,
  measure: ProgressionMeasure,
): MelodyStaffMeasure | undefined {
  return lane.measures[measure.measureIndex];
}

function segmentStyle(durationBeats: {
  readonly numerator: number;
  readonly denominator: number;
}): CSSProperties {
  return { flex: `${durationBeats.numerator / durationBeats.denominator} 1 0` };
}

function entryPositionInItem(
  entry: MelodyStaffEntry,
  item: ProgressionMeasure["items"][number],
): CSSProperties {
  const entryEnd = addRational(entry.startBeats, entry.durationBeats);
  const start =
    compareRational(entry.startBeats, item.startBeats) > 0 ? entry.startBeats : item.startBeats;
  const end = compareRational(entryEnd, item.endBeats) < 0 ? entryEnd : item.endBeats;
  const itemDuration = rationalToNumber(item.durationBeats);
  const left = rationalToNumber(subtractRational(start, item.startBeats)) / itemDuration;
  const width = rationalToNumber(subtractRational(end, start)) / itemDuration;
  return { left: `${left * 100}%`, width: `${width * 100}%` };
}

function entryFragmentInItem(
  entry: Extract<MelodyStaffEntry, { kind: "note" }>,
  item: ProgressionMeasure["items"][number],
) {
  const entryEnd = addRational(entry.startBeats, entry.durationBeats);
  const startBeats =
    compareRational(entry.startBeats, item.startBeats) > 0 ? entry.startBeats : item.startBeats;
  const endBeats = compareRational(entryEnd, item.endBeats) < 0 ? entryEnd : item.endBeats;
  return {
    startBeats,
    durationBeats: subtractRational(endBeats, startBeats),
    startsHere: entry.startsHere && compareRational(startBeats, entry.startBeats) === 0,
  };
}

export interface InlineMelodyLaneProps {
  readonly project: Project;
  readonly timeline: MelodyTimeline;
  readonly measure: ProgressionMeasure;
  readonly selectedStepId?: string;
  readonly activeMelodyEventKey?: string | null;
  readonly onSelectStep: (stepId: string) => void;
  readonly onOpenMelodyEditor?: (stepId: string, anchor: HTMLButtonElement) => void;
}

/**
 * Read-only generated Melody projection for the non-notation Progression views.
 * The measure and segment boundaries come directly from createMelodyTimeline;
 * this component deliberately has no editing or persisted Melody state.
 */
export function InlineMelodyLane({
  project,
  timeline,
  measure,
  selectedStepId,
  activeMelodyEventKey,
  onSelectStep,
  onOpenMelodyEditor,
}: InlineMelodyLaneProps) {
  if (timeline.lanes.length === 0) return null;

  return (
    <section
      className="inline-melody-lane"
      data-testid="melody-lane"
      data-measure-index={measure.measureIndex}
      data-axis-start-beats={exact(measure.startBeats)}
      data-axis-end-beats={exact(measure.endBeats)}
      aria-label={`Melody Lane, measure ${measure.number}; shared timeline ${exact(measure.startBeats)} to ${exact(measure.endBeats)} beats`}
    >
      <header className="inline-melody-lane-header">
        <strong>Melody</strong>
        <span>Read-only generated line</span>
      </header>
      <div className="inline-melody-lane-rows">
        {timeline.lanes.map((lane) => {
          const laneMeasure = laneForMeasure(lane, measure);
          if (!laneMeasure) return null;
          const instrument = melodyInstrumentLabel(lane.instrumentId);
          const noteCount = laneMeasure.entries.filter((entry) => entry.kind === "note").length;
          return (
            <div
              key={lane.instrumentId}
              className="inline-melody-lane-row"
              data-testid="melody-lane-row"
              data-melody-instrument={lane.instrumentId}
              aria-label={`${instrument} Melody lane, measure ${measure.number}, ${noteCount} notes`}
            >
              <span className="inline-melody-lane-label">{instrument}</span>
              <div
                className="inline-melody-lane-track"
                data-testid="melody-lane-track"
                data-axis-start-beats={exact(measure.startBeats)}
                data-axis-end-beats={exact(measure.endBeats)}
              >
                {measure.items.map((item, itemIndex) => {
                  const entries = laneMeasure.entries.filter(
                    (entry) =>
                      compareRational(entry.startBeats, item.endBeats) < 0 &&
                      compareRational(
                        addRational(entry.startBeats, entry.durationBeats),
                        item.startBeats,
                      ) > 0,
                  );
                  return (
                    <span
                      key={
                        item.kind === "gap"
                          ? `gap-${itemIndex}`
                          : `${item.stepId}-${item.fragmentIndex}`
                      }
                      className="inline-melody-lane-column"
                      style={segmentStyle(item.durationBeats)}
                      data-step-id={item.kind === "step" ? item.stepId : undefined}
                      data-start-beats={exact(item.startBeats)}
                      data-duration-beats={exact(item.durationBeats)}
                    >
                      {entries.map((entry) => {
                        const entryStyle = entryPositionInItem(entry, item);
                        if (entry.kind === "rest") {
                          return (
                            <span
                              key={entry.key}
                              className={`inline-melody-lane-rest${entry.sourceKind === "virtual-gap" ? " is-gap" : ""}`}
                              style={entryStyle}
                              data-melody-fragment-key={entry.key}
                              data-start-beats={exact(entry.startBeats)}
                              data-duration-beats={exact(entry.durationBeats)}
                              aria-hidden="true"
                            />
                          );
                        }

                        const pitch = formatPitch(entry);
                        const primaryRole = roleLabel(entry);
                        const targetNext = entry.harmonicRole.targetNext;
                        const sourceChord = sourceChordLabel(project, entry.sourceStepId);
                        const fragment = entryFragmentInItem(entry, item);
                        const label = `Melody ${instrument}, pitch ${pitch}, primary role ${primaryRole}, target-next: ${targetNext ? "yes" : "no"}, onset ${exact(fragment.startBeats)} beats, duration ${exact(fragment.durationBeats)} beats, source chord ${sourceChord}${fragment.startsHere ? "" : ", continuation"}`;
                        const selected = selectedStepId === entry.sourceStepId;
                        const active = activeMelodyEventKey === entry.eventKey;
                        return (
                          <button
                            key={entry.key}
                            type="button"
                            className={`inline-melody-lane-note ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${fragment.startsHere ? "" : "is-continuation"} role-${entry.harmonicRole.primary} ${targetNext ? "is-target-next" : ""}`.trim()}
                            style={entryStyle}
                            data-testid="melody-lane-note"
                            data-melody-event-key={entry.eventKey}
                            data-melody-fragment-key={entry.key}
                            data-step-id={entry.sourceStepId}
                            data-source-step-id={entry.sourceStepId}
                            data-harmonic-role={entry.harmonicRole.primary}
                            data-target-next={targetNext ? "true" : "false"}
                            data-start-beats={exact(fragment.startBeats)}
                            data-duration-beats={exact(fragment.durationBeats)}
                            aria-label={label}
                            aria-pressed={selected}
                            aria-current={active ? "step" : undefined}
                            title={label}
                            onClick={() => onSelectStep(entry.sourceStepId)}
                            onDoubleClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onSelectStep(entry.sourceStepId);
                              onOpenMelodyEditor?.(entry.sourceStepId, event.currentTarget);
                            }}
                          >
                            <span className="inline-melody-lane-note-pitch">{pitch}</span>
                            <span className="inline-melody-lane-note-role">{primaryRole}</span>
                            {targetNext ? (
                              <span className="inline-melody-lane-note-target">→ next</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
