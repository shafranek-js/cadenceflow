import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../src/domain/project/factory";
import type { Project } from "../../src/domain/project/project";
import { musicalDuration } from "../../src/domain/timing/duration";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { rational } from "../../src/domain/timing/rational";
import { encodePortableProject } from "../../src/persistence/portableProject";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

const CAPTURES = "artifacts/validation/piano-roll-stable-measure-width";

function createMeasureWidthFixture(): Project {
  const base = createDefaultProject("piano-roll-stable-width-fixture", "Stable Measure Width");
  const steps = Object.freeze(
    Array.from({ length: 17 }, (_, index) => ({
      ...createMatrixChordStep(base, index % 2 === 0 ? "I" : "V", `measure-step-${index + 1}`),
      duration: musicalDuration(rational(1)),
    })),
  );
  const firstStepId = steps[0]!.id;
  return Object.freeze<Project>({
    ...base,
    globalTiming: globalTiming(100, meter(1, 4)),
    presentation: Object.freeze({
      ...base.presentation,
      progressionView: "piano-roll",
      measuresPerSystem: 4,
    }),
    progression: Object.freeze({
      ...base.progression,
      steps,
      selectedStepId: firstStepId,
      sections: Object.freeze([
        { id: "measure-width-main", name: "Main", startStepId: firstStepId },
      ]),
    }),
  });
}

async function openFixture(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  const project = createMeasureWidthFixture();
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
}

async function setTheme(page: Page, theme: "Dark" | "Light"): Promise<void> {
  const themeButton = page.getByRole("button", { name: `${theme} theme` });
  if ((await themeButton.getAttribute("aria-pressed")) !== "true") await themeButton.click();
}

async function inspectSystemWidths(page: Page, capacity: number) {
  return page.getByTestId("progression-score-systems").evaluate((root, slots) => {
    const systems = [...root.querySelectorAll<HTMLElement>(".score-system")];
    return systems.map((system) => {
      const pitchLayout = system.querySelector<HTMLElement>(".score-system-pitch-layout")!;
      const gutter = pitchLayout.querySelector<HTMLElement>(".piano-roll-system-pitch-gutter")!;
      const scroll = pitchLayout.querySelector<HTMLElement>(".score-system-scroll")!;
      const row = scroll.querySelector<HTMLElement>(".piano-roll-system-measures-row")!;
      const measures = [...row.querySelectorAll<HTMLElement>(".piano-roll-measure")];
      const gutterRect = gutter.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const measureRects = measures.map((measure) => measure.getBoundingClientRect());
      return {
        measureCount: measures.length,
        rowWidth: rowRect.width,
        scrollClientWidth: scroll.clientWidth,
        scrollWidth: scroll.scrollWidth,
        gutterWidth: gutterRect.width,
        gutterDelta: Math.abs(gutterRect.right - scrollRect.left),
        widths: measureRects.map((rect) => rect.width),
        rowLeft: rowRect.left,
        firstLeft: measureRects[0]?.left,
        lastRight: measureRects.at(-1)?.right,
        unusedRight: rowRect.right - (measureRects.at(-1)?.right ?? rowRect.left),
        expectedUnusedWidth: (slots - measures.length) * (measureRects[0]?.width ?? 0),
        gridsAligned: measures.every((measure) => {
          const grid = measure
            .querySelector<HTMLElement>(".piano-roll-grid")!
            .getBoundingClientRect();
          const harmony = measure
            .querySelector<HTMLElement>(".piano-roll-harmony")!
            .getBoundingClientRect();
          return (
            Math.abs(grid.left - harmony.left) <= 1 && Math.abs(grid.width - harmony.width) <= 1
          );
        }),
      };
    });
  }, capacity);
}

test("Piano Roll measure slots stay stable across full and partial Systems", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openFixture(page);
  await mkdir(CAPTURES, { recursive: true });

  for (const theme of ["Dark", "Light"] as const) {
    await setTheme(page, theme);
    for (const capacity of [2, 4, 8] as const) {
      await setLayoutMeasuresPerSystem(page, capacity);
      const score = page.getByTestId("progression-score-systems");
      await expect(score).toHaveAttribute("data-measures-per-system", String(capacity));
      const systems = await inspectSystemWidths(page, capacity);
      expect(systems.length).toBeGreaterThan(1);
      expect(systems[0]!.measureCount).toBe(capacity);
      expect(systems.at(-1)!.measureCount).toBe(1);
      const referenceWidth = systems[0]!.widths[0]!;
      for (const system of systems) {
        expect(system.widths.length).toBeGreaterThan(0);
        expect(system.widths.every((width) => Math.abs(width - referenceWidth) <= 1)).toBe(true);
        expect(system.gutterWidth).toBeCloseTo(34, 0);
        expect(system.gutterDelta).toBeLessThanOrEqual(1);
        expect(system.gridsAligned).toBe(true);
        expect(system.unusedRight).toBeCloseTo(system.expectedUnusedWidth, 0);
      }

      if (capacity === 4) {
        await page.getByLabel("Horizontal zoom").fill("100");
        await page
          .locator('.score-system[data-measure-count="4"]')
          .first()
          .screenshot({
            path: `${CAPTURES}/${theme.toLowerCase()}-full-1920x1080.png`,
          });
        await page
          .locator(".score-system")
          .last()
          .screenshot({
            path: `${CAPTURES}/${theme.toLowerCase()}-partial-1920x1080.png`,
          });
      }

      if (capacity === 8 && theme === "Dark") {
        await page.getByLabel("Horizontal zoom").fill("180");
        const zoomed = await inspectSystemWidths(page, capacity);
        const zoomedWidth = zoomed[0]!.widths[0]!;
        expect(zoomedWidth).toBeGreaterThan(referenceWidth);
        expect(
          zoomed.every((system) =>
            system.widths.every((width) => Math.abs(width - zoomedWidth) <= 1),
          ),
        ).toBe(true);
        const firstSystem = page.locator(".score-system").first();
        const scroll = firstSystem.locator(".score-system-scroll");
        const before = await firstSystem
          .locator(".piano-roll-system-pitch-gutter")
          .evaluate((element) => element.getBoundingClientRect().left);
        expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
          true,
        );
        await scroll.evaluate((element) => {
          element.scrollLeft = element.scrollWidth;
        });
        const after = await firstSystem
          .locator(".piano-roll-system-pitch-gutter")
          .evaluate((element) => element.getBoundingClientRect().left);
        expect(after).toBeCloseTo(before, 0);
        await page.getByLabel("Horizontal zoom").fill("100");
      }
    }
  }

  for (const theme of ["Dark", "Light"] as const) {
    await page.setViewportSize({ width: 640, height: 360 });
    await setTheme(page, theme);
    await setLayoutMeasuresPerSystem(page, 4);
    const systems = await inspectSystemWidths(page, 4);
    expect(systems[0]!.measureCount).toBe(4);
    expect(systems.at(-1)!.measureCount).toBe(1);
    const referenceWidth = systems[0]!.widths[0]!;
    expect(
      systems.every((system) =>
        system.widths.every((width) => Math.abs(width - referenceWidth) <= 1),
      ),
    ).toBe(true);
    expect(systems.every((system) => system.gutterDelta <= 1 && system.gridsAligned)).toBe(true);
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await setLayoutMeasuresPerSystem(page, 4);
  await page.getByLabel("Horizontal zoom").fill("100");
  await page.getByLabel("Snap resolution").selectOption("1/16");
  const lastMeasure = page.locator(".score-system").last().locator(".piano-roll-measure");
  const grid = lastMeasure.locator(".piano-roll-grid");
  const gridBox = await grid.boundingBox();
  if (!gridBox) throw new Error("The final Measure grid has no rendered box");
  await grid.click({ position: { x: gridBox.width / 2, y: gridBox.height / 2 } });
  const cursor = lastMeasure.locator(".piano-roll-editing-cursor");
  await expect(cursor).toBeVisible();
  expect(await cursor.getAttribute("style")).toMatch(/left:\s*50%/);
});
