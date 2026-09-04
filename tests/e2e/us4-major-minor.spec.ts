import { test, expect } from "@playwright/test";

test("US4 switches unambiguous progression from Major to Tonal Minor without losing steps", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("chord-card-I")
    .getByRole("button", { name: /Add I to progression/i })
    .click();
  await page
    .getByTestId("chord-card-V")
    .getByRole("button", { name: /Add V to progression/i })
    .click();
  await page.getByRole("button", { name: "Set key D", exact: true }).click();
  await expect(page.getByTestId("chord-card-V")).toContainText("A");
  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(2);
  await expect(page.getByTestId("progression-step").nth(0).getByTestId("step-function")).toHaveText(
    "i",
  );
  await expect(page.getByTestId("progression-step").nth(1).getByTestId("step-function")).toHaveText(
    "V",
  );
});

test("US4 never guesses an ambiguous module conversion silently", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("chord-card-bVII")
    .getByRole("button", { name: /Add bVII to progression/i })
    .click();
  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await expect(page.getByRole("dialog", { name: /Resolve ambiguous harmony/i })).toBeVisible();
  await expect(page.getByRole("option", { name: "Keep Original" })).toBeAttached();
});
