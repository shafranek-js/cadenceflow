import { expect, test } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import { setProgressionView } from "./test-helpers/progression-settings";

test.describe("Progression Presets Relocation", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    });
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();
    await ensureHistoryControlsVisible(page);
  });

  test("removes presets buttons from progression header and provides them in All Steps & Measures and context menu", async ({
    page,
  }) => {
    // 1. Header does not have .progression-preset-actions
    const header = page.getByTestId("progression-heading");
    await expect(header).toBeVisible();
    await expect(header.locator(".progression-preset-actions")).toHaveCount(0);

    // 2. ProgressionGlobalInspector (All Steps & Measures) contains Presets section
    const globalInspector = page.getByTestId("progression-global-inspector");
    await expect(globalInspector).toBeVisible();

    const presetsDisclosure = globalInspector.locator(".global-presets-disclosure");
    await expect(presetsDisclosure).toBeVisible();
    await expect(presetsDisclosure.locator("summary")).toContainText("Presets");

    // Check drag handle exists for Presets section
    const dragHandle = presetsDisclosure.locator(".inspector-drag-handle");
    await expect(dragHandle).toBeVisible();
    await expect(dragHandle).toHaveAttribute("aria-label", /Reorder Presets section/);

    // Ensure section is open
    if (!(await presetsDisclosure.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await presetsDisclosure.locator("summary").click();
    }

    // Buttons are present in inspector
    const inspectorPresetsBtn = page.getByTestId("progression-presets-btn");
    const inspectorSavePresetBtn = page.getByTestId("progression-save-preset-btn");
    await expect(inspectorPresetsBtn).toBeVisible();
    await expect(inspectorSavePresetBtn).toBeVisible();

    // Clicking Presets button opens Presets panel
    await inspectorPresetsBtn.click();
    const presetsPanel = page.locator(".presets-panel");
    await expect(presetsPanel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(presetsPanel).toBeHidden();

    // Clicking Save as Preset button opens Save Preset dialog
    await inspectorSavePresetBtn.click();
    const saveDialog = page.locator(".save-preset-dialog");
    await expect(saveDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(saveDialog).toBeHidden();

    // 3. Right-click on My Progression header opens context menu with Presets actions
    await header.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
    const contextMenu = page.getByTestId("progression-context-menu");
    await expect(contextMenu).toBeVisible();

    const menuPresetsItem = page.getByTestId("progression-menu-presets");
    const menuSavePresetItem = page.getByTestId("progression-menu-save-as-preset");
    await expect(menuPresetsItem).toBeVisible();
    await expect(menuSavePresetItem).toBeVisible();

    // Trigger Presets via context menu
    await menuPresetsItem.click();
    await expect(presetsPanel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(presetsPanel).toBeHidden();

    // Trigger Save as Preset via context menu
    await header.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
    await menuSavePresetItem.click();
    await expect(saveDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(saveDialog).toBeHidden();

    // 4. When a step is selected (Selected step inspector active), Presets accessible via header right-click
    const cardI = page.getByTestId("chord-card-I");
    await cardI.locator(".chord-main").click({ modifiers: ["Control"] });
    await setProgressionView(page, "staff");
    const step = page.locator(".measure-staff-event-select").first();
    await step.click();
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();

    // Right-click header still works while step is selected
    await header.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
    await expect(menuPresetsItem).toBeVisible();
    await menuPresetsItem.click();
    await expect(presetsPanel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(presetsPanel).toBeHidden();
  });
});
