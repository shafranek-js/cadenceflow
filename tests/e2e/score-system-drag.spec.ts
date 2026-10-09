import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import type { Project } from "../../src/domain/project/project";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

async function installSystemDragFixture(page: Page): Promise<void> {
  const { temporaryBranch: _branch, ...baseProject } =
    createPianoRollSystemChordFixture("score-system-drag-e2e");
  const finalStep = baseProject.progression.steps.at(-1);
  if (!finalStep || finalStep.kind !== "chord") throw new Error("Expected final chord fixture");
  const project = Object.freeze({
    ...baseProject,
    presentation: Object.freeze({ ...baseProject.presentation, progressionView: "staff" as const }),
    progression: Object.freeze({
      ...baseProject.progression,
      steps: Object.freeze([
        ...baseProject.progression.steps.slice(0, -1),
        Object.freeze({ ...finalStep, duration: musicalDuration(rational(2)) }),
      ]),
    }),
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(project.name);
  await page.keyboard.press("Escape");
  await page.getByTestId("progression-view-btn-staff").click();
  await setLayoutMeasuresPerSystem(page, 2);
}

async function exportPortableProject(page: Page): Promise<Project> {
  const toggle = page.getByTestId("export-menu-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  const downloadPromise = page.waitForEvent("download");
  await toggle.click();
  const menu = page.getByRole("menu", { name: "Export menu" });
  await expect(menu).toBeVisible();
  await menu.getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Portable Project export did not provide a local file");
  return decodePortableProject(await readFile(path, "utf8"));
}

async function renderedStepIds(page: Page): Promise<string[]> {
  return page
    .locator(".measure-staff-event-select[data-step-id]")
    .evaluateAll((events) =>
      Array.from(new Set(events.map((event) => event.getAttribute("data-step-id") ?? ""))),
    );
}

async function renderedMeasureIndices(page: Page, systemIndex: number): Promise<number[]> {
  return page
    .locator(`.score-system[data-system-index="${systemIndex}"] [data-measure-context-trigger]`)
    .evaluateAll((measures) =>
      measures
        .map((measure) => Number(measure.getAttribute("data-measure-index")))
        .sort((left, right) => left - right),
    );
}

async function beginDrag(
  page: Page,
  sourceIndex: number,
  destination: { readonly systemIndex: number } | { readonly afterLast: true },
): Promise<{
  readonly start: { x: number; y: number };
  readonly target: { x: number; y: number };
}> {
  const source = page.locator(".score-system-header").nth(sourceIndex);
  const sourceRect = await source.boundingBox();
  if (!sourceRect) throw new Error("Score system header was not laid out");
  const start = { x: sourceRect.x + 24, y: sourceRect.y + sourceRect.height / 2 };
  let expectedDropMeasureIndex: number;
  let target: { x: number; y: number };
  if ("afterLast" in destination) {
    const rootRect = await page.getByTestId("progression-score-systems").boundingBox();
    if (!rootRect) throw new Error("The rendered System list was not laid out");
    expectedDropMeasureIndex = 6;
    target = { x: rootRect.x + 24, y: rootRect.y + rootRect.height - 4 };
  } else {
    const destinationHeader = page.locator(".score-system-header").nth(destination.systemIndex);
    const destinationRect = await destinationHeader.boundingBox();
    if (!destinationRect) throw new Error("Destination System header was not laid out");
    expectedDropMeasureIndex = destination.systemIndex * 2;
    target = { x: destinationRect.x + destinationRect.width - 8, y: destinationRect.y + 1 };
  }
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(start.y).toBeGreaterThanOrEqual(0);
  expect(start.y).toBeLessThan(viewportHeight);
  expect(target.y).toBeGreaterThanOrEqual(0);
  expect(target.y).toBeLessThan(viewportHeight);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await expect(page.getByTestId("score-system-drop-marker")).toHaveAttribute(
    "data-drop-measure-index",
    String(expectedDropMeasureIndex),
  );
  await expect(page.locator(".score-system.is-system-drag-source")).toHaveCount(1);
  expect(await page.evaluate(() => document.getSelection()?.isCollapsed ?? true)).toBe(true);
  return { start, target };
}

async function releasePendingPressOutsideScore(page: Page): Promise<void> {
  const rootRect = await page.getByTestId("progression-score-systems").boundingBox();
  const headerRect = await page.locator(".score-system-header").first().boundingBox();
  if (!rootRect || !headerRect) throw new Error("The score header or System list was not laid out");
  const startX = rootRect.x + rootRect.width - 1;
  if (startX < headerRect.x || startX > headerRect.x + headerRect.width) {
    throw new Error("The score header does not reach the System list's right edge");
  }
  const y = headerRect.y + headerRect.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 2, y);
  await page.mouse.up();
  await expect(page.getByTestId("score-system-drop-marker")).toHaveCount(0);
  await expect(page.locator(".score-system.is-system-drag-source")).toHaveCount(0);
  await page.mouse.move(startX - 24, y + 8);
  await expect(page.getByTestId("score-system-drop-marker")).toHaveCount(0);
  await expect(page.locator(".score-system.is-system-drag-source")).toHaveCount(0);
}

async function showFirstTwoSystems(page: Page): Promise<void> {
  const first = await page.locator(".score-system-header").nth(0).boundingBox();
  if (!first) throw new Error("The first System header was not laid out");
  await page.locator(".studio-grid").evaluate((scrollable, delta) => {
    scrollable.scrollTop += delta;
  }, first.y - 140);
  const [firstBox, secondBox, viewport] = await Promise.all([
    page.locator(".score-system-header").nth(0).boundingBox(),
    page.locator(".score-system-header").nth(1).boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);
  if (!firstBox || !secondBox) throw new Error("The first two System headers were not laid out");
  expect(firstBox.y).toBeGreaterThanOrEqual(0);
  expect(secondBox.y + secondBox.height).toBeLessThanOrEqual(viewport.height);
}

test("whole responsive System blocks drag in either theme with cancellation and one undoable move", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await installSystemDragFixture(page);
  const systems = page.locator('[data-testid="progression-score-system"]');
  await expect(systems).toHaveCount(3);
  const originalProject = await exportPortableProject(page);
  expect(originalProject.progression.steps.map((step) => step.id)).toEqual([
    "chord-a",
    "chord-b",
    "chord-c",
    "rest-d",
    "generated-e",
    "chord-f",
  ]);
  const originalIds = await renderedStepIds(page);
  expect(originalIds).toEqual([
    "chord-a",
    "chord-b",
    "chord-c",
    "rest-d",
    "generated-e",
    "chord-f",
  ]);

  const menuButton = page.locator("[data-measure-context-trigger]").first();
  await menuButton.click();
  await expect(page.getByTestId("measure-context-menu")).toBeVisible();
  await expect(page.getByTestId("score-system-drop-marker")).toHaveCount(0);
  await page.keyboard.press("Escape");

  const captureDirectory = process.env.CADENCEFLOW_SYSTEM_DND_SCREENSHOT_DIR;
  if (captureDirectory) await mkdir(captureDirectory, { recursive: true });
  for (const theme of ["dark", "light"] as const) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page
      .getByRole("button", { name: `${theme === "dark" ? "Dark" : "Light"} theme` })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await setLayoutMeasuresPerSystem(page, 2);
    await expect(systems).toHaveCount(3);
    await showFirstTwoSystems(page);

    await releasePendingPressOutsideScore(page);
    expect(await renderedStepIds(page)).toEqual(originalIds);

    // At a normal 720px viewport, scroll the first two complete Systems into view and move
    // the second ahead of the first using an actual pointer gesture.
    await beginDrag(page, 1, { systemIndex: 0 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("score-system-drop-marker")).toHaveCount(0);
    await expect(page.locator(".score-system.is-system-drag-source")).toHaveCount(0);
    await page.mouse.up();
    expect(await renderedStepIds(page)).toEqual(originalIds);
    expect((await exportPortableProject(page)).progression).toEqual(originalProject.progression);

    await beginDrag(page, 1, { systemIndex: 0 });
    if (captureDirectory) {
      await page.screenshot({
        path: join(captureDirectory, `system-block-middle-to-first-720-${theme}.png`),
        animations: "disabled",
      });
    }
    await page.mouse.up();
    const middleMovedIds = ["chord-c", "rest-d", "chord-a", "chord-b", "generated-e", "chord-f"];
    await expect.poll(() => renderedStepIds(page)).toEqual(middleMovedIds);
    const middleMovedProject = await exportPortableProject(page);
    expect(middleMovedProject.progression.steps.map((step) => step.id)).toEqual(middleMovedIds);
    await page.keyboard.press("Control+z");
    await expect.poll(() => renderedStepIds(page)).toEqual(originalIds);
    expect((await exportPortableProject(page)).progression).toEqual(originalProject.progression);
    await page.keyboard.press("Control+y");
    await expect.poll(() => renderedStepIds(page)).toEqual(middleMovedIds);
    expect((await exportPortableProject(page)).progression).toEqual(middleMovedProject.progression);
    await page.keyboard.press("Control+z");
    await expect.poll(() => renderedStepIds(page)).toEqual(originalIds);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator(".studio-grid").evaluate((scrollable) => {
      scrollable.scrollTop = 0;
    });
    await setLayoutMeasuresPerSystem(page, 4);
    await expect(page.getByTestId("progression-score-systems")).toHaveAttribute(
      "data-measures-per-system",
      "4",
    );
    await expect(
      page.getByRole("region", { name: /Score system 1, measures 1 through 4/ }),
    ).toBeVisible();
    await expect(systems).toHaveCount(2);
    expect(await renderedMeasureIndices(page, 0)).toEqual([0, 1, 2, 3]);
    expect(await renderedMeasureIndices(page, 1)).toEqual([4, 5]);
    await showFirstTwoSystems(page);

    // The final System contains only two of the configured four measures and ends with a
    // partial bar. Moving it to the front preserves that short System block and its content.
    await beginDrag(page, 1, { systemIndex: 0 });
    if (captureDirectory) {
      await page.screenshot({
        path: join(captureDirectory, `system-block-partial-to-first-${theme}.png`),
        animations: "disabled",
      });
    }
    await page.mouse.up();
    const movedIds = [
      "generated-e",
      "chord-f",
      "system-move-padding-6~measure-6-rest",
      "chord-a",
      "chord-b",
      "chord-c",
      "rest-d",
    ];
    const movedRenderedIds = [
      "generated-e",
      "chord-f",
      "system-move-padding-6~measure-6-rest",
      "chord-a",
      "chord-b",
      "chord-c",
      "rest-d",
    ];
    await expect.poll(() => renderedStepIds(page)).toEqual(movedRenderedIds);
    await expect(systems).toHaveCount(2);
    const movedProject = await exportPortableProject(page);
    expect(movedProject.progression.steps.map((step) => step.id)).toEqual(movedIds);
    const movedPartialStep = movedProject.progression.steps.find((step) => step.id === "chord-f");
    const originalPartialStep = originalProject.progression.steps.find(
      (step) => step.id === "chord-f",
    );
    expect(movedPartialStep?.kind).toBe("chord");
    expect(originalPartialStep?.kind).toBe("chord");
    if (movedPartialStep?.kind === "chord" && originalPartialStep?.kind === "chord") {
      expect(movedPartialStep.melody).toEqual(originalPartialStep.melody);
      expect(movedPartialStep.explicitSpellingOverrides).toEqual(
        originalPartialStep.explicitSpellingOverrides,
      );
    }

    await page.keyboard.press("Control+z");
    await expect.poll(() => renderedStepIds(page)).toEqual(originalIds);
    expect((await exportPortableProject(page)).progression).toEqual(originalProject.progression);
    await page.keyboard.press("Control+y");
    await expect.poll(() => renderedStepIds(page)).toEqual(movedRenderedIds);
    expect((await exportPortableProject(page)).progression).toEqual(movedProject.progression);
    await page.keyboard.press("Control+z");
    await expect.poll(() => renderedStepIds(page)).toEqual(originalIds);
    expect((await exportPortableProject(page)).progression).toEqual(originalProject.progression);

    // Move the complete first four-measure System after the final System as one action.
    expect(await renderedMeasureIndices(page, 0)).toEqual([0, 1, 2, 3]);
    await beginDrag(page, 0, { afterLast: true });
    if (captureDirectory) {
      await page.screenshot({
        path: join(captureDirectory, `system-block-four-measures-to-end-${theme}.png`),
        animations: "disabled",
      });
    }
    await page.mouse.up();
    const appendedIds = [
      "generated-e",
      "chord-f",
      "system-move-padding-6~measure-6-rest",
      "chord-a",
      "chord-b",
      "chord-c",
      "rest-d",
    ];
    const appendedRenderedIds = [
      "generated-e",
      "chord-f",
      "system-move-padding-6~measure-6-rest",
      "chord-a",
      "chord-b",
      "chord-c",
      "rest-d",
    ];
    await expect.poll(() => renderedStepIds(page)).toEqual(appendedRenderedIds);
    const appendedProject = await exportPortableProject(page);
    expect(appendedProject.progression.steps.map((step) => step.id)).toEqual(appendedIds);
    await expect(systems).toHaveCount(2);
    await page.keyboard.press("Control+z");
    await expect.poll(() => renderedStepIds(page)).toEqual(originalIds);
    expect((await exportPortableProject(page)).progression).toEqual(originalProject.progression);
    await page.keyboard.press("Control+y");
    await expect.poll(() => renderedStepIds(page)).toEqual(appendedRenderedIds);
    expect((await exportPortableProject(page)).progression).toEqual(appendedProject.progression);
    await page.keyboard.press("Control+z");
    await expect.poll(() => renderedStepIds(page)).toEqual(originalIds);
  }
});
