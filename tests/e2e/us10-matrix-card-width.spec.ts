import { expect, test, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
}

async function expectMatrixLayersFitSingleRows(page: Page): Promise<void> {
  const evidence = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-layer]")).map((layer) => {
      const track = layer.querySelector<HTMLElement>(".matrix-layer-cards");
      const cards = Array.from(layer.querySelectorAll<HTMLElement>(".chord-card"));
      if (!track || cards.length === 0) throw new Error("Matrix cards are missing");

      const trackRect = track.getBoundingClientRect();
      const rects = cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { right: rect.right, top: Math.round(rect.top), width: Math.round(rect.width) };
      });
      const firstRowTop = rects[0]!.top;
      const firstRow = rects.filter((rect) => rect.top === firstRowTop);

      return {
        layer: layer.dataset.layer,
        widths: [...new Set(rects.map((rect) => rect.width))],
        cardCount: rects.length,
        firstRowCount: firstRow.length,
        firstRowRight: firstRow.at(-1)!.right,
        trackRight: trackRect.right,
        scrollWidth: track.scrollWidth,
        clientWidth: track.clientWidth,
      };
    }),
  );

  expect(evidence.length).toBeGreaterThan(0);
  for (const layer of evidence) {
    expect(layer.widths, layer.layer).toHaveLength(1);
    expect(layer.firstRowCount, layer.layer).toBe(layer.cardCount);
    if (layer.cardCount === 7) {
      expect(Math.abs(layer.firstRowRight - layer.trackRight), layer.layer).toBeLessThanOrEqual(2);
    }
    expect(layer.scrollWidth, layer.layer).toBeLessThanOrEqual(layer.clientWidth);
  }
}

async function expectTonicSelectorInMatrixToolbar(page: Page): Promise<void> {
  const evidence = await page
    .getByRole("region", { name: "Harmonic Matrix" })
    .locator(".matrix-toolbar")
    .evaluate((toolbar) => {
      const moduleSelector = toolbar.querySelector<HTMLElement>(":scope > .module-selector");
      const tonicSelector = toolbar.querySelector<HTMLElement>(":scope > .tonic-selector");
      const workbench = toolbar.parentElement?.querySelector<HTMLElement>(".matrix-workbench");
      const tonicInWorkbench = workbench?.querySelector<HTMLElement>(".tonic-selector");
      if (!moduleSelector || !tonicSelector || !workbench) {
        throw new Error("Matrix toolbar structure is missing");
      }

      const moduleRect = moduleSelector.getBoundingClientRect();
      const tonicRect = tonicSelector.getBoundingClientRect();
      return {
        sharesRow: moduleRect.bottom > tonicRect.top && tonicRect.bottom > moduleRect.top,
        tonicStartsAfterModules: tonicRect.left >= moduleRect.right - 1,
        tonicInWorkbench: Boolean(tonicInWorkbench),
      };
    });

  expect(evidence.sharesRow).toBe(true);
  expect(evidence.tonicStartsAfterModules).toBe(true);
  expect(evidence.tonicInWorkbench).toBe(false);
}

test.describe("Matrix card width", () => {
  test("uses the available 1280px Matrix width without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await waitForStudio(page);
    await expectTonicSelectorInMatrixToolbar(page);
    await expectMatrixLayersFitSingleRows(page);
  });

  test("uses the available 1920px Matrix width without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitForStudio(page);
    await expectTonicSelectorInMatrixToolbar(page);
    await expectMatrixLayersFitSingleRows(page);
  });
});
