import { expect, test, type Page } from "@playwright/test";

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .getByRole("button", { name: new RegExp(`Add ${functionId} to progression`, "i") })
    .click();
}

async function addRest(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add Rest to progression" }).click();
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
});

test.describe("US10 — direct progression-step removal", () => {
  test("exposes ChordStep and RestStep remove buttons and preserves Undo/Redo order", async ({
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
        label === "Rest" ? "Remove Rest step" : `Remove progression step ${label}`,
      );
      await expect(card.locator(".step-editor")).toHaveCount(0);
      await expect(card).not.toHaveAttribute("data-selected", "true");
    }

    await steps.nth(1).getByRole("button", { name: "Remove progression step vi" }).click();
    await expect(steps).toHaveCount(3);
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "IV"]);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "Rest", "IV"]);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "IV"]);

    await steps.nth(1).getByRole("button", { name: "Remove Rest step" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "IV"]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "IV"]);
  });

  test("removes an unselected step without changing selected-step or Inspector state", async ({
    page,
  }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    await addChord(page, "IV");

    const steps = page.locator('[data-testid="progression-step"]');
    await steps.nth(1).getByRole("button", { name: "Select progression step vi" }).click();
    await expect(steps.nth(1)).toHaveAttribute("data-selected", "true");
    await expect(steps.nth(1).locator(".step-editor")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Performance settings for step vi" }),
    ).toBeVisible();

    await steps.nth(0).getByRole("button", { name: "Remove progression step I" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["vi", "IV"]);
    await expect(steps.first()).toHaveAttribute("data-selected", "true");
    await expect(steps.first().locator(".step-editor")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Performance settings for step vi" }),
    ).toBeVisible();

    await steps.nth(1).getByRole("button", { name: "Remove progression step IV" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["vi"]);
    await expect(steps.first()).toHaveAttribute("data-selected", "true");

    await steps.first().getByRole("button", { name: "Remove progression step vi" }).click();
    await expect(steps).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Performance settings for step vi" }),
    ).toHaveCount(0);
    await expect(page.locator(".step-editor")).toHaveCount(0);
  });

  test("Enter and Space each remove exactly one step through one history entry", async ({
    page,
  }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    await addChord(page, "IV");

    const steps = page.locator('[data-testid="progression-step"]');
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    const removeVi = () => steps.nth(1).getByRole("button", { name: "Remove progression step vi" });

    await (await removeVi()).focus();
    await page.keyboard.press("Enter");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "IV"]);
    await undo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "IV"]);
    await redo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "IV"]);
    await undo.click();

    await (await removeVi()).focus();
    await page.keyboard.press("Space");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "IV"]);
    await undo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "IV"]);
    await redo.click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "IV"]);
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
    expect(card.cardWidth).toBeGreaterThanOrEqual(160);
    expect(card.cardWidth).toBeLessThanOrEqual(180);
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
