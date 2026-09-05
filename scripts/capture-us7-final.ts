import { chromium, type Page } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";

async function main() {
  const repoArtifactsDir = path.resolve("review-artifacts/us7-final");
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
    viewport: { width: 1440, height: 960 },
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

  // Helper to add baseline 4 steps: I - vi - IV - V
  const buildBaseline = async () => {
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
  };

  await buildBaseline();

  // 2. Capture 02-save-custom.png
  console.log("Capturing 02-save-custom.png...");
  await page.getByTestId("progression-save-preset-btn").click();
  await page.waitForSelector(".save-preset-dialog");
  await page.fill("#preset-name-input", "E2E Functional Preset");
  await saveScreenshots(page, "02-save-custom.png");

  // Save the custom preset
  await page.getByTestId("save-preset-confirm-btn").click();
  await page.waitForTimeout(200);

  // 1. Capture 01-builtins-and-custom.png
  console.log("Capturing 01-builtins-and-custom.png...");
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "01-builtins-and-custom.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 3. Capture 03-cross-key-d-major.png
  console.log("Capturing 03-cross-key-d-major.png...");
  await page.getByRole("button", { name: "Set key D", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "03-cross-key-d-major.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Switch back to C
  await page.getByRole("button", { name: "Set key C", exact: true }).click();
  await page.waitForTimeout(200);

  // 4. Capture 04-tonal-minor.png
  console.log("Capturing 04-tonal-minor.png...");
  await page.getByRole("button", { name: /Dark Harmony/i }).click();
  await page.waitForTimeout(200);
  const switchConfirm = page.locator(".module-switch-dialog .primary-btn");
  if (await switchConfirm.isVisible()) {
    await switchConfirm.click();
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "Set key G", exact: true }).click();
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "04-tonal-minor.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Switch back to Progressions (Major)
  await page.getByRole("button", { name: /Progressions/i }).click();
  await page.waitForTimeout(200);
  const switchConfirmBack = page.locator(".module-switch-dialog .primary-btn");
  if (await switchConfirmBack.isVisible()) {
    await switchConfirmBack.click();
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "Set key C", exact: true }).click();
  await page.waitForTimeout(200);

  // 5. Capture 05-replace.png
  console.log("Capturing 05-replace.png...");
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();
  await page.waitForSelector(".preset-apply-dialog");
  await page.click('input[name="preset-apply-mode"][value="replace"]');
  await saveScreenshots(page, "05-replace.png");

  // 6. Capture 06-append.png
  console.log("Capturing 06-append.png...");
  await page.click('input[name="preset-apply-mode"][value="append"]');
  await saveScreenshots(page, "06-append.png");

  // 8. Capture 08-insert-disabled.png (no step selected)
  console.log("Capturing 08-insert-disabled.png...");
  await saveScreenshots(page, "08-insert-disabled.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 7. Capture 07-insert-before-selected.png (select step 2 vi)
  console.log("Capturing 07-insert-before-selected.png...");
  const stepCards = page.locator(".progression-step-card");
  await stepCards.nth(1).click();
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await page.getByTestId("apply-preset-builtin-major-ii-v-i").click();
  await page.waitForSelector(".preset-apply-dialog");
  await page.click('input[name="preset-apply-mode"][value="insert"]');
  await saveScreenshots(page, "07-insert-before-selected.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 9. Capture 09-rest-save-rejected.png
  console.log("Capturing 09-rest-save-rejected.png...");
  await page.getByRole("button", { name: "Add Rest to progression" }).click();
  await page.waitForTimeout(200);
  await page.getByTestId("progression-save-preset-btn").click();
  await page.waitForSelector(".save-preset-dialog");
  await page.waitForSelector('[data-testid="save-preset-rest-warning"]');
  await saveScreenshots(page, "09-rest-save-rejected.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 10. Capture 10-ambiguous-disabled.png
  console.log("Capturing 10-ambiguous-disabled.png...");
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await page.getByTestId("apply-preset-builtin-minor-i-vii-vi-v").click();
  await page.waitForSelector(".preset-apply-dialog");
  await page.waitForSelector('[data-testid="preset-ambiguous-alert"]');
  await saveScreenshots(page, "10-ambiguous-disabled.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 11. Capture 11-mobile-390x844.png
  console.log("Capturing 11-mobile-390x844.png...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "11-mobile-390x844.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 12. Capture 12-desktop-1280x720.png
  console.log("Capturing 12-desktop-1280x720.png...");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await page.getByTestId("apply-preset-builtin-major-i-vi-iv-v").click();
  await page.waitForSelector(".preset-apply-dialog");
  await saveScreenshots(page, "12-desktop-1280x720.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 13. Capture 13-desktop-1920x1080.png
  console.log("Capturing 13-desktop-1920x1080.png...");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(200);
  await page.getByTestId("progression-presets-btn").click();
  await page.waitForSelector(".presets-panel");
  await saveScreenshots(page, "13-desktop-1920x1080.png");
  await page.keyboard.press("Escape");

  await browser.close();
  console.log("All 13 final visual review artifacts captured successfully!");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
