import { expect, test, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

test.describe("Progression Global Inspector", () => {
  test("displays global progression inspector when no step is selected, switches on step selection, and dismisses back to global", async ({
    page,
  }) => {
    await waitForStudio(page);

    // 1. Initially (empty progression), global inspector is visible
    const globalInspector = page.getByTestId("progression-global-inspector");
    await expect(globalInspector).toBeVisible();
    await expect(globalInspector).toContainText("All Steps & Measures");
    await expect(globalInspector).toContainText("0 steps · Empty progression");
    await expect(
      globalInspector.getByRole("button", { name: "Reset all progression steps to defaults" }),
    ).toBeDisabled();

    // 2. Add chords to progression
    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await page
      .getByTestId("chord-card-IV")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await page
      .getByTestId("chord-card-V")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });

    // 3. Since no step is selected yet, global inspector shows count and enables reset
    await expect(globalInspector).toBeVisible();
    await expect(globalInspector).toContainText("3 measures · 3 steps");
    const resetBtn = globalInspector.getByRole("button", {
      name: "Reset all progression steps to defaults",
    });
    await expect(resetBtn).toBeEnabled();

    // 4. Change articulation globally to arp-up
    const arpUpBtn = globalInspector.getByRole("button", { name: "Articulation: Arp Up" });
    await arpUpBtn.click();
    await expect(
      globalInspector.locator(".template-articulation-disclosure .disclosure-status"),
    ).toContainText("arp-up");

    // 5. Select step 1 -> shifts to single step inspector
    const steps = page.locator('[data-testid="progression-step"]');
    const firstStepSelect = steps.first().getByRole("button", { name: /Select progression step/ });
    await firstStepSelect.click();

    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await expect(globalInspector).toHaveCount(0);

    // Verify step 1 inherited the global change (arp-up)
    await expect(page.locator(".articulation-disclosure .disclosure-status")).toContainText(
      "arp-up",
    );

    // 6. Press Escape to clear selection -> global inspector returns
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("step-performance-inspector")).toHaveCount(0);
    await expect(globalInspector).toBeVisible();
    await expect(globalInspector).toContainText("All Steps & Measures");

    // 7. Test Reset All to Defaults
    await resetBtn.click();
    // After reset, articulation in global disclosure returns to humanized
    await expect(
      globalInspector.locator(".template-articulation-disclosure .disclosure-status"),
    ).toContainText("humanized");

    // 8. Measures Layout is Staff-only and hidden in the default Harmonic view.
    const stepCards = page.locator(".progression-step-cards");
    await expect(stepCards).toHaveAttribute("data-layout", "auto");
    await expect(page.getByLabel("Measures Layout")).toHaveCount(0);
    await expect(
      globalInspector.getByRole("button", { name: "Auto responsive layout" }),
    ).toHaveCount(0);

    await globalInspector.getByRole("button", { name: "Staff view" }).click();
    await expect(stepCards).toHaveAttribute("data-view", "staff");

    // Toggle to 4 Bars from the global inspector
    const fourBarsBtn = globalInspector.getByRole("button", { name: "4 measures per system" });
    await fourBarsBtn.click();
    await expect(stepCards).toHaveAttribute("data-layout", "4");
    const layoutSelect = page.locator(
      '.progression-view-control select[aria-label="Measures Layout"]',
    );
    await expect(layoutSelect).toHaveValue("4");

    // Toggle to 2 Bars from toolbar
    await layoutSelect.selectOption("2");
    await expect(stepCards).toHaveAttribute("data-layout", "2");
    await expect(
      globalInspector.locator(".measures-per-system-disclosure .disclosure-status"),
    ).toContainText("2 / system");
  });
});
