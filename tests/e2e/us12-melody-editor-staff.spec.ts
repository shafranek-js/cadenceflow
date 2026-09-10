import { expect, test, type Page } from "@playwright/test";

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

test.describe("US12 — melody editor and derived staff", () => {
  test("creates, edits, selects, controls, removes, and undoes a melody", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await expect(page.getByTestId("progression-step")).toHaveCount(1);
    await addChord(page, "V");
    await expect(page.getByTestId("progression-step")).toHaveCount(2);
    await addChord(page, "vi");
    await expect(page.getByTestId("progression-step")).toHaveCount(3);
    await page.getByLabel("Progression Card View").selectOption("staff");

    const firstStep = page.getByTestId("progression-step").first();
    await firstStep.locator("[data-progression-step-select]").click();
    const selectedInspector = page.getByTestId("step-performance-inspector");
    await selectedInspector
      .getByRole("textbox", { name: "Duration in canonical quarter-note beats" })
      .fill("3");
    await selectedInspector.getByRole("button", { name: "Set custom duration in beats" }).click();

    const secondStep = page.getByTestId("progression-step").nth(1);
    await secondStep.locator("[data-progression-step-select]").click();
    await selectedInspector
      .getByRole("textbox", { name: "Duration in canonical quarter-note beats" })
      .fill("3/4");
    await selectedInspector.getByRole("button", { name: "Set custom duration in beats" }).click();

    const thirdStep = page.getByTestId("progression-step").nth(2);
    const thirdSelect = thirdStep.locator("[data-progression-step-select]");
    await thirdSelect.focus();
    await page.keyboard.press("Enter");
    await selectedInspector.getByTestId("duration-preset-eighth").click();

    const step = thirdStep;
    const select = step.locator("[data-progression-step-select]");
    await expect(select).toHaveAttribute("aria-haspopup", "menu");

    await select.focus();
    await page.keyboard.press("Shift+F10");
    const menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(select).toBeFocused();

    await select.click({ button: "right", force: true });
    await menu.getByRole("menuitem", { name: "Create Melody…" }).click();

    const dialog = page.getByRole("dialog", { name: "Create Melody" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Melody Pattern")).toHaveValue("up");
    await expect(dialog.getByLabel("Melody Grid")).toHaveValue("eighth");
    await dialog.getByLabel("Melody Pattern").selectOption("outside-in");
    await dialog.getByLabel("Melody Grid").selectOption("sixteenth-triplet");
    await dialog.getByLabel("Melody Instrument").selectOption("cello");
    await dialog.getByRole("button", { name: "Apply Melody" }).click();

    const progression = page.getByRole("region", { name: "My Progression" });
    const controls = progression.getByRole("region", { name: "Melody Track controls" });
    await expect(controls).toBeVisible();
    await expect(controls.getByLabel("Melody Track Instrument")).toHaveValue("cello");
    await expect(page.getByTestId("melody-staff-measure")).toHaveCount(2);

    const melodySvg = page.getByTestId("melody-staff-measure").first().locator("svg");
    await expect(melodySvg).toHaveAttribute("data-staff-clef", "bass");
    await expect(melodySvg).toHaveAttribute("data-staff-meter", "4/4");
    await expect(melodySvg.locator(".vf-clef")).toHaveCount(1);
    await expect(melodySvg.locator(".vf-timesignature")).toHaveCount(1);
    await expect(page.locator("[data-melody-event-key]")).not.toHaveCount(0);
    await expect(page.locator(".melody-staff-note.is-continuation")).not.toHaveCount(0);
    await expect(
      page.getByTestId("measure-staff-view").first().locator(".measure-staff > svg"),
    ).toHaveAttribute("data-staff-clef", "treble");
    await expect(
      page.getByTestId("measure-staff-view").first().locator(".measure-staff > svg"),
    ).toHaveAttribute("data-staff-meter", "4/4");
    await expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    const theme = page.getByRole("group", { name: "Theme" });
    await theme.getByRole("button", { name: "Dark theme" }).click();
    await expect(theme.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await theme.getByRole("button", { name: "Light theme" }).click();
    await expect(theme.getByRole("button", { name: "Light theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const melodyNote = page.locator("[data-melody-event-key]").first();
    await melodyNote.click();
    await expect(step).toHaveClass(/is-selected/);
    await expect(melodyNote).toHaveAttribute("aria-label", /source chord/);

    await controls.getByRole("button", { name: "Mute Melody Track" }).click();
    await expect(controls.getByRole("button", { name: "Mute Melody Track" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await controls.getByRole("button", { name: "Solo Melody Track" }).click();
    await expect(controls.getByRole("button", { name: "Solo Melody Track" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(controls.getByRole("button", { name: "Mute Melody Track" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await select.click({ button: "right", force: true });
    await expect(menu.getByRole("menuitem", { name: "Edit Melody…" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Remove Melody" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Remove Melody" }).click();
    await expect(controls).toHaveCount(0);

    await page.keyboard.press("Control+Z");
    await expect(page.getByRole("region", { name: "Melody Track controls" })).toBeVisible();
    await expect(page.getByTestId("melody-staff-measure")).toHaveCount(2);
  });
});
