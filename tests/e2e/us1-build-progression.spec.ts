import { test, expect } from "@playwright/test";

test("US1 builds a four-step progression only through explicit Add", async ({ page }) => {
  await page.goto("/");
  const first = page.getByTestId("chord-card-I");
  await first.locator(".chord-main").click();
  await expect(page.getByTestId("progression-step")).toHaveCount(0);
  await first.getByRole("button", { name: /Add I to progression/i }).click();
  await page.getByTestId("chord-card-vi").getByRole("button", { name: /Add vi to progression/i }).click();
  await page.getByTestId("chord-card-IV").getByRole("button", { name: /Add IV to progression/i }).click();
  await page.getByTestId("chord-card-V").getByRole("button", { name: /Add V to progression/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(4);
});
