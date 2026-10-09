import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { Project } from "../../src/domain/project/project";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

async function openPianoRoll(page: Page, theme: "light" | "dark"): Promise<Project> {
  const source = createPianoRollSystemChordFixture(`measure-drag-selection-${theme}`);
  const sourceWithoutBranch = { ...source };
  delete sourceWithoutBranch.temporaryBranch;
  const project: Project = Object.freeze({
    ...sourceWithoutBranch,
    name: `Measure drag selection ${theme}`,
    presentation: Object.freeze({ ...source.presentation, theme }),
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
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
  const help = page.getByTestId("piano-roll-selection-help");
  if (await help.isVisible())
    await help.getByRole("button", { name: "Dismiss Piano Roll selection help" }).click();
  await page.mouse.move(2, 2);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await expect(page.locator(".piano-roll-measure")).toHaveCount(6);
  return project;
}

async function exportProject(page: Page): Promise<Project> {
  const toggle = page.getByTestId("export-menu-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  const downloadPromise = page.waitForEvent("download");
  await toggle.click();
  const menu = page.getByRole("menu", { name: "Export menu" });
  await expect(menu).toBeVisible();
  await menu.getByTestId("project-export-btn").click();
  const file = await (await downloadPromise).path();
  if (!file) throw new Error("Portable Project export did not provide a local file");
  return decodePortableProject(await readFile(file, "utf8"));
}

for (const theme of ["light", "dark"] as const) {
  test(`Measure drag suppresses native text selection and preserves drop/cancel in ${theme} theme`, async ({
    page,
  }, testInfo) => {
    const fixture = await openPianoRoll(page, theme);

    const secondMeasure = page.locator('.piano-roll-measure[data-measure-index="1"]');
    const secondMeasureHeader = secondMeasure.locator(".piano-roll-measure-header");
    const secondMeasureLabel = secondMeasureHeader.locator("span").first();
    await secondMeasureLabel.click();
    await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText(
      "Ctrl/Cmd+A: Measure 2",
    );
    await page.keyboard.press("Control+A");
    const measureTwoIdentities = await secondMeasure
      .locator("button.piano-roll-note")
      .evaluateAll((notes) =>
        notes
          .map((note) =>
            JSON.stringify([
              (note as HTMLButtonElement).dataset.sourceStepId,
              (note as HTMLButtonElement).dataset.pianoRollEventKey,
            ]),
          )
          .sort(),
      );
    const selectedMeasureTwoIdentities = await secondMeasure
      .locator("button.piano-roll-note[aria-pressed='true']")
      .evaluateAll((notes) =>
        notes
          .map((note) =>
            JSON.stringify([
              (note as HTMLButtonElement).dataset.sourceStepId,
              (note as HTMLButtonElement).dataset.pianoRollEventKey,
            ]),
          )
          .sort(),
      );
    expect(selectedMeasureTwoIdentities).toEqual(measureTwoIdentities);
    await page.keyboard.press("Escape");

    await page.getByTestId("piano-roll-audition-measure").first().click();
    await expect(page.getByTestId("progression-measure-drag-preview")).toHaveCount(0);
    await secondMeasureLabel.click({ button: "right" });
    await expect(page.getByRole("menu", { name: "Measure 2 commands" })).toBeVisible();
    await page.keyboard.press("Escape");
    const original = await exportProject(page);

    const dragToAfterSecondMeasure = async () => {
      const sourceHeader = page.locator(
        '.piano-roll-measure[data-measure-index="0"] .piano-roll-measure-header',
      );
      const targetHeader = page.locator(
        '.piano-roll-measure[data-measure-index="1"] .piano-roll-measure-header',
      );
      const targetSelect = page.getByTestId("piano-roll-select-measure-notes-1");
      const targetMenu = page.locator('[data-measure-context-trigger][data-measure-index="1"]');
      expect(await sourceHeader.evaluate((header) => getComputedStyle(header).userSelect)).toBe(
        "none",
      );
      const dragLabel = sourceHeader.locator("span").first();
      const sourceBox = await dragLabel.boundingBox();
      const targetBox = await page
        .locator('.piano-roll-measure[data-measure-index="1"]')
        .boundingBox();
      const targetHeaderBox = await targetHeader.boundingBox();
      const targetSelectBox = await targetSelect.boundingBox();
      const targetMenuBox = await targetMenu.boundingBox();
      if (!sourceBox || !targetBox || !targetHeaderBox || !targetSelectBox || !targetMenuBox)
        throw new Error("Measure drag targets are not visible");
      const blankLeft = Math.max(
        targetSelectBox.x + targetSelectBox.width + 4,
        targetBox.x + targetBox.width * 0.65,
      );
      const blankRight = targetMenuBox.x - 4;
      if (blankLeft >= blankRight)
        throw new Error("Measure header has no empty drop surface right of Select");
      const targetX = (blankLeft + blankRight) / 2;
      const targetY = targetHeaderBox.y + targetHeaderBox.height / 2;
      const transitY = targetHeaderBox.y + targetHeaderBox.height + 16;

      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      await page.mouse.move(2, 2);
      const help = page.getByTestId("piano-roll-selection-help");
      if (await help.isVisible())
        await help.getByRole("button", { name: "Dismiss Piano Roll selection help" }).click();
      const startX = sourceBox.x + 2;
      const startY = sourceBox.y + sourceBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      const selectionSamples = [];
      for (const x of [startX + 1, startX + 3, startX + 5]) {
        await page.mouse.move(x, startY);
        selectionSamples.push(
          await page.evaluate(() => {
            const selection = window.getSelection();
            return {
              collapsed: selection?.isCollapsed ?? true,
              text: selection?.toString() ?? "",
              type: selection?.type ?? "None",
            };
          }),
        );
      }
      await page.mouse.move(startX + 5, transitY);
      for (let step = 1; step <= 10; step += 1) {
        await page.mouse.move(startX + 5 + (targetX - (startX + 5)) * (step / 10), transitY);
        selectionSamples.push(
          await page.evaluate(() => {
            const selection = window.getSelection();
            return {
              collapsed: selection?.isCollapsed ?? true,
              text: selection?.toString() ?? "",
              type: selection?.type ?? "None",
            };
          }),
        );
      }
      await page.mouse.move(targetX, targetY);
      await expect(page.getByTestId("progression-measure-drag-preview")).toBeVisible();
      await expect(
        page.locator('.piano-roll-measure[data-measure-index="0"] .piano-roll-measure-header'),
      ).toHaveAttribute("data-measure-dragging", "true");
      await expect(page.locator('.piano-roll-measure[data-measure-index="1"]')).toHaveAttribute(
        "data-measure-drop-after",
        "true",
      );
      await page.waitForTimeout(350);
      await expect(help).toHaveCount(0);

      const selection = await page.evaluate(() => {
        const current = window.getSelection();
        return {
          collapsed: current?.isCollapsed ?? true,
          text: current?.toString() ?? "",
          type: current?.type ?? "None",
        };
      });
      expect(
        [...selectionSamples, selection].every((sample) => sample.collapsed && sample.text === ""),
        `native selection while dragging: ${JSON.stringify([...selectionSamples, selection])}`,
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`measure-drag-${theme}-1280x720.png`),
        animations: "disabled",
      });
    };

    await dragToAfterSecondMeasure();
    await page.keyboard.press("Escape");
    await page.mouse.move(20, 2);
    await page.mouse.up();
    await expect(page.getByTestId("progression-measure-drag-preview")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.userSelect)).toBe("");
    expect((await exportProject(page)).progression).toEqual(original.progression);

    await dragToAfterSecondMeasure();
    await page.mouse.up();
    await expect(
      page.locator('.piano-roll-measure[data-measure-index="0"] .piano-roll-chord'),
    ).toHaveAttribute("data-source-step-id", "chord-b");
    await expect(
      page.locator('.piano-roll-measure[data-measure-index="1"] .piano-roll-chord'),
    ).toHaveAttribute("data-source-step-id", "chord-a");
    expect((await exportProject(page)).progression.steps.map((step) => step.id)).toEqual([
      "chord-b",
      "chord-a",
      "chord-c",
      "rest-d",
      "generated-e",
      "chord-f",
    ]);
    expect(await page.evaluate(() => document.documentElement.style.userSelect)).toBe("");
    expect(fixture.progression.steps.map((step) => step.id)).toEqual([
      "chord-a",
      "chord-b",
      "chord-c",
      "rest-d",
      "generated-e",
      "chord-f",
    ]);
  });
}
