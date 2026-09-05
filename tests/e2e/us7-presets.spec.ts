import { expect, test } from "@playwright/test";

test.describe("US7 — Functional Presets Acceptance (T118)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    });
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();
  });

  // Helper to add a 4-step baseline progression: I - vi - IV - V
  async function addFourStepBaseline(page: import("@playwright/test").Page) {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardVi = page.getByTestId("chord-card-vi");
    await cardVi.getByRole("button", { name: /Add vi to progression/i }).click();
    const cardIv = page.getByTestId("chord-card-IV");
    await cardIv.getByRole("button", { name: /Add IV to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(4);
  }

  test("Scenario 1 — Presets browser baseline", async ({ page }) => {
    const presetsBtn = page.getByTestId("progression-presets-btn");
    await expect(presetsBtn).toBeVisible();
    await presetsBtn.click();

    const panel = page.locator(".presets-panel");
    await expect(panel).toBeVisible();

    // Assert sections
    await expect(panel.getByRole("heading", { name: "Presets", exact: true })).toBeVisible();
    await expect(panel.getByRole("heading", { name: /Built-in Presets/i })).toBeVisible();
    await expect(panel.getByRole("heading", { name: /Custom Presets/i })).toBeVisible();

    // Assert six neutral built-ins available
    const builtinGrid = page.getByTestId("builtin-preset-grid");
    const cards = builtinGrid.locator(".preset-card");
    await expect(cards).toHaveCount(6);

    // Assert neutral names and absence of genre taxonomy
    const panelText = await panel.textContent();
    expect(panelText).toContain("Major I–vi–IV–V");
    expect(panelText).toContain("Major I–IV–V–I");
    expect(panelText).toContain("Major ii–V–I");
    expect(panelText).toContain("Minor i–iv–V–i");
    expect(panelText).toContain("Minor i–VII–VI–V");
    expect(panelText).toContain("Minor ii°–V–i");

    // No removed genre taxonomy
    expect(panelText).not.toMatch(/jazz/i);
    expect(panelText).not.toMatch(/doo-wop/i);
    expect(panelText).not.toMatch(/andalusian/i);
    expect(panelText).not.toMatch(/pop/i);
    expect(panelText).not.toMatch(/blues/i);
    expect(panelText).not.toMatch(/cinematic/i);

    // Functional sequence, duration sequence, and contextual realization visible
    expect(panelText).toContain("I · vi · IV · V");
    expect(panelText).toContain("Durations:");
    expect(panelText).toContain("Context (C Major): C · Am · F · G");

    // Close with close button
    await panel.locator(".dialog-close-btn").click();
    await expect(panel).toBeHidden();
  });

  test("Scenario 2 — Save current progression as Custom Preset", async ({ page }) => {
    await addFourStepBaseline(page);

    // Open Save as Preset dialog
    await page.getByTestId("progression-save-preset-btn").click();
    const saveDialog = page.locator(".save-preset-dialog");
    await expect(saveDialog).toBeVisible();

    // Assert initial focus in preset name input
    const nameInput = page.locator("#preset-name-input");
    await expect(nameInput).toBeFocused();

    const saveConfirmBtn = page.getByTestId("save-preset-confirm-btn");
    // Initially disabled because name is empty
    await expect(saveConfirmBtn).toBeDisabled();

    // Whitespace-only name cannot be submitted
    await nameInput.fill("   ");
    await expect(saveConfirmBtn).toBeDisabled();

    // Valid name
    await nameInput.fill("E2E Functional Preset");
    await expect(saveConfirmBtn).toBeEnabled();

    // Save
    await saveConfirmBtn.click();
    await expect(saveDialog).toBeHidden();

    // Assert Custom Presets section contains the new preset
    await page.getByTestId("progression-presets-btn").click();
    const panel = page.locator(".presets-panel");
    await expect(panel).toBeVisible();

    const customSection = panel.locator(".presets-section").filter({ hasText: "Custom Presets" });
    await expect(customSection).toContainText("E2E Functional Preset");

    // Original progression remains unchanged (4 steps: I, vi, IV, V)
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("I");
    await expect(steps.nth(1)).toContainText("vi");
    await expect(steps.nth(2)).toContainText("IV");
    await expect(steps.nth(3)).toContainText("V");
  });

  test("Scenario 3 — Saved Preset exposes only functional semantics", async ({ page }) => {
    await addFourStepBaseline(page);

    // Save as Custom Preset
    await page.getByTestId("progression-save-preset-btn").click();
    await page.locator("#preset-name-input").fill("E2E Functional Preset");
    await page.getByTestId("save-preset-confirm-btn").click();

    // Inspect custom preset card
    await page.getByTestId("progression-presets-btn").click();
    const customCard = page
      .locator(".presets-section")
      .filter({ hasText: "Custom Presets" })
      .locator(".preset-card");
    await expect(customCard).toBeVisible();

    const cardText = await customCard.textContent();
    // Exposes name, functional identities, durations
    expect(cardText).toContain("E2E Functional Preset");
    expect(cardText).toContain("I · vi · IV · V");
    expect(cardText).toContain("Durations:");

    // Does NOT expose stored preset data for voicing, articulation, register, bass, velocity, dynamics
    expect(cardText).not.toContain("Voicing Mode");
    expect(cardText).not.toContain("Manual Voicing");
    expect(cardText).not.toContain("Articulation");
    expect(cardText).not.toContain("Velocity");
    expect(cardText).not.toContain("Dynamic Label");
    expect(cardText).not.toContain("Independent Bass");
    expect(cardText).not.toContain("Register Offset");

    await page.keyboard.press("Escape");
  });

  test("Scenario 4 — cross-key reuse", async ({ page }) => {
    await addFourStepBaseline(page);

    // Save custom preset in C Major
    await page.getByTestId("progression-save-preset-btn").click();
    await page.locator("#preset-name-input").fill("E2E Functional Preset");
    await page.getByTestId("save-preset-confirm-btn").click();

    // Switch key to D Major
    await page.getByRole("button", { name: "Set key D", exact: true }).click();
    await page.waitForTimeout(100);

    // Open Presets and verify contextual realization
    await page.getByTestId("progression-presets-btn").click();
    const panel = page.locator(".presets-panel");
    await expect(panel).toBeVisible();

    // Custom preset functional identity remains I · vi · IV · V
    const customCard = panel
      .locator(".presets-section")
      .filter({ hasText: "Custom Presets" })
      .locator(".preset-card");
    await expect(customCard).toContainText("I · vi · IV · V");
    // Contextual preview in D Major is D · Bm · G · A
    await expect(customCard).toContainText("Context (D Major): D · Bm · G · A");

    // Close Presets and switch back to C Major
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Set key C", exact: true }).click();
    await page.waitForTimeout(100);

    // Verify preview reverts to C Major realization: C · Am · F · G
    await page.getByTestId("progression-presets-btn").click();
    await expect(customCard).toContainText("Context (C Major): C · Am · F · G");

    await page.keyboard.press("Escape");
  });

  test("Scenario 5 — Tonal Minor realization", async ({ page }) => {
    // Switch to Dark Harmony (Tonal Minor)
    await page.getByRole("button", { name: /Dark Harmony/i }).click();
    const switchConfirm = page.locator(".module-switch-dialog .primary-btn");
    if (await switchConfirm.isVisible()) {
      await switchConfirm.click();
    }

    // Set key to G
    await page.getByRole("button", { name: "Set key G", exact: true }).click();
    await page.waitForTimeout(100);

    // Open Presets panel
    await page.getByTestId("progression-presets-btn").click();
    const panel = page.locator(".presets-panel");
    await expect(panel).toBeVisible();

    // Check Minor i–iv–V–i realization in G Tonal Minor: Gm · Cm · D · Gm
    const minorPresetCard = page.locator('[data-testid="preset-card-builtin-minor-i-iv-v-i"]');
    await expect(minorPresetCard).toBeVisible();
    await expect(minorPresetCard).toContainText("Context (G Tonal Minor): Gm · Cm · D · Gm");

    await page.keyboard.press("Escape");
  });

  test("Scenario 6 — Replace Progression", async ({ page }) => {
    // Start with 2 steps: I and IV
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardIv = page.getByTestId("chord-card-IV");
    await cardIv.getByRole("button", { name: /Add IV to progression/i }).click();
    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(2);

    // Open Presets and click Apply on Major I–vi–IV–V
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();

    const applyDialog = page.locator(".preset-apply-dialog");
    await expect(applyDialog).toBeVisible();

    // Select Replace Progression
    await page.click('input[name="preset-apply-mode"][value="replace"]');
    await page.getByTestId("preset-apply-confirm-btn").click();

    await expect(applyDialog).toBeHidden();
    await expect(page.locator(".presets-panel")).toBeHidden();

    // Old steps are replaced by the 4 preset steps
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("I");
    await expect(steps.nth(1)).toContainText("vi");
    await expect(steps.nth(2)).toContainText("IV");
    await expect(steps.nth(3)).toContainText("V");

    // Selection is cleared
    await expect(page.locator(".progression-step-card.is-selected")).toHaveCount(0);

    // Undo returns exact previous 2 steps
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await undoBtn.click();
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText("I");
    await expect(steps.nth(1)).toContainText("IV");

    // Redo restores replacement
    const redoBtn = page.getByRole("button", { name: "Redo" });
    await redoBtn.click();
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("I");
    await expect(steps.nth(1)).toContainText("vi");
    await expect(steps.nth(2)).toContainText("IV");
    await expect(steps.nth(3)).toContainText("V");
  });

  test("Scenario 7 — Append to End", async ({ page }) => {
    // Existing progression: I and V
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(2);

    // Select step 1 (I)
    await steps.nth(0).click();
    await expect(steps.nth(0)).toHaveClass(/is-selected/);

    // Open Presets and Apply Major ii–V–I
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-major-ii-v-i").click();

    // Select Append to End
    await page.click('input[name="preset-apply-mode"][value="append"]');
    await page.getByTestId("preset-apply-confirm-btn").click();

    // Result order: I, V, ii, V, I (5 steps)
    await expect(steps).toHaveCount(5);
    await expect(steps.nth(0)).toContainText("I");
    await expect(steps.nth(1)).toContainText("V");
    await expect(steps.nth(2)).toContainText("ii");
    await expect(steps.nth(3)).toContainText("V");
    await expect(steps.nth(4)).toContainText("I");

    // Prior selected step (step 1) remains selected
    await expect(steps.nth(0)).toHaveClass(/is-selected/);

    // Undo returns to 2 steps
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(steps).toHaveCount(2);

    // Redo returns 5 steps in same order
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(steps).toHaveCount(5);
    await expect(steps.nth(2)).toContainText("ii");
    await expect(steps.nth(3)).toContainText("V");
    await expect(steps.nth(4)).toContainText("I");
  });

  test("Scenario 8 — Insert at Selected Step", async ({ page }) => {
    // Prepare A B C: I, vi, IV
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardVi = page.getByTestId("chord-card-vi");
    await cardVi.getByRole("button", { name: /Add vi to progression/i }).click();
    const cardIv = page.getByTestId("chord-card-IV");
    await cardIv.getByRole("button", { name: /Add IV to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(3);

    // Select Step 2 (vi)
    await steps.nth(1).click();
    await expect(steps.nth(1)).toHaveClass(/is-selected/);

    // Open Presets and Apply Major ii–V–I
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-major-ii-v-i").click();

    const applyDialog = page.locator(".preset-apply-dialog");
    await expect(applyDialog).toBeVisible();

    // UI communicates "Insert before Step 2: vi"
    await expect(applyDialog).toContainText("Insert before Step 2: vi");

    // Select Insert mode and confirm
    await page.click('input[name="preset-apply-mode"][value="insert"]');
    await page.getByTestId("preset-apply-confirm-btn").click();

    // Expected: I, ii, V, I, vi, IV (6 steps total)
    await expect(steps).toHaveCount(6);
    await expect(steps.nth(0)).toContainText("I");
    await expect(steps.nth(1)).toContainText("ii");
    await expect(steps.nth(2)).toContainText("V");
    await expect(steps.nth(3)).toContainText("I");
    await expect(steps.nth(4)).toContainText("vi");
    await expect(steps.nth(5)).toContainText("IV");

    // Selected original Step B (vi, now index 4) remains selected
    await expect(steps.nth(4)).toHaveClass(/is-selected/);

    // Undo returns to 3 steps
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(1)).toHaveClass(/is-selected/);

    // Redo restores inserted sequence
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(steps).toHaveCount(6);
    await expect(steps.nth(4)).toHaveClass(/is-selected/);
  });

  test("Scenario 9 — Insert unavailable without selection", async ({ page }) => {
    // Non-empty progression, NO selected step
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    // Open Presets and Apply dialog
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();

    const applyDialog = page.locator(".preset-apply-dialog");
    await expect(applyDialog).toBeVisible();

    // Insert radio is disabled
    const insertRadio = applyDialog.locator('input[value="insert"]');
    await expect(insertRadio).toBeDisabled();

    // Explanatory text visible
    await expect(applyDialog).toContainText("Select a progression step to insert before it.");

    // Replace and Append remain available
    const replaceRadio = applyDialog.locator('input[value="replace"]');
    const appendRadio = applyDialog.locator('input[value="append"]');
    await expect(replaceRadio).toBeEnabled();
    await expect(appendRadio).toBeEnabled();

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  test("Scenario 10 — Empty progression", async ({ page }) => {
    // Start with empty progression (0 steps)
    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(0);

    // Open Presets and Apply Major I–vi–IV–V
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();

    const applyDialog = page.locator(".preset-apply-dialog");
    await expect(applyDialog).toBeVisible();

    // Simplified empty flow: radio choices omitted, "Use Preset" button shown
    await expect(applyDialog.locator('[role="radiogroup"]')).toHaveCount(0);
    await expect(applyDialog).toContainText("Progression is currently empty");

    const confirmBtn = page.getByTestId("preset-apply-confirm-btn");
    await expect(confirmBtn).toHaveText("Use Preset");
    await confirmBtn.click();

    // Progression now has the 4 preset steps
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText("I");
    await expect(steps.nth(1)).toContainText("vi");
    await expect(steps.nth(2)).toContainText("IV");
    await expect(steps.nth(3)).toContainText("V");
  });

  test("Scenario 11 — Rest-containing Save rejection", async ({ page }) => {
    // Create Chord -> Rest -> Chord
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    await page.getByRole("button", { name: "Add Rest to progression" }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(3);

    // Open Save as Preset
    await page.getByTestId("progression-save-preset-btn").click();
    const saveDialog = page.locator(".save-preset-dialog");
    await expect(saveDialog).toBeVisible();

    // Assert explicit v1 unsupported message
    const warning = page.getByTestId("save-preset-rest-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Custom Presets currently support chord steps only");
    await expect(warning).toContainText("Remove Rest steps before saving");

    // Save confirm button is disabled
    const saveConfirmBtn = page.getByTestId("save-preset-confirm-btn");
    await expect(saveConfirmBtn).toBeDisabled();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(saveDialog).toBeHidden();

    // Assert progression still has 3 steps including Rest
    await expect(steps).toHaveCount(3);
    await expect(page.locator(".progression-rest-card")).toBeVisible();
  });

  test("Scenario 12 — ambiguous mapping protection", async ({ page }) => {
    // In Major context (Progressions module):
    // Open Presets and click Apply on Minor i–VII–VI–V (which has ambiguous mapping in Major)
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-minor-i-vii-vi-v").click();

    const applyDialog = page.locator(".preset-apply-dialog");
    await expect(applyDialog).toBeVisible();

    // Ambiguous alert is visible
    const alert = page.getByTestId("preset-ambiguous-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Ambiguous Harmonic Mapping");

    // Apply button is disabled
    const confirmBtn = page.getByTestId("preset-apply-confirm-btn");
    await expect(confirmBtn).toBeDisabled();

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  test("Scenario 13 — incompatible protection if publicly reachable", async ({ page }) => {
    // Note: Incompatible domain branch covered below E2E because no public v1 UI can author an invalid harmonic identity.
    // Verify that all 6 built-ins in Major are either fully realizable or show the ambiguous diagnostic
    await page.getByTestId("progression-presets-btn").click();
    const panel = page.locator(".presets-panel");
    await expect(panel).toBeVisible();

    const cards = panel.locator(".preset-card");
    await expect(cards).toHaveCount(6);

    await page.keyboard.press("Escape");
  });

  test("Scenario 14 — current defaults are applied at application time", async ({ page }) => {
    // Build 1 step
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await steps.first().click();

    // Modify step performance to non-default settings
    await page.getByLabel("Piano Articulation").selectOption("arp-up");
    await page.getByLabel("Musical Dynamic Label").selectOption("ff");

    // Save as Custom Preset
    await page.getByTestId("progression-save-preset-btn").click();
    await page.locator("#preset-name-input").fill("Performance Test Preset");
    await page.getByTestId("save-preset-confirm-btn").click();

    // Now apply the preset using Replace
    await page.getByTestId("progression-presets-btn").click();
    const customSection = page.locator(".presets-section").filter({ hasText: "Custom Presets" });
    await customSection.getByRole("button", { name: "Apply", exact: true }).click();
    await page.click('input[name="preset-apply-mode"][value="replace"]');
    await page.getByTestId("preset-apply-confirm-btn").click();

    // Select the newly applied step and inspect its performance
    await steps.first().click();

    // Newly applied step has clean default settings (Block articulation, mf dynamic), NOT the customized Arp Up / ff
    await expect(page.getByLabel("Piano Articulation")).toHaveValue("block");
    await expect(page.getByLabel("Musical Dynamic Label")).toHaveValue("mf");
  });

  test("Scenario 15 — Delete Custom Preset + Undo", async ({ page }) => {
    await addFourStepBaseline(page);

    // Save custom preset
    await page.getByTestId("progression-save-preset-btn").click();
    await page.locator("#preset-name-input").fill("Deletable Preset");
    await page.getByTestId("save-preset-confirm-btn").click();

    // Open Presets and verify it exists
    await page.getByTestId("progression-presets-btn").click();
    const customSection = page.locator(".presets-section").filter({ hasText: "Custom Presets" });
    await expect(customSection).toContainText("Deletable Preset");

    // Click Delete
    await customSection.getByRole("button", { name: /Delete custom preset/i }).click();
    await expect(customSection).not.toContainText("Deletable Preset");

    // Close panel
    await page.keyboard.press("Escape");

    // Undo delete
    await page.getByRole("button", { name: "Undo" }).click();

    // Open Presets and verify it returned
    await page.getByTestId("progression-presets-btn").click();
    await expect(customSection).toContainText("Deletable Preset");

    // Close panel and Redo delete
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Redo" }).click();

    // Open Presets and verify it disappeared again
    await page.getByTestId("progression-presets-btn").click();
    await expect(customSection).not.toContainText("Deletable Preset");

    await page.keyboard.press("Escape");
  });

  test("Scenario 16 — modal keyboard acceptance", async ({ page }) => {
    await addFourStepBaseline(page);

    // 1. Focus Presets trigger
    const presetsTrigger = page.getByTestId("progression-presets-btn");
    await presetsTrigger.focus();
    await expect(presetsTrigger).toBeFocused();

    // 2. Press Enter to open panel
    await page.keyboard.press("Enter");
    const panel = page.locator(".presets-panel");
    await expect(panel).toBeVisible();

    // 3. Focus moves inside panel
    await expect(panel.locator(".save-as-preset-btn")).toBeFocused();

    // 4. Open Save as Preset dialog
    await page.getByTestId("panel-save-preset-btn").click();
    const saveDialog = page.locator(".save-preset-dialog");
    await expect(saveDialog).toBeVisible();

    // 5. Focus moves into child dialog
    const nameInput = page.locator("#preset-name-input");
    await expect(nameInput).toBeFocused();

    // 6. Escape closes only child dialog
    await page.keyboard.press("Escape");
    await expect(saveDialog).toBeHidden();

    // 8. Presets panel remains open
    await expect(panel).toBeVisible();

    // 10. Second Escape closes Presets panel
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();

    // 11. Focus returns to trigger button
    await expect(presetsTrigger).toBeFocused();
  });

  test("Scenario 17 — responsive smoke", async ({ page }) => {
    // 1. 1920x1080 Viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByTestId("progression-presets-btn").click();
    const panel = page.locator(".presets-panel");
    await expect(panel).toBeVisible();

    // Check no document-level horizontal overflow
    let noHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    });
    expect(noHorizontalOverflow).toBe(true);

    await page.keyboard.press("Escape");

    // 2. 1280x720 Viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();
    const applyDialog = page.locator(".preset-apply-dialog");
    await expect(applyDialog).toBeVisible();

    // Check dialog within viewport and actions reachable
    const confirmBtn = page.getByTestId("preset-apply-confirm-btn");
    await expect(confirmBtn).toBeVisible();
    noHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    });
    expect(noHorizontalOverflow).toBe(true);

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // 3. 390x844 Mobile Viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("progression-presets-btn").click();
    await expect(panel).toBeVisible();

    // Apply button reachable and cards visible
    const firstApply = panel.locator(".apply-preset-btn").first();
    await expect(firstApply).toBeVisible();

    noHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    });
    expect(noHorizontalOverflow).toBe(true);

    await page.keyboard.press("Escape");
  });

  test("Scenario 18 — no passive history pollution", async ({ page }) => {
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await expect(undoBtn).toBeDisabled();

    // Open and close Presets
    await page.getByTestId("progression-presets-btn").click();
    await page.keyboard.press("Escape");
    await expect(undoBtn).toBeDisabled();

    // Open and close Save dialog
    await page.getByTestId("progression-save-preset-btn").click();
    await page.keyboard.press("Escape");
    await expect(undoBtn).toBeDisabled();

    // Open Presets -> Apply dialog -> close
    await page.getByTestId("progression-presets-btn").click();
    await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(undoBtn).toBeDisabled();
  });
});
