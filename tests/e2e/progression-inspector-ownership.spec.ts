import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
}

async function expectNoPageHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
  }));
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollX).toBe(0);
}

async function expectActionsBeforeProgressionSettings(
  inspector: Locator,
  viewportHeight: number,
): Promise<void> {
  const actions = inspector.locator(":scope > .step-actions");
  const settings = inspector.getByTestId("selected-progression-settings");
  await expect(actions).toBeVisible();
  await expect(settings).toBeVisible();
  const actionsBox = await actions.boundingBox();
  const settingsBox = await settings.boundingBox();
  expect(actionsBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();
  expect(actionsBox!.y).toBeLessThan(settingsBox!.y);
  expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(viewportHeight);
}

test.describe("Progression inspector ownership", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("keeps global settings compact, selected settings grouped, and values synchronized", async ({
    page,
  }) => {
    await waitForStudio(page);

    const globalInspector = page.getByTestId("progression-global-inspector");
    await expect(globalInspector).toContainText("All Steps & Measures");
    await expect(globalInspector.locator(".global-meter-disclosure")).toHaveAttribute("open", "");
    await expect(globalInspector.locator(".global-groove-disclosure")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(globalInspector.locator(".loop-disclosure")).not.toHaveAttribute("open", "");
    await expect(globalInspector.locator(".global-tracks-disclosure")).not.toHaveAttribute(
      "open",
      "",
    );
    await expectNoPageHorizontalScroll(page);

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    const firstStep = page.locator('[data-testid="progression-step"]').first();
    await firstStep.getByRole("button", { name: /Select progression step/ }).click();

    const selectedInspector = page.getByTestId("step-performance-inspector");
    const progressionSettings = selectedInspector.getByTestId("selected-progression-settings");
    await expect(selectedInspector).toBeVisible();
    await expect(globalInspector).toHaveCount(0);
    await expect(progressionSettings).not.toHaveAttribute("open", "");
    await expectActionsBeforeProgressionSettings(selectedInspector, 720);
    await expect(page.getByText("Progression settings", { exact: true })).toHaveCount(1);

    await progressionSettings.locator(":scope > summary").click();
    await expect(progressionSettings).toHaveAttribute("open", "");
    await expect(
      progressionSettings.getByText("Time signature & meter", { exact: true }),
    ).toHaveCount(1);
    await expect(progressionSettings.getByRole("group", { name: "Loop Mode" })).toBeVisible();

    const groupingInput = progressionSettings.getByLabel("Pulse grouping");
    await groupingInput.fill("2foo");
    await expect(progressionSettings.getByRole("alert")).toContainText(
      'Invalid group element "2foo": must be positive integer',
    );
    await expect(
      progressionSettings.getByRole("button", { name: "Apply Meter Change" }),
    ).toBeDisabled();

    await progressionSettings.getByLabel("Meter numerator").fill("3");
    await groupingInput.fill("3");
    await progressionSettings.getByRole("button", { name: "Apply Meter Change" }).click();
    await expect(
      progressionSettings.locator(".global-meter-disclosure .disclosure-status"),
    ).toHaveText("3/4 (3)");

    await progressionSettings.getByRole("button", { name: "Toggle Swing Feel" }).click();
    await expect(
      progressionSettings.locator(".global-groove-disclosure .disclosure-status"),
    ).toContainText("Swing");
    await progressionSettings.getByRole("button", { name: "All", exact: true }).click();
    await expect(progressionSettings.locator(".loop-disclosure .disclosure-status")).toHaveText(
      "All",
    );

    await progressionSettings.locator(":scope > summary").click();
    await expect(progressionSettings).not.toHaveAttribute("open", "");
    await firstStep.getByRole("button", { name: /Select progression step/ }).focus();
    await page.keyboard.press("Escape");
    await expect(globalInspector).toBeVisible();
    await expect(globalInspector.locator(".global-meter-disclosure .disclosure-status")).toHaveText(
      "3/4 (3)",
    );
    await expect(
      globalInspector.locator(".global-groove-disclosure .disclosure-status"),
    ).toContainText("Swing");
    await expect(globalInspector.locator(".loop-disclosure .disclosure-status")).toHaveText("All");
    await expectNoPageHorizontalScroll(page);

    await page.getByRole("button", { name: "Add Rest to progression" }).click();
    const restStep = page.locator('[data-testid="progression-step"]').last();
    await restStep.getByRole("button", { name: /Select progression step .*: Rest/ }).click();

    const restInspector = page.getByTestId("step-performance-inspector");
    const restSettings = restInspector.getByTestId("selected-progression-settings");
    await expect(restInspector).toHaveAttribute("aria-label", "Settings for selected Rest step");
    await expectActionsBeforeProgressionSettings(restInspector, 720);
    await expect(page.getByText("Melody Track", { exact: true })).toHaveCount(0);

    const restSettingsOpen = await restSettings.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    );
    if (!restSettingsOpen) await restSettings.locator(":scope > summary").click();
    await expect(restSettings.locator(".global-meter-disclosure .disclosure-status")).toHaveText(
      "3/4 (3)",
    );
    await expect(
      restSettings.locator(".global-groove-disclosure .disclosure-status"),
    ).toContainText("Swing");
    await expect(restSettings.locator(".loop-disclosure .disclosure-status")).toHaveText("All");
    await expect(page.getByText("Time signature & meter", { exact: true })).toHaveCount(1);
    await expectNoPageHorizontalScroll(page);
  });
});
