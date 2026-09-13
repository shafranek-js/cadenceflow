import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

test("score system context menu playback, loop, mute, solo actions", async ({ page }) => {
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

  // Switch to Staff view and 2 measures per system
  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.getByRole("button", { name: "Staff view" }).click();
  await page.getByLabel("Measures Layout").selectOption("2");

  const systems = page.locator('[data-testid="progression-score-system"]');
  await expect(systems).toHaveCount(2);

  // 1. Check Menu Items presence
  const header0 = page.locator(".score-system-header").first();
  await header0.click({ button: "right" });

  const menu = page.getByTestId("score-system-context-menu");
  await expect(menu).toBeVisible();

  await expect(menu.getByRole("menuitem", { name: "Loop System" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Play from this System" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Mute System" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Solo System" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Move System Down" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Move System Up" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Insert Empty System After" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy System" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Octave Up (+1 8va)" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Octave Down (-1 8vb)" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Reset Performance & Voicings" })).toBeVisible();

  // 2. Test Mute System
  await menu.getByRole("menuitem", { name: "Mute System" }).click();
  await expect(menu).toHaveCount(0);
  await expect(header0.locator(".score-system-status-tag.muted")).toBeVisible();
  await expect(systems.first()).toHaveClass(/is-muted/);

  // Unmute System
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unmute System" }).click();
  await expect(header0.locator(".score-system-status-tag.muted")).toHaveCount(0);
  await expect(systems.first()).not.toHaveClass(/is-muted/);

  // 3. Test Solo System
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Solo System" }).click();
  await expect(header0.locator(".score-system-status-tag.solo")).toBeVisible();
  // System 2 should be muted when System 1 is solo
  await expect(systems.nth(1)).toHaveClass(/is-muted/);

  // Toggle Solo off
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unsolo System" }).click();
  await expect(header0.locator(".score-system-status-tag.solo")).toHaveCount(0);
  await expect(systems.nth(1)).not.toHaveClass(/is-muted/);

  // 4. Test Loop System
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Loop System" }).click();
  await expect(header0.locator(".score-system-status-tag.loop")).toBeVisible();
});

test("score system context menu structure actions: move, copy/paste, insert empty", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

  const addChord = async (functionId: string) => {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  };

  await addChord("I");
  await addChord("IV");
  await addChord("V");
  await addChord("vi");

  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.getByRole("button", { name: "Staff view" }).click();
  await page.getByLabel("Measures Layout").selectOption("2");

  const systems = page.locator('[data-testid="progression-score-system"]');
  await expect(systems).toHaveCount(2);

  // 1. Move Down System 1
  const header0 = page.locator(".score-system-header").first();
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move System Down" }).click();

  // Undo move
  await page.keyboard.press("Control+z");

  // 2. Insert Empty System After
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert Empty System After" }).click();
  await expect(systems).toHaveCount(3);

  // Undo insert
  await page.keyboard.press("Control+z");
  await expect(systems).toHaveCount(2);

  // Redo insert
  await page.keyboard.press("Control+y");
  await expect(systems).toHaveCount(3);

  // Undo back
  await page.keyboard.press("Control+z");
  await expect(systems).toHaveCount(2);

  // 3. Copy & Paste System
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy System" }).click();

  const header1 = page.locator(".score-system-header").nth(1);
  await header1.click({ button: "right" });
  const pasteItem = page.getByRole("menuitem", { name: "Paste System After" });
  await expect(pasteItem).toBeEnabled();
  await pasteItem.click();

  await expect(systems).toHaveCount(3);

  // Undo paste
  await page.keyboard.press("Control+z");
  await expect(systems).toHaveCount(2);
});

test("score system context menu pitch, performance and submenus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

  const addChord = async (functionId: string) => {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  };

  await addChord("I");
  await addChord("IV");
  await addChord("V");
  await addChord("vi");

  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.getByRole("button", { name: "Staff view" }).click();
  await page.getByLabel("Measures Layout").selectOption("2");

  const header0 = page.locator(".score-system-header").first();

  // 1. Octave Up
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Octave Up (+1 8va)" }).click();

  // Undo Octave Up
  await page.keyboard.press("Control+z");

  // 2. Open Submenu: Set Articulation -> Arpeggiate Up
  await header0.click({ button: "right" });
  const artItem = page.getByRole("menuitem", { name: /Set Articulation/ });
  await artItem.hover();
  const arpUp = page.getByRole("menuitem", { name: "Arpeggiate Up" });
  await expect(arpUp).toBeVisible();
  await arpUp.click();

  // Undo articulation
  await page.keyboard.press("Control+z");

  // 3. Open Submenu: Apply Melody Contour -> Ascending (1/8)
  await header0.click({ button: "right" });
  const melodyItem = page.getByRole("menuitem", { name: /Apply Melody Contour/ });
  await melodyItem.hover();
  const asc8th = page.getByRole("menuitem", { name: "Ascending (1/8)" });
  await expect(asc8th).toBeVisible();
  await asc8th.click();

  // Now Clear Melody should be enabled
  await header0.click({ button: "right" });
  const clearMelody = page.getByRole("menuitem", { name: "Clear Melody" });
  await expect(clearMelody).toBeEnabled();
  await clearMelody.click();

  // Undo clear melody
  await page.keyboard.press("Control+z");
});
