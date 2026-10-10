import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

const evidenceRoot =
  process.env.CADENCEFLOW_T216_EVIDENCE_ROOT ??
  "C:/Users/pavel/.codex/visualizations/2026/10/08/01a11c9e-d5d9-77e1-aca6-15e531bf3895";

test("Harmonic roles color guide is compact, accessible and viewport-safe", async ({ page }) => {
  mkdirSync(evidenceRoot, { recursive: true });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("guided-start")).toBeVisible();
  await setProgressionView(page, "staff");
  await page.getByTestId("guided-start-guided").click();
  await expect(page.getByTestId("guided-start-flow")).toBeVisible();
  const firstCard = page.getByTestId("chord-card-I").locator(".chord-main");
  await firstCard.click();
  await page.getByTestId("guided-start-guided-back").click();
  await firstCard.click({ modifiers: ["Control"] });
  await expect(page.locator(".measure-staff-event-select")).toHaveCount(1);
  await expect(page.getByTestId("guided-start")).toHaveCount(0);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  const toolbar = page.getByTestId("piano-roll-toolbar");
  await expect(toolbar).toBeVisible();
  await page.setViewportSize({ width: 640, height: 360 });
  const noteColors = toolbar.getByLabel("Piano Roll note colors");
  const projectNoteColors = page.getByTestId("note-color-mode");
  const helpButton = page.getByTestId("piano-roll-harmonic-role-help-button");
  await projectNoteColors.selectOption("standard");
  await noteColors.selectOption("project");
  await expect(helpButton).toHaveCount(0);
  await projectNoteColors.selectOption("harmonic-role");
  await expect(helpButton).toHaveAttribute("aria-expanded", "false");
  const legend = page.getByTestId("piano-roll-harmonic-role-help");
  await expect(legend).toBeHidden();

  await helpButton.focus();
  await page.keyboard.press("Enter");
  await expect(legend).toBeVisible();
  await expect(legend).toContainText("Red:");
  await expect(legend).toContainText("current chord root");
  await expect(legend).toContainText("Blue:");
  await expect(legend).toContainText("other tones in the current chord");
  await expect(legend).toContainText("Green:");
  await expect(legend).toContainText("current-scale tones outside the chord");
  await expect(legend).toContainText("Purple:");
  await expect(legend).toContainText("outside both the chord and scale");
  await expect(legend).toContainText("same pitch can change color as the harmony changes");
  await expect(helpButton).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(legend).toBeHidden();
  await expect(helpButton).toHaveAttribute("aria-expanded", "false");
  await expect(helpButton).toBeFocused();
  await expect(legend).toBeHidden();

  for (const theme of ["Light theme", "Dark theme"] as const) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    await helpButton.click();
    await expect(legend).toBeVisible();
    const themeName = theme === "Light theme" ? "light" : "dark";
    await page.screenshot({
      path: `${evidenceRoot}/t216-harmonic-role-${themeName}-640x360.png`,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(legend).toBeInViewport();
    const bounds = await legend.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        background: getComputedStyle(element).backgroundColor,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
    expect(bounds.background).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({
      path: `${evidenceRoot}/t216-harmonic-role-${themeName}-390x844.png`,
    });
    await toolbar.getByRole("button", { name: "Guides" }).click();
    await expect(legend).toBeHidden();
    await expect(helpButton).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 640, height: 360 });
  }

  await noteColors.selectOption("standard");
  await expect(helpButton).toHaveCount(0);
  await expect(legend).toHaveCount(0);
});
