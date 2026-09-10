import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function expectStaffGeometry(page: Page, staff: Locator): Promise<void> {
  await expect(staff).toBeVisible();
  await expect(staff).toHaveAttribute("role", "img");
  const svg = staff.locator("svg");
  await expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  await expect(svg.locator(".vf-clef")).toHaveCount(0);
  await expect(svg.locator(".vf-stave path")).toHaveCount(5);

  const geometry = await staff.evaluate((element) => {
    const svg = element.querySelector("svg");
    const stave = svg?.querySelector(".vf-stave");
    const note = svg?.querySelector(".vf-stavenote");
    if (!svg || !stave || !note) throw new Error("Staff SVG geometry is incomplete");
    const staffBox = (stave as SVGGElement).getBBox();
    const noteHeads = [...note.querySelectorAll<SVGGElement>(".vf-notehead")];
    if (noteHeads.length === 0) throw new Error("Staff noteheads are missing");
    const noteBox = noteHeads.reduce((bounds, head) => {
      const box = head.getBBox();
      const right = Math.max(bounds.x + bounds.width, box.x + box.width);
      const bottom = Math.max(bounds.y + bounds.height, box.y + box.height);
      const left = Math.min(bounds.x, box.x);
      const top = Math.min(bounds.y, box.y);
      return { x: left, y: top, width: right - left, height: bottom - top };
    }, noteHeads[0]!.getBBox());
    const viewBox = svg.viewBox.baseVal;
    return {
      background: getComputedStyle(element).backgroundColor,
      staffCenterX: staffBox.x + staffBox.width / 2,
      staffCenterY: staffBox.y + staffBox.height / 2,
      staffLeftGap: staffBox.x - viewBox.x,
      noteCenterX: noteBox.x + noteBox.width / 2,
      viewCenterX: viewBox.x + viewBox.width / 2,
      viewCenterY: viewBox.y + viewBox.height / 2,
      viewWidth: viewBox.width,
      viewHeight: viewBox.height,
      paperHeight: element.getBoundingClientRect().height,
      sourcePitches: svg.dataset.staffPitches,
    };
  });

  expect(geometry.background).toBe("rgb(255, 255, 255)");
  expect(Math.abs(geometry.staffCenterX - geometry.viewCenterX)).toBeLessThanOrEqual(3);
  expect(Math.abs(geometry.staffCenterY - geometry.viewCenterY)).toBeLessThanOrEqual(3);
  expect(Math.abs(geometry.staffLeftGap)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.noteCenterX - geometry.viewCenterX)).toBeLessThanOrEqual(4);
  expect(geometry.paperHeight).toBe(120);
  expect(geometry.sourcePitches).toMatch(/\d+/);
  expect(geometry.viewWidth).toBeGreaterThan(0);
  expect(geometry.viewHeight).toBeGreaterThan(0);
}

async function expectNoPageHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
  }));
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollX).toBe(0);
}

async function exerciseStaffView(page: Page): Promise<void> {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await waitForStudio(page);
  await page.getByLabel("Global Card View").selectOption("staff");
  const matrixStaff = page.getByTestId("chord-card-I").locator(".mini-staff");
  await expectStaffGeometry(page, matrixStaff);
  const paperHeights = await page
    .getByRole("region", { name: "Harmonic Matrix" })
    .locator(".mini-staff")
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(new Set(paperHeights)).toEqual(new Set([120]));
  await expect(matrixStaff.locator("svg")).toHaveAttribute("data-staff-pitches", "60,64,67");
  await expect(matrixStaff.locator("svg")).toHaveAttribute("data-staff-duration", "4/1");
  const tonicCard = page.getByTestId("chord-card-I");
  await expect(tonicCard.locator(".mini-staff-chord-name")).toHaveText("C");
  await expect(tonicCard.locator(".mini-staff-octave")).toHaveText("Oct 4");
  await expect(tonicCard.locator(".mini-staff-note-labels")).toHaveText("C4E4G4");

  await page.getByTestId("view-menu-toggle").click();
  const bassToggle = page.getByTestId("show-bass-in-staff");
  await expect(bassToggle).toHaveAttribute("aria-checked", "false");
  await bassToggle.click();
  await expect(matrixStaff.locator("svg")).toHaveAttribute("data-staff-pitches", "48,60,64,67");

  await tonicCard.getByRole("button", { name: "Raise C one octave" }).click();
  await expect(matrixStaff.locator("svg")).toHaveAttribute("data-staff-pitches", "48,72,76,79");
  await expect(tonicCard.locator(".mini-staff-octave")).toHaveText("Oct 5");
  await expect(tonicCard.locator(".mini-staff-note-labels")).toHaveText("C3C5E5G5");
  await tonicCard.getByRole("button", { name: "Lower C one octave" }).click();
  await expect(matrixStaff.locator("svg")).toHaveAttribute("data-staff-pitches", "48,60,64,67");

  await tonicCard.locator(".staff-card-preview-button").click({ modifiers: ["Control"] });
  await page.getByLabel("Progression Card View").selectOption("staff");
  const progressionStaff = page.locator('[data-testid="progression-step"] .mini-staff');
  await expectStaffGeometry(page, progressionStaff);
  await expect(progressionStaff.locator("svg")).toHaveAttribute(
    "data-staff-pitches",
    "48,60,64,67",
  );

  await page.getByTestId("view-menu-toggle").click();
  await expect(page.getByTestId("show-bass-in-staff")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("show-bass-in-staff").click();
  await expect(matrixStaff.locator("svg")).toHaveAttribute("data-staff-pitches", "60,64,67");
  await expect(progressionStaff.locator("svg")).toHaveAttribute("data-staff-pitches", "60,64,67");

  for (const [theme, button] of [
    ["light", "Light theme"],
    ["dark", "Dark theme"],
  ] as const) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expectStaffGeometry(page, matrixStaff);
    await expectStaffGeometry(page, progressionStaff);
  }

  await expectNoPageHorizontalScroll(page);
  expect(browserErrors).toEqual([]);
}

test.describe("Staff View at 1280×720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("renders Matrix and My Progression staff in both themes", async ({ page }) => {
    await exerciseStaffView(page);
  });
});

test.describe("Staff View at 1920×1080", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("renders Matrix and My Progression staff in both themes", async ({ page }) => {
    await exerciseStaffView(page);
  });
});
