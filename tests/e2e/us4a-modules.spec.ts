import { test, expect } from "@playwright/test";

test("US4A switches modules while keeping progression and global Matrix Card View state", async ({
  page,
}) => {
  await page.goto("/");
  const globalView = page.getByLabel("Global Card View");
  await globalView.selectOption("piano");
  await expect(page.getByTestId("chord-card-I").locator(".mini-piano")).toBeVisible();
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });

  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(1);
  await expect(page.getByTestId("chord-card-N6")).toBeVisible();
  await expect(page.getByTestId("chord-card-i").locator(".mini-piano")).toBeVisible();
  await globalView.selectOption("staff");
  await expect(page.getByTestId("chord-card-i").locator(".mini-staff")).toBeVisible();

  await page.getByRole("button", { name: /Progressions/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(1);
  await expect(page.getByTestId("chord-card-I").locator(".mini-staff")).toBeVisible();

  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await expect(page.getByTestId("chord-card-i").locator(".mini-staff")).toBeVisible();
});
