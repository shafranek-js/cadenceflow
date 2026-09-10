import { expect, test } from "@playwright/test";

test.describe("Global Settings visibility", () => {
  test("toggles optional header controls and persists the app preference", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId("global-settings-toggle")).toBeVisible();
    await expect(page.locator(".theme-control")).toBeVisible();
    await expect(page.locator(".expertise-mode-control")).toBeVisible();
    await expect(page.getByRole("group", { name: "History Controls" })).toHaveCount(0);
    await expect(
      page.locator('[data-context="neutral"], [data-context="recommendation"]'),
    ).toHaveCount(0);

    const trigger = page.getByTestId("global-settings-toggle");
    await trigger.click();
    const panel = page.getByTestId("global-settings-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel("Show project tabs")).toBeChecked();
    await expect(panel.getByLabel("Show theme switcher")).toBeChecked();
    await expect(panel.getByLabel("Show expertise switcher")).toBeChecked();
    await expect(panel.getByLabel("Show Undo and Redo controls")).not.toBeChecked();
    await expect(panel.getByLabel("Show recommendation context")).not.toBeChecked();
    await expect(panel.getByLabel("Show preview harmony")).not.toBeChecked();

    await panel.getByLabel("Show project tabs").uncheck();
    await panel.getByLabel("Show theme switcher").uncheck();
    await panel.getByLabel("Show expertise switcher").uncheck();
    await panel.getByLabel("Show Undo and Redo controls").check();
    await panel.getByLabel("Show recommendation context").check();
    await panel.getByLabel("Show preview harmony").check();
    await expect(page.getByRole("tablist", { name: "Open projects" })).toHaveCount(0);
    await expect(page.locator(".theme-control")).toHaveCount(0);
    await expect(page.locator(".expertise-mode-control")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "History Controls" })).toBeVisible();
    await expect(
      page.locator('[data-context="neutral"], [data-context="recommendation"]'),
    ).toBeVisible();

    await page.getByTestId("chord-card-I").locator(".chord-main").click();
    await expect(page.locator("details[data-context='preview-harmony']")).toBeVisible();
    await trigger.click();

    const recommendation = page.locator("details.recommendation-inspector");
    await expect(recommendation).not.toHaveAttribute("open", "");
    await recommendation.locator("summary").click();
    await expect(recommendation).toHaveAttribute("open", "");

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("tablist", { name: "Open projects" })).toHaveCount(0);
    await expect(page.locator(".theme-control")).toHaveCount(0);
    await expect(page.locator(".expertise-mode-control")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "History Controls" })).toBeVisible();
    await expect(
      page.locator('[data-context="neutral"], [data-context="recommendation"]'),
    ).toBeVisible();
    await expect(page.locator("details.recommendation-inspector")).toHaveAttribute("open", "");
    await page.getByTestId("global-settings-toggle").click();
    await expect(
      page.getByTestId("global-settings-panel").getByLabel("Show preview harmony"),
    ).toBeChecked();
  });
});
