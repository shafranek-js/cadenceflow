import { expect, test, type Page } from "@playwright/test";

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
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
    await expect(page.getByTestId("progression-score-system")).toHaveCount(1);
    await expect(page.locator(".progression-measure-grid .mini-staff")).toHaveCount(0);
    const staff = page.getByTestId("progression-score-system");
    const svg = staff.locator(".measure-staff > svg");
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute("data-staff-system-clefs", "treble");
    await expect(svg).toHaveAttribute("data-staff-meter", "4/4");
    await expect(svg.locator(".vf-clef")).toHaveCount(1);
    await expect(svg.locator(".vf-timesignature")).toHaveCount(1);

    const attackRatios = await svg.evaluate((element) =>
      (element.getAttribute("data-staff-sequence-positions") ?? "")
        .split(",")
        .filter(Boolean)
        .map((entry) => Number(entry.split(":").at(-1))),
    );
    expect(attackRatios).toHaveLength(2);
    expect(attackRatios[1]).toBeGreaterThan(attackRatios[0]!);
    const compactStripHeight = await page
      .getByTestId("progression-measure-grid")
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(compactStripHeight).toBeLessThanOrEqual(74);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);

    const controls = page
      .getByRole("region", { name: "My Progression" })
      .getByRole("group", { name: "Progression playback controls" });
    await controls.getByRole("button", { name: "Play", exact: true }).click();
    await expect(svg).not.toHaveAttribute("data-staff-playing-entries", "");
    await expect
      .poll(() =>
        svg
          .locator(".vf-stavenote")
          .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fill)),
      )
      .toContain("rgb(138, 87, 50)");
    await controls.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(svg).toHaveAttribute("data-staff-playing-entries", "");
  });

  test("shows an aligned bass stave only when the View setting is enabled", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await page.getByLabel("Progression Card View").selectOption("staff");

    const svg = page.getByTestId("progression-score-system").locator(".measure-staff > svg");
    await expect(svg).toHaveAttribute("data-staff-system-clefs", "treble");
    await page.getByTestId("view-menu-toggle").click();
    await page.getByTestId("show-bass-in-staff").click();

    await expect(svg).toHaveAttribute("data-staff-system-clefs", "treble,bass");
    await expect(svg.locator(".vf-clef")).toHaveCount(2);
    await expect(svg.locator(".vf-timesignature")).toHaveCount(2);
    await expect(svg).not.toHaveAttribute("data-staff-bass-entries", "");
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
    await expect(page.getByTestId("progression-score-system")).toHaveCount(1);
    await expect(page.locator('[data-testid="progression-step"] .mini-staff')).toHaveCount(0);
    await expect(page.getByTestId("progression-measure")).toHaveAttribute(
      "aria-label",
      "Measure 1, 4/4",
    );
  });
});
