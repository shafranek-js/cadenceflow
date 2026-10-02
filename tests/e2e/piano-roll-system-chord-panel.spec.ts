import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Project } from "../../src/domain/project/project";
import { snapshotAuthoredMelodyPhrase, snapshotChordMelody } from "../../src/domain/melody/types";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

async function openStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: import("@playwright/test").Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function historyAction(
  page: import("@playwright/test").Page,
  action: "Undo" | "Redo",
): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function exportProjectFilePath(page: import("@playwright/test").Page): Promise<string> {
  await page.keyboard.press("Escape");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Portable project download did not expose a local path");
  return path;
}

async function alignSystemHeader(page: import("@playwright/test").Page, index = 0): Promise<void> {
  const header = page.locator(".score-system-header").nth(index);
  await expect(header).toBeVisible();
  await header.evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY;
    const appHeaderBottom =
      document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0;
    window.scrollTo({ top: Math.max(0, top - appHeaderBottom - 8), behavior: "instant" });
  });
}

async function importVisualFixture(
  page: import("@playwright/test").Page,
  project: Project,
): Promise<void> {
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(project.name);
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
}

async function expectVisibleMusicAndPanel(
  page: import("@playwright/test").Page,
  panel: import("@playwright/test").Locator,
  requireVisibleNotes = true,
): Promise<void> {
  const state = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".score-system-header");
    const panelElement = document.querySelector<HTMLElement>(
      '[data-testid^="piano-roll-system-chord-panel-"], [data-testid^="piano-roll-system-note-panel-"]',
    );
    const grid = document.querySelector<HTMLElement>(".piano-roll-grid");
    const title =
      header?.querySelector<HTMLElement>('[data-testid^="score-system-audition-"]') ??
      header?.querySelector<HTMLElement>("strong");
    const measureCount = title?.nextElementSibling as HTMLElement | null;
    const notes = [...document.querySelectorAll<HTMLElement>("button.piano-roll-note")];
    const visibleNotes = notes.filter((note) => {
      const rect = note.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth
      );
    });
    const visibleChords = [
      ...document.querySelectorAll<HTMLElement>("button.piano-roll-chord"),
    ].filter((chord) => {
      const rect = chord.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth
      );
    }).length;
    const controls = panelElement
      ? [...panelElement.querySelectorAll<HTMLElement>("button, select, input")]
      : [];
    return {
      header: header?.getBoundingClientRect().toJSON(),
      panel: panelElement?.getBoundingClientRect().toJSON(),
      grid: grid?.getBoundingClientRect().toJSON(),
      title: title?.getBoundingClientRect().toJSON(),
      measureCount: measureCount?.getBoundingClientRect().toJSON(),
      titleCenter: title
        ? title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2
        : null,
      measureCenter: measureCount
        ? measureCount.getBoundingClientRect().top + measureCount.getBoundingClientRect().height / 2
        : null,
      panelCenter: panelElement
        ? panelElement.getBoundingClientRect().top + panelElement.getBoundingClientRect().height / 2
        : null,
      visibleNotes: visibleNotes.length,
      visibleChords,
      missedControls: controls.flatMap((control) => {
        const rect = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return !hit || !(hit === control || control.contains(hit) || hit.contains(control))
          ? [
              {
                control: `${control.tagName}.${control.className} ${control.getAttribute("aria-label") ?? control.textContent?.trim()}`,
                bounds: rect.toJSON(),
                hit: hit ? `${hit.tagName}.${(hit as HTMLElement).className}` : null,
              },
            ]
          : [];
      }),
      panelScrolls: Boolean(
        panelElement &&
        (panelElement.scrollWidth > panelElement.clientWidth ||
          panelElement.scrollHeight > panelElement.clientHeight),
      ),
      headerScrolls: Boolean(header && header.scrollWidth > header.clientWidth),
      pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      zooms: [document.documentElement, document.body, header]
        .filter(Boolean)
        .map((element) => getComputedStyle(element!).zoom),
    };
  });
  expect(state.header).toBeTruthy();
  expect(state.panel).toBeTruthy();
  expect(state.grid).toBeTruthy();
  expect(state.title).toBeTruthy();
  expect(state.measureCount).toBeTruthy();
  expect(state.header!.top).toBeGreaterThanOrEqual(0);
  expect(state.header!.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(state.grid!.top).toBeLessThan(page.viewportSize()!.height);
  if (requireVisibleNotes) expect(state.visibleNotes).toBeGreaterThan(0);
  else expect(state.visibleChords).toBeGreaterThan(0);
  expect(Math.abs(state.titleCenter! - state.measureCenter!)).toBeLessThan(1);
  expect(Math.abs(state.titleCenter! - state.panelCenter!)).toBeLessThan(1);
  expect(state.missedControls).toHaveLength(0);
  expect(state.panelScrolls).toBe(false);
  expect(state.headerScrolls).toBe(false);
  expect(state.pageFits).toBe(true);
  expect(state.zooms.every((zoom) => zoom === "1" || zoom === "normal")).toBe(true);
  await expect(panel).toBeVisible();
}

test("Piano Roll chord controls stay on the System row and edit through undoable actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await openStudio(page);
  for (const functionId of ["I", "V", "vi", "IV"]) await addChord(page, functionId);
  await setLayoutMeasuresPerSystem(page, 4);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await page.getByLabel("Snap resolution").selectOption("1/8");

  const firstChord = page.getByTestId("piano-roll-chord").first();
  const sourceStepId = await firstChord.getAttribute("data-source-step-id");
  if (!sourceStepId) throw new Error("First chord has no Step ID");
  const beforeSelectionPath = await exportProjectFilePath(page);
  const beforeSelection = await readFile(beforeSelectionPath, "utf8");
  await firstChord.click();
  const afterSelectionPath = await exportProjectFilePath(page);
  const afterSelection = await readFile(afterSelectionPath, "utf8");
  expect(afterSelection).toBe(beforeSelection);

  const panel = page.getByTestId("piano-roll-system-chord-panel-0");
  await expect(panel).toBeVisible();
  for (const viewport of [
    { width: 480, height: 900 },
    { width: 640, height: 360 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const themeName of ["Dark", "Light"] as const) {
      await page.getByRole("button", { name: `${themeName} theme` }).click();
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await page
          .getByRole("group", { name: "Pitch grid" })
          .getByRole("button", { name: gridMode, exact: true })
          .click();
        const geometry = await panel.evaluate((element) => {
          const header = element.closest<HTMLElement>(".score-system-header");
          if (!header) throw new Error("Chord panel is outside the System header");
          const title =
            header.querySelector<HTMLElement>('[data-testid^="score-system-audition-"]') ??
            header.querySelector<HTMLElement>("strong");
          const measureCount = title?.nextElementSibling as HTMLElement | null;
          const headerBox = header.getBoundingClientRect();
          const panelBox = element.getBoundingClientRect();
          const titleBox = title?.getBoundingClientRect();
          const measureBox = measureCount?.getBoundingClientRect();
          const controls = [...element.querySelectorAll<HTMLElement>("button, select, input")];
          return {
            header: {
              left: headerBox.left,
              right: headerBox.right,
              top: headerBox.top,
              bottom: headerBox.bottom,
              scrollWidth: header.scrollWidth,
              clientWidth: header.clientWidth,
            },
            panel: {
              left: panelBox.left,
              right: panelBox.right,
              top: panelBox.top,
              bottom: panelBox.bottom,
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
              scrollHeight: element.scrollHeight,
              clientHeight: element.clientHeight,
            },
            titleCenter: titleBox ? titleBox.top + titleBox.height / 2 : null,
            measureCenter: measureBox ? measureBox.top + measureBox.height / 2 : null,
            controlCount: controls.length,
            missedTargets: controls.filter((control) => {
              const rect = control.getBoundingClientRect();
              const hit = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              );
              return !hit || !(hit === control || control.contains(hit) || hit.contains(control));
            }).length,
            pageWidthFits:
              document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          };
        });
        expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.header.top - 1);
        expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.header.bottom + 1);
        expect(geometry.titleCenter).not.toBeNull();
        expect(geometry.measureCenter).not.toBeNull();
        expect(
          Math.abs(
            geometry.panel.top +
              (geometry.panel.bottom - geometry.panel.top) / 2 -
              geometry.titleCenter!,
          ),
        ).toBeLessThan(1);
        expect(Math.abs(geometry.measureCenter! - geometry.titleCenter!)).toBeLessThan(1);
        expect(geometry.panel.right).toBeLessThanOrEqual(geometry.header.right);
        expect(geometry.panel.scrollWidth).toBeLessThanOrEqual(geometry.panel.clientWidth);
        expect(geometry.panel.scrollHeight).toBeLessThanOrEqual(geometry.panel.clientHeight);
        expect(geometry.header.scrollWidth).toBeLessThanOrEqual(geometry.header.clientWidth);
        expect(geometry.controlCount).toBeGreaterThan(10);
        expect(geometry.missedTargets).toBe(0);
        expect(geometry.pageWidthFits).toBe(true);
        await page.screenshot({
          path: `test-results/system-chord-panel-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridMode.toLowerCase()}.png`,
        });
      }
    }
  }
  await page.setViewportSize({ width: 640, height: 900 });

  const boundary = page.locator(
    `.piano-roll-chord-boundary-handle[data-boundary-step-id="${sourceStepId}"][data-boundary-edge="right"]`,
  );
  await expect(boundary).toBeVisible();
  const originalBoundary = Number(await boundary.getAttribute("aria-valuenow"));
  await boundary.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeGreaterThan(originalBoundary);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await expect(boundary).toBeFocused();
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBe(originalBoundary);
  await page.keyboard.press("ArrowRight");
  const committedBoundary = await boundary.getAttribute("aria-valuenow");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await expect(boundary).toHaveAttribute("aria-valuenow", committedBoundary!);
  await historyAction(page, "Undo");
  await expect(boundary).toHaveAttribute("aria-valuenow", String(originalBoundary));

  await page.setViewportSize({ width: 1920, height: 900 });
  const secondMeasureGrid = page
    .getByRole("region", { name: "Measure 2" })
    .locator(".piano-roll-grid");
  await expect(secondMeasureGrid).toBeAttached();
  const secondGridBox = await secondMeasureGrid.boundingBox();
  const boundaryBox = await boundary.boundingBox();
  expect(secondGridBox).toBeTruthy();
  expect(boundaryBox).toBeTruthy();
  const pointerStart = {
    x: boundaryBox!.x + boundaryBox!.width / 2,
    y: boundaryBox!.y + boundaryBox!.height / 2,
  };
  const pointerEnd = {
    x: secondGridBox!.x + secondGridBox!.width / 8,
    y: pointerStart.y,
  };
  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await page.mouse.move(pointerEnd.x, pointerEnd.y, { steps: 6 });
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeGreaterThan(originalBoundary);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBe(originalBoundary);

  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await page.mouse.move(pointerEnd.x, pointerEnd.y, { steps: 6 });
  await expect(page.getByTestId("duration-resize-status")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeGreaterThan(originalBoundary);
  await historyAction(page, "Undo");
  await expect(boundary).toHaveAttribute("aria-valuenow", String(originalBoundary));

  const harmony = page.locator(`.piano-roll-chord[data-source-step-id="${sourceStepId}"]`).first();
  await panel.getByRole("button", { name: "Remove Harmony and make Rest" }).click();
  await expect(harmony).toHaveClass(/is-rest/);
  await historyAction(page, "Undo");
  await expect(harmony).not.toHaveClass(/is-rest/);

  const chordCount = await page.getByTestId("piano-roll-chord").count();
  await panel.getByRole("button", { name: "Split Step into equal halves" }).click();
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(chordCount + 1);
  await historyAction(page, "Undo");
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(chordCount);
  await historyAction(page, "Redo");
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(chordCount + 1);

  const exportedPath = await exportProjectFilePath(page);
  const decodedExport = decodePortableProject(await readFile(exportedPath, "utf8"));
  const decodedSourceIndex = decodedExport.progression.steps.findIndex(
    (step) => step.id === sourceStepId,
  );
  expect(decodedExport.progression.steps).toHaveLength(5);
  const decodedSource = decodedExport.progression.steps[decodedSourceIndex];
  const decodedSplit = decodedExport.progression.steps[decodedSourceIndex + 1];
  expect(decodedSource?.kind).toBe("chord");
  expect(decodedSplit?.kind).toBe("chord");
  expect(decodedSource?.duration.beats).toEqual({ numerator: 2, denominator: 1 });
  expect(decodedSplit?.duration.beats).toEqual({ numerator: 2, denominator: 1 });
  expect(decodedSplit?.id).not.toBe(sourceStepId);
  if (decodedSource?.kind === "chord" && decodedSplit?.kind === "chord") {
    expect(decodedSplit.harmonicFunction).toEqual(decodedSource.harmonicFunction);
    expect(decodedSplit.performance).toEqual(decodedSource.performance);
  }
  const fileInput = page.getByTestId("project-file-input");
  if ((await fileInput.count()) === 0) await page.getByTestId("project-menu-toggle").click();
  await fileInput.setInputFiles(exportedPath);
  await expect(page.getByTestId("project-menu-toggle")).toContainText("CadenceFlow", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(5);
  await expect(
    page.locator(`.piano-roll-chord[data-source-step-id="${sourceStepId}"]`),
  ).toHaveCount(1);
});

test("music-visible NOTE, CHORD and hidden-selection captures fit normal viewport sizes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  const firstStep = fixture.progression.steps[0];
  if (firstStep?.kind !== "chord" || firstStep.melody?.mode !== "authored")
    throw new Error("Visual fixture requires an authored first chord");
  const firstNote = firstStep.melody.phrase.notes[0];
  if (!firstNote) throw new Error("Visual fixture requires a visible note");
  const compactSteps = fixture.progression.steps.map((step) => {
    if (step.kind === "rest")
      return Object.freeze({
        ...step,
        authoredMelody: snapshotAuthoredMelodyPhrase({ notes: [] }),
      });
    return Object.freeze({
      ...step,
      melody: snapshotChordMelody({
        mode: "authored",
        phrase: snapshotAuthoredMelodyPhrase({
          notes: step.id === firstStep.id ? [firstNote] : [],
        }),
      }),
    });
  });
  const visualProject: Project = Object.freeze({
    ...fixture,
    harmonyTrack: Object.freeze({ ...fixture.harmonyTrack, muted: true }),
    melodyTrack: Object.freeze({ ...fixture.melodyTrack, muted: true }),
    presentation: Object.freeze({ ...fixture.presentation, measuresPerSystem: 4 }),
    progression: Object.freeze({ ...fixture.progression, steps: Object.freeze(compactSteps) }),
  });
  await importVisualFixture(page, visualProject);
  const chord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  const note = page.locator('button.piano-roll-note[data-source-step-id="chord-a"]').first();
  const theme = page.getByRole("group", { name: "Theme" });
  const gridMode = page.getByRole("group", { name: "Pitch grid" });
  const inspector = page.getByRole("complementary", { name: "Inspector" });

  for (const viewport of [
    { width: 640, height: 360 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const themeName of ["Dark", "Light"] as const) {
      if (
        (await theme
          .getByRole("button", { name: `${themeName} theme` })
          .getAttribute("aria-pressed")) !== "true"
      )
        await theme.getByRole("button", { name: `${themeName} theme` }).click();
      for (const gridName of ["Degrees", "Chromatic"] as const) {
        await gridMode.getByRole("button", { name: gridName, exact: true }).click();

        await chord.click();
        const chordPanel = page.getByTestId("piano-roll-system-chord-panel-0");
        await alignSystemHeader(page);
        await page.screenshot({
          path: `test-results/music-visible-chord-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridName.toLowerCase()}.png`,
        });
        await expectVisibleMusicAndPanel(page, chordPanel, viewport.height > 360);
        await expect(inspector).toBeVisible();
        const degreeOneColor = await chordPanel
          .getByRole("button", { name: /Replace with degree 1/ })
          .evaluate((button) => getComputedStyle(button).backgroundColor);
        expect(degreeOneColor).toMatch(/^rgb\(/);
        await note.click();
        const notePanel = page.getByTestId("piano-roll-system-note-panel-0");
        await expect(chordPanel).toHaveCount(0);
        await alignSystemHeader(page);
        await expectVisibleMusicAndPanel(page, notePanel, viewport.height > 360);
        await expect(inspector).toBeVisible();
        await page.screenshot({
          path: `test-results/music-visible-note-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridName.toLowerCase()}.png`,
        });
        if (viewport.height === 360) {
          await note.evaluate((element) => {
            const noteTop = element.getBoundingClientRect().top + window.scrollY;
            const appHeaderBottom =
              document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ??
              0;
            window.scrollTo({
              top: Math.max(0, noteTop - appHeaderBottom - 20),
              behavior: "instant",
            });
          });
          const scrolledNote = await note.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            return {
              bounds: rect.toJSON(),
              hitNote: Boolean(hit && (hit === element || element.contains(hit))),
              grid: element.closest(".piano-roll-grid")?.getBoundingClientRect().toJSON(),
              appHeaderBottom:
                document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect()
                  .bottom ?? 0,
              pageFits:
                document.documentElement.scrollWidth <= document.documentElement.clientWidth,
              zoom: getComputedStyle(document.documentElement).zoom,
            };
          });
          expect(scrolledNote.bounds.top).toBeGreaterThanOrEqual(scrolledNote.appHeaderBottom);
          expect(scrolledNote.bounds.bottom).toBeLessThan(360);
          expect(scrolledNote.hitNote).toBe(true);
          expect(scrolledNote.grid?.bottom).toBeGreaterThan(scrolledNote.bounds.top);
          expect(scrolledNote.pageFits).toBe(true);
          expect(["1", "normal"]).toContain(scrolledNote.zoom);
          await page.screenshot({
            path: `test-results/music-visible-note-grid-640x360-${themeName.toLowerCase()}-${gridName.toLowerCase()}.png`,
          });
          await alignSystemHeader(page);
        }

        const grid = page.getByRole("group", { name: "Melody grid, measure 1" });
        const gridBox = await grid.boundingBox();
        if (!gridBox) throw new Error("Fixture Melody grid has no visible bounds");
        await grid.click({
          position: { x: gridBox.width * 0.96, y: gridBox.height * 0.15 },
        });
        await expect(notePanel).toHaveCount(0);
        await expect(chordPanel).toHaveCount(0);
        await alignSystemHeader(page);
        const hiddenViewport = await page.evaluate(() => {
          const header = document.querySelector<HTMLElement>(".score-system-header")!;
          const notes = [...document.querySelectorAll<HTMLElement>("button.piano-roll-note")];
          return {
            header: header.getBoundingClientRect().toJSON(),
            notes: notes.filter((entry) => {
              const rect = entry.getBoundingClientRect();
              return (
                rect.bottom > 0 &&
                rect.top < window.innerHeight &&
                rect.right > 0 &&
                rect.left < window.innerWidth &&
                rect.width > 0
              );
            }).length,
            chords: [...document.querySelectorAll<HTMLElement>("button.piano-roll-chord")].filter(
              (entry) => {
                const rect = entry.getBoundingClientRect();
                return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
              },
            ).length,
            pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          };
        });
        expect(hiddenViewport.header.top).toBeGreaterThanOrEqual(0);
        expect(hiddenViewport.header.bottom).toBeLessThanOrEqual(viewport.height);
        if (viewport.height > 360) expect(hiddenViewport.notes).toBeGreaterThan(0);
        else expect(hiddenViewport.chords).toBeGreaterThan(0);
        expect(hiddenViewport.pageFits).toBe(true);
        await page.screenshot({
          path: `test-results/music-visible-hidden-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridName.toLowerCase()}.png`,
        });
      }
    }
  }
});

test("selecting a chord continuation displays its source Step panel in that System", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  const first = fixture.progression.steps[0];
  if (!first) throw new Error("Fixture is missing its first Step");
  const spanningProject: Project = Object.freeze({
    ...fixture,
    harmonyTrack: Object.freeze({ ...fixture.harmonyTrack, muted: true }),
    melodyTrack: Object.freeze({ ...fixture.melodyTrack, muted: true }),
    presentation: Object.freeze({ ...fixture.presentation, measuresPerSystem: 1 }),
    progression: Object.freeze({
      ...fixture.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(12)) }),
        ...fixture.progression.steps.slice(1),
      ]),
    }),
  });
  await importVisualFixture(page, spanningProject);
  const before = await exportProjectFilePath(page);
  const beforeText = await readFile(before, "utf8");
  const continuation = page
    .getByRole("region", { name: "Measure 2" })
    .locator('.piano-roll-chord[data-source-step-id="chord-a"]');
  await expect(continuation).toBeVisible();
  await continuation.click();
  await expect(page.getByTestId("piano-roll-system-chord-panel-1")).toBeVisible();
  await expect(page.getByTestId("piano-roll-system-chord-panel-0")).toHaveCount(0);
  await alignSystemHeader(page, 1);
  const continuationBounds = await continuation.boundingBox();
  const noteBounds = continuationBounds;
  expect(continuationBounds).toBeTruthy();
  expect(noteBounds).toBeTruthy();
  expect(noteBounds!.y + noteBounds!.height).toBeGreaterThan(0);
  expect(noteBounds!.y).toBeLessThan(720);
  await page.screenshot({ path: "test-results/music-visible-chord-continuation-1280x720.png" });
  const after = await exportProjectFilePath(page);
  expect(await readFile(after, "utf8")).toBe(beforeText);
});
