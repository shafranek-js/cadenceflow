import { expect, type Page } from "@playwright/test";

export async function ensureHistoryControlsVisible(page: Page): Promise<void> {
  const history = page.getByRole("group", { name: "History Controls" });
  if (await history.count()) {
    await expect(history).toBeVisible();
    return;
  }

  const panel = page.getByTestId("global-settings-panel");
  if (!(await panel.count())) {
    await page.getByTestId("global-settings-toggle").click();
  }

  const checkbox = page.getByLabel("Show Undo and Redo controls");
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
  await expect(history).toBeVisible();

  if (await panel.count()) {
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
}

export async function ensureRecommendationContextVisible(page: Page): Promise<void> {
  const recommendation = page.locator('[data-context="recommendation"], [data-context="neutral"]');
  if (await recommendation.count()) {
    await expect(recommendation).toBeVisible();
    return;
  }

  const panel = page.getByTestId("global-settings-panel");
  if (!(await panel.count())) {
    await page.getByTestId("global-settings-toggle").click();
  }

  const checkbox = page.getByLabel("Show recommendation context");
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }
  await expect(
    page.locator('[data-context="recommendation"], [data-context="neutral"]'),
  ).toBeVisible();

  if (await panel.count()) {
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
}

export async function ensurePreviewHarmonyVisible(page: Page): Promise<void> {
  const harmony = page.locator("details[data-context='preview-harmony']");
  if (await harmony.count()) {
    await expect(harmony).toBeVisible();
    return;
  }

  const panel = page.getByTestId("global-settings-panel");
  if (!(await panel.count())) {
    await page.getByTestId("global-settings-toggle").click();
  }

  const checkbox = page.getByLabel("Show preview harmony");
  if (!(await checkbox.isChecked())) {
    await checkbox.check();
  }

  if (await panel.count()) {
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
}
