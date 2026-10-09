import { expect, test, type Page } from "@playwright/test";
import {
  setLayoutMeasuresPerSystem,
  setProgressionView,
} from "./test-helpers/progression-settings";

async function openCreateMelodyDialog(page: Page) {
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await setProgressionView(page, "staff");
  await page.locator("[data-progression-step-select]").last().click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  return page.getByRole("dialog", { name: "Create Melody" });
}

test.describe("T188 — canonical Melody instrument picker", () => {
  test("exposes all GM programs in grouped searchable Step picker", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    const dialog = await openCreateMelodyDialog(page);
    const picker = dialog.getByRole("combobox", {
      name: "Melody Instrument",
      exact: true,
    });
    await expect(picker.locator("option")).toHaveCount(129);
    await expect(picker.locator("optgroup")).toHaveCount(16);
    await expect(picker.locator("option[value='gm-081']")).toContainText("Lead 2 (sawtooth)");

    await picker.selectOption("gm-081");
    await expect(dialog.locator(".melody-instrument-picker-status")).toContainText(
      "GM 081 · Lead 2 (sawtooth) · Realtime",
    );
    await expect(page.getByLabel("Melody Instrument search")).toBeVisible();
  });

  test("previews a Step override from local assets without external soundfont requests", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    const dialog = await openCreateMelodyDialog(page);
    const picker = dialog.getByRole("combobox", { name: "Melody Instrument", exact: true });
    const search = dialog.getByLabel("Melody Instrument search");
    const externalSoundfontRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("gleitz.github.io")) externalSoundfontRequests.push(request.url());
    });
    await page.route("https://gleitz.github.io/**", (route) => route.abort());

    await search.fill("Electric Guitar clean");
    await expect(picker.locator("option[value='gm-027']")).toContainText("Electric Guitar (clean)");
    await picker.selectOption("gm-027");

    const play = dialog.getByRole("button", { name: "Play melody preview" });
    await expect(play).toBeEnabled();
    const localResponse = page.waitForResponse(
      (response) => response.url().endsWith("/audio/soundfont/electric_guitar_clean-mp3.js"),
      { timeout: 60_000 },
    );
    await play.click();
    expect((await localResponse).status()).toBe(200);
    expect(externalSoundfontRequests).toEqual([]);
    await expect(dialog.getByRole("button", { name: "Stop melody preview" })).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "Stop melody preview" }).click();
  });

  test("previews Church Organ locally", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    const dialog = await openCreateMelodyDialog(page);
    const picker = dialog.getByRole("combobox", { name: "Melody Instrument", exact: true });
    await picker.selectOption("gm-019");

    const localResponse = page.waitForResponse(
      (response) => response.url().endsWith("/audio/soundfont/church_organ-mp3.js"),
      { timeout: 60_000 },
    );
    await dialog.getByRole("button", { name: "Play melody preview" }).click();
    expect((await localResponse).status()).toBe(200);
    await expect(dialog.getByRole("button", { name: "Stop melody preview" })).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "Stop melody preview" }).click();
  });

  test("keeps the Measures per system menu inside a 1280x720 viewport", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    await page
      .getByTestId("progression-heading")
      .getByRole("heading", { name: "My Progression" })
      .click({ button: "right" });
    await page.getByTestId("progression-menu-open-layout").hover();
    const submenu = page.getByTestId("progression-menu-layout-submenu");
    await expect(submenu).toBeVisible();
    const box = await submenu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    await page.getByTestId("progression-menu-layout-1").click();
    await expect(page.getByTestId("progression-heading")).toBeVisible();
  });

  test("keeps the canonical picker reachable across themes, viewports, and 200% pressure", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    await page.setViewportSize({ width: 1280, height: 720 });
    const theme = page.getByRole("group", { name: "Theme" });

    for (const themeName of ["Dark theme", "Light theme"] as const) {
      await theme.getByRole("button", { name: themeName, exact: true }).click();
      const dialog = await openCreateMelodyDialog(page);
      const picker = dialog.getByRole("combobox", { name: "Melody Instrument", exact: true });
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(picker).toBeVisible();
        await expect(dialog.getByLabel("Melody Instrument search")).toBeVisible();
        const bounds = await dialog.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        ).toBeLessThanOrEqual(0);
      }
      await dialog.getByRole("button", { name: "Cancel" }).click();
    }

    // A 640x360 CSS viewport models the reduced layout viewport at 200% zoom.
    await page.setViewportSize({ width: 640, height: 360 });
    const dialog = await openCreateMelodyDialog(page);
    const picker = dialog.getByRole("combobox", { name: "Melody Instrument", exact: true });
    await expect(picker).toBeVisible();
    await picker.scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Apply Melody" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("loads and plays an available Step override instead of the global instrument", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    const dialog = await openCreateMelodyDialog(page);
    const picker = dialog.getByRole("combobox", { name: "Melody Instrument", exact: true });
    await picker.selectOption("cello");

    const sampleResponse = page.waitForResponse(
      (response) => response.url().endsWith("/audio/melody/FluidR3_GM/cello-mp3.js"),
      { timeout: 60_000 },
    );
    await dialog.getByRole("button", { name: "Play melody preview" }).click();
    expect((await sampleResponse).status()).toBe(200);
    await expect(dialog.getByRole("button", { name: "Stop melody preview" })).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "Stop melody preview" }).click();
  });

  test("labels each active Staff lane and omits it from later systems", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    let dialog = await openCreateMelodyDialog(page);
    await dialog.getByLabel("Melody Instrument", { exact: true }).selectOption("cello");
    await dialog.getByRole("button", { name: "Apply Melody" }).click();
    await expect(dialog).toHaveCount(0);

    dialog = await openCreateMelodyDialog(page);
    await dialog.getByLabel("Melody Instrument", { exact: true }).selectOption("violin");
    await dialog.getByRole("button", { name: "Apply Melody" }).click();
    await expect(dialog).toHaveCount(0);

    await setProgressionView(page, "staff");
    await setLayoutMeasuresPerSystem(page, 1);
    const systems = page.getByTestId("progression-score-system");
    await expect(systems).toHaveCount(2);
    await expect(
      systems.nth(0).getByTestId("score-system-melody-lane-label-cello"),
    ).toHaveAttribute("aria-label", "Melody lane Cello");
    await expect(systems.nth(0).getByTestId("score-system-melody-lane-label-violin")).toHaveCount(
      0,
    );
    await expect(systems.nth(1).getByTestId("score-system-melody-lane-label-cello")).toHaveCount(0);
    await expect(
      systems.nth(1).getByTestId("score-system-melody-lane-label-violin"),
    ).toHaveAttribute("aria-label", "Melody lane Violin");
  });
});
