import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Project } from "../../src/domain/project/project";
import type { ChordStep, RestStep } from "../../src/domain/progression/step";
import { exactPitch } from "../../src/domain/harmony/pitch";
import { snapshotChordMelodyRecipe } from "../../src/domain/melody/types";
import { musicalDuration } from "../../src/domain/timing/duration";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { rational } from "../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { planMeasureInsertion } from "../../src/domain/progression/measureDeletion";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";

const E4 = exactPitch(64, { step: "E", alter: 0 });

function createInsertionFixture(options: {
  readonly id: string;
  readonly theme?: "dark" | "light";
  readonly view?: Project["presentation"]["progressionView"];
}): Project {
  const source = createRichProjectFixture();
  const { temporaryBranch: _temporaryBranch, ...project } = source;
  const sourceFirst = source.progression.steps[0];
  const sourceSecond = source.progression.steps[1];
  const sourceGenerated = source.progression.steps[4];
  if (
    sourceFirst?.kind !== "chord" ||
    sourceSecond?.kind !== "chord" ||
    sourceGenerated?.kind !== "chord"
  )
    throw new Error("Rich fixture did not provide its expected chord owners");
  const first: ChordStep = Object.freeze({
    ...sourceFirst,
    id: "step-1",
    transpositionSemitones: 2,
    duration: musicalDuration(rational(6)),
    melody: {
      mode: "authored",
      phrase: {
        notes: [
          {
            id: "crossing-note",
            pitch: E4,
            sourcePitchMidi: 62,
            onset: rational(3),
            duration: rational(4),
          },
        ],
      },
    },
  });
  const second: ChordStep = Object.freeze({
    ...sourceSecond,
    id: "step-2",
    duration: musicalDuration(rational(2)),
  });
  const generated: ChordStep = Object.freeze({
    ...sourceGenerated,
    id: "step-3",
    duration: musicalDuration(rational(4)),
    melody: {
      mode: "generated",
      recipe: snapshotChordMelodyRecipe({
        pattern: "outside-in",
        grid: "eighth",
        octaveOffset: 0,
      }),
    },
  });
  return Object.freeze({
    ...project,
    id: options.id,
    name: `Measure insertion ${options.id}`,
    globalTiming: globalTiming(120, meter(4, 4)),
    presentation: Object.freeze({
      ...project.presentation,
      theme: options.theme ?? "dark",
      progressionView: options.view ?? "harmonic",
      measuresPerSystem: 2,
    }),
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([first, second, generated]),
      selectedStepId: "step-3",
      sections: Object.freeze([{ id: "verse", name: "Verse", startStepId: "step-2" }]),
      loopRegion: Object.freeze({ startStepId: "step-1", endStepId: "step-1" }),
    }),
  });
}

function createPartialFinalFixture(id: string): Project {
  const source = createRichProjectFixture();
  const { temporaryBranch: _temporaryBranch, ...project } = source;
  const first = source.progression.steps[0];
  if (first?.kind !== "chord") throw new Error("Rich fixture did not provide its first chord");
  const rest: RestStep = Object.freeze({
    id: "partial-rest",
    kind: "rest",
    duration: musicalDuration(rational(1, 3)),
  });
  return Object.freeze({
    ...project,
    id,
    name: `Partial final Measure ${id}`,
    globalTiming: globalTiming(100, meter(4, 4)),
    presentation: Object.freeze({ ...project.presentation, progressionView: "harmonic" as const }),
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(4)) }),
        rest,
      ]),
      selectedStepId: first.id,
      sections: Object.freeze([{ id: "last", name: "Last", startStepId: rest.id }]),
      loopRegion: undefined,
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
  await expect(page.getByTestId("progression-view-btn-harmonic")).toBeVisible();
  await page.keyboard.press("Escape");
}

async function openStudio(page: Page, project: Project): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await importPortableProject(page, project);
  await expect(
    page.getByTestId(`progression-view-btn-${project.presentation.progressionView}`),
  ).toHaveAttribute("aria-pressed", "true");
}

async function openMeasureMenu(page: Page, index: number): Promise<void> {
  await page.locator(`[data-measure-context-trigger][data-measure-index="${index}"]`).click();
  await expect(page.getByRole("menu", { name: `Measure ${index + 1} commands` })).toBeVisible();
}

async function historyAction(page: Page, action: "Undo" | "Redo"): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
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

test("menu insertion follows its displayed Measure, preserves selection, and supports one Undo/Redo plus portable reopen", async ({
  page,
}) => {
  const project = createInsertionFixture({ id: "t216-target-history" });
  await openStudio(page, project);
  const expected = planMeasureInsertion(project, 0);
  if ("reason" in expected) throw new Error(expected.reason);
  await expect(
    page.locator('[data-progression-step-select][data-step-id="step-3"]'),
  ).toHaveAttribute("aria-pressed", "true");

  await openMeasureMenu(page, 0);
  const menu = page.getByRole("menu", { name: "Measure 1 commands" });
  await expect(menu.getByRole("menuitem", { name: "Insert Measure After 1" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Insert Measure After 1" }).click();
  await expect(page.locator("[data-measure-context-trigger][data-measure-index]")).toHaveCount(4);
  expect((await exportPortableProject(page)).progression).toEqual(expected.progression);
  await expect(
    page.locator('[data-progression-step-select][data-step-id="step-3"]'),
  ).toHaveAttribute("aria-pressed", "true");

  await historyAction(page, "Undo");
  expect((await exportPortableProject(page)).progression).toEqual(project.progression);
  await historyAction(page, "Redo");
  const redone = await exportPortableProject(page);
  expect(redone.progression).toEqual(expected.progression);

  await importPortableProject(page, redone);
  expect((await exportPortableProject(page)).progression).toEqual(expected.progression);
});

test("keyboard menu insertion after the partial final Measure materializes its old tail and keeps portable anchors", async ({
  page,
}) => {
  const project = createPartialFinalFixture("t216-partial-final");
  await openStudio(page, project);
  const trigger = page.locator('[data-measure-context-trigger][data-measure-index="1"]');
  await trigger.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Measure 2 commands" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Insert Measure After 2" })).toBeEnabled();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  const exported = await exportPortableProject(page);
  const insertion = planMeasureInsertion(project, 1);
  if ("reason" in insertion) throw new Error(insertion.reason);
  expect(exported.progression).toEqual(insertion.progression);
  expect(exported.progression.steps.map((step) => step.duration.beats)).toEqual([
    rational(4),
    rational(1, 3),
    rational(11, 3),
    rational(4),
  ]);
  await importPortableProject(page, exported);
  expect((await exportPortableProject(page)).progression).toEqual(insertion.progression);
});

test("Measure close buttons work by keyboard in every view and match menu deletion", async ({
  page,
}) => {
  const project = createInsertionFixture({ id: "t216-close-equivalence" });
  await openStudio(page, project);
  const close = page.locator('[data-measure-close-trigger][data-measure-index="0"]');
  await expect(close).toHaveAccessibleName("Delete Measure 1");
  await close.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-measure-context-trigger][data-measure-index]")).toHaveCount(2);
  const closedByButton = (await exportPortableProject(page)).progression;

  await historyAction(page, "Undo");
  await openMeasureMenu(page, 0);
  await page
    .getByRole("menu", { name: "Measure 1 commands" })
    .getByRole("menuitem", { name: "Delete Measure 1" })
    .click();
  const closedByMenu = (await exportPortableProject(page)).progression;
  expect(closedByButton).toEqual(closedByMenu);

  for (const view of ["piano-roll", "staff", "tablature"] as const) {
    await importPortableProject(page, project);
    await page.getByTestId(`progression-view-btn-${view}`).click();
    const viewClose = page.locator('[data-measure-close-trigger][data-measure-index="0"]');
    await expect(viewClose).toBeVisible();
    await viewClose.click();
    await expect(page.locator("[data-measure-context-trigger][data-measure-index]")).toHaveCount(2);
  }
});

test("Measure headers and context menus fit compact and desktop layouts in both themes", async ({
  browser,
}) => {
  const output = resolve(process.cwd(), "artifacts/validation/measure-insert-close");
  await mkdir(output, { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    const page = await browser.newPage();
    await openStudio(page, createInsertionFixture({ id: `t216-capture-${theme}`, theme }));
    for (const [width, height] of [
      [640, 360],
      [1280, 720],
    ] as const) {
      await page.setViewportSize({ width, height });
      const stem = `${theme}-${width}x${height}`;
      const trigger = page.locator('[data-measure-context-trigger][data-measure-index="0"]');
      await trigger.evaluate((element) =>
        element.scrollIntoView({ block: "center", inline: "nearest" }),
      );
      await page.screenshot({ path: `${output}/${stem}-closed.png` });
      await trigger.click();
      await expect(page.getByRole("menu", { name: "Measure 1 commands" })).toBeVisible();
      const menu = page.getByRole("menu", { name: "Measure 1 commands" });
      await expect(menu.getByRole("menuitem", { name: "Insert Measure After 1" })).toBeVisible();
      const rect = await page.locator("[data-testid='measure-context-menu']").boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(height);
      await page.screenshot({ path: `${output}/${stem}-menu.png` });
      await page.keyboard.press("Escape");
    }
    await page.close();
  }
});
