import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const screenshotRoot =
  process.env.CADENCEFLOW_T209_SCREENSHOT_ROOT ??
  "C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-cb59c92804cc/t209-song-sections";

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

test("T209 creates, edits, persists, and undoes Song Sections across supported views and sizes", async ({
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
  await page.getByTestId("progression-view-btn-staff").click();
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
  const melodyNote = page.locator(".score-system .melody-staff-note");
  await expect(melodyNote).toHaveCount(1);
  const melodyOwnerStepId = await melodyNote.getAttribute("data-step-id");
  expect(melodyOwnerStepId).toBeTruthy();

  for (const view of ["staff", "tablature"] as const) {
    await page.getByTestId(`progression-view-btn-${view}`).click();
    const visibleNotes = page.locator(".score-system .melody-staff-note");
    await expect(visibleNotes).toHaveCount(1);
    await expect(visibleNotes.first()).toHaveAttribute("data-step-id", melodyOwnerStepId!);
  }
  await page.getByTestId("progression-view-btn-staff").click();
  const firstProgressionStep = page.locator("[data-progression-step-select]").first();
  await firstProgressionStep.click();
  await expect(firstProgressionStep).toHaveAttribute("aria-pressed", "true");

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
  await expect(
    page.locator(".song-section-score-marker").filter({
      hasText: "After Chorus Review With A Long Name",
    }),
  ).toHaveCount(1);
  await expect(page.getByTestId("song-section-boundary")).toHaveCount(2);

  for (const view of ["staff", "tablature"] as const) {
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
        const visibleTextRects = chordAndNoteText.flatMap((element) => {
          const svg = element.closest("svg");
          const scrollViewport = element.closest(".score-system-scroll");
          if (!svg || !scrollViewport) return [];
          const textBounds = rect(element);
          const svgBounds = rect(svg);
          const scrollBounds = rect(scrollViewport);
          const visibleBounds = {
            left: Math.max(textBounds.left, svgBounds.left, scrollBounds.left),
            right: Math.min(textBounds.right, svgBounds.right, scrollBounds.right),
            top: Math.max(textBounds.top, svgBounds.top, scrollBounds.top),
            bottom: Math.min(textBounds.bottom, svgBounds.bottom, scrollBounds.bottom),
          };
          return visibleBounds.left < visibleBounds.right &&
            visibleBounds.top < visibleBounds.bottom
            ? [visibleBounds]
            : [];
        });
        const controlRects = chordControls.map(rect);
        const svg = document.querySelector(".score-system-canvas > svg");
        return {
          markerCollisions: markerRects.flatMap((marker, index) =>
            markerRects.slice(index + 1).filter((other) => overlaps(marker, other)),
          ).length,
          notationCollisions: markerRects.flatMap((marker) =>
            visibleTextRects.filter((notation) => overlaps(marker, notation)),
          ).length,
          controlCollisions: markerRects.flatMap((marker) =>
            controlRects.filter((control) => overlaps(marker, control)),
          ).length,
          markerRows: markers.map((marker) => marker.getAttribute("data-section-marker-row")),
          svgOverflow: svg ? getComputedStyle(svg).overflow : null,
        };
      });
      expect(geometry.markerCollisions).toBe(0);
      expect(geometry.notationCollisions, JSON.stringify(geometry)).toBe(0);
      expect(geometry.controlCollisions).toBe(0);
      expect(geometry.svgOverflow).toBe("hidden");
      expect(new Set(geometry.markerRows).size).toBe(2);
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
  await page.getByTestId("progression-view-btn-staff").click();
  await page.locator("[data-progression-step-select]").nth(1).press("Enter");
  await page.getByRole("button", { name: "Delete section Chorus" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Section name: After Chorus Review With A Long Name")).toBeFocused();
  const step2Boundary = page.getByLabel(/section boundary at Step 2, Measure 1/);
  await expect(step2Boundary).toHaveAttribute(
    "aria-label",
    "After Chorus Review With A Long Name section boundary at Step 2, Measure 1",
  );
  await runEditAction(page, "Undo");
  await expect(step2Boundary).toHaveAttribute(
    "aria-label",
    /(?:Chorus.*After Chorus Review With A Long Name|After Chorus Review With A Long Name.*Chorus) section boundary at Step 2, Measure 1/,
  );

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const view of ["staff", "tablature"] as const) {
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
  await page.getByTestId("progression-view-btn-tablature").click();
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
