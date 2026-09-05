import { chromium, type Page } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";

async function main() {
  const repoArtifactsDir = path.resolve("review-artifacts/us7-batch-c");
  const brainArtifactsDir =
    "C:\\Users\\pavel\\.gemini\\antigravity\\brain\\b7baeb67-2bbc-4d13-8a03-ad5f1ee7da84";

  for (const dir of [repoArtifactsDir, brainArtifactsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const saveScreenshots = async (page: Page, filename: string) => {
    const p1 = path.join(repoArtifactsDir, filename);
    const p2 = path.join(brainArtifactsDir, filename);
    await page.screenshot({ path: p1 });
    await page.screenshot({ path: p2 });
    console.log("Captured:", filename);
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });

  await context.addInitScript(() => {
    (
      globalThis as unknown as { window: { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean } }
    ).window.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });

  const page = await context.newPage();

  console.log("Navigating to http://127.0.0.1:4173...");
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.waitForSelector(".progression-strip");

  // Build a basic progression first: I - vi - IV - V
  console.log("Building baseline progression in C Major...");
  await page
    .getByTestId("chord-card-I")
    .getByRole("button", { name: /Add I to progression/i })
    .click();
  await page
    .getByTestId("chord-card-vi")
    .getByRole("button", { name: /Add vi to progression/i })
    .click();
  await page
    .getByTestId("chord-card-IV")
    .getByRole("button", { name: /Add IV to progression/i })
    .click();
  await page
    .getByTestId("chord-card-V")
    .getByRole("button", { name: /Add V to progression/i })
    .click();

  // 1. Capture 01-presets-browser.png: Presets browser open showing 6 built-ins in C Major
  console.log("Opening Presets Panel...");
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "01-presets-browser.png");

  // 2. Open Save as Preset dialog and capture 12-save-dialog-focus.png and 03-save-custom-preset.png
  console.log("Opening Save as Preset Dialog...");
  await page.getByTestId("panel-save-preset-btn").click();
  await page.waitForSelector(".save-preset-dialog");
  await page.waitForTimeout(200);
  // Initial focus is on #preset-name-input
  await saveScreenshots(page, "12-save-dialog-focus.png");

  await page.fill("#preset-name-input", "My I–vi–IV–V");
  await saveScreenshots(page, "03-save-custom-preset.png");

  // Save the custom preset
  await page.getByTestId("save-preset-confirm-btn").click();
  await page.waitForTimeout(200);

  // 3. Capture 02-custom-presets.png: Presets Panel now shows custom presets
  await saveScreenshots(page, "02-custom-presets.png");

  // Close presets panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 4. Capture 06-insert-disabled-no-selection.png: Non-empty progression, NO step selected
  console.log("Opening apply dialog without selection...");
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();
  await page.waitForSelector(".preset-apply-dialog");
  await saveScreenshots(page, "06-insert-disabled-no-selection.png");

  // 5. Capture 04-apply-modes.png: Select Replace Progression radio to show mode choices
  await page.click('input[name="preset-apply-mode"][value="replace"]');
  await saveScreenshots(page, "04-apply-modes.png");

  // Close apply dialog and presets panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 6. Select Step 2 (vi) in the progression track, then open apply dialog -> 05-insert-selected.png
  console.log("Selecting step 2 in progression and opening apply dialog...");
  const stepCards = page.locator(".progression-step-card");
  await stepCards.nth(1).click();
  await page.waitForTimeout(200);

  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await page.getByTestId("apply-preset-builtin-major-ii-v-i").click();
  await page.waitForSelector(".preset-apply-dialog");
  await page.click('input[name="preset-apply-mode"][value="insert"]');
  await saveScreenshots(page, "05-insert-selected.png");

  // Close apply dialog and presets panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 7. Change tonic to G Major -> 07-cross-key-preview.png
  console.log("Changing tonic to G Major...");
  await page.getByRole("button", { name: "Set key G" }).click();
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "07-cross-key-preview.png");

  // Close presets panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 8. Switch module to Dark Harmony (Tonal Minor) -> 08-tonal-minor-preview.png
  console.log("Switching module to Dark Harmony...");
  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await page.waitForTimeout(300);
  // If switch dialog appears, confirm it
  const dialogConfirm = page.locator(".module-switch-dialog .primary-btn");
  if (await dialogConfirm.isVisible()) {
    await dialogConfirm.click();
    await page.waitForTimeout(300);
  }

  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "08-tonal-minor-preview.png");

  // Close presets panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Switch back to Major (progressions) for ambiguous preset demo
  console.log("Switching back to Major for ambiguous preset demo...");
  await page.getByRole("button", { name: /Progressions/i }).click();
  await page.waitForTimeout(300);
  const switchConfirm = page.locator(".module-switch-dialog .primary-btn");
  if (await switchConfirm.isVisible()) {
    await switchConfirm.click();
    await page.waitForTimeout(300);
  }

  // 9. Ambiguous state -> 09-ambiguous-state.png
  // Minor i–VII–VI–V has ambiguous mapping when viewed/applied in Major!
  console.log("Opening Apply dialog for Minor i-VII-VI-V in Major (Ambiguous state)...");
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await page.getByTestId("apply-preset-builtin-minor-i-vii-vi-v").click();
  await page.waitForSelector(".preset-apply-dialog");
  await page.waitForSelector('[data-testid="preset-ambiguous-alert"]');
  await saveScreenshots(page, "09-ambiguous-state.png");

  // Close apply dialog and presets panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 10. Mobile / Narrow Viewport -> 10-mobile-presets.png (390x844 phone view)
  console.log("Setting viewport to 390x844 mobile view and opening Presets panel...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "10-mobile-presets.png");

  // Close presets panel
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 11. Compact Desktop Viewport -> 11-presets-1280x720.png (1280x720)
  console.log("Setting viewport to 1280x720 compact desktop view and opening Presets panel...");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "11-presets-1280x720.png");

  await browser.close();
  console.log("All 12 visual review artifacts captured successfully!");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
