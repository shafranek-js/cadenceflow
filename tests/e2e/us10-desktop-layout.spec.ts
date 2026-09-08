import { expect, test, type Page } from "@playwright/test";

type LayoutMetrics = {
  readonly documentScrollWidth: number;
  readonly documentClientWidth: number;
  readonly bodyScrollWidth: number;
  readonly innerWidth: number;
  readonly scrollX: number;
  readonly progressionScrollWidth: number;
  readonly progressionClientWidth: number;
};

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Playback Transport" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Inspector" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function readLayoutMetrics(page: Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const progression = document.querySelector<HTMLElement>(".progression-step-cards");
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      scrollX: window.scrollX,
      progressionScrollWidth: progression?.scrollWidth ?? 0,
      progressionClientWidth: progression?.clientWidth ?? 0,
    };
  });
}

async function expectNoPageHorizontalScroll(page: Page): Promise<void> {
  const metrics = await readLayoutMetrics(page);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollX).toBe(0);
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
  const steps = page.locator('[data-testid="progression-step"]');
  const countBefore = await steps.count();
  await page
    .getByTestId(`chord-card-${functionId}`)
    .getByRole("button", { name: new RegExp(`Add ${functionId} to progression`, "i") })
    .click();
  await expect(steps).toHaveCount(countBefore + 1);
  await expectNoPageHorizontalScroll(page);
}

async function exerciseDesktopStudio(page: Page): Promise<void> {
  await waitForStudio(page);
  await expectNoPageHorizontalScroll(page);
  await expectMatrixAndInspectorAdjacent(page);
  await expectVisibleControlsFit(page);

  await addChordAndCheck(page, "I");
  await page.getByTestId("chord-card-I").getByRole("button", { name: "Settings for I" }).click();
  await expect(page.getByRole("region", { name: "Template settings for I" })).toBeVisible();
  await expectNoPageHorizontalScroll(page);

  await page.getByLabel("Global Card View").selectOption("piano");
  await expect(page.getByLabel("Global Card View")).toHaveValue("piano");
  await expectNoPageHorizontalScroll(page);

  for (const functionId of ["vi", "IV", "V", "I", "vi", "IV", "V", "I", "vi", "IV", "V"]) {
    await addChordAndCheck(page, functionId);
  }

  const progression = page.locator(".progression-step-cards");
  const progressionMetrics = await readLayoutMetrics(page);
  expect(progressionMetrics.progressionScrollWidth).toBeGreaterThan(
    progressionMetrics.progressionClientWidth,
  );
  await progression.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => progression.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expectNoPageHorizontalScroll(page);

  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
  await expectNoPageHorizontalScroll(page);
  await expectVisibleControlsFit(page);
}

test.describe("US10 — desktop Studio layout", () => {
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
