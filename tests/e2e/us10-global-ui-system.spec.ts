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

    const transportLabels = (
      await playbackTransport.locator(".transport-label").allTextContents()
    ).map((label) => label.trim());
    expect(transportLabels).toContain("Tempo");
    expect(transportLabels).not.toEqual(expect.arrayContaining(["Meter", "Step Duration"]));
    await expect(
      page.getByTestId("progression-global-inspector").getByText("Time signature & meter"),
    ).toBeVisible();
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
      "Click or Enter to preview; Ctrl-click or Ctrl+Enter to add; when selected, press + to add to My Progression; Alt-click to reset card settings",
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
    expect(tokens.space).toEqual(["3px", "6px", "10px", "14px", "20px"]);
    expect(tokens.radii).toEqual(["6px", "4px", "3px"]);
    expect(tokens.bodySize).toBe("12px");
  });

  test("keeps wrapped progression and toolbar inside the page at desktop zoom levels", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await addSteps(page, 20);
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(20);
    const theme = page.getByRole("group", { name: "Theme" });

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      for (const themeName of ["Dark", "Light"] as const) {
        await theme.getByRole("button", { name: `${themeName} theme` }).click();
        for (const zoom of [1, 1.25, 1.5]) {
          await page.evaluate((value) => {
            document.documentElement.style.zoom = `${value}`;
          }, zoom);
          await expectNoPageHorizontalScroll(page);
          const outOfBoundsControls = await page
            .locator("button, select, input")
            .evaluateAll((controls) =>
              controls
                .filter((control) => (control as HTMLElement).offsetParent !== null)
                .map((control) => {
                  const bounds = control.getBoundingClientRect();
                  return {
                    name:
                      control.getAttribute("aria-label") ??
                      control.textContent?.trim() ??
                      "control",
                    left: bounds.left,
                    right: bounds.right,
                  };
                })
                .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1),
            );
          expect(
            outOfBoundsControls,
            `${viewport.width}x${viewport.height} ${themeName.toLowerCase()} at ${zoom * 100}%`,
          ).toEqual([]);
        }
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  });

  test("captures T195 non-Staff layout evidence at desktop sizes and 200% pressure", async ({
    page,
  }, testInfo) => {
    await waitForStudio(page);
    await addSteps(page, 3);
    await page.getByLabel("Progression Card View").selectOption("harmonic");
    await expect(page.getByLabel("Note color mode")).toBeVisible();
    const measurements: Array<Record<string, unknown>> = [];
    const theme = page.getByRole("group", { name: "Theme" });

    for (const viewport of [
      { width: 1280, height: 720, pressure: false },
      { width: 1920, height: 1080, pressure: false },
      { width: 640, height: 360, pressure: true },
    ]) {
      await page.setViewportSize(viewport);
      for (const themeName of ["Dark", "Light"] as const) {
        await theme.getByRole("button", { name: `${themeName} theme` }).click();
        await expectNoPageHorizontalScroll(page);
        const snapshot = await page.evaluate(() => {
            const rect = (element: Element | null) => {
              if (!(element instanceof HTMLElement)) return null;
              const bounds = element.getBoundingClientRect();
              return {
                left: bounds.left,
                right: bounds.right,
                top: bounds.top,
                bottom: bounds.bottom,
                width: bounds.width,
                height: bounds.height,
              };
            };
            const stack = document.querySelector<HTMLElement>(".progression-measures-stack");
            const noteColorSelect = document.querySelector<HTMLElement>(
              '[aria-label="Note color mode"]',
            );
            const noteColorLabel = noteColorSelect?.closest("label") ?? null;
            const measures = Array.from(
              document.querySelectorAll<HTMLElement>(
                '.progression-measures-stack [data-testid="progression-measure"]',
              ),
            ).map((measure) => rect(measure));
            const visibleControls = Array.from(
              document.querySelectorAll<HTMLElement>("button, select, input"),
            )
              .filter((control) => control.offsetParent !== null)
              .map((control) => {
                const bounds = control.getBoundingClientRect();
                return {
                  name:
                    control.getAttribute("aria-label") ??
                    control.getAttribute("title") ??
                    control.textContent?.trim() ??
                    control.tagName.toLowerCase(),
                  left: bounds.left,
                  right: bounds.right,
                  top: bounds.top,
                  bottom: bounds.bottom,
                };
              })
              .filter(
                ({ left, right, top, bottom }) =>
                  right > 0 && left < window.innerWidth && bottom > 0 && top < window.innerHeight,
              );
            return {
              viewport: { width: window.innerWidth, height: window.innerHeight },
              document: {
                clientWidth: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth,
                bodyScrollWidth: document.body.scrollWidth,
              },
              stack: rect(stack),
              noteColorLabel: rect(noteColorLabel),
              noteColorSelect: rect(noteColorSelect),
              measures,
              visibleControls,
            };
          });

        const outOfBoundsControls = snapshot.visibleControls.filter(
          ({ left, right }) => left < -1 || right > viewport.width + 1,
        );
        const pressureLabel = viewport.pressure ? "200%-equivalent pressure" : "100%";
        expect(
          outOfBoundsControls,
          `${viewport.width}x${viewport.height} ${themeName.toLowerCase()} at ${pressureLabel}`,
        ).toEqual([]);
        expect(snapshot.document.scrollWidth).toBeLessThanOrEqual(snapshot.document.clientWidth);
        expect(snapshot.document.bodyScrollWidth).toBeLessThanOrEqual(viewport.width);
        expect(snapshot.stack).not.toBeNull();
        expect(snapshot.noteColorLabel).not.toBeNull();
        expect(snapshot.noteColorSelect).not.toBeNull();
        expect(snapshot.noteColorSelect!.left).toBeGreaterThanOrEqual(-1);
        expect(snapshot.noteColorSelect!.right).toBeLessThanOrEqual(viewport.width + 1);
        expect(snapshot.measures).toHaveLength(3);
        for (const [index, measure] of snapshot.measures.entries()) {
          expect(measure).not.toBeNull();
          expect(measure!.left).toBeGreaterThanOrEqual(snapshot.stack!.left - 2);
          expect(measure!.right).toBeLessThanOrEqual(snapshot.stack!.right + 2);
          if (index > 0) {
            expect(measure!.top).toBeGreaterThan(snapshot.measures[index - 1]!.bottom!);
          }
        }
        measurements.push({
          theme: themeName.toLowerCase(),
          viewportLabel: viewport.pressure ? "200%-equivalent pressure" : "desktop",
          effectiveZoomPercent: viewport.pressure ? 200 : 100,
          width: viewport.width,
          height: viewport.height,
          ...snapshot,
        });

        const image = await page.screenshot({ fullPage: true });
        await testInfo.attach(
          `t195-layout-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${viewport.pressure ? "200percent-pressure" : "100percent"}.png`,
          { body: image, contentType: "image/png" },
        );
      }
    }

    await testInfo.attach("t195-layout-measurements.json", {
      body: JSON.stringify(measurements, null, 2),
      contentType: "application/json",
    });
  });
});
