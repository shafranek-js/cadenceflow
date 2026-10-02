import { expect, test } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

async function createProgression(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  for (const functionId of ["I", "vi", "IV"]) {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await expect(page.getByTestId("progression-step")).toHaveCount(3);
}

function stepButton(page: import("@playwright/test").Page, index: number) {
  return page.getByTestId("progression-step").nth(index).locator("[data-progression-step-select]");
}

test.describe("T203 deterministic alternatives tray", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("keyboard navigation, audition and Escape are non-mutating and restore focus", async ({
    page,
  }) => {
    await createProgression(page);
    await stepButton(page, 0).click();

    const trigger = page.getByTestId("matrix-explore-alternative");
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await expect(page.getByTestId("alternatives-tray")).toBeVisible();
    await expect(page.getByTestId("alternatives-candidate").first()).toBeVisible();
    await expect(page.getByTestId("alternatives-candidate").first()).toHaveClass(/is-active/);
    await expect(
      page.getByTestId("alternatives-candidate").first().locator("button").first(),
    ).toBeFocused();

    const before = await page.getByTestId("progression-step").allInnerTexts();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("alternatives-candidate").nth(1)).toHaveClass(/is-active/);
    await page.keyboard.press("Space");
    const afterAudition = await page.getByTestId("progression-step").allInnerTexts();
    expect(afterAudition).toEqual(before);

    await page.getByTestId("alternatives-tray-cancel").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("alternatives-tray")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(page.getByTestId("alternatives-tray")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("alternatives-tray")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("Enter/Apply inserts after the origin in one undoable command and rejects stale origins", async ({
    page,
  }) => {
    await createProgression(page);
    await ensureHistoryControlsVisible(page);
    await stepButton(page, 0).click();

    const originalCount = await page.getByTestId("progression-step").count();
    const original = await page.getByTestId("progression-step").nth(0).innerText();
    await page.getByTestId("matrix-explore-alternative").click();
    const candidateFunction = await page
      .getByTestId("alternatives-candidate")
      .first()
      .locator(".alternatives-tray-candidate-function")
      .innerText();
    const firstCandidate = page
      .getByTestId("alternatives-candidate")
      .first()
      .locator("button")
      .first();
    await firstCandidate.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("alternatives-tray")).toHaveCount(0);
    await expect(page.getByTestId("progression-step")).toHaveCount(originalCount + 1);
    await expect.poll(() => page.getByTestId("progression-step").nth(0).innerText()).toBe(original);
    await expect(page.getByTestId("progression-step").nth(1)).toContainText(candidateFunction);
    const applied = await page.getByTestId("progression-step").nth(1).innerText();

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByTestId("progression-step")).toHaveCount(originalCount);
    await expect.poll(() => page.getByTestId("progression-step").nth(0).innerText()).toBe(original);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByTestId("progression-step")).toHaveCount(originalCount + 1);
    await expect.poll(() => page.getByTestId("progression-step").nth(1).innerText()).toBe(applied);

    await stepButton(page, 0).click();
    await page.getByTestId("matrix-explore-alternative").click();
    const applyButton = page.getByTestId("alternatives-candidate").first().locator("button").last();
    await stepButton(page, 1).evaluate((element) => (element as HTMLElement).click());
    await applyButton.click();
    await expect(page.getByTestId("alternatives-tray-error")).toContainText("stale");
    await expect(page.getByTestId("alternatives-tray")).toBeVisible();
  });

  test("does not use a selected Rest outside the range as the alternatives origin", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByTestId("progression-heading")
      .getByRole("heading", { name: "My Progression" })
      .click({ button: "right" });
    await page.getByTestId("progression-menu-add-rest").click();
    const restButton = page.locator(".progression-rest-card [data-progression-step-select]");
    await restButton.click();
    await page.getByTestId("range-toolbar-explore").click();
    await expect(page.getByTestId("alternatives-tray")).toHaveCount(0);
    await expect(page.getByTestId("alternatives-status")).toContainText("needs a chord");
  });

  test("stays usable under 200 percent zoom", async ({ page }) => {
    await createProgression(page);
    await stepButton(page, 0).click();
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
      document.documentElement.dataset.theme = "light";
    });
    await page.getByTestId("matrix-explore-alternative").click();
    const tray = page.getByTestId("alternatives-tray");
    await expect(tray).toBeVisible();
    const box = await tray.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(1280);
    expect(box!.height).toBeLessThanOrEqual(720);
  });
});
