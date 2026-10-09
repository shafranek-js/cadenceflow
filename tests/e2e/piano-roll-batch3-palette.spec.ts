import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  setLayoutMeasuresPerSystem,
  setProgressionView,
} from "./test-helpers/progression-settings";

const evidenceRoot =
  process.env.CADENCEFLOW_BATCH3_PALETTE_EVIDENCE_ROOT ??
  "C:/Users/pavel/.codex/visualizations/2026/10/01/01a0f62c-15f6-73f1-b722-51eacb4f31d5/batch3-palette";

const settleLayout = async (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

async function scrollTargetBelowStickyHeader(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
) {
  await target.evaluate((element) => {
    const header = document.querySelector<HTMLElement>(".app-header");
    if (!header) throw new Error("The sticky app header is missing");
    const headerBottom = header.getBoundingClientRect().bottom;
    window.scrollBy({
      top: element.getBoundingClientRect().top - headerBottom - 8,
      behavior: "instant",
    });
  });
  await settleLayout(page);
}

async function exposeToolbar(
  page: import("@playwright/test").Page,
  toolbar: import("@playwright/test").Locator,
  edge: "start" | "end",
) {
  await toolbar.evaluate((element, scrollEdge) => {
    element.scrollLeft = scrollEdge === "end" ? element.scrollWidth : 0;
  }, edge);
  await scrollTargetBelowStickyHeader(page, toolbar);
  return toolbar.evaluate((element) => {
    const header = document.querySelector<HTMLElement>(".app-header")!;
    const headerBottom = header.getBoundingClientRect().bottom;
    const toolbarRect = element.getBoundingClientRect();
    const visibleControls = [
      ...element.querySelectorAll<HTMLElement>("select, input[type=range], button"),
    ].filter((control) => {
      const rect = control.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        x >= toolbarRect.left &&
        x <= toolbarRect.right &&
        y > headerBottom &&
        y < innerHeight
      );
    });
    return {
      toolbarTop: toolbarRect.top,
      headerBottom,
      visibleControlCount: visibleControls.length,
      everyCenterHitsControl: visibleControls.every((control) => {
        const rect = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return hit === control || control.contains(hit);
      }),
    };
  });
}

async function undoIsEnabled(page: import("@playwright/test").Page) {
  await page.getByTestId("edit-menu-toggle").click();
  const enabled = await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: /Undo/ })
    .isEnabled();
  await page.keyboard.press("Escape");
  return enabled;
}

test("Piano Roll uses the key-relative Hookpad palette and captures its light/dark layouts", async ({
  page,
}) => {
  test.setTimeout(180_000);
  mkdirSync(evidenceRoot, { recursive: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  for (const chord of ["I", "V", "vi", "IV"]) {
    await page
      .getByTestId(`chord-card-${chord}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }

  await setProgressionView(page, "staff");
  const firstStep = page.locator("[data-progression-step-select]").first();
  const firstStepId = await firstStep.getAttribute("data-step-id");
  if (!firstStepId) throw new Error("First chord Step has no stable ID");
  await firstStep.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  await page
    .getByRole("dialog", { name: "Create Melody" })
    .getByRole("button", { name: "Apply Melody" })
    .click();
  await firstStep.click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
  const secondStep = page.locator("[data-progression-step-select]").nth(1);
  const secondStepId = await secondStep.getAttribute("data-step-id");
  if (!secondStepId) throw new Error("Second chord Step has no stable ID");
  await secondStep.click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
  await setLayoutMeasuresPerSystem(page, 4);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await page.keyboard.press("Escape");

  const toolbar = page.getByTestId("piano-roll-toolbar");
  const themeGroup = page.getByRole("group", { name: "Theme" });
  const generatedFirst = page.locator(
    `button.piano-roll-note[data-source-step-id="${firstStepId}"][data-generated="true"]`,
  );
  await expect(
    page.locator(".piano-roll-measure-header button").filter({ hasText: "Regenerate" }),
  ).toHaveCount(0);
  const generatedBaseline = await generatedFirst.count();
  const colorMode = page.getByLabel("Piano Roll note colors");
  await expect(colorMode).toHaveValue("hookpad");
  await expect(page.locator(".piano-roll-grid.is-hookpad-palette").first()).toBeVisible();
  await expect(page.getByTestId("piano-roll-note").first()).toHaveAttribute(
    "data-palette-degrees",
    /^(\d|\d-\d)$/,
  );
  await expect(page.getByTestId("piano-roll-chord").first()).toHaveAttribute(
    "data-palette-degrees",
    "1",
  );
  await expect(page.getByTestId("piano-roll-chord").nth(1)).toHaveAttribute(
    "data-palette-degrees",
    "5",
  );
  const editSelectedNote = page.getByTestId("piano-roll-edit-selected-note");
  await expect
    .poll(async () => {
      const count = await editSelectedNote.count();
      return count === 0 || (await editSelectedNote.isDisabled());
    })
    .toBe(true);
  await expect(
    page.locator(".piano-roll-measure-header [aria-label='Edit selected note details']"),
  ).toHaveCount(0);
  await generatedFirst.first().click({ force: true });
  await expect(editSelectedNote).toBeEnabled();
  await editSelectedNote.click();
  const sidebarInspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  await expect(sidebarInspector).toBeVisible();
  await expect(page.getByLabel("Inspector pitch MIDI")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sidebarInspector).toHaveCount(0);
  await expect(generatedFirst.first()).toBeFocused();
  await page.locator(`.piano-roll-chord[data-source-step-id="${firstStepId}"]`).first().click();
  await expect(editSelectedNote).toHaveCount(0);
  const chordPlayhead = page.locator(".piano-roll-playhead[data-audition-end-beat='2']");
  await expect(chordPlayhead).toBeVisible();
  const tonicChordBands = await page
    .getByTestId("piano-roll-chord")
    .nth(0)
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const top = getComputedStyle(element, "::before");
      const bottom = getComputedStyle(element, "::after");
      return {
        degreeColor: style.getPropertyValue("--piano-roll-degree-color").trim(),
        topColor: top.backgroundColor,
        bottomColor: bottom.backgroundColor,
        topHeight: top.height,
        bottomHeight: bottom.height,
      };
    });
  expect(tonicChordBands).toEqual({
    degreeColor: "#f60100",
    topColor: "rgb(246, 1, 0)",
    bottomColor: "rgb(246, 1, 0)",
    topHeight: "6px",
    bottomHeight: "6px",
  });
  const dominantChordBands = await page
    .getByTestId("piano-roll-chord")
    .nth(1)
    .evaluate((element) => ({
      degreeColor: getComputedStyle(element).getPropertyValue("--piano-roll-degree-color").trim(),
      topColor: getComputedStyle(element, "::before").backgroundColor,
      bottomColor: getComputedStyle(element, "::after").backgroundColor,
    }));
  expect(dominantChordBands).toEqual({
    degreeColor: "#3f00ff",
    topColor: "rgb(63, 0, 255)",
    bottomColor: "rgb(63, 0, 255)",
  });
  await page.locator(`.piano-roll-chord[data-source-step-id="${firstStepId}"]`).first().click();
  await toolbar.getByRole("button", { name: "Chromatic" }).click();
  const firstGrid = page.locator(".piano-roll-grid").first();
  const chromaticRow = firstGrid.locator('.piano-roll-row[data-palette-degrees="1-2"]').first();
  const targetMidi = await chromaticRow.getAttribute("data-pitch-midi");
  if (!targetMidi) throw new Error("The selected chromatic palette row has no MIDI pitch");
  const beforeEventKeys = await page
    .getByTestId("piano-roll-note")
    .evaluateAll((notes) => notes.map((note) => note.getAttribute("data-piano-roll-event-key")));
  const locateEmptyCell = () =>
    firstGrid.evaluate((grid, paletteDegrees) => {
      const gridBounds = grid.getBoundingClientRect();
      const row = grid.querySelector<HTMLElement>(
        `.piano-roll-row[data-palette-degrees="${paletteDegrees}"]`,
      );
      if (!row) return null;
      const rowBounds = row.getBoundingClientRect();
      const y = rowBounds.top + rowBounds.height / 2;
      for (let x = gridBounds.left + 40; x < gridBounds.right - 4; x += 18) {
        const target = document.elementFromPoint(x, y);
        if (
          target?.closest(".piano-roll-grid") === grid &&
          !target.closest("button.piano-roll-note")
        )
          return {
            x,
            y,
            pitchMidi: row.dataset.pitchMidi ?? null,
            rowTop: rowBounds.top,
            rowHeight: rowBounds.height,
            gridTop: gridBounds.top,
            gridHeight: gridBounds.height,
            minPitch: grid.dataset.minPitch,
            maxPitch: grid.dataset.maxPitch,
            targetClass: target.className?.toString() ?? target.tagName,
          };
      }
      return null;
    }, "1-2");
  const initialPoint = await locateEmptyCell();
  if (!initialPoint) throw new Error("No empty Piano Roll cell was found on the 1–2 chromatic row");
  // Selecting the measure updates its scope controls, so measure the stable layout before adding.
  await page.mouse.click(initialPoint.x, initialPoint.y);
  await settleLayout(page);
  const createPoint = await locateEmptyCell();
  if (!createPoint) throw new Error("No empty Piano Roll cell was found on the 1–2 chromatic row");
  expect(createPoint.pitchMidi).toBe(targetMidi);
  await page.mouse.dblclick(createPoint.x, createPoint.y);
  const newEventKeys = () =>
    page.getByTestId("piano-roll-note").evaluateAll(
      (notes, existingKeys) =>
        notes
          .map((note) => note.getAttribute("data-piano-roll-event-key"))
          .filter((key): key is string => key !== null && !existingKeys.includes(key)),
      beforeEventKeys.filter((key): key is string => key !== null),
    );
  await expect.poll(newEventKeys).toHaveLength(1);
  const createdEventKey = (await newEventKeys())[0];
  if (!createdEventKey) throw new Error("The chromatic empty-cell action created no note identity");
  const createdNote = page.locator(
    `.piano-roll-note[data-piano-roll-event-key="${createdEventKey}"]`,
  );
  await expect(createdNote, JSON.stringify(createPoint)).toHaveAttribute(
    "data-pitch-midi",
    targetMidi,
  );
  await expect(createdNote).toHaveAttribute("data-palette-degrees", "1-2");
  await expect(generatedFirst).toHaveCount(0);
  await createdNote.focus();
  await page.keyboard.press("Control+z");
  await expect(generatedFirst).toHaveCount(generatedBaseline);
  await page.keyboard.press("Control+Shift+z");
  await expect(createdNote).toHaveCount(1);

  const draggable = page.locator(".piano-roll-note[data-generated='false']").last();
  const beforeDrag = await draggable.getAttribute("data-start-beats");
  const dragBox = await draggable.boundingBox();
  if (!dragBox) throw new Error("Directly materialized note has no bounds");
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 + 72, dragBox.y + dragBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(draggable).not.toHaveAttribute("data-start-beats", beforeDrag ?? "");
  const afterDrag = await draggable.getAttribute("data-start-beats");
  await page.keyboard.press("Control+z");
  await expect(draggable).toHaveAttribute("data-start-beats", beforeDrag!);
  await page.keyboard.press("Control+Shift+z");
  await expect(draggable).toHaveAttribute("data-start-beats", afterDrag!);

  const track = page.locator(".progression-track");
  await track.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.left + 40,
        clientY: Math.max(100, rect.top + 40),
      }),
    );
  });
  await page
    .getByRole("menu", { name: /My Progression/ })
    .getByRole("menuitem", { name: "Add Rest at End" })
    .click();
  const lastHarmonyBlock = page.getByTestId("piano-roll-chord").last();
  await expect(lastHarmonyBlock).toBeVisible();
  await expect(lastHarmonyBlock).toHaveClass(/is-rest/);
  await expect(lastHarmonyBlock).not.toHaveClass(/is-hookpad-palette/);
  const restStepId = await lastHarmonyBlock.getAttribute("data-source-step-id");
  if (!restStepId) throw new Error("Rest Step has no stable ID");
  const undoBeforeGuides = await undoIsEnabled(page);
  const guides = toolbar.getByRole("button", { name: "Guides" });
  await expect(guides).toHaveAttribute("aria-pressed", "false");
  await expect(guides).toHaveAttribute("title", /Highlight chord tones/);
  await guides.focus();
  await page.keyboard.press("Space");
  await expect(guides).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".piano-roll-grid.is-guides-on").first()).toBeVisible();
  const firstChordTone = page.locator(
    `[data-testid="piano-roll-guide-tone"][data-source-step-id="${firstStepId}"][data-pitch-class="0"]`,
  );
  await expect(firstChordTone.first()).toHaveAttribute("data-start-beats", "0/1");
  await expect(firstChordTone.first()).toHaveAttribute("data-duration-beats", "2/1");
  const secondChordTone = page.locator(
    `[data-testid="piano-roll-guide-tone"][data-source-step-id="${secondStepId}"][data-pitch-class="7"]`,
  );
  await expect(secondChordTone.first()).toHaveAttribute("data-start-beats", "2/1");
  await expect(secondChordTone.first()).toHaveAttribute("data-duration-beats", "2/1");
  await expect(
    page.locator(`[data-testid="piano-roll-guide-tone"][data-source-step-id="${restStepId}"]`),
  ).toHaveCount(0);
  await expect(
    page.locator(`[data-testid="piano-roll-guide-neutral"][data-source-step-id="${restStepId}"]`),
  ).not.toHaveCount(0);
  await guides.click();
  await expect(guides).toHaveAttribute("aria-pressed", "false");
  expect(await undoIsEnabled(page)).toBe(undoBeforeGuides);

  await colorMode.selectOption("suzuki");
  await expect(page.locator(".piano-roll-grid.is-hookpad-palette")).toHaveCount(0);
  for (const mode of ["suzuki", "harmonic-role"] as const) {
    await colorMode.selectOption(mode);
    await toolbar.getByRole("button", { name: "Chromatic" }).click();
    for (const theme of ["Light", "Dark"] as const) {
      await themeGroup.getByRole("button", { name: `${theme} theme` }).click();
      const keyboard = await page
        .locator(".piano-roll-system-pitch-scale.is-chromatic")
        .first()
        .evaluate((element) => {
          const natural = element.querySelector<HTMLElement>(
            ".piano-roll-system-pitch-row.is-white-key",
          )!;
          const black = element.querySelector<HTMLElement>(
            ".piano-roll-system-pitch-row.is-black-key",
          )!;
          return {
            naturalWidth: getComputedStyle(natural, "::before").width,
            naturalLabel: getComputedStyle(natural.querySelector("span")!).color,
            blackWidth: getComputedStyle(black, "::before").width,
            blackBackground: getComputedStyle(black, "::before").backgroundColor,
            blackLabel: getComputedStyle(black.querySelector("span")!).color,
          };
        });
      expect(keyboard).toEqual({
        naturalWidth: "34px",
        naturalLabel: "rgb(37, 42, 50)",
        blackWidth: "22px",
        blackBackground: "rgb(52, 58, 70)",
        blackLabel: "rgb(255, 255, 255)",
      });
    }
  }
  await colorMode.selectOption("hookpad");

  await expect(themeGroup).toBeVisible();
  let referenceSurface: { background: string; ink: string } | undefined;
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["Light", "Dark"] as const) {
      await themeGroup.getByRole("button", { name: `${theme} theme` }).click();
      await settleLayout(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
      const toolbarBounds = await toolbar.boundingBox();
      const systemsBounds = await page.getByTestId("progression-score-systems").boundingBox();
      if (!toolbarBounds || !systemsBounds)
        throw new Error("Piano Roll workspace has no layout bounds");
      expect(toolbarBounds.y + toolbarBounds.height).toBeLessThanOrEqual(systemsBounds.y + 1);
      const toolbarGeometry = await toolbar.evaluate((element) => {
        const toolbarRect = element.getBoundingClientRect();
        const parentRect = element.parentElement!.getBoundingClientRect();
        const trackRect = element.closest(".progression-track")!.getBoundingClientRect();
        const controls = [...element.querySelectorAll("select, input[type=range], button")];
        const centers = controls.map((control) => {
          const rect = control.getBoundingClientRect();
          return Math.round(rect.top + rect.height / 2);
        });
        const visibleGuides = [...element.querySelectorAll("button")].at(-1)!;
        const visibleGuidesRect = visibleGuides.getBoundingClientRect();
        const page = document.documentElement;
        return {
          oneRow: Math.max(...centers) - Math.min(...centers) <= 8,
          internalScroll: element.scrollWidth > element.clientWidth + 1,
          pageOverflow: page.scrollWidth > page.clientWidth + 1,
          height: toolbarRect.height,
          width: toolbarRect.width,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          parentWidth: parentRect.width,
          trackWidth: trackRect.width,
          viewportWidth: innerWidth,
          controlsInside: controls.every((control) => {
            const rect = control.getBoundingClientRect();
            return rect.left >= toolbarRect.left - 1 && rect.right <= toolbarRect.right + 1;
          }),
          labelsClipped: [...element.querySelectorAll("label")].some(
            (label) => label.scrollWidth > label.clientWidth + 1,
          ),
          guidesVisible: visibleGuidesRect.left >= 0 && visibleGuidesRect.right <= innerWidth,
          children: [...element.children].map((child) => ({
            text: child.textContent?.trim().replace(/\s+/g, " "),
            width: Math.round(child.getBoundingClientRect().width),
          })),
        };
      });
      expect(toolbarGeometry.pageOverflow).toBe(false);
      expect(
        toolbarGeometry.width / toolbarGeometry.parentWidth,
        JSON.stringify({ viewport, toolbarGeometry }),
      ).toBeGreaterThan(0.9);
      expect(
        toolbarGeometry.width / toolbarGeometry.trackWidth,
        JSON.stringify({ viewport, toolbarGeometry }),
      ).toBeGreaterThan(0.9);
      if (viewport.width === 640) {
        expect(toolbarGeometry.oneRow).toBe(false);
        expect(toolbarGeometry.height).toBeLessThan(80);
        expect(toolbarGeometry.internalScroll, JSON.stringify({ viewport, toolbarGeometry })).toBe(
          false,
        );
        expect(toolbarGeometry.controlsInside).toBe(true);
        expect(toolbarGeometry.labelsClipped).toBe(false);
        expect(toolbarGeometry.guidesVisible).toBe(true);
      } else {
        expect(toolbarGeometry.oneRow, JSON.stringify({ viewport, toolbarGeometry })).toBe(true);
        expect(toolbarGeometry.height).toBeLessThan(64);
        expect(toolbarGeometry.internalScroll, JSON.stringify({ viewport, toolbarGeometry })).toBe(
          viewport.width === 1280,
        );
        expect(toolbarGeometry.controlsInside).toBe(true);
        expect(toolbarGeometry.labelsClipped).toBe(false);
        expect(toolbarGeometry.guidesVisible).toBe(true);
      }
      const surface = await page
        .locator(".piano-roll-measure")
        .first()
        .evaluate((element) => ({
          background: getComputedStyle(element).backgroundColor,
          ink: getComputedStyle(element).color,
        }));
      if (!referenceSurface) referenceSurface = surface;
      else expect(surface).toEqual(referenceSurface);
      const readableLabel = page.locator("button.piano-roll-note > span:visible").first();
      if (await readableLabel.count()) {
        await expect(readableLabel).toHaveCSS("color", "rgb(17, 24, 39)");
        await expect(readableLabel).toHaveCSS("font-weight", "700");
        await expect(readableLabel).toHaveCSS("font-size", "11px");
      }
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await toolbar.getByRole("button", { name: gridMode }).click();
        await settleLayout(page);
        const grid = page.locator(".piano-roll-grid").first();
        await expect(grid).toBeVisible();
        const rowAndLabelGeometry = await grid.evaluate((element) => {
          const scale = element
            .closest<HTMLElement>(".score-system-pitch-layout")!
            .querySelector<HTMLElement>(".piano-roll-system-pitch-scale")!;
          const rows = [...scale.querySelectorAll<HTMLElement>(".piano-roll-system-pitch-row")];
          const notes = [...element.querySelectorAll<HTMLButtonElement>("button.piano-roll-note")]
            .filter((note) => note.getBoundingClientRect().width > 40)
            .map((note) => {
              const noteRect = note.getBoundingClientRect();
              const label = note.querySelector<HTMLElement>("span");
              const labelRect = label?.getBoundingClientRect();
              return {
                text: label?.textContent,
                visible: Boolean(label?.getClientRects().length),
                display: label ? getComputedStyle(label).display : null,
                fit: Boolean(
                  label &&
                  label.getClientRects().length &&
                  labelRect &&
                  labelRect.height <= noteRect.height &&
                  labelRect.top >= noteRect.top - 0.5 &&
                  labelRect.bottom <= noteRect.bottom + 0.5,
                ),
                noteRect: {
                  top: noteRect.top,
                  bottom: noteRect.bottom,
                  height: noteRect.height,
                  width: noteRect.width,
                },
                labelRect: labelRect
                  ? { top: labelRect.top, bottom: labelRect.bottom, height: labelRect.height }
                  : null,
              };
            });
          return {
            rowHeight: rows[0]?.getBoundingClientRect().height ?? 0,
            rowHeights: [...new Set(rows.map((row) => row.getBoundingClientRect().height))],
            labelsFit: notes.every((note) => note.fit),
            checkedLabelCount: notes.length,
            failedLabels: notes.filter((note) => !note.fit),
            zoom: getComputedStyle(element).zoom,
          };
        });
        expect(rowAndLabelGeometry.rowHeight).toBeGreaterThanOrEqual(17.5);
        expect(rowAndLabelGeometry.rowHeights).toEqual([rowAndLabelGeometry.rowHeight]);
        expect(
          rowAndLabelGeometry.labelsFit,
          JSON.stringify({ viewport, gridMode, rowAndLabelGeometry }),
        ).toBe(true);
        expect(rowAndLabelGeometry.zoom).toBe("1");
        if (gridMode === "Chromatic") {
          const keyboard = await grid.evaluate((element) => {
            const scale = element
              .closest<HTMLElement>(".score-system-pitch-layout")!
              .querySelector<HTMLElement>(".piano-roll-system-pitch-scale")!;
            const natural = scale.querySelector<HTMLElement>(
              ".piano-roll-system-pitch-row.is-white-key",
            )!;
            const black = scale.querySelector<HTMLElement>(
              ".piano-roll-system-pitch-row.is-black-key",
            )!;
            const naturalKey = getComputedStyle(natural, "::before");
            const blackKey = getComputedStyle(black, "::before");
            const probe = document.createElement("canvas");
            const context = probe.getContext("2d")!;
            context.fillStyle = naturalKey.backgroundColor;
            context.fillRect(0, 0, 1, 1);
            const naturalRgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
            return {
              naturalWidth: naturalKey.width,
              naturalRgb,
              naturalLabel: getComputedStyle(natural.querySelector("span")!).color,
              blackWidth: blackKey.width,
              blackBackground: blackKey.backgroundColor,
              blackLabel: getComputedStyle(black.querySelector("span")!).color,
            };
          });
          expect(keyboard.naturalWidth).toBe("34px");
          expect(keyboard.naturalLabel).toBe("rgb(37, 42, 50)");
          expect(keyboard.blackWidth).toBe("22px");
          expect(keyboard.blackBackground).toBe("rgb(52, 58, 70)");
          expect(keyboard.blackLabel).toBe("rgb(255, 255, 255)");
          expect(Math.min(...keyboard.naturalRgb)).toBeGreaterThan(190);
        }
        const toolbarExposure = await exposeToolbar(page, toolbar, "start");
        expect(toolbarExposure.toolbarTop).toBeGreaterThanOrEqual(toolbarExposure.headerBottom + 1);
        expect(toolbarExposure.visibleControlCount).toBeGreaterThan(0);
        expect(toolbarExposure.everyCenterHitsControl).toBe(true);
        if (viewport.width === 640) {
          await page.screenshot({
            path: `${evidenceRoot}/piano-roll-640x360-${theme.toLowerCase()}-${gridMode.toLowerCase()}-toolbar-start.png`,
          });
          await grid.evaluate((element) =>
            element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
          );
          await settleLayout(page);
          await expect(grid).toBeInViewport();
        }
        const captureGeometry = await page.evaluate(() => {
          const headerRect = document.querySelector(".app-header")!.getBoundingClientRect();
          const toolbarRect = document
            .querySelector("[data-testid='piano-roll-toolbar']")!
            .getBoundingClientRect();
          const gridRect = document.querySelector(".piano-roll-grid")!.getBoundingClientRect();
          const noteVisible = [
            ...document.querySelectorAll<HTMLElement>("button.piano-roll-note"),
          ].some((note) => {
            const rect = note.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
          });
          return {
            toolbarTop: toolbarRect.top,
            headerBottom: headerRect.bottom,
            gridTop: gridRect.top,
            gridBottom: gridRect.bottom,
            viewportHeight: innerHeight,
            noteVisible,
          };
        });
        if (viewport.width === 640) {
          expect(captureGeometry.gridTop).toBeGreaterThanOrEqual(captureGeometry.headerBottom + 1);
        } else {
          expect(captureGeometry.toolbarTop).toBeGreaterThanOrEqual(
            captureGeometry.headerBottom + 1,
          );
          expect(captureGeometry.gridTop).toBeGreaterThan(captureGeometry.toolbarTop);
        }
        expect(captureGeometry.gridTop).toBeLessThan(captureGeometry.viewportHeight);
        expect(captureGeometry.gridBottom).toBeGreaterThan(captureGeometry.gridTop);
        expect(captureGeometry.noteVisible).toBe(true);
        await page.screenshot({
          path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-${gridMode.toLowerCase()}.png`,
        });
        await page.screenshot({
          path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-${gridMode.toLowerCase()}-full.png`,
          fullPage: true,
        });
        if (viewport.width === 640) {
          await toolbar.evaluate((element) =>
            element.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" }),
          );
          const endExposure = await exposeToolbar(page, toolbar, "end");
          expect(endExposure.toolbarTop).toBeGreaterThanOrEqual(endExposure.headerBottom + 1);
          expect(endExposure.visibleControlCount).toBeGreaterThan(0);
          expect(endExposure.everyCenterHitsControl).toBe(true);
          await page.screenshot({
            path: `${evidenceRoot}/piano-roll-640x360-${theme.toLowerCase()}-${gridMode.toLowerCase()}-toolbar-end.png`,
          });
          await toolbar.evaluate((element) => (element.scrollLeft = 0));
        }
      }
    }
  }

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["Light", "Dark"] as const) {
      await themeGroup.getByRole("button", { name: `${theme} theme` }).click();
      await settleLayout(page);
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await toolbar.getByRole("button", { name: gridMode }).click();
        for (const enabled of [false, true]) {
          const currentGuides =
            (await toolbar.getByRole("button", { name: "Guides" }).getAttribute("aria-pressed")) ===
            "true";
          if (currentGuides !== enabled)
            await toolbar.getByRole("button", { name: "Guides" }).click();
          const startExposure = await exposeToolbar(page, toolbar, "start");
          expect(startExposure.toolbarTop).toBeGreaterThanOrEqual(startExposure.headerBottom + 1);
          expect(startExposure.visibleControlCount).toBeGreaterThan(0);
          expect(startExposure.everyCenterHitsControl).toBe(true);
          await page.screenshot({
            path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-${gridMode.toLowerCase()}-guides-${enabled ? "on" : "off"}-controls-start.png`,
          });
          if (viewport.width === 640) {
            const endExposure = await exposeToolbar(page, toolbar, "end");
            expect(endExposure.toolbarTop).toBeGreaterThanOrEqual(endExposure.headerBottom + 1);
            expect(endExposure.visibleControlCount).toBeGreaterThan(0);
            expect(endExposure.everyCenterHitsControl).toBe(true);
            await page.screenshot({
              path: `${evidenceRoot}/piano-roll-640x360-${theme.toLowerCase()}-${gridMode.toLowerCase()}-guides-${enabled ? "on" : "off"}-toolbar-end.png`,
            });
            await toolbar.evaluate((element) => {
              element.scrollLeft = 0;
            });
            const firstGrid = page.locator(".piano-roll-grid").first();
            await firstGrid.evaluate((element) =>
              element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
            );
            await settleLayout(page);
            await expect(firstGrid).toBeInViewport();
            await page.screenshot({
              path: `${evidenceRoot}/piano-roll-640x360-${theme.toLowerCase()}-${gridMode.toLowerCase()}-guides-${enabled ? "on" : "off"}-music-grid.png`,
            });
            const firstChord = page.locator(".piano-roll-chord").first();
            await firstChord.evaluate((element) =>
              element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
            );
            await settleLayout(page);
            await expect(firstChord).toBeInViewport();
            await page.screenshot({
              path: `${evidenceRoot}/piano-roll-640x360-${theme.toLowerCase()}-${gridMode.toLowerCase()}-guides-${enabled ? "on" : "off"}-chord-strip.png`,
            });
          }
        }
      }
    }
  }
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["Light", "Dark"] as const) {
      await themeGroup.getByRole("button", { name: `${theme} theme` }).click();
      await toolbar.getByRole("button", { name: "Degrees" }).click();
      const undoBeforeInspector = await undoIsEnabled(page);
      const inspectableNote = page.locator("button.piano-roll-note").first();
      await inspectableNote.evaluate((element) =>
        element.scrollIntoView({ block: "center", behavior: "instant" }),
      );
      await inspectableNote.focus();
      await page.keyboard.press("e");
      const noteInspector = page.getByRole("region", { name: "Piano Roll Inspector" });
      await expect(noteInspector).toBeVisible();
      const pitchInput = page.getByLabel("Inspector pitch MIDI");
      await expect(pitchInput).toBeFocused();
      const toolbarBox = await toolbar.boundingBox();
      const closeButton = noteInspector.getByRole("button", { name: "Close note details" });
      const closeBox = await closeButton.boundingBox();
      if (!toolbarBox || !closeBox) throw new Error("Inspector or toolbar has no visible bounds");
      expect(closeBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height);
      const inspectorVisual = await noteInspector.evaluate((inspector) => {
        const headerRect = document.querySelector(".app-header")!.getBoundingClientRect();
        const inspectorRect = inspector.getBoundingClientRect();
        const pitch = inspector.querySelector<HTMLInputElement>(
          "[aria-label='Inspector pitch MIDI']",
        )!;
        const close = inspector.querySelector<HTMLButtonElement>(
          "[aria-label='Close note details']",
        )!;
        const pitchRect = pitch.getBoundingClientRect();
        const closeRect = close.getBoundingClientRect();
        const centerHits = (element: HTMLElement, rect: DOMRect) => {
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return hit === element || element.contains(hit);
        };
        return {
          headerBottom: headerRect.bottom,
          top: inspectorRect.top,
          bottom: inspectorRect.bottom,
          viewportHeight: innerHeight,
          pitchTop: pitchRect.top,
          pitchBottom: pitchRect.bottom,
          closeTop: closeRect.top,
          closeBottom: closeRect.bottom,
          pitchHit: centerHits(pitch, pitchRect),
          closeHit: centerHits(close, closeRect),
          colorScheme: getComputedStyle(inspector).colorScheme,
          pitchBackground: getComputedStyle(pitch).backgroundColor,
          pitchInk: getComputedStyle(pitch).color,
          pitchColorScheme: getComputedStyle(pitch).colorScheme,
          closeBackground: getComputedStyle(close).backgroundColor,
          closeInk: getComputedStyle(close).color,
          overflowY: getComputedStyle(inspector).overflowY,
          contentOverflows: inspector.scrollHeight > inspector.clientHeight + 1,
        };
      });
      expect(inspectorVisual.top).toBeGreaterThanOrEqual(inspectorVisual.headerBottom + 1);
      expect(inspectorVisual.bottom).toBeLessThanOrEqual(inspectorVisual.viewportHeight);
      expect(inspectorVisual.pitchTop).toBeGreaterThanOrEqual(inspectorVisual.headerBottom);
      expect(inspectorVisual.pitchBottom).toBeLessThanOrEqual(inspectorVisual.viewportHeight);
      expect(inspectorVisual.closeTop).toBeGreaterThanOrEqual(inspectorVisual.headerBottom);
      expect(inspectorVisual.closeBottom).toBeLessThanOrEqual(inspectorVisual.viewportHeight);
      expect(inspectorVisual.pitchHit).toBe(true);
      expect(inspectorVisual.closeHit).toBe(true);
      expect(inspectorVisual.colorScheme).toBe("light");
      expect(inspectorVisual.pitchColorScheme).toBe("light");
      expect(inspectorVisual.pitchBackground).toBe("rgb(255, 255, 255)");
      expect(inspectorVisual.pitchInk).toBe("rgb(23, 32, 42)");
      expect(inspectorVisual.closeBackground).toBe("rgb(255, 255, 255)");
      expect(inspectorVisual.closeInk).toBe("rgb(23, 32, 42)");
      expect(inspectorVisual.overflowY).toBe("auto");
      await page.screenshot({
        path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-on-demand-inspector.png`,
      });
      await closeButton.click();
      await expect(noteInspector).toHaveCount(0);
      await expect(inspectableNote).toBeFocused();
      expect(await undoIsEnabled(page)).toBe(undoBeforeInspector);
      await inspectableNote.focus();
      await page.keyboard.press("e");
      await expect(noteInspector).toBeVisible();
      await expect(pitchInput).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(noteInspector).toHaveCount(0);
      await expect(inspectableNote).toBeFocused();
      expect(await undoIsEnabled(page)).toBe(undoBeforeInspector);
    }
  }
  await themeGroup.getByRole("button", { name: "Dark theme" }).click();
  await toolbar.getByRole("button", { name: "Degrees" }).click();
  await toolbar.getByRole("button", { name: "Guides" }).click();
  await page.getByTestId("score-system-audition-0").click();
  await expect(page.locator(".piano-roll-playhead[data-audition-end-beat]")).toBeVisible();
  await page.waitForTimeout(450);
  await page.screenshot({
    path: `${evidenceRoot}/piano-roll-1280x720-dark-degrees-active-playhead.png`,
  });
});

test("Piano Roll display preferences survive a page reload without changing the Project", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  for (const chord of ["I", "V", "vi", "IV"]) {
    await page
      .getByTestId(`chord-card-${chord}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await setProgressionView(page, "staff");
  await expect(page.locator("[data-progression-step-select]")).toHaveCount(4);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hooks = (
          window as Window & {
            __cadenceflow_persistence__?: {
              autosaveCount: number;
              lastCompletedProjectSnapshot: string;
            };
          }
        ).__cadenceflow_persistence__;
        if (!hooks?.autosaveCount || !hooks.lastCompletedProjectSnapshot) return 0;
        const project = JSON.parse(hooks.lastCompletedProjectSnapshot) as {
          presentation?: { progressionView?: string };
          progression?: { steps?: unknown[] };
        };
        return project.presentation?.progressionView === "piano-roll"
          ? (project.progression?.steps?.length ?? 0)
          : 0;
      }),
    )
    .toBe(4);
  const projectSnapshotBeforePreferences = await page.evaluate(() => {
    const hooks = (
      window as Window & {
        __cadenceflow_persistence__?: { lastCompletedProjectSnapshot: string };
      }
    ).__cadenceflow_persistence__;
    return hooks?.lastCompletedProjectSnapshot ?? "";
  });
  expect(projectSnapshotBeforePreferences).not.toBe("");
  const initialToolbar = page.getByTestId("piano-roll-toolbar");
  await expect(initialToolbar.getByRole("button", { name: "Guides" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const toolbar = initialToolbar;
  const unrelatedStorageBefore = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.localStorage)
        .filter(([key]) => key !== "cadenceflow.pianoRollPreferences")
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  const undoBefore = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Undo",
    );
    return button?.disabled ?? null;
  });
  await toolbar.getByRole("button", { name: "Chromatic" }).click();
  await toolbar.getByLabel("Snap resolution").selectOption("1/16 triplet");
  await toolbar.getByLabel("Horizontal zoom").fill("140");
  await toolbar.getByLabel("Vertical range").selectOption("1");
  await toolbar.getByLabel("Piano Roll note colors").selectOption("suzuki");
  await toolbar.getByRole("button", { name: "Guides" }).click();
  await expect(toolbar.getByRole("button", { name: "Guides" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(window.localStorage.getItem("cadenceflow.pianoRollPreferences") ?? "null"),
      ),
    )
    .toMatchObject({ gridMode: "chromatic", guidesEnabled: true, snap: "1/16 triplet" });
  expect(
    await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(window.localStorage)
          .filter(([key]) => key !== "cadenceflow.pianoRollPreferences")
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  ).toEqual(unrelatedStorageBefore);
  const savedSnapshotBeforeReload = await page.evaluate(() => {
    const hooks = (
      window as Window & {
        __cadenceflow_persistence__?: { lastCompletedProjectSnapshot: string };
      }
    ).__cadenceflow_persistence__;
    return hooks?.lastCompletedProjectSnapshot ?? "";
  });
  expect(savedSnapshotBeforeReload).toBe(projectSnapshotBeforePreferences);
  // Project autosave is debounced; let it finish before the hard reload.
  await page.waitForTimeout(800);
  const undoAfterControls = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Undo",
    );
    return button?.disabled ?? null;
  });
  expect(undoAfterControls).toBe(undoBefore);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("piano-roll-toolbar")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hooks = (
          window as Window & {
            __cadenceflow_persistence__?: { lastCompletedProjectSnapshot: string };
          }
        ).__cadenceflow_persistence__;
        const snapshot = hooks?.lastCompletedProjectSnapshot;
        return snapshot ? JSON.parse(snapshot) : null;
      }),
    )
    .toEqual(JSON.parse(savedSnapshotBeforeReload));
  const restored = page.getByTestId("piano-roll-toolbar");
  await expect(restored).toBeVisible();
  await expect(restored.getByRole("button", { name: "Chromatic" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(restored.getByLabel("Snap resolution")).toHaveValue("1/16 triplet");
  await expect(restored.getByLabel("Horizontal zoom")).toHaveValue("140");
  await expect(restored.getByLabel("Vertical range")).toHaveValue("1");
  await expect(restored.getByLabel("Piano Roll note colors")).toHaveValue("suzuki");
  await expect(restored.getByRole("button", { name: "Guides" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const restoredGuide = page.locator("[data-testid='piano-roll-guide-tone']").first();
  await expect(restoredGuide).toHaveCount(1);
  await expect(page.locator(".piano-roll-grid.is-guides-on").first()).toHaveCount(1);
});
