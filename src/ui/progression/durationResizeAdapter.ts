import type { Project } from "../../domain/project/project";
import type { ProgressionStep } from "../../domain/progression/step";
import {
  musicalDuration,
  formatMusicalDuration,
  type MusicalDuration,
} from "../../domain/timing/duration";
import { createProgressionMeasureLayout } from "../../domain/timing/measureLayout";
import { createProgressionTimeline } from "../../domain/timing/timeline";
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  rationalToNumber,
  subtractRational,
  type Rational,
} from "../../domain/timing/rational";
import { DURATION_PRESETS } from "../timing/stepDuration";

const MAX_MATERIALIZED_CANDIDATES = 1_000_000;

export interface DurationResizeSnapshot {
  readonly project: Project;
  readonly stepId: string;
  readonly stepIndex: number;
  readonly stepStartBeats: Rational;
  readonly originalDuration: MusicalDuration;
  readonly editableEnd: Rational;
  readonly candidates: readonly Rational[];
}

export interface DurationResizePreview {
  readonly endpoint: Rational;
  readonly duration: Rational;
  readonly clamp: "lower" | "upper" | null;
  readonly announcement: string;
}

export interface DurationResizeScreenGeometry {
  readonly measureStartBeats: Rational;
  readonly barLengthBeats: Rational;
  readonly viewportLeftPx: number;
  /** Unscaled layout width (`clientWidth`) of the scroll viewport. */
  readonly viewportWidthPx: number;
  /** Screen-space width (`getBoundingClientRect().width`) of the viewport. */
  readonly screenWidthPx: number;
  /** Unscaled scrollable content width (`scrollWidth`). */
  readonly contentWidthPx: number;
  readonly scrollLeftPx?: number;
}

export interface DurationResizeEndpointCandidateInput {
  readonly stepStartBeats: Rational;
  readonly editableEnd: Rational;
  readonly barLengthBeats: Rational;
  readonly stepBoundaries?: readonly Rational[];
  readonly durationValues?: readonly Rational[];
}

function lcm(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) [left, right] = [right, left % right];
  return Math.abs((a / (left || 1)) * b) || 1;
}

function compareRationalTuple(left: Rational, right: Rational): number {
  const comparison = compareRational(left, right);
  if (comparison !== 0) return comparison;
  if (left.numerator !== right.numerator) return left.numerator - right.numerator;
  return left.denominator - right.denominator;
}

function addUnique(map: Map<string, Rational>, value: Rational): void {
  map.set(`${value.numerator}/${value.denominator}`, value);
}

function multiplyByInteger(value: Rational, factor: number): Rational {
  return rational(value.numerator * factor, value.denominator);
}

function floorRatio(value: Rational, divisor: Rational): number {
  if (compareRational(value, rational(0)) < 0 || compareRational(divisor, rational(0)) <= 0) {
    return 0;
  }
  return Math.floor(
    (value.numerator * divisor.denominator) / (value.denominator * divisor.numerator),
  );
}

/**
 * Builds the one T198 candidate set used by pointer and keyboard resize.
 * All returned values are normalized Rationals on the absolute timeline.
 */
export function buildDurationResizeEndpointCandidates({
  stepStartBeats,
  editableEnd,
  barLengthBeats,
  stepBoundaries = [],
  durationValues = DURATION_PRESETS.map((preset) => preset.beats),
}: DurationResizeEndpointCandidateInput): readonly Rational[] {
  if (compareRational(editableEnd, stepStartBeats) <= 0) {
    throw new RangeError("duration resize needs a finite positive endpoint horizon");
  }
  if (compareRational(barLengthBeats, rational(0)) <= 0) {
    throw new RangeError("duration resize needs a positive bar length");
  }

  const latticeDenominator = [
    24,
    barLengthBeats.denominator,
    ...DURATION_PRESETS.map((preset) => preset.beats.denominator),
  ].reduce(lcm, 1);
  const quantum = rational(1, latticeDenominator);
  const span = subtractRational(editableEnd, stepStartBeats);
  const latticeCount = floorRatio(span, quantum);
  const barCount = floorRatio(editableEnd, barLengthBeats);
  if (latticeCount + barCount > MAX_MATERIALIZED_CANDIDATES) {
    throw new RangeError(
      `duration resize endpoint lattice exceeds ${MAX_MATERIALIZED_CANDIDATES} candidates`,
    );
  }

  const candidates = new Map<string, Rational>();
  const addIfInRange = (endpoint: Rational) => {
    if (
      compareRational(endpoint, stepStartBeats) > 0 &&
      compareRational(endpoint, editableEnd) <= 0
    ) {
      addUnique(candidates, endpoint);
    }
  };

  for (let index = 1; index <= latticeCount; index += 1) {
    addIfInRange(addRational(stepStartBeats, rational(index, latticeDenominator)));
  }
  for (const boundary of stepBoundaries) addIfInRange(boundary);
  for (let index = 1; index <= barCount; index += 1) {
    addIfInRange(multiplyByInteger(barLengthBeats, index));
  }
  for (const duration of durationValues) addIfInRange(addRational(stepStartBeats, duration));
  addIfInRange(editableEnd);

  return Object.freeze([...candidates.values()].sort(compareRationalTuple));
}

function nearestTie(rawEndpointBeats: number, selected: Rational, candidate: Rational): boolean {
  const selectedDistance = Math.abs(rawEndpointBeats - rationalToNumber(selected));
  const candidateDistance = Math.abs(rawEndpointBeats - rationalToNumber(candidate));
  return (
    Math.abs(candidateDistance - selectedDistance) <=
    Number.EPSILON * Math.max(1, Math.abs(rawEndpointBeats), selectedDistance, candidateDistance)
  );
}

export function snapDurationResizeEndpoint(
  rawEndpointBeats: number,
  snapshot: Pick<DurationResizeSnapshot, "stepStartBeats" | "editableEnd" | "candidates">,
): DurationResizePreview {
  if (!Number.isFinite(rawEndpointBeats)) {
    throw new RangeError("resize endpoint must be finite");
  }
  const first = snapshot.candidates[0];
  if (!first) throw new RangeError("duration resize has no positive endpoint candidates");

  let selected = first;
  for (const candidate of snapshot.candidates.slice(1)) {
    const candidateDistance = Math.abs(rawEndpointBeats - rationalToNumber(candidate));
    const selectedDistance = Math.abs(rawEndpointBeats - rationalToNumber(selected));
    if (
      candidateDistance < selectedDistance &&
      !nearestTie(rawEndpointBeats, selected, candidate)
    ) {
      selected = candidate;
    } else if (
      nearestTie(rawEndpointBeats, selected, candidate) &&
      compareRational(candidate, selected) < 0
    ) {
      selected = candidate;
    }
  }

  const clamp =
    rawEndpointBeats < rationalToNumber(first)
      ? "lower"
      : rawEndpointBeats > rationalToNumber(snapshot.editableEnd)
        ? "upper"
        : null;
  return makeDurationResizePreview(selected, snapshot.stepStartBeats, clamp);
}

export function moveDurationResizeEndpoint(
  snapshot: Pick<DurationResizeSnapshot, "stepStartBeats" | "candidates">,
  currentEndpoint: Rational,
  direction: "left" | "right",
): DurationResizePreview {
  const index = snapshot.candidates.findIndex(
    (candidate) => compareRational(candidate, currentEndpoint) === 0,
  );
  if (index < 0) throw new RangeError("current resize endpoint is not in the candidate set");
  const nextIndex = Math.max(
    0,
    Math.min(snapshot.candidates.length - 1, index + (direction === "right" ? 1 : -1)),
  );
  return makeDurationResizePreview(snapshot.candidates[nextIndex]!, snapshot.stepStartBeats, null);
}

function makeDurationResizePreview(
  endpoint: Rational,
  stepStartBeats: Rational,
  clamp: "lower" | "upper" | null,
): DurationResizePreview {
  const duration = subtractRational(endpoint, stepStartBeats);
  if (compareRational(duration, rational(0)) <= 0) {
    throw new RangeError("duration resize must preserve a positive duration");
  }
  const formatted = formatMusicalDuration(musicalDuration(duration));
  const announcement =
    clamp === "lower"
      ? `Preview: duration ${formatted} beats; lower clamp, shortest valid duration.`
      : clamp === "upper"
        ? `Preview: duration ${formatted} beats; upper clamp at the finite timeline horizon.`
        : `Preview: duration ${formatted} beats.`;
  return Object.freeze({ endpoint, duration, clamp, announcement });
}

export function createDurationResizeSnapshot(
  project: Project,
  stepId: string,
): DurationResizeSnapshot {
  const stepIndex = project.progression.steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) throw new RangeError(`Unknown progression step: ${stepId}`);
  const timeline = createProgressionTimeline(project.progression.steps, project.globalTiming.meter);
  const entry = timeline.steps.find((candidate) => candidate.step.id === stepId);
  if (!entry) throw new RangeError(`Unknown progression timeline step: ${stepId}`);
  const layout = createProgressionMeasureLayout(
    project.progression.steps,
    project.globalTiming.meter,
  );
  const fourBars = multiplyRational(layout.barLengthBeats, rational(4));
  const minimumHorizon = addRational(entry.startBeats, fourBars);
  let editableEnd =
    compareRational(layout.playbackDurationBeats, minimumHorizon) >= 0
      ? layout.playbackDurationBeats
      : minimumHorizon;
  const step = project.progression.steps[stepIndex]!;
  if (step.kind === "chord") {
    const minimumNeighbor = rational(1, 24);
    const originalEnd = addRational(entry.startBeats, step.duration.beats);
    const next = project.progression.steps[stepIndex + 1];
    const nextTimelineEntry = next
      ? timeline.steps.find((candidate) => candidate.step.id === next.id)
      : undefined;
    const measureIndex = Math.floor(
      (entry.startBeats.numerator * layout.barLengthBeats.denominator) /
        (entry.startBeats.denominator * layout.barLengthBeats.numerator),
    );
    const measureEnd = multiplyRational(layout.barLengthBeats, rational(measureIndex + 1));
    let chordEndLimit = originalEnd;
    if (next?.kind === "chord" && nextTimelineEntry) {
      const nextStart = nextTimelineEntry.startBeats;
      const nextMeasure = Math.floor(
        (nextStart.numerator * layout.barLengthBeats.denominator) /
          (nextStart.denominator * layout.barLengthBeats.numerator),
      );
      if (nextMeasure === measureIndex) {
        const pairEnd = addRational(nextStart, next.duration.beats);
        const pairLimit = subtractRational(pairEnd, minimumNeighbor);
        const measureLimit = subtractRational(measureEnd, minimumNeighbor);
        chordEndLimit = compareRational(pairLimit, measureLimit) < 0 ? pairLimit : measureLimit;
      }
    } else if (next?.kind === "rest" && nextTimelineEntry) {
      chordEndLimit = subtractRational(
        addRational(nextTimelineEntry.startBeats, next.duration.beats),
        minimumNeighbor,
      );
    } else if (!next && compareRational(originalEnd, measureEnd) <= 0) {
      chordEndLimit = measureEnd;
    }
    editableEnd = compareRational(chordEndLimit, editableEnd) < 0 ? chordEndLimit : editableEnd;
    if (compareRational(editableEnd, originalEnd) < 0) editableEnd = originalEnd;
  }
  const stepBoundaries = timeline.steps.flatMap((timelineStep) => [
    timelineStep.startBeats,
    timelineStep.endBeats,
  ]);
  const candidates = buildDurationResizeEndpointCandidates({
    stepStartBeats: entry.startBeats,
    editableEnd,
    barLengthBeats: layout.barLengthBeats,
    stepBoundaries,
    durationValues: [
      ...project.progression.steps.map((step) => step.duration.beats),
      ...DURATION_PRESETS.map((preset) => preset.beats),
    ],
  });
  return Object.freeze({
    project,
    stepId,
    stepIndex,
    stepStartBeats: entry.startBeats,
    originalDuration: project.progression.steps[stepIndex]!.duration,
    editableEnd,
    candidates,
  });
}

export function isDurationResizeSnapshotCurrent(
  project: Project,
  snapshot: DurationResizeSnapshot,
): boolean {
  return project === snapshot.project;
}

export function screenXToAbsoluteResizeEndpoint(
  clientX: number,
  geometry: DurationResizeScreenGeometry,
): number {
  if (!Number.isFinite(clientX)) throw new RangeError("pointer x must be finite");
  if (
    !Number.isFinite(geometry.viewportLeftPx) ||
    !Number.isFinite(geometry.viewportWidthPx) ||
    !Number.isFinite(geometry.screenWidthPx) ||
    !Number.isFinite(geometry.contentWidthPx) ||
    geometry.viewportWidthPx <= 0 ||
    geometry.screenWidthPx <= 0 ||
    geometry.contentWidthPx <= 0
  ) {
    throw new RangeError("resize geometry must have finite positive widths");
  }
  const scrollLeftPx = geometry.scrollLeftPx ?? 0;
  if (!Number.isFinite(scrollLeftPx) || scrollLeftPx < 0) {
    throw new RangeError("resize geometry scroll offset must be finite and non-negative");
  }
  const screenScale = geometry.screenWidthPx / geometry.viewportWidthPx;
  const localContentPx = (clientX - geometry.viewportLeftPx) / screenScale + scrollLeftPx;
  return (
    rationalToNumber(geometry.measureStartBeats) +
    rationalToNumber(geometry.barLengthBeats) * (localContentPx / geometry.contentWidthPx)
  );
}

export function durationForResizeEndpoint(
  snapshot: Pick<DurationResizeSnapshot, "stepStartBeats">,
  endpoint: Rational,
): MusicalDuration {
  return musicalDuration(subtractRational(endpoint, snapshot.stepStartBeats));
}

export function stepLabelForDurationResize(step: ProgressionStep, stepNumber: number): string {
  return step.kind === "rest" ? `Rest step ${stepNumber}` : `Step ${stepNumber}`;
}
