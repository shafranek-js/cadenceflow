import { expect, test, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as unknown as {
      __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
    };
    testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Playback Transport" })).toBeVisible();
}

async function expectNoPageHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
  }));
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollX).toBe(0);
}

async function addSteps(page: Page, count: number): Promise<void> {
  const functionIds = ["I", "vi", "IV", "V"] as const;
  for (let index = 0; index < count; index += 1) {
    await page
      .getByTestId(`chord-card-${functionIds[index % functionIds.length]!}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
}

test.describe("US10 Batch 4 — global UI system", () => {
  test("organizes toolbar groups and keeps transport ownership unambiguous", async ({ page }) => {
    await waitForStudio(page);
    await ensureHistoryControlsVisible(page);

    await expect(page.getByRole("group", { name: "Application controls" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Expertise mode" })).toBeVisible();
    await expect(page.getByRole("group", { name: "History Controls" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Timing Controls" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Playback Support" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Progression playback controls" })).toBeVisible();

    const progressionPanel = page.getByRole("region", { name: "My Progression" });
    await expect(progressionPanel.locator('nav[aria-label="Playback Transport"]')).toBeVisible();
    await expect(
      progressionPanel.locator('[role="group"][aria-label="Timing Controls"]'),
    ).toBeVisible();
    await expect(progressionPanel.locator('[aria-label="History Controls"]')).toHaveCount(0);

    const playbackTransport = page.getByRole("navigation", { name: "Playback Transport" });
    await expect(playbackTransport.getByRole("button", { name: "Play", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Redo", exact: true })).toHaveCount(1);

    expect(await page.locator(".ui-icon").count()).toBeGreaterThan(10);
    await expect(page.locator(".project-selector-button .ui-icon-disclosure")).toBeVisible();
    await expect(page.getByTestId("chord-card-I").locator(".card-settings-button")).toHaveCount(0);

    const labels = (await page.locator(".transport-label").allTextContents()).map((label) =>
      label.trim(),
    );
    expect(labels).toEqual(
      expect.arrayContaining(["Tempo", "Meter", "Step Duration"]),
    );
    expect(
      await page
        .locator(".transport-label")
        .first()
        .evaluate((element) => getComputedStyle(element).textTransform),
    ).toBe("none");

    await page.getByTestId("project-menu-toggle").click();
    const menu = page.getByRole("menu", { name: "Project actions" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("group", { name: "Portable project actions" })).toBeVisible();
    await expect(menu.getByRole("button", { name: /Save Project As/ })).toBeVisible();
    await expect(menu.getByRole("button", { name: /Open Project File/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("export-menu-toggle").click();
    const exportMenu = page.getByRole("menu", { name: "Export menu" });
    await expect(exportMenu.getByTestId("project-export-btn")).toBeVisible();
    await expect(exportMenu.getByTestId("export-midi-btn")).toBeVisible();
    await expect(exportMenu.getByTestId("export-musicxml-btn")).toBeVisible();
  });

  test("keeps frequent hit areas stable and prevents geometry movement on hover", async ({
    page,
  }) => {
    await waitForStudio(page);
    const chordMain = page.getByTestId("chord-card-I").locator(".chord-main");

    await chordMain.scrollIntoViewIfNeeded();
    await expect(chordMain).toHaveAttribute(
      "title",
      "Click to preview; Ctrl-click to add to My Progression; Alt-click to reset card settings",
    );
    const before = await chordMain.boundingBox();
    expect(before).not.toBeNull();
    expect(before?.width).toBeGreaterThanOrEqual(32);
    expect(before?.height).toBeGreaterThanOrEqual(32);
    const mainBefore = await chordMain.boundingBox();
    await chordMain.hover();
    const mainAfter = await chordMain.boundingBox();
    expect(mainBefore).not.toBeNull();
    expect(mainAfter).not.toBeNull();
    expect(mainAfter?.x).toBe(mainBefore?.x);
    expect(mainAfter?.y).toBe(mainBefore?.y);
    expect(mainAfter?.width).toBe(mainBefore?.width);
    expect(mainAfter?.height).toBe(mainBefore?.height);

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        space: ["--space-1", "--space-2", "--space-3", "--space-4", "--space-5"].map((name) =>
          style.getPropertyValue(name).trim(),
        ),
        radii: ["--radius-panel", "--radius-card", "--radius-control"].map((name) =>
          style.getPropertyValue(name).trim(),
        ),
        bodySize: getComputedStyle(document.body).fontSize,
      };
    });
    expect(tokens.space).toEqual(["4px", "8px", "12px", "16px", "24px"]);
    expect(tokens.radii).toEqual(["12px", "10px", "7px"]);
    expect(tokens.bodySize).toBe("14px");
  });

  test("keeps wrapped progression and toolbar inside the page at desktop zoom levels", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await addSteps(page, 20);
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(20);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      for (const zoom of [1, 1.25, 1.5]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = `${value}`;
        }, zoom);
        await expectNoPageHorizontalScroll(page);
        const visibleControls = await page
          .locator("button, select, input")
          .evaluateAll((controls) =>
            controls
              .filter((control) => (control as HTMLElement).offsetParent !== null)
              .map((control) => ({
                name:
                  control.getAttribute("aria-label") ?? control.textContent?.trim() ?? "control",
                right: control.getBoundingClientRect().right,
              }))
              .filter(({ right }) => right > window.innerWidth + 1),
          );
        expect(visibleControls, `${viewport.width}x${viewport.height} at ${zoom * 100}%`).toEqual(
          [],
        );
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  });
});
