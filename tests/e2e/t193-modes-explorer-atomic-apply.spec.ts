import { expect, test } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

const acceptanceModes = [
  { width: 1280, height: 720, theme: "light" },
  { width: 1280, height: 720, theme: "dark" },
  { width: 1920, height: 1080, theme: "light" },
  { width: 1920, height: 1080, theme: "dark" },
] as const;

for (const acceptance of acceptanceModes) {
  test(`T193 applies atomically with keyboard focus and no overflow at ${acceptance.width}x${acceptance.height} ${acceptance.theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: acceptance.width, height: acceptance.height });
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await setProgressionView(page, "staff");

    const openExplorer = page.getByTestId("matrix-modes-trigger");
    await expect(openExplorer).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", {
        name: acceptance.theme === "light" ? "Light theme" : "Dark theme",
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", acceptance.theme);

    await openExplorer.click();
    const dialog = page.getByRole("dialog", { name: "Scales & Modes Explorer" });
    await expect(dialog).toBeVisible();

    const switchKey = dialog.locator(".modes-switch-key-label input");
    await expect(switchKey).toBeChecked();
    await switchKey.focus();
    await page.keyboard.press("Space");
    await expect(switchKey).not.toBeChecked();

    const applyButton = dialog.locator(".formula-apply-btn").first();
    await applyButton.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("alert")).toContainText("Switch the project key");
    await expect(dialog.getByRole("alert")).toContainText("B♭ major");
    await expect(applyButton).toBeFocused();
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(0);

    const overflowBeforeApply = await page.evaluate(() => {
      const modal = document.querySelector<HTMLElement>(".modes-explorer-modal");
      return {
        page: document.documentElement.scrollWidth - window.innerWidth,
        modal: modal ? modal.scrollWidth - modal.clientWidth : Number.POSITIVE_INFINITY,
        modalRight: modal ? modal.getBoundingClientRect().right - window.innerWidth : 0,
      };
    });
    expect(overflowBeforeApply.page).toBeLessThanOrEqual(0);
    expect(overflowBeforeApply.modal).toBeLessThanOrEqual(0);
    expect(overflowBeforeApply.modalRight).toBeLessThanOrEqual(1);

    const switchAndApply = dialog.locator(".modes-switch-and-apply-button");
    await switchAndApply.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(openExplorer).toBeFocused();

    const stepButtons = page.locator(".measure-staff-event-select[data-step-id]");
    await expect(stepButtons).toHaveCount(3);
    const appliedStepIds = await stepButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-step-id")),
    );

    await openExplorer.click();
    await expect(page.locator(".tonic-selector button[aria-pressed='true']")).toHaveAccessibleName(
      "Set key Bb",
    );
    await expect(page.locator(".modes-current-key-badge")).toContainText("Active: C Dorian");
    await page.keyboard.press("Escape");
    await expect(openExplorer).toBeFocused();

    await page.keyboard.press("Control+Z");
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(0);
    await expect(page.locator(".tonic-selector button[aria-pressed='true']")).toHaveAccessibleName(
      "Set key C",
    );
    await openExplorer.click();
    await expect(page.locator(".modes-current-key-badge")).toContainText("Active: C Dorian");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+Shift+Z");
    await expect(stepButtons).toHaveCount(3);
    const redoneStepIds = await stepButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-step-id")),
    );
    expect(redoneStepIds).toEqual(appliedStepIds);
  });
}
