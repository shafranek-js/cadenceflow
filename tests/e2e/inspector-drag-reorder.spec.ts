import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

async function openStudio(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
}

test.describe("Inspector Drag & Reorder", () => {
  test("reorders inspector sections with keyboard arrows, persists across reload, and resets", async ({
    page,
  }) => {
    await openStudio(page);

    const inspector = page.getByTestId("progression-global-inspector");
    await expect(inspector).toBeVisible();

    // Default first section is 'meter'
    const sectionItems = inspector.locator(".inspector-reorderable-section");
    await expect(sectionItems.first()).toHaveAttribute("data-section-id", "meter");

    // Reorder 'groove' section up using keyboard accessibility on drag handle
    const grooveHandle = inspector.getByRole("button", {
      name: "Reorder Groove & swing section",
    });
    await expect(grooveHandle).toBeVisible();

    await grooveHandle.focus();
    await page.keyboard.press("ArrowUp");

    // Verify 'groove' is now the first section
    await expect(sectionItems.first()).toHaveAttribute("data-section-id", "groove");
    await expect(sectionItems.nth(1)).toHaveAttribute("data-section-id", "meter");

    // The reset sections order button should now be visible in the inspector header
    const resetOrderBtn = page
      .getByTestId("progression-global-inspector")
      .locator(".reset-sections-order-btn");
    await expect(resetOrderBtn).toBeVisible();

    // Reload page to verify persistence in localStorage
    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    const reloadedItems = page
      .getByTestId("progression-global-inspector")
      .locator(".inspector-reorderable-section");
    await expect(reloadedItems.first()).toHaveAttribute("data-section-id", "groove");

    // Click reset sections order button
    const reloadedResetBtn = page
      .getByTestId("progression-global-inspector")
      .locator(".reset-sections-order-btn");
    await reloadedResetBtn.click();

    // Verify default order is restored ('meter' is first) and reset button is gone
    await expect(reloadedItems.first()).toHaveAttribute("data-section-id", "meter");
    await expect(reloadedResetBtn).toHaveCount(0);
  });

  test("reorders selected step inspector sections, persists across reload, and resets", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    });
    await openStudio(page);

    // Add a chord to progression
    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });

    // Select the chord in the progression track
    const steps = page.locator("[data-progression-step-select]");
    await expect(steps).toHaveCount(1);
    const stepId = await steps.first().getAttribute("data-step-id");
    expect(stepId).toBeTruthy();
    await steps.first().click();

    const inspector = page.getByTestId("step-performance-inspector");
    await expect(inspector).toBeVisible();

    const sectionItems = inspector.locator(".inspector-reorderable-section");
    const readSectionOrder = () =>
      sectionItems.evaluateAll((items) =>
        items
          .map((item) => item.getAttribute("data-section-id"))
          .filter((sectionId): sectionId is string => sectionId !== null),
      );
    const defaultOrder = await readSectionOrder();

    // Reorder 'articulation' section up using drag handle keyboard navigation
    const articulationHandle = inspector.getByRole("button", {
      name: "Reorder Articulation section",
    });
    await expect(articulationHandle).toBeVisible();

    const articulationIndex = defaultOrder.indexOf("articulation");
    expect(articulationIndex).toBeGreaterThan(0);
    const reorderedOrder = [...defaultOrder];
    const previousSection = reorderedOrder[articulationIndex - 1]!;
    reorderedOrder[articulationIndex - 1] = "articulation";
    reorderedOrder[articulationIndex] = previousSection;

    await articulationHandle.focus();
    await page.keyboard.press("ArrowUp");

    // Verify the section moved up exactly one position, regardless of the default order.
    await expect.poll(readSectionOrder).toEqual(reorderedOrder);

    // The reset sections order button should now be visible in the inspector header
    const resetOrderBtn = inspector.locator(".reset-sections-order-btn");
    await expect(resetOrderBtn).toBeVisible();

    await page.waitForFunction((expectedStepId) => {
      const state = (
        window as unknown as {
          __cadenceflow_persistence__?: {
            lastScheduledProjectSnapshot: string;
            lastCompletedProjectSnapshot: string;
          };
        }
      ).__cadenceflow_persistence__;
      if (
        !state ||
        !state.lastCompletedProjectSnapshot ||
        state.lastCompletedProjectSnapshot !== state.lastScheduledProjectSnapshot
      ) {
        return false;
      }
      try {
        const project = JSON.parse(state.lastCompletedProjectSnapshot) as {
          progression?: { steps?: Array<{ id?: string }> };
        };
        return project.progression?.steps?.some((step) => step.id === expectedStepId) ?? false;
      } catch {
        return false;
      }
    }, stepId);

    // Reload page to verify persistence in localStorage
    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    // Select the chord step again after reload
    const reloadedStep = page.locator(`[data-progression-step-select][data-step-id="${stepId}"]`);
    await expect(reloadedStep).toHaveCount(1);
    await reloadedStep.click();
    const reloadedInspector = page.getByTestId("step-performance-inspector");
    await expect(reloadedInspector).toBeVisible();

    const reloadedItems = reloadedInspector.locator(".inspector-reorderable-section");
    await expect
      .poll(() =>
        reloadedItems.evaluateAll((items) =>
          items
            .map((item) => item.getAttribute("data-section-id"))
            .filter((sectionId): sectionId is string => sectionId !== null),
        ),
      )
      .toEqual(reorderedOrder);

    // Click reset sections order button
    const reloadedResetBtn = reloadedInspector.locator(".reset-sections-order-btn");
    await reloadedResetBtn.click();

    // Verify reset restores the order observed before customization.
    await expect
      .poll(() =>
        reloadedItems.evaluateAll((items) =>
          items
            .map((item) => item.getAttribute("data-section-id"))
            .filter((sectionId): sectionId is string => sectionId !== null),
        ),
      )
      .toEqual(defaultOrder);
    await expect(reloadedResetBtn).toHaveCount(0);
  });
});
