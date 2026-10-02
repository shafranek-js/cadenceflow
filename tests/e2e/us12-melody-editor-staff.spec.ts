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

  test("browses every Pitch Motion with pointer and keyboard while preserving draft axes", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");

    const step = page.locator("[data-progression-step-select]").last();
    const openCreateDialog = async () => {
      await step.click({ button: "right" });
      const menu = page.getByRole("menu", { name: /Melody actions/ });
      await menu.getByRole("menuitem", { name: "Create Melody…" }).click();
      return page.getByRole("dialog", { name: "Create Melody" });
    };

    let dialog = await openCreateDialog();
    await dialog.getByLabel("Rhythm").selectOption("dotted");
    await dialog.getByLabel("Connection").selectOption("tie-repeated");
    await dialog.getByLabel("Grid").selectOption("sixteenth-triplet");
    await dialog.getByLabel("Octave offset").selectOption("1");
    await dialog.getByLabel("Melody Instrument", { exact: true }).selectOption("cello");

    const browse = dialog.getByRole("button", { name: "Browse motions" });
    await browse.click();
    const gallery = dialog.getByTestId("melody-pitch-motion-gallery");
    await expect(gallery.getByRole("radio")).toHaveCount(10);
    await expect(gallery.getByRole("heading", { name: "Directional" })).toBeVisible();
    await expect(gallery.getByRole("heading", { name: "Shapes" })).toBeVisible();
    await expect(gallery.getByRole("heading", { name: "Pedal & Alternating" })).toBeVisible();
    await expect(gallery.locator(".melody-pitch-motion-contour")).toHaveCount(10);

    const notationBefore = await dialog
      .getByTestId("melody-staff-measure")
      .getAttribute("aria-label");
    await gallery.locator('[data-pitch-motion="outside-in"]').click();
    await expect(dialog.getByLabel("Pitch Motion", { exact: true })).toHaveValue("outside-in");
    await expect(dialog.getByLabel("Rhythm")).toHaveValue("dotted");
    await expect(dialog.getByLabel("Connection")).toHaveValue("tie-repeated");
    await expect(dialog.getByLabel("Grid")).toHaveValue("sixteenth-triplet");
    await expect(dialog.getByLabel("Octave offset")).toHaveValue("1");
    await expect(dialog.getByLabel("Melody Instrument", { exact: true })).toHaveValue("cello");
    await expect
      .poll(() => dialog.getByTestId("melody-staff-measure").getAttribute("aria-label"))
      .not.toBe(notationBefore);

    const outsideIn = gallery.locator('[data-pitch-motion="outside-in"]');
    await outsideIn.focus();
    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByLabel("Pitch Motion", { exact: true })).toHaveValue("inside-out");
    await expect(gallery.locator('[data-pitch-motion="inside-out"]')).toBeFocused();
    await expect(gallery.locator('[data-pitch-motion="inside-out"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.keyboard.press("Escape");
    await expect(gallery).toHaveCount(0);
    await expect(browse).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Create Melody" })).toHaveCount(0);

    dialog = await openCreateDialog();
    await expect(dialog.getByLabel("Pitch Motion", { exact: true })).toHaveValue("up");
    await expect(dialog.getByLabel("Rhythm")).toHaveValue("even");
    await expect(dialog.getByLabel("Connection")).toHaveValue("retrigger");
    await expect(dialog.getByLabel("Grid")).toHaveValue("eighth");
    await expect(dialog.getByLabel("Octave offset")).toHaveValue("0");
    await expect(dialog.getByLabel("Melody Instrument", { exact: true })).toHaveValue("flute");
    await dialog.getByLabel("Pitch Motion", { exact: true }).selectOption("down");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog", { name: "Create Melody" })).toHaveCount(0);

    dialog = await openCreateDialog();
    await dialog.getByLabel("Rhythm").selectOption("reverse-dotted");
    await dialog.getByLabel("Connection").selectOption("tie-repeated");
    await dialog.getByLabel("Grid").selectOption("quarter");
    await dialog.getByLabel("Octave offset").selectOption("-1");
    await dialog.getByLabel("Melody Instrument", { exact: true }).selectOption("violin");
    await dialog.getByRole("button", { name: "Browse motions" }).click();
    await dialog
      .getByTestId("melody-pitch-motion-gallery")
      .locator('[data-pitch-motion="alternate-top-down"]')
      .click();
    await dialog.getByRole("button", { name: "Apply Melody" }).click();

    await step.click({ button: "right" });
    await page
      .getByRole("menu", { name: /Melody actions/ })
      .getByRole("menuitem", { name: "Edit Melody…" })
      .click();
    const editDialog = page.getByRole("dialog", { name: "Edit Melody" });
    await expect(editDialog.getByLabel("Pitch Motion")).toHaveValue("alternate-top-down");
    await expect(editDialog.getByLabel("Rhythm")).toHaveValue("reverse-dotted");
    await expect(editDialog.getByLabel("Connection")).toHaveValue("tie-repeated");
    await expect(editDialog.getByLabel("Grid")).toHaveValue("quarter");
    await expect(editDialog.getByLabel("Octave offset")).toHaveValue("-1");
    await expect(editDialog.getByLabel("Melody Instrument", { exact: true })).toHaveValue("violin");
    await editDialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("contains the Pitch Motion gallery at desktop sizes, themes, and 200% zoom", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openStudio(page);
    await addChord(page, "I");
    const step = page.locator("[data-progression-step-select]").last();
    const theme = page.getByRole("group", { name: "Theme" });

    for (const themeName of ["Dark theme", "Light theme"] as const) {
      await theme.getByRole("button", { name: themeName, exact: true }).click();
      await step.click({ button: "right" });
      await page
        .getByRole("menu", { name: /Melody actions/ })
        .getByRole("menuitem", { name: "Create Melody…" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Create Melody" });
      const browse = dialog.getByRole("button", { name: "Browse motions" });

      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await browse.click();
        const gallery = dialog.getByTestId("melody-pitch-motion-gallery");
        const bounds = await dialog.evaluate((dialogElement) => {
          const dialogBounds = dialogElement.getBoundingClientRect();
          const galleryBounds = dialogElement
            .querySelector("[data-testid=melody-pitch-motion-gallery]")!
            .getBoundingClientRect();
          return {
            dialog: { left: dialogBounds.left, right: dialogBounds.right },
            gallery: { left: galleryBounds.left, right: galleryBounds.right },
          };
        });
        expect(bounds.gallery.left).toBeGreaterThanOrEqual(bounds.dialog.left - 1);
        expect(bounds.gallery.right).toBeLessThanOrEqual(bounds.dialog.right + 1);
        await expect(dialog.getByTestId("melody-editor-preview")).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Apply Melody" })).toBeVisible();
        await expect(gallery).toHaveCSS("overflow-y", "auto");
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        ).toBeLessThanOrEqual(0);
        await browse.click();
      }

      // A 640x360 CSS viewport models the reduced layout viewport at 200% zoom.
      await page.setViewportSize({ width: 640, height: 360 });
      await browse.click();
      const zoomedGallery = dialog.getByTestId("melody-pitch-motion-gallery");
      await expect(zoomedGallery).toBeVisible();
      await expect(dialog.getByTestId("melody-editor-preview")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
      const cancel = dialog.getByRole("button", { name: "Cancel" });
      await dialog.evaluate((dialogElement) => {
        dialogElement.scrollTop = dialogElement.scrollHeight;
      });
      await cancel.click();
    }
  });

  test("persists non-default Rhythm and Connection through edit and reload", async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    });
    await openStudio(page);
    await addChord(page, "I");
    await setProgressionView(page, "staff");

    const step = page.locator("[data-progression-step-select]").last();
    await step.click({ button: "right" });
    const menu = page.getByRole("menu", { name: /Melody actions/ });
    await menu.getByRole("menuitem", { name: "Create Melody…" }).click();

    const dialog = page.getByRole("dialog", { name: "Create Melody" });
    const preview = dialog.getByTestId("melody-staff-measure");
    await expect(dialog.getByLabel("Rhythm")).toHaveValue("even");
    await expect(dialog.getByLabel("Connection")).toHaveValue("retrigger");
    await dialog.getByLabel("Rhythm").selectOption("dotted");
    await dialog.getByLabel("Connection").selectOption("tie-repeated");
    await expect(preview).toHaveAttribute("aria-label", /for 3\/2 beats/);
    await dialog.getByRole("button", { name: "Apply Melody" }).click();

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const state = (
              window as unknown as {
                __cadenceflow_persistence__?: { lastCompletedProjectSnapshot?: string };
              }
            ).__cadenceflow_persistence__;
            return (
              state?.lastCompletedProjectSnapshot?.includes('"rhythm":"dotted"') === true &&
              state.lastCompletedProjectSnapshot.includes('"connection":"tie-repeated"')
            );
          }),
        { timeout: 30_000, intervals: [50, 100, 250, 500, 1000] },
      )
      .toBe(true);

    await step.click({ button: "right" });
    await page
      .getByRole("menu", { name: /Melody actions/ })
      .getByRole("menuitem", { name: "Edit Melody…" })
      .click();
    let editDialog = page.getByRole("dialog", { name: "Edit Melody" });
    await expect(editDialog.getByLabel("Rhythm")).toHaveValue("dotted");
    await expect(editDialog.getByLabel("Connection")).toHaveValue("tie-repeated");
    await editDialog.getByRole("button", { name: "Cancel" }).click();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
    const reloadedStep = page.locator("[data-progression-step-select]").last();
    await reloadedStep.click({ button: "right" });
    await page
      .getByRole("menu", { name: /Melody actions/ })
      .getByRole("menuitem", { name: "Edit Melody…" })
      .click();
    editDialog = page.getByRole("dialog", { name: "Edit Melody" });
    await expect(editDialog.getByLabel("Rhythm")).toHaveValue("dotted");
    await expect(editDialog.getByLabel("Connection")).toHaveValue("tie-repeated");
    await expect(editDialog.getByTestId("melody-staff-measure")).toHaveAttribute(
      "aria-label",
      /for 3\/2 beats/,
    );
    await editDialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("creates, edits, selects, controls, removes, and undoes a melody", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await expect(page.getByTestId("progression-step")).toHaveCount(1);
    await addChord(page, "V");
    await expect(page.getByTestId("progression-step")).toHaveCount(2);
    await addChord(page, "vi");
    await expect(page.getByTestId("progression-step")).toHaveCount(3);
    await setProgressionView(page, "staff");
    await expect(page.getByTestId("progression-staff-step-grids")).toHaveCount(0);
    await expect(page.locator('[data-view="staff"] [data-testid="progression-step"]')).toHaveCount(
      0,
    );

    const staffEvents = page
      .getByTestId("progression-score-systems")
      .locator(".measure-staff-event");
    await expect(staffEvents).toHaveCount(3);
    const stepIds = await staffEvents
      .locator(".measure-staff-event-select")
      .evaluateAll((targets) => [
        ...new Set(
          targets
            .map((target) => target.getAttribute("data-step-id"))
            .filter((stepId): stepId is string => Boolean(stepId)),
        ),
      ]);
    expect(stepIds).toHaveLength(3);
    const selectForStep = (stepId: string) =>
      page.locator(`[data-progression-step-select][data-step-id="${stepId}"]`).first();

    await selectForStep(stepIds[0]!).click();
    const selectedInspector = page.getByTestId("step-performance-inspector");
    await selectedInspector
      .getByRole("textbox", { name: "Duration in canonical quarter-note beats" })
      .fill("3");
    await selectedInspector.getByRole("button", { name: "Set custom duration in beats" }).click();

    await selectForStep(stepIds[1]!).click();
    await selectedInspector
      .getByRole("textbox", { name: "Duration in canonical quarter-note beats" })
      .fill("3/4");
    await selectedInspector.getByRole("button", { name: "Set custom duration in beats" }).click();

    const thirdSelect = selectForStep(stepIds[2]!);
    await thirdSelect.focus();
    await page.keyboard.press("Enter");
    await selectedInspector.getByTestId("duration-preset-eighth").click();

    const select = selectForStep(stepIds[2]!);
    await expect(select).toHaveAttribute("aria-haspopup", "menu");

    await select.focus();
    await page.keyboard.press("Shift+F10");
    const menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(select).toBeFocused();

    await select.click({ button: "right" });
    await menu.getByRole("menuitem", { name: "Create Melody…" }).click();

    const dialog = page.getByRole("dialog", { name: "Create Melody" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Pitch Motion")).toHaveValue("up");
    await expect(dialog.getByLabel("Rhythm")).toHaveValue("even");
    await expect(dialog.getByLabel("Connection")).toHaveValue("retrigger");
    await expect(dialog.getByLabel("Grid")).toHaveValue("eighth");
    await dialog.getByLabel("Pitch Motion").selectOption("outside-in");
    await dialog.getByLabel("Grid").selectOption("sixteenth-triplet");
    await dialog.getByLabel("Melody Instrument", { exact: true }).selectOption("cello");
    await dialog.getByRole("button", { name: "Apply Melody" }).click();

    const progressionSettings = selectedInspector.getByTestId("selected-progression-settings");
    if (!(await progressionSettings.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await progressionSettings.locator(":scope > summary").click();
    }
    const controls = selectedInspector.getByRole("region", { name: "Melody Track controls" });
    await expect(controls).toBeVisible();
    await expect(
      controls.getByRole("combobox", { name: "Melody Track Instrument", exact: true }),
    ).toHaveValue("flute");
    await expect(controls).toContainText("Melody audio ready", { timeout: 60_000 });
    const scoreSystems = page.getByTestId("progression-score-system");
    await expect(scoreSystems).toHaveCount(1);
    const firstScore = scoreSystems.first();
    const firstSvg = firstScore.locator(".score-system-canvas > svg");
    await expect(firstSvg).toHaveCount(1);
    await expect(firstScore.locator(".score-system-paper")).toHaveCSS(
      "background-color",
      "rgb(255, 253, 247)",
    );

    const alignedStaves = firstSvg.locator(".vf-stave");
    await expect(alignedStaves).toHaveCount(4);
    const staffCanvasBounds = await alignedStaves.evaluateAll((nodes) =>
      nodes.map((node) => {
        const bounds = node.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top };
      }),
    );
    for (const [melodyIndex, harmonyIndex] of [
      [0, 2],
      [1, 3],
    ] as const) {
      expect(
        Math.abs(staffCanvasBounds[melodyIndex]!.left - staffCanvasBounds[harmonyIndex]!.left),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(staffCanvasBounds[melodyIndex]!.right - staffCanvasBounds[harmonyIndex]!.right),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(staffCanvasBounds[melodyIndex]!.top - staffCanvasBounds[harmonyIndex]!.top),
      ).toBeGreaterThan(100);
    }

    await expect(firstSvg).toHaveAttribute("data-staff-system-clefs", "bass,treble");
    await expect(firstSvg).toHaveAttribute("data-staff-meter", "4/4");
    await expect(firstSvg.locator(".vf-clef")).toHaveCount(2);
    await expect(firstSvg.locator(".vf-timesignature")).toHaveCount(2);
    const melodyTargets = page.locator(".score-system .melody-staff-note");
    await expect(melodyTargets).not.toHaveCount(0);
    await expect(page.locator(".melody-staff-note.is-continuation")).not.toHaveCount(0);
    const melodyTargetTexts = await melodyTargets.evaluateAll((targets) =>
      targets.map((target) => target.textContent?.trim() ?? ""),
    );
    expect(melodyTargetTexts.every((text) => text === "")).toBe(true);
    expect(
      await melodyTargets.evaluateAll((targets) =>
        targets.every((target) => {
          const label = target.getAttribute("aria-label") ?? "";
          return /Melody .+ onset .+ duration .+ source chord/.test(label);
        }),
      ),
    ).toBe(true);
    await expect(melodyTargets.first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(melodyTargets.first()).toHaveCSS("box-shadow", "none");
    const selectedMelodyTarget = page
      .locator(".score-system .melody-staff-note.is-selected")
      .first();
    await expect(selectedMelodyTarget).toBeVisible();
    await expect(selectedMelodyTarget).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(selectedMelodyTarget).toHaveCSS("box-shadow", "none");
    await melodyTargets.first().focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const focusMetrics = await melodyTargets.first().evaluate((target) => {
      const targetBounds = target.getBoundingClientRect();
      const notationBounds = [
        ...target.closest(".score-system")!.querySelectorAll(".vf-stave path, .vf-stave line"),
      ].map((notation) => notation.getBoundingClientRect());
      return {
        focused: document.activeElement === target,
        width: targetBounds.width,
        height: targetBounds.height,
        focusRing: getComputedStyle(target).outlineStyle,
        intersectsNotation: notationBounds.some(
          (notation) =>
            targetBounds.left < notation.right &&
            targetBounds.right > notation.left &&
            targetBounds.top < notation.bottom &&
            targetBounds.bottom > notation.top,
        ),
      };
    });
    expect(focusMetrics.focused).toBe(true);
    expect(focusMetrics.width).toBeGreaterThanOrEqual(24);
    expect(focusMetrics.height).toBeGreaterThanOrEqual(24);
    expect(focusMetrics.focusRing).toBe("solid");
    expect(focusMetrics.intersectsNotation).toBe(false);

    await select.click();
    await expect
      .poll(
        () =>
          page
            .locator(
              '.score-system-canvas > svg[data-staff-playing-entries]:not([data-staff-playing-entries=""])',
            )
            .count(),
        { intervals: [20, 20, 40, 60, 80] },
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: testInfo.outputPath("t183-dark-1280x720.png"),
      fullPage: true,
    });
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
    await page.screenshot({
      path: testInfo.outputPath("t183-light-1920x1080.png"),
      fullPage: true,
    });

    const melodyNote = page.locator("[data-melody-event-key]").first();
    await melodyNote.click();
    await expect(select.locator("..")).toHaveClass(/is-selected/);
    await expect(melodyNote).toHaveAttribute(
      "aria-label",
      /Melody .+ onset .+ duration .+ source chord/,
    );

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
    await expect(page.getByTestId("progression-score-system")).toHaveCount(1);
  });
});
