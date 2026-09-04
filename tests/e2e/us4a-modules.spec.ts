import { test, expect } from "@playwright/test";

test("US4A switches modules while keeping progression and independent Matrix Card View state", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("group", { name: "View for I" })
    .getByRole("button", { name: "piano" })
    .click();
  await page
    .getByTestId("chord-card-I")
    .getByRole("button", { name: /Add I to progression/i })
    .click();

  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(1);
  await expect(page.getByTestId("chord-card-N6")).toBeVisible();
  await page
    .getByRole("group", { name: "View for i" })
    .getByRole("button", { name: "staff" })
    .click();

  await page.getByRole("button", { name: /Progressions/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(1);
  await expect(
    page.getByRole("group", { name: "View for I" }).getByRole("button", { name: "piano" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await expect(
    page.getByRole("group", { name: "View for i" }).getByRole("button", { name: "staff" }),
  ).toHaveAttribute("aria-pressed", "true");
});
