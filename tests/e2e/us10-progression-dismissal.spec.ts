import { expect, test, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

test.describe("Progression step dismissal", () => {
  test("supports click and keyboard toggle, Escape focus restoration, and empty-background dismissal", async ({
    page,
  }) => {
    await waitForStudio(page);
    await page.getByRole("button", { name: "Add I to progression" }).click();
    await page.getByRole("button", { name: "Add V to progression" }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    const first = steps.first();
    const firstSelect = first.getByRole("button", { name: /Select progression step/ });
    const undo = page.getByRole("button", { name: "Undo", exact: true });

    await firstSelect.click();
    await expect(first).toHaveAttribute("data-selected", "true");
    await expect(first.locator(".step-editor")).toBeVisible();

    // Repeated activation of the same card is the primary collapse path.
    await firstSelect.click();
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(first.locator(".step-editor")).toHaveCount(0);

    // Native keyboard activation follows the same single-selection toggle path.
    await firstSelect.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("Space");
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(firstSelect).toBeFocused();

    // Selecting another card still switches the single selection as before.
    await firstSelect.click();
    const second = steps.nth(1);
    await second.getByRole("button", { name: /Select progression step/ }).click();
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(second).toHaveAttribute("data-selected", "true");

    await firstSelect.click();
    await expect(first.locator(".step-editor")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(first.locator(".step-editor")).toHaveCount(0);
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(firstSelect).toBeFocused();

    // Click propagation from editor and card-view controls stays scoped; Escape remains a
    // normal dismissal key and intentionally reaches the local Track handler.
    await firstSelect.click();
    const editor = first.locator(".step-editor");
    await editor.getByTestId("step-duration-select").selectOption("2/1");
    await editor.getByTestId("step-duration-select").focus();
    await page.keyboard.press("Escape");
    await expect(first).not.toHaveAttribute("data-selected", "true");
    await expect(editor).toHaveCount(0);

    await firstSelect.click();
    await expect(editor).toBeVisible();
    await first
      .getByRole("group", { name: /View for progression step/ })
      .getByRole("button", {
        name: "piano",
        exact: true,
      })
      .click();
    await expect(first).toHaveAttribute("data-selected", "true");
    await first
      .getByRole("group", { name: /View for progression step/ })
      .getByRole("button", { name: "piano", exact: true })
      .focus();
    await page.keyboard.press("Escape");
    await expect(first).not.toHaveAttribute("data-selected", "true");

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
