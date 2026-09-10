import { expect, test, type Page } from "@playwright/test";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function setFirstDuration(page: Page, value: string): Promise<void> {
  const step = page.getByTestId("progression-step").first();
  await step.locator("[data-progression-step-select]").click();
  const presetId = value === "2/1" ? "duration-preset-half" : "duration-preset-quarter";
  await page.getByTestId("step-performance-inspector").getByTestId(presetId).click();
}

test.describe("US11 measure-card progression layout", () => {
  test("shows a proportional Half gap and fills it with an independent chord", async ({ page }) => {
    await openStudio(page);
    await addChord(page, "I");
    await setFirstDuration(page, "2/1");

    await expect(page.getByTestId("progression-measure")).toHaveCount(1);
    await expect(page.getByTestId("progression-measure-gap")).toContainText("2");
    await expect(
      page.getByTestId("progression-measure-gap").getByRole("button", { name: /Add chord/ }),
    ).toBeVisible();

    await addChord(page, "V");
    const steps = page.getByTestId("progression-step");
    await expect(steps).toHaveCount(2);
    await steps.nth(1).locator("[data-progression-step-select]").click();
    await page
      .getByTestId("step-performance-inspector")
      .getByTestId("duration-preset-half")
      .click();
    await expect(page.getByTestId("progression-measure")).toHaveCount(1);
    await expect(page.getByTestId("progression-measure-gap")).toHaveCount(0);

    await page.getByLabel("Progression Card View").selectOption("staff");
    await expect(page.getByTestId("measure-staff-view")).toHaveCount(1);
    await expect(page.locator(".progression-measure-grid .mini-staff")).toHaveCount(0);
    await expect(page.getByTestId("measure-staff-view").locator("svg")).toHaveCount(1);
  });

  test("provides Rest, Extend, and Repeat actions without hidden duplication", async ({ page }) => {
    await openStudio(page);
    await addChord(page, "I");
    await setFirstDuration(page, "2/1");
    const gap = page.getByTestId("progression-measure-gap");
    await expect(gap.getByRole("button", { name: /Fill measure/ })).toBeVisible();
    await expect(gap.getByRole("button", { name: /Extend chord/ })).toBeVisible();
    await expect(gap.getByRole("button", { name: /Repeat chord/ })).toBeVisible();

    await gap.getByRole("button", { name: /Repeat chord/ }).click();
    await expect(page.getByTestId("progression-step")).toHaveCount(2);
    await expect(page.getByTestId("progression-measure-gap")).toHaveCount(0);
  });

  test("fills the final gap with an explicit Rest or extends one chord to Full bar", async ({
    page,
  }) => {
    await openStudio(page);
    await addChord(page, "I");
    await setFirstDuration(page, "2/1");
    const gap = page.getByTestId("progression-measure-gap");

    await gap.getByRole("button", { name: /Fill measure/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("progression-step")).toHaveCount(2);
    await expect(page.getByTestId("progression-step").nth(1)).toContainText("Rest");
    await expect(page.getByTestId("progression-measure-gap")).toHaveCount(0);
  });

  test("supports keyboard gap actions, view switching, and meter-card semantics", async ({
    page,
  }) => {
    await openStudio(page);
    await addChord(page, "I");
    await setFirstDuration(page, "2/1");
    const gap = page.getByTestId("progression-measure-gap");
    await gap.getByRole("button", { name: /Extend chord/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("progression-measure-gap")).toHaveCount(0);
    await expect(page.getByTestId("duration-preset-full-bar")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByLabel("Progression Card View").selectOption("staff");
    await expect(page.locator('[data-testid="progression-step"] .mini-staff')).toHaveCount(1);
    await expect(page.getByTestId("progression-measure")).toHaveAttribute(
      "aria-label",
      "Measure 1, 4/4",
    );
  });
});
