import { expect, test, type Page } from "@playwright/test";
import {
  ensureHistoryControlsVisible,
  ensurePreviewHarmonyVisible,
  ensureRecommendationContextVisible,
} from "./test-helpers/global-settings";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
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
    await ensureRecommendationContextVisible(page);
    await ensurePreviewHarmonyVisible(page);
    await expect(page.locator('[data-context="neutral"]')).toBeVisible();
    await expect(page.getByTestId("step-performance-inspector")).toHaveCount(0);
    await expect(page.getByTestId("matrix-template-inspector")).toHaveCount(0);

    await addChord(page, "I");
    const matrixCard = page.getByTestId("chord-card-I");
    await matrixCard.locator(".chord-main").click();
    const harmony = page.locator("details[data-context='preview-harmony']");
    await expect(harmony).toBeVisible();
    await expect(harmony).not.toHaveAttribute("open", "");
    await harmony.locator("summary").click();
    await expect(harmony).toHaveAttribute("open", "");
    const cardBox = await matrixCard.boundingBox();
    expect(cardBox).not.toBeNull();
    await matrixCard.click({ position: { x: 6, y: 6 } });
    const template = page.getByTestId("matrix-template-inspector");
    await expect(template).toBeVisible();
    await expect(template).toContainText("Matrix preview template");
    await expect(template).toContainText("Inheriting defaults");
    await expect(template.getByRole("button", { name: "Reset Card to Defaults" })).toBeDisabled();
    await expect(template.getByTestId("duration-preset-whole")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const selector of [
      "details.template-register-disclosure",
      "details.template-articulation-disclosure",
      "details.template-duration-disclosure",
      "details.template-velocity-disclosure",
    ]) {
      const disclosure = template.locator(selector);
      await expect(disclosure).toHaveAttribute("open", "");
      await disclosure.locator("summary").click();
      await expect(disclosure).not.toHaveAttribute("open", "");
      await disclosure.locator("summary").click();
      await expect(disclosure).toHaveAttribute("open", "");
    }

    await selectFirstStep(page);
    await expect(template).toHaveCount(0);
    await expect(page.getByTestId("step-performance-inspector")).toContainText("Selected step");
    await expect(page.getByTestId("step-performance-inspector")).toContainText(
      "All selected-step settings live here",
    );

    await page
      .locator('[data-testid="progression-step"]')
      .first()
      .getByRole("button", { name: /Select progression step 1:/ })
      .click();
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
  });

  test("uses non-mutating disclosures and exact inherited/override controls", async ({ page }) => {
    await waitForStudio(page);
    await ensureHistoryControlsVisible(page);
    await addChord(page, "I");
    await selectFirstStep(page);

    const step = page.locator('[data-testid="progression-step"]').first();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const selectedBefore = await step.getAttribute("data-selected");
    const undoBefore = await undo.isEnabled();
    for (const selector of [
      "details.register-disclosure",
      "details.articulation-disclosure",
      "details.duration-disclosure",
    ]) {
      const disclosure = page.locator(selector);
      await expect(disclosure).toHaveAttribute("open", "");
      await disclosure.locator("summary").click();
      await expect(disclosure).not.toHaveAttribute("open", "");
      await disclosure.locator("summary").click();
      await expect(disclosure).toHaveAttribute("open", "");
    }
    const voicing = page.locator("details.voicing-disclosure");
    await expect(voicing).toBeVisible();
    await expect(voicing).toHaveAttribute("open", "");
    await voicing.locator("summary").click();
    await expect(voicing).not.toHaveAttribute("open", "");

    const perNote = page.locator("details.per-note-disclosure");
    await expect(perNote).toBeVisible();
    const openBefore = await perNote.evaluate((element) => (element as HTMLDetailsElement).open);
    await perNote.locator("summary").click();
    expect(await step.getAttribute("data-selected")).toBe(selectedBefore);
    expect(await undo.isEnabled()).toBe(undoBefore);
    if (openBefore) await perNote.locator("summary").click();

    const bass = page.locator("details.bass-disclosure");
    await expect(bass).toBeVisible();
    await expect(bass).toHaveAttribute("open", "");
    await bass.locator("summary").click();
    await expect(bass).not.toHaveAttribute("open", "");

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
    await matrixCard.locator(".chord-main").click();
    const template = page.getByTestId("matrix-template-inspector");
    await template.getByRole("button", { name: "Articulation: Arp Up" }).click();
    await template.getByTestId("duration-preset-half").click();
    await expect(template).toContainText("Customized · 2 overrides");
    await expect(template).toContainText("duration");
    await expect(template.getByRole("button", { name: "Reset Card to Defaults" })).toBeEnabled();

    await page.getByTestId("chord-card-I").locator(".chord-main").click();
    await expect(page.getByTestId("matrix-template-inspector")).toBeVisible();

    await selectFirstStep(page);
    await expect(page.getByTestId("step-performance-inspector")).toContainText("Step Performance");
    await expect(page.getByRole("button", { name: "Reset Card to Defaults" })).toHaveCount(0);

    await page.getByTestId("chord-card-I").locator(".chord-main").click();
    await page
      .getByTestId("matrix-template-inspector")
      .getByRole("button", { name: "Reset Card to Defaults" })
      .click();
    await expect(page.getByTestId("matrix-template-inspector")).toContainText(
      "Inheriting defaults",
    );

    await template.getByRole("button", { name: "Articulation: Arp Up" }).click();
    const progressionCount = await page.locator('[data-testid="progression-step"]').count();
    await matrixCard.locator(".chord-main").click({ modifiers: ["Alt"] });
    await expect(template).toContainText("Inheriting defaults");
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(progressionCount);
  });

  test("keeps recommendation language semantic outside Expert mode", async ({ page }) => {
    await waitForStudio(page);
    await ensureRecommendationContextVisible(page);
    await page.getByTestId("chord-card-I").locator(".chord-main").click();
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
          const matrix = document.querySelector<HTMLElement>(".studio-matrix-area");
          const inspector = document.querySelector<HTMLElement>(".piano-performance-inspector");
          const progression = document.querySelector<HTMLElement>(".progression-strip");
          const selectedStep = document.querySelector<HTMLElement>(".selected-step-stack");
          if (!stack || !matrix || !inspector || !progression || !selectedStep) {
            throw new Error("Inspector or selected-step layout is missing");
          }
          const activeMeasure = document.querySelector<HTMLElement>(
            ".progression-measure-card[data-has-selected-step='true']",
          );
          const matrixRect = matrix.getBoundingClientRect();
          const progressionRect = progression.getBoundingClientRect();
          const selectedStepRect = selectedStep.getBoundingClientRect();
          const activeMeasureRect = activeMeasure?.getBoundingClientRect();
          return {
            stackScrollWidth: stack.scrollWidth,
            stackClientWidth: stack.clientWidth,
            inspectorScrollWidth: inspector.scrollWidth,
            inspectorClientWidth: inspector.clientWidth,
            matrixWidth: matrixRect.width,
            progressionWidth: progressionRect.width,
            progressionTop: progressionRect.top,
            activeMeasureTop: activeMeasureRect?.top ?? 0,
            selectedStepTop: selectedStepRect.top,
            progressionRight: progressionRect.right,
            selectedStepLeft: selectedStepRect.left,
          };
        });
        expect(metrics.stackScrollWidth).toBeLessThanOrEqual(metrics.stackClientWidth);
        expect(metrics.inspectorScrollWidth).toBeLessThanOrEqual(metrics.inspectorClientWidth);
        expect(Math.abs(metrics.matrixWidth - metrics.progressionWidth)).toBeLessThan(2);
        expect(Math.abs(metrics.activeMeasureTop - metrics.selectedStepTop)).toBeLessThan(2);
        expect(metrics.selectedStepLeft).toBeGreaterThanOrEqual(metrics.progressionRight - 1);

        const pageOverflow = await readPageOverflow(page);
        expect(pageOverflow.documentScrollWidth).toBeLessThanOrEqual(
          pageOverflow.documentClientWidth,
        );
        expect(pageOverflow.bodyScrollWidth).toBeLessThanOrEqual(pageOverflow.innerWidth);
        expect(pageOverflow.scrollX).toBe(0);
      });
    });
  }

  test("dynamically aligns Selected Step inspector vertically with active measure", async ({
    page,
  }) => {
    await waitForStudio(page);
    await addChord(page, "I");
    await addChord(page, "IV");
    await addChord(page, "V");

    const measures = page.getByTestId("progression-measure");
    await expect(measures).toHaveCount(3);

    const steps = page.getByTestId("progression-step");
    await expect(steps).toHaveCount(3);

    const getAlignment = async (measureIndex: number) => {
      return page.evaluate((mIdx) => {
        const selectedStack = document.querySelector<HTMLElement>(".selected-step-stack");
        const targetMeasure = document.querySelectorAll<HTMLElement>(".progression-measure-card")[mIdx];
        const strip = document.querySelector<HTMLElement>(".progression-strip");
        if (!selectedStack || !targetMeasure || !strip) throw new Error("Elements missing");
        const stackRect = selectedStack.getBoundingClientRect();
        const measureRect = targetMeasure.getBoundingClientRect();
        const stripRect = strip.getBoundingClientRect();
        const computed = window.getComputedStyle(selectedStack);
        return {
          diffTop: Math.abs(stackRect.top - measureRect.top),
          stripOffset: stackRect.top - stripRect.top,
          marginTopNumber: parseFloat(computed.marginTop) || 0,
        };
      }, measureIndex);
    };

    // 1. Select step in Measure 1 -> inspector aligns with Measure 1
    await steps.nth(0).getByRole("button", { name: /Select progression step/ }).click();
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await page.waitForTimeout(300);
    const align1 = await getAlignment(0);
    expect(align1.diffTop).toBeLessThanOrEqual(2);

    // 2. Select step in Measure 2 -> inspector tracks down to Measure 2
    await steps.nth(1).getByRole("button", { name: /Select progression step/ }).click();
    await page.waitForTimeout(300);
    const align2 = await getAlignment(1);
    expect(align2.diffTop).toBeLessThanOrEqual(2);
    expect(align2.stripOffset).toBeGreaterThan(align1.stripOffset + 40);

    // 3. Select step in Measure 3 -> inspector tracks down to Measure 3
    await steps.nth(2).getByRole("button", { name: /Select progression step/ }).click();
    await page.waitForTimeout(300);
    const align3 = await getAlignment(2);
    expect(align3.diffTop).toBeLessThanOrEqual(2);
    expect(align3.stripOffset).toBeGreaterThan(align2.stripOffset + 40);

    // 4. Select step back in Measure 1 -> inspector returns up to Measure 1
    await steps.nth(0).getByRole("button", { name: /Select progression step/ }).click();
    await page.waitForTimeout(300);
    const align1Return = await getAlignment(0);
    expect(align1Return.diffTop).toBeLessThanOrEqual(2);
    expect(Math.abs(align1Return.stripOffset - align1.stripOffset)).toBeLessThanOrEqual(2);
  });

  test("dismisses Matrix chord card selection via Escape key and empty background click", async ({
    page,
  }) => {
    await waitForStudio(page);

    const cardI = page.getByTestId("chord-card-I");
    const buttonI = cardI.locator(".chord-main");
    const templateInspector = page.getByTestId("matrix-template-inspector");

    // 1. Initially unselected
    await expect(cardI).not.toHaveClass(/is-selected/);
    await expect(templateInspector).not.toBeVisible();

    // 2. Select card I
    await buttonI.click();
    await expect(cardI).toHaveClass(/is-selected/);
    await expect(templateInspector).toBeVisible();

    // 3. Press Escape -> dismisses selection
    await page.keyboard.press("Escape");
    await expect(cardI).not.toHaveClass(/is-selected/);
    await expect(templateInspector).not.toBeVisible();

    // 4. Select card I again
    await buttonI.click();
    await expect(cardI).toHaveClass(/is-selected/);
    await expect(templateInspector).toBeVisible();

    // 5. Click on empty space in the matrix workbench -> dismisses selection
    await page.locator(".matrix-workbench").click({ position: { x: 5, y: 5 } });
    await expect(cardI).not.toHaveClass(/is-selected/);
    await expect(templateInspector).not.toBeVisible();
  });
});
