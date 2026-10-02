import { expect, test, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import { addRestToProgression } from "./test-helpers/progression-settings";

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function addRest(page: Page): Promise<void> {
  await addRestToProgression(page);
}

async function readProgressionIdentity(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="progression-step"]')
    .evaluateAll((steps) =>
      steps.map(
        (step) =>
          step.querySelector('[data-testid="step-function"]')?.textContent?.trim() ?? "Rest",
      ),
    );
}

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  await waitForStudio(page);
  await ensureHistoryControlsVisible(page);
});

test.describe("US10 — direct progression-step removal", () => {
  test("removing a chord preserves its Step as Rest and keeps Rest removal a history no-op", async ({
    page,
  }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    await addRest(page);
    await addChord(page, "IV");

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(4);
    for (const [index, label] of ["I", "vi", "Rest", "IV"].entries()) {
      const card = steps.nth(index);
      await expect(card.getByTestId("progression-step-remove")).toHaveAttribute(
        "aria-label",
        `Remove progression step ${index + 1}: ${label}`,
      );
      await expect(card.locator(".step-editor")).toHaveCount(0);
      await expect(card).not.toHaveAttribute("data-selected", "true");
    }

    await steps.nth(1).getByRole("button", { name: "Remove progression step 2: vi" }).click();
    await expect(steps).toHaveCount(4);
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "Rest", "IV"]);
    await expect(steps.nth(1).locator("[data-progression-step-select]")).toBeFocused();

    await page.keyboard.press("Control+z");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "Rest", "IV"]);
    await page.keyboard.press("Control+y");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "Rest", "IV"]);

    const noOpRest = steps.nth(1).getByRole("button", { name: "Remove progression step 2: Rest" });
    await noOpRest.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "Rest", "IV"]);
    await page.keyboard.press("Control+z");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "Rest", "IV"]);
  });

  test("Delete changes only the selected chord Harmony", async ({ page }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(2);
    const selected = steps.nth(1).locator("[data-progression-step-select]");
    await selected.click();
    await selected.focus();
    await page.keyboard.press("Delete");
    await expect(steps).toHaveCount(2);
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest"]);
    await expect(steps.nth(1).locator("[data-progression-step-select]")).toBeFocused();
    await page.keyboard.press("Control+z");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi"]);
    await page.keyboard.press("Control+y");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest"]);
  });

  test("clears Harmony on unselected or selected chords without moving the selected Step", async ({
    page,
  }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    await addChord(page, "IV");

    const steps = page.locator('[data-testid="progression-step"]');
    await steps.nth(1).getByRole("button", { name: "Select progression step 2: vi" }).click();
    await expect(steps.nth(1)).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Performance settings for step vi" }),
    ).toBeVisible();

    await steps.nth(0).getByRole("button", { name: "Remove progression step 1: I" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["Rest", "vi", "IV"]);
    await expect(steps.nth(1)).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Performance settings for step vi" }),
    ).toBeVisible();

    await steps.nth(2).getByRole("button", { name: "Remove progression step 3: IV" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["Rest", "vi", "Rest"]);
    await expect(steps.nth(1)).toHaveAttribute("data-selected", "true");

    await steps.nth(1).getByRole("button", { name: "Remove progression step 2: vi" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["Rest", "Rest", "Rest"]);
    await expect(steps).toHaveCount(3);
    await expect(page.locator(".step-editor")).toHaveCount(0);
  });

  test("Enter and Space each clear one chord into Rest through one history entry", async ({
    page,
  }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    await addChord(page, "IV");

    const steps = page.locator('[data-testid="progression-step"]');
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    const removeVi = () =>
      steps.nth(1).getByRole("button", { name: "Remove progression step 2: vi" });

    await (await removeVi()).focus();
    await page.keyboard.press("Enter");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "IV"]);
    await undo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "IV"]);
    await redo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "IV"]);
    await undo.click();

    await (await removeVi()).focus();
    await page.keyboard.press("Space");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "IV"]);
    await undo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "IV"]);
    await redo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "IV"]);
  });
});

async function expectRemoveButtonsFit(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="progression-step"]')];
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      cards: cards.map((card) => {
        const remove = card.querySelector<HTMLElement>('[data-testid="progression-step-remove"]');
        const text = card.querySelector<HTMLElement>(".step-view strong");
        if (!remove || !text) throw new Error("Progression card remove or text element is missing");
        const cardRect = card.getBoundingClientRect();
        const removeRect = remove.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        return {
          cardWidth: cardRect.width,
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          cardTop: cardRect.top,
          cardBottom: cardRect.bottom,
          measureWidth:
            card.closest<HTMLElement>(".progression-measure-grid")?.getBoundingClientRect().width ??
            cardRect.width,
          removeLeft: removeRect.left,
          removeRight: removeRect.right,
          removeTop: removeRect.top,
          removeBottom: removeRect.bottom,
          textLeft: textRect.left,
          textRight: textRect.right,
          textTop: textRect.top,
          textBottom: textRect.bottom,
        };
      }),
    };
  });

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  for (const card of metrics.cards) {
    expect(card.cardWidth).toBeGreaterThan(0);
    expect(card.cardWidth).toBeLessThanOrEqual(card.measureWidth + 1);
    expect(card.removeLeft).toBeGreaterThanOrEqual(card.cardLeft);
    expect(card.removeRight).toBeLessThanOrEqual(card.cardRight);
    expect(card.removeTop).toBeGreaterThanOrEqual(card.cardTop);
    expect(card.removeBottom).toBeLessThanOrEqual(card.cardBottom);
    expect(card.removeTop).toBeLessThan(card.cardTop + 32);
    const overlapsText =
      card.removeRight > card.textLeft &&
      card.removeLeft < card.textRight &&
      card.removeBottom > card.textTop &&
      card.removeTop < card.textBottom;
    expect(overlapsText).toBe(false);
  }
}

test.describe("US10 — direct removal desktop layout", () => {
  for (const viewport of [
    { name: "1280x720", width: 1280, height: 720 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test(viewport.name, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await addChord(page, "I");
      await addChord(page, "vi");
      await addRest(page);
      await expectRemoveButtonsFit(page);
      await expect(page.locator('[data-testid="progression-step-remove"]')).toHaveCount(3);
    });
  }
});
