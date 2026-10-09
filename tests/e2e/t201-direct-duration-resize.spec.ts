import { expect, test, type Page } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await page.getByTestId("progression-view-btn-tablature").click();
}

async function addChord(page: Page, functionId = "I"): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function preparePianoRollChordPair(page: Page) {
  await addChord(page, "I");
  await addChord(page, "IV");
  await setProgressionView(page, "piano-roll");
  const selectedChord = page.locator(".piano-roll-chord").last();
  await selectedChord.click();
  await expect(selectedChord).toHaveAttribute("aria-pressed", "true");
  const selectedStepId = await selectedChord.getAttribute("data-source-step-id");
  if (!selectedStepId) throw new Error("The selected Piano Roll chord has no stable Step ID");
  const handle = page.locator(
    `.piano-roll-chord-boundary-handle[data-boundary-step-id="${selectedStepId}"][data-boundary-edge="right"]`,
  );
  await expect(handle).toBeVisible();
  return handle;
}

async function setSelectedDuration(page: Page, value: string): Promise<void> {
  const inspector = page.getByTestId("step-performance-inspector");
  await expect(inspector).toBeVisible();
  const input = inspector.getByRole("textbox", {
    name: "Duration in canonical quarter-note beats",
  });
  await input.fill(value);
  await inspector.getByRole("button", { name: "Set custom duration in beats" }).click();
}

async function setTheme(page: Page, name: "Dark theme" | "Light theme"): Promise<void> {
  await page
    .getByRole("group", { name: "Theme" })
    .getByRole("button", { name, exact: true })
    .click();
}

test.describe("T201 — direct duration resize", () => {
  test("keeps pointer preview transient, keyboard on the same candidate set, and focus stable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    const handle = await preparePianoRollChordPair(page);
    await expect(handle).toHaveAttribute("role", "slider");
    await expect(handle).toHaveAttribute("aria-valuetext", /beats/);
    await expect(handle).toHaveAttribute("title", /Arrow Left\/Right/);
    const beforeKeyboardPreview = await handle.getAttribute("aria-valuenow");

    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    await expect(handle).toHaveClass(/is-previewing/);
    const keyboardPreview = await handle.getAttribute("aria-valuenow");
    expect(keyboardPreview).not.toBe(beforeKeyboardPreview);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).toBeFocused();
    await expect(handle).not.toHaveClass(/is-previewing/);
    await expect(handle).toHaveAttribute("aria-valuenow", beforeKeyboardPreview!);

    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    const committedValue = await handle.getAttribute("aria-valuenow");
    expect(committedValue).not.toBe(beforeKeyboardPreview);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute("aria-valuenow", committedValue!);

    const beforePointerPreview = await handle.getAttribute("aria-valuenow");
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 - 32, box!.y + box!.height / 2);
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    await expect(handle).toHaveClass(/is-previewing/);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).toBeFocused();
    await expect(handle).not.toHaveClass(/is-previewing/);
    await expect(handle).toHaveAttribute("aria-valuenow", beforePointerPreview!);
  });

  test("commits a pointer drag once without moving the score during preview", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    const handle = await preparePianoRollChordPair(page);
    const before = await handle.getAttribute("aria-valuenow");
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    const measureBox = await page.locator(".piano-roll-measure").first().boundingBox();
    expect(measureBox).not.toBeNull();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    await page.mouse.move(x - 32, y, { steps: 4 });
    await expect(page.getByTestId("duration-resize-status")).toBeVisible();
    expect((await handle.boundingBox())!.y).toBe(box!.y);
    expect((await page.locator(".piano-roll-measure").first().boundingBox())!.y).toBe(
      measureBox!.y,
    );
    const previewValue = await handle.getAttribute("aria-valuenow");
    expect(previewValue).not.toBe(before);
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).toHaveAttribute("aria-valuenow", previewValue!);
  });

  test("clicking a Piano Roll boundary only focuses it and leaves the boundary unchanged", async ({
    page,
  }) => {
    await openStudio(page);
    const handle = await preparePianoRollChordPair(page);
    const before = await handle.getAttribute("aria-valuenow");
    await handle.click();
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute("aria-valuenow", before!);
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  });

  test("dragging the Piano Roll right boundary left shortens the preceding Step", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    const handle = await preparePianoRollChordPair(page);
    await handle.scrollIntoViewIfNeeded();
    const before = Number(await handle.getAttribute("aria-valuenow"));
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 50, y, { steps: 4 });
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    expect(Number(await handle.getAttribute("aria-valuenow"))).toBeLessThan(before);
    await page.mouse.up();
    expect(Number(await handle.getAttribute("aria-valuenow"))).toBeLessThan(before);
  });

  test("places one Piano Roll handle on a long Step's final fragment and excludes Rest", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page);
    await setProgressionView(page, "piano-roll");
    const chord = page.locator(".piano-roll-chord").first();
    const stepId = await chord.getAttribute("data-source-step-id");
    if (!stepId) throw new Error("The long Piano Roll Step has no stable ID");
    await chord.click();
    await setSelectedDuration(page, "6");

    const rightHandle = page.locator(
      `.piano-roll-chord-boundary-handle[data-boundary-step-id="${stepId}"][data-boundary-edge="right"]`,
    );
    await expect(
      page
        .getByRole("region", { name: "Measure 1" })
        .locator(
          `.piano-roll-chord-boundary-handle[data-boundary-step-id="${stepId}"][data-boundary-edge="right"]`,
        ),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Measure 2" })
        .locator(
          `.piano-roll-chord-boundary-handle[data-boundary-step-id="${stepId}"][data-boundary-edge="right"]`,
        ),
    ).toHaveCount(1);
    await rightHandle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    await page.keyboard.press("Escape");
    await expect(rightHandle).toBeFocused();

    const heading = page.getByTestId("progression-heading");
    await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
    await page.getByTestId("progression-menu-add-rest").click();
    const rest = page.locator(".piano-roll-chord.is-rest").last();
    await expect(rest).toBeVisible();
    const restStepId = await rest.getAttribute("data-source-step-id");
    if (!restStepId) throw new Error("The Rest Step has no stable ID");
    await expect(
      page.locator(`.piano-roll-chord-boundary-handle[data-boundary-step-id="${restStepId}"]`),
    ).toHaveCount(0);
  });

  test("keeps Step-resize controls in Piano Roll, not Staff or Tablature", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "IV");

    for (const view of ["staff", "tablature"] as const) {
      await setProgressionView(page, view);
      await expect(page.locator("[data-duration-resize-handle]")).toHaveCount(0);
      await expect(page.locator(".piano-roll-chord-boundary-handle")).toHaveCount(0);
    }
    await setProgressionView(page, "piano-roll");
    const selectedChord = page.locator(".piano-roll-chord").last();
    await selectedChord.click();
    await expect(selectedChord).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".piano-roll-chord-boundary-handle").first()).toBeVisible();
  });

  test("commits a left-edge Piano Roll resize without moving the score", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "IV");
    await setProgressionView(page, "piano-roll");
    const secondChord = page.locator(".piano-roll-chord").nth(1);
    await secondChord.click();
    await expect(secondChord).toHaveAttribute("aria-pressed", "true");
    const secondStepId = await secondChord.getAttribute("data-source-step-id");
    if (!secondStepId) throw new Error("The second Piano Roll Step has no stable ID");
    const handle = page.locator(
      `.piano-roll-chord-boundary-handle[data-boundary-step-id="${secondStepId}"][data-boundary-edge="left"]`,
    );
    await expect(handle).toBeVisible();
    await handle.scrollIntoViewIfNeeded();
    const before = Number(await handle.getAttribute("aria-valuenow"));
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    const measureY = (await page.locator(".piano-roll-measure").nth(1).boundingBox())!.y;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 32, y, { steps: 4 });
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    expect((await handle.boundingBox())!.y).toBe(box!.y);
    expect((await page.locator(".piano-roll-measure").nth(1).boundingBox())!.y).toBe(measureY);
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    expect(Number(await handle.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  });

  test("keeps Staff renderable after a triplet-length Rest before a chord", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openStudio(page);
    await addChord(page);

    const heading = page.getByTestId("progression-heading");
    await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
    await page.getByTestId("progression-menu-add-rest").click();
    await page.locator(".measure-staff-event.is-rest [data-progression-step-select]").click();
    await setSelectedDuration(page, "1/3");
    await addChord(page, "V");
    await page.getByLabel("Progression Card View").selectOption("staff");

    await expect(page.locator(".score-system-canvas svg").first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("keeps SVG beams finite after a run of exact resized durations", async ({ page }) => {
    await openStudio(page);
    for (const duration of ["1/4", "7/24", "1/4", "1/4", "71/24"]) {
      await addChord(page);
      await page.locator("[data-progression-step-select]").last().click();
      await setSelectedDuration(page, duration);
    }

    for (const index of [0, 1, 2, 3, 4]) {
      await page.locator("[data-progression-step-select]").nth(index).click({ button: "right" });
      await page
        .getByRole("menu", { name: /Melody actions/ })
        .getByRole("menuitem", { name: "Create Melody…" })
        .click();
      await page
        .getByRole("dialog", { name: "Create Melody" })
        .getByRole("button", { name: "Apply Melody" })
        .click();
    }

    for (const view of ["staff", "tablature"] as const) {
      await page.getByLabel("Progression Card View").selectOption(view);
      await expect(page.locator(".score-system-canvas svg").first()).toBeVisible();
      await expect(page.locator(".score-system-canvas svg .vf-beam").first()).toBeAttached();
      await expect(page.locator('.score-system-canvas svg path[d*="NaN"]')).toHaveCount(0);
    }
  });

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ] as const) {
    test(`survives ${viewport.width}x${viewport.height}, light/dark, and 200% pressure`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openStudio(page);
      const handle = await preparePianoRollChordPair(page);
      await expect(handle).toBeVisible();

      for (const theme of ["Dark theme", "Light theme"] as const) {
        await setTheme(page, theme);
        await expect(handle).toBeVisible();
        await handle.focus();
        await expect(handle).toHaveAttribute("aria-valuetext", /beats/);
      }

      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
        window.dispatchEvent(new Event("resize"));
      });
      await handle.scrollIntoViewIfNeeded();
      await expect(handle).toBeVisible();
      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
      await page.evaluate(() => {
        document.documentElement.style.zoom = "";
      });
    });
  }
});
