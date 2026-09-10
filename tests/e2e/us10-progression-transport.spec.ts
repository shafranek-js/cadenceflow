import { expect, test } from "@playwright/test";

test.describe("US10 — progression-owned playback transport", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
  });

  test("renders one transport cluster and keeps disabled states with no selected step", async ({
    page,
  }) => {
    const progression = page.getByRole("region", { name: "My Progression" });
    const controls = progression.getByRole("group", { name: "Progression playback controls" });
    const transport = page.locator(".studio-transport");

    await expect(controls).toBeVisible();
    for (const name of ["Play", "Play From Here", "Pause", "Resume", "Stop"]) {
      await expect(controls.getByRole("button", { name, exact: true })).toHaveCount(1);
      await expect(transport.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByTestId("transport-status")).toHaveCount(1);
    await expect(controls.getByTestId("transport-status")).toContainText("Stopped");

    await expect(controls.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
    await expect(
      controls.getByRole("button", { name: "Play From Here", exact: true }),
    ).toBeDisabled();
    await expect(controls.getByRole("button", { name: "Pause", exact: true })).toBeDisabled();
    await expect(controls.getByRole("button", { name: "Resume", exact: true })).toBeDisabled();
    await expect(controls.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  });

  test("preserves Play, From Here, Pause, Resume, and Stop behavior", async ({ page }) => {
    test.slow();

    const progression = page.getByRole("region", { name: "My Progression" });
    const controls = progression.getByRole("group", { name: "Progression playback controls" });
    const play = controls.getByRole("button", { name: "Play", exact: true });
    const fromHere = controls.getByRole("button", { name: "Play From Here", exact: true });
    const pause = controls.getByRole("button", { name: "Pause", exact: true });
    const resume = controls.getByRole("button", { name: "Resume", exact: true });
    const stop = controls.getByRole("button", { name: "Stop", exact: true });
    const status = controls.getByTestId("transport-status");
    const steps = page.locator('[data-testid="progression-step"]');

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await page
      .getByTestId("chord-card-IV")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await expect(steps).toHaveCount(2);

    await steps.nth(0).click();
    await expect(fromHere).toBeEnabled();

    await play.click();
    await expect(status).toContainText("Playing");
    await expect(play).toBeDisabled();
    await expect(pause).toBeEnabled();
    await expect(fromHere).toBeDisabled();
    await expect(stop).toBeEnabled();
    await expect(steps.nth(0)).toHaveClass(/is-playing/);

    await pause.click();
    await expect(status).toContainText("Paused");
    await expect(pause).toBeDisabled();
    await expect(resume).toBeEnabled();
    await expect(stop).toBeEnabled();

    await resume.click();
    await expect(status).toContainText("Playing");
    await expect(resume).toBeDisabled();
    await expect(pause).toBeEnabled();

    await stop.click();
    await expect(status).toContainText("Stopped");
    await expect(play).toBeEnabled();
    await expect(fromHere).toBeEnabled();
    await expect(pause).toBeDisabled();
    await expect(resume).toBeDisabled();
    await expect(stop).toBeDisabled();
    await expect(steps.nth(0)).not.toHaveClass(/is-playing/);
    await expect(steps.nth(1)).not.toHaveClass(/is-playing/);

    await steps.nth(1).click();
    await fromHere.click();
    await expect(status).toContainText("Playing");
    await expect(steps.nth(1)).toHaveClass(/is-playing/);
    await expect(steps.nth(0)).not.toHaveClass(/is-playing/);

    await stop.click();
  });

  test("starts and toggles playback with Space when focus is outside controls", async ({
    page,
  }) => {
    test.slow();

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(1);

    const status = page.getByTestId("transport-status");
    const stop = page.getByRole("button", { name: "Stop", exact: true });

    await expect(page.getByTestId("piano-audio-status")).toContainText("HQ Piano Ready", {
      timeout: 30_000,
    });
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    await page.keyboard.press("Space");
    await expect(status).toContainText("Playing");

    await page.keyboard.press("Space");
    await expect(status).toContainText("Paused");

    await page.keyboard.press("Space");
    await expect(status).toContainText("Playing");

    await stop.click();
    await expect(status).toContainText("Stopped");
  });
});
