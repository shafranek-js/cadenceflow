import { describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  addMatrixPreview,
  createMatrixChordStep,
  type AddMatrixPreviewCommand,
} from "../../src/app/commands/matrixCommands";
import {
  patchMatrixTemplate,
  type PatchMatrixTemplateCommand,
} from "../../src/app/commands/matrixTemplateCommands";
import {
  setGlobalCardView,
  type SetGlobalCardViewCommand,
} from "../../src/app/commands/matrixViewCommands";
import { createDefaultProject } from "../../src/domain/project/factory";
import { recommendationVocabulary } from "../../src/domain/harmony/moduleRegistry";
import { recommend, type RecommendationContext } from "../../src/domain/recommendations/engine";
import type { Project } from "../../src/domain/project/project";

const PLAN_TARGET_MS = 100;
const WARMUP_SAMPLES = 20;
const MEASURED_SAMPLES = 30;
const OPERATIONS_PER_SAMPLE = 200;

interface BenchmarkReport {
  readonly name: string;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly targetMs: number;
  readonly targetMet: boolean;
  readonly samples: number;
}

function percentile(values: readonly number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function benchmark(name: string, operation: () => unknown): BenchmarkReport {
  for (let sample = 0; sample < WARMUP_SAMPLES; sample++) {
    for (let operationIndex = 0; operationIndex < OPERATIONS_PER_SAMPLE; operationIndex++) {
      operation();
    }
  }

  const perOperationMilliseconds: number[] = [];
  let guard = 0;
  for (let sample = 0; sample < MEASURED_SAMPLES; sample++) {
    const startedAt = globalThis.performance.now();
    for (let operationIndex = 0; operationIndex < OPERATIONS_PER_SAMPLE; operationIndex++) {
      if (operation() === undefined) guard++;
    }
    perOperationMilliseconds.push(
      (globalThis.performance.now() - startedAt) / OPERATIONS_PER_SAMPLE,
    );
  }

  if (guard === Number.MAX_SAFE_INTEGER) {
    throw new Error("unreachable benchmark guard");
  }

  const report = {
    name,
    p50Ms: percentile(perOperationMilliseconds, 0.5),
    p95Ms: percentile(perOperationMilliseconds, 0.95),
    maxMs: Math.max(...perOperationMilliseconds),
    targetMs: PLAN_TARGET_MS,
    targetMet: percentile(perOperationMilliseconds, 0.95) < PLAN_TARGET_MS,
    samples: perOperationMilliseconds.length,
  } satisfies BenchmarkReport;
  console.log(
    `[T151] ${report.name}: p50=${report.p50Ms.toFixed(3)}ms ` +
      `p95=${report.p95Ms.toFixed(3)}ms max=${report.maxMs.toFixed(3)}ms ` +
      `target<${report.targetMs}ms ${report.targetMet ? "met" : "not met"}`,
  );
  return report;
}

function projectWithExpectedProgressionSize(): Project {
  const project = createDefaultProject(
    "t151-performance",
    "T151 performance fixture",
    "2026-09-13T10:00:00.000Z",
  );
  const functionIds = ["I", "ii", "V", "vi"] as const;
  const steps = Array.from({ length: 96 }, (_, index) =>
    createMatrixChordStep(project, functionIds[index % functionIds.length]!, `existing-${index}`),
  );
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
  });
}

describe("T151 — deterministic recommendation and Matrix performance benchmarks", () => {
  it("reports repeatable distributions with setup excluded from measured work", () => {
    const project = projectWithExpectedProgressionSize();
    const visibleFunctionIds = Object.freeze(
      recommendationVocabulary("progressions").map((candidate) => candidate.functionId),
    );
    const recommendationContext: RecommendationContext = Object.freeze({
      moduleId: "progressions",
      currentFunctionId: "I",
      recentFunctionIds: Object.freeze(["IV", "V"]),
      visibleFunctionIds,
      variantEvidence: Object.freeze({ V: 3, vi: 2 }),
      compositionIntent: "resolve",
    });
    const expectedRecommendation = recommend(recommendationContext);
    const addCommand: AddMatrixPreviewCommand = {
      type: "matrix/add-preview",
      payload: {
        functionId: "V",
        stepId: "benchmark-add",
        nowIso: "2026-09-13T10:00:01.000Z",
      },
    };
    const templateCommand: PatchMatrixTemplateCommand = {
      type: "matrix-template/patch",
      payload: {
        functionId: "V",
        performanceOverrides: { articulation: "arp-up", masterVelocity: 91 },
        nowIso: "2026-09-13T10:00:01.000Z",
      },
    };
    const viewCommand: SetGlobalCardViewCommand = {
      type: "matrix/set-global-card-view",
      payload: { view: "piano", nowIso: "2026-09-13T10:00:01.000Z" },
    };
    const matrixSession = new AppStore(project);

    expect(recommend(recommendationContext)).toEqual(expectedRecommendation);
    expect(addMatrixPreview(project, addCommand).project.progression.steps).toHaveLength(97);
    expect(
      patchMatrixTemplate(project, templateCommand).project.moduleTemplateStates.progressions,
    ).toBeDefined();
    expect(setGlobalCardView(project, viewCommand).project.presentation.globalMatrixCardView).toBe(
      "piano",
    );

    const reports = [
      benchmark("recommendation refresh", () => recommend(recommendationContext)),
      benchmark("Matrix preview selection", () => {
        matrixSession.selectMatrixPreview("V");
        return matrixSession.matrixSession.previewFunctionId;
      }),
      benchmark("Matrix add-preview action", () => addMatrixPreview(project, addCommand).project),
      benchmark(
        "Matrix template patch action",
        () => patchMatrixTemplate(project, templateCommand).project,
      ),
      benchmark(
        "Matrix global card-view action",
        () => setGlobalCardView(project, viewCommand).project,
      ),
    ];

    expect(reports).toHaveLength(5);
    for (const report of reports) {
      expect(report.samples).toBe(MEASURED_SAMPLES);
      expect(report.targetMs).toBe(PLAN_TARGET_MS);
      expect(Number.isFinite(report.p50Ms)).toBe(true);
      expect(Number.isFinite(report.p95Ms)).toBe(true);
      expect(Number.isFinite(report.maxMs)).toBe(true);
      expect(report.p50Ms).toBeGreaterThanOrEqual(0);
      expect(report.p95Ms).toBeGreaterThanOrEqual(report.p50Ms);
      expect(report.maxMs).toBeGreaterThanOrEqual(report.p95Ms);
      expect(report.targetMet, `${report.name} p95 must stay below ${report.targetMs} ms`).toBe(
        true,
      );
      expect(report.p95Ms).toBeLessThan(report.targetMs);
    }
  });
});
