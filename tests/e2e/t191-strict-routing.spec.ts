import { expect, test, type Page } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

async function boot(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.matrix-panel[data-module="progressions"]')).toBeVisible();
  await setProgressionView(page, "staff");
}

async function progressionCount(page: Page): Promise<number> {
  return page.locator(".measure-staff-event-select").count();
}

async function addWithControl(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

test.describe("T191 strict routing", () => {
  test("uses targetId as the sole best match and confirms tension-to-tension overrides", async ({
    page,
  }) => {
    await boot(page, 1280, 720);
    await page.getByTestId("global-settings-toggle").click();
    await page
      .getByTestId("global-settings-panel")
      .getByLabel("Show recommendation context")
      .check();
    await page.keyboard.press("Escape");
    await addWithControl(page, "V7/V");

    await expect(page.getByTestId("chord-card-V")).toHaveAttribute("data-recommendation", "best");
    await expect(page.getByTestId("chord-card-V7/ii")).toHaveAttribute(
      "data-recommendation",
      "blocked",
    );
    const recommendationInspector = page.locator("details.recommendation-inspector");
    await recommendationInspector.locator("summary").click();
    await expect(
      recommendationInspector.getByTestId("recommendation-blocked-routes"),
    ).toContainText("V7/ii");
    expect(await progressionCount(page)).toBe(1);

    await addWithControl(page, "V7/ii");
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toBeVisible();
    await expect(page.getByTestId("route-warning-message")).toContainText("Directed tension");
    expect(await progressionCount(page)).toBe(1);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toHaveCount(0);
    expect(await progressionCount(page)).toBe(1);
    await expect(page.getByTestId("chord-card-V7/V").locator(".chord-main")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const blockedCard = page.getByTestId("chord-card-V7/ii");
    await expect(blockedCard.locator(".recommendation-badge")).toHaveText("!Confirm");
    await blockedCard.locator(".chord-main").click();
    await expect(blockedCard.locator(".chord-main")).toHaveAttribute("aria-pressed", "true");
    await blockedCard.locator(".chord-main").focus();
    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toBeVisible();
    await page.getByRole("button", { name: "Add anyway" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toHaveCount(0);
    expect(await progressionCount(page)).toBe(2);
  });

  test("enforces the Modal Interchange corridor with non-mutating cancel", async ({ page }) => {
    await boot(page, 1280, 720);
    await addWithControl(page, "bIII");
    expect(await progressionCount(page)).toBe(1);

    await addWithControl(page, "bVI");
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toBeVisible();
    await expect(page.getByTestId("route-warning-message")).toContainText("modal interchange");
    await page.getByRole("button", { name: "Cancel" }).click();
    expect(await progressionCount(page)).toBe(1);

    await addWithControl(page, "bVI");
    await page.getByRole("button", { name: "Add anyway" }).click();
    expect(await progressionCount(page)).toBe(2);
  });

  test("applies the same corridor guard inside a temporary branch", async ({ page }) => {
    await boot(page, 1280, 720);
    await addWithControl(page, "I");

    await page
      .getByTestId("progression-heading")
      .getByRole("heading", { name: "My Progression" })
      .click({ button: "right" });
    await page.getByTestId("progression-menu-open-explore-alternative").hover();
    await page.getByTestId("progression-menu-branch-end").click();
    await expect(page.getByTestId("branch-controls-active")).toBeVisible();

    const modalEntry = page.getByTestId("chord-card-bIII").locator(".chord-main");
    await modalEntry.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("branch-alternative-path")).toContainText("bIII");

    const blockedModal = page.getByTestId("chord-card-bVI").locator(".chord-main");
    await blockedModal.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("branch-alternative-path")).not.toContainText("bVI");
    expect(await progressionCount(page)).toBe(1);

    await blockedModal.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Add anyway" }).click();
    await expect(page.getByTestId("branch-alternative-path")).toContainText("bVI");
    expect(await progressionCount(page)).toBe(1);
  });

  test("keeps source/target arrows, playback highlight, themes, and layout pressure", async ({
    page,
  }) => {
    for (const [width, height] of [
      [1920, 1080],
      [1280, 720],
      [640, 360],
    ] as const) {
      await boot(page, width, height);
      for (const theme of ["light", "dark"] as const) {
        await page
          .getByRole("button", { name: theme === "light" ? "Light theme" : "Dark theme" })
          .click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const source = page.getByTestId("chord-card-V7");
        await source.locator(".chord-main").click();
        await expect(page.getByTestId("matrix-resolution-arrows-overlay")).toBeVisible();
        await expect(page.getByTestId("chord-card-I")).toHaveAttribute(
          "data-resolution-target",
          "true",
        );

        await addWithControl(page, "I");
        await addWithControl(page, "V");
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await expect(page.locator(".chord-card.is-playing").first()).toBeVisible({
          timeout: 10_000,
        });
        await page.getByRole("button", { name: "Stop", exact: true }).click();

        const metrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewportWidth: window.innerWidth,
        }));
        expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
        expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      }
    }
  });
});
