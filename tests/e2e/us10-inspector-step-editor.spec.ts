import { expect, test, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .getByRole("button", { name: `Add ${functionId} to progression` })
    .click();
}

async function selectFirstStep(page: Page): Promise<void> {
  await page
    .locator('[data-testid="progression-step"]')
    .first()
    .getByRole("button", { name: /Select progression step 1:/ })
    .click();
  await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
}

async function readPageOverflow(page: Page) {
  return page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
  }));
}

async function makeInspectorDense(page: Page): Promise<void> {
  const perNote = page.locator("details.per-note-disclosure");
  await expect(perNote).toBeVisible();
  const isOpen = await perNote.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) await perNote.locator("summary").click();
  const overrides = page.getByRole("button", { name: /^Override velocity for / });
  const count = await overrides.count();
  for (let index = 0; index < count; index += 1) {
    await overrides.first().click();
  }
  await expect(page.locator(".status-badge.override")).toHaveCount(count);
}

test.describe("US10 Batch 3 — Inspector and Step Editor", () => {
  test("keeps neutral, Matrix template, preview, and selected-step ownership distinct", async ({
    page,
  }) => {
    await waitForStudio(page);
    await expect(page.locator('[data-context="neutral"]')).toBeVisible();
    await expect(page.getByTestId("step-performance-inspector")).toHaveCount(0);
    await expect(page.getByTestId("matrix-template-inspector")).toHaveCount(0);

    await addChord(page, "I");
    const matrixCard = page.getByTestId("chord-card-I");
    await matrixCard.getByRole("button", { name: "Settings for I" }).click();
    const template = page.getByTestId("matrix-template-inspector");
    await expect(template).toBeVisible();
    await expect(template).toContainText("Matrix preview template");
    await expect(template).toContainText("Inheriting defaults");
    await expect(template.getByRole("button", { name: "Reset Card to Defaults" })).toBeDisabled();

    await selectFirstStep(page);
    await expect(template).toHaveCount(0);
    await expect(page.getByTestId("step-performance-inspector")).toContainText("Selected step");
    await expect(page.getByTestId("step-performance-inspector")).toContainText(
      "Quick edits stay on the card",
    );

    await page
      .locator('[data-testid="progression-step"]')
      .first()
      .getByRole("button", { name: /Select progression step 1:/ })
      .click();
    await expect(page.getByTestId("step-performance-inspector")).toHaveCount(0);
  });

  test("uses non-mutating disclosures and exact inherited/override controls", async ({ page }) => {
    await waitForStudio(page);
    await addChord(page, "I");
    await selectFirstStep(page);

    const step = page.locator('[data-testid="progression-step"]').first();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const selectedBefore = await step.getAttribute("data-selected");
    const undoBefore = await undo.isEnabled();
    const perNote = page.locator("details.per-note-disclosure");
    await expect(perNote).toBeVisible();
    const openBefore = await perNote.evaluate((element) => (element as HTMLDetailsElement).open);
    await perNote.locator("summary").click();
    expect(await step.getAttribute("data-selected")).toBe(selectedBefore);
    expect(await undo.isEnabled()).toBe(undoBefore);
    if (openBefore) await perNote.locator("summary").click();

    const firstRow = page.locator(".per-note-velocity-row").first();
    await expect(firstRow).toContainText("Inherits Master");
    await firstRow.getByRole("button", { name: /^Override velocity for / }).click();
    await expect(firstRow.locator(".status-badge.override")).toContainText("Override:");
    await expect(
      firstRow.getByRole("button", { name: /Reset .* to inherit master velocity/ }),
    ).toBeVisible();
    await firstRow.getByRole("button", { name: /Reset .* to inherit master velocity/ }).click();
    await expect(firstRow.locator(".status-badge.inherit")).toContainText("Inherits Master");
  });

  test("keeps Matrix template reset separate from existing Step performance", async ({ page }) => {
    await waitForStudio(page);
    await addChord(page, "I");
    const matrixCard = page.getByTestId("chord-card-I");
    await matrixCard.getByRole("button", { name: "Settings for I" }).click();
    const template = page.getByTestId("matrix-template-inspector");
    await template.getByRole("combobox").first().selectOption("arp-up");
    await expect(template).toContainText("Customized · 1 overrides");
    await expect(template.getByRole("button", { name: "Reset Card to Defaults" })).toBeEnabled();

    await page
      .getByTestId("chord-card-I")
      .getByRole("button", { name: /Preview I/ })
      .click();
    await expect(page.getByTestId("matrix-template-inspector")).toHaveCount(0);

    await selectFirstStep(page);
    await expect(page.getByTestId("step-performance-inspector")).toContainText("Step Performance");
    await expect(page.getByRole("button", { name: "Reset Card to Defaults" })).toHaveCount(0);

    await page
      .getByTestId("chord-card-I")
      .getByRole("button", { name: /Preview I/ })
      .click();
    await page.getByTestId("chord-card-I").getByRole("button", { name: "Settings for I" }).click();
    await page
      .getByTestId("matrix-template-inspector")
      .getByRole("button", { name: "Reset Card to Defaults" })
      .click();
    await expect(page.getByTestId("matrix-template-inspector")).toContainText(
      "Inheriting defaults",
    );
  });

  test("keeps recommendation language semantic outside Expert mode", async ({ page }) => {
    await waitForStudio(page);
    await page
      .getByTestId("chord-card-I")
      .getByRole("button", { name: /Preview I/ })
      .click();
    const recommendation = page.locator('[data-context="recommendation"]');
    await expect(recommendation).toBeVisible();

    await page.getByRole("button", { name: "Beginner expertise mode" }).click();
    await expect(recommendation).not.toContainText("score");
    await page.getByRole("button", { name: "Composer expertise mode" }).click();
    await expect(recommendation).not.toContainText("score");
    await page.getByRole("button", { name: "Expert expertise mode" }).click();
    await expect(recommendation).toContainText("score");
  });

  test("gives the Manual Voicing dialog an initial focus, Escape close, and focus return", async ({
    page,
  }) => {
    await waitForStudio(page);
    await addChord(page, "I");
    await selectFirstStep(page);
    const openEditor = page.getByRole("button", { name: "Open Piano Voicing Editor" });
    await openEditor.click();
    const dialog = page.getByRole("dialog", { name: /Manual Piano Voicing Editor for I/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close editor" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(openEditor).toBeFocused();
  });

  for (const viewport of [
    { name: "1280x720", width: 1280, height: 720 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test.describe(`dense Inspector at ${viewport.name}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("reflows all per-note controls without horizontal page or Inspector overflow", async ({
        page,
      }) => {
        await waitForStudio(page);
        await addChord(page, "I");
        await selectFirstStep(page);
        await page.getByRole("button", { name: "Expert expertise mode" }).click();
        await makeInspectorDense(page);

        const metrics = await page.evaluate(() => {
          const stack = document.querySelector<HTMLElement>(".inspector-stack");
          const inspector = document.querySelector<HTMLElement>(".piano-performance-inspector");
          if (!stack || !inspector) throw new Error("Inspector is missing");
          return {
            stackScrollWidth: stack.scrollWidth,
            stackClientWidth: stack.clientWidth,
            inspectorScrollWidth: inspector.scrollWidth,
            inspectorClientWidth: inspector.clientWidth,
          };
        });
        expect(metrics.stackScrollWidth).toBeLessThanOrEqual(metrics.stackClientWidth);
        expect(metrics.inspectorScrollWidth).toBeLessThanOrEqual(metrics.inspectorClientWidth);

        const pageOverflow = await readPageOverflow(page);
        expect(pageOverflow.documentScrollWidth).toBeLessThanOrEqual(
          pageOverflow.documentClientWidth,
        );
        expect(pageOverflow.bodyScrollWidth).toBeLessThanOrEqual(pageOverflow.innerWidth);
        expect(pageOverflow.scrollX).toBe(0);
      });
    });
  }
});
