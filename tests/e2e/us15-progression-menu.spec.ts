import { expect, test } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

test("my progression header context menu: actions, melody contour/grid all, octave, and undo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

  const addChord = async (functionId: string) => {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  };

  // Build progression: I, IV, V, vi
  await addChord("I");
  await addChord("IV");
  await addChord("V");
  await addChord("vi");

  // Deselect any selected chord step so global inspector is shown
  await page.keyboard.press("Escape");

  // Switch to Staff view
  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.getByRole("button", { name: "Staff view" }).click();

  const heading = page.getByTestId("progression-heading");
  await expect(heading).toBeVisible();

  // Verify inactive branch controls and view strip controls are removed from visible UI
  await expect(page.locator(".branch-controls")).toHaveCount(0);
  await expect(page.getByLabel("Measures Layout")).toHaveCount(0);
  await expect(page.locator(".add-rest-btn")).toHaveCount(0);

  // 1. Right-click on My Progression title in header bar
  await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });

  const menu = page.getByTestId("progression-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("My Progression");
  await expect(menu).toContainText("4 measures · 4 steps");

  // Check expected menu items
  await expect(page.getByTestId("progression-menu-play-beginning")).toBeVisible();
  await expect(page.getByTestId("progression-menu-toggle-loop")).toBeVisible();
  await expect(page.getByTestId("progression-menu-octave-up")).toBeVisible();
  await expect(page.getByTestId("progression-menu-octave-down")).toBeVisible();
  await expect(page.getByTestId("progression-menu-reset-performance")).toBeVisible();
  await expect(page.getByTestId("progression-menu-open-articulation")).toBeVisible();
  await expect(page.getByTestId("progression-menu-open-melody")).toBeVisible();
  await expect(page.getByTestId("progression-menu-open-grid")).toBeVisible();
  await expect(page.getByTestId("progression-menu-open-layout")).toBeVisible();
  await expect(page.getByTestId("progression-menu-open-explore-alternative")).toBeVisible();
  await expect(page.getByTestId("progression-menu-duplicate-all")).toBeVisible();
  await expect(page.getByTestId("progression-menu-add-rest")).toBeVisible();
  await expect(page.getByTestId("progression-menu-clear-all")).toBeVisible();

  // Set Measures / system to 2 via context menu
  await page.getByTestId("progression-menu-open-layout").hover();
  await page.getByTestId("progression-menu-layout-2").click();

  const systems = page.locator('[data-testid="progression-score-system"]');
  await expect(systems).toHaveCount(2);

  // Test Explore Alternative submenu
  await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
  await page.getByTestId("progression-menu-open-explore-alternative").hover();
  const altSubmenu = page.getByTestId("progression-menu-explore-alternative-submenu");
  await expect(altSubmenu).toBeVisible();
  await expect(page.getByTestId("progression-menu-branch-end")).toBeVisible();
  await expect(page.getByTestId("progression-menu-branch-step-0")).toBeVisible();
  await page.keyboard.press("Escape");

  // 2. Apply Melody Contour to All -> Inside Out
  await page.getByTestId("progression-menu-open-melody").hover();
  const melodySubmenu = page.getByTestId("progression-menu-melody-submenu");
  await expect(melodySubmenu).toBeVisible();

  const insideOut = page.getByTestId("progression-menu-melody-inside-out");
  await expect(insideOut).toBeVisible();
  await insideOut.click();

  // Re-open menu and verify checkmark appears on Inside Out
  await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
  await page.getByTestId("progression-menu-open-melody").hover();
  await expect(
    page.getByTestId("progression-menu-melody-inside-out").locator(".score-system-menu-check"),
  ).toContainText("✓");

  // 3. Set Melody Grid for All -> Sixteenth note
  await page.getByTestId("progression-menu-open-grid").hover();
  const gridSubmenu = page.getByTestId("progression-menu-grid-submenu");
  await expect(gridSubmenu).toBeVisible();

  const sixteenth = page.getByTestId("progression-menu-grid-sixteenth");
  await expect(sixteenth).toBeVisible();
  await sixteenth.click();

  // Re-open menu and verify checkmark appears on Sixteenth note
  await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
  await page.getByTestId("progression-menu-open-grid").hover();
  await expect(
    page.getByTestId("progression-menu-grid-sixteenth").locator(".score-system-menu-check"),
  ).toContainText("✓");
  await page.keyboard.press("Escape");

  // 4. Test Undo via Ctrl+Z
  await ensureHistoryControlsVisible(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); // undo grid

  // Re-open menu and verify grid checkmark reverted
  await heading.getByRole("heading", { name: "My Progression" }).click({ button: "right" });
  await page.getByTestId("progression-menu-open-grid").hover();
  await expect(
    page.getByTestId("progression-menu-grid-eighth").locator(".score-system-menu-check"),
  ).toContainText("✓");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("progression-menu-grid-submenu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("progression-context-menu")).toHaveCount(0);

  // 5. Test right-clicking on empty track / canvas space
  const track = page.locator(".progression-track");
  await track.click({ button: "right", position: { x: 50, y: 15 } });
  await expect(page.getByTestId("progression-context-menu")).toBeVisible();
  await page.keyboard.press("Escape");
});
