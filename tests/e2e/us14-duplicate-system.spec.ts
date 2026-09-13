import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

test("duplicate system via right-click context menu on score-system-header", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

  const addChord = async (functionId: string) => {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  };

  // Build a 4-chord progression: I, IV, V, vi
  await addChord("I");
  await addChord("IV");
  await addChord("V");
  await addChord("vi");

  // Switch to Staff view
  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.getByRole("button", { name: "Staff view" }).click();

  // Set Measures Layout to 2
  await page.getByLabel("Measures Layout").selectOption("2");

  // Ensure two systems exist initially
  const systems = page.locator('[data-testid="progression-score-system"]');
  await expect(systems).toHaveCount(2);

  // Right-click on header of System 1
  const header0 = page.locator(".score-system-header").first();
  await header0.click({ button: "right" });

  // Context menu should appear with 'Duplicate System'
  const menu = page.getByTestId("score-system-context-menu");
  await expect(menu).toBeVisible();
  const duplicateBtn = menu.getByRole("menuitem", { name: "Duplicate System" });
  await expect(duplicateBtn).toBeVisible();

  // Click 'Duplicate System'
  await duplicateBtn.click();
  await expect(menu).toHaveCount(0);

  // Now 3 systems should exist, with System 3 at the end containing duplicates of System 1
  await expect(systems).toHaveCount(3);

  // Test Undo (Ctrl+Z)
  await page.keyboard.press("Control+z");
  await expect(systems).toHaveCount(2);

  // Test Redo (Ctrl+Y)
  await page.keyboard.press("Control+y");
  await expect(systems).toHaveCount(3);
});

test("dismiss context menu via Escape and click outside", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

  const addChord = async (functionId: string) => {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  };

  await addChord("I");
  await addChord("IV");

  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.getByRole("button", { name: "Staff view" }).click();

  const header = page.locator(".score-system-header").first();
  await header.click({ button: "right" });

  const menu = page.getByTestId("score-system-context-menu");
  await expect(menu).toBeVisible();

  // Press Escape
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Open again and click outside
  await header.click({ button: "right" });
  await expect(menu).toBeVisible();
  await page.locator("body").click({ position: { x: 10, y: 10 } });
  await expect(menu).toHaveCount(0);
});
