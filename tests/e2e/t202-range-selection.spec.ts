import { test, expect } from "@playwright/test";
import { addRestToProgression, setProgressionView } from "./test-helpers/progression-settings";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

async function createFourStepProgression(page: import("@playwright/test").Page) {
  await page.goto("/");
  for (const functionId of ["I", "vi", "IV", "V"]) {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await setProgressionView(page, "staff");
  await expect(page.locator(".measure-staff-event-select")).toHaveCount(4);
}

function stepButton(page: import("@playwright/test").Page, index: number) {
  return page.locator(".measure-staff-event-select").nth(index);
}

test.describe("T202 range selection", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("click, Shift+click, Shift+Arrow, Escape and stable range marking", async ({ page }) => {
    await createFourStepProgression(page);

    await stepButton(page, 1).click();
    await stepButton(page, 3).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("range-selection-toolbar")).toContainText("3 selected");
    for (const index of [1, 2, 3]) {
      await expect(stepButton(page, index)).toHaveAttribute("aria-pressed", "true");
    }
    await expect(stepButton(page, 0)).toHaveAttribute("aria-pressed", "false");

    await stepButton(page, 1).focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("range-selection-toolbar")).toContainText("2 selected");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    await expect(stepButton(page, 2)).toBeFocused();
    await expect(stepButton(page, 2)).toHaveAttribute("aria-pressed", "true");
  });

  test("marquee marks one contiguous range and toolbar actions stay atomic", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await createFourStepProgression(page);

    const header = page.getByTestId("score-system-header").first();
    const paper = page.locator(".score-system-paper").first();
    await header.scrollIntoViewIfNeeded();
    const sourceSystem = page.getByTestId("progression-score-system").first();
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    const idsBeforeHeaderGesture = await page
      .locator(".measure-staff-event-select")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));
    const headerStart = { x: headerBox!.x + 8, y: headerBox!.y + 8 };
    const headerDrag = {
      x: headerBox!.x + Math.min(72, headerBox!.width - 8),
      y: headerBox!.y + 8,
    };
    await page.mouse.move(headerStart.x, headerStart.y);
    await page.mouse.down();
    await page.mouse.move(headerDrag.x, headerDrag.y);
    await expect(sourceSystem).toHaveClass(/is-system-drag-source/);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    const idsAfterHeaderGesture = await page
      .locator(".measure-staff-event-select")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));
    expect(idsAfterHeaderGesture).toEqual(idsBeforeHeaderGesture);

    await paper.scrollIntoViewIfNeeded();
    await stepButton(page, 3).scrollIntoViewIfNeeded();
    const first = await stepButton(page, 0).boundingBox();
    const last = await stepButton(page, 3).boundingBox();
    const paperBox = await paper.boundingBox();
    expect(first).not.toBeNull();
    expect(last).not.toBeNull();
    expect(paperBox).not.toBeNull();
    const paperStart = { x: paperBox!.x + 8, y: paperBox!.y + 8 };
    expect(paperStart.x).toBeGreaterThanOrEqual(0);
    expect(paperStart.y).toBeGreaterThanOrEqual(0);
    expect(paperStart.x).toBeLessThan(1920);
    expect(paperStart.y).toBeLessThan(1080);
    const paperStartHit = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return {
        insidePaper: Boolean(target?.closest(".score-system-paper")),
        insideEvent: Boolean(target?.closest(".measure-staff-event")),
        insideHeader: Boolean(target?.closest(".score-system-header")),
      };
    }, paperStart);
    expect(paperStartHit).toEqual({ insidePaper: true, insideEvent: false, insideHeader: false });

    await page.mouse.move(paperStart.x, paperStart.y);
    await page.mouse.down();
    await page.mouse.move(last!.x + last!.width - 2, last!.y + last!.height - 2);
    await page.mouse.up();

    await expect(page.getByTestId("range-selection-toolbar")).toContainText("4 selected");
    await page.getByTestId("range-toolbar-loop").click();
    await expect(page.getByTestId("range-toolbar-loop")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("range-toolbar-copy").click();
    await page.getByTestId("range-toolbar-performance").click();
    await expect(page.getByTestId("range-toolbar-performance-reset")).toBeVisible();
    await page.getByTestId("range-toolbar-performance-reset").click();
    await expect(page.getByTestId("range-toolbar-transpose")).toBeEnabled();
    await page.getByTestId("range-toolbar-duplicate").click();
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(8);
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
  });

  test("range Delete preserves Step IDs and exact timeline by clearing Harmony to Rest", async ({
    page,
  }) => {
    await createFourStepProgression(page);
    await ensureHistoryControlsVisible(page);
    const idsBefore = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));
    const startsBefore = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) =>
        buttons.map((button) =>
          button
            .closest<HTMLElement>(".measure-staff-event")
            ?.style.getPropertyValue("--measure-staff-event-x"),
        ),
      );

    await stepButton(page, 1).click();
    await stepButton(page, 2).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("range-selection-toolbar")).toContainText("2 selected");
    await page.getByTestId("range-toolbar-delete").click();

    await expect(page.locator(".measure-staff-event-select")).toHaveCount(4);
    await expect(page.locator(".measure-staff-event.is-rest")).toHaveCount(2);
    const idsAfter = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));
    const startsAfter = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) =>
        buttons.map((button) =>
          button
            .closest<HTMLElement>(".measure-staff-event")
            ?.style.getPropertyValue("--measure-staff-event-x"),
        ),
      );
    expect(idsAfter).toEqual(idsBefore);
    expect(startsAfter).toEqual(startsBefore);
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".measure-staff-event.is-rest")).toHaveCount(0);
    await page.keyboard.press("Control+y");
    await expect(page.locator(".measure-staff-event.is-rest")).toHaveCount(2);
  });

  test("clears transient range after Duplicate and keeps one selection through Undo/Redo", async ({
    page,
  }) => {
    await createFourStepProgression(page);
    await ensureHistoryControlsVisible(page);
    await stepButton(page, 0).click();
    await stepButton(page, 3).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("range-selection-toolbar")).toContainText("4 selected");
    await expect(page.getByTestId("range-toolbar-play")).toHaveText("Play From First");

    const originalIds = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));

    await page.getByTestId("range-toolbar-duplicate").click();
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(8);
    await expect(page.locator('[data-progression-step-select][aria-pressed="true"]')).toHaveCount(
      1,
    );
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    const duplicatedSelectionId = await page
      .locator('[data-progression-step-select][aria-pressed="true"]')
      .getAttribute("data-step-id");
    expect(duplicatedSelectionId).toBeTruthy();
    expect(originalIds).not.toContain(duplicatedSelectionId);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(4);
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    await expect(page.locator('[data-progression-step-select][aria-pressed="true"]')).toHaveCount(
      1,
    );
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();

    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(8);
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    await expect(page.locator('[data-progression-step-select][aria-pressed="true"]')).toHaveCount(
      1,
    );
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
  });

  test("toolbar remains usable under 200 percent layout pressure", async ({ page }) => {
    await createFourStepProgression(page);
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await stepButton(page, 0).click();
    await stepButton(page, 3).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("range-selection-toolbar")).toBeVisible();
    await expect(page.getByTestId("range-selection-toolbar")).toContainText("4 selected");
    await expect(page.getByTestId("range-toolbar-delete")).toBeVisible();
    await expect(page.getByTestId("range-toolbar-transpose")).toBeEnabled();
  });

  test("keeps Rest and stable IDs selected across Staff and Tablature views", async ({ page }) => {
    await createFourStepProgression(page);

    const firstStepId = await stepButton(page, 0).getAttribute("data-step-id");
    await stepButton(page, 0).click();
    const durationInspector = page.getByTestId("step-performance-inspector");
    await durationInspector
      .getByRole("textbox", { name: "Duration in canonical quarter-note beats" })
      .fill("6");
    await durationInspector.getByRole("button", { name: "Set custom duration in beats" }).click();
    const continuation = page
      .locator(".measure-staff-event.is-continuation .measure-staff-event-select")
      .first();
    await expect(continuation).toHaveAttribute("data-step-id", firstStepId!);
    await continuation.click();
    await expect(stepButton(page, 0)).toHaveAttribute("aria-pressed", "true");

    await addRestToProgression(page);

    const restTarget = page.locator(".measure-staff-event.is-rest .measure-staff-event-select");
    const restId = await restTarget.getAttribute("data-step-id");
    expect(restId).toBeTruthy();
    const restIndex = await page
      .locator(".measure-staff-event-select")
      .evaluateAll(
        (steps, selectedRestId) =>
          steps.findIndex((step) => step.getAttribute("data-step-id") === selectedRestId),
        restId,
      );
    expect(restIndex).toBeGreaterThanOrEqual(0);

    await restTarget.click();
    const neighborIndex = restIndex === 0 ? restIndex + 1 : restIndex - 1;
    await stepButton(page, neighborIndex).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("range-selection-toolbar")).toContainText("2 selected");

    for (const view of ["staff", "tablature"] as const) {
      await setProgressionView(page, view);
      await expect(
        page.locator(`[data-progression-step-select][data-step-id="${restId}"]`),
      ).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("does not intercept the Rest remove button as a range-selection click", async ({ page }) => {
    await createFourStepProgression(page);
    await addRestToProgression(page);
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(5);
    const rest = page.locator(".measure-staff-event.is-rest .measure-staff-event-select");
    await rest.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete Rest" }).click();
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(5);
    await expect(page.locator(".measure-staff-event.is-rest")).toHaveCount(1);
  });

  test("Shift+Arrow extends Staff and Tablature ranges without reordering chords", async ({
    page,
  }) => {
    await createFourStepProgression(page);
    for (const view of ["staff", "tablature"] as const) {
      await setProgressionView(page, view);
      const targets = page.locator(".measure-staff-event-select");
      const firstId = await targets.first().getAttribute("data-step-id");
      const secondId = await targets.nth(1).getAttribute("data-step-id");
      await targets.first().click();
      await targets.first().focus();
      await page.keyboard.press("Shift+ArrowRight");
      await expect(page.getByTestId("range-selection-toolbar")).toContainText("2 selected");
      await expect(targets.first()).toHaveAttribute("data-step-id", firstId!);
      await expect(targets.nth(1)).toHaveAttribute("data-step-id", secondId!);
      await expect(targets.first()).toHaveAttribute("aria-pressed", "true");
      await expect(targets.nth(1)).toHaveAttribute("aria-pressed", "true");
    }
  });
});
