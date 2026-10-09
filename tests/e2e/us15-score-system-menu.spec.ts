import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decodePortableProject } from "../../src/persistence/portableProject";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

async function exportPortableProject(page: import("@playwright/test").Page) {
  const toggle = page.getByTestId("export-menu-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  const downloadPromise = page.waitForEvent("download");
  await toggle.click();
  const menu = page.getByRole("menu", { name: "Export menu" });
  await expect(menu).toBeVisible();
  await menu.getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const file = await download.path();
  if (!file) throw new Error("Portable Project export did not provide a local file");
  return decodePortableProject(await readFile(file, "utf8"));
}

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
  await setLayoutMeasuresPerSystem(page, 2);

  const systems = page.locator('[data-testid="progression-score-system"]');
  await expect(systems).toHaveCount(2);

  // 1. Check Menu Items presence
  const header0 = page.locator(".score-system-header").first();
  await header0.click({ button: "right" });

  const menu = page.getByTestId("score-system-context-menu");
  await expect(menu).toBeVisible();

  await expect(menu.getByRole("menuitem", { name: "Loop System" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Play from this System" })).toBeVisible();
  await expect(page.getByTestId("score-system-insert-rest")).toBeVisible();
  await expect(page.getByTestId("score-system-explore-alternative")).toBeVisible();
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

test("score system context menu structure actions: move, copy/paste, insert empty", async ({
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

  await addChord("I");
  await addChord("IV");
  await addChord("V");
  await addChord("vi");

  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.getByRole("button", { name: "Staff view" }).click();
  await setLayoutMeasuresPerSystem(page, 2);

  const systems = page.locator('[data-testid="progression-score-system"]');
  await expect(systems).toHaveCount(2);
  const readStepIds = () =>
    page
      .locator(".measure-staff-event-select")
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));
  const originalStepIds = await readStepIds();
  expect(originalStepIds).toHaveLength(4);
  const beforeMove = await exportPortableProject(page);

  // 1. Move Down System 1
  const header0 = page.locator(".score-system-header").first();
  await header0.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Move System Up" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Move System Down" }).click();
  await expect
    .poll(readStepIds)
    .toEqual([...originalStepIds.slice(2), ...originalStepIds.slice(0, 2)]);
  const afterMove = await exportPortableProject(page);
  expect(afterMove.progression.steps).toEqual([
    ...beforeMove.progression.steps.slice(2),
    ...beforeMove.progression.steps.slice(0, 2),
  ]);

  // Undo move
  await page.keyboard.press("Control+z");
  await expect.poll(readStepIds).toEqual(originalStepIds);
  expect((await exportPortableProject(page)).progression).toEqual(beforeMove.progression);

  // 2. Insert Empty System After
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Insert Empty System After" }).click();
  await expect(systems).toHaveCount(3);
  await expect(page.locator(".measure-staff-event.is-rest")).toHaveCount(2);
  const insertedRestIds = await page
    .locator(".measure-staff-event.is-rest .measure-staff-event-select")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-step-id")));
  expect(insertedRestIds).toHaveLength(2);
  await expect
    .poll(readStepIds)
    .toEqual([...originalStepIds.slice(0, 2), ...insertedRestIds, ...originalStepIds.slice(2)]);
  const afterInsert = await exportPortableProject(page);
  const insertedRestSteps = afterInsert.progression.steps.filter((step) =>
    insertedRestIds.includes(step.id),
  );
  expect(insertedRestSteps).toHaveLength(2);
  expect(
    insertedRestSteps.map((step) => (step.kind === "rest" ? step.duration.beats : undefined)),
  ).toEqual([
    { numerator: 4, denominator: 1 },
    { numerator: 4, denominator: 1 },
  ]);

  // Undo insert
  await page.keyboard.press("Control+z");
  await expect(systems).toHaveCount(2);
  await expect.poll(readStepIds).toEqual(originalStepIds);
  expect((await exportPortableProject(page)).progression).toEqual(beforeMove.progression);

  // Redo insert
  await page.keyboard.press("Control+y");
  await expect(systems).toHaveCount(3);
  await expect(page.locator(".measure-staff-event.is-rest")).toHaveCount(2);
  await expect
    .poll(readStepIds)
    .toEqual([...originalStepIds.slice(0, 2), ...insertedRestIds, ...originalStepIds.slice(2)]);
  expect((await exportPortableProject(page)).progression).toEqual(afterInsert.progression);

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

  // 4. Insert Rest After System
  await header0.click({ button: "right" });
  await page.getByTestId("score-system-insert-rest").click();
  await expect(page.locator(".measure-staff-event.is-rest")).toHaveCount(1);
  await expect(systems).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(systems).toHaveCount(2);

  // 5. Explore Alternative from System
  await header0.click({ button: "right" });
  await page.getByTestId("score-system-explore-alternative").click();
  await expect(page.getByTestId("branch-controls-active")).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByTestId("branch-controls-active")).toHaveCount(0);
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
  await setLayoutMeasuresPerSystem(page, 2);

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

  // 3. Open Submenu: Apply Melody Contour -> Ascending (Up)
  await header0.click({ button: "right" });
  const melodyItem = page.getByRole("menuitem", { name: /Apply Melody Contour/ });
  await melodyItem.hover();
  const ascUp = page.getByRole("menuitem", { name: /Ascending \(Up\)/ });
  await expect(ascUp).toBeVisible();
  await ascUp.click();

  // Re-open to verify active checkmark on Ascending (Up)
  await header0.click({ button: "right" });
  const melodyItem2 = page.getByRole("menuitem", { name: /Apply Melody Contour/ });
  await melodyItem2.hover();
  const ascUpChecked = page.getByRole("menuitem", { name: /Ascending \(Up\)/ });
  await expect(ascUpChecked.locator(".score-system-menu-check")).toContainText("✓");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("score-system-context-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("score-system-context-menu")).toHaveCount(0);

  // Now Clear Melody should be enabled
  await header0.click({ button: "right" });
  const clearMelody = page.getByRole("menuitem", { name: "Clear Melody" });
  await expect(clearMelody).toBeEnabled();
  await clearMelody.click();

  // Undo clear melody
  await page.keyboard.press("Control+z");
});

test("score system context menu set melody grid and checkmark", async ({ page }) => {
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
  await setLayoutMeasuresPerSystem(page, 2);

  const header0 = page.locator(".score-system-header").first();

  // 1. Open Submenu: Set Melody Grid
  await header0.click({ button: "right" });
  const gridItem = page.getByRole("menuitem", { name: /Set Melody Grid/ });
  await expect(gridItem).toBeVisible();
  await gridItem.hover();

  const gridSubmenu = page.getByTestId("score-system-grid-submenu");
  await expect(gridSubmenu).toBeVisible();

  // Check the 5 grid options are present
  await expect(page.getByTestId("score-system-grid-quarter")).toContainText(
    "Quarter note (1 beat)",
  );
  await expect(page.getByTestId("score-system-grid-eighth")).toContainText(
    "Eighth note (1/2 beat)",
  );
  await expect(page.getByTestId("score-system-grid-sixteenth")).toContainText(
    "Sixteenth note (1/4 beat)",
  );
  await expect(page.getByTestId("score-system-grid-eighth-triplet")).toContainText(
    "Eighth-note triplet (1/3 beat)",
  );
  await expect(page.getByTestId("score-system-grid-sixteenth-triplet")).toContainText(
    "Sixteenth-note triplet (1/6 beat)",
  );

  // Select Sixteenth note (1/4 beat)
  await page.getByTestId("score-system-grid-sixteenth").click();

  // Re-open context menu and verify checkmark appears on Sixteenth note
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Set Melody Grid/ }).hover();
  await expect(
    page.getByTestId("score-system-grid-sixteenth").locator(".score-system-menu-check"),
  ).toContainText("✓");

  // Select Eighth note (1/2 beat)
  await page.getByTestId("score-system-grid-eighth").click();

  // Re-open context menu and verify checkmark moved to Eighth note
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Set Melody Grid/ }).hover();
  await expect(
    page.getByTestId("score-system-grid-eighth").locator(".score-system-menu-check"),
  ).toContainText("✓");
  await expect(
    page.getByTestId("score-system-grid-sixteenth").locator(".score-system-menu-check"),
  ).toHaveCount(0);

  // Close menu and test undo
  await page.keyboard.press("Escape");
  await ensureHistoryControlsVisible(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click(); // undo to sixteenth
  await header0.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Set Melody Grid/ }).hover();
  await expect(
    page.getByTestId("score-system-grid-sixteenth").locator(".score-system-menu-check"),
  ).toContainText("✓");
});
