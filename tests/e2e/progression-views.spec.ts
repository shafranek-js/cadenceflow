import { expect, test } from "@playwright/test";

test("My Progression defaults to Piano Roll and exposes five views without removing Matrix Harmonic", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const toggle = page.getByTestId("progression-view-toggle");
  await expect(toggle.getByRole("button")).toHaveCount(5);
  await expect(page.getByTestId("progression-view-btn-harmonic")).toHaveCount(0);
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("view-menu-toggle").click();
  await expect(page.getByTestId("progression-card-view-harmonic")).toHaveCount(0);
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
  await page.getByTestId("progression-view-btn-piano").click();
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
      await page.setViewportSize({ width, height });
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle.getByRole("button")).toHaveCount(5);
      await page.screenshot({
        path: `C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/progression-views/${width}x${height}-${theme}.png`,
      });
    }
  }
});
