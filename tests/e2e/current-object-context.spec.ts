import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { encodePortableProject } from "../../src/persistence/portableProject";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

async function openFixture(page: Page, partialFinalMeasure = false): Promise<void> {
  const { temporaryBranch: _temporaryBranch, ...baseProject } = createPianoRollSystemChordFixture(
    "current-object-context-e2e",
  );
  const finalStep = baseProject.progression.steps.at(-1);
  const project =
    partialFinalMeasure && finalStep?.kind === "chord"
      ? Object.freeze({
          ...baseProject,
          progression: Object.freeze({
            ...baseProject.progression,
            steps: Object.freeze([
              ...baseProject.progression.steps.slice(0, -1),
              Object.freeze({ ...finalStep, duration: musicalDuration(rational(2)) }),
            ]),
          }),
        })
      : baseProject;
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
  await expect(page.getByTestId("project-menu-toggle")).toContainText(project.name);
  await page.keyboard.press("Escape");
}

async function clickUnoccupiedHeaderSurface(header: Locator): Promise<void> {
  await header.scrollIntoViewIfNeeded();
  const position = await header.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (let y = 2; y < rect.height - 2; y += 2) {
      for (let x = rect.width - 4; x >= 4; x -= 4) {
        const target = document.elementFromPoint(rect.left + x, rect.top + y);
        if (
          target instanceof Element &&
          target.closest("button, a, input, select, textarea, [role=button]") === null &&
          target.closest(".piano-roll-measure-header, .score-system-header") === element
        )
          return { x, y };
      }
    }
    throw new Error("Could not find an unoccupied area in the header surface");
  });
  await header.click({ position });
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

async function expectVisibleContextOutline(target: Locator): Promise<void> {
  await expect(target).toHaveAttribute("data-current-context", "true");
  await expect(target).toHaveAttribute("aria-current", "location");
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          (style.outlineStyle === "solid" && Number.parseFloat(style.outlineWidth) >= 2) ||
          (style.borderTopStyle === "solid" && Number.parseFloat(style.borderTopWidth) >= 2)
        );
      }),
    )
    .toBe(true);
}

async function clearContext(page: Page): Promise<void> {
  await page.getByTestId("progression-heading").locator("h2").click();
  await expect(page.locator("[data-current-context='true']")).toHaveCount(0);
}

test("Piano Roll blank Measure and System headers show the current object without adding history", async ({
  page,
}) => {
  await openFixture(page);
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const help = page.getByTestId("piano-roll-selection-help");
  if (await help.isVisible())
    await help.getByRole("button", { name: "Dismiss Piano Roll selection help" }).click();

  const undoBefore = await historyActionEnabled(page, "Undo");
  const measure = page.locator(".piano-roll-measure").nth(1);
  await clickUnoccupiedHeaderSurface(measure.locator(".piano-roll-measure-header"));
  await expectVisibleContextOutline(measure);
  expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);

  const note = page
    .locator('.piano-roll-measure[data-measure-index="1"] button.piano-roll-note')
    .first();
  await note.click();
  await expectVisibleContextOutline(measure);
  expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);

  const system = page.locator(".score-system").nth(1);
  await clickUnoccupiedHeaderSurface(system.locator(".score-system-header"));
  await expectVisibleContextOutline(system);
  await expect(measure).not.toHaveAttribute("data-current-context", "true");
  expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);

  await clearContext(page);
  await expect(page.locator(".score-system.is-current-context")).toHaveCount(0);
  expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);
});

test("Staff and Tablature headers expose the clicked system and Measure context", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openFixture(page);
  await expect(page.getByText("What-if branch active")).toHaveCount(0);
  const captureDirectory = process.env.CADENCEFLOW_SYSTEM_DND_SCREENSHOT_DIR;
  if (captureDirectory) await mkdir(captureDirectory, { recursive: true });

  for (const theme of ["dark", "light"] as const) {
    await page
      .getByRole("button", { name: `${theme === "dark" ? "Dark" : "Light"} theme` })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const view of ["staff", "tablature"] as const) {
      const viewButton = page.getByTestId(`progression-view-btn-${view}`);
      await viewButton.click();
      await expect(viewButton).toHaveAttribute("aria-pressed", "true");
      const system = page.locator(".score-system").first();
      const undoBefore = await historyActionEnabled(page, "Undo");

      await clickUnoccupiedHeaderSurface(system.locator(".score-system-header"));
      await expectVisibleContextOutline(system);
      expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);

      const selectedChord = system.locator('.measure-staff-event-select[data-step-id="chord-a"]');
      await selectedChord.click();
      await expect(selectedChord).toHaveAttribute("aria-pressed", "true");

      const paper = system.locator(".score-system-paper");
      const secondMeasureEvent = system
        .locator('.measure-staff-event[data-measure-index="1"]')
        .first();
      const blankCanvasPoint = await secondMeasureEvent.evaluate((event) => {
        const paper = event.closest<HTMLElement>(".score-system-paper")!;
        const paperRect = paper.getBoundingClientRect();
        const left = Number(event.getAttribute("data-resize-measure-left-px"));
        const width = Number(event.getAttribute("data-resize-measure-width-px"));
        return { x: left + width / 2, y: paperRect.height - 4 };
      });
      await paper.click({ position: blankCanvasPoint });
      const measureFrame = system.getByTestId("score-system-current-measure-1");
      await expectVisibleContextOutline(measureFrame);
      await expect(selectedChord).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("What-if branch active")).toHaveCount(0);
      await system.scrollIntoViewIfNeeded();
      const [headerBox, frameBox] = await Promise.all([
        system.locator(".score-system-header").boundingBox(),
        measureFrame.boundingBox(),
      ]);
      if (!headerBox || !frameBox) throw new Error("The selected Measure frame was not laid out");
      expect(headerBox.y).toBeGreaterThanOrEqual(0);
      expect(frameBox.y).toBeGreaterThanOrEqual(0);
      expect(frameBox.y + frameBox.height).toBeLessThanOrEqual(720);
      if (captureDirectory) {
        await page.screenshot({
          path: join(captureDirectory, `current-context-${view}-measure-1280x720-${theme}.png`),
          animations: "disabled",
        });
      }
      expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);

      const measureCommand = system.locator(
        '[data-measure-context-trigger][data-measure-index="1"]',
      );
      await measureCommand.click();
      await expectVisibleContextOutline(measureCommand);
      await page.keyboard.press("Escape");
      await expect(system).not.toHaveAttribute("data-current-context", "true");
      expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);

      await clearContext(page);
      expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);
    }
  }
});

test("Staff and Tablature empty final Measure gap receives its own current frame", async ({
  page,
}) => {
  await openFixture(page, true);

  for (const view of ["staff", "tablature"] as const) {
    const viewButton = page.getByTestId(`progression-view-btn-${view}`);
    await viewButton.click();
    await expect(viewButton).toHaveAttribute("aria-pressed", "true");
    const system = page.locator(".score-system").nth(2);
    const undoBefore = await historyActionEnabled(page, "Undo");
    const gap = system.locator('.measure-staff-gap[data-measure-index="5"]');
    await expect(gap).toBeVisible();
    await gap.click({ position: { x: 3, y: 3 } });
    await expectVisibleContextOutline(system.getByTestId("score-system-current-measure-5"));
    expect(await historyActionEnabled(page, "Undo")).toBe(undoBefore);
  }
});
