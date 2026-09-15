import { expect, test, type Page } from "@playwright/test";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

async function openCreateMelodyDialog(page: Page) {
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
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

  test("previews the Step override by loading it from CDN", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    const dialog = await openCreateMelodyDialog(page);
    const picker = dialog.getByRole("combobox", { name: "Melody Instrument", exact: true });
    const search = dialog.getByLabel("Melody Instrument search");

    await search.fill("Electric Guitar clean");
    await expect(picker.locator("option[value='gm-027']")).toContainText("Electric Guitar (clean)");
    await picker.selectOption("gm-027");

    const play = dialog.getByRole("button", { name: "Play melody preview" });
    await expect(play).toBeEnabled();
    // gm-027 is now realtime via CDN — it should load and start playing
    const cdnResponse = page.waitForResponse(
      (response) =>
        response.url().includes("gleitz.github.io") &&
        response.url().includes("electric_guitar_clean"),
      { timeout: 60_000 },
    );
    await play.click();
    expect((await cdnResponse).status()).toBe(200);
    await expect(dialog.getByRole("button", { name: "Stop melody preview" })).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "Stop melody preview" }).click();
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

    await page.getByLabel("Progression Card View").selectOption("staff");
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
