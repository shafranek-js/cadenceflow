import { expect, test } from "@playwright/test";

const acceptanceModes = [
  { width: 1280, height: 720, theme: "light" },
  { width: 1280, height: 720, theme: "dark" },
  { width: 1920, height: 1080, theme: "light" },
  { width: 1920, height: 1080, theme: "dark" },
] as const;

async function selectCardAndPress(
  page: import("@playwright/test").Page,
  functionId: string,
  key: "Shift+Equal" | "NumpadAdd",
) {
  const card = page.getByTestId(`chord-card-${functionId}`).locator(".chord-main");
  await card.click();
  await card.focus();
  await page.keyboard.press(key);
}

async function activateHistoryAction(
  page: import("@playwright/test").Page,
  action: "Undo" | "Redo",
) {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

for (const acceptance of acceptanceModes) {
  test(`T211 selected Matrix chord plus shortcut at ${acceptance.width}x${acceptance.height} ${acceptance.theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: acceptance.width, height: acceptance.height });
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", {
        name: acceptance.theme === "light" ? "Light theme" : "Dark theme",
      })
      .click();

    const steps = page.getByTestId("progression-step");
    const focusToggle = page.getByTestId("matrix-focus-toggle");
    await expect(steps).toHaveCount(0);

    await focusToggle.focus();
    await page.keyboard.press("Shift+Equal");
    await expect(steps).toHaveCount(0);

    const viewSelect = page.getByLabel("Global Card View");
    await viewSelect.focus();
    await viewSelect.dispatchEvent("keydown", { key: "+", code: "NumpadAdd" });
    await expect(steps).toHaveCount(0);

    await selectCardAndPress(page, "I", "Shift+Equal");
    await expect(steps).toHaveCount(1);

    await selectCardAndPress(page, "bIII", "NumpadAdd");
    await expect(steps).toHaveCount(2);

    const selectedBIII = page.getByTestId("chord-card-bIII").locator(".chord-main");
    await selectedBIII.dispatchEvent("keydown", {
      key: "+",
      code: "NumpadAdd",
      repeat: true,
    });
    await expect(steps).toHaveCount(2);

    await selectCardAndPress(page, "bVI", "Shift+Equal");
    const routeDialog = page.getByRole("dialog", { name: "Confirm harmonic route" });
    await expect(routeDialog).toBeVisible();
    await expect(steps).toHaveCount(2);
    await routeDialog.getByTestId("route-add-anyway").click();
    await expect(steps).toHaveCount(3);

    await activateHistoryAction(page, "Undo");
    await expect(steps).toHaveCount(2);
    await activateHistoryAction(page, "Redo");
    await expect(steps).toHaveCount(3);

    await focusToggle.click();
    await expect(focusToggle).toHaveAttribute("aria-pressed", "true");
    await selectCardAndPress(page, "V", "NumpadAdd");
    await expect(steps).toHaveCount(4);

    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - window.innerWidth,
      matrix: document.querySelector<HTMLElement>(".matrix-panel")
        ? document.querySelector<HTMLElement>(".matrix-panel")!.scrollWidth -
          document.querySelector<HTMLElement>(".matrix-panel")!.clientWidth
        : Number.POSITIVE_INFINITY,
    }));
    expect(overflow.page).toBeLessThanOrEqual(0);
    expect(overflow.matrix).toBeLessThanOrEqual(0);
  });
}
