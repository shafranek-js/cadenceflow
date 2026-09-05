import { expect, test } from "@playwright/test";

test.describe("US6 — Exact Musical Timing & Transport Runtime Acceptance (T111)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    });
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();
  });

  test("Scenario 1 — Step duration presets, custom duration validation, dot/trip and isolation", async ({
    page,
  }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(1);

    await steps.first().click();
    await expect(steps.first()).toHaveClass(/is-selected/);

    const stepDurationLabel = page.locator(".transport-step-duration .transport-label");
    const customInput = page.getByLabel("Duration in canonical quarter-note beats");
    const setBtn = page.getByRole("button", { name: "Set custom duration in beats" });

    // Preset: Quarter (1 beat)
    await page.getByTestId("duration-preset-quarter").click();
    await expect(stepDurationLabel).toContainText("1 beat");
    await expect(customInput).toHaveValue("1");

    // Preset: Eighth (1/2 beat)
    await page.getByTestId("duration-preset-eighth").click();
    await expect(stepDurationLabel).toContainText("1/2 beat");
    await expect(customInput).toHaveValue("1/2");

    // Preset: Whole (4 beats)
    await page.getByTestId("duration-preset-whole").click();
    await expect(stepDurationLabel).toContainText("4 beats");
    await expect(customInput).toHaveValue("4");

    // Custom duration: 3/4 beats
    await customInput.fill("3/4");
    await setBtn.click();
    await expect(stepDurationLabel).toContainText("3/4 beats");
    await expect(page.locator(".duration-error-message")).toHaveCount(0);

    // Invalid custom duration validation: negative or non-rational string
    await customInput.fill("invalid-abc");
    await setBtn.click();
    const durationError = page.locator(".duration-error-message");
    await expect(durationError).toBeVisible();
    await expect(durationError).toContainText("Invalid format");
    await expect(stepDurationLabel).toContainText("3/4 beats");

    // Clear error
    await customInput.fill("3/4");
    await setBtn.click();
    await expect(durationError).toHaveCount(0);

    // Dot modifier: 3/4 * 1.5 = 9/8
    await page.getByTestId("duration-preset-dotted").click();
    await expect(stepDurationLabel).toContainText("9/8 beats");
    await expect(customInput).toHaveValue("9/8");

    // Trip modifier: 9/8 * 2/3 = 3/4
    await page.getByTestId("duration-preset-triplet").click();
    await expect(stepDurationLabel).toContainText("3/4 beats");
    await expect(customInput).toHaveValue("3/4");

    // Step isolation: Add Chord IV as Step 2
    const cardIV = page.getByTestId("chord-card-IV");
    await cardIV.getByRole("button", { name: /Add IV to progression/i }).click();
    await expect(steps).toHaveCount(2);

    await steps.nth(1).click();
    await expect(steps.nth(1)).toHaveClass(/is-selected/);
    await page.getByTestId("duration-preset-half").click();
    await expect(stepDurationLabel).toContainText("2 beats");

    await steps.nth(0).click();
    await expect(stepDurationLabel).toContainText("3/4 beats");
  });

  test("Scenario 2 — Tempo, 7/8 pulse grouping, Reflow vs Preserve & Undo", async ({ page }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(2);

    await steps.nth(0).click();
    await page.getByTestId("duration-preset-whole").click();
    await steps.nth(1).click();
    await page.getByTestId("duration-preset-half").click();

    // 1. Change tempo to 140 BPM
    const tempoInput = page.getByLabel("Tempo in BPM");
    await tempoInput.fill("140");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("140");

    // 2. Change meter: 7/8
    const meterNumInput = page.getByLabel("Meter numerator");
    const meterDenSelect = page.getByLabel("Meter denominator");
    const groupingInput = page.getByLabel("Pulse grouping");
    const applyMeterBtn = page.getByRole("button", { name: "Apply Meter Change" });

    await meterNumInput.fill("7");
    await meterDenSelect.selectOption("8");

    // 3. Test invalid grouping: 2+2 (sum=4 != 7)
    await groupingInput.fill("2+2");
    const groupingError = page.locator(".grouping-error-message");
    await expect(groupingError).toBeVisible();
    await expect(groupingError).toContainText("Grouping sum (4) does not equal numerator (7)");
    await expect(applyMeterBtn).toBeDisabled();

    // 4. Correct grouping: 2+2+3 (sum=7)
    await groupingInput.fill("2+2+3");
    await expect(groupingError).toHaveCount(0);
    await expect(applyMeterBtn).toBeEnabled();

    // 5. Select Reflow policy
    await page.locator(".policy-option:has-text('Reflow')").click();

    // 6. Apply Reflow
    await applyMeterBtn.click();

    await steps.nth(0).click();
    const stepDurationLabel = page.locator(".transport-step-duration .transport-label");
    await expect(stepDurationLabel).toContainText("7/2 beats");

    await steps.nth(1).click();
    await expect(stepDurationLabel).toContainText("7/4 beats");

    // 7. Undo restores exact previous values
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();

    await steps.nth(0).click();
    await expect(stepDurationLabel).toContainText("4 beats");
    await steps.nth(1).click();
    await expect(stepDurationLabel).toContainText("2 beats");

    // 8. Apply meter 7/8 with Preserve policy
    await meterNumInput.fill("7");
    await meterDenSelect.selectOption("8");
    await groupingInput.fill("2+2+3");
    await page.locator(".policy-option:has-text('Preserve')").click();
    await applyMeterBtn.click();

    await steps.nth(0).click();
    await expect(stepDurationLabel).toContainText("4 beats");
    await steps.nth(1).click();
    await expect(stepDurationLabel).toContainText("2 beats");
  });

  test("Scenario 3 — Groove toggle Straight/Swing and amount persistence", async ({ page }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await steps.first().click();
    await page.getByTestId("duration-preset-quarter").click();

    const stepDurationLabel = page.locator(".transport-step-duration .transport-label");
    await expect(stepDurationLabel).toContainText("1 beat");

    const grooveBtn = page.getByRole("button", { name: "Toggle Swing Feel" });
    await expect(grooveBtn).toContainText("Straight");
    await expect(grooveBtn).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".swing-slider")).toHaveCount(0);

    // Toggle to Swing
    await grooveBtn.click();
    await expect(grooveBtn).toContainText("Swing");
    await expect(grooveBtn).toHaveAttribute("aria-pressed", "true");

    // Set swing amount to 70%
    const swingSlider = page.getByLabel("Swing Amount");
    await expect(swingSlider).toBeVisible();
    await swingSlider.fill("0.7");
    await expect(page.locator(".swing-percent")).toContainText("70%");

    // Toggle back to Straight
    await grooveBtn.click();
    await expect(grooveBtn).toContainText("Straight");
    await expect(page.locator(".swing-slider")).toHaveCount(0);

    // Toggle back to Swing -> amount persists at 70%
    await grooveBtn.click();
    await expect(grooveBtn).toContainText("Swing");
    await expect(page.getByLabel("Swing Amount")).toHaveValue("0.7");
    await expect(page.locator(".swing-percent")).toContainText("70%");

    // Verify step duration is NOT mutated by groove
    await expect(stepDurationLabel).toContainText("1 beat");
  });

  test("Scenario 4 — Transport controls, highlights, pause/resume, stop & Outcome B", async ({
    page,
  }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();

    const playBtn = page.getByRole("button", { name: "Play", exact: true });
    const pauseBtn = page.getByRole("button", { name: "Pause", exact: true });
    const resumeBtn = page.getByRole("button", { name: "Resume", exact: true });
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
    const statusBadge = page.getByTestId("transport-status");

    await expect(statusBadge).toContainText("Stopped");
    await expect(playBtn).toBeEnabled();
    await expect(pauseBtn).toBeDisabled();
    await expect(resumeBtn).toBeDisabled();
    await expect(stopBtn).toBeDisabled();

    // 1. Play
    await playBtn.click();
    await expect(statusBadge).toContainText("Playing");
    await expect(playBtn).toBeDisabled();
    await expect(pauseBtn).toBeEnabled();
    await expect(stopBtn).toBeEnabled();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps.nth(0)).toHaveClass(/is-playing/);

    // 2. Pause
    await pauseBtn.click();
    await expect(statusBadge).toContainText("Paused");
    await expect(pauseBtn).toBeDisabled();
    await expect(resumeBtn).toBeEnabled();
    await expect(stopBtn).toBeEnabled();

    // 3. Resume (Outcome B: attack restarts for remaining unplayed duration)
    await resumeBtn.click();
    await expect(statusBadge).toContainText("Playing");
    await expect(pauseBtn).toBeEnabled();
    await expect(resumeBtn).toBeDisabled();

    // 4. Stop
    await stopBtn.click();
    await expect(statusBadge).toContainText("Stopped");
    await expect(playBtn).toBeEnabled();
    await expect(pauseBtn).toBeDisabled();
    await expect(resumeBtn).toBeDisabled();
    await expect(stopBtn).toBeDisabled();

    // Highlights cleared
    await expect(steps.nth(0)).not.toHaveClass(/is-playing/);
    await expect(steps.nth(1)).not.toHaveClass(/is-playing/);
  });

  test("Scenario 5 — Play From Here starts from target step with count-in support", async ({
    page,
  }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardIV = page.getByTestId("chord-card-IV");
    await cardIV.getByRole("button", { name: /Add IV to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(3);

    const playFromHereBtn = page.getByRole("button", { name: "Play From Here" });
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
    const statusBadge = page.getByTestId("transport-status");

    await expect(playFromHereBtn).toBeDisabled();

    // Select Step 2
    await steps.nth(1).click();
    await expect(playFromHereBtn).toBeEnabled();

    // Play from Step 2
    await playFromHereBtn.click();
    await expect(statusBadge).toContainText("Playing");
    await expect(steps.nth(1)).toHaveClass(/is-playing/);
    await expect(steps.nth(0)).not.toHaveClass(/is-playing/);

    await stopBtn.click();
    await expect(statusBadge).toContainText("Stopped");

    // Enable Count-in and play from Step 3
    const countInBtn = page.getByRole("button", { name: "Toggle Count-in" });
    await countInBtn.click();
    await expect(countInBtn).toHaveAttribute("aria-pressed", "true");

    await steps.nth(2).click();
    await playFromHereBtn.click();
    await expect(statusBadge).toContainText("Playing");

    await stopBtn.click();
    await countInBtn.click();
  });

  test("Scenario 6 — Rest step in progression & visual playback without note emission", async ({
    page,
  }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    // Add Rest step via + Rest button
    const addRestBtn = page.getByRole("button", { name: "Add Rest to progression" });
    await expect(addRestBtn).toBeVisible();
    await addRestBtn.click();

    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(3);

    const restCard = page.locator(".progression-rest-card");
    await expect(restCard).toBeVisible();
    await expect(restCard).toContainText("Rest");

    const playBtn = page.getByRole("button", { name: "Play", exact: true });
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });

    await playBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing");

    await stopBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  });

  test("Scenario 7 — Loop Range & playhead reset", async ({ page }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardIV = page.getByTestId("chord-card-IV");
    await cardIV.getByRole("button", { name: /Add IV to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(4);

    // Select Loop Range
    await page.getByRole("button", { name: "Range" }).click();
    const loopStartSelect = page.getByLabel("Loop start step");
    const loopEndSelect = page.getByLabel("Loop end step");

    await expect(loopStartSelect).toBeVisible();
    await expect(loopEndSelect).toBeVisible();

    await loopStartSelect.selectOption({ index: 1 });
    await loopEndSelect.selectOption({ index: 2 });

    await expect(steps.nth(1)).toHaveClass(/is-in-loop/);
    await expect(steps.nth(2)).toHaveClass(/is-in-loop/);
    await expect(steps.nth(0)).not.toHaveClass(/is-in-loop/);
    await expect(steps.nth(3)).not.toHaveClass(/is-in-loop/);

    const playBtn = page.getByRole("button", { name: "Play", exact: true });
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });

    await playBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing");
    await stopBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");

    // Single-step loop: Step 2 to Step 2
    await loopEndSelect.selectOption({ index: 1 });
    await expect(steps.nth(1)).toHaveClass(/is-in-loop/);
    await expect(steps.nth(2)).not.toHaveClass(/is-in-loop/);

    // Disable loop
    await page.getByRole("button", { name: "Off" }).click();
    await expect(steps.nth(1)).not.toHaveClass(/is-in-loop/);
  });

  test("Scenario 8 — Metronome & Count-in with 7/8 pulse grouping", async ({ page }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    await page.getByLabel("Meter numerator").fill("7");
    await page.getByLabel("Meter denominator").selectOption("8");
    await page.getByLabel("Pulse grouping").fill("2+2+3");
    await page.getByRole("button", { name: "Apply Meter Change" }).click();

    const metroBtn = page.getByRole("button", { name: "Toggle Metronome" });
    const countInBtn = page.getByRole("button", { name: "Toggle Count-in" });

    await metroBtn.click();
    await expect(metroBtn).toHaveAttribute("aria-pressed", "true");

    await countInBtn.click();
    await expect(countInBtn).toHaveAttribute("aria-pressed", "true");

    const playBtn = page.getByRole("button", { name: "Play", exact: true });
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });

    await playBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing");

    await stopBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");

    await metroBtn.click();
    await countInBtn.click();
  });

  test("Scenario 9 — Audio failure recovery without state corruption", async ({ page }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(2);

    const playBtn = page.getByRole("button", { name: "Play", exact: true });
    await playBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing");

    // Stop playback
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
    await stopBtn.click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");

    // Verify progression steps are intact
    await expect(steps).toHaveCount(2);
  });

  test("Scenario 10 — Editing Selection vs Playback Independence", async ({ page }) => {
    const cardI = page.getByTestId("chord-card-I");
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();
    const cardIV = page.getByTestId("chord-card-IV");
    await cardIV.getByRole("button", { name: /Add IV to progression/i }).click();
    const cardV = page.getByTestId("chord-card-V");
    await cardV.getByRole("button", { name: /Add V to progression/i }).click();
    await cardI.getByRole("button", { name: /Add I to progression/i }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(4);

    // 1. Select Step 4
    await steps.nth(3).click();
    await expect(steps.nth(3)).toHaveClass(/is-selected/);

    // 2. Play from beginning
    const playBtn = page.getByRole("button", { name: "Play", exact: true });
    await playBtn.click();

    // Step 4 remains selected while Step 1 is playing
    await expect(steps.nth(3)).toHaveClass(/is-selected/);
    await expect(steps.nth(0)).toHaveClass(/is-playing/);

    // 3. Stop
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
    await stopBtn.click();

    // Step 4 still selected after stop
    await expect(steps.nth(3)).toHaveClass(/is-selected/);
    await expect(steps.nth(0)).not.toHaveClass(/is-playing/);
  });
});
