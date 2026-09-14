import { expect, type Locator, type Page } from "@playwright/test";

/** Opens the current owner of global progression controls and returns its Melody controls. */
export async function ensureMelodyTrackControlsVisible(page: Page): Promise<Locator> {
  const selectedInspector = page.getByTestId("step-performance-inspector");
  if (await selectedInspector.isVisible().catch(() => false)) {
    const settings = selectedInspector.getByTestId("selected-progression-settings");
    if (!(await settings.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await settings.locator(":scope > summary").click();
    }
    const controls = settings.getByRole("region", { name: "Melody Track controls" });
    await expect(controls).toBeVisible();
    return controls;
  }

  const globalInspector = page.getByTestId("progression-global-inspector");
  await expect(globalInspector).toBeVisible();
  const tracks = globalInspector.locator(".global-tracks-disclosure");
  if (!(await tracks.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await tracks.locator(":scope > summary").click();
  }
  const controls = tracks.getByRole("region", { name: "Melody Track controls" });
  await expect(controls).toBeVisible();
  return controls;
}

/** Opens the selected-step disclosure that owns meter, groove, and loop controls. */
export async function ensureSelectedProgressionSettingsVisible(page: Page): Promise<Locator> {
  const inspector = page.getByTestId("step-performance-inspector");
  await expect(inspector).toBeVisible();
  const settings = inspector.getByTestId("selected-progression-settings");
  await expect(settings).toBeVisible();
  if (!(await settings.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await settings.locator(":scope > summary").click();
  }
  await expect(settings).toHaveAttribute("open", "");
  return settings;
}

/** Sets measures per system via the My Progression header context menu. */
export async function setLayoutMeasuresPerSystem(
  page: Page,
  count: 1 | 2 | 3 | 4 | "auto",
): Promise<void> {
  const heading = page.getByTestId("progression-heading");
  await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
  await page.getByTestId("progression-menu-open-layout").hover();
  await page.getByTestId(`progression-menu-layout-${count}`).click();
}

/** Adds a rest to the end of the progression via the My Progression context menu. */
export async function addRestToProgression(page: Page): Promise<void> {
  const heading = page.getByTestId("progression-heading");
  await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
  await page.getByTestId("progression-menu-add-rest").click();
}

