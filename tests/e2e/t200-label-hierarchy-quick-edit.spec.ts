import { expect, test, type Page } from "@playwright/test";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

async function addChord(page: Page, functionId: string) {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

test.describe("T200 — label hierarchy and compact quick edit", () => {
  test("keeps three label modes consistent across Progression views", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("progression-view-btn-tablature").click();
    await expect(page.getByTestId("label-hierarchy-control")).toBeVisible();
    await addChord(page, "I");

    await page.getByTestId("progression-view-btn-piano-roll").click();
    const cardLabel = page.locator('.piano-roll-chord [data-testid="progression-chord-label"]');
    for (const [testId, expected] of [
      ["label-hierarchy-function-first", "I"],
      ["label-hierarchy-chord-first", "C"],
      ["label-hierarchy-inline", "C (I)"],
    ] as const) {
      await page.getByTestId(testId).click();
      await expect(cardLabel).toHaveAttribute(
        "data-label-mode",
        testId.replace("label-hierarchy-", ""),
      );
      if (testId === "label-hierarchy-inline") {
        await expect(cardLabel.locator(".progression-chord-label-chord")).toHaveText("C");
        await expect(cardLabel.locator(".progression-chord-label-function")).toHaveText("(I)");
      } else {
        await expect(cardLabel).toContainText(expected);
      }
    }

    await page.getByTestId("progression-view-btn-tablature").click();
    await expect(page.locator(".measure-staff-event-select").first()).toContainText("C (I)");

    await page.getByTestId("progression-view-btn-staff").click();
    await expect(page.locator(".measure-staff-event-select").first()).toContainText("C (I)");
    await page.getByTestId("progression-view-btn-tablature").click();
    await expect(page.locator(".measure-staff-event-select").first()).toContainText("C (I)");
  });

  test("edits one selected Chord Step through canonical routes and opens the existing Inspector", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("progression-view-btn-tablature").click();
    await addChord(page, "I");

    const stepButton = page.locator("[data-progression-step-select]").first();
    const stepId = await stepButton.getAttribute("data-step-id");
    expect(stepId).toBeTruthy();
    await stepButton.click();

    const quickEdit = page.getByTestId("progression-quick-edit");
    await expect(quickEdit).toHaveAttribute("data-step-id", stepId!);
    await quickEdit.getByTestId("quick-edit-chord-label").selectOption("V");
    await expect(quickEdit).toHaveAttribute("data-step-id", stepId!);
    await expect(
      page.locator(`[data-progression-step-select][data-step-id="${stepId}"]`),
    ).toHaveCount(1);

    await quickEdit.getByTestId("quick-edit-duration").selectOption("1/2");
    await quickEdit.getByTestId("quick-edit-inversion").selectOption("1");
    await quickEdit.getByTestId("quick-edit-dynamics").selectOption("ff");
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();

    await quickEdit.getByTestId("progression-quick-edit-more").click();
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await expect(page.getByTestId("step-performance-inspector")).toHaveAttribute(
      "aria-label",
      /Performance settings for step V/,
    );

    await page.getByTestId("edit-menu-toggle").click();
    await page
      .getByRole("menu", { name: "Edit menu" })
      .getByRole("menuitem", { name: "Undo" })
      .click();
    await expect(
      page.locator(`[data-progression-step-select][data-step-id="${stepId}"]`),
    ).toHaveCount(1);
    await page.getByTestId("edit-menu-toggle").click();
    await page
      .getByRole("menu", { name: "Edit menu" })
      .getByRole("menuitem", { name: "Redo" })
      .click();
    await expect(
      page.locator(`[data-progression-step-select][data-step-id="${stepId}"]`),
    ).toHaveCount(1);
  });

  test("keeps Quick Edit with the active system across multiple systems and presentation pressure", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("progression-view-btn-tablature").click();

    for (const functionId of ["I", "V", "IV", "I", "V", "IV", "I", "V", "IV", "I"]) {
      await addChord(page, functionId);
    }
    await page.getByLabel("Progression Card View").selectOption("staff");
    await setLayoutMeasuresPerSystem(page, 2);

    const score = page.getByTestId("progression-score-systems");
    await expect(score.locator(".score-system")).toHaveCount(5);

    const firstStep = page.locator("[data-progression-step-select]").first();
    const firstStepId = await firstStep.getAttribute("data-step-id");
    expect(firstStepId).toBeTruthy();
    await firstStep.click();

    const quickEdit = page.getByTestId("progression-quick-edit");
    const theme = page.getByRole("group", { name: "Theme" });
    for (const [themeName, zoom] of [
      ["Dark theme", 1],
      ["Light theme", 1],
      ["Dark theme", 2],
      ["Light theme", 2],
    ] as const) {
      await theme.getByRole("button", { name: themeName, exact: true }).click();
      await page.evaluate((value) => {
        document.documentElement.style.zoom = String(value);
        window.dispatchEvent(new Event("resize"));
      }, zoom);
      await firstStep.scrollIntoViewIfNeeded();
      await expect(quickEdit).toHaveAttribute("data-step-id", firstStepId!);
      const geometry = await page.evaluate((stepId) => {
        const selected = document.querySelector<HTMLElement>(
          `[data-progression-step-select][data-step-id="${stepId}"]`,
        );
        const system = selected?.closest<HTMLElement>(".score-system");
        const quick = document.querySelector<HTMLElement>('[data-testid="progression-quick-edit"]');
        if (!selected || !system || !quick) throw new Error("T200 geometry targets are missing");
        const selectedRect = selected.getBoundingClientRect();
        const systemRect = system.getBoundingClientRect();
        const quickRect = quick.getBoundingClientRect();
        return {
          selectedTop: selectedRect.top,
          selectedBottom: selectedRect.bottom,
          systemTop: systemRect.top,
          systemBottom: systemRect.bottom,
          quickTop: quickRect.top,
          quickBottom: quickRect.bottom,
          systemIndex: system.dataset.systemIndex,
          viewportHeight: window.innerHeight,
          scrollY: window.scrollY,
        };
      }, firstStepId);
      expect(geometry.systemIndex).toBe("0");
      expect(geometry.quickTop).toBeGreaterThanOrEqual(geometry.systemTop - 12);
      expect(geometry.quickTop).toBeLessThanOrEqual(geometry.systemBottom + 12);
      expect(geometry.selectedBottom).toBeGreaterThan(0);
      expect(geometry.selectedTop).toBeLessThan(geometry.viewportHeight);
      expect(geometry.quickBottom).toBeGreaterThan(0);
      expect(geometry.quickTop).toBeLessThan(geometry.viewportHeight);
      expect(geometry.quickBottom).toBeGreaterThan(geometry.quickTop);
    }
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
  });
});
