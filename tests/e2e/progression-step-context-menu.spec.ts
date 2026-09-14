import { expect, test } from "@playwright/test";
import { addRestToProgression } from "./test-helpers/progression-settings";

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

async function addChord(page: import("@playwright/test").Page, functionId: string) {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

test.describe("Progression Step Context Menu", () => {
  test("duplicates chord step immediately after current step", async ({ page }) => {
    await openStudio(page);

    await addChord(page, "I");
    await addChord(page, "IV");

    const steps = page.locator("[data-progression-step-select]");
    await expect(steps).toHaveCount(2);

    // Right-click the first chord
    await steps.first().click({ button: "right" });

    const menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu).toBeVisible();

    const duplicateBtn = page.getByTestId("step-menu-duplicate");
    await expect(duplicateBtn).toBeVisible();
    await duplicateBtn.click();

    // Verify 3 steps exist now (I duplicated)
    await expect(steps).toHaveCount(3);
  });

  test("inserts selected matrix chord before and after current step", async ({ page }) => {
    await openStudio(page);

    await addChord(page, "I");

    const steps = page.locator("[data-progression-step-select]");
    await expect(steps).toHaveCount(1);

    // Clear matrix preview with Escape so nothing is selected in matrix
    await page.keyboard.press("Escape");

    // 1. When no chord is selected in matrix, insert buttons are disabled
    await steps.first().click({ button: "right" });
    const insertBeforeBtn = page.getByTestId("step-menu-insert-before");
    await expect(insertBeforeBtn).toBeDisabled();
    await expect(insertBeforeBtn).toContainText("None Selected");
    await page.keyboard.press("Escape");

    // 2. Select/preview V in matrix
    await page.getByTestId("chord-card-V").locator(".chord-main").click();

    // 3. Right-click step and insert before
    await steps.first().click({ button: "right" });
    await expect(insertBeforeBtn).toBeEnabled();
    await expect(insertBeforeBtn).toContainText("Insert G Before");
    await insertBeforeBtn.click();

    await expect(steps).toHaveCount(2);

    // 4. Right-click second step and insert after
    await steps.nth(1).click({ button: "right" });
    const insertAfterBtn = page.getByTestId("step-menu-insert-after");
    await expect(insertAfterBtn).toBeEnabled();
    await expect(insertAfterBtn).toContainText("Insert G After");
    await insertAfterBtn.click();

    await expect(steps).toHaveCount(3);
  });

  test("deletes chord step and rest step from context menu", async ({ page }) => {
    await openStudio(page);

    await addChord(page, "I");
    await addChord(page, "IV");

    const steps = page.locator("[data-progression-step-select]");
    await expect(steps).toHaveCount(2);

    // Right-click second chord and delete it
    await steps.nth(1).click({ button: "right" });
    const deleteBtn = page.getByTestId("step-menu-delete");
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toContainText("Delete Chord");
    await deleteBtn.click();

    await expect(steps).toHaveCount(1);

    // Add rest via progression context menu
    await addRestToProgression(page);

    await expect(steps).toHaveCount(2);

    // Right-click rest step and delete it
    await steps.nth(1).click({ button: "right" });
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toContainText("Delete Rest");
    await deleteBtn.click();

    await expect(steps).toHaveCount(1);
  });
});
