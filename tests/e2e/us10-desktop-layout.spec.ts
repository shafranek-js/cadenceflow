import { expect, test, type Page } from "@playwright/test";

type LayoutMetrics = {
  readonly documentScrollWidth: number;
  readonly documentClientWidth: number;
  readonly bodyScrollWidth: number;
  readonly innerWidth: number;
  readonly scrollX: number;
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
    const progression = document.querySelector<HTMLElement>(".progression-step-cards");
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="progression-step"]'),
    );
    if (!progression) throw new Error("Progression card flow is missing");

    const rects = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: Math.round(rect.top),
        width: rect.width,
      };
    });
    const rows = Array.from(new Set(rects.map((rect) => rect.top)));
    const rowMajorOrder = rects.every((rect, index) => {
      if (index === 0) return true;
      const previous = rects[index - 1]!;
      return rect.top > previous.top || (rect.top === previous.top && rect.left > previous.left);
    });
    const progressionRect = progression.getBoundingClientRect();

    return {
      numbers: cards.map((card) =>
        card.querySelector('[data-testid="progression-step-number"]')?.textContent?.trim(),
      ),
      rows,
      rowMajorOrder,
      rects,
      progressionRight: progressionRect.right,
      progressionScrollWidth: progression.scrollWidth,
      progressionClientWidth: progression.clientWidth,
      overflowX: getComputedStyle(progression).overflowX,
    };
  });

  expect(evidence.numbers).toEqual(
    Array.from({ length: expectedCount }, (_, index) => String(index + 1)),
  );
  expect(evidence.rows.length).toBeGreaterThan(1);
  expect(evidence.rowMajorOrder).toBe(true);
  expect(evidence.progressionScrollWidth).toBeLessThanOrEqual(evidence.progressionClientWidth);
  expect(evidence.overflowX).toBe("visible");
  for (const rect of evidence.rects) {
    expect(rect.width).toBeGreaterThanOrEqual(169);
    expect(rect.width).toBeLessThanOrEqual(171);
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(evidence.progressionRight + 1);
  }
}

async function readProgressionStepIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="progression-step"]')
    .evaluateAll((cards) =>
      cards.map((card) => card.querySelector<HTMLElement>("[data-step-id]")?.dataset.stepId ?? ""),
    );
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
    const main = document.querySelector<HTMLElement>(".studio-main-column");
    const matrix = document.querySelector<HTMLElement>(".studio-matrix-area");
    const progression = main?.querySelector<HTMLElement>(":scope > .progression-strip");
    const inspector = document.querySelector<HTMLElement>(".studio-grid > .inspector-stack");
    if (!main || !matrix || !progression || !inspector) {
      throw new Error("Studio main column or progression area is missing");
    }
    const mainRect = main.getBoundingClientRect();
    const matrixRect = matrix.getBoundingClientRect();
    const progressionRect = progression.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    return {
      mainLeft: mainRect.left,
      mainRight: mainRect.right,
      matrixLeft: matrixRect.left,
      matrixRight: matrixRect.right,
      matrixBottom: matrixRect.bottom,
      progressionLeft: progressionRect.left,
      progressionRight: progressionRect.right,
      progressionTop: progressionRect.top,
      inspectorLeft: inspectorRect.left,
    };
  });

  expect(Math.abs(geometry.mainLeft - geometry.matrixLeft)).toBeLessThan(1);
  expect(Math.abs(geometry.matrixLeft - geometry.progressionLeft)).toBeLessThan(1);
  expect(Math.abs(geometry.matrixRight - geometry.progressionRight)).toBeLessThan(1);
  expect(geometry.progressionTop).toBeGreaterThanOrEqual(geometry.matrixBottom);
  expect(geometry.mainRight).toBeLessThanOrEqual(geometry.inspectorLeft);
  expect(geometry.progressionRight).toBeLessThanOrEqual(geometry.inspectorLeft);
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
  await expectProgressionBelowMatrix(page);
  await expectVisibleControlsFit(page);

  await addChordAndCheck(page, "I");
  await page.getByTestId("chord-card-I").getByRole("button", { name: "Settings for I" }).click();
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

  await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(21);
  await expectWrappedProgressionFlow(page, 21);
  const idsBeforeDrag = await readProgressionStepIds(page);
  await page.evaluate(() => {
    const source = document.querySelectorAll<HTMLElement>("[data-progression-step-drag]")[0];
    const target = document.querySelectorAll<HTMLElement>("[data-progression-step-drag]")[20];
    if (!source || !target) throw new Error("Progression drag source or target is missing");
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    target.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }),
    );
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });
  await expect
    .poll(() => readProgressionStepIds(page))
    .toEqual([...idsBeforeDrag.slice(1), idsBeforeDrag[0]]);
  await expectWrappedProgressionFlow(page, 21);
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
