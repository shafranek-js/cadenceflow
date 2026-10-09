import { expect, test, type Page } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function activateHistoryAction(page: Page, action: "Undo" | "Redo"): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function openMelodyDialog(page: Page, stepIndex = 0) {
  const step = page.locator("[data-progression-step-select]").nth(stepIndex);
  await step.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  return page.getByRole("dialog", { name: "Create Melody" });
}

test.describe("T197 + T192 — schema v6, note roles, and Target Notes", () => {
  test("keeps Suggest and Preview local, then applies one reversible target-note edit", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "V");
    await setProgressionView(page, "staff");

    let dialog = await openMelodyDialog(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();

    const originalTheme = await page.locator("html").getAttribute("data-theme");
    const oppositeTheme = originalTheme === "light" ? "dark" : "light";
    await page
      .getByRole("group", { name: "Theme" })
      .getByRole("button", {
        name: oppositeTheme === "light" ? "Light theme" : "Dark theme",
        exact: true,
      })
      .click();
    await activateHistoryAction(page, "Undo");
    await expect(page.locator("html")).toHaveAttribute("data-theme", originalTheme!);
    await page.getByTestId("edit-menu-toggle").click();
    await expect(
      page.getByRole("menu", { name: "Edit menu" }).getByRole("menuitem", { name: /Redo/ }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");

    dialog = await openMelodyDialog(page);
    await dialog.getByTestId("melody-target-suggest").click();
    const candidates = dialog
      .getByRole("group", { name: "Suggested target notes" })
      .getByRole("button");
    await expect(candidates.first()).toBeVisible();
    await candidates.first().focus();
    await page.keyboard.press("Enter");
    await expect(candidates.first()).toHaveAttribute("aria-pressed", "true");
    await dialog.getByTestId("melody-target-preview").click();
    await expect(dialog.locator(".melody-staff-note").last()).toHaveAttribute(
      "data-target-next",
      "true",
    );
    await expect(dialog.getByTestId("melody-target-status")).toContainText("remains a draft");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    const firstStep = page.locator("[data-progression-step-select]").first();
    await firstStep.click({ button: "right" });
    let menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Edit Melody…" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByTestId("edit-menu-toggle").click();
    await expect(
      page.getByRole("menu", { name: "Edit menu" }).getByRole("menuitem", { name: /Redo/ }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");

    dialog = await openMelodyDialog(page);
    await dialog.getByTestId("melody-target-suggest").click();
    const applyCandidates = dialog
      .getByRole("group", { name: "Suggested target notes" })
      .getByRole("button");
    await applyCandidates.first().click();
    await dialog.getByTestId("melody-target-preview").click();
    await dialog.getByRole("button", { name: "Apply Melody" }).click();

    await firstStep.click({ button: "right" });
    menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu.getByRole("menuitem", { name: "Edit Melody…" })).toBeVisible();
    await page.keyboard.press("Escape");

    await activateHistoryAction(page, "Undo");
    await firstStep.click({ button: "right" });
    menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Edit Melody…" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await activateHistoryAction(page, "Redo");
    await firstStep.click({ button: "right" });
    menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu.getByRole("menuitem", { name: "Edit Melody…" })).toBeVisible();
  });

  test("shows accessible harmonic-role cues at both desktop sizes and themes without overflow", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openStudio(page);
    const theme = page.getByRole("group", { name: "Theme" });
    const globalInspector = page.getByTestId("progression-global-inspector");
    await globalInspector.getByLabel("Note color mode").selectOption("harmonic-role");
    await page.getByLabel("Global Card View").selectOption("piano");

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      for (const colorTheme of ["light", "dark"] as const) {
        await theme
          .getByRole("button", {
            name: colorTheme === "light" ? "Light theme" : "Dark theme",
            exact: true,
          })
          .click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorTheme);

        const piano = page.locator(".mini-piano[role='img']").first();
        await expect(piano).toBeVisible();
        const pianoLabel = await piano.getAttribute("aria-label");
        expect(pianoLabel).toMatch(/Harmonic roles:.*root/);
        expect(pianoLabel).toContain("chord tone");
        expect(pianoLabel).toContain("scale tone");
        expect(pianoLabel).toContain("altered");
        await expect(page.locator(".mini-piano-role-legend").first()).toBeVisible();
        await expect(page.locator(".mini-piano [data-harmonic-role]").first()).toHaveAttribute(
          "data-harmonic-role",
          /^(root|chord-tone|scale-tone|altered)$/,
        );

        const viewportMetrics = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }));
        expect(viewportMetrics.documentWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth);
      }
    }
  });
});
