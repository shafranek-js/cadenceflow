import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import { createEffectiveMelodyTimeline } from "../../src/domain/melody/effectiveTimeline";
import { exactPitch } from "../../src/domain/harmony/pitch";
import type { Project } from "../../src/domain/project/project";
import type { ChordStep, ProgressionStep, RestStep } from "../../src/domain/progression/step";
import { planMeasureDuplication } from "../../src/domain/progression/measureDeletion";
import { musicalDuration } from "../../src/domain/timing/duration";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { rational } from "../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";

const G4 = exactPitch(67, { step: "G", alter: 0 });
const E4 = exactPitch(64, { step: "E", alter: 0 });

function duplicateFixture(options: {
  readonly id: string;
  readonly theme?: "dark" | "light";
  readonly view?: Project["presentation"]["progressionView"];
}): Project {
  const template = createRichProjectFixture();
  const before: ChordStep = Object.freeze({
    ...createMatrixChordStep(template, "I", "duplicate-before"),
    duration: musicalDuration(rational(4)),
  });
  const copiedChord: ChordStep = Object.freeze({
    ...createMatrixChordStep(template, "V", "duplicate-source-chord"),
    duration: musicalDuration(rational(2)),
    transpositionSemitones: 2,
    melodyInstrumentOverride: "flute",
    melody: {
      mode: "authored",
      phrase: {
        notes: [
          {
            id: "duplicate-crossing-note",
            pitch: G4,
            sourcePitchMidi: 65,
            onset: rational(1),
            duration: rational(3),
          },
        ],
      },
    },
  });
  const copiedRest: RestStep = Object.freeze({
    id: "duplicate-source-rest",
    kind: "rest",
    duration: musicalDuration(rational(2)),
    authoredMelody: {
      notes: [
        {
          id: "duplicate-rest-note",
          pitch: E4,
          onset: rational(1, 2),
          duration: rational(1, 2),
        },
      ],
    },
  });
  const last: ChordStep = Object.freeze({
    ...createMatrixChordStep(template, "IV", "duplicate-last"),
    duration: musicalDuration(rational(4)),
  });

  const { temporaryBranch: _temporaryBranch, ...project } = template;
  return Object.freeze({
    ...project,
    id: options.id,
    name: `Measure duplication ${options.id}`,
    globalTiming: globalTiming(120, meter(4, 4)),
    presentation: Object.freeze({
      ...project.presentation,
      theme: options.theme ?? "light",
      progressionView: options.view ?? "piano",
      measuresPerSystem: 2,
    }),
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([before, copiedChord, copiedRest, last] satisfies ProgressionStep[]),
      selectedStepId: last.id,
      sections: Object.freeze([
        { id: "duplicate-section", name: "Verse", startStepId: copiedChord.id },
      ]),
      loopRegion: Object.freeze({ startStepId: before.id, endStepId: last.id }),
    }),
  });
}

async function importPortableProject(page: Page, project: Project): Promise<void> {
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await expect(
    page.getByTestId(`progression-view-btn-${project.presentation.progressionView}`),
  ).toHaveAttribute("aria-pressed", "true");
  const projectMenu = page.getByTestId("project-menu-toggle");
  if ((await projectMenu.getAttribute("aria-expanded")) === "true") await projectMenu.click();
}

async function openStudio(page: Page, project: Project): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await importPortableProject(page, project);
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
  const file = await download.path();
  if (!file) throw new Error("Portable Project export did not provide a local file");
  return decodePortableProject(await readFile(file, "utf8"));
}

async function historyAction(page: Page, action: "Undo" | "Redo"): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

test("duplicates the clicked middle Measure to the progression end with one Undo/Redo and portable reopen", async ({
  page,
}) => {
  const project = duplicateFixture({ id: "duplicate-middle-history" });
  const expected = planMeasureDuplication(project, 1);
  if ("reason" in expected) throw new Error(expected.reason);
  await openStudio(page, project);

  await expect(
    page.locator('[data-progression-step-select][data-step-id="duplicate-last"]'),
  ).toHaveAttribute("aria-pressed", "true");
  const sourceTrigger = page.locator('[data-measure-context-trigger][data-measure-index="1"]');
  await sourceTrigger.click();
  const menu = page.getByRole("menu", { name: "Measure 2 commands" });
  const duplicate = menu.getByRole("menuitem", { name: "Duplicate Measure 2 to End" });
  await expect(duplicate).toBeEnabled();
  await duplicate.click();

  await expect(page.locator("[data-measure-context-trigger][data-measure-index]")).toHaveCount(4);
  await expect(
    page.locator(
      `[data-progression-step-select][data-step-id="${expected.progression.selectedStepId}"]`,
    ),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await exportPortableProject(page)).progression).toEqual(expected.progression);
  const copyIds = expected.duplicatedStepIds;
  const timeline = createEffectiveMelodyTimeline({ ...project, progression: expected.progression });
  const copiedNotes = timeline.filter((note) => copyIds.includes(note.sourceStepId));
  expect(copiedNotes).toHaveLength(2);
  expect(copiedNotes.map((note) => [note.startBeats, note.durationBeats])).toEqual([
    [rational(13), rational(3)],
    [rational(29, 2), rational(1, 2)],
  ]);

  await historyAction(page, "Undo");
  expect((await exportPortableProject(page)).progression).toEqual(project.progression);
  await historyAction(page, "Redo");
  const redone = await exportPortableProject(page);
  expect(redone.progression).toEqual(expected.progression);
  await importPortableProject(page, redone);
  expect((await exportPortableProject(page)).progression).toEqual(expected.progression);
});

test("keyboard context-menu activation duplicates the focused Measure and returns focus", async ({
  page,
}) => {
  const project = duplicateFixture({ id: "duplicate-keyboard" });
  const expected = planMeasureDuplication(project, 1);
  if ("reason" in expected) throw new Error(expected.reason);
  await openStudio(page, project);
  const header = page.locator(".progression-measure-header").nth(1);
  await header.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Measure 2 commands" });
  await expect(menu).toBeVisible();
  const duplicate = menu.getByRole("menuitem", { name: "Duplicate Measure 2 to End" });
  await duplicate.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(header).toBeFocused();
  expect((await exportPortableProject(page)).progression).toEqual(expected.progression);
});

test("the shared menu exposes duplication in Harmonic, Piano, Guitar, Tablature, Staff, and Piano Roll", async ({
  page,
}) => {
  const project = duplicateFixture({ id: "duplicate-all-views" });
  await openStudio(page, project);
  for (const view of ["piano", "guitar", "tablature", "staff", "piano-roll"] as const) {
    await page.getByTestId(`progression-view-btn-${view}`).click();
    const trigger = page.locator('[data-measure-context-trigger][data-measure-index="1"]');
    await expect(trigger).toBeVisible();
    await trigger.click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Measure 2 commands" });
    await expect(menu.getByRole("menuitem", { name: "Duplicate Measure 2 to End" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
});

test("duplication stops progression playback before the single mutation", async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  const project = duplicateFixture({ id: "duplicate-stop-transport" });
  await openStudio(page, project);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await page.locator('[data-measure-context-trigger][data-measure-index="1"]').click();
  await page
    .getByRole("menu", { name: "Measure 2 commands" })
    .getByRole("menuitem", { name: "Duplicate Measure 2 to End" })
    .click();
  await expect(page.getByTestId("transport-status")).toContainText("Stopped");
});

test("menu and appended Measure remain visible across three viewport sizes and both themes", async ({
  browser,
}) => {
  const output = resolve(process.cwd(), "artifacts/validation/duplicate-measure/review-2026-10-04");
  await mkdir(output, { recursive: true });
  const viewports = [
    { width: 640, height: 360 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ] as const;
  const metrics: Record<string, unknown>[] = [];

  for (const theme of ["light", "dark"] as const) {
    for (const viewport of viewports) {
      const project = duplicateFixture({
        id: `duplicate-capture-${theme}-${viewport.width}`,
        theme,
      });
      const expected = planMeasureDuplication(project, 1);
      if ("reason" in expected) throw new Error(expected.reason);
      const page = await browser.newPage({ viewport });
      await openStudio(page, project);
      const trigger = page.locator('[data-measure-context-trigger][data-measure-index="1"]');
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Measure 2 commands" });
      await expect(
        menu.getByRole("menuitem", { name: "Duplicate Measure 2 to End" }),
      ).toBeEnabled();
      const menuBounds = await menu.boundingBox();
      const statusBounds = await page.locator(".app-status-bar").boundingBox();
      expect(menuBounds).toBeTruthy();
      expect(statusBounds).toBeTruthy();
      expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
      expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(viewport.height);
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(statusBounds!.y);
      await page.screenshot({
        path: `${output}/${theme}-${viewport.width}x${viewport.height}-menu.png`,
        animations: "disabled",
      });
      await menu.getByRole("menuitem", { name: "Duplicate Measure 2 to End" }).click();
      const finalTrigger = page.locator(
        `[data-measure-context-trigger][data-measure-index="${expected.duplicateMeasureNumber - 1}"]`,
      );
      await finalTrigger.scrollIntoViewIfNeeded();
      await expect(finalTrigger).toBeVisible();
      await page.screenshot({
        path: `${output}/${theme}-${viewport.width}x${viewport.height}-final-measure.png`,
        animations: "disabled",
      });
      metrics.push({
        theme,
        viewport,
        duplicateMeasureNumber: expected.duplicateMeasureNumber,
        finalMeasureVisible: await finalTrigger.isVisible(),
        menu: menuBounds,
        statusPinned: await page.locator(".app-status-bar").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return Math.abs(window.innerHeight - rect.bottom) <= 1;
        }),
      });
      await page.close();
    }
  }
  await writeFile(`${output}/viewport-metrics.json`, JSON.stringify(metrics, null, 2) + "\n");
});
