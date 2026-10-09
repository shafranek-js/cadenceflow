import { test, expect } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

test("US4 switches unambiguous progression from Major to Tonal Minor without losing steps", async ({
  page,
}) => {
  await page.goto("/");
  await setProgressionView(page, "staff");
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await page
    .getByTestId("chord-card-V")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Set key D", exact: true }).click();
  await expect(page.getByTestId("chord-card-V")).toContainText("A");
  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  const steps = page.locator(".measure-staff-event-select");
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(0)).toHaveAttribute("aria-label", /Select i ·/);
  await expect(steps.nth(1)).toHaveAttribute("aria-label", /Select V ·/);
});

test("US4 never guesses an ambiguous module conversion silently", async ({ page }) => {
  await page.goto("/");
  await setProgressionView(page, "staff");
  await page
    .getByTestId("chord-card-bVII")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await expect(page.getByRole("dialog", { name: /Resolve ambiguous harmony/i })).toBeVisible();
  await expect(page.getByRole("option", { name: "Keep Original" })).toBeAttached();
});
