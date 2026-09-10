import { expect, test, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

test.describe("Progression step dismissal", () => {
  test("keeps Rest settings in Selected step and restores focus after Escape", async ({ page }) => {
    await waitForStudio(page);
    await page.getByRole("button", { name: "Add Rest to progression" }).click();

    const restSelect = page.getByRole("button", {
      name: "Select progression step 1: Rest",
      exact: true,
    });
    await restSelect.click();
    await expect(page.getByTestId("step-performance-inspector")).toContainText("Selected step");
    await expect(page.locator(".progression-rest-card .step-editor")).toHaveCount(0);
    await restSelect.focus();
    await page.keyboard.press("Escape");

    await expect(page.locator(".progression-rest-card .step-editor")).toHaveCount(0);
    await expect(restSelect).toBeFocused();
  });

  test("selects and auditions without inline expansion, with Escape and empty-background dismissal", async ({
    page,
  }) => {
    await waitForStudio(page);
    await ensureHistoryControlsVisible(page);
    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await page
      .getByTestId("chord-card-V")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });

    const steps = page.locator('[data-testid="progression-step"]');
    const first = steps.first();
    const firstSelect = first.getByRole("button", { name: /Select progression step/ });
    const undo = page.getByRole("button", { name: "Undo", exact: true });

    await firstSelect.click();
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(first.locator(".step-editor")).toHaveCount(0);
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();

    // Repeated activation re-auditions the same chord but never collapses it.
    await firstSelect.click();
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(first.locator(".step-editor")).toHaveCount(0);

    // Native keyboard activation follows the same select-and-audition path.
    await firstSelect.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(firstSelect).toBeFocused();

    // Selecting another card still switches the single selection as before.
    await firstSelect.click();
    const second = steps.nth(1);
    await second.getByRole("button", { name: /Select progression step/ }).click();
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(second).toHaveAttribute("data-selected", "true");

    await firstSelect.click();
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(first.locator(".step-editor")).toHaveCount(0);
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(firstSelect).toBeFocused();

    // Duration editing is now in Selected step; Escape does not dismiss an external inspector.
    await firstSelect.click();
    const selectedInspector = page.getByTestId("step-performance-inspector");
    await selectedInspector.getByTestId("duration-preset-half").click();
    await selectedInspector.getByTestId("duration-preset-half").focus();
    await page.keyboard.press("Escape");
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(first.locator(".step-editor")).toHaveCount(0);

    await expect(selectedInspector).toBeVisible();
    await page.getByLabel("Progression Card View").selectOption("piano");
    await expect(first.locator(".mini-piano")).toBeVisible();
    await expect(first.getByRole("group", { name: /View for progression step/ })).toHaveCount(0);
    await expect(first).toHaveAttribute("data-selected", "true");
    await firstSelect.click();
    await expect(first).toHaveAttribute("data-selected", "true");

    await firstSelect.click();
    await expect(first).toHaveAttribute("data-selected", "true");

    // Inspector interaction must not dismiss the selected progression step.
    await page.getByRole("heading", { name: /Step Performance:/ }).click();
    await page.keyboard.press("Escape");
    await expect(first).toHaveAttribute("data-selected", "true");

    // A modal receives Escape first; the underlying progression stays selected.
    await page.getByTestId("progression-presets-btn").click();
    await expect(page.getByRole("dialog", { name: "Presets" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Presets" })).toHaveCount(0);
    await expect(first).toHaveAttribute("data-selected", "true");

    const progressionCards = page.locator(".progression-step-cards");
    const box = await progressionCards.boundingBox();
    expect(box).not.toBeNull();
    await progressionCards.click({
      position: { x: Math.max(1, box!.width - 5), y: Math.max(1, Math.min(5, box!.height - 1)) },
    });
    await expect(first.locator(".step-editor")).toHaveCount(0);
    await expect(
      page.locator('[data-testid="progression-step"][data-selected="true"]'),
    ).toHaveCount(0);

    // Dismissal is not a history action; the pre-existing Add history remains available.
    await expect(undo).toBeEnabled();
  });
});
