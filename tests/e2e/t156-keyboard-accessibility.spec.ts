import { expect, test, type Page } from "@playwright/test";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
}

test.describe("T156 — native control keyboard boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      const testWindow = window as unknown as {
        __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
      };
      testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    });
  });

  test("keeps Matrix and Progression selection intact from native controls", async ({ page }) => {
    await openStudio(page);

    const matrixCard = page.getByTestId("chord-card-I");
    await matrixCard.locator(".chord-main").click();
    const globalView = page.getByLabel("Global Card View");
    await globalView.focus();
    await page.keyboard.press("Escape");
    await expect(matrixCard).toHaveClass(/is-selected/);
    await expect(globalView).toBeFocused();

    await matrixCard.locator(".chord-main").click({ modifiers: ["Control"] });
    const progressionTarget = page.locator("[data-progression-step-select]").first();
    await progressionTarget.click();
    const progressionView = page.getByLabel("Progression Card View");
    await progressionView.focus();
    await page.keyboard.press("Escape");
    await expect(progressionTarget).toHaveAttribute("aria-pressed", "true");
    await expect(progressionView).toBeFocused();

    const inspector = page.getByTestId("step-performance-inspector");
    const duration = inspector.getByRole("textbox", {
      name: "Duration in canonical quarter-note beats",
    });
    await duration.fill("3");
    await duration.press("Control+z");
    await expect(inspector).toBeVisible();
    await expect(progressionTarget).toHaveAttribute("aria-pressed", "true");
  });
});
