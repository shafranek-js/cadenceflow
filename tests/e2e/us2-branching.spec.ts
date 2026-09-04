import { test, expect } from "@playwright/test";

test("US2 explores a mid-progression branch, compares paths, rejoins, and commits", async ({ page }) => {
  await page.goto("/");
  for (const fn of ["I", "vi", "IV", "V"]) await page.getByTestId(`chord-card-${fn}`).getByRole("button", { name: new RegExp(`Add ${fn.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} to progression`) }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(4);

  await page.getByLabel("Branch origin").selectOption({ label: "After 2: vi" });
  await page.getByRole("button", { name: "Explore Alternative" }).click();
  await page.getByLabel("Branch rejoin").selectOption({ label: "4: V" });

  await page.getByTestId("chord-card-ii").locator(".chord-main").click();
  await page.getByTestId("chord-card-V7/V").locator(".chord-main").click();
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toContainText("IV");
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toContainText("V7/V");

  await page.getByRole("button", { name: "Commit Branch" }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(5);
  await expect(page.getByTestId("progression-step").nth(2)).toHaveText("ii");
  await expect(page.getByTestId("progression-step").nth(3)).toHaveText("V7/V");
  await expect(page.getByTestId("progression-step").nth(4)).toHaveText("V");
});
