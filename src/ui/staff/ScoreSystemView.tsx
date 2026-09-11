import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { ExactPitch } from "../../domain/harmony/pitch";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type { Project } from "../../domain/project/project";
import { formatMusicalDuration, musicalDuration } from "../../domain/timing/duration";
import type {
  ProgressionMeasure,
  ProgressionMeasureLayout,
} from "../../domain/timing/measureLayout";
import { rationalToNumber, subtractRational } from "../../domain/timing/rational";
import {
  projectScoreSystems,
  type ScoreSystem,
  type ScoreSystemAttack,
} from "../../notation/scoreSystemProjection";
import { projectPitchesToStaff } from "../../notation/staffProjection";
import {
  renderStaffSystem,
  type StaffSequenceEntry,
  type StaffSystemMeasureInput,
  type StaffSystemPosition,
} from "../../notation/vexflowAdapter";
import type {
  MelodyStaffEntry,
  MelodyStaffMeasure,
  MelodyTimeline,
} from "../../notation/melodyStaffProjection";
import { Icon } from "../common/Icon";
import type { MelodyMenuPosition } from "../melody/MelodyContextMenu";
import type { MeasureStaffItem } from "./MeasureStaffView";
import { canShiftPerformanceOctave, type StaffOctaveDirection } from "./staffOctave";

const DEFAULT_SCORE_WIDTH_PX = 960;
const SCORE_STAFF_HEIGHT_PX = 160;
const SCORE_STAFF_GAP_PX = 18;
const MELODY_NOTE_ANNOTATION_ROW_GAP_PX = 31;
const MELODY_NOTE_ANNOTATION_MIN_GAP_PX = 36;

function formatPitch(pitch: ExactPitch): string {
  return `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`;
}

function exact(value: { readonly numerator: number; readonly denominator: number }): string {
  return `${value.numerator}/${value.denominator}`;
}

function positionKey(staff: StaffSystemPosition["staff"], key: string): string {
  return `${staff}:${key}`;
}

function positionRecord(
  positions: readonly StaffSystemPosition[],
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(
      positions.map((position) => [positionKey(position.staff, position.key), position.ratio]),
    ),
  );
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

function harmonySequenceEntry(
  item: MeasureStaffItem,
  playingStepId: string | undefined,
): StaffSequenceEntry {
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
  return {
    key: item.key,
    kind: "chord",
    projection: projectPitchesToStaff(item.pitches),
    ...(item.bassPitch ? { bassProjection: projectPitchesToStaff([item.bassPitch]) } : {}),
    duration: item.duration,
    startOffsetBeats: item.startOffsetBeats,
    continuesFromPrevious: item.continuesFromPrevious,
    continuesToNext: item.continuesToNext,
    ...(item.stepId === playingStepId ? { highlighted: true } : {}),
  };
}

function melodySequenceEntry(
  entry: MelodyStaffEntry,
  activeMelodyEventKey: string | null | undefined,
): StaffSequenceEntry {
  if (entry.kind === "rest") {
    return {
      key: entry.key,
      kind: "rest",
      duration: musicalDuration(entry.durationBeats),
      startOffsetBeats: entry.startOffsetBeats,
    };
  }
  return {
    key: entry.key,
    kind: "note",
    projection: projectPitchesToStaff([entry.pitch]),
    duration: musicalDuration(entry.durationBeats),
    startOffsetBeats: entry.startOffsetBeats,
    continuesFromPrevious: entry.continuesFromPrevious,
    continuesToNext: entry.continuesToNext,
    ...(entry.eventKey === activeMelodyEventKey ? { highlighted: true } : {}),
  };
}

function scoreSystemHeight(hasMelody: boolean, showBass: boolean): number {
  const rows = Number(hasMelody) + 1 + Number(showBass);
  return rows * SCORE_STAFF_HEIGHT_PX + Math.max(0, rows - 1) * SCORE_STAFF_GAP_PX;
}

function systemMeasureRatio(
  system: ScoreSystem,
  displayWidthPx: number,
  measureIndex: number,
  startOffsetBeats: { readonly numerator: number; readonly denominator: number },
  barLengthBeats: number,
  showBass: boolean,
): number {
  const connectorInset = showBass ? 14 : 0;
  const systemWidth = Math.max(displayWidthPx, 1);
  const scale = Math.max(systemWidth - connectorInset, 1) / Math.max(system.requiredWidthPx, 1);
  const measurePosition = system.measures.findIndex(
    (measure) => measure.measureIndex === measureIndex,
  );
  if (measurePosition < 0) return 0;
  const measureStart = system.measures
    .slice(0, measurePosition)
    .reduce((sum, measure) => sum + measure.requiredWidthPx, 0);
  const measure = system.measures[measurePosition]!;
  return (
    (connectorInset +
      measureStart * scale +
      Math.min(Math.max(rationalToNumber(startOffsetBeats) / barLengthBeats, 0), 1) *
        measure.requiredWidthPx *
        scale) /
    systemWidth
  );
}

function systemMeasureSpan(
  system: ScoreSystem,
  displayWidthPx: number,
  measureIndex: number,
  durationRatio: number,
  showBass: boolean,
): number {
  const measure = system.measures.find((candidate) => candidate.measureIndex === measureIndex);
  const connectorInset = showBass ? 14 : 0;
  const scale = Math.max(displayWidthPx - connectorInset, 1) / Math.max(system.requiredWidthPx, 1);
  return (((measure?.requiredWidthPx ?? 0) * scale) / Math.max(displayWidthPx, 1)) * durationRatio;
}

function melodyEventRatio(
  system: ScoreSystem,
  displayWidthPx: number,
  projectedMeasure: ScoreSystem["measures"][number],
  entry: MelodyStaffEntry,
  renderedPositions: Readonly<Record<string, number>>,
  barLengthBeats: number,
  showBass: boolean,
): number {
  return (
    renderedPositions[positionKey("melody", entry.key)] ??
    systemMeasureRatio(
      system,
      displayWidthPx,
      projectedMeasure.measureIndex,
      entry.startOffsetBeats,
      barLengthBeats,
      showBass,
    )
  );
}

function melodyAnnotationRows(
  system: ScoreSystem,
  melodyTimeline: MelodyTimeline | null,
  displayWidthPx: number,
  renderedPositions: Readonly<Record<string, number>>,
  barLengthBeats: number,
  showBass: boolean,
): Readonly<Record<string, number>> {
  if (!melodyTimeline) return {};
  const lastXByRow: number[] = [];
  const rows: Record<string, number> = {};
  system.measures.forEach((projectedMeasure) => {
    const measure = melodyTimeline.measures[projectedMeasure.measureIndex];
    measure?.entries.forEach((entry) => {
      if (entry.kind !== "note") return;
      const xRatio = melodyEventRatio(
        system,
        displayWidthPx,
        projectedMeasure,
        entry,
        renderedPositions,
        barLengthBeats,
        showBass,
      );
      const x = Math.min(Math.max(xRatio, 0), 1) * displayWidthPx;
      let row = lastXByRow.findIndex((lastX) => x - lastX >= MELODY_NOTE_ANNOTATION_MIN_GAP_PX);
      if (row < 0) {
        row = lastXByRow.length;
        lastXByRow.push(x);
      } else {
        lastXByRow[row] = x;
      }
      rows[`${projectedMeasure.measureIndex}-${entry.key}`] = row;
    });
  });
  return Object.freeze(rows);
}

interface ScoreSystemCanvasProps {
  readonly project: Project;
  readonly layout: ProgressionMeasureLayout;
  readonly system: ScoreSystem;
  readonly displayWidthPx: number;
  readonly melodyTimeline: MelodyTimeline | null;
  readonly measureItems: Readonly<Record<number, readonly MeasureStaffItem[]>>;
  readonly selectedStepId: string | undefined;
  readonly playingStepId: string | undefined;
  readonly activeMelodyEventKey: string | null | undefined;
  readonly onSelectStep: (stepId: string) => void;
  readonly onOctaveChange: (stepId: string, direction: StaffOctaveDirection) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: MelodyMenuPosition,
  ) => void;
}

function ScoreSystemCanvas({
  project,
  layout,
  system,
  displayWidthPx,
  melodyTimeline,
  measureItems,
  selectedStepId,
  playingStepId,
  activeMelodyEventKey,
  onSelectStep,
  onOctaveChange,
  onOpenMelodyMenu,
}: ScoreSystemCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [renderedPositions, setRenderedPositions] = useState<Readonly<Record<string, number>>>({});
  const hasMelody = melodyTimeline !== null;
  const showBass = project.presentation.showBassInStaff;
  const inputs = useMemo<readonly StaffSystemMeasureInput[]>(
    () =>
      system.measures.map((measure) => {
        const harmonyEntries = (measureItems[measure.measureIndex] ?? []).map((item) =>
          harmonySequenceEntry(item, playingStepId),
        );
        const melodyMeasure = melodyTimeline?.measures[measure.measureIndex];
        return {
          measureIndex: measure.measureIndex,
          widthPx: measure.requiredWidthPx,
          harmonyEntries,
          ...(melodyMeasure
            ? {
                melodyEntries: melodyMeasure.entries.map((entry) =>
                  melodySequenceEntry(entry, activeMelodyEventKey),
                ),
              }
            : {}),
        };
      }),
    [activeMelodyEventKey, measureItems, melodyTimeline, playingStepId, system.measures],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cleanup: () => void = () => undefined;
    cleanup = renderStaffSystem(
      canvas,
      inputs,
      project.globalTiming.meter,
      (positions) => {
        const next = positionRecord(positions);
        setRenderedPositions((current) =>
          JSON.stringify(current) === JSON.stringify(next) ? current : next,
        );
      },
      {
        widthPx: displayWidthPx,
        showBass,
        showTimeSignature: system.index === 0,
        ...(melodyTimeline ? { melodyClef: melodyTimeline.clef } : {}),
      },
    );
    return () => {
      cleanup();
    };
  }, [
    inputs,
    melodyTimeline?.clef,
    project.globalTiming.meter,
    showBass,
    system.index,
    displayWidthPx,
  ]);

  const barLengthBeats = rationalToNumber(layout.barLengthBeats);
  const systemHeight = scoreSystemHeight(hasMelody, showBass);
  const melodyRows = melodyAnnotationRows(
    system,
    melodyTimeline,
    displayWidthPx,
    renderedPositions,
    barLengthBeats,
    showBass,
  );
  const harmonyAnnotations = system.measures.flatMap((projectedMeasure) =>
    (measureItems[projectedMeasure.measureIndex] ?? [])
      .filter((item): item is Exclude<MeasureStaffItem, { kind: "gap" }> => item.kind !== "gap")
      .map((item) => ({ projectedMeasure, item })),
  );

  return (
    <div
      className="progression-measure-score score-system-card"
      data-testid="progression-measure-score"
    >
      <section
        className="score-system"
        data-testid="progression-score-system"
        data-system-index={system.index}
        data-measure-count={system.measures.length}
        data-horizontally-scrollable={system.horizontallyScrollable ? "true" : undefined}
        aria-label={`Score system ${system.index + 1}, measures ${system.measures[0]?.measure.number} through ${system.measures.at(-1)?.measure.number}`}
      >
        <header className="score-system-header">
          <strong>{`System ${system.index + 1}`}</strong>
          <span>{`${system.measures.length} measure${system.measures.length === 1 ? "" : "s"}`}</span>
          {system.horizontallyScrollable ? <span>Dense measure scrolls locally</span> : null}
        </header>
        <div
          className="score-system-scroll"
          style={{
            maxWidth: "100%",
            overflowX: system.horizontallyScrollable ? "auto" : "hidden",
            overflowY: "hidden",
          }}
        >
          <div
            className="score-system-paper"
            style={{
              position: "relative",
              width: `${displayWidthPx}px`,
              minWidth: `${displayWidthPx}px`,
              height: `${systemHeight}px`,
            }}
          >
            <div
              ref={canvasRef}
              className="measure-staff score-system-canvas"
              role="img"
              aria-label={`Score notation for measures ${system.measures[0]?.measure.number} through ${system.measures.at(-1)?.measure.number}`}
              style={{
                position: "absolute",
                inset: 0,
                width: `${displayWidthPx}px`,
                minWidth: `${displayWidthPx}px`,
                height: `${systemHeight}px`,
              }}
            />
            <div
              className="score-system-annotations"
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              {harmonyAnnotations.map(({ projectedMeasure, item }) => {
                const xRatio =
                  renderedPositions[positionKey("harmony", item.key)] ??
                  systemMeasureRatio(
                    system,
                    displayWidthPx,
                    projectedMeasure.measureIndex,
                    item.startOffsetBeats,
                    barLengthBeats,
                    showBass,
                  );
                const durationRatio = rationalToNumber(item.duration.beats) / barLengthBeats;
                const selected = selectedStepId === item.stepId;
                const playing = playingStepId === item.stepId;
                const chord = item.kind === "chord" ? item : null;
                const displayPitches = chord
                  ? chord.bassPitch
                    ? [chord.bassPitch, ...chord.pitches]
                    : chord.pitches
                  : [];
                const notes = displayPitches.map(formatPitch).join(" ");
                const label =
                  item.kind === "rest"
                    ? `Rest: ${formatMusicalDuration(item.duration)} beats`
                    : `${item.label}: ${notes}; ${formatMusicalDuration(item.duration)} beats${item.startsHere ? "" : "; continuation"}`;
                const harmonyRowTop = hasMelody ? SCORE_STAFF_HEIGHT_PX + SCORE_STAFF_GAP_PX : 0;
                const style = {
                  "--measure-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
                  "--measure-staff-event-span": `${systemMeasureSpan(system, displayWidthPx, projectedMeasure.measureIndex, Math.max(durationRatio, 0), showBass) * 100}%`,
                  top: `${harmonyRowTop + 3}px`,
                  bottom: "auto",
                  height: `${SCORE_STAFF_HEIGHT_PX - 6}px`,
                } as CSSProperties;
                return (
                  <div
                    key={`${projectedMeasure.measureIndex}-${item.key}`}
                    className={`measure-staff-event ${selected ? "is-selected" : ""} ${playing ? "is-playing" : ""} ${item.kind === "rest" ? "is-rest" : ""} ${chord && !chord.startsHere ? "is-continuation" : ""}`}
                    style={style}
                    data-staff-item-key={item.key}
                  >
                    <div className="measure-staff-event-top">
                      {selected && chord ? (
                        <button
                          type="button"
                          className="measure-staff-octave-button"
                          aria-label={`Raise ${chord.label} one octave`}
                          title="Raise chord one octave"
                          disabled={!chord.canShiftUp}
                          onClick={(event) => {
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
                        title={label}
                        aria-label={`Select ${label}`}
                        aria-pressed={selected}
                        aria-current={playing ? "step" : undefined}
                        aria-haspopup={chord && onOpenMelodyMenu ? "menu" : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectStep(item.stepId);
                        }}
                        onContextMenu={(event: MouseEvent<HTMLButtonElement>) => {
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
                            (event.key !== "ContextMenu" &&
                              !(event.key === "F10" && event.shiftKey))
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
                        {item.kind === "rest" ? "Rest" : item.startsHere ? item.label : "↪"}
                      </button>
                    </div>
                    {selected && chord ? (
                      <button
                        type="button"
                        className="measure-staff-octave-button measure-staff-octave-down"
                        aria-label={`Lower ${chord.label} one octave`}
                        title="Lower chord one octave"
                        disabled={!chord.canShiftDown}
                        onClick={(event) => {
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
              {melodyTimeline
                ? system.measures.flatMap((projectedMeasure) => {
                    const measure: MelodyStaffMeasure | undefined =
                      melodyTimeline.measures[projectedMeasure.measureIndex];
                    if (!measure) return [];
                    return measure.entries.flatMap((entry) => {
                      if (entry.kind !== "note") return [];
                      const annotationKey = `${projectedMeasure.measureIndex}-${entry.key}`;
                      const xRatio = melodyEventRatio(
                        system,
                        displayWidthPx,
                        projectedMeasure,
                        entry,
                        renderedPositions,
                        barLengthBeats,
                        showBass,
                      );
                      const selected = selectedStepId === entry.sourceStepId;
                      const active = activeMelodyEventKey === entry.eventKey;
                      const label = `Melody ${formatPitch(entry.pitch)}, onset ${exact(entry.startBeats)} beats, duration ${exact(entry.durationBeats)} beats, source chord ${sourceChordLabel(project, entry.sourceStepId)}`;
                      const style = {
                        "--melody-staff-event-x": `${Math.min(Math.max(xRatio, 0), 1) * 100}%`,
                        top: `${4 + (melodyRows[annotationKey] ?? 0) * MELODY_NOTE_ANNOTATION_ROW_GAP_PX}px`,
                      } as CSSProperties;
                      return (
                        <button
                          key={`${projectedMeasure.measureIndex}-${entry.key}`}
                          type="button"
                          className={`melody-staff-note ${selected ? "is-selected" : ""} ${active ? "is-active" : ""} ${entry.startsHere ? "" : "is-continuation"}`.trim()}
                          style={style}
                          data-melody-event-key={entry.eventKey}
                          aria-label={label}
                          aria-pressed={selected}
                          aria-current={active ? "step" : undefined}
                          title={label}
                          onClick={() => onSelectStep(entry.sourceStepId)}
                        >
                          {entry.startsHere ? formatPitch(entry.pitch) : "↪"}
                        </button>
                      );
                    });
                  })
                : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export interface ScoreSystemViewProps {
  readonly project: Project;
  readonly layout: ProgressionMeasureLayout;
  readonly melodyTimeline: MelodyTimeline | null;
  readonly measuresPerSystem: Project["presentation"]["measuresPerSystem"];
  readonly selectedStepId: string | undefined;
  readonly playingStepId: string | undefined;
  readonly activeMelodyEventKey: string | null | undefined;
  readonly measureItemsForMeasure: (measure: ProgressionMeasure) => readonly MeasureStaffItem[];
  readonly onSelectStep: (stepId: string) => void;
  readonly onOctaveChange: (stepId: string, direction: StaffOctaveDirection) => void;
  readonly onOpenMelodyMenu?: (
    stepId: string,
    anchor: HTMLElement,
    position: MelodyMenuPosition,
  ) => void;
}

/** Responsive multi-measure Staff projection used by My Progression. */
export function ScoreSystemView({
  project,
  layout,
  melodyTimeline,
  measuresPerSystem,
  selectedStepId,
  playingStepId,
  activeMelodyEventKey,
  measureItemsForMeasure,
  onSelectStep,
  onOctaveChange,
  onOpenMelodyMenu,
}: ScoreSystemViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [availableWidthPx, setAvailableWidthPx] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      const width = root.clientWidth;
      if (width > 0) setAvailableWidthPx((current) => (current === width ? current : width));
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(root);
    return () => observer?.disconnect();
  }, []);

  const measureItems = useMemo(
    () =>
      Object.freeze(
        Object.fromEntries(
          layout.measures.map((measure) => [measure.measureIndex, measureItemsForMeasure(measure)]),
        ),
      ) as Readonly<Record<number, readonly MeasureStaffItem[]>>,
    [layout.measures, measureItemsForMeasure],
  );
  const additionalAttacks = useMemo<readonly ScoreSystemAttack[]>(
    () =>
      melodyTimeline
        ? Object.freeze(
            melodyTimeline.measures.flatMap((measure) =>
              measure.entries.flatMap((entry) =>
                entry.kind === "note" && entry.startsHere
                  ? [
                      {
                        measureIndex: measure.measureIndex,
                        startOffsetBeats: entry.startOffsetBeats,
                      },
                    ]
                  : [],
              ),
            ),
          )
        : Object.freeze([]),
    [melodyTimeline],
  );
  const projection = useMemo(
    () =>
      projectScoreSystems(layout, {
        availableWidthPx: availableWidthPx || DEFAULT_SCORE_WIDTH_PX,
        measuresPerSystem,
        additionalAttacks,
      }),
    [additionalAttacks, availableWidthPx, layout, measuresPerSystem],
  );

  return (
    <div
      ref={rootRef}
      className="score-system-view"
      data-testid="progression-score-systems"
      data-system-count={projection.systems.length}
      data-measures-per-system={String(measuresPerSystem)}
      data-auto-maximum={
        measuresPerSystem === "auto" ? projection.maximumMeasuresPerSystem : undefined
      }
      aria-label={`Staff score systems; ${measuresPerSystem === "auto" ? `Auto currently allows up to ${projection.maximumMeasuresPerSystem} measures per system` : `up to ${projection.maximumMeasuresPerSystem} measures per system`}`}
      style={{ gridColumn: "1 / -1", minWidth: 0, width: "100%", maxWidth: "100%" }}
    >
      {measuresPerSystem === "auto" ? (
        <p id="progression-measures-layout-description" className="score-system-layout-description">
          Staff Auto: up to {projection.maximumMeasuresPerSystem} measures per system for the
          current meter; available width and notation density may reduce this count.
        </p>
      ) : null}
      {projection.systems.map((system) => {
        const fillsSystem =
          !system.horizontallyScrollable &&
          (system.index < projection.systems.length - 1 ||
            system.measures.length === projection.maximumMeasuresPerSystem);
        const displayWidthPx = fillsSystem
          ? Math.max(system.requiredWidthPx, projection.availableWidthPx - 2)
          : system.requiredWidthPx;
        return (
          <ScoreSystemCanvas
            key={system.index}
            project={project}
            layout={layout}
            system={system}
            displayWidthPx={displayWidthPx}
            melodyTimeline={melodyTimeline}
            measureItems={measureItems}
            selectedStepId={selectedStepId}
            playingStepId={playingStepId}
            activeMelodyEventKey={activeMelodyEventKey}
            onSelectStep={onSelectStep}
            onOctaveChange={onOctaveChange}
            {...(onOpenMelodyMenu ? { onOpenMelodyMenu } : {})}
          />
        );
      })}
    </div>
  );
}
