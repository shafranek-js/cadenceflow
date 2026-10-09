import { requireValue } from "../fixtures/assertions";
import { expect, test } from "@playwright/test";

const screenshotRoot =
  process.env.CADENCEFLOW_PROGRESSION_VIEWS_SCREENSHOT_ROOT ??
  "C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/progression-views";

test("My Progression defaults to Piano Roll and exposes three views without removing Matrix Harmonic", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const toggle = page.getByTestId("progression-view-toggle");
  await expect(toggle.getByRole("button")).toHaveCount(3);
  await expect(page.getByTestId("progression-view-btn-piano")).toHaveCount(0);
  await expect(page.getByTestId("progression-view-btn-guitar")).toHaveCount(0);
  await expect(page.getByTestId("progression-view-btn-harmonic")).toHaveCount(0);
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("view-menu-toggle").click();
  await expect(page.getByTestId("progression-card-view-harmonic")).toHaveCount(0);
  await expect(page.getByTestId("progression-card-view-piano")).toHaveCount(0);
  await expect(page.getByTestId("progression-card-view-guitar")).toHaveCount(0);
  await expect(page.getByTestId("matrix-card-view-piano")).toBeVisible();
  await expect(page.getByTestId("matrix-card-view-guitar")).toBeVisible();
  await expect(page.getByTestId("matrix-card-view-harmonic")).toBeVisible();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Rotate guitar chords 90° (horizontal)" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await expect(page.getByTestId("piano-roll-toolbar")).toBeVisible();
  await page.getByRole("button", { name: "Show guitar chord", exact: true }).click();
  await expect(page.locator(".piano-roll-card-row .mini-guitar-card-visual")).toHaveAttribute(
    "data-orientation",
    "horizontal",
  );
  await page.getByLabel("Piano Roll note colors", { exact: true }).selectOption("harmonic-role");
  await expect(page.getByLabel("Piano Roll note colors", { exact: true })).toHaveValue(
    "harmonic-role",
  );
  await page.getByTestId("progression-view-btn-tablature").click();
  const inspectorViews = page.getByRole("radiogroup", { name: "Progression View Selection" });
  await expect(inspectorViews.getByRole("button")).toHaveCount(3);
  await expect(inspectorViews.getByRole("button", { name: "Piano view", exact: true })).toHaveCount(
    0,
  );
  await expect(
    inspectorViews.getByRole("button", { name: "Guitar view", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("radiogroup", { name: "Progression View Selection" })
    .getByRole("button", { name: "Piano Roll view", exact: true })
    .click();
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const theme of ["light", "dark"]) {
    await page
      .getByRole("button", { name: theme === "light" ? "Light theme" : "Dark theme", exact: true })
      .click();
    for (const [width, height] of [
      [640, 360],
      [1280, 720],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width: requireValue(width), height: requireValue(height) });
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle.getByRole("button")).toHaveCount(3);
      await page.screenshot({
        path: `${screenshotRoot}/${width}x${height}-${theme}.png`,
      });
    }
  }
});
