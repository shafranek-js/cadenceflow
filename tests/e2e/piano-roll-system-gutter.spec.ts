import { expect, test } from "@playwright/test";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

test("Piano Roll renders one aligned pitch scale per multi-measure system", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });

  for (const chord of ["I", "V", "vi", "IV"]) {
    await page
      .getByTestId(`chord-card-${chord}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await setLayoutMeasuresPerSystem(page, 2);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  const toolbar = page.getByTestId("piano-roll-toolbar");
  const scales = page.getByTestId("score-system-pitch-layout");
  await expect(scales).toHaveCount(2);

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const mode of ["Degrees", "Chromatic"] as const) {
      await toolbar.getByRole("button", { name: mode }).click();
      await expect(scales.first().locator(".piano-roll-system-pitch-gutter")).toHaveCount(1);
      for (let systemIndex = 0; systemIndex < (await scales.count()); systemIndex += 1) {
        const system = scales.nth(systemIndex);
        const measureBoxes = system.locator(".piano-roll-measure");
        await expect(measureBoxes).not.toHaveCount(0);
        await expect(
          system.getByRole("group", { name: `Pitch scale for System ${systemIndex + 1}` }),
        ).toHaveCount(1);
        const geometry = await system.evaluate((layout) => {
          const gutter = layout.querySelector<HTMLElement>(".piano-roll-system-pitch-gutter")!;
          const scaleRows = [
            ...layout.querySelectorAll<HTMLElement>(".piano-roll-system-pitch-row"),
          ];
          const measures = [...layout.querySelectorAll<HTMLElement>(".piano-roll-measure")];
          const gutterRect = gutter.getBoundingClientRect();
          const firstMeasureRect = measures[0]!.getBoundingClientRect();
          const alignment = measures.map((measure) => {
            const grid = measure.querySelector<HTMLElement>(".piano-roll-grid")!;
            const harmony = measure.querySelector<HTMLElement>(".piano-roll-harmony")!;
            const lane = measure.querySelector<HTMLElement>(".piano-roll-section-timeline")!;
            const gridRect = grid.getBoundingClientRect();
            const harmonyRect = harmony.getBoundingClientRect();
            const laneRect = lane.getBoundingClientRect();
            const rows = [...grid.querySelectorAll<HTMLElement>(".piano-roll-row")];
            const byPitch = new Map(rows.map((row) => [row.dataset.pitchMidi, row]));
            return {
              measureLeft: measure.getBoundingClientRect().left,
              measureRight: measure.getBoundingClientRect().right,
              gridLeft: gridRect.left,
              gridWidth: gridRect.width,
              harmonyLeft: harmonyRect.left,
              harmonyWidth: harmonyRect.width,
              laneLeft: laneRect.left,
              laneWidth: laneRect.width,
              rowLabelsInsideGrid: grid.querySelectorAll(":scope > .piano-roll-row > span").length,
              labelCenters: scaleRows.map((label) => {
                const row = byPitch.get(label.dataset.pitchMidi)!;
                const labelRect = label.getBoundingClientRect();
                const rowRect = row.getBoundingClientRect();
                return {
                  pitch: label.dataset.pitchMidi,
                  delta: Math.abs(
                    labelRect.top + labelRect.height / 2 - (rowRect.top + rowRect.height / 2),
                  ),
                  labelVisible: labelRect.height > 0 && getComputedStyle(label).display !== "none",
                };
              }),
              accessibleMeasureLabel: measure.getAttribute("aria-label"),
              accessibleGridLabel: grid.getAttribute("aria-label"),
            };
          });
          return {
            gutterWidth: gutterRect.width,
            gutterMeasureDelta: Math.abs(gutterRect.right - firstMeasureRect.left),
            scaleRows: scaleRows.map((row) => row.dataset.pitchMidi),
            labelRowsInMeasures: measures.map(
              (measure) => measure.querySelectorAll(".piano-roll-system-pitch-row").length,
            ),
            alignment,
          };
        });

        expect(geometry.gutterWidth).toBeCloseTo(34, 0);
        expect(geometry.gutterMeasureDelta).toBeLessThanOrEqual(1);
        expect(geometry.scaleRows.length).toBeGreaterThan(0);
        expect(geometry.labelRowsInMeasures.every((count) => count === 0)).toBe(true);
        for (const measure of geometry.alignment) {
          expect(measure.gridLeft).toBeCloseTo(measure.harmonyLeft, 0);
          expect(measure.gridWidth).toBeCloseTo(measure.harmonyWidth, 0);
          expect(measure.gridLeft).toBeCloseTo(measure.laneLeft, 0);
          expect(measure.gridWidth).toBeCloseTo(measure.laneWidth, 0);
          expect(measure.rowLabelsInsideGrid).toBe(0);
          expect(measure.accessibleMeasureLabel).toMatch(/^Measure \d+$/);
          expect(measure.accessibleGridLabel).toMatch(/^Melody grid, measure \d+$/);
          expect(measure.labelCenters.every((row) => row.delta <= 1 && row.labelVisible)).toBe(
            true,
          );
        }
        for (let measureIndex = 1; measureIndex < geometry.alignment.length; measureIndex += 1) {
          expect(
            Math.abs(
              geometry.alignment[measureIndex - 1]!.measureRight -
                geometry.alignment[measureIndex]!.measureLeft,
            ),
          ).toBeLessThanOrEqual(1);
        }

        if (viewport.width === 640) {
          const fixedGutterX = await system
            .locator(".piano-roll-system-pitch-gutter")
            .evaluate((element) => element.getBoundingClientRect().left);
          const scroller = system.locator(".score-system-scroll");
          await scroller.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
          });
          const scrolledGutterX = await system
            .locator(".piano-roll-system-pitch-gutter")
            .evaluate((element) => element.getBoundingClientRect().left);
          expect(scrolledGutterX).toBeCloseTo(fixedGutterX, 0);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await scroller.evaluate((element) => {
            element.scrollLeft = 0;
          });
        }
      }
    }
  }
});
