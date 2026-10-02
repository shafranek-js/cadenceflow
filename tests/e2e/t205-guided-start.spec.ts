import { expect, test, type Page } from "@playwright/test";

async function openEmptyStudio(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("guided-start")).toBeVisible();
}

async function progressionCount(page: Page): Promise<number> {
  return page.getByTestId("progression-step").count();
}

async function expectOneHistoryEntry(page: Page, expectedCount: number): Promise<void> {
  const editToggle = page.getByTestId("edit-menu-toggle");
  await editToggle.click();
  const undo = page.getByRole("menu", { name: "Edit menu" }).getByRole("menuitem", {
    name: "Undo",
  });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByTestId("progression-step")).toHaveCount(0);
  await editToggle.click();
  const redo = page.getByRole("menu", { name: "Edit menu" }).getByRole("menuitem", {
    name: "Redo",
  });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.getByTestId("progression-step")).toHaveCount(expectedCount);
}

test.describe("T205 — Guided Start", () => {
  test("Blank project keeps the project empty and dismisses beginner guidance", async ({
    page,
  }) => {
    await openEmptyStudio(page);

    await page.getByTestId("guided-start-blank").click();
    await expect(page.getByTestId("progression-step")).toHaveCount(0);
    await expect(page.getByTestId("guided-start")).toHaveCount(0);
    await expect(page.getByTestId("progression-empty-dismissed")).toBeVisible();
    await page.getByTestId("edit-menu-toggle").click();
    await expect(
      page.getByRole("menu", { name: "Edit menu" }).getByRole("menuitem", { name: "Undo" }),
    ).toBeDisabled();
  });

  test("Guided progression previews without mutation, then uses the existing Matrix Add route", async ({
    page,
  }) => {
    await openEmptyStudio(page);

    await page.getByTestId("guided-start-guided").click();
    await expect(page.getByTestId("guided-start-flow")).toBeVisible();
    await page.getByTestId("guided-start-focus-key").click();
    await expect(page.getByLabel(/^Set key /).first()).toBeFocused();

    const firstCard = page.getByTestId("chord-card-I").locator(".chord-main");
    await firstCard.click();
    await expect(page.getByTestId("progression-step")).toHaveCount(0);

    await page.getByTestId("guided-start-guided-back").click();
    await expect(page.getByTestId("guided-start-paths")).toBeVisible();
    await firstCard.click();
    await expect(page.getByTestId("progression-step")).toHaveCount(0);

    await firstCard.click({ modifiers: ["Control"] });
    await expect(page.getByTestId("progression-step")).toHaveCount(1);
    await expect(page.getByTestId("guided-start")).toHaveCount(0);
    await expectOneHistoryEntry(page, 1);
  });

  test("Quick starter is one undoable formula operation", async ({ page }) => {
    await openEmptyStudio(page);

    await page.getByTestId("quick-starter-formula-gospel-lift").click();
    const count = await progressionCount(page);
    expect(count).toBeGreaterThan(0);
    await expect(page.getByTestId("guided-start")).toHaveCount(0);
    await expectOneHistoryEntry(page, count);
    await page.getByTestId("edit-menu-toggle").click();
    await page
      .getByRole("menu", { name: "Edit menu" })
      .getByRole("menuitem", { name: "Undo" })
      .click();
    await expect(page.getByTestId("progression-step")).toHaveCount(0);
    await expect(page.getByTestId("guided-start")).toHaveCount(0);
    await expect(page.getByTestId("progression-empty-dismissed")).toBeVisible();
  });

  test("Example uses the built-in preset route and supports Undo/Redo", async ({ page }) => {
    await openEmptyStudio(page);

    await page.getByTestId("guided-start-example").click();
    await expect(page.getByTestId("progression-step")).toHaveCount(4);
    await expect(page.getByTestId("guided-start")).toHaveCount(0);
    await expectOneHistoryEntry(page, 4);
  });

  test("Example follows the active Dark Harmony module", async ({ page }) => {
    await openEmptyStudio(page);
    await page.getByRole("button", { name: /^Dark Harmony/ }).click();
    await expect(page.locator('.matrix-panel[data-module="dark-harmony"]')).toBeVisible();
    await page.getByTestId("guided-start-example").click();
    await expect(page.getByTestId("progression-step")).toHaveCount(4);
    await expect(page.getByTestId("progression-step").first()).toContainText("i");
    await expectOneHistoryEntry(page, 4);
  });

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ] as const) {
    test(`keeps all start paths reachable in ${viewport.width}x${viewport.height}, both themes, and 200% pressure`, async ({
      page,
    }) => {
      await openEmptyStudio(page, viewport);
      const theme = page.getByRole("group", { name: "Theme" });

      for (const themeName of ["Dark theme", "Light theme"] as const) {
        await theme.getByRole("button", { name: themeName, exact: true }).click();
        await expect(page.getByTestId("guided-start")).toBeVisible();
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        const viewportWidth = await page.evaluate(() => window.innerWidth);
        expect(width).toBeLessThanOrEqual(viewportWidth + 2);
      }

      await page.setViewportSize({ width: 640, height: 360 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
        window.dispatchEvent(new Event("resize"));
      });
      await page.getByTestId("guided-start-example").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("guided-start-example")).toBeVisible();
      const outOfBounds = await page
        .locator("[data-testid='guided-start'] button")
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => (button as HTMLElement).offsetParent !== null)
            .map((button) => {
              const box = button.getBoundingClientRect();
              return { left: box.left, right: box.right };
            })
            .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1),
        );
      expect(outOfBounds).toEqual([]);
    });
  }
});
