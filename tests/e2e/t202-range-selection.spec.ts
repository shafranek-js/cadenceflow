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
  await expect(page.getByTestId("progression-step")).toHaveCount(4);
}

function stepButton(page: import("@playwright/test").Page, index: number) {
  return page.getByTestId("progression-step").nth(index).locator("[data-progression-step-select]");
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
    await createFourStepProgression(page);

    const header = page
      .getByTestId("progression-measure")
      .first()
      .locator(".progression-measure-header");
    await header.scrollIntoViewIfNeeded();
    const first = await stepButton(page, 0).boundingBox();
    const last = await stepButton(page, 3).boundingBox();
    const headerBox = await header.boundingBox();
    expect(first).not.toBeNull();
    expect(last).not.toBeNull();
    expect(headerBox).not.toBeNull();
    await page.mouse.move(headerBox!.x + 4, headerBox!.y + 4);
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
    await expect(page.getByTestId("range-toolbar-transpose")).toBeDisabled();
    await page.getByTestId("range-toolbar-duplicate").click();
    await expect(page.getByTestId("progression-step")).toHaveCount(8);
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
        buttons.map(
          (button) => button.closest<HTMLElement>("[data-start-beats]")?.dataset.startBeats,
        ),
      );

    await stepButton(page, 1).click();
    await stepButton(page, 2).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("range-selection-toolbar")).toContainText("2 selected");
    await page.getByTestId("range-toolbar-delete").click();

    await expect(page.getByTestId("progression-step")).toHaveCount(4);
    await expect(page.locator(".progression-rest-card")).toHaveCount(2);
    const idsAfter = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));
    const startsAfter = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) =>
        buttons.map(
          (button) => button.closest<HTMLElement>("[data-start-beats]")?.dataset.startBeats,
        ),
      );
    expect(idsAfter).toEqual(idsBefore);
    expect(startsAfter).toEqual(startsBefore);
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".progression-rest-card")).toHaveCount(0);
    await page.keyboard.press("Control+y");
    await expect(page.locator(".progression-rest-card")).toHaveCount(2);
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
    await expect(page.getByTestId("progression-step")).toHaveCount(8);
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
    await expect(page.getByTestId("progression-step")).toHaveCount(4);
    await expect(page.getByTestId("range-selection-toolbar")).toHaveCount(0);
    await expect(page.locator('[data-progression-step-select][aria-pressed="true"]')).toHaveCount(
      1,
    );
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();

    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByTestId("progression-step")).toHaveCount(8);
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
    await expect(page.getByTestId("range-toolbar-transpose")).toBeDisabled();
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
    const continuation = page.locator("[data-testid=progression-step-continuation]").first();
    await expect(continuation).toHaveAttribute("data-step-id", firstStepId!);
    await continuation.click();
    await expect(stepButton(page, 0)).toHaveAttribute("aria-pressed", "true");

    await addRestToProgression(page);

    const restTarget = page.locator(".progression-rest-card [data-progression-step-select]");
    const restId = await restTarget.getAttribute("data-step-id");
    expect(restId).toBeTruthy();

    await restTarget.click();
    await stepButton(page, 3).click({ modifiers: ["Shift"] });
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
    await expect(page.getByTestId("progression-step")).toHaveCount(5);
    await page.getByRole("button", { name: "Remove progression step 5: Rest" }).click();
    await expect(page.getByTestId("progression-step")).toHaveCount(5);
    await expect(page.locator(".progression-rest-card")).toHaveCount(1);
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
