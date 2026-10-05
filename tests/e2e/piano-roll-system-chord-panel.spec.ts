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
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Portable project download did not expose a local path");
  return path;
}

async function revealWithinStudioGrid(
  target: import("@playwright/test").Locator,
  inset = 8,
): Promise<void> {
  await target.evaluate((element, scrollInset) => {
    const scroller = element.closest<HTMLElement>(".studio-grid");
    if (!scroller) throw new Error("The Piano Roll target is outside the Studio scroll region");
    const scrollport = scroller.getBoundingClientRect();
    const visibleTop = scrollport.top + scroller.clientTop + scrollInset;
    const visibleBottom = scrollport.top + scroller.clientTop + scroller.clientHeight - scrollInset;
    const rect = element.getBoundingClientRect();
    const delta =
      rect.top < visibleTop
        ? rect.top - visibleTop
        : rect.bottom > visibleBottom
          ? rect.bottom - visibleBottom
          : 0;
    if (delta !== 0) scroller.scrollBy({ top: delta, behavior: "instant" });
  }, inset);
}

async function dismissSelectionHelp(page: import("@playwright/test").Page): Promise<void> {
  const help = page.getByTestId("piano-roll-selection-help");
  if (await help.isVisible())
    await help.getByRole("button", { name: "Dismiss Piano Roll selection help" }).click();
  await page.mouse.move(2, 2);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await expect(help).toHaveCount(0);
}

async function alignSystemHeader(page: import("@playwright/test").Page, index = 0): Promise<void> {
  const header = page.locator(".score-system-header").nth(index);
  await expect(header).toBeVisible();
  await header.evaluate((element) => {
    const scroller = element.closest<HTMLElement>(".studio-grid");
    if (!scroller) throw new Error("The System header is outside the Studio scroll region");
    const scrollport = scroller.getBoundingClientRect();
    const visibleTop = scrollport.top + scroller.clientTop;
    scroller.scrollBy({
      top: element.getBoundingClientRect().top - visibleTop,
      behavior: "instant",
    });
  });
  await expect
    .poll(() =>
      header.evaluate((element) => {
        const headerBox = element.getBoundingClientRect();
        const scroller = element.closest<HTMLElement>(".studio-grid");
        if (!scroller) return false;
        const scrollport = scroller.getBoundingClientRect();
        const visibleTop = scrollport.top + scroller.clientTop;
        const visibleBottom = scrollport.top + scroller.clientTop + scroller.clientHeight;
        return headerBox.top >= visibleTop - 1 && headerBox.bottom <= visibleBottom + 1;
      }),
    )
    .toBe(true);
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
  await dismissSelectionHelp(page);
  const state = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".score-system-header");
    const panelElement = document.querySelector<HTMLElement>(
      '[data-testid^="piano-roll-system-chord-panel-"], [data-testid^="piano-roll-system-note-panel-"]',
    );
    const grid = document.querySelector<HTMLElement>(".piano-roll-grid");
    const studioScroller = document.querySelector<HTMLElement>(".studio-grid");
    const studioScrollport = studioScroller?.getBoundingClientRect();
    const studioTop = studioScrollport ? studioScrollport.top + studioScroller!.clientTop : 0;
    const studioBottom = studioScroller ? studioTop + studioScroller.clientHeight : 0;
    const title =
      header?.querySelector<HTMLElement>('[data-testid^="score-system-audition-"]') ??
      header?.querySelector<HTMLElement>("strong");
    const measureCount = [...(header?.querySelectorAll<HTMLElement>("span") ?? [])].find(
      (candidate) => /^\d+ measures?$/.test(candidate.textContent?.trim() ?? ""),
    );
    const notes = [...document.querySelectorAll<HTMLElement>("button.piano-roll-note")];
    const visibleNotes = notes.filter((note) => {
      const rect = note.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > studioTop &&
        rect.top < studioBottom &&
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
        rect.bottom > studioTop &&
        rect.top < studioBottom &&
        rect.right > 0 &&
        rect.left < window.innerWidth
      );
    }).length;
    const controls = panelElement
      ? [...panelElement.querySelectorAll<HTMLElement>("button, select, input")]
      : [];
    const overlaps = (first: DOMRect | undefined, second: DOMRect | undefined) =>
      Boolean(
        first &&
        second &&
        first.left < second.right - 0.5 &&
        first.right > second.left + 0.5 &&
        first.top < second.bottom - 0.5 &&
        first.bottom > second.top + 0.5,
      );
    const titleBox = title?.getBoundingClientRect();
    const measureBox = measureCount?.getBoundingClientRect();
    const panelBox = panelElement?.getBoundingClientRect();
    const controlsClipped = controls.filter((control) => {
      const controlRect = control.getBoundingClientRect();
      for (
        let ancestor = control.parentElement;
        ancestor && ancestor !== document.body;
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);
        const ancestorRect = ancestor.getBoundingClientRect();
        if (
          ["auto", "clip", "hidden", "scroll"].includes(style.overflowX) &&
          (controlRect.left < ancestorRect.left || controlRect.right > ancestorRect.right)
        )
          return true;
        if (
          ["auto", "clip", "hidden", "scroll"].includes(style.overflowY) &&
          (controlRect.top < ancestorRect.top || controlRect.bottom > ancestorRect.bottom)
        )
          return true;
      }
      return false;
    }).length;
    return {
      header: header?.getBoundingClientRect().toJSON(),
      panel: panelBox?.toJSON(),
      grid: grid?.getBoundingClientRect().toJSON(),
      title: titleBox?.toJSON(),
      measureCount: measureBox?.toJSON(),
      titleCenter: titleBox ? titleBox.top + titleBox.height / 2 : null,
      measureCenter: measureBox ? measureBox.top + measureBox.height / 2 : null,
      panelCenter: panelBox ? panelBox.top + panelBox.height / 2 : null,
      studioTop,
      studioBottom,
      gridVisibleHeight: grid
        ? Math.max(
            0,
            Math.min(grid.getBoundingClientRect().bottom, studioBottom) -
              Math.max(grid.getBoundingClientRect().top, studioTop),
          )
        : 0,
      gridBelowPanel: Boolean(
        grid && panelBox && grid.getBoundingClientRect().top >= panelBox.bottom - 1,
      ),
      titlePanelOverlap: overlaps(titleBox, panelBox),
      measurePanelOverlap: overlaps(measureBox, panelBox),
      controlsOutsideViewport: controls.filter((control) => {
        const rect = control.getBoundingClientRect();
        return (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.left < 0 ||
          rect.right > window.innerWidth ||
          rect.top < studioTop ||
          rect.bottom > studioBottom
        );
      }).length,
      controlsClipped,
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
      panelScrollDimensions: panelElement
        ? {
            scrollWidth: panelElement.scrollWidth,
            clientWidth: panelElement.clientWidth,
            scrollHeight: panelElement.scrollHeight,
            clientHeight: panelElement.clientHeight,
            overflowX: getComputedStyle(panelElement).overflowX,
            overflowY: getComputedStyle(panelElement).overflowY,
          }
        : null,
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
  expect(state.header!.top).toBeGreaterThanOrEqual(state.studioTop - 1);
  expect(state.header!.bottom).toBeLessThanOrEqual(state.studioBottom + 1);
  expect(state.grid!.top).toBeLessThan(state.studioBottom);
  expect(state.gridVisibleHeight).toBeGreaterThan(0);
  expect(state.gridBelowPanel).toBe(true);
  if (requireVisibleNotes) expect(state.visibleNotes).toBeGreaterThan(0);
  expect(state.titlePanelOverlap).toBe(false);
  expect(state.measurePanelOverlap).toBe(false);
  if (page.viewportSize()!.width >= 1280) {
    expect(Math.abs(state.titleCenter! - state.measureCenter!)).toBeLessThan(1);
    expect(Math.abs(state.titleCenter! - state.panelCenter!)).toBeLessThan(1);
  } else {
    expect(state.panel!.top).toBeGreaterThanOrEqual(
      Math.max(state.title!.bottom, state.measureCount!.bottom) - 1,
    );
  }
  expect(
    state.missedControls,
    `Chord and note panel controls remain hit-testable: ${JSON.stringify(state)}`,
  ).toHaveLength(0);
  expect(state.controlsOutsideViewport).toBe(0);
  expect(state.controlsClipped).toBe(0);
  expect(state.panelScrollDimensions?.overflowX).toBe("visible");
  expect(state.panelScrollDimensions?.overflowY).toBe("visible");
  expect(state.headerScrolls).toBe(false);
  expect(state.pageFits).toBe(true);
  expect(state.zooms.every((zoom) => zoom === "1" || zoom === "normal")).toBe(true);
  await expect(panel).toBeVisible();
}

test("Piano Roll instrument cards are global, persistent, selectable and fit short harmony fragments", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture("instrument-card-fixture");
  const steps = fixture.progression.steps.map((step, index) =>
    index === 0
      ? Object.freeze({ ...step, duration: musicalDuration(rational(6)) })
      : index === 1
        ? Object.freeze({ ...step, duration: musicalDuration(rational(1, 4)) })
        : step,
  );
  await importVisualFixture(page, { ...fixture, progression: { ...fixture.progression, steps } });
  await page.evaluate(() => {
    const target = window as Window & {
      __cardAuditions?: unknown[];
      __cadenceflow_audio__?: {
        PreviewAuditionController: { prototype: { audition: (events: unknown[]) => null } };
      };
    };
    target.__cardAuditions = [];
    if (!target.__cadenceflow_audio__) throw new Error("Missing guarded audio hook");
    target.__cadenceflow_audio__.PreviewAuditionController.prototype.audition = (events) => {
      target.__cardAuditions!.push(events);
      return null;
    };
  });
  const pianoButtons = page.getByRole("button", { name: "Show piano", exact: true });
  const guitarButtons = page.getByRole("button", { name: "Show guitar chord", exact: true });
  await expect(pianoButtons.first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".piano-roll-instrument-card")).toHaveCount(0);
  const before = await readFile(await exportProjectFilePath(page), "utf8");
  await pianoButtons.first().click();
  await expect(page.getByTestId("piano-roll-piano-cards").first()).toBeVisible();
  await expect(page.getByTestId("piano-roll-guitar-cards")).toHaveCount(0);
  await expect(pianoButtons).toHaveCount(3);
  for (const button of await pianoButtons.all())
    await expect(button).toHaveAttribute("aria-pressed", "true");
  await guitarButtons.first().click();
  await expect(page.getByTestId("piano-roll-guitar-cards").first()).toBeVisible();
  const cardsA = page.locator('.piano-roll-instrument-card[data-source-step-id="chord-a"]');
  await expect(cardsA).toHaveCount(4); // Piano and Guitar, including the next Measure continuation.
  await cardsA.first().click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __cardAuditions: unknown[] }).__cardAuditions.length,
      ),
    )
    .toBe(1);
  for (const card of await cardsA.all()) await expect(card).toHaveAttribute("aria-pressed", "true");
  const cardB = page.locator('.piano-roll-instrument-card[data-source-step-id="chord-b"]').first();
  await cardB.click({ modifiers: ["Shift"] });
  expect(
    await page.evaluate(
      () => (window as Window & { __cardAuditions: unknown[] }).__cardAuditions.length,
    ),
  ).toBe(1);
  await expect(cardsA.first()).toHaveAttribute("aria-pressed", "true");
  await expect(cardB).toHaveAttribute("aria-pressed", "true");
  // Display toggles and transient selection never enter Project or history.
  expect(await readFile(await exportProjectFilePath(page), "utf8")).toBe(before);
  for (const viewport of [
    { width: 640, height: 360 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["Dark", "Light"] as const) {
      await page.getByRole("button", { name: `${theme} theme` }).click();
      await alignSystemHeader(page);
      await dismissSelectionHelp(page);
      await expect
        .poll(() =>
          cardB
            .locator(".piano-roll-card-content")
            .evaluate((element) => element.getBoundingClientRect().width),
        )
        .toBeGreaterThan(0);
      const geometry = await page.locator(".piano-roll-instrument-card").evaluateAll((cards) =>
        cards.map((card) => {
          const content = card.querySelector(".piano-roll-card-content")!;
          return {
            width: card.clientWidth,
            contentWidth: content.getBoundingClientRect().width,
            scrollWidth: card.scrollWidth,
          };
        }),
      );
      expect(
        geometry.every(
          (card) => card.contentWidth <= card.width + 1 && card.scrollWidth <= card.width + 1,
        ),
      ).toBe(true);
      const shortScale = await cardB
        .locator(".piano-roll-card-content")
        .evaluate((element) => getComputedStyle(element).transform);
      expect(shortScale).not.toBe("none");
      await page.screenshot({
        path: `artifacts/validation/piano-roll-chord-cards/${viewport.width}x${viewport.height}-${theme.toLowerCase()}.png`,
      });
      await revealWithinStudioGrid(cardsA.first());
      await page.screenshot({
        path: `artifacts/validation/piano-roll-chord-cards/${viewport.width}x${viewport.height}-${theme.toLowerCase()}-piano.png`,
      });
      await revealWithinStudioGrid(page.getByTestId("piano-roll-guitar-cards").first());
      await page.screenshot({
        path: `artifacts/validation/piano-roll-chord-cards/${viewport.width}x${viewport.height}-${theme.toLowerCase()}-guitar.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await pianoButtons.first().click();
  await expect(page.getByTestId("piano-roll-piano-cards")).toHaveCount(0);
  await expect(page.getByTestId("piano-roll-guitar-cards").first()).toBeVisible();
  await page.reload();
  await expect(guitarButtons.first()).toHaveAttribute("aria-pressed", "true");
  await expect(pianoButtons.first()).toHaveAttribute("aria-pressed", "false");
  await guitarButtons.first().click();
  await expect(page.locator(".piano-roll-instrument-card")).toHaveCount(0);
});

test("embedded chord cards match Piano and Guitar views for inversion and transposition", async ({
  page,
}) => {
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture("instrument-card-realization");
  const first = fixture.progression.steps[0];
  if (first?.kind !== "chord") throw new Error("Expected a chord");
  const step = {
    ...first,
    transpositionSemitones: 2,
    performance: {
      ...first.performance,
      inversion: 1 as const,
      bass: { ...first.performance.bass, choice: "third" as const },
    },
  };
  await importVisualFixture(page, {
    ...fixture,
    progression: { ...fixture.progression, steps: [step, ...fixture.progression.steps.slice(1)] },
  });
  await page.getByRole("button", { name: "Show piano", exact: true }).first().click();
  await page.getByRole("button", { name: "Show guitar chord", exact: true }).first().click();
  const piano = page.locator(".piano-roll-card-row .mini-piano-card-visual").first();
  const pianoSnapshot = await piano
    .locator('.mini-key[data-active="true"]')
    .evaluateAll((keys) => keys.map((key) => key.getAttribute("data-midi")));
  const guitar = page.locator(".piano-roll-card-row .mini-guitar-card-visual").first();
  const frets = await guitar.getAttribute("data-frets");
  const symbol = await guitar.getAttribute("data-chord-symbol");
  await page.getByTestId("progression-view-btn-piano").click();
  expect(
    await page
      .locator(".progression-step-card")
      .first()
      .locator('.mini-key[data-active="true"]')
      .evaluateAll((keys) => keys.map((key) => key.getAttribute("data-midi"))),
  ).toEqual(pianoSnapshot);
  await page.getByTestId("progression-view-btn-guitar").click();
  const standardGuitar = page.locator(".progression-step-card .mini-guitar-card-visual").first();
  await expect(standardGuitar).toHaveAttribute("data-frets", frets!);
  await expect(standardGuitar).toHaveAttribute("data-chord-symbol", symbol!);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await expect(
    page.getByRole("button", { name: "Show piano", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Piano Roll chord controls stay on the System row and edit through undoable actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await openStudio(page);
  await page.getByTestId("progression-view-btn-piano").click();
  for (const functionId of ["I", "V", "vi", "IV"]) await addChord(page, functionId);
  // Put two contiguous chords in one Measure so ArrowRight has a valid shared-boundary preview.
  const progressionSteps = page.locator("[data-progression-step-select]");
  await expect(progressionSteps).toHaveCount(4);
  await progressionSteps.nth(0).click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
  await progressionSteps.nth(1).click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
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

  // Note colors affect the melody, while harmony keeps its Scale degrees appearance.
  const harmonyAppearance = () =>
    page.getByTestId("piano-roll-chord").evaluateAll((chords) =>
      chords.map((chord) => {
        const style = getComputedStyle(chord);
        const label = chord.querySelector(".progression-chord-label");
        return {
          background: style.background,
          color: style.color,
          outline: style.boxShadow,
          stripe: getComputedStyle(chord, "::before").background,
          labelBackground: label ? getComputedStyle(label).background : null,
          selected: chord.getAttribute("aria-pressed"),
        };
      }),
    );
  await page.getByLabel("Piano Roll note colors").selectOption("hookpad");
  const scaleDegreesHarmony = await harmonyAppearance();
  for (const colorMode of ["project", "standard", "suzuki", "harmonic-role"]) {
    await page.getByLabel("Piano Roll note colors").selectOption(colorMode);
    expect(await harmonyAppearance()).toEqual(scaleDegreesHarmony);
    await expect(firstChord).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByLabel("Piano Roll note colors").selectOption("hookpad");

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
        await alignSystemHeader(page);
        await dismissSelectionHelp(page);
        const geometry = await panel.evaluate((element) => {
          const header = element.closest<HTMLElement>(".score-system-header");
          if (!header) throw new Error("Chord panel is outside the System header");
          const title =
            header.querySelector<HTMLElement>('[data-testid^="score-system-audition-"]') ??
            header.querySelector<HTMLElement>("strong");
          const measureCount = [...header.querySelectorAll<HTMLElement>("span")].find((candidate) =>
            /^\d+ measures?$/.test(candidate.textContent?.trim() ?? ""),
          );
          const headerBox = header.getBoundingClientRect();
          const panelBox = element.getBoundingClientRect();
          const titleBox = title?.getBoundingClientRect();
          const measureBox = measureCount?.getBoundingClientRect();
          const controls = [...element.querySelectorAll<HTMLElement>("button, select, input")];
          const studioScroller = document.querySelector<HTMLElement>(".studio-grid");
          if (!studioScroller) throw new Error("The Studio scroll region is missing");
          const studioRect = studioScroller.getBoundingClientRect();
          const studioTop = studioRect.top + studioScroller.clientTop;
          const studioBottom = studioTop + studioScroller.clientHeight;
          const appHeaderBottom =
            document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0;
          const overlaps = (first: DOMRect | undefined, second: DOMRect | undefined) =>
            Boolean(
              first &&
              second &&
              first.left < second.right - 0.5 &&
              first.right > second.left + 0.5 &&
              first.top < second.bottom - 0.5 &&
              first.bottom > second.top + 0.5,
            );
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
            title: titleBox?.toJSON(),
            measure: measureBox?.toJSON(),
            titleCenter: titleBox ? titleBox.top + titleBox.height / 2 : null,
            measureCenter: measureBox ? measureBox.top + measureBox.height / 2 : null,
            appHeaderBottom,
            studioTop,
            studioBottom,
            titlePanelOverlap: overlaps(titleBox, panelBox),
            measurePanelOverlap: overlaps(measureBox, panelBox),
            controlCount: controls.length,
            gridVisibleHeight: Math.max(
              0,
              Math.min(
                document.querySelector<HTMLElement>(".piano-roll-grid")?.getBoundingClientRect()
                  .bottom ?? 0,
                studioBottom,
              ) -
                Math.max(
                  document.querySelector<HTMLElement>(".piano-roll-grid")?.getBoundingClientRect()
                    .top ?? studioBottom,
                  studioTop,
                  appHeaderBottom,
                ),
            ),
            gridBelowPanel: Boolean(
              document.querySelector<HTMLElement>(".piano-roll-grid") &&
              document.querySelector<HTMLElement>(".piano-roll-grid")!.getBoundingClientRect()
                .top >=
                panelBox.bottom - 1,
            ),
            controlsOutsideViewport: controls.filter((control) => {
              const rect = control.getBoundingClientRect();
              return (
                rect.width <= 0 ||
                rect.height <= 0 ||
                rect.left < 0 ||
                rect.right > window.innerWidth ||
                rect.top < studioTop ||
                rect.bottom > studioBottom
              );
            }).length,
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
        expect(geometry.header.top).toBeGreaterThanOrEqual(geometry.appHeaderBottom - 1);
        expect(geometry.header.bottom).toBeLessThanOrEqual(viewport.height + 1);
        expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.header.top - 1);
        expect(geometry.panel.bottom).toBeLessThanOrEqual(geometry.header.bottom + 1);
        expect(geometry.titleCenter).not.toBeNull();
        expect(geometry.measureCenter).not.toBeNull();
        expect(geometry.titlePanelOverlap).toBe(false);
        expect(geometry.measurePanelOverlap).toBe(false);
        if (viewport.width >= 1280) {
          expect(
            Math.abs(
              geometry.panel.top +
                (geometry.panel.bottom - geometry.panel.top) / 2 -
                geometry.titleCenter!,
            ),
          ).toBeLessThan(1);
          expect(Math.abs(geometry.measureCenter! - geometry.titleCenter!)).toBeLessThan(1);
        } else {
          expect(geometry.panel.top).toBeGreaterThanOrEqual(
            Math.max(geometry.title!.bottom, geometry.measure!.bottom) - 1,
          );
        }
        expect(
          geometry.gridVisibleHeight,
          `A portion of the Piano Roll grid remains visible in the Studio scrollport at ${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`,
        ).toBeGreaterThan(0);
        expect(geometry.gridBelowPanel).toBe(true);
        expect(geometry.panel.right).toBeLessThanOrEqual(geometry.header.right);
        expect(geometry.panel.left).toBeGreaterThanOrEqual(geometry.header.left);
        expect(geometry.panel.scrollWidth).toBeLessThanOrEqual(geometry.panel.clientWidth);
        expect(geometry.panel.scrollHeight).toBeLessThanOrEqual(geometry.panel.clientHeight);
        expect(geometry.header.scrollWidth).toBeLessThanOrEqual(geometry.header.clientWidth);
        expect(geometry.controlCount).toBeGreaterThan(10);
        expect(geometry.controlsOutsideViewport).toBe(0);
        expect(geometry.missedTargets).toBe(0);
        expect(geometry.pageWidthFits).toBe(true);
        await page.screenshot({
          path: `test-results/system-chord-panel-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridMode.toLowerCase()}.png`,
        });
      }
    }
  }
  await page.setViewportSize({ width: 640, height: 900 });
  await alignSystemHeader(page);

  const boundary = page.locator(
    `.piano-roll-chord-boundary-handle[data-boundary-step-id="${sourceStepId}"][data-boundary-edge="right"]`,
  );
  await expect(boundary).toBeVisible();
  await boundary.scrollIntoViewIfNeeded();
  const originalBoundary = Number(await boundary.getAttribute("aria-valuenow"));
  const boundaryMax = Number(await boundary.getAttribute("aria-valuemax"));
  expect(originalBoundary).toBeLessThan(boundaryMax);
  await boundary.focus();
  await expect(boundary).toBeFocused();
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
  await alignSystemHeader(page);
  await revealWithinStudioGrid(boundary, 20);
  await revealWithinStudioGrid(secondMeasureGrid, 20);
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
  const resizeTargets = await page.evaluate(
    ({ start, end, boundaryBounds, secondGridBounds }) => {
      const hit = (point: typeof start) => document.elementFromPoint(point.x, point.y);
      const source = hit(start);
      const destination = hit(end);
      const scroller = document.querySelector<HTMLElement>(".studio-grid");
      return {
        start,
        end,
        sourceHit: source ? `${source.tagName}.${(source as HTMLElement).className}` : null,
        destinationHit: destination
          ? `${destination.tagName}.${(destination as HTMLElement).className}`
          : null,
        boundaryBounds,
        secondGridBounds,
        studioScrollport: scroller?.getBoundingClientRect().toJSON() ?? null,
        studioScrollTop: scroller?.scrollTop ?? null,
      };
    },
    {
      start: pointerStart,
      end: pointerEnd,
      boundaryBounds: boundaryBox,
      secondGridBounds: secondGridBox,
    },
  );
  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await page.mouse.move(pointerEnd.x, pointerEnd.y, { steps: 6 });
  await expect(
    page.getByTestId("duration-resize-status"),
    `The boundary drag must stay active across Measures: ${JSON.stringify(resizeTargets)}`,
  ).toContainText("Preview boundary");
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
  expect(decodedSource?.duration.beats).toEqual({ numerator: 1, denominator: 1 });
  expect(decodedSplit?.duration.beats).toEqual({ numerator: 1, denominator: 1 });
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
        if (viewport.height === 360) {
          expect(await chord.getAttribute("data-source-step-id")).toBe(firstStep.id);
          await chord.scrollIntoViewIfNeeded();
          await revealWithinStudioGrid(chord, 20);
          const scrolledChord = await chord.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const scroller = element.closest<HTMLElement>(".studio-grid");
            if (!scroller) throw new Error("The chord is outside the Studio scroll region");
            const scrollport = scroller.getBoundingClientRect();
            const studioTop = scrollport.top + scroller.clientTop;
            const studioBottom = studioTop + scroller.clientHeight;
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            return {
              bounds: rect.toJSON(),
              sourceStepId: element.getAttribute("data-source-step-id"),
              studioTop,
              studioBottom,
              hitChord: Boolean(hit && (hit === element || element.contains(hit))),
            };
          });
          expect(scrolledChord.sourceStepId).toBe(firstStep.id);
          expect(scrolledChord.bounds.top).toBeGreaterThanOrEqual(scrolledChord.studioTop);
          expect(scrolledChord.bounds.bottom).toBeLessThanOrEqual(scrolledChord.studioBottom);
          expect(scrolledChord.hitChord).toBe(true);
          await page.screenshot({
            path: `test-results/music-visible-chord-grid-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridName.toLowerCase()}.png`,
          });
          await alignSystemHeader(page);
          await expectVisibleMusicAndPanel(page, chordPanel, false);
        }
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
          await revealWithinStudioGrid(note, 20);
          const scrolledNote = await note.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const scroller = element.closest<HTMLElement>(".studio-grid");
            if (!scroller) throw new Error("The note is outside the Studio scroll region");
            const scrollport = scroller.getBoundingClientRect();
            const studioTop = scrollport.top + scroller.clientTop;
            const studioBottom = studioTop + scroller.clientHeight;
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            return {
              bounds: rect.toJSON(),
              sourceStepId: element.getAttribute("data-source-step-id"),
              studioTop,
              studioBottom,
              hitNote: Boolean(hit && (hit === element || element.contains(hit))),
              grid: element.closest(".piano-roll-grid")?.getBoundingClientRect().toJSON(),
              pageFits:
                document.documentElement.scrollWidth <= document.documentElement.clientWidth,
              zoom: getComputedStyle(document.documentElement).zoom,
            };
          });
          expect(scrolledNote.sourceStepId).toBe(firstStep.id);
          expect(scrolledNote.bounds.top).toBeGreaterThanOrEqual(scrolledNote.studioTop);
          expect(scrolledNote.bounds.bottom).toBeLessThanOrEqual(scrolledNote.studioBottom);
          expect(scrolledNote.hitNote).toBe(true);
          expect(scrolledNote.grid?.bottom).toBeGreaterThan(scrolledNote.bounds.top);
          expect(scrolledNote.pageFits).toBe(true);
          expect(["1", "normal"]).toContain(scrolledNote.zoom);
          await page.screenshot({
            path: `test-results/music-visible-note-grid-640x360-${themeName.toLowerCase()}-${gridName.toLowerCase()}.png`,
          });
          await alignSystemHeader(page);
          await expectVisibleMusicAndPanel(page, notePanel, false);
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
