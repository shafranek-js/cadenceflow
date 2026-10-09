import { expect, test, type Page } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

type LayoutMetrics = {
  readonly documentScrollWidth: number;
  readonly documentClientWidth: number;
  readonly bodyScrollWidth: number;
  readonly innerWidth: number;
  readonly scrollX: number;
};

const REQUIRED_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const REQUIRED_PROGRESSION_COUNTS = [1, 4, 10, 20, 30] as const;

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Playback Transport" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await setProgressionView(page, "staff");
}

async function readLayoutMetrics(page: Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      scrollX: window.scrollX,
    };
  });
}

async function expectNoPageHorizontalScroll(page: Page): Promise<void> {
  const metrics = await readLayoutMetrics(page);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollX).toBe(0);
}

async function expectWrappedProgressionFlow(page: Page, expectedCount: number): Promise<void> {
  const evidence = await page.evaluate(() => {
    const progression = document.querySelector<HTMLElement>(
      "[data-testid='progression-score-systems']",
    );
    const events = Array.from(
      document.querySelectorAll<HTMLElement>(".measure-staff-event-select[data-step-id]"),
    );
    if (!progression) throw new Error("Staff progression is missing");

    return {
      stepIds: events.map((event) => event.dataset.stepId ?? ""),
      rects: events.map((event) => {
        const rect = event.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      progressionScrollWidth: progression.scrollWidth,
      progressionClientWidth: progression.clientWidth,
    };
  });

  expect(evidence.stepIds).toHaveLength(expectedCount);
  expect(evidence.stepIds.every(Boolean)).toBe(true);
  expect(new Set(evidence.stepIds).size).toBe(expectedCount);
  expect(evidence.progressionScrollWidth).toBeLessThanOrEqual(evidence.progressionClientWidth);
  for (const rect of evidence.rects) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  }
}

async function expectProgressionSequenceAndFit(page: Page, expectedCount: number): Promise<void> {
  const evidence = await page.evaluate(() => {
    const progression = document.querySelector<HTMLElement>(
      "[data-testid='progression-score-systems']",
    );
    const events = Array.from(
      document.querySelectorAll<HTMLElement>(".measure-staff-event-select[data-step-id]"),
    );
    if (!progression) throw new Error("Staff progression is missing");
    return {
      stepIds: events.map((event) => event.dataset.stepId ?? ""),
      rects: events.map((event) => {
        const rect = event.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      progressionScrollWidth: progression.scrollWidth,
      progressionClientWidth: progression.clientWidth,
    };
  });

  expect(evidence.stepIds).toHaveLength(expectedCount);
  expect(evidence.stepIds.every(Boolean)).toBe(true);
  expect(new Set(evidence.stepIds).size).toBe(expectedCount);
  expect(evidence.progressionScrollWidth).toBeLessThanOrEqual(evidence.progressionClientWidth);
  for (const rect of evidence.rects) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  }
}

async function readProgressionStepIds(page: Page): Promise<string[]> {
  return page
    .locator(".measure-staff-event-select[data-step-id]")
    .evaluateAll((events) => events.map((event) => (event as HTMLElement).dataset.stepId ?? ""));
}

async function expectMatrixAndInspectorAdjacent(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const matrix = document.querySelector<HTMLElement>(".studio-matrix-area");
    const inspector = document.querySelector<HTMLElement>(".studio-grid > .inspector-stack");
    if (!matrix || !inspector) throw new Error("Studio matrix or inspector area is missing");
    const matrixRect = matrix.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    return {
      matrixRight: matrixRect.right,
      inspectorLeft: inspectorRect.left,
      inspectorTop: inspectorRect.top,
      matrixTop: matrixRect.top,
    };
  });

  expect(geometry.matrixRight).toBeLessThanOrEqual(geometry.inspectorLeft);
  expect(Math.abs(geometry.matrixTop - geometry.inspectorTop)).toBeLessThan(2);
}

async function expectProgressionBelowMatrix(page: Page): Promise<void> {
  const geometry = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".studio-grid");
    const matrix = document.querySelector<HTMLElement>(".studio-matrix-area");
    const progression = document.querySelector<HTMLElement>(".studio-grid > .progression-strip");
    const inspector = document.querySelector<HTMLElement>(".studio-grid > .inspector-stack");
    if (!grid || !matrix || !progression || !inspector) {
      throw new Error("Studio grid or progression area is missing");
    }
    const gridRect = grid.getBoundingClientRect();
    const matrixRect = matrix.getBoundingClientRect();
    const progressionRect = progression.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    return {
      gridLeft: gridRect.left,
      gridRight: gridRect.right,
      matrixLeft: matrixRect.left,
      matrixRight: matrixRect.right,
      matrixBottom: matrixRect.bottom,
      progressionLeft: progressionRect.left,
      progressionRight: progressionRect.right,
      progressionTop: progressionRect.top,
      inspectorLeft: inspectorRect.left,
    };
  });

  expect(Math.abs(geometry.gridLeft - geometry.matrixLeft)).toBeLessThan(1);
  expect(Math.abs(geometry.matrixLeft - geometry.progressionLeft)).toBeLessThan(1);
  expect(Math.abs(geometry.matrixRight - geometry.progressionRight)).toBeLessThan(1);
  expect(geometry.progressionTop).toBeGreaterThanOrEqual(geometry.matrixBottom);
  expect(geometry.gridRight).toBeGreaterThan(geometry.inspectorLeft);
  expect(geometry.matrixRight).toBeLessThanOrEqual(geometry.inspectorLeft);
  expect(geometry.progressionRight).toBeLessThanOrEqual(geometry.inspectorLeft);
}

async function expectSharedLayoutSpacing(page: Page): Promise<void> {
  const spacing = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const grid = document.querySelector<HTMLElement>(".studio-grid");
    const matrix = document.querySelector<HTMLElement>(".matrix-panel");
    const progression = document.querySelector<HTMLElement>(".progression-strip");
    const inspector = document.querySelector<HTMLElement>(".progression-global-inspector");
    if (!shell || !grid || !matrix || !progression || !inspector) {
      throw new Error("Studio layout surfaces are missing");
    }

    return {
      gutter: rootStyle.getPropertyValue("--studio-gutter").trim(),
      panelGap: rootStyle.getPropertyValue("--panel-gap").trim(),
      panelPadding: rootStyle.getPropertyValue("--panel-padding").trim(),
      shellPaddingInline: getComputedStyle(shell).paddingInline,
      gridGap: getComputedStyle(grid).gap,
      mainGap: getComputedStyle(grid).rowGap,
      matrixPadding: getComputedStyle(matrix).padding,
      progressionPadding: getComputedStyle(progression).padding,
      inspectorPadding: getComputedStyle(inspector).padding,
    };
  });

  expect(spacing.gutter).toBe("8px");
  expect(spacing.panelGap).toBe("10px");
  expect(spacing.panelPadding).toBe("10px");
  expect(spacing.shellPaddingInline).toBe(spacing.gutter);
  expect(spacing.gridGap).toBe(spacing.panelGap);
  expect(spacing.mainGap).toBe(spacing.panelGap);
  expect(spacing.matrixPadding).toBe(spacing.panelPadding);
  expect(spacing.progressionPadding).toBe(spacing.panelPadding);
  // Inspector controls deliberately use the compact inset, unlike the outer panels.
  expect(spacing.inspectorPadding).toBe("7px 9px");
}

async function expectVisibleControlsFit(page: Page): Promise<void> {
  const overflowingControls = await page.locator("button, select, input").evaluateAll((controls) =>
    controls
      .filter((control) => {
        const element = control as HTMLElement;
        return element.offsetParent !== null;
      })
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          label: control.getAttribute("aria-label") ?? control.textContent?.trim(),
          right: rect.right,
        };
      })
      .filter(({ right }) => right > window.innerWidth + 1),
  );
  expect(overflowingControls).toEqual([]);
}

async function addChordAndCheck(page: Page, functionId: string): Promise<void> {
  const steps = page.locator(".measure-staff-event-select");
  const countBefore = await steps.count();
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await expect(steps).toHaveCount(countBefore + 1);
  await expectNoPageHorizontalScroll(page);
}

async function addStepsUntil(page: Page, targetCount: number): Promise<void> {
  const functions = ["I", "vi", "IV", "V"] as const;
  const steps = page.locator(".measure-staff-event-select");
  while ((await steps.count()) < targetCount) {
    const count = await steps.count();
    await addChordAndCheck(page, functions[count % functions.length]!);
  }
}

async function exerciseDesktopStudio(page: Page): Promise<void> {
  await waitForStudio(page);
  await expectNoPageHorizontalScroll(page);
  await expectMatrixAndInspectorAdjacent(page);
  await expectProgressionBelowMatrix(page);
  await expectVisibleControlsFit(page);

  await addChordAndCheck(page, "I");
  await page.getByTestId("chord-card-I").locator(".chord-main").click();
  await expect(page.getByRole("region", { name: "Template settings for I" })).toBeVisible();
  await expectNoPageHorizontalScroll(page);

  await page.getByLabel("Global Card View").selectOption("piano");
  await expect(page.getByLabel("Global Card View")).toHaveValue("piano");
  await expectNoPageHorizontalScroll(page);

  for (const functionId of [
    "vi",
    "IV",
    "V",
    "I",
    "vi",
    "IV",
    "V",
    "I",
    "vi",
    "IV",
    "V",
    "I",
    "vi",
    "IV",
    "V",
    "I",
    "vi",
    "IV",
    "V",
    "I",
  ]) {
    await addChordAndCheck(page, functionId);
  }

  const steps = page.locator(".measure-staff-event-select");
  await expect(steps).toHaveCount(21);
  await expectWrappedProgressionFlow(page, 21);
  const idsBeforeDrag = await readProgressionStepIds(page);
  await setProgressionView(page, "tablature");
  await expect(page.locator(".measure-staff-event-select")).toHaveCount(21);
  await setProgressionView(page, "staff");
  await expect.poll(() => readProgressionStepIds(page)).toEqual(idsBeforeDrag);
  await expectWrappedProgressionFlow(page, 21);
  await expectNoPageHorizontalScroll(page);

  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
  await expectNoPageHorizontalScroll(page);
  await expectVisibleControlsFit(page);
}

test.describe("US10 — desktop Studio layout", () => {
  test("covers every required viewport and 1/4/10/20/30-step progression", async ({ page }) => {
    test.slow();
    await waitForStudio(page);

    for (const expectedCount of REQUIRED_PROGRESSION_COUNTS) {
      await addStepsUntil(page, expectedCount);
      await expect(page.locator(".measure-staff-event-select")).toHaveCount(expectedCount);

      for (const viewport of REQUIRED_VIEWPORTS) {
        await page.setViewportSize(viewport);
        await expectNoPageHorizontalScroll(page);
        await expectSharedLayoutSpacing(page);
        await expectMatrixAndInspectorAdjacent(page);
        await expectProgressionBelowMatrix(page);
        await expectProgressionSequenceAndFit(page, expectedCount);
        if (expectedCount >= 20) await expectWrappedProgressionFlow(page, expectedCount);
      }
    }
  });

  test.describe("1280×720", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("keeps the Studio usable without page-level horizontal scroll", async ({ page }) => {
      await exerciseDesktopStudio(page);
    });
  });

  test.describe("1920×1080", () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test("uses the full desktop width without page-level horizontal scroll", async ({ page }) => {
      await exerciseDesktopStudio(page);
    });
  });
});
