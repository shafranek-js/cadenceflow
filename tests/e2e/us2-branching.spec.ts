import { test, expect } from "@playwright/test";
import { setProgressionView, startBranchAlternative } from "./test-helpers/progression-settings";

test("US2 explores a mid-progression branch, compares paths, rejoins, and commits", async ({
  page,
}) => {
  await page.goto("/");
  for (const fn of ["I", "vi", "IV", "V"])
    await page
      .getByTestId(`chord-card-${fn}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  await setProgressionView(page, "staff");
  const steps = page.locator(".measure-staff-event-select");
  await expect(steps).toHaveCount(4);
  await expect(page.locator('[data-context="composition-intent"]')).toHaveCount(0);

  await startBranchAlternative(page, 1);
  await expect(page.locator('[data-context="composition-intent"]')).toBeVisible();
  await page.getByLabel("Branch rejoin").selectOption({ label: "4: V" });

  await page.getByTestId("chord-card-ii").locator(".chord-main").click();
  await page.getByTestId("chord-card-V7/V").locator(".chord-main").click();
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toContainText(
    "IV",
  );
  await expect(page.getByRole("region", { name: "Original versus Alternative" })).toContainText(
    "V7/V",
  );

  await page.getByRole("button", { name: "Commit Branch" }).click();
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(2)).toHaveAttribute("aria-label", /Select ii ·/);
  await expect(steps.nth(3)).toHaveAttribute("aria-label", /Select V7\/V ·/);
  await expect(steps.nth(4)).toHaveAttribute("aria-label", /Select V ·/);
});
