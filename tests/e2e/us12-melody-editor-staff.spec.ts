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
  test("auditions an unapplied Melody draft with the local sampled instrument", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openStudio(page);
    await addChord(page, "I");

    const step = page.locator("[data-progression-step-select]").last();
    await step.click({ button: "right" });
    const menu = page.getByRole("menu", { name: /Melody actions/ });
    await menu.getByRole("menuitem", { name: "Create Melody…" }).click();

    const dialog = page.getByRole("dialog", { name: "Create Melody" });
    const play = dialog.getByRole("button", { name: "Play melody preview" });
    await expect(play).toBeEnabled();
    const previewSvg = dialog.getByTestId("melody-staff-measure").locator("svg");
    await expect(previewSvg).toBeVisible();
    expect(
      await previewSvg.evaluate((svg) => {
        const surface = svg.getBoundingClientRect();
        return [...svg.querySelectorAll(".vf-stavenote")].every((note) => {
          const bounds = note.getBoundingClientRect();
          return bounds.left >= surface.left && bounds.right <= surface.right;
        });
      }),
    ).toBe(true);

    const sampleResponse = page.waitForResponse(
      (response) => response.url().endsWith("/audio/melody/FluidR3_GM/flute-mp3.js"),
      { timeout: 60_000 },
    );
    await play.click();
    expect((await sampleResponse).status()).toBe(200);

    const stop = dialog.getByRole("button", { name: "Stop melody preview" });
    await expect(stop).toBeVisible({ timeout: 60_000 });
    await stop.click();
    await expect(play).toBeVisible();
  });

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

    const staffEvents = page.getByTestId("progression-measure").locator(".measure-staff-event");
    await expect(staffEvents).toHaveCount(3);
    const firstStep = staffEvents.first();
    await firstStep.locator(".measure-staff-event-select").click();
    const selectedInspector = page.getByTestId("step-performance-inspector");
    await selectedInspector
      .getByRole("textbox", { name: "Duration in canonical quarter-note beats" })
      .fill("3");
    await selectedInspector.getByRole("button", { name: "Set custom duration in beats" }).click();

    const secondStep = staffEvents.nth(1);
    await secondStep.locator(".measure-staff-event-select").click();
    await selectedInspector
      .getByRole("textbox", { name: "Duration in canonical quarter-note beats" })
      .fill("3/4");
    await selectedInspector.getByRole("button", { name: "Set custom duration in beats" }).click();

    const thirdStep = staffEvents.nth(2);
    const thirdSelect = thirdStep.locator(".measure-staff-event-select");
    await thirdSelect.focus();
    await page.keyboard.press("Enter");
    await selectedInspector.getByTestId("duration-preset-eighth").click();

    const step = thirdStep;
    const select = step.locator(".measure-staff-event-select");
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
    await expect(controls).toContainText("Melody audio ready", { timeout: 60_000 });
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

    await select.click();
    await expect
      .poll(
        () =>
          page
            .locator(
              '.measure-staff > svg[data-staff-playing-entries]:not([data-staff-playing-entries=""])',
            )
            .count(),
        { intervals: [20, 20, 40, 60, 80] },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page
            .locator(
              '[data-testid="melody-staff-measure"] svg[data-staff-playing-entries]:not([data-staff-playing-entries=""])',
            )
            .count(),
        { intervals: [20, 20, 40, 60, 80] },
      )
      .toBe(1);
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
    const selectedMelodyNote = page.locator(".melody-staff-note.is-selected").first();
    await expect(selectedMelodyNote).toHaveCSS("background-color", "rgb(241, 228, 213)");
    await expect(selectedMelodyNote).toHaveCSS("color", "rgb(36, 23, 14)");
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
