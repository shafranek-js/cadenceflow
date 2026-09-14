import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

async function openStudio(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
}

test.describe("Inspector Drag & Reorder", () => {
  test("reorders inspector sections with keyboard arrows, persists across reload, and resets", async ({
    page,
  }) => {
    await openStudio(page);

    const inspector = page.getByTestId("progression-global-inspector");
    await expect(inspector).toBeVisible();

    // Default first section is 'meter'
    const sectionItems = inspector.locator(".inspector-reorderable-section");
    await expect(sectionItems.first()).toHaveAttribute("data-section-id", "meter");

    // Reorder 'groove' section up using keyboard accessibility on drag handle
    const grooveHandle = inspector.getByRole("button", {
      name: "Reorder Groove & swing section",
    });
    await expect(grooveHandle).toBeVisible();

    await grooveHandle.focus();
    await page.keyboard.press("ArrowUp");

    // Verify 'groove' is now the first section
    await expect(sectionItems.first()).toHaveAttribute("data-section-id", "groove");
    await expect(sectionItems.nth(1)).toHaveAttribute("data-section-id", "meter");

    // The reset sections order button should now be visible in the inspector header
    const resetOrderBtn = page.getByTestId("progression-global-inspector").locator(".reset-sections-order-btn");
    await expect(resetOrderBtn).toBeVisible();

    // Reload page to verify persistence in localStorage
    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    const reloadedItems = page
      .getByTestId("progression-global-inspector")
      .locator(".inspector-reorderable-section");
    await expect(reloadedItems.first()).toHaveAttribute("data-section-id", "groove");

    // Click reset sections order button
    const reloadedResetBtn = page
      .getByTestId("progression-global-inspector")
      .locator(".reset-sections-order-btn");
    await reloadedResetBtn.click();

    // Verify default order is restored ('meter' is first) and reset button is gone
    await expect(reloadedItems.first()).toHaveAttribute("data-section-id", "meter");
    await expect(reloadedResetBtn).toHaveCount(0);
  });

  test("reorders selected step inspector sections, persists across reload, and resets", async ({
    page,
  }) => {
    await openStudio(page);

    // Add a chord to progression
    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });

    // Select the chord in the progression track
    const steps = page.locator("[data-progression-step-select]");
    await expect(steps).toHaveCount(1);
    await steps.first().click();

    const inspector = page.getByTestId("step-performance-inspector");
    await expect(inspector).toBeVisible();

    // Default first section is 'register'
    const sectionItems = inspector.locator(".inspector-reorderable-section");
    await expect(sectionItems.first()).toHaveAttribute("data-section-id", "register");

    // Reorder 'articulation' section up using drag handle keyboard navigation
    const articulationHandle = inspector.getByRole("button", {
      name: "Reorder Articulation section",
    });
    await expect(articulationHandle).toBeVisible();

    await articulationHandle.focus();
    await page.keyboard.press("ArrowUp");

    // Verify 'articulation' is now the first section
    await expect(sectionItems.first()).toHaveAttribute("data-section-id", "articulation");
    await expect(sectionItems.nth(1)).toHaveAttribute("data-section-id", "register");

    // The reset sections order button should now be visible in the inspector header
    const resetOrderBtn = inspector.locator(".reset-sections-order-btn");
    await expect(resetOrderBtn).toBeVisible();

    // Reload page to verify persistence in localStorage
    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    // Select the chord step again after reload
    await page.locator("[data-progression-step-select]").first().click();
    const reloadedInspector = page.getByTestId("step-performance-inspector");
    await expect(reloadedInspector).toBeVisible();

    const reloadedItems = reloadedInspector.locator(".inspector-reorderable-section");
    await expect(reloadedItems.first()).toHaveAttribute("data-section-id", "articulation");

    // Click reset sections order button
    const reloadedResetBtn = reloadedInspector.locator(".reset-sections-order-btn");
    await reloadedResetBtn.click();

    // Verify default order is restored ('register' is first) and reset button is hidden
    await expect(reloadedItems.first()).toHaveAttribute("data-section-id", "register");
    await expect(reloadedResetBtn).toHaveCount(0);
  });
});
