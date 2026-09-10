import { test, expect } from "@playwright/test";

test("US1 builds a four-step progression through Ctrl-click", async ({ page }) => {
  await page.goto("/");

  // Verify piano audio status indicator is visible
  await expect(page.getByTestId("piano-audio-status")).toBeVisible();

  const first = page.getByTestId("chord-card-I");
  await expect(first.getByRole("button", { name: /Add I to progression/i })).toHaveCount(0);
  await expect(first.locator(".chord-main")).toHaveAttribute(
    "title",
    "Click to preview; Ctrl-click to add to My Progression; Alt-click to reset card settings",
  );

  // Ordinary chord-card activation via mouse -> Preview/Audition -> progression count unchanged
  await first.locator(".chord-main").click();
  await expect(first).toHaveClass(/is-selected/);
  await expect(first.locator(".chord-main")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("progression-step")).toHaveCount(0);

  // Keyboard activation on card I via Enter -> still preview/audition, progression still unchanged
  await first.locator(".chord-main").focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(0);

  // Repeated Enter activation on same card -> still preview/audition, progression still unchanged
  await page.keyboard.press("Enter");
  await expect(first).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(0);

  // Keyboard activation on card I via Space -> still preview/audition, progression still unchanged
  await page.keyboard.press("Space");
  await expect(first).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(0);

  // Ctrl-click previews the card and adds it to progression
  await first.locator(".chord-main").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("progression-step")).toHaveCount(1);

  // Ordinary activation of vi -> Preview/Audition -> progression count remains 1
  const cardVi = page.getByTestId("chord-card-vi");
  await cardVi.locator(".chord-main").click();
  await expect(cardVi).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(1);

  // Ctrl-click adds vi once while retaining the card preview path
  await cardVi.locator(".chord-main").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("progression-step")).toHaveCount(2);

  // Keyboard activation of IV with Enter -> Preview/Audition -> progression count remains 2
  const cardIv = page.getByTestId("chord-card-IV");
  await cardIv.locator(".chord-main").focus();
  await page.keyboard.press("Enter");
  await expect(cardIv).toHaveClass(/is-selected/);
  await expect(page.getByTestId("progression-step")).toHaveCount(2);

  // Ctrl-click adds IV
  await cardIv.locator(".chord-main").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("progression-step")).toHaveCount(3);

  // Ctrl-click adds V
  await page
    .getByTestId("chord-card-V")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await expect(page.getByTestId("progression-step")).toHaveCount(4);
});
