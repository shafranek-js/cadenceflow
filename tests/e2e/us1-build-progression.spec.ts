import { test, expect } from "@playwright/test";

test("US1 builds a four-step progression only through explicit Add", async ({ page }) => {
  await page.goto("/");

  // Verify piano audio status indicator is visible
  await expect(page.getByTestId("piano-audio-status")).toBeVisible();

  const first = page.getByTestId("chord-card-I");

  // Ordinary chord-card activation -> Preview/Audition -> progression count unchanged
  await first.locator(".chord-main").click();
  await expect(first).toHaveClass(/is-selected/);
  await expect(first.locator(".chord-main")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("progression-step")).toHaveCount(0);

  // Repeated activation of same card -> still preview/audition, progression still unchanged
  await first.locator(".chord-main").click();
  await expect(first).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(0);

  // Explicit Add button adds to progression
  await first.getByRole("button", { name: /Add I to progression/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(1);

  // Ordinary activation of vi -> Preview/Audition -> progression count remains 1
  const cardVi = page.getByTestId("chord-card-vi");
  await cardVi.locator(".chord-main").click();
  await expect(cardVi).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(1);

  // Explicitly add vi
  await cardVi.getByRole("button", { name: /Add vi to progression/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(2);

  // Keyboard activation of IV with Enter -> Preview/Audition -> progression count remains 2
  const cardIv = page.getByTestId("chord-card-IV");
  await cardIv.locator(".chord-main").focus();
  await page.keyboard.press("Enter");
  await expect(cardIv).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(2);

  // Explicitly add IV
  await cardIv.getByRole("button", { name: /Add IV to progression/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(3);

  // Explicitly add V
  await page
    .getByTestId("chord-card-V")
    .getByRole("button", { name: /Add V to progression/i })
    .click();
  await expect(page.getByTestId("progression-step")).toHaveCount(4);
});
