import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

test("Staff and rhythmic TAB follow the audio clock through melody silence", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });

  const fixture = await readFile(
    new URL("../fixtures/staff-guitar-first.cadenceflow", import.meta.url),
  );
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "staff-guitar-first.cadenceflow",
    mimeType: "application/json",
    buffer: fixture,
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText("first", {
    timeout: 30_000,
  });

  const viewSelector = page.getByLabel("Progression Card View");
  await viewSelector.selectOption("staff");
  await page.getByRole("button", { name: "Toggle Loop" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();

  const playhead = page.locator(".score-system-playhead:visible").first();
  await expect(playhead).toBeVisible({ timeout: 10_000 });
  const firstX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
  await page.waitForTimeout(250);
  const movedX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
  expect(movedX).toBeGreaterThan(firstX + 2);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
  await page.waitForTimeout(250);
  expect(await playhead.evaluate((element) => element.getBoundingClientRect().left)).toBeCloseTo(
    pausedX,
    0,
  );
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForTimeout(250);
  expect(
    await playhead.evaluate((element) => element.getBoundingClientRect().left),
  ).toBeGreaterThan(pausedX + 2);

  const soundingNotes = page.locator('[data-staff-sounding="true"]');
  await expect(soundingNotes.first()).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: testInfo.outputPath("staff-guitar-active-melody-1280x720.png") });
  await page.waitForFunction(
    () => {
      const activeMeasure = [
        ...document.querySelectorAll<HTMLElement>(".score-system-active-measure"),
      ].find((element) => getComputedStyle(element).display !== "none");
      return (
        activeMeasure?.dataset.measureIndex === "4" &&
        document.querySelectorAll('[data-staff-sounding="true"]').length === 0
      );
    },
    undefined,
    { timeout: 20_000 },
  );
  expect(await soundingNotes.count()).toBe(0);
  const playheadDuringSilence = page.locator(".score-system-playhead:visible").first();
  const silenceStartX = await playheadDuringSilence.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  await page.waitForTimeout(40);
  const silenceEndX = await playheadDuringSilence.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  expect(silenceEndX).toBeGreaterThan(silenceStartX + 2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();

  const themeGroup = page.getByRole("group", { name: "Theme" });
  const viewCases = [
    { view: "staff", label: "staff" },
    { view: "tablature", label: "tab" },
  ] as const;
  const viewportCases = [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ] as const;

  for (const viewCase of viewCases) {
    await viewSelector.selectOption(viewCase.view);
    await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
    for (const viewport of viewportCases) {
      await page.setViewportSize(viewport);
      for (const themeName of ["Dark", "Light"] as const) {
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        const currentTheme = await page.locator(":root").getAttribute("data-theme");
        if (currentTheme !== themeName.toLowerCase()) {
          await themeGroup.getByRole("button", { name: `${themeName} theme` }).click();
        }
        await page.evaluate(() => {
          const activeMeasure = [
            ...document.querySelectorAll<HTMLElement>(".score-system-active-measure"),
          ].find((element) => getComputedStyle(element).display !== "none");
          activeMeasure
            ?.closest(".score-system")
            ?.querySelector(".score-system-header")
            ?.scrollIntoView({
              block: "center",
            });
        });
        await expect(page.locator(".score-system-playhead:visible").first()).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(
            `staff-guitar-${viewCase.label}-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}.png`,
          ),
        });
      }
    }
  }

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator(".score-system-playhead:visible")).toHaveCount(0);
  await expect(page.locator('[data-staff-sounding="true"]')).toHaveCount(0);
});
