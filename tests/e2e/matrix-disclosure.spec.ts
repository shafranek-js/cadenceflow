import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("collapsing the Harmonic Matrix frees progression space and remains keyboard accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

  const matrix = page.locator(".matrix-panel");
  const matrixContent = matrix.locator("[id^='harmonic-matrix-content-']");
  const progression = page.locator(".studio-grid > .progression-strip");
  const matrixInspectorContent = page.locator(".inspector-stack-content");
  const collapse = page.getByRole("button", { name: "Collapse Harmonic Matrix" });
  await expect(matrix).toBeVisible();
  await expect(progression).toBeVisible();
  const expandedHeight = await matrix.evaluate((element) => element.getBoundingClientRect().height);

  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();

  const expand = page.getByRole("button", { name: "Expand Harmonic Matrix" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(matrixContent).toBeHidden();
  await expect(matrixInspectorContent).toBeHidden();
  await expect(page.locator(".matrix-collapsed-header")).toBeVisible();
  const collapsed = await matrix.evaluate((element) => {
    return element.getBoundingClientRect().height;
  });
  expect(collapsed).toBeLessThan(100);
  expect(collapsed).toBeLessThan(expandedHeight - 200);

  await expand.focus();
  await page.keyboard.press("Enter");
  const expandedCollapse = page.getByRole("button", { name: "Collapse Harmonic Matrix" });
  await expect(expandedCollapse).toHaveAttribute("aria-expanded", "true");
  await expect(matrixInspectorContent).toBeVisible();

  await expandedCollapse.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Expand Harmonic Matrix" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(progression).toBeVisible();
});

test("keeps the compact collapse control within narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

  for (const width of [390, 1100]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Collapse Harmonic Matrix" }).click();
    const compactHeader = page.locator(".matrix-collapsed-header");
    await expect(compactHeader).toBeVisible();
    const geometry = await compactHeader.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewportWidth: window.innerWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    await expect(page.locator(".inspector-stack-content")).toBeHidden();
    await page.getByRole("button", { name: "Expand Harmonic Matrix" }).click();
  }
});
