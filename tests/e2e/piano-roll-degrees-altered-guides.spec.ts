import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  setLayoutMeasuresPerSystem,
  setProgressionView,
} from "./test-helpers/progression-settings";

test("Degrees highlights only exact chord rows while keeping altered notes full height", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => window.localStorage.clear());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });

  for (const functionId of ["I", "V7/ii", "ii", "V7/IV", "IV"]) {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await setProgressionView(page, "staff");
  const progressionSteps = page.locator("[data-progression-step-select]");
  await expect(progressionSteps).toHaveCount(5);
  const c7StepId = await progressionSteps.nth(3).getAttribute("data-step-id");
  if (!c7StepId) throw new Error("C7 secondary dominant Step has no stable ID");
  const secondaryStep = progressionSteps.nth(1);
  const secondaryStepId = await secondaryStep.getAttribute("data-step-id");
  if (!secondaryStepId) throw new Error("Secondary dominant Step has no stable ID");
  await progressionSteps.first().click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
  await secondaryStep.click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
  await setLayoutMeasuresPerSystem(page, 4);
  await page.getByTestId("progression-view-btn-piano-roll").click();

  const toolbar = page.getByTestId("piano-roll-toolbar");
  await toolbar.getByRole("button", { name: "Degrees" }).click();
  await toolbar.getByLabel("Vertical range").selectOption("1");
  const grid = page.locator(".piano-roll-measure").first().locator(".piano-roll-grid");
  await grid.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  const alteredNote = page.locator(
    `button.piano-roll-note[data-source-step-id="${secondaryStepId}"][data-pitch-midi="61"][data-generated="false"]`,
  );
  await expect(alteredNote).toHaveCount(1);
  const chromaticOnset = await alteredNote.getAttribute("data-start-beats");
  const cRow = grid.locator('.piano-roll-row[data-pitch-midi="60"]');
  const dRow = grid.locator('.piano-roll-row[data-pitch-midi="62"]');
  await expect(grid.locator(".piano-roll-row.is-accidental")).toHaveCount(0);
  const [noteBox, cBox, dBox] = await Promise.all([
    alteredNote.boundingBox(),
    cRow.boundingBox(),
    dRow.boundingBox(),
  ]);
  if (!noteBox || !cBox || !dBox)
    throw new Error("Altered note or neighboring scale rows are hidden");
  expect(Math.abs(noteBox.height - cBox.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(noteBox.height - dBox.height)).toBeLessThanOrEqual(1);
  const boundary = (dBox.y + dBox.height + cBox.y) / 2;
  expect(Math.abs(noteBox.y + noteBox.height / 2 - boundary)).toBeLessThanOrEqual(1);
  expect(Math.abs(dBox.y + dBox.height - cBox.y)).toBeLessThanOrEqual(1);
  await expect(grid).toHaveAttribute(
    "data-pitch-row-count",
    (await grid.locator(".piano-roll-row").count()) + "",
  );
  await expect(grid).toHaveAttribute(
    "data-pitch-unit-count",
    (await grid.locator(".piano-roll-row").count()) + "",
  );

  const guides = toolbar.getByRole("button", { name: "Guides" });
  if ((await guides.getAttribute("aria-pressed")) !== "true") await guides.click();
  const a7RowMidi = 69;
  const a7ToneRows = [64, 67, a7RowMidi]; // E, G, A; C sharp is not a C or D guide
  for (const pitch of [60, 62]) {
    await expect(
      grid.locator(
        `.piano-roll-row[data-pitch-midi="${pitch}"] [data-testid="piano-roll-guide-tone"][data-source-step-id="${secondaryStepId}"]`,
      ),
    ).toHaveCount(0);
  }
  for (const pitch of a7ToneRows) {
    const row = grid.locator(`.piano-roll-row[data-pitch-midi="${pitch}"]`);
    const exactGuide = row.locator(
      `[data-testid="piano-roll-guide-tone"][data-source-step-id="${secondaryStepId}"]`,
    );
    await expect(exactGuide).toHaveCount(1);
    await expect(exactGuide).toHaveAttribute("data-pitch-class", String(pitch % 12));
    await expect(exactGuide).toHaveAttribute("data-guide-half", "full");
    await expect(exactGuide).toHaveAttribute("data-start-beats", chromaticOnset!);
    const [rowBox, guideBox] = await Promise.all([row.boundingBox(), exactGuide.boundingBox()]);
    if (!rowBox || !guideBox) throw new Error("A full-row chord-tone guide is hidden");
    expect(Math.abs(guideBox.height - rowBox.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(guideBox.y - rowBox.y)).toBeLessThanOrEqual(1);
  }

  const c7Grid = page
    .locator('.piano-roll-measure[data-measure-index="2"] .piano-roll-grid')
    .first();
  for (const pitch of [60, 64, 67]) {
    await expect(
      c7Grid.locator(
        `.piano-roll-row[data-pitch-midi="${pitch}"] [data-testid="piano-roll-guide-tone"][data-source-step-id="${c7StepId}"][data-pitch-class="${pitch % 12}"]`,
      ),
    ).toHaveCount(1);
  }
  for (const pitch of [69, 71]) {
    await expect(
      c7Grid.locator(
        `.piano-roll-row[data-pitch-midi="${pitch}"] [data-testid="piano-roll-guide-tone"][data-source-step-id="${c7StepId}"]`,
      ),
    ).toHaveCount(0);
  }

  const outputDirectory = "test-results/piano-roll-degrees-altered-guides";
  await mkdir(outputDirectory, { recursive: true });
  const themeGroup = page.getByRole("group", { name: "Theme" });
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width === 640) await toolbar.getByLabel("Vertical range").selectOption("0");
    for (const theme of ["Light", "Dark"] as const) {
      await themeGroup.getByRole("button", { name: `${theme} theme` }).click();
      for (const guidesEnabled of [false, true]) {
        const isPressed = (await guides.getAttribute("aria-pressed")) === "true";
        if (isPressed !== guidesEnabled) await guides.click();
        if (viewport.width === 640) {
          await toolbar.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
            element.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
          });
        } else {
          await toolbar.scrollIntoViewIfNeeded();
        }
        const toolbarGeometry = await toolbar.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const header = document
            .querySelector<HTMLElement>(".app-header")
            ?.getBoundingClientRect();
          const note = document
            .querySelector<HTMLElement>("button.piano-roll-note[data-generated='false']")
            ?.getBoundingClientRect();
          const ancestors: unknown[] = [];
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            const rect = parent.getBoundingClientRect();
            ancestors.push({
              className: parent.className.toString(),
              overflowY: style.overflowY,
              scrollTop: parent.scrollTop,
              scrollHeight: parent.scrollHeight,
              clientHeight: parent.clientHeight,
              top: rect.top,
              bottom: rect.bottom,
            });
          }
          return {
            viewport: { width: innerWidth, height: innerHeight },
            scrollY: window.scrollY,
            toolbar: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
            headerBottom: header?.bottom ?? null,
            note: note ? { top: note.top, bottom: note.bottom } : null,
            ancestors,
          };
        });
        await expect(toolbar, JSON.stringify(toolbarGeometry)).toBeInViewport();
        await expect(alteredNote).toBeVisible();
        if (viewport.width !== 640) await expect(alteredNote).toBeInViewport();
        const ownerChord = page.locator(
          `.piano-roll-chord[data-source-step-id="${secondaryStepId}"]`,
        );
        await expect(ownerChord).toBeVisible();
        if (viewport.width === 640) {
          const viewportGeometry = await page.evaluate(
            ({ noteSelector, chordSelector }) => {
              const header = document.querySelector(".app-header")!.getBoundingClientRect();
              const toolbar = document
                .querySelector("[data-testid='piano-roll-toolbar']")!
                .getBoundingClientRect();
              const note = document.querySelector(noteSelector)!.getBoundingClientRect();
              const chord = document.querySelector(chordSelector)!.getBoundingClientRect();
              return {
                headerBottom: header.bottom,
                toolbarTop: toolbar.top,
                toolbarBottom: toolbar.bottom,
                noteTop: note.top,
                noteBottom: note.bottom,
                chordTop: chord.top,
                chordBottom: chord.bottom,
                width: innerWidth,
                height: innerHeight,
              };
            },
            {
              noteSelector: `button.piano-roll-note[data-source-step-id="${secondaryStepId}"][data-pitch-midi="61"][data-generated="false"]`,
              chordSelector: `.piano-roll-chord[data-source-step-id="${secondaryStepId}"]`,
            },
          );
          expect(viewportGeometry.toolbarTop).toBeGreaterThanOrEqual(
            viewportGeometry.headerBottom + 2,
          );
          expect(viewportGeometry.noteTop).toBeGreaterThan(viewportGeometry.toolbarBottom);
          expect(viewportGeometry.chordTop).toBeGreaterThan(viewportGeometry.noteTop);
        }
        const state = guidesEnabled ? "guides-on" : "guides-off";
        await page.screenshot({
          path: `${outputDirectory}/${viewport.width}x${viewport.height}-${theme.toLowerCase()}-${state}${viewport.width === 640 ? "-controls" : ""}.png`,
        });
        if (viewport.width === 640) {
          await ownerChord.evaluate((chord) =>
            chord.scrollIntoView({ block: "end", inline: "center", behavior: "instant" }),
          );
          await page.evaluate(() => window.scrollBy({ top: 2, behavior: "instant" }));
          await expect(ownerChord).toBeInViewport();
          await expect(alteredNote).toBeInViewport();
          const musicStripGeometry = await page.evaluate(
            ({ noteSelector, chordSelector }) => {
              const header = document.querySelector(".app-header")!.getBoundingClientRect();
              const note = document.querySelector(noteSelector)!.getBoundingClientRect();
              const chord = document.querySelector(chordSelector)!.getBoundingClientRect();
              return {
                headerBottom: header.bottom,
                noteTop: note.top,
                noteBottom: note.bottom,
                chordTop: chord.top,
                chordBottom: chord.bottom,
                height: innerHeight,
              };
            },
            {
              noteSelector: `button.piano-roll-note[data-source-step-id="${secondaryStepId}"][data-pitch-midi="61"][data-generated="false"]`,
              chordSelector: `.piano-roll-chord[data-source-step-id="${secondaryStepId}"]`,
            },
          );
          expect(musicStripGeometry.noteTop).toBeGreaterThan(musicStripGeometry.headerBottom);
          expect(musicStripGeometry.chordBottom).toBeLessThanOrEqual(musicStripGeometry.height);
          await page.screenshot({
            path: `${outputDirectory}/640x360-${theme.toLowerCase()}-${state}-music-strip.png`,
          });
          await page.screenshot({
            path: `${outputDirectory}/640x360-${theme.toLowerCase()}-${state}-full.png`,
            fullPage: true,
          });
        }
      }
    }
  }

  const beforeGuidesOff = await alteredNote.boundingBox();
  if (!beforeGuidesOff) throw new Error("Altered note disappeared before the Guides off check");
  if ((await guides.getAttribute("aria-pressed")) === "true") await guides.click();
  await expect(grid.locator('[data-testid="piano-roll-guide-tone"]')).toHaveCount(0);
  const afterGuidesOff = await alteredNote.boundingBox();
  if (!afterGuidesOff) throw new Error("Altered note disappeared with Guides off");
  expect(Math.abs(afterGuidesOff.height - beforeGuidesOff.height)).toBeLessThanOrEqual(1);
  await expect(alteredNote).toHaveAttribute("data-start-beats", chromaticOnset!);
});
