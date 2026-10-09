import { expect, test, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import { addRestToProgression, setProgressionView } from "./test-helpers/progression-settings";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await setProgressionView(page, "staff");
}

test.describe("Progression step dismissal", () => {
  test("keeps Rest settings in Selected step and restores focus after Escape", async ({ page }) => {
    await waitForStudio(page);
    await addRestToProgression(page);

    const restSelect = page.locator(".measure-staff-event.is-rest .measure-staff-event-select");
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

    const steps = page.locator(".measure-staff-event-select");
    const first = steps.first();
    const firstSelect = first;
    const firstStepId = await first.getAttribute("data-step-id");
    expect(firstStepId).toBeTruthy();
    const undo = page.getByRole("button", { name: "Undo", exact: true });

    await firstSelect.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();

    // Repeated activation re-auditions the same chord but never collapses it.
    await firstSelect.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");

    // Native keyboard activation follows the same select-and-audition path.
    await firstSelect.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(firstSelect).toBeFocused();

    // Selecting another card still switches the single selection as before.
    await firstSelect.click();
    const second = steps.nth(1);
    await second.click();
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect(second).toHaveAttribute("aria-pressed", "true");

    await firstSelect.click();
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await page.keyboard.press("Escape");
    // Escape clears the transient range first; a second Escape dismisses the selected Step.
    await page.keyboard.press("Escape");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect(firstSelect).toBeFocused();

    // Duration editing is now in Selected step; Escape does not dismiss an external inspector.
    await firstSelect.click();
    const selectedInspector = page.getByTestId("step-performance-inspector");
    await selectedInspector.getByTestId("duration-preset-half").click();
    await selectedInspector.getByTestId("duration-preset-half").focus();
    await page.keyboard.press("Escape");
    await expect(first).toHaveAttribute("aria-pressed", "true");

    await expect(selectedInspector).toBeVisible();
    await page.getByTestId("progression-view-btn-piano-roll").click();
    await page.getByRole("button", { name: "Show piano chord", exact: true }).first().click();
    const pianoCard = page
      .getByTestId("piano-roll-piano-cards")
      .locator(`[data-source-step-id="${firstStepId}"]`);
    await expect(pianoCard.locator(".mini-piano")).toBeVisible();
    await expect(pianoCard).toHaveAttribute("aria-pressed", "true");
    await pianoCard.click();
    await expect(pianoCard).toHaveAttribute("aria-pressed", "true");

    // Inspector interaction must not dismiss the selected progression step.
    await page.getByRole("heading", { name: /Step Performance:/ }).click();
    await page.keyboard.press("Escape");
    await expect(pianoCard).toHaveAttribute("aria-pressed", "true");

    // A modal receives Escape first; the underlying progression stays selected.
    await page
      .getByTestId("progression-heading")
      .getByRole("heading", { name: "My Progression" })
      .click({ button: "right" });
    await page.getByTestId("progression-menu-presets").click();
    await expect(page.getByRole("dialog", { name: "Presets" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Presets" })).toHaveCount(0);
    await expect(pianoCard).toHaveAttribute("aria-pressed", "true");

    const progressionCards = page.locator(".progression-step-cards");
    const box = await progressionCards.boundingBox();
    expect(box).not.toBeNull();
    await progressionCards.click({
      position: { x: Math.max(1, box!.width - 5), y: Math.max(1, Math.min(5, box!.height - 1)) },
    });
    await expect(page.locator('.piano-roll-instrument-card[aria-pressed="true"]')).toHaveCount(0);

    // Dismissal is not a history action; the pre-existing Add history remains available.
    await expect(undo).toBeEnabled();
  });
});
