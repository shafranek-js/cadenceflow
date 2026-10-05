import { expect, test, type Page } from "@playwright/test";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await page.getByTestId("progression-view-btn-piano").click();
}

async function addChord(page: Page, functionId = "I"): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
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
    await addChord(page);

    const handle = page.locator("[data-duration-resize-handle]").first();
    await expect(handle).toHaveCount(1);
    await expect(handle).toHaveAttribute("role", "slider");
    await expect(handle).toHaveAttribute("aria-valuetext", /beats/);
    await expect(handle).toHaveAttribute("title", /Arrow Left\/Right/);
    const beforePointerPreview = await page
      .locator("[data-progression-step-select]")
      .first()
      .textContent();

    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview:");
    await expect(handle).toHaveAttribute("data-resize-preview", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).toBeFocused();
    await expect(page.locator("[data-progression-step-select]").first()).toHaveText(
      beforePointerPreview ?? "",
    );

    const box = await handle.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 32, box!.y + box!.height / 2);
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview:");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).toBeFocused();

    await handle.focus();
    await page.keyboard.press("ArrowRight");
    const previewValue = await handle.getAttribute("aria-valuetext");
    expect(previewValue).toMatch(/beats/);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).toBeFocused();
    await expect(handle).toHaveAttribute("aria-valuetext", previewValue!);
  });

  test("commits a pointer drag once without moving the score during preview", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page);

    const handle = page.locator("[data-duration-resize-handle]").first();
    const before = await handle.getAttribute("aria-valuenow");
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    expect(box).toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(page.getByTestId("duration-resize-status")).toBeVisible();
    await page.mouse.move(x - 120, y, { steps: 4 });
    await expect(page.getByTestId("duration-resize-status")).toBeVisible();
    expect((await handle.boundingBox())!.y).toBe(box!.y);
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(handle).not.toHaveAttribute("aria-valuenow", before!);
  });

  test("clicking the resize handle only focuses it and leaves the duration unchanged", async ({
    page,
  }) => {
    await openStudio(page);
    await addChord(page);

    for (const view of ["piano", "staff", "tablature"] as const) {
      await page.getByLabel("Progression Card View").selectOption(view);
      const handle = page.locator("[data-duration-resize-handle]").first();
      const before = await handle.getAttribute("aria-valuenow");
      await handle.click();
      await expect(handle).toBeFocused();
      await expect(handle).toHaveAttribute("aria-valuenow", before!);
      await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    }
  });

  test("dragging left shortens a Staff step", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page);
    await page.getByLabel("Progression Card View").selectOption("staff");

    const handle = page.locator("[data-duration-resize-handle]").first();
    await handle.scrollIntoViewIfNeeded();
    const before = Number(await handle.getAttribute("aria-valuenow"));
    const box = await handle.boundingBox();
    expect(box).toBeTruthy();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 50, y, { steps: 4 });
    await expect(page.getByTestId("duration-resize-status")).toBeVisible();
    expect(Number(await handle.getAttribute("aria-valuenow"))).toBeLessThan(before);
    await page.mouse.up();
    expect(Number(await handle.getAttribute("aria-valuenow"))).toBeLessThan(before);
  });

  test("places one handle only on a continuation's final visible fragment and excludes Rest", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page);
    await page
      .locator('[data-progression-step-select="true"]')
      .first()
      .click()
      .catch(() => undefined);
    await page.locator("[data-progression-step-select]").first().click();
    await setSelectedDuration(page, "6");

    await expect(page.locator("[data-testid=progression-step-continuation]")).toHaveCount(1);
    await expect(
      page.locator("[data-testid=progression-step-continuation] [data-duration-resize-handle]"),
    ).toHaveCount(1);
    await expect(page.locator(".progression-step-card [data-duration-resize-handle]")).toHaveCount(
      0,
    );

    const continuationHandle = page.locator(
      "[data-testid=progression-step-continuation] [data-duration-resize-handle]",
    );
    await continuationHandle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview:");
    await page.keyboard.press("Escape");
    await expect(continuationHandle).toBeFocused();

    const heading = page.getByTestId("progression-heading");
    await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
    await page.getByTestId("progression-menu-add-rest").click();
    await expect(page.locator(".progression-rest-card")).toHaveCount(1);
    await expect(page.locator(".progression-rest-card [data-duration-resize-handle]")).toHaveCount(
      0,
    );
  });

  test("keeps the same final-fragment handle in Staff and Tablature overlays", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page);

    for (const view of ["staff", "tablature"] as const) {
      await page.getByLabel("Progression Card View").selectOption(view);
      const handle = page.locator("[data-duration-resize-handle]").first();
      await expect(handle).toBeVisible();
      await handle.focus();
      await page.keyboard.press("ArrowLeft");
      await expect(page.getByTestId("duration-resize-status")).toContainText("Preview:");
      await page.keyboard.press("Escape");
      await expect(handle).toBeFocused();
    }
  });

  test("commits pointer resize on Staff and Tablature without moving the score", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page);

    for (const view of ["staff", "tablature"] as const) {
      await page.getByLabel("Progression Card View").selectOption(view);
      const handle = page.locator("[data-duration-resize-handle]").first();
      await handle.scrollIntoViewIfNeeded();
      const before = await handle.getAttribute("aria-valuenow");
      const box = await handle.boundingBox();
      expect(box).toBeTruthy();
      const x = box!.x + box!.width / 2;
      const y = box!.y + box!.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 50, y, { steps: 4 });
      await expect(page.getByTestId("duration-resize-status")).toBeVisible();
      expect((await handle.boundingBox())!.y).toBe(box!.y);
      await page.mouse.up();
      await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
      expect(Number(await handle.getAttribute("aria-valuenow"))).toBeLessThan(Number(before));
    }
  });

  test("keeps Staff renderable after a triplet-length Rest before a chord", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openStudio(page);
    await addChord(page);

    const heading = page.getByTestId("progression-heading");
    await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
    await page.getByTestId("progression-menu-add-rest").click();
    await page.locator(".progression-rest-card .progression-step-select-button").click();
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
      await addChord(page);
      const handle = page.locator("[data-duration-resize-handle]").first();
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
