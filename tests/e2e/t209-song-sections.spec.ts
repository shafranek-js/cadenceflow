import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const screenshotRoot =
  "C:/Users/pavel/.codex/visualizations/2026/09/30/01a0f347-e185-73f0-b31b-15c06a188033/t209-song-sections";

async function runEditAction(page: import("@playwright/test").Page, action: "Undo" | "Redo") {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function placeBelowAppHeader(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
) {
  await target.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const headerBottom = document
      .querySelector<HTMLElement>(".app-header")
      ?.getBoundingClientRect().bottom;
    const rect = element.getBoundingClientRect();
    if (typeof headerBottom === "number") {
      const safeCenter = headerBottom + Math.max(24, (window.innerHeight - headerBottom) / 2);
      window.scrollBy({ top: rect.top + rect.height / 2 - safeCenter, behavior: "instant" });
    }
  });
  await expect(target).toBeInViewport();
  const position = await target.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    headerBottom:
      document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0,
  }));
  expect(position.top).toBeGreaterThanOrEqual(position.headerBottom);
}

async function readTimelineGeometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const relativeRect = (element: Element, parent: Element) => {
      const bounds = element.getBoundingClientRect();
      const parentBounds = parent.getBoundingClientRect();
      return {
        start: Math.round(((bounds.left - parentBounds.left) / parentBounds.width) * 10000) / 10000,
        width: Math.round((bounds.width / parentBounds.width) * 10000) / 10000,
      };
    };
    return Array.from(document.querySelectorAll<HTMLElement>("[data-testid='progression-measure']"))
      .map((measure) => {
        const grid = measure.querySelector<HTMLElement>("[data-testid='progression-measure-grid']");
        const melodyTrack = measure.querySelector<HTMLElement>("[data-testid='melody-lane-track']");
        if (!grid || !melodyTrack) return null;
        return {
          measureIndex: measure.dataset.measureIndex,
          segments: Array.from(
            grid.querySelectorAll<HTMLElement>(
              ":scope > .measure-item-wrapper > .measure-step-segment[data-step-id]",
            ),
          ).map((segment) => ({
            stepId: segment.dataset.stepId,
            startBeats: segment.dataset.startBeats,
            durationBeats: segment.dataset.durationBeats,
            ...relativeRect(segment, grid),
          })),
          melodyColumns: Array.from(
            melodyTrack.querySelectorAll<HTMLElement>(".inline-melody-lane-column[data-step-id]"),
          ).map((column) => ({
            stepId: column.dataset.stepId,
            startBeats: column.dataset.startBeats,
            durationBeats: column.dataset.durationBeats,
            ...relativeRect(column, melodyTrack),
          })),
        };
      })
      .filter((measure): measure is NonNullable<typeof measure> => measure !== null);
  });
}

async function expectReadableColors(
  element: import("@playwright/test").Locator,
  description: string,
) {
  const contrast = await element.evaluate((node) => {
    const parse = (color: string) =>
      color
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    const luminance = (color: string) => {
      const [red, green, blue] = parse(color).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
    };
    const foreground = luminance(getComputedStyle(node).color);
    const background = luminance(getComputedStyle(node).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast, `${description} contrast ratio`).toBeGreaterThanOrEqual(4.5);
}

test("T209 creates, edits, persists, and undoes Song Sections across all views and sizes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  mkdirSync(screenshotRoot, { recursive: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await page
    .getByTestId("chord-card-IV")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await page
    .getByTestId("chord-card-V")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  const step = page.locator("[data-progression-step-select]").first();
  await step.click();
  await page.getByTestId("quick-edit-duration").selectOption("1/4");
  await page.locator("[data-progression-step-select]").nth(1).click();
  await page.getByTestId("quick-edit-duration").selectOption("1/4");
  await step.click({ button: "right" });
  const melodyMenu = page.getByRole("menu", { name: /Melody actions/ });
  await melodyMenu.getByRole("menuitem", { name: "Create Melody…" }).click();
  const melodyDialog = page.getByRole("dialog", { name: "Create Melody" });
  await melodyDialog.getByRole("button", { name: "Authored notes" }).click();
  await melodyDialog.getByLabel("Authored pitch MIDI").fill("60");
  await melodyDialog.getByLabel("Authored duration numerator").fill("1");
  await melodyDialog.getByLabel("Authored duration denominator").fill("4");
  await melodyDialog.getByRole("button", { name: "Add note" }).click();
  await melodyDialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(page.getByTestId("melody-lane-note")).toHaveCount(1);

  const timelineBaselines: Record<string, Awaited<ReturnType<typeof readTimelineGeometry>>> = {};
  for (const view of ["piano", "guitar"] as const) {
    await page.getByTestId(`progression-view-btn-${view}`).click();
    timelineBaselines[view] = await readTimelineGeometry(page);
    expect(timelineBaselines[view].length).toBeGreaterThan(0);
    for (const measure of timelineBaselines[view]) {
      const segmentTimeline = measure.segments.map(
        ({ stepId, startBeats, durationBeats }) => `${stepId}:${startBeats}:${durationBeats}`,
      );
      const melodyTimeline = measure.melodyColumns.map(
        ({ stepId, startBeats, durationBeats }) => `${stepId}:${startBeats}:${durationBeats}`,
      );
      expect(melodyTimeline).toEqual(segmentTimeline);
    }
  }
  expect(timelineBaselines.harmonic[0]?.segments.map((segment) => segment.durationBeats)).toEqual([
    "1/4",
    "1/4",
    "7/2",
  ]);
  expect(timelineBaselines.harmonic[1]?.segments.map((segment) => segment.durationBeats)).toContain(
    "1/2",
  );
  await page.getByTestId("progression-view-btn-piano").click();

  const createAtStep1 = page.getByLabel(/New section name at Step 1/);
  await createAtStep1.fill("Verse A");
  await createAtStep1.press("Enter");
  await expect(page.getByTestId("song-section-boundary")).toContainText("Verse A");
  await expect(page.getByLabel("Section name: Verse A")).toHaveValue("Verse A");
  const renameVerse = page.getByLabel("Section name: Verse A");
  await renameVerse.fill("Opening Verse");
  await renameVerse.press("Enter");
  await expect(
    page.getByTestId("song-section-boundary").filter({ hasText: "Opening Verse" }),
  ).toHaveCount(1);
  await runEditAction(page, "Undo");
  await expect(page.getByTestId("song-section-boundary")).toContainText("Verse A");
  await expect(page.getByLabel("Section name: Verse A")).toHaveValue("Verse A");
  await runEditAction(page, "Redo");
  await expect(page.getByTestId("song-section-boundary")).toContainText("Opening Verse");
  await expect(page.getByLabel("Section name: Opening Verse")).toHaveValue("Opening Verse");
  await page.getByLabel("Section name: Opening Verse").fill("Unsubmitted Draft");
  await page.locator("[data-progression-step-select]").nth(1).click();
  await page.locator("[data-progression-step-select]").first().click();
  await expect(page.getByLabel("Section name: Opening Verse")).toHaveValue("Opening Verse");

  await page.locator("[data-progression-step-select]").nth(1).click();
  const createAtStep2 = page.getByLabel(/New section name at Step 2/);
  await createAtStep2.fill("Chorus");
  await createAtStep2.press("Enter");
  await expect(page.getByTestId("song-section-boundary")).toHaveCount(2);
  await createAtStep2.fill("After Chorus Review With A Long Name");
  await createAtStep2.press("Enter");
  await expect(page.locator(".song-section-boundaries")).toHaveCount(2);
  await expect(page.getByTestId("song-section-boundary")).toHaveCount(3);

  for (const view of ["piano", "staff", "guitar", "tablature"] as const) {
    await page.getByTestId(`progression-view-btn-${view}`).click();
    await expect(
      page.getByTestId("song-section-boundary").filter({ hasText: "Opening Verse" }),
    ).toHaveCount(1);
    if (view === "staff" || view === "tablature") {
      const chorusBoundary = page.locator(
        ".song-section-score-marker[aria-label*='section boundary at Step 2, Measure 1']",
      );
      await expect(chorusBoundary).toHaveCount(1);
      await expect(chorusBoundary).toContainText("Chorus");
      await expect(chorusBoundary).toContainText("After Chorus Review With A Long Name");
      await expect(page.getByLabel(/section boundary at Step 2, Measure 2/)).toHaveCount(0);

      const geometry = await page.evaluate(() => {
        const rect = (element: Element) => {
          const bounds = element.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
        };
        const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const markers = Array.from(document.querySelectorAll(".song-section-score-marker"));
        const chordAndNoteText = Array.from(
          document.querySelectorAll(".score-system-canvas svg text"),
        ).filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        });
        const chordControls = Array.from(
          document.querySelectorAll(".measure-staff-event-select, .measure-staff-event-details"),
        ).filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        });
        const markerRects = markers.map(rect);
        const textRects = chordAndNoteText.map(rect);
        const controlRects = chordControls.map(rect);
        return {
          markerCollisions: markerRects.flatMap((marker, index) =>
            markerRects.slice(index + 1).filter((other) => overlaps(marker, other)),
          ).length,
          notationCollisions: markerRects.flatMap((marker) =>
            textRects.filter((notation) => overlaps(marker, notation)),
          ).length,
          controlCollisions: markerRects.flatMap((marker) =>
            controlRects.filter((control) => overlaps(marker, control)),
          ).length,
          markerRows: markers.map((marker) => marker.getAttribute("data-section-marker-row")),
        };
      });
      expect(geometry.markerCollisions).toBe(0);
      expect(geometry.notationCollisions).toBe(0);
      expect(geometry.controlCollisions).toBe(0);
      expect(new Set(geometry.markerRows).size).toBe(2);
    } else {
      await expect(page.locator(".song-section-boundaries")).toHaveCount(2);
      await expect(page.getByTestId("song-section-boundary")).toHaveCount(3);
      const continuation = page.getByTestId("progression-step-continuation");
      await expect(continuation).toHaveCount(1);
      await expect(
        continuation.locator("xpath=..").locator(".song-section-boundaries"),
      ).toHaveCount(0);
      const currentGeometry = await readTimelineGeometry(page);
      expect(currentGeometry).toEqual(timelineBaselines[view]);
      const badgeGeometry = await page.locator(".song-section-boundaries").evaluateAll((badges) =>
        badges.map((badge) => {
          const bounds = badge.getBoundingClientRect();
          const segment = badge.closest<HTMLElement>(".measure-step-segment");
          const segmentBounds = segment?.getBoundingClientRect();
          const card = segment?.querySelector<HTMLElement>(
            ".progression-step-card, .progression-rest-card",
          );
          const cardTop = card?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
          return {
            height: bounds.height,
            withinSegment: Boolean(
              segmentBounds &&
              bounds.left >= segmentBounds.left - 1 &&
              bounds.right <= segmentBounds.right + 1,
            ),
            beforeCard: bounds.bottom <= cardTop + 0.5,
          };
        }),
      );
      expect(badgeGeometry.every((badge) => badge.height <= 24.5)).toBe(true);
      expect(badgeGeometry.every((badge) => badge.withinSegment)).toBe(true);
      expect(badgeGeometry.every((badge) => badge.beforeCard)).toBe(true);
    }
    const bounds = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(bounds.width).toBeLessThanOrEqual(bounds.inner + 2);
  }

  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByTestId("song-section-boundary").filter({ hasText: "Opening Verse" }),
  ).toHaveCount(1);
  await page.getByTestId("progression-view-btn-piano").click();
  await page.locator("[data-progression-step-select]").nth(1).press("Enter");
  await page.getByRole("button", { name: "Delete section Chorus" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Section name: After Chorus Review With A Long Name")).toBeFocused();
  await expect(page.locator(".song-section-boundary").filter({ hasText: /^Chorus$/ })).toHaveCount(
    0,
  );
  await runEditAction(page, "Undo");
  await expect(page.locator(".song-section-boundary").filter({ hasText: /^Chorus$/ })).toHaveCount(
    1,
  );

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const view of ["piano", "staff", "guitar", "tablature"] as const) {
      await page.getByTestId(`progression-view-btn-${view}`).click();
      const boundary = page.getByTestId("song-section-boundary").first();
      await placeBelowAppHeader(page, boundary);
      for (const theme of ["dark", "light"] as const) {
        await page
          .getByRole("group", { name: "Theme" })
          .getByRole("button", { name: theme === "dark" ? "Dark theme" : "Light theme" })
          .click();
        await expectReadableColors(
          page.locator(".song-section-boundary").first(),
          `${theme} Song Section badge`,
        );
        await placeBelowAppHeader(page, boundary);
        const file = `${screenshotRoot}/song-sections-${view}-${theme}-${viewport.width}x${viewport.height}.png`;
        await page.screenshot({ path: file, fullPage: false });
        if (viewport.width === 640 && (view === "staff" || view === "tablature")) {
          const score = page.locator(".measure-staff-event-select").first();
          await placeBelowAppHeader(page, score);
          await page.screenshot({
            path: `${screenshotRoot}/song-sections-${view}-${theme}-640x360-notation.png`,
            fullPage: false,
          });
        }
      }
    }
  }
  const mobileBounds = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(mobileBounds.width).toBeLessThanOrEqual(mobileBounds.inner + 2);
  await page.getByTestId("progression-view-btn-piano").click();
  const editorInput = page.getByLabel("Section name: Chorus");
  for (const theme of ["dark", "light"] as const) {
    await page
      .getByRole("group", { name: "Theme" })
      .getByRole("button", { name: theme === "dark" ? "Dark theme" : "Light theme" })
      .click();
    await expectReadableColors(editorInput, `${theme} Song Section editor input`);
    await placeBelowAppHeader(page, editorInput);
    await page.screenshot({
      path: `${screenshotRoot}/song-sections-editor-${theme}-640x360.png`,
      fullPage: false,
    });
  }
});
