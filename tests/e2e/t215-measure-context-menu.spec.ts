import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Project } from "../../src/domain/project/project";
import { exactPitch } from "../../src/domain/harmony/pitch";
import { snapshotChordMelodyRecipe } from "../../src/domain/melody/types";
import { musicalDuration } from "../../src/domain/timing/duration";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { rational } from "../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";

function createMeasureFixture(options: {
  readonly id: string;
  readonly theme?: "dark" | "light";
  readonly view?: Project["presentation"]["progressionView"];
  readonly crossingFirstStep?: boolean;
}): Project {
  const source = createRichProjectFixture();
  const { temporaryBranch: _temporaryBranch, ...project } = source;
  const progression = project.progression;
  const steps = progression.steps.map((step, index) => ({
    ...step,
    duration: musicalDuration(rational(options.crossingFirstStep && index === 0 ? 8 : 4)),
  }));
  return Object.freeze({
    ...project,
    id: options.id,
    name: `T215 ${options.id}`,
    globalTiming: globalTiming(120, meter(4, 4)),
    presentation: Object.freeze({
      ...source.presentation,
      theme: options.theme ?? "dark",
      progressionView: options.view ?? "tablature",
      measuresPerSystem: 2,
    }),
    progression: Object.freeze({
      ...progression,
      steps: Object.freeze(steps),
      selectedStepId: "step-1",
      sections: Object.freeze([]),
      loopRegion: undefined,
    }),
  });
}

function createActiveBranchFixture(theme: "dark" | "light" = "dark"): Project {
  const source = createRichProjectFixture();
  return Object.freeze({
    ...source,
    id: `t215-active-branch-${theme}`,
    name: `T215 active branch ${theme}`,
    globalTiming: globalTiming(120, meter(4, 4)),
    progression: Object.freeze({
      ...source.progression,
      steps: Object.freeze(
        source.progression.steps.map((step) => ({
          ...step,
          duration: musicalDuration(rational(4)),
        })),
      ),
    }),
    presentation: Object.freeze({
      ...source.presentation,
      theme,
      progressionView: "tablature" as const,
      measuresPerSystem: 2,
    }),
  });
}

function createPortableNoteFixture(): Project {
  const source = createMeasureFixture({ id: "t215-portable-note" });
  const generatedRecipe = snapshotChordMelodyRecipe({
    pattern: "outside-in",
    grid: "quarter",
    octaveOffset: 0,
  });
  const steps = source.progression.steps.map((step, index) => {
    if (index === 0 && step.kind === "chord") {
      return {
        ...step,
        melody: {
          mode: "authored" as const,
          phrase: {
            notes: [
              {
                id: "crossing-note",
                pitch: exactPitch(64, { step: "E", alter: 0 }),
                onset: rational(3),
                duration: rational(6),
              },
            ],
          },
        },
      };
    }
    if (index === 4 && step.kind === "chord") {
      return {
        ...step,
        melody: { mode: "generated" as const, recipe: generatedRecipe },
      };
    }
    return step;
  });
  return Object.freeze({
    ...source,
    progression: Object.freeze({
      ...source.progression,
      steps: Object.freeze(steps),
      selectedStepId: "step-4",
      sections: Object.freeze([
        { id: "surviving-section-boundary", name: "Chorus", startStepId: "step-2" },
      ]),
      loopRegion: Object.freeze({ startStepId: "step-2", endStepId: "step-4" }),
    }),
  });
}

function createInstrumentConflictFixture(): Project {
  const source = createMeasureFixture({ id: "t215-instrument-conflict" });
  const steps = source.progression.steps.map((step, index) => {
    if (index === 0 && step.kind === "chord") {
      return {
        ...step,
        melodyInstrumentOverride: "violin",
        melody: {
          mode: "authored" as const,
          phrase: {
            notes: [
              {
                id: "violin-tail",
                pitch: exactPitch(64, { step: "E", alter: 0 }),
                onset: rational(3),
                duration: rational(6),
              },
            ],
          },
        },
      };
    }
    if (index === 1) {
      return {
        id: step.id,
        kind: "rest" as const,
        duration: musicalDuration(rational(4)),
        melodyInstrumentOverride: "flute",
        authoredMelody: {
          notes: [
            {
              id: "flute-tail",
              pitch: exactPitch(60, { step: "C", alter: 0 }),
              onset: rational(1),
              duration: rational(4),
            },
          ],
        },
      };
    }
    return step;
  });
  return Object.freeze({
    ...source,
    progression: Object.freeze({ ...source.progression, steps: Object.freeze(steps) }),
  });
}

async function openStudio(page: Page, project: Project): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await expect(page.getByTestId("progression-view-btn-tablature")).toBeVisible();
  await expect(
    page.getByTestId(`progression-view-btn-${project.presentation.progressionView}`),
  ).toHaveAttribute("aria-pressed", "true");
  const projectMenu = page.getByTestId("project-menu-toggle");
  if ((await projectMenu.getAttribute("aria-expanded")) === "true") await projectMenu.click();
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

async function historyActionEnabled(page: Page, action: "Undo" | "Redo"): Promise<boolean> {
  await page.getByTestId("edit-menu-toggle").click();
  const item = page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) });
  const enabled = await item.isEnabled();
  await page.keyboard.press("Escape");
  return enabled;
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
  if (!path) throw new Error("The portable Project export did not provide a local file");
  return decodePortableProject(await readFile(path, "utf8"));
}

test("measure header actions target the displayed Measure and preserve one-step Undo/Redo and loop anchors", async ({
  page,
}) => {
  await openStudio(page, createMeasureFixture({ id: "t215-target-and-history" }));
  const secondMeasureHeader = page
    .locator("[data-measure-context-trigger][data-measure-index]")
    .nth(1);

  await secondMeasureHeader.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Measure 2 commands" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete Measure 2" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(secondMeasureHeader).toBeFocused();

  await secondMeasureHeader.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(secondMeasureHeader).toBeFocused();

  const secondMeasureTrigger = page.locator(
    '[data-measure-context-trigger][data-measure-index="1"]',
  );
  await secondMeasureTrigger.click();
  await expect(menu).toBeVisible();
  await page.getByTestId("progression-view-btn-staff").click();
  await expect(menu).toHaveCount(0);
  await expect(secondMeasureTrigger).toBeFocused();

  await openMeasureMenu(page, 1);
  await menu.getByRole("menuitem", { name: "Loop Measure 2" }).click();
  await expect(page.getByLabel("Loop start step").first()).toHaveValue("step-2");

  await openMeasureMenu(page, 1);
  await menu.getByRole("menuitem", { name: "Delete Measure 2" }).click();
  await expect(page.locator("[data-measure-context-trigger]")).toHaveCount(4);
  await expect(page.locator('[data-progression-step-select][data-step-id="step-1"]')).toHaveCount(
    1,
  );
  await expect(page.locator('[data-progression-step-select][data-step-id="step-2"]')).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Loop start step").first()).toHaveValue("step-3");
  expect(await historyActionEnabled(page, "Undo")).toBe(true);

  await historyAction(page, "Undo");
  await expect(page.locator("[data-measure-context-trigger]")).toHaveCount(5);
  await expect(page.getByLabel("Loop start step").first()).toHaveValue("step-2");
  await historyAction(page, "Redo");
  await expect(page.locator("[data-measure-context-trigger]")).toHaveCount(4);
  await expect(page.getByLabel("Loop start step").first()).toHaveValue("step-3");
});

test("measure menu is available from Harmonic, Piano, Guitar, Piano Roll, Staff, and Tablature views", async ({
  page,
}) => {
  await openStudio(page, createMeasureFixture({ id: "t215-views" }));

  for (const view of ["piano-roll", "staff", "tablature"] as const) {
    await page.getByTestId(`progression-view-btn-${view}`).click();
    const trigger = page.locator('[data-measure-context-trigger][data-measure-index="1"]');
    await expect(trigger).toBeVisible();
    if (view === "piano-roll") {
      await page.locator(".piano-roll-measure-header").nth(1).click({ button: "right" });
    } else if (view === "staff" || view === "tablature") {
      await trigger.click({ button: "right" });
    } else {
      await page
        .locator("[data-measure-context-trigger][data-measure-index]")
        .nth(1)
        .click({ button: "right" });
    }
    const menu = page.getByRole("menu", { name: "Measure 2 commands" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Delete Measure 2" })).toBeEnabled();
    if (view === "piano-roll") {
      await expect(menu.getByRole("menuitem", { name: "Play Measure 2" })).toBeVisible();
    } else {
      await expect(menu.getByRole("menuitem", { name: "Play Measure 2" })).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    if (view === "staff") {
      await trigger.focus();
      await page.keyboard.press("ContextMenu");
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
});

test("a Measure that crosses a Step boundary explains the unavailable exact loop while Delete stays available", async ({
  page,
}) => {
  await openStudio(
    page,
    createMeasureFixture({ id: "t215-crossing-step", crossingFirstStep: true }),
  );
  await openMeasureMenu(page, 0);
  const menu = page.getByRole("menu", { name: "Measure 1 commands" });
  const loopItem = menu.getByRole("menuitem", { name: "Loop Measure 1" });
  await expect(loopItem).toBeDisabled();
  await expect(menu.getByRole("status")).toContainText("crosses a Step boundary");
  await expect(menu.getByRole("menuitem", { name: "Delete Measure 1" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Delete Measure 1" }).click();
  await expect(page.locator("[data-measure-context-trigger]")).toHaveCount(5);
});

test("portable export preserves exact crossing-note data, generated content, and reanchored sections", async ({
  page,
}) => {
  const initial = createPortableNoteFixture();
  await openStudio(page, initial);
  await openMeasureMenu(page, 1);
  await page
    .getByRole("menu", { name: "Measure 2 commands" })
    .getByRole("menuitem", { name: "Delete Measure 2" })
    .click();

  const afterDelete = await exportPortableProject(page);
  const first = afterDelete.progression.steps.find((step) => step.id === "step-1");
  const nextOwner = afterDelete.progression.steps.find((step) => step.id === "step-3");
  const generated = afterDelete.progression.steps.find((step) => step.id === "step-5");
  expect(first?.kind).toBe("chord");
  expect(nextOwner?.kind).toBe("rest");
  expect(generated?.kind).toBe("chord");
  if (first?.kind !== "chord" || nextOwner?.kind !== "rest" || generated?.kind !== "chord")
    throw new Error("Portable export omitted an expected Step owner");
  expect(first.melody?.mode).toBe("authored");
  expect(first.melody?.mode === "authored" ? first.melody.phrase.notes : []).toContainEqual({
    id: "crossing-note",
    pitch: exactPitch(64, { step: "E", alter: 0 }),
    onset: rational(3),
    duration: rational(1),
  });
  expect(nextOwner.authoredMelody?.notes).toContainEqual({
    id: "crossing-note~measure-2-after",
    pitch: exactPitch(64, { step: "E", alter: 0 }),
    onset: rational(0),
    duration: rational(1),
  });
  expect(generated.melody?.mode).toBe("generated");
  expect(afterDelete.progression.sections).toEqual([
    { id: "surviving-section-boundary", name: "Chorus", startStepId: "step-3" },
  ]);
  expect(afterDelete.progression.loopRegion).toEqual({
    startStepId: "step-3",
    endStepId: "step-4",
  });

  await historyAction(page, "Undo");
  const afterUndo = await exportPortableProject(page);
  expect(afterUndo.progression).toEqual(initial.progression);
  await historyAction(page, "Redo");
  const afterRedo = await exportPortableProject(page);
  expect(afterRedo.progression).toEqual(afterDelete.progression);
});

test("active branch refusal stays visible and changes neither portable data nor history", async ({
  page,
}) => {
  const branchProject = createActiveBranchFixture();
  await openStudio(page, branchProject);
  const before = await exportPortableProject(page);
  await openMeasureMenu(page, 0);
  const menu = page.getByRole("menu", { name: "Measure 1 commands" });
  const remove = menu.getByRole("menuitem", { name: "Delete Measure 1" });
  await expect(remove).toBeDisabled();
  await expect(
    menu.locator(".measure-context-menu-reason").filter({
      hasText: "Finish or discard the active branch",
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await historyActionEnabled(page, "Undo")).toBe(false);
  const after = await exportPortableProject(page);
  expect(after).toEqual(before);
});

test("mixed retained instruments explain the v9 refusal without mutating data or history", async ({
  page,
}) => {
  const conflicting = createInstrumentConflictFixture();
  await openStudio(page, conflicting);
  const before = await exportPortableProject(page);
  await openMeasureMenu(page, 1);
  const menu = page.getByRole("menu", { name: "Measure 2 commands" });
  const remove = menu.getByRole("menuitem", { name: "Delete Measure 2" });
  await expect(remove).toBeDisabled();
  const reason = menu.locator(".measure-context-menu-reason").filter({
    hasText: "one Step",
  });
  await expect(reason).toContainText("flute and violin");
  await page.keyboard.press("Escape");
  expect(await historyActionEnabled(page, "Undo")).toBe(false);
  expect(await exportPortableProject(page)).toEqual(before);
});

test("deleting while progression playback is active stops transport immediately", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  await openStudio(page, createMeasureFixture({ id: "t215-active-transport" }));
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await openMeasureMenu(page, 1);
  await page
    .getByRole("menu", { name: "Measure 2 commands" })
    .getByRole("menuitem", { name: "Delete Measure 2" })
    .click();
  await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
});

test("deleting during a pending T210 MIDI preview cancels its delayed audio schedule", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: undefined,
    });
  });
  await openStudio(page, createMeasureFixture({ id: "t215-preview-cancel", view: "piano-roll" }));
  const midiSettings = page.getByRole("button", { name: "Midi Settings", exact: true });
  await midiSettings.click();
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await expect(midi).toBeVisible();
  await page.evaluate(() => {
    type MockScheduledEvent = {
      readonly startSeconds: number;
      readonly durationSeconds: number;
      readonly channelRole: string;
      readonly pitch: number;
    };
    type MockProviderPrototype = {
      prepareForInstruments: (instruments: readonly string[]) => Promise<{
        ready: readonly string[];
        unavailable: readonly string[];
        failed: readonly string[];
      }>;
      schedulePreview: (events: readonly MockScheduledEvent[]) => { id: string; cancel(): void };
    };
    const target = window as Window & {
      __cadenceflow_audio__?: {
        MelodySoundFontProvider?: { prototype: MockProviderPrototype };
      };
      __midiPreparationResolve?: () => void;
      __midiPreviewEvents?: readonly MockScheduledEvent[];
    };
    const prototype = target.__cadenceflow_audio__?.MelodySoundFontProvider?.prototype;
    if (!prototype) throw new Error("The T210 Melody provider test hook is missing");
    prototype.prepareForInstruments = function (instruments) {
      const ready = [...instruments];
      return new Promise((resolve) => {
        target.__midiPreparationResolve = () => {
          (this as unknown as { providerState: string }).providerState = "ready";
          resolve({ ready, unavailable: [], failed: [] });
        };
      });
    };
    prototype.schedulePreview = function (events) {
      target.__midiPreviewEvents = events.map((event) => ({ ...event }));
      return { id: "mock-midi-preview", cancel: () => undefined };
    };
  });
  await midi.getByLabel("Manual MIDI pitch").fill("62");
  await midi.getByRole("button", { name: "Insert MIDI pitch 62" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as Window & { __midiPreparationResolve?: () => void }).__midiPreparationResolve,
        ),
      ),
    )
    .toBe(true);

  await openMeasureMenu(page, 0);
  await page
    .getByRole("menu", { name: "Measure 1 commands" })
    .getByRole("menuitem", { name: "Delete Measure 1" })
    .click();
  await page.evaluate(() => {
    (window as Window & { __midiPreparationResolve?: () => void }).__midiPreparationResolve?.();
  });
  await page.waitForTimeout(50);
  expect(
    await page.evaluate(
      () => (window as Window & { __midiPreviewEvents?: readonly unknown[] }).__midiPreviewEvents,
    ),
  ).toBeUndefined();
});

test("measure context menu fits the normal layout at three widths in both themes", async ({
  browser,
}, testInfo: TestInfo) => {
  const output =
    process.env.T215_SCREENSHOT_DIR ?? testInfo.outputPath("t215-context-menu-screens");
  await mkdir(output, { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    const page = await browser.newPage();
    await openStudio(page, createMeasureFixture({ id: `t215-screenshot-${theme}`, theme }));
    for (const [width, height] of [
      [640, 360],
      [1280, 720],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height });
      const stem = `${theme}-${width}x${height}`;
      await page.screenshot({ path: `${output}/${stem}-closed.png` });
      await page.locator('[data-measure-context-trigger][data-measure-index="0"]').click();
      const menu = page.getByRole("menu", { name: "Measure 1 commands" });
      await expect(menu).toBeVisible();
      const geometry = await page.evaluate(() => {
        const rect = document
          .querySelector<HTMLElement>("[data-testid='measure-context-menu']")
          ?.getBoundingClientRect();
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          menu: rect
            ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
            : null,
        };
      });
      expect(geometry.pageWidth).toBeLessThanOrEqual(width);
      expect(geometry.menu).not.toBeNull();
      expect(geometry.menu!.left).toBeGreaterThanOrEqual(0);
      expect(geometry.menu!.top).toBeGreaterThanOrEqual(0);
      expect(geometry.menu!.right).toBeLessThanOrEqual(width);
      expect(geometry.menu!.bottom).toBeLessThanOrEqual(height);
      await page.screenshot({ path: `${output}/${stem}-open.png` });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
    }

    await page.setViewportSize({ width: 640, height: 360 });
    for (const view of ["staff", "tablature"] as const) {
      await page.getByTestId(`progression-view-btn-${view}`).click();
      const trigger = page.locator('[data-measure-context-trigger][data-measure-index="1"]');
      await expect(trigger).toBeVisible();
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Measure 2 commands" });
      await expect(menu).toBeVisible();
      const geometry = await page.evaluate(() => {
        const rect = document
          .querySelector<HTMLElement>("[data-testid='measure-context-menu']")
          ?.getBoundingClientRect();
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          menu: rect
            ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
            : null,
        };
      });
      expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.menu?.left).toBeGreaterThanOrEqual(0);
      expect(geometry.menu?.top).toBeGreaterThanOrEqual(0);
      expect(geometry.menu?.right).toBeLessThanOrEqual(640);
      expect(geometry.menu?.bottom).toBeLessThanOrEqual(360);
      await page.screenshot({ path: `${output}/${theme}-640x360-${view}-open.png` });
      await page.keyboard.press("Escape");
    }

    const branchPage = await browser.newPage();
    await openStudio(branchPage, createActiveBranchFixture(theme));
    await branchPage.setViewportSize({ width: 640, height: 360 });
    await openMeasureMenu(branchPage, 0);
    const blockedMenu = branchPage.getByRole("menu", { name: "Measure 1 commands" });
    const blockedReason = blockedMenu.locator(".measure-context-menu-reason").filter({
      hasText: "Finish or discard the active branch",
    });
    await expect(blockedReason).toBeVisible();
    const blockedRect = await branchPage
      .locator("[data-testid='measure-context-menu']")
      .boundingBox();
    expect(blockedRect).not.toBeNull();
    expect(blockedRect!.x).toBeGreaterThanOrEqual(0);
    expect(blockedRect!.x + blockedRect!.width).toBeLessThanOrEqual(640);
    expect(blockedRect!.y + blockedRect!.height).toBeLessThanOrEqual(360);
    const reasonRect = await blockedReason.boundingBox();
    expect(reasonRect).not.toBeNull();
    expect(reasonRect!.y).toBeGreaterThanOrEqual(blockedRect!.y);
    expect(reasonRect!.y + reasonRect!.height).toBeLessThanOrEqual(
      blockedRect!.y + blockedRect!.height,
    );
    await branchPage.screenshot({ path: `${output}/${theme}-640x360-branch-disabled-open.png` });
    await branchPage.close();
    await page.close();
  }
});
